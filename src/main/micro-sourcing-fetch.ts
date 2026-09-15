import net from 'node:net'
import { net as electronNet, session } from 'electron'
import {
  REDDIT_SEARCH_QUERY,
  arcticShiftCommentsUrl,
  arcticShiftPostsUrl,
  hnItemUrl,
  isFreshSignal,
  isProxyConnectionFailed,
  itunesReviewsUrl,
  normalizeProxyUrl,
  pickScanProxy,
  proxyListenTarget,
  startOfLocalDayUnix,
  type PainDomain,
  type PainSource,
  type SignalSourceKind,
} from '../shared/micro-sourcing'
import { PRODUCT_UA } from '../shared/brand'
import { readXQueue, xQueueFetchError } from './micro-sourcing-x'

export interface RawPainPost {
  source: SignalSourceKind
  sourceId: string
  url: string
  title: string
  body: string
  community: string
  sourceLabel: string
  domain: PainDomain
  score: number
  comments: number
  createdAt: string
  excerpts: string[]
}

export interface SourceFetchResult {
  source: PainSource
  posts: RawPainPost[]
  error: string | null
}

const PARTITION = 'persist:micro-sourcing'
const UA = `${PRODUCT_UA}/0.7.3 (personal OPC workbench)`
const BODY_LIMIT = 6_000
const EXCERPT_LIMIT = 8

let fetchTimeoutMs = 8_000
let redditOfficialDown = false
let arcticDown = false
let pullpushDown = false
let proxyActive = false
let droppedDeadProxy = false
let proxyFetchRetried = false

function probeProxyPort(proxyUrl: string, timeoutMs = 400): Promise<boolean> {
  const target = proxyListenTarget(proxyUrl)
  if (!target) {
    return Promise.resolve(false)
  }
  return new Promise((resolve) => {
    const socket = net.connect({ host: target.host, port: target.port })
    let settled = false
    const finish = (ok: boolean): void => {
      if (settled) {
        return
      }
      settled = true
      socket.removeAllListeners()
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => {
      finish(true)
    })
    socket.once('timeout', () => {
      finish(false)
    })
    socket.once('error', () => {
      finish(false)
    })
  })
}

async function applySessionProxy(proxy: string): Promise<void> {
  const ses = session.fromPartition(PARTITION)
  fetchTimeoutMs = proxy ? 15_000 : 8_000
  proxyActive = Boolean(proxy)
  if (proxy) {
    await ses.setProxy({
      proxyRules: proxy,
      proxyBypassRules: '<local>,hn.algolia.com,arctic-shift.photon-reddit.com,*.photon-reddit.com,api.pullpush.io,itunes.apple.com',
    })
  } else {
    await ses.setProxy({ mode: 'direct' })
  }
  await ses.closeAllConnections()
}

async function prepareMicroNetwork(proxyUrl: string): Promise<void> {
  const requested = normalizeProxyUrl(proxyUrl)
  const reachable = requested ? await probeProxyPort(requested) : false
  const proxy = pickScanProxy(requested, reachable)
  droppedDeadProxy = Boolean(requested) && !proxy
  await applySessionProxy(proxy)
}

function redditUnreachableMessage(): string {
  if (droppedDeadProxy) {
    return 'Reddit 不可达。金矿配置里的代理没在听（CatCloud 混合口看设置，常见不是 7890），本轮已改直连所以 HN 还能捞；要 Reddit 请先开客户端再扫。'
  }
  if (proxyActive) {
    return 'CatCloud 已连通，但 Reddit 把当前出口拦了（403），档案源也失败。换一个节点后再扫（尽量避开机房 IP）。'
  }
  return 'Reddit 不可达。国内直连会被墙：到金矿配置填 CatCloud 混合端口（如 http://127.0.0.1:12334）。'
}

