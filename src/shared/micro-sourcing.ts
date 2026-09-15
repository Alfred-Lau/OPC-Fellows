import { markdownTable } from './chat-markdown.ts'
import { dayKey } from './datetime.ts'
import { pinByIds } from './listing.ts'
import { isPickBestAsk, withNamedFirst } from './read-answer.ts'

export const MICRO_AGENT_ID = 'micro-sourcing'
export const MICRO_TAG = '选品'

export type PainDomain = 'creator' | 'ecommerce' | 'productivity' | 'indie'
export type ProductForm = 'chrome' | 'ai-micro' | 'notion' | 'saas' | 'unknown'
export type IdeaStatus = 'new' | 'watching' | 'building' | 'parked' | 'dismissed'
export type IdeaVerdict = 'build' | 'watch' | 'kill' | 'unknown'
export type SignalSourceKind = 'reddit' | 'hn' | 'appstore' | 'x'
export type MicroGroupId = 'today' | 'ideas' | 'signals' | 'pipeline' | 'settings'

export const PAIN_DOMAINS: readonly PainDomain[] = ['creator', 'ecommerce', 'productivity', 'indie']
export const PRODUCT_FORMS: readonly ProductForm[] = ['chrome', 'ai-micro', 'notion', 'saas', 'unknown']
export const IDEA_STATUSES: readonly IdeaStatus[] = ['new', 'watching', 'building', 'parked', 'dismissed']
export const IDEA_VERDICTS: readonly IdeaVerdict[] = ['build', 'watch', 'kill', 'unknown']
export const MICRO_GROUPS: readonly { id: MicroGroupId; label: string }[] = [
  { id: 'today', label: '今日热榜' },
  { id: 'ideas', label: '产品 Idea' },
  { id: 'signals', label: '信号流' },
  { id: 'pipeline', label: '观察管线' },
  { id: 'settings', label: '金矿配置' },
]

export const DOMAIN_LABEL: Record<PainDomain, string> = {
  creator: '海外自媒体',
  ecommerce: '独立站',
  productivity: '效率工具',
  indie: '独立开发许愿',
}

export const FORM_LABEL: Record<ProductForm, string> = {
  chrome: 'Chrome 插件',
  'ai-micro': 'AI 微型应用',
  notion: 'Notion 插件 / 模版',
  saas: '轻量 SaaS',
  unknown: '形态待定',
}

export const STATUS_LABEL: Record<IdeaStatus, string> = {
  new: '新发现',
  watching: '盯着',
  building: '动手做',
  parked: '搁置',
  dismissed: '丢掉',
}

export function isIdeaSourceOpen(idea: Pick<ProductIdea, 'status'>): boolean {
  switch (idea.status) {
    case 'new':
    case 'watching':
    case 'building':
      return true
    case 'parked':
    case 'dismissed':
      return false
    default: {
      const exhaustive: never = idea.status
      return exhaustive
    }
  }
}

export function pendingAmmoIdeas(ideas: readonly ProductIdea[]): ProductIdea[] {
  return ideas.filter((item) => item.note.startsWith('ammo:') && isIdeaSourceOpen(item))
}

export function closedIdeaReply(idea: Pick<ProductIdea, 'title' | 'status'>): string {
  return `「${idea.title}」已关掉（${STATUS_LABEL[idea.status]}）。源关闭则下游停，不会再往下写。`
}

export const VERDICT_LABEL: Record<IdeaVerdict, string> = {
  build: '可做',
  watch: '再看',
  kill: '不做',
  unknown: '未判',
}

export interface PainSource {
  id: string
  kind: SignalSourceKind
  label: string
  domain: PainDomain
  subs?: string[]
  queries?: string[]
  mode?: 'hot' | 'search' | 'hot+search'
  hnTags?: 'ask_hn' | 'story'
  appIds?: string[]
  starMax?: number
}

export const X_SEARCH_QUERIES = [
  '"is there a tool that" lang:en -filter:replies',
  '"wish there was an app" lang:en',
  '"does anyone know a tool" lang:en',
  '"alternative to" min_faves:10 lang:en',
] as const

export const PAIN_SOURCES: readonly PainSource[] = [
  {
    id: 'reddit-wish',
    kind: 'reddit',
    label: 'r/somebodymakethis',
    domain: 'indie',
    subs: ['somebodymakethis'],
    mode: 'hot',
  },
  {
    id: 'reddit-indie',
    kind: 'reddit',
    label: 'r/indiehackers · r/SaaS',
    domain: 'indie',
    subs: ['indiehackers', 'SaaS', 'SideProject'],
    mode: 'hot',
  },
  {
    id: 'reddit-creator',
    kind: 'reddit',
    label: 'YouTube / Podcast',
    domain: 'creator',
    subs: ['youtubers', 'NewTubers', 'podcasting', 'videoediting'],
    mode: 'hot+search',
  },
  {
    id: 'reddit-ecom',
    kind: 'reddit',
    label: 'Shopify / 独立站',
    domain: 'ecommerce',
    subs: ['shopify', 'ecommerce', 'dropshipping'],
    mode: 'hot+search',
  },
  {
    id: 'reddit-prod',
    kind: 'reddit',
    label: 'Notion / 效率',
    domain: 'productivity',
    subs: ['Notion', 'productivity', 'AutomateYourLife'],
    mode: 'hot+search',
  },
  {
    id: 'hn-ask',
    kind: 'hn',
    label: 'Ask HN',
    domain: 'indie',
    hnTags: 'ask_hn',
    queries: [
      'is there a tool',
      'wish there was',
      'chrome extension',
      'alternative to',
    ],
  },
  {
    id: 'hn-creator',
    kind: 'hn',
    label: 'HN · 创作者工具',
    domain: 'creator',
    hnTags: 'story',
    queries: ['youtube tool', 'tiktok caption', 'podcast automation'],
  },
  {
    id: 'hn-ecom',
    kind: 'hn',
    label: 'HN · 独立站',
    domain: 'ecommerce',
    hnTags: 'story',
    queries: ['shopify app', 'cart abandonment', 'woocommerce plugin'],
  },
  {
    id: 'hn-prod',
    kind: 'hn',
    label: 'HN · 效率工具',
    domain: 'productivity',
    hnTags: 'story',
    queries: ['notion api', 'zapier alternative', 'chrome extension productivity'],
  },
  {
    id: 'appstore-competitors',
    kind: 'appstore',
    label: 'App Store 差评',
    domain: 'productivity',
    appIds: ['1232780281', '371294472'],
    queries: ['Notion', 'Shopify'],
    starMax: 3,
  },
  {
    id: 'x-pain',
    kind: 'x',
    label: 'X · 痛点搜索',
    domain: 'indie',
    queries: [...X_SEARCH_QUERIES],
  },
]

