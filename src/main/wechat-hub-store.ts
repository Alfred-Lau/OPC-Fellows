import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { writeJson } from '../kernel/main/services/storage'
import {
  DEFAULT_WECHAT_HUB_SETTINGS,
  EMPTY_WECHAT_COVERAGE,
  normalizeWechatSettings,
  type WechatAction,
  type WechatCoverage,
  type WechatHubSettings,
  type WechatHubState,
  type WechatLookup,
} from '../shared/wechat-hub'

interface StoredFile {
  settings: WechatHubSettings
  coverage: WechatCoverage
  today: WechatAction[]
  inbox: WechatAction[]
  lookup: WechatLookup | null
  lastRunAt: string | null
  lastError: string | null
  ingested: number
}

const store: StoredFile = {
  settings: { ...DEFAULT_WECHAT_HUB_SETTINGS },
  coverage: { ...EMPTY_WECHAT_COVERAGE },
  today: [],
  inbox: [],
  lookup: null,
  lastRunAt: null,
  lastError: null,
  ingested: 0,
}

let scanning = false
let loaded = false

export function wechatHubPath(): string {
  return join(app.getPath('userData'), 'wechat-hub.json')
}

export function loadWechatHub(): WechatHubState {
  if (loaded) {
    return wechatHubState()
  }
  loaded = true
  const path = wechatHubPath()
  if (!existsSync(path)) {
    return wechatHubState()
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return wechatHubState()
    }
    const file = parsed as Partial<StoredFile>
    store.settings = normalizeWechatSettings(file.settings)
    store.coverage = isCoverage(file.coverage) ? file.coverage : { ...EMPTY_WECHAT_COVERAGE }
    store.today = Array.isArray(file.today) ? file.today.filter(isAction) : []
    store.inbox = Array.isArray(file.inbox) ? file.inbox.filter(isAction) : []
    store.lookup = isLookup(file.lookup) ? file.lookup : null
    store.lastRunAt = typeof file.lastRunAt === 'string' ? file.lastRunAt : null
    store.lastError = typeof file.lastError === 'string' ? file.lastError : null
    store.ingested = typeof file.ingested === 'number' ? file.ingested : 0
  } catch {
    store.lastError = '本地微信情报存档读失败，已从空状态开始。'
  }
  return wechatHubState()
}

export function wechatHubState(): WechatHubState {
  return {
    settings: { ...store.settings },
    coverage: { ...store.coverage },
    today: store.today,
    inbox: store.inbox,
    lookup: store.lookup,
    lastRunAt: store.lastRunAt,
    scanning,
    lastError: store.lastError,
    ingested: store.ingested,
  }
}

export function wechatHubSettings(): WechatHubSettings {
  return { ...store.settings }
}

export function saveWechatSettings(input: Partial<WechatHubSettings>): WechatHubSettings {
  store.settings = normalizeWechatSettings({ ...store.settings, ...input })
  persist()
  return wechatHubSettings()
}

export function setWechatCoverage(coverage: WechatCoverage): void {
  store.coverage = coverage
  persist()
}

export function setWechatScanning(next: boolean): void {
  scanning = next
}

export function setWechatLastError(message: string | null): void {
  store.lastError = message
  persist()
}

export function saveWechatScan(input: {
  today: WechatAction[]
  inbox: WechatAction[]
  coverage: WechatCoverage
  ingested: number
  error: string | null
}): void {
  store.today = input.today
  store.inbox = input.inbox
  store.coverage = input.coverage
  store.ingested = input.ingested
  store.lastError = input.error
  store.lastRunAt = new Date().toISOString()
  persist()
}

export function saveWechatLookup(lookup: WechatLookup | null): void {
  store.lookup = lookup
  persist()
}

function persist(): void {
  try {
    writeJson(wechatHubPath(), {
      settings: store.settings,
      coverage: store.coverage,
      today: store.today,
      inbox: store.inbox,
      lookup: store.lookup,
      lastRunAt: store.lastRunAt,
      lastError: store.lastError,
      ingested: store.ingested,
    } satisfies StoredFile)
  } catch {
    store.lastError = store.lastError ?? '本地微信情报存档写失败。'
  }
}

function isAction(value: unknown): value is WechatAction {
  if (!value || typeof value !== 'object') {
    return false
  }
  const row = value as Partial<WechatAction>
  return typeof row.id === 'number' && typeof row.title === 'string' && (row.kind === 'today' || row.kind === 'inbox')
}

function isLookup(value: unknown): value is WechatLookup {
  if (!value || typeof value !== 'object') {
    return false
  }
  const row = value as Partial<WechatLookup>
  return (
    (row.kind === 'search' || row.kind === 'person' || row.kind === 'reply') &&
    typeof row.query === 'string' &&
    typeof row.text === 'string' &&
    typeof row.at === 'string'
  )
}

function isCoverage(value: unknown): value is WechatCoverage {
  if (!value || typeof value !== 'object') {
    return false
  }
  const row = value as Partial<WechatCoverage>
  return (
    (row.access === 'missing' || row.access === 'engine' || row.access === 'index' || row.access === 'ready') &&
    typeof row.summary === 'string'
  )
}
