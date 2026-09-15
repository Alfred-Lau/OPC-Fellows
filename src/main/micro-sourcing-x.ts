import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { fingerprint, X_SEARCH_QUERIES } from '../shared/micro-sourcing'
import {
  cancelXTask,
  enqueueXSearch,
  startXBridge,
  takeXSearchResult,
  xBridgeStatus,
  xSearchQueueLength,
} from './x-bridge'

export interface XQueueItem {
  id: string
  query: string
  text: string
  author: string
  handle: string
  url: string
  postedAt: string
  likes: number
  replies: number
  reposts: number
  fetchedAt: string
}

const COLLECT_INTERVAL_MS = 45 * 60_000
const QUERY_WAIT_MS = 5 * 60_000
const QUERY_LIMIT = 20
const MAX_PENDING_SEARCH = 8
const X_KEEP_MS = 3 * 24 * 3_600_000
const SELF_PROMO = /i built|we built|my side project/i

let timer: NodeJS.Timeout | null = null
let roundRunning = false

function xSignalsPath(): string {
  return join(app.getPath('userData'), 'x-signals.json')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function normalizeApostrophes(value: string): string {
  return value.replace(/[\u2018\u2019]/g, "'")
}

function tweetId(url: string, text: string): string {
  const match = /\/status\/(\d+)/.exec(url)
  if (match?.[1]) {
    return match[1]
  }
  return fingerprint([url, text])
}

function parseItem(value: unknown): XQueueItem | null {
  const row = asRecord(value)
  if (!row) {
    return null
  }
  const url = str(row.url).trim()
  const text = str(row.text)
  if (!url || !text) {
    return null
  }
  return {
    id: str(row.id).trim() || tweetId(url, text),
    query: str(row.query),
    text,
    author: str(row.author),
    handle: str(row.handle),
    url,
    postedAt: str(row.postedAt),
    likes: Math.max(0, num(row.likes)),
    replies: Math.max(0, num(row.replies)),
    reposts: Math.max(0, num(row.reposts)),
    fetchedAt: str(row.fetchedAt) || new Date().toISOString(),
  }
}

function loadQueue(): XQueueItem[] {
  const path = xSignalsPath()
  if (!existsSync(path)) {
    return []
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    const root = asRecord(parsed)
    const list = Array.isArray(root?.items) ? root.items : Array.isArray(parsed) ? parsed : []
    return list.map(parseItem).filter((item): item is XQueueItem => Boolean(item))
  } catch {
    return []
  }
}

function persistQueue(items: XQueueItem[]): void {
  const path = xSignalsPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify({ items }))
}

function isWithinWindow(iso: string, now: Date): boolean {
  const created = Date.parse(iso)
  if (Number.isNaN(created)) {
    return false
  }
  return now.getTime() - created < X_KEEP_MS
}

function tweetsFromData(data: unknown): XQueueItem[] {
  const root = asRecord(data)
  const list = Array.isArray(root?.tweets) ? root.tweets : Array.isArray(data) ? data : []
  const fetchedAt = new Date().toISOString()
  const items: XQueueItem[] = []
  for (const item of list) {
    const row = asRecord(item)
    if (!row) {
      continue
    }
    const url = str(row.url).trim()
    const text = str(row.text).trim()
    if (!url || !text) {
      continue
    }
    items.push({
      id: str(row.id).trim() || tweetId(url, text),
      query: '',
      text,
      author: str(row.author),
      handle: str(row.handle),
      url,
      postedAt: str(row.postedAt) || fetchedAt,
      likes: Math.max(0, num(row.likes)),
      replies: Math.max(0, num(row.replies)),
      reposts: Math.max(0, num(row.reposts)),
      fetchedAt,
    })
  }
  return items
}

function mergeByUrl(existing: XQueueItem[], incoming: XQueueItem[], now: Date): XQueueItem[] {
  const map = new Map<string, XQueueItem>()
  for (const item of existing) {
    if (isWithinWindow(item.postedAt || item.fetchedAt, now) || isWithinWindow(item.fetchedAt, now)) {
      map.set(item.url, item)
    }
  }
  for (const item of incoming) {
    map.set(item.url, item)
  }
  return [...map.values()]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function waitForSearchResult(taskId: string, timeoutMs: number): Promise<ReturnType<typeof takeXSearchResult>> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const result = takeXSearchResult(taskId)
    if (result) {
      return result
    }
    await sleep(1_000)
  }
  return null
}

async function collectQuery(query: string, now: Date): Promise<void> {
  if (xSearchQueueLength() > MAX_PENDING_SEARCH) {
    return
  }
  const enqueued = enqueueXSearch(query, QUERY_LIMIT)
  if (!enqueued.queued) {
    return
  }
  const result = await waitForSearchResult(enqueued.taskId, QUERY_WAIT_MS)
  if (!result) {
    cancelXTask(enqueued.taskId)
    return
  }
  if (!result.ok) {
    return
  }
  const incoming = tweetsFromData(result.data).map((item) => ({ ...item, query }))
  if (incoming.length === 0) {
    return
  }
  persistQueue(mergeByUrl(loadQueue(), incoming, now))
}

async function runCollectRound(): Promise<void> {
  if (roundRunning) {
    return
  }
  roundRunning = true
  try {
    startXBridge()
    if (!xBridgeStatus().running) {
      return
    }
    if (xSearchQueueLength() > MAX_PENDING_SEARCH) {
      return
    }
    const now = new Date()
    for (const query of X_SEARCH_QUERIES) {
      if (!xBridgeStatus().running) {
        return
      }
      if (xSearchQueueLength() > MAX_PENDING_SEARCH) {
        return
      }
      await collectQuery(query, now)
    }
  } finally {
    roundRunning = false
  }
}

export function startXPainCollector(): void {
  if (timer) {
    return
  }
  startXBridge()
  timer = setInterval(() => {
    void runCollectRound()
  }, COLLECT_INTERVAL_MS)
  void runCollectRound()
}

export function stopXPainCollector(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

export function xQueueFetchError(): string | null {
  return xBridgeStatus().running ? null : 'X 桥未启动'
}

export function readXQueue(now = new Date()): XQueueItem[] {
  return loadQueue()
    .map((item) => ({ ...item, text: normalizeApostrophes(item.text) }))
    .filter((item) => {
      if (SELF_PROMO.test(item.text)) {
        return false
      }
      return isWithinWindow(item.postedAt || item.fetchedAt, now)
    })
}