export const REDDIT_SEARCH_QUERY =
  'is there a tool OR is there an app OR "wish there was" OR "anyone know" OR alternative OR automate OR plugin OR extension'

export function arcticShiftPostsUrl(subreddit: string, limit = 25, afterUnix = 0): string {
  const params = new URLSearchParams({
    subreddit,
    limit: String(limit),
  })
  if (afterUnix > 0) {
    params.set('after', String(afterUnix))
  }
  return `https://arctic-shift.photon-reddit.com/api/posts/search?${params.toString()}`
}

export function arcticShiftCommentsUrl(postId: string, limit = 8): string {
  const linkId = postId.startsWith('t3_') ? postId : `t3_${postId}`
  const params = new URLSearchParams({
    link_id: linkId,
    limit: String(limit),
  })
  return `https://arctic-shift.photon-reddit.com/api/comments/search?${params.toString()}`
}

export function hnItemUrl(objectId: string): string {
  return `https://hn.algolia.com/api/v1/items/${encodeURIComponent(objectId)}`
}

export function itunesReviewsUrl(appId: string, cc = 'us', page = 1): string {
  const id = encodeURIComponent(appId.trim())
  const country = encodeURIComponent((cc.trim() || 'us').toLowerCase())
  const n = Number.isInteger(page) && page > 0 ? page : 1
  return `https://itunes.apple.com/${country}/rss/customerreviews/page=${n}/id=${id}/sortby=mostrecent/json`
}

export function startOfLocalDayUnix(now = new Date()): number {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return Math.floor(start.getTime() / 1000)
}

export function postedDayOf(iso: string, now = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return dayKey(now)
  }
  return dayKey(date)
}

export function isPostedToday(iso: string, now = new Date()): boolean {
  return postedDayOf(iso, now) === dayKey(now)
}

const APPSTORE_KEEP_MS = 7 * 24 * 3_600_000
const X_KEEP_MS = 3 * 24 * 3_600_000

export function isFreshAppStoreSignal(signal: { source: SignalSourceKind; createdAt: string }, now = new Date()): boolean {
  if (signal.source !== 'appstore') {
    return false
  }
  const created = Date.parse(signal.createdAt)
  if (Number.isNaN(created)) {
    return false
  }
  return now.getTime() - created < APPSTORE_KEEP_MS
}

export function isFreshXSignal(signal: { source: SignalSourceKind; createdAt: string }, now = new Date()): boolean {
  if (signal.source !== 'x') {
    return false
  }
  const created = Date.parse(signal.createdAt)
  if (Number.isNaN(created)) {
    return false
  }
  return now.getTime() - created < X_KEEP_MS
}

export function isFreshSignal(signal: { source: SignalSourceKind; createdAt: string }, now = new Date()): boolean {
  if (signal.source === 'x') {
    return isFreshXSignal(signal, now)
  }
  if (signal.source === 'appstore') {
    return isFreshAppStoreSignal(signal, now)
  }
  return isPostedToday(signal.createdAt, now)
}

export function formatDayLabel(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) {
    return day
  }
  return `${Number(match[2])}月${Number(match[3])}日`
}

export interface PainSignal {
  id: string
  source: SignalSourceKind
  sourceId: string
  url: string
  title: string
  body: string
  community: string
  sourceLabel: string
  domain: PainDomain
  form: ProductForm
  score: number
  comments: number
  createdAt: string
  fetchedAt: string
  postedDay: string
  excerpts: string[]
  heat: number
  pain: number
  fit: number
  composite: number
  keywords: string[]
  paySignal: boolean
}

export interface IdeaAnalysis {
  verdict: IdeaVerdict
  sharpness: string
  market: string
  evidence: string[]
  competitors: string
  whyHard: string
  opcFit: string
}

export interface ProductIdea {
  id: string
  title: string
  pain: string
  who: string
  workaround: string
  form: ProductForm
  domain: PainDomain
  status: IdeaStatus
  signalIds: string[]
  composite: number
  heat: number
  painScore: number
  paySignals: number
  rank: number
  prevRank: number | null
  firstSeenAt: string
  lastSeenAt: string
  postedDay: string
  scanDay: string
  note: string
  usedModel: boolean
  analysis: IdeaAnalysis
}

export interface ScanError {
  source: string
  message: string
}

export interface ScanRun {
  at: string
  signalCount: number
  ideaCount: number
  newIdeas: number
  errors: ScanError[]
  usedModel: boolean
}

export interface MicroSourcingSettings {
  heartbeatHours: number
  notify: boolean
  todoFollowUp: boolean
  domains: Record<PainDomain, boolean>
  /** Clash / Surge mixed 口，如 http://127.0.0.1:7890。空则走系统代理。 */
  proxyUrl: string
  /** 用户自己加的源，拼在内置 PAIN_SOURCES 后面。 */
  customSources: PainSource[]
}

export interface MicroSourcingState {
  settings: MicroSourcingSettings
  signals: PainSignal[]
  ideas: ProductIdea[]
  lastRun: ScanRun | null
  scanning: boolean
  lastError: string | null
}