async function getJsonOnce(url: string): Promise<unknown> {
  const ses = session.fromPartition(PARTITION)
  const request = typeof ses.fetch === 'function' ? ses.fetch.bind(ses) : electronNet.fetch
  const response = await request(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(fetchTimeoutMs),
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return response.json()
}

async function getJson(url: string): Promise<unknown> {
  try {
    return await getJsonOnce(url)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!isProxyConnectionFailed(message) || proxyFetchRetried) {
      throw error
    }
    proxyFetchRetried = true
    droppedDeadProxy = true
    await applySessionProxy('')
    return getJsonOnce(url)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
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

function clipText(value: string, limit: number): string {
  const text = value.replace(/\s+\n/g, '\n').trim()
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`
}

function commentBodies(payload: unknown): string[] {
  const root = asRecord(payload)
  const list = Array.isArray(root?.data)
    ? root.data
    : Array.isArray(root?.children)
      ? root.children
      : Array.isArray(payload)
        ? payload
        : []
  const excerpts: string[] = []
  for (const item of list) {
    const nested = asRecord(item)
    const row = asRecord(nested?.data) ?? nested
    const body = clipText(str(row?.body || row?.text), 400)
    if (body && body !== '[deleted]' && body !== '[removed]') {
      excerpts.push(body)
    }
    if (excerpts.length >= EXCERPT_LIMIT) {
      break
    }
  }
  return excerpts
}

function toRedditPost(row: Record<string, unknown>, source: PainSource): RawPainPost | null {
  if (row.stickied === true || row.over_18 === true) {
    return null
  }
  const id = str(row.id)
  const title = str(row.title).trim()
  if (!id || !title) {
    return null
  }
  const permalink = str(row.permalink)
  const created = num(row.created_utc)
  return {
    source: 'reddit',
    sourceId: id,
    url: permalink
      ? permalink.startsWith('http')
        ? permalink
        : `https://www.reddit.com${permalink}`
      : `https://www.reddit.com/${id}`,
    title,
    body: clipText(str(row.selftext), BODY_LIMIT),
    community: `r/${str(row.subreddit) || source.subs?.[0] || 'reddit'}`,
    sourceLabel: source.label,
    domain: source.domain,
    score: Math.max(0, num(row.score)),
    comments: Math.max(0, num(row.num_comments)),
    createdAt: created > 0 ? new Date(created * 1000).toISOString() : new Date().toISOString(),
    excerpts: [],
  }
}

function redditListingPosts(payload: unknown, source: PainSource): RawPainPost[] {
  const data = asRecord(asRecord(payload)?.data)
  const children = data?.children
  if (!Array.isArray(children)) {
    return []
  }
  const posts: RawPainPost[] = []
  for (const child of children) {
    const row = asRecord(asRecord(child)?.data)
    if (!row) {
      continue
    }
    const post = toRedditPost(row, source)
    if (post) {
      posts.push(post)
    }
  }
  return posts
}

function pullpushPosts(payload: unknown, source: PainSource): RawPainPost[] {
  const root = asRecord(payload)
  const list = Array.isArray(root?.data)
    ? root.data
    : Array.isArray(payload)
      ? payload
      : []
  const posts: RawPainPost[] = []
  for (const item of list) {
    const nested = asRecord(item)
    const row = asRecord(nested?.data) ?? nested
    if (!row) {
      continue
    }
    const post = toRedditPost(row, source)
    if (post) {
      posts.push(post)
    }
  }
  return posts
}

function hnPosts(payload: unknown, source: PainSource, query: string): RawPainPost[] {
  const hits = asRecord(payload)?.hits
  if (!Array.isArray(hits)) {
    return []
  }
  const posts: RawPainPost[] = []
  for (const hit of hits) {
    const row = asRecord(hit)
    if (!row) {
      continue
    }
    const id = str(row.objectID)
    const title = str(row.title).trim()
    if (!id || !title) {
      continue
    }
    posts.push({
      source: 'hn',
      sourceId: id,
      url: `https://news.ycombinator.com/item?id=${id}`,
      title,
      body: clipText(str(row.story_text || row.comment_text), BODY_LIMIT),
      community: title.startsWith('Ask HN') ? 'Ask HN' : 'HN',
      sourceLabel: `${source.label} · ${query}`,
      domain: source.domain,
      score: Math.max(0, num(row.points)),
      comments: Math.max(0, num(row.num_comments)),
      createdAt: str(row.created_at) || new Date().toISOString(),
      excerpts: [],
    })
  }
  return posts
}

async function fetchRedditOfficial(source: PainSource): Promise<RawPainPost[]> {
  const subs = (source.subs ?? []).join('+')
  if (!subs) {
    return []
  }
  const mode = source.mode ?? 'hot'
  const urls: string[] = []
  if (mode === 'hot' || mode === 'hot+search') {
    urls.push(`https://www.reddit.com/r/${subs}/new.json?limit=50&raw_json=1`)
  }
  if (mode === 'search' || mode === 'hot+search') {
    urls.push(
      `https://www.reddit.com/r/${subs}/search.json?q=${encodeURIComponent(REDDIT_SEARCH_QUERY)}&restrict_sr=1&sort=new&t=day&limit=50&raw_json=1`,
    )
  }
  const posts: RawPainPost[] = []
  for (const [index, url] of urls.entries()) {
    if (index > 0) {
      await sleep(400)
    }
    posts.push(...redditListingPosts(await getJson(url), source))
  }
  return posts
}

async function fetchRedditArctic(source: PainSource): Promise<RawPainPost[]> {
  const subs = (source.subs ?? []).slice(0, 3)
  if (subs.length === 0) {
    return []
  }
  const posts: RawPainPost[] = []
  for (const [index, sub] of subs.entries()) {
    if (index > 0) {
      await sleep(400)
    }
    posts.push(...pullpushPosts(await getJson(arcticShiftPostsUrl(sub, 50, startOfLocalDayUnix())), source))
  }
  return posts
}

async function fetchRedditPullpush(source: PainSource): Promise<RawPainPost[]> {
  const subs = (source.subs ?? []).slice(0, 3)
  if (subs.length === 0) {
    return []
  }
  const posts: RawPainPost[] = []
  for (const [index, sub] of subs.entries()) {
    if (index > 0) {
      await sleep(400)
    }
    const url = `https://api.pullpush.io/reddit/search/submission/?subreddit=${encodeURIComponent(sub)}&size=25&sort=desc`
    try {
      posts.push(...pullpushPosts(await getJson(url), source))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('HTTP 429')) {
        throw new Error('Pullpush 档案限流。等一分钟再扫，或换一个 CatCloud 节点。')
      }
      throw error
    }
  }
  return posts
}