export const DEFAULT_MICRO_SETTINGS: MicroSourcingSettings = {
  heartbeatHours: 24,
  notify: true,
  todoFollowUp: true,
  proxyUrl: '',
  customSources: [],
  domains: {
    creator: true,
    ecommerce: true,
    productivity: true,
    indie: true,
  },
}

export const MAX_SIGNALS = 480
export const MAX_IDEAS = 80
export const TOP_IDEA_LIMIT = 12
export const PAIN_FLOOR = 8

const WISH_PHRASES = [
  'is there a tool',
  'is there an app',
  'is there a plugin',
  'is there an extension',
  'anyone know a tool',
  'anyone know a plugin',
  'wish there was',
  'somebody make',
  'looking for a tool',
  'need a tool',
  'how do i automate',
  'how to automate',
  'is there a way to',
] as const

const PAY_PHRASES = [
  "i'd pay",
  'i would pay',
  'willing to pay',
  'would pay for',
  'pay for a',
  'too expensive',
  'cheaper alternative',
  'overpriced',
] as const

const PAIN_PHRASES = [
  'sick of',
  'hate ',
  'frustrated',
  'infuriating',
  'waste of time',
  'wasting time',
  'manually',
  'tedious',
  'too complicated',
  'too bloated',
  'only need',
  'overkill',
  "doesn't work",
  'doesnt work',
  'broken',
  'so slow',
  'hours doing',
] as const

const ALT_PHRASES = ['alternative to', 'instead of', 'better than', 'replacement for'] as const

const DOMAIN_HINTS: Record<Exclude<PainDomain, 'indie'>, readonly string[]> = {
  creator: [
    'youtube',
    'youtuber',
    'tiktok',
    'shorts',
    'podcast',
    'thumbnail',
    'caption',
    'subtitle',
    'video editing',
    'newtuber',
    'creator',
  ],
  ecommerce: [
    'shopify',
    'woocommerce',
    'dropship',
    'checkout',
    'cart abandon',
    'ecommerce',
    'e-commerce',
    'storefront',
    'conversion',
  ],
  productivity: [
    'notion',
    'zapier',
    'make.com',
    'automate',
    'workflow',
    'spreadsheet',
    'airtable',
    'productivity',
  ],
}

const FORM_HINTS: Record<Exclude<ProductForm, 'unknown'>, readonly string[]> = {
  chrome: ['chrome extension', 'browser extension', 'chrome plugin', 'tampermonkey'],
  'ai-micro': ['chatgpt', 'openai', 'ai tool', 'llm', 'gpt-', 'claude', 'whisper', 'auto caption'],
  notion: ['notion', 'notion api', 'notion template'],
  saas: ['saas', 'dashboard', 'subscription tool', 'web app'],
}

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'to',
  'for',
  'of',
  'and',
  'or',
  'in',
  'on',
  'is',
  'there',
  'this',
  'that',
  'with',
  'from',
  'how',
  'do',
  'does',
  'can',
  'anyone',
  'know',
  'help',
  'please',
  'just',
  'my',
  'me',
  'i',
  'it',
  'be',
  'are',
  'was',
  'were',
  'you',
  'your',
  'we',
  'our',
  'not',
  'but',
  'if',
  'so',
  'too',
  'very',
  'really',
  'about',
  'into',
  'out',
  'up',
  'at',
  'as',
  'by',
])

export function isPainDomain(value: unknown): value is PainDomain {
  return typeof value === 'string' && (PAIN_DOMAINS as readonly string[]).includes(value)
}

export function isProductForm(value: unknown): value is ProductForm {
  return typeof value === 'string' && (PRODUCT_FORMS as readonly string[]).includes(value)
}

export function isIdeaStatus(value: unknown): value is IdeaStatus {
  return typeof value === 'string' && (IDEA_STATUSES as readonly string[]).includes(value)
}

export function isIdeaVerdict(value: unknown): value is IdeaVerdict {
  return typeof value === 'string' && (IDEA_VERDICTS as readonly string[]).includes(value)
}

export function isMicroGroupId(value: unknown): value is MicroGroupId {
  return typeof value === 'string' && MICRO_GROUPS.some((group) => group.id === value)
}

export function fingerprint(parts: string[]): string {
  const text = parts.join('|').toLowerCase()
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function haystackOf(title: string, body = ''): string {
  return `${title}\n${body}`.toLowerCase()
}

export function inferDomain(text: string, fallback: PainDomain): PainDomain {
  const hay = text.toLowerCase()
  let best: PainDomain = fallback
  let bestHits = 0
  for (const domain of ['creator', 'ecommerce', 'productivity'] as const) {
    const hits = DOMAIN_HINTS[domain].filter((hint) => hay.includes(hint)).length
    if (hits > bestHits) {
      bestHits = hits
      best = domain
    }
  }
  return best
}

export function inferForm(text: string): ProductForm {
  const hay = text.toLowerCase()
  let best: ProductForm = 'unknown'
  let bestHits = 0
  for (const form of ['chrome', 'ai-micro', 'notion', 'saas'] as const) {
    const hits = FORM_HINTS[form].filter((hint) => hay.includes(hint)).length
    if (hits > bestHits) {
      bestHits = hits
      best = form
    }
  }
  return best
}

export function extractKeywords(text: string, limit = 8): string[] {
  const counts = new Map<string, number>()
  for (const raw of text.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? []) {
    if (STOPWORDS.has(raw)) {
      continue
    }
    counts.set(raw, (counts.get(raw) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([word]) => word)
}

export function scorePainText(text: string): { pain: number; paySignal: boolean; keywords: string[] } {
  const hay = text.toLowerCase()
  const keywords: string[] = []
  let pain = 0
  for (const phrase of WISH_PHRASES) {
    if (hay.includes(phrase)) {
      pain += 8
      keywords.push(phrase)
    }
  }
  let paySignal = false
  for (const phrase of PAY_PHRASES) {
    if (hay.includes(phrase)) {
      pain += 12
      paySignal = true
      keywords.push(phrase)
    }
  }
  for (const phrase of PAIN_PHRASES) {
    if (hay.includes(phrase)) {
      pain += 6
      keywords.push(phrase)
    }
  }
  for (const phrase of ALT_PHRASES) {
    if (hay.includes(phrase)) {
      pain += 7
      keywords.push(phrase)
    }
  }
  return {
    pain: Math.min(48, pain),
    paySignal,
    keywords: [...new Set(keywords)].slice(0, 8),
  }
}

export function recencyBoost(createdAt: string, now: Date): number {
  const created = Date.parse(createdAt)
  if (Number.isNaN(created)) {
    return 0
  }
  const hours = (now.getTime() - created) / 3_600_000
  if (hours < 24) {
    return 12
  }
  if (hours < 72) {
    return 8
  }
  if (hours < 168) {
    return 5
  }
  if (hours < 336) {
    return 2
  }
  return 0
}

export function scoreHeat(score: number, comments: number, createdAt: string, now: Date): number {
  const volume = Math.log1p(Math.max(0, score)) * 4 + Math.log1p(Math.max(0, comments)) * 5
  return Math.min(40, volume) + recencyBoost(createdAt, now)
}

export function scoreFit(domain: PainDomain, form: ProductForm, enabled: Record<PainDomain, boolean>): number {
  let fit = 0
  if (enabled[domain]) {
    fit += 8
  }
  if (form !== 'unknown') {
    fit += 5
  }
  return fit
}

export function compositeScore(heat: number, pain: number, fit: number): number {
  return Math.round(heat * 0.3 + pain * 0.5 + fit * 0.2)
}

export function scoreSignal(
  input: Omit<PainSignal, 'heat' | 'pain' | 'fit' | 'composite' | 'keywords' | 'paySignal' | 'form' | 'domain' | 'postedDay'> & {
    domain: PainDomain
    form?: ProductForm
    postedDay?: string
    excerpts?: string[]
  },
  settings: MicroSourcingSettings,
  now: Date,
): PainSignal {
  const text = haystackOf(input.title, input.body)
  const { pain, paySignal, keywords } = scorePainText(text)
  const domain = inferDomain(text, input.domain)
  const form = input.form ?? inferForm(text)
  const heat = scoreHeat(input.score, input.comments, input.createdAt, now)
  const fit = scoreFit(domain, form, settings.domains)
  const excerpts = input.excerpts ?? []
  return {
    ...input,
    excerpts,
    postedDay: input.postedDay || postedDayOf(input.createdAt, now),
    domain,
    form,
    heat: Math.round(heat * 10) / 10,
    pain,
    fit,
    composite: compositeScore(heat, pain, fit),
    keywords,
    paySignal,
  }
}

function jaccard(left: string[], right: string[]): number {
  const a = new Set(left)
  const b = new Set(right)
  let inter = 0
  for (const token of a) {
    if (b.has(token)) {
      inter += 1
    }
  }
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

export function clusterKey(signal: PainSignal): string {
  const tokens = extractKeywords(`${signal.title} ${signal.keywords.join(' ')}`, 5)
  return fingerprint([signal.domain, signal.form, ...tokens.sort()])
}

export function shouldCluster(left: PainSignal, right: PainSignal): boolean {
  if (left.domain !== right.domain) {
    return false
  }
  const leftTokens = extractKeywords(`${left.title} ${left.body}`, 10)
  const rightTokens = extractKeywords(`${right.title} ${right.body}`, 10)
  if (jaccard(leftTokens, rightTokens) >= 0.22) {
    return true
  }
  const shared = leftTokens.filter((token) => rightTokens.includes(token))
  return shared.length >= 3
}

export function clusterSignals(signals: PainSignal[]): PainSignal[][] {
  const ranked = [...signals].sort((left, right) => right.composite - left.composite)
  const clusters: PainSignal[][] = []
  const used = new Set<string>()
  for (const seed of ranked) {
    if (used.has(seed.id)) {
      continue
    }
    const cluster = [seed]
    used.add(seed.id)
    for (const candidate of ranked) {
      if (used.has(candidate.id)) {
        continue
      }
      if (cluster.some((member) => shouldCluster(member, candidate))) {
        cluster.push(candidate)
        used.add(candidate.id)
      }
    }
    clusters.push(cluster)
  }
  return clusters
}

export function emptyAnalysis(): IdeaAnalysis {
  return {
    verdict: 'unknown',
    sharpness: '',
    market: '',
    evidence: [],
    competitors: '',
    whyHard: '',
    opcFit: '',
  }
}

export function hydrateAnalysis(value: unknown): IdeaAnalysis {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : null
  const evidence = Array.isArray(row?.evidence)
    ? row.evidence.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 8)
    : []
  return {
    verdict: isIdeaVerdict(row?.verdict) ? row.verdict : 'unknown',
    sharpness: typeof row?.sharpness === 'string' ? row.sharpness.trim() : '',
    market: typeof row?.market === 'string' ? row.market.trim() : '',
    evidence,
    competitors: typeof row?.competitors === 'string' ? row.competitors.trim() : '',
    whyHard: typeof row?.whyHard === 'string' ? row.whyHard.trim() : '',
    opcFit: typeof row?.opcFit === 'string' ? row.opcFit.trim() : '',
  }
}

export function hydrateIdea(idea: ProductIdea, now = new Date()): ProductIdea {
  return {
    ...idea,
    postedDay: idea.postedDay || postedDayOf(idea.firstSeenAt || idea.lastSeenAt, now),
    scanDay: idea.scanDay || postedDayOf(idea.lastSeenAt || idea.firstSeenAt, now),
    analysis: hydrateAnalysis(idea.analysis),
  }
}

export function hydrateSignal(signal: PainSignal, now = new Date()): PainSignal {
  return {
    ...signal,
    excerpts: Array.isArray(signal.excerpts) ? signal.excerpts.filter((item) => item.trim().length > 0) : [],
    postedDay: signal.postedDay || postedDayOf(signal.createdAt, now),
  }
}

export function draftAnalysis(idea: ProductIdea, signals: PainSignal[]): IdeaAnalysis {
  const posts = idea.signalIds
    .map((id) => signals.find((signal) => signal.id === id))
    .filter((signal): signal is PainSignal => Boolean(signal))
  const quotes = posts.flatMap((post) => {
    const snippet = (post.excerpts[0] || post.body || post.title).replace(/\s+/g, ' ').trim().slice(0, 140)
    return snippet
      ? [`${post.community} · ${formatDayLabel(post.postedDay)} · 赞 ${post.score} / 评 ${post.comments}：「${snippet}」`]
      : []
  })
  const named = posts
    .flatMap((post) => extractKeywords(`${post.title} ${post.body}`, 6))
    .filter((word) => ['zapier', 'klaviyo', 'shopify', 'notion', 'youtube', 'tiktok', 'chatgpt', 'stripe'].includes(word))
  const uniqueNamed = [...new Set(named)]
  const pay = idea.paySignals > 0
  const thin = posts.length <= 1
  const launchy = posts.some((post) => /just launched|feedback welcome|show hn/i.test(`${post.title} ${post.body}`))
  let verdict: IdeaVerdict = 'watch'
  if (thin && !pay) {
    verdict = 'kill'
  } else if (pay && posts.length >= 2 && idea.painScore >= 16) {
    verdict = 'watch'
  } else if (launchy || idea.painScore < PAIN_FLOOR) {
    verdict = 'kill'
  }
  const sharpness = [
    thin ? '今天只有一条有效帖，这不够叫市场调查，最多叫目击。' : `今天有 ${posts.length} 条帖，仍是同一天的切片，不是趋势。`,
    pay ? '有人写出付费意愿，但原话不等于订单。' : '没有人写出愿意付钱。把情绪当需求，是选品里最常见的自欺。',
    launchy ? '混进了秀产品/求反馈帖，那是作者在推销，不是用户在求救。' : '',
    uniqueNamed.length > 0
      ? `帖里点名了 ${uniqueNamed.join('、')}。一人公司去硬刚这些分发和套件，胜算默认按「做不起」估。`
      : '没看到明确竞品名，也可能只是提问者词汇贫乏，不要自动理解成蓝海。',
  ]
    .filter(Boolean)
    .join('')
  return {
    verdict,
    sharpness,
    market: `样本限于 ${formatDayLabel(idea.postedDay)} 的 ${posts.map((post) => post.community).filter((item, index, all) => all.indexOf(item) === index).join('、') || '未知社区'}。不要把当天热帖外推成 TAM。`,
    evidence: quotes.slice(0, 6),
    competitors: uniqueNamed.length > 0 ? uniqueNamed.join('、') : '帖内未点名；未知不等于没有。',
    whyHard: '一人公司没有品牌、客服班底和渠道。若痛点要嵌入 Shopify / YouTube / Notion 生态，分发成本会先把你吃掉。',
    opcFit: '先问：你能不能在两周内做出可收费的最小形态，并且证据能在明天的帖里复现。复现不了就杀掉。',
  }
}

function ideaFromCluster(
  cluster: PainSignal[],
  previous: ProductIdea | undefined,
  now: Date,
  usedModel: boolean,
): ProductIdea {
  const sorted = [...cluster].sort((left, right) => right.composite - left.composite)
  const top = sorted[0]
  if (!top) {
    throw new Error('empty cluster')
  }
  const paySignals = sorted.filter((signal) => signal.paySignal).length
  const heat = sorted.reduce((sum, signal) => sum + signal.heat, 0) / sorted.length
  const painScore = Math.max(...sorted.map((signal) => signal.pain))
  const composite = Math.round(
    sorted.reduce((sum, signal) => sum + signal.composite, 0) / sorted.length + Math.min(8, sorted.length),
  )
  const id = previous?.id ?? clusterKey(top)
  const nowIso = now.toISOString()
  const scanDay = dayKey(now)
  const postedDay = sorted.map((signal) => signal.postedDay).sort().at(-1) ?? scanDay
  const idea: ProductIdea = {
    id,
    title: previous?.title && previous.usedModel ? previous.title : top.title,
    pain: previous?.pain && previous.usedModel ? previous.pain : top.title,
    who: previous?.who ?? DOMAIN_LABEL[top.domain],
    workaround: previous?.workaround ?? (top.keywords[0] ? `现有做法卡在「${top.keywords[0]}」` : '还没看清现有 workaround'),
    form: top.form,
    domain: top.domain,
    status: previous?.status ?? 'new',
    signalIds: sorted.map((signal) => signal.id),
    composite,
    heat: Math.round(heat * 10) / 10,
    painScore,
    paySignals,
    rank: 0,
    prevRank: previous?.rank ?? null,
    firstSeenAt: previous?.firstSeenAt ?? nowIso,
    lastSeenAt: nowIso,
    postedDay,
    scanDay,
    note: previous?.note ?? '',
    usedModel: Boolean(previous?.usedModel || usedModel),
    analysis: previous?.analysis && previous.usedModel ? previous.analysis : emptyAnalysis(),
  }
  return {
    ...idea,
    analysis: usedModel && previous?.analysis?.sharpness ? previous.analysis : draftAnalysis(idea, sorted),
  }
}

export function mergeIdeas(
  previous: ProductIdea[],
  signals: PainSignal[],
  now = new Date(),
  usedModel = false,
): ProductIdea[] {
  const kept = signals.filter(
    (signal) => isFreshSignal(signal, now) && (signal.pain >= PAIN_FLOOR || signal.paySignal),
  )
  const clusters = clusterSignals(kept)
  const prevById = new Map(previous.map((idea) => [idea.id, idea]))
  const prevBySignal = new Map<string, ProductIdea>()
  for (const idea of previous) {
    for (const signalId of idea.signalIds) {
      prevBySignal.set(signalId, idea)
    }
  }
  const next: ProductIdea[] = []
  const seen = new Set<string>()
  for (const cluster of clusters) {
    const inherited = cluster.map((signal) => prevBySignal.get(signal.id)).find(Boolean) ?? prevById.get(clusterKey(cluster[0]!))
    const idea = ideaFromCluster(cluster, inherited, now, usedModel)
    if (seen.has(idea.id)) {
      continue
    }
    seen.add(idea.id)
    next.push(idea)
  }
  for (const idea of previous) {
    if (seen.has(idea.id)) {
      continue
    }
    if (idea.status === 'watching' || idea.status === 'building' || idea.status === 'parked') {
      next.push(hydrateIdea(idea, now))
      seen.add(idea.id)
    }
  }
  const ranked = next
    .filter((idea) => idea.status !== 'dismissed')
    .sort((left, right) => right.composite - left.composite || right.paySignals - left.paySignals)
  const dismissed = next.filter((idea) => idea.status === 'dismissed')
  const withRank = ranked.map((idea, index) => ({ ...idea, rank: index + 1 }))
  return [...withRank, ...dismissed].slice(0, MAX_IDEAS)
}

export function pruneSignals(signals: PainSignal[], now = new Date(), keepIds: Iterable<string> = []): PainSignal[] {
  const keep = new Set(keepIds)
  return signals
    .filter((signal) => keep.has(signal.id) || isFreshSignal(signal, now))
    .sort((left, right) => right.composite - left.composite)
    .slice(0, MAX_SIGNALS)
}

export function todaySignals(signals: PainSignal[], now = new Date()): PainSignal[] {
  return signals.filter((signal) => isPostedToday(signal.createdAt, now))
}

export function upsertSignals(existing: PainSignal[], incoming: PainSignal[]): PainSignal[] {
  const map = new Map(existing.map((signal) => [signal.id, signal]))
  for (const signal of incoming) {
    map.set(signal.id, signal)
  }
  return [...map.values()]
}

export function enabledSources(settings: MicroSourcingSettings): PainSource[] {
  return [...PAIN_SOURCES, ...settings.customSources].filter((source) => settings.domains[source.domain])
}

export function parsePainSources(value: unknown): PainSource[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return []
    }
    const raw = item as Partial<PainSource>
    if (typeof raw.id !== 'string' || !raw.id.trim()) {
      return []
    }
    if (raw.kind !== 'reddit' && raw.kind !== 'hn' && raw.kind !== 'appstore' && raw.kind !== 'x') {
      return []
    }
    if (!isPainDomain(raw.domain)) {
      return []
    }
    const starMax = typeof raw.starMax === 'number' && Number.isInteger(raw.starMax) ? raw.starMax : 0
    return [
      {
        id: raw.id.trim(),
        kind: raw.kind,
        label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : raw.id.trim(),
        domain: raw.domain,
        ...(Array.isArray(raw.subs) ? { subs: raw.subs.filter((sub): sub is string => typeof sub === 'string') } : {}),
        ...(Array.isArray(raw.queries) ? { queries: raw.queries.filter((query): query is string => typeof query === 'string') } : {}),
        ...(raw.mode === 'hot' || raw.mode === 'search' || raw.mode === 'hot+search' ? { mode: raw.mode } : {}),
        ...(raw.hnTags === 'ask_hn' || raw.hnTags === 'story' ? { hnTags: raw.hnTags } : {}),
        ...(Array.isArray(raw.appIds)
          ? { appIds: raw.appIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0).map((id) => id.trim()) }
          : {}),
        ...(starMax >= 1 && starMax <= 5 ? { starMax } : {}),
      },
    ]
  })
}