async function fetchReddit(source: PainSource): Promise<RawPainPost[]> {
  if (!redditOfficialDown) {
    try {
      return await fetchRedditOfficial(source)
    } catch {
      redditOfficialDown = true
    }
  }
  if (!arcticDown) {
    try {
      const posts = await fetchRedditArctic(source)
      if (posts.length > 0) {
        return posts
      }
    } catch {
      arcticDown = true
    }
  }
  if (pullpushDown) {
    throw new Error(redditUnreachableMessage())
  }
  try {
    return await fetchRedditPullpush(source)
  } catch (error) {
    pullpushDown = true
    throw error
  }
}

async function hnComments(objectId: string): Promise<string[]> {
  const payload = asRecord(await getJson(hnItemUrl(objectId)))
  return commentBodies(payload)
}

async function redditComments(postId: string): Promise<string[]> {
  return commentBodies(await getJson(arcticShiftCommentsUrl(postId, EXCERPT_LIMIT)))
}

async function enrichPosts(posts: RawPainPost[]): Promise<RawPainPost[]> {
  const targets = [...posts]
    .filter((post) => post.comments > 0 && (post.source === 'hn' || post.source === 'reddit'))
    .sort((left, right) => right.comments - left.comments)
    .slice(0, 4)
  const extra = new Map<string, string[]>()
  for (const post of targets) {
    try {
      const excerpts = post.source === 'hn' ? await hnComments(post.sourceId) : await redditComments(post.sourceId)
      if (excerpts.length > 0) {
        extra.set(post.sourceId, excerpts)
      }
    } catch {
      extra.delete(post.sourceId)
    }
    await sleep(250)
  }
  return posts.map((post) => {
    const excerpts = extra.get(post.sourceId) ?? []
    if (excerpts.length === 0) {
      return post
    }
    return {
      ...post,
      excerpts,
      body: clipText(
        [post.body, excerpts.map((line, index) => `评论${index + 1}：${line}`).join('\n')].filter(Boolean).join('\n\n'),
        BODY_LIMIT,
      ),
    }
  })
}

async function fetchHn(source: PainSource): Promise<RawPainPost[]> {
  const since = startOfLocalDayUnix()
  const posts: RawPainPost[] = []
  for (const [index, query] of (source.queries ?? []).entries()) {
    if (index > 0) {
      await sleep(200)
    }
    const tags = source.hnTags ?? 'story'
    const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=${tags}&hitsPerPage=30&numericFilters=${encodeURIComponent(`created_at_i>${since}`)}`
    posts.push(...hnPosts(await getJson(url), source, query))
  }
  return posts
}

function itunesLabel(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  return str(asRecord(value)?.label)
}

function appStorePosts(payload: unknown, source: PainSource, appId: string, appName: string, cc: string): RawPainPost[] {
  const feed = asRecord(asRecord(payload)?.feed)
  const entry = feed?.entry
  const list = Array.isArray(entry) ? entry : entry ? [entry] : []
  const starMax = source.starMax ?? 3
  const community = appName || `App ${appId}`
  const posts: RawPainPost[] = []
  for (const item of list) {
    const row = asRecord(item)
    if (!row) {
      continue
    }
    const rating = Number(itunesLabel(row['im:rating']))
    if (!Number.isFinite(rating) || rating < 1 || rating > starMax) {
      continue
    }
    const reviewId = itunesLabel(row.id).trim()
    const title = itunesLabel(row.title).trim()
    if (!reviewId || !title) {
      continue
    }
    const created = Date.parse(itunesLabel(row.updated))
    const votes = Number(itunesLabel(row['im:voteCount']))
    posts.push({
      source: 'appstore',
      sourceId: `${appId}:${reviewId}`,
      url: `https://itunes.apple.com/${cc}/app/id${appId}`,
      title,
      body: clipText(itunesLabel(row.content), BODY_LIMIT),
      community,
      sourceLabel: source.label,
      domain: source.domain,
      score: Math.max(0, 5 - rating),
      comments: Number.isFinite(votes) ? Math.max(0, votes) : 0,
      createdAt: Number.isNaN(created) ? new Date().toISOString() : new Date(created).toISOString(),
      excerpts: [],
    })
  }
  return posts
}

async function fetchAppStore(source: PainSource): Promise<RawPainPost[]> {
  const appIds = (source.appIds ?? []).map((id) => id.trim()).filter(Boolean)
  if (appIds.length === 0) {
    return []
  }
  const names = source.queries ?? []
  const cc = 'us'
  const posts: RawPainPost[] = []
  for (const [index, appId] of appIds.entries()) {
    if (index > 0) {
      await sleep(200)
    }
    posts.push(...appStorePosts(await getJson(itunesReviewsUrl(appId, cc, 1)), source, appId, names[index] ?? '', cc))
  }
  return posts
}

function fetchX(source: PainSource, now: Date): RawPainPost[] {
  return readXQueue(now).map((item) => ({
    source: 'x',
    sourceId: item.id,
    url: item.url,
    title: clipText(item.text.split('\n')[0] || item.text, 200),
    body: clipText(item.text, BODY_LIMIT),
    community: 'X',
    sourceLabel: item.query ? `${source.label} · ${item.query}` : source.label,
    domain: source.domain,
    score: Math.max(0, item.likes),
    comments: Math.max(0, item.replies),
    createdAt: item.postedAt || item.fetchedAt,
    excerpts: [],
  }))
}

function keepFetchedPost(post: RawPainPost, now: Date): boolean {
  return isFreshSignal(post, now)
}

export async function fetchPainSource(source: PainSource, now = new Date()): Promise<SourceFetchResult> {
  if (source.kind === 'x') {
    try {
      const posts = fetchX(source, now).filter((post) => keepFetchedPost(post, now))
      return { source, posts, error: xQueueFetchError() }
    } catch (error) {
      return {
        source,
        posts: [],
        error: xQueueFetchError() ?? (error instanceof Error ? error.message : String(error)),
      }
    }
  }
  try {
    const raw =
      source.kind === 'reddit' ? await fetchReddit(source) : source.kind === 'appstore' ? await fetchAppStore(source) : await fetchHn(source)
    const today = raw.filter((post) => keepFetchedPost(post, now))
    const posts = await enrichPosts(today)
    return { source, posts, error: null }
  } catch (error) {
    return {
      source,
      posts: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function fetchPainSources(sources: PainSource[], proxyUrl = '', now = new Date()): Promise<SourceFetchResult[]> {
  redditOfficialDown = false
  arcticDown = false
  pullpushDown = false
  proxyActive = false
  droppedDeadProxy = false
  proxyFetchRetried = false
  await prepareMicroNetwork(proxyUrl)
  const ordered = [
    ...sources.filter((source) => source.kind === 'x'),
    ...sources.filter((source) => source.kind === 'hn'),
    ...sources.filter((source) => source.kind === 'appstore'),
    ...sources.filter((source) => source.kind === 'reddit'),
  ]
  const results: SourceFetchResult[] = []
  for (const [index, source] of ordered.entries()) {
    if (index > 0) {
      await sleep(350)
    }
    results.push(await fetchPainSource(source, now))
  }
  return results
}