export function todayIdeas(ideas: ProductIdea[], now = new Date(), limit = TOP_IDEA_LIMIT): ProductIdea[] {
  const day = dayKey(now)
  return ideas
    .filter((idea) => idea.postedDay === day && (idea.status === 'new' || idea.status === 'watching'))
    .slice()
    .sort((left, right) => right.composite - left.composite || right.paySignals - left.paySignals)
    .slice(0, limit)
}

const REVIEW_SET_QUERY =
  /今天的产品\s*idea|今天有什么\s*idea|今天有哪些\s*idea|今天的\s*idea|今日热榜|今日的?\s*idea|产品\s*idea\s*是什么/
const REVIEW_ORDINAL = /第\s*(十一|十二|十|[一二三四五六七八九]|\d+)\s*条?/
const CN_ORDINAL: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
  十一: 11,
  十二: 12,
}

export type ReviewFocus =
  | { kind: 'list' }
  | { kind: 'one'; idea: ProductIdea; index: number }
  | { kind: 'unknown'; needle: string }

export function parseReviewOrdinal(text: string): number | undefined {
  const matched = text.match(REVIEW_ORDINAL)
  const raw = matched?.[1]
  if (!raw) {
    return undefined
  }
  if (CN_ORDINAL[raw]) {
    return CN_ORDINAL[raw]
  }
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

export function resolveListedIdea(
  text: string,
  listed: ProductIdea[],
  strip = /评估\s*idea|评估idea|评估一下|评估|今天的产品\s*idea|今天有什么\s*idea|今天有哪些\s*idea|今天的\s*idea|今日热榜|今日的?\s*idea|产品\s*idea\s*是什么|是什么|怎么样|如何|好不好|看看|看一下|管线改判|管线|立项交接|立项|第\s*(十一|十二|十|[一二三四五六七八九]|\d+)\s*条?/g,
): ReviewFocus {
  const ordinal = parseReviewOrdinal(text)
  if (ordinal) {
    const idea = listed[ordinal - 1]
    return idea ? { kind: 'one', idea, index: ordinal } : { kind: 'unknown', needle: `第${ordinal}条` }
  }
  const needle = text.replace(strip, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  if (!needle || /^(这个|这条|那个|它)$/.test(needle)) {
    return needle ? { kind: 'unknown', needle } : { kind: 'list' }
  }
  const hits = listed.filter((idea) => idea.title.toLowerCase().includes(needle))
  if (hits.length === 1 && hits[0]) {
    return { kind: 'one', idea: hits[0], index: listed.indexOf(hits[0]) + 1 }
  }
  return { kind: 'unknown', needle }
}

export function parsePipelineStatus(text: string): IdeaStatus | undefined {
  if (/丢掉|dismiss/.test(text)) {
    return 'dismissed'
  }
  if (/动手做|building|build/.test(text)) {
    return 'building'
  }
  if (/搁置|park/.test(text)) {
    return 'parked'
  }
  if (/盯着|watching|watch/.test(text)) {
    return 'watching'
  }
  return undefined
}

export function formatScanSummary(state: Pick<MicroSourcingState, 'ideas' | 'lastRun'>, now = new Date()): string {
  if (!state.lastRun) {
    return '还没有扫描结果。要先说「扫描痛点」或 /扫描痛点。'
  }
  const listed = todayIdeas(state.ideas, now)
  const watching = state.ideas.filter((idea) => idea.status === 'watching').length
  if (listed.length === 0) {
    const pipeline = watching > 0 ? `观察管线里还有 ${watching} 条。` : ''
    return `已扫描。今天没有够痛的新帖。不会拿昨天的热帖来凑。${pipeline}`
  }
  return [
    `已扫描。当天帖 ${state.lastRun.signalCount} 条，聚成 ${state.lastRun.ideaCount} 个 idea，新出现 ${state.lastRun.newIdeas} 个。`,
    formatIdeaReview(state, '今天的产品 idea 是什么', now),
  ].join('\n')
}

export function planPipelineChange(
  text: string,
  ideas: ProductIdea[],
  now = new Date(),
  pinnedIds?: readonly string[],
): { idea?: ProductIdea; status?: IdeaStatus; reply: string } {
  const status = parsePipelineStatus(text)
  const pinned = pinnedIds?.length ? pinByIds(ideas, pinnedIds, (idea) => idea.id) : []
  const board = pinned.length > 0 ? pinned : todayIdeas(ideas, now)
  const pipeline = pipelineIdeas(ideas)
  let focus = resolveListedIdea(text, board)
  if (focus.kind !== 'one' && pinned.length === 0) {
    const fromPipeline = resolveListedIdea(text, pipeline)
    if (fromPipeline.kind === 'one') {
      focus = fromPipeline
    }
  }
  if (focus.kind === 'unknown') {
    return { status, reply: `对不上「${focus.needle}」这一条。今日热榜和观察管线里都没有。` }
  }
  if (focus.kind === 'list') {
    if (!status) {
      if (pipeline.length === 0) {
        return { reply: '观察管线是空的。先评估今日热榜，再说「盯着第一条」。' }
      }
      return {
        reply: [
          `观察管线 **${pipeline.length}** 条：`,
          '',
          markdownTable(
            ['#', 'Idea', '管线'],
            pipeline.map((idea, index) => [String(index + 1), idea.title, STATUS_LABEL[idea.status]]),
          ),
        ].join('\n'),
      }
    }
    return { status, reply: `要改「${STATUS_LABEL[status]}」哪一条？说「${STATUS_LABEL[status]}第三条」或标题。` }
  }
  if (!status) {
    return {
      idea: focus.idea,
      reply: `${focus.idea.title} 现在是${STATUS_LABEL[focus.idea.status]}。要盯着、动手做、搁置还是丢掉？`,
    }
  }
  return {
    idea: focus.idea,
    status,
    reply: `已把「${focus.idea.title}」写成${STATUS_LABEL[status]}。改的是管线状态，不是判决。`,
  }
}

export function planHandoff(
  text: string,
  ideas: ProductIdea[],
  hasAmmo: boolean,
  now = new Date(),
  pinnedIds?: readonly string[],
): { idea?: ProductIdea; reply: string } {
  const pinned = pinnedIds?.length ? pinByIds(ideas, pinnedIds, (idea) => idea.id) : []
  const listed = pinned.length > 0 ? pinned : todayIdeas(ideas, now)
  const focus = resolveListedIdea(text, listed.length > 0 ? listed : pipelineIdeas(ideas))
  if (focus.kind === 'unknown') {
    return { reply: `对不上「${focus.needle}」这一条。立项交接只传今日热榜里的 Idea 指针。` }
  }
  if (focus.kind === 'list') {
    if (listed.length === 0) {
      return { reply: '今日热榜是空的。先评估 idea，再立项交接。' }
    }
    return { reply: '要把哪一条交给弹药手？说「第三条立项」或标题。' }
  }
  if (!isIdeaSourceOpen(focus.idea)) {
    return { idea: focus.idea, reply: closedIdeaReply(focus.idea) }
  }
  if (!hasAmmo) {
    return {
      idea: focus.idea,
      reply: `弹药手还没雇。先雇社媒弹药手，再把「${focus.idea.title}」的指针交过去。不会在这里复制第二份弹药。`,
    }
  }
  return {
    idea: focus.idea,
    reply: `已把「${focus.idea.title}」的指针交给弹药手。不复制第二份，也不把 Idea 正文收成公众号稿。`,
  }
}

export function resolveReviewFocus(
  text: string,
  ideas: ProductIdea[],
  now = new Date(),
  pinnedIds?: readonly string[],
): ReviewFocus {
  if ((REVIEW_SET_QUERY.test(text) || isPickBestAsk(text)) && !parseReviewOrdinal(text)) {
    return { kind: 'list' }
  }
  const listed = pinnedIds?.length ? pinByIds(ideas, pinnedIds, (idea) => idea.id) : todayIdeas(ideas, now)
  return resolveListedIdea(text, listed.length > 0 ? listed : todayIdeas(ideas, now))
}

function formatIdeaTable(ideas: ProductIdea[], start = 1): string {
  return markdownTable(
    ['#', 'Idea', '判决', '痛感', '综合'],
    ideas.map((idea, index) => [
      String(start + index),
      idea.title,
      VERDICT_LABEL[idea.analysis.verdict],
      String(idea.painScore),
      String(idea.composite),
    ]),
  )
}

export function formatIdeaReview(
  state: Pick<MicroSourcingState, 'ideas' | 'lastRun'>,
  text: string,
  now = new Date(),
  pinnedIds?: readonly string[],
): string {
  const listed = todayIdeas(state.ideas, now)
  const watching = state.ideas.filter((idea) => idea.status === 'watching').length
  const focus = resolveReviewFocus(text, state.ideas, now, pinnedIds)
  switch (focus.kind) {
    case 'unknown':
      return `对不上「${focus.needle}」这一条。今日热榜里没有这个序号或标题。`
    case 'one': {
      const pain = focus.idea.pain === focus.idea.title ? `${focus.idea.who} · ${focus.idea.workaround}` : focus.idea.pain
      return [
        `**${focus.index} · ${focus.idea.title}**`,
        '',
        formatIdeaTable([focus.idea], focus.index),
        pain ? `\n> ${pain}` : '',
      ]
        .filter((line) => line.trim())
        .join('\n')
    }
    case 'list': {
      if (!state.lastRun) {
        return '还没有扫描结果。要先说「扫描痛点」或 /扫描痛点。'
      }
      if (listed.length === 0) {
        const pipeline = watching > 0 ? `观察管线里还有 ${watching} 条。` : ''
        return [`今天没有够痛的新帖。不会拿昨天的热帖来凑。`, pipeline].filter(Boolean).join('')
      }
      const top = listed[0]
      return withNamedFirst(
        text,
        '评估 idea',
        top ? `今日最值得看的是 **${top.title}**，综合 ${top.composite}。` : null,
        [`今日热榜 **${listed.length}** 条：`, '', formatIdeaTable(listed)].join('\n'),
      )
    }
    default: {
      const exhaustive: never = focus
      return exhaustive
    }
  }
}

export function pipelineIdeas(ideas: ProductIdea[]): ProductIdea[] {
  return ideas.filter((idea) => idea.status === 'watching' || idea.status === 'building' || idea.status === 'parked')
}

export function kpis(state: Pick<MicroSourcingState, 'signals' | 'ideas' | 'lastRun'>): {
  signals: number
  ideas: number
  watching: number
  building: number
  pay: number
  scannedOn: string
} {
  return {
    signals: state.signals.length,
    ideas: state.ideas.filter((idea) => idea.status !== 'dismissed').length,
    watching: state.ideas.filter((idea) => idea.status === 'watching').length,
    building: state.ideas.filter((idea) => idea.status === 'building').length,
    pay: state.signals.filter((signal) => signal.paySignal).length,
    scannedOn: state.lastRun ? dayKey(new Date(state.lastRun.at)) : '尚未扫描',
  }
}

export function applyIdeaPatch(
  ideas: ProductIdea[],
  id: string,
  patch: { status?: IdeaStatus; note?: string },
): ProductIdea[] {
  return ideas.map((idea) => {
    if (idea.id !== id) {
      return idea
    }
    return {
      ...idea,
      status: patch.status ?? idea.status,
      note: patch.note ?? idea.note,
    }
  })
}

export function emptyMicroState(): MicroSourcingState {
  return {
    settings: { ...DEFAULT_MICRO_SETTINGS, domains: { ...DEFAULT_MICRO_SETTINGS.domains } },
    signals: [],
    ideas: [],
    lastRun: null,
    scanning: false,
    lastError: null,
  }
}

export function normalizeProxyUrl(value: string): string {
  const raw = value.trim()
  if (!raw) {
    return ''
  }
  if (/^(https?|socks5h?|socks4):\/\//i.test(raw)) {
    return raw.replace(/\/+$/, '')
  }
  if (/^[\w.-]+:\d{2,5}$/.test(raw)) {
    return `http://${raw}`
  }
  return ''
}

export function resolveScanProxy(
  settingsProxy: string,
  env: Record<string, string | undefined> = process.env,
): string {
  return normalizeProxyUrl(
    settingsProxy ||
      env.HTTPS_PROXY ||
      env.HTTP_PROXY ||
      env.ALL_PROXY ||
      env.https_proxy ||
      env.http_proxy ||
      env.all_proxy ||
      '',
  )
}

export function proxyListenTarget(proxyUrl: string): { host: string; port: number } | null {
  const normalized = normalizeProxyUrl(proxyUrl)
  if (!normalized) {
    return null
  }
  try {
    const parsed = new URL(normalized)
    const port = parsed.port
      ? Number(parsed.port)
      : parsed.protocol === 'https:'
        ? 443
        : parsed.protocol === 'http:'
          ? 80
          : Number.NaN
    if (!parsed.hostname || !Number.isInteger(port) || port <= 0 || port > 65_535) {
      return null
    }
    return { host: parsed.hostname, port }
  } catch {
    return null
  }
}

export function isProxyConnectionFailed(message: string): boolean {
  const text = message.toLowerCase()
  return (
    text.includes('err_proxy_connection_failed') ||
    text.includes('err_proxy_connection_refused') ||
    text.includes('err_socks_connection_failed') ||
    text.includes('err_tunnel_connection_failed')
  )
}

export function pickScanProxy(
  settingsProxy: string,
  probeOk: boolean,
  env: Record<string, string | undefined> = process.env,
): string {
  const resolved = resolveScanProxy(settingsProxy, env)
  return resolved && probeOk ? resolved : ''
}
