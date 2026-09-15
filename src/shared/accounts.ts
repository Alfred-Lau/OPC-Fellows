export const ACCOUNT_PLATFORMS = [
  {
    id: 'xiaohongshu',
    name: '小红书',
    mark: '红',
    formatHint: '标题 20 字 / 图文 1000 / 长文 6000',
    metricLabels: { views: '浏览', likes: '点赞', comments: '评论', shares: '分享', saves: '收藏', followers: '粉丝' },
  },
  {
    id: 'channels',
    name: '视频号',
    mark: '视',
    formatHint: '竖屏口播 15–60 秒 / 封面字',
    metricLabels: { views: '播放', likes: '点赞', comments: '评论', shares: '转发', saves: '收藏', followers: '粉丝' },
  },
  {
    id: 'douyin',
    name: '抖音',
    mark: '抖',
    formatHint: '标题 60 字 / 黄金 3 秒',
    metricLabels: { views: '播放', likes: '点赞', comments: '评论', shares: '分享', saves: '收藏', followers: '粉丝' },
  },
] as const

export const POST_FORMATS = ['短视频', '图文', '直播', '长文'] as const

export type AccountPlatformId = (typeof ACCOUNT_PLATFORMS)[number]['id']
export type PostFormat = (typeof POST_FORMATS)[number]

export interface SocialAccount {
  id: string
  platform: AccountPlatformId
  name: string
  handle: string
  note: string
  createdAt: string
}

export interface SocialAccountInput {
  id?: string
  platform: AccountPlatformId
  name: string
  handle?: string
  note?: string
}

export interface AccountMaterial {
  id: string
  title: string
  summary: string
  productId: string
  createdAt: string
}

export interface AccountMaterialInput {
  id?: string
  title: string
  summary?: string
  productId?: string
}

export interface AccountPost {
  id: string
  title: string
  body: string
  url: string
  format: PostFormat
}

export interface AccountPostInput {
  title: string
  body?: string
  url?: string
  format?: string
}

export interface DayMetrics {
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
  followers: number
}

export interface AccountDayLog {
  id: string
  accountId: string
  date: string
  posts: AccountPost[]
  metrics: DayMetrics
  materialIds: string[]
  updatedAt: string
}

export interface AccountsState {
  accounts: SocialAccount[]
  materials: AccountMaterial[]
  logs: AccountDayLog[]
}

export function accountPlatform(id: AccountPlatformId): (typeof ACCOUNT_PLATFORMS)[number] {
  const found = ACCOUNT_PLATFORMS.find((item) => item.id === id)
  if (!found) {
    throw new Error(`unknown account platform ${id}`)
  }
  return found
}

export function isAccountPlatformId(value: unknown): value is AccountPlatformId {
  return typeof value === 'string' && ACCOUNT_PLATFORMS.some((item) => item.id === value)
}

export function isPostFormat(value: unknown): value is PostFormat {
  return typeof value === 'string' && POST_FORMATS.some((item) => item === value)
}

export function emptyMetrics(): DayMetrics {
  return { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, followers: 0 }
}

export function clampMetric(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0) {
    return 0
  }
  return Math.round(n)
}

export function normalizeMetrics(raw: Partial<DayMetrics> | null | undefined): DayMetrics {
  const base = emptyMetrics()
  if (!raw) {
    return base
  }
  return {
    views: clampMetric(raw.views),
    likes: clampMetric(raw.likes),
    comments: clampMetric(raw.comments),
    shares: clampMetric(raw.shares),
    saves: clampMetric(raw.saves),
    followers: clampMetric(raw.followers),
  }
}

export function hasMetrics(metrics: DayMetrics): boolean {
  return (
    metrics.views > 0 ||
    metrics.likes > 0 ||
    metrics.comments > 0 ||
    metrics.shares > 0 ||
    metrics.saves > 0 ||
    metrics.followers > 0
  )
}

export function logHasActivity(log: AccountDayLog | null | undefined): boolean {
  if (!log) {
    return false
  }
  return log.posts.length > 0 || hasMetrics(log.metrics) || log.materialIds.length > 0
}

export function findDayLog(logs: AccountDayLog[], accountId: string, date: string): AccountDayLog | null {
  return logs.find((item) => item.accountId === accountId && item.date === date) ?? null
}

export function shiftDay(date: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) {
    return date
  }
  const next = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days)
  const y = next.getFullYear()
  const m = String(next.getMonth() + 1).padStart(2, '0')
  const d = String(next.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function dateStrip(anchor: string, span = 14): string[] {
  const start = shiftDay(anchor, -(span - 1))
  return Array.from({ length: span }, (_, index) => shiftDay(start, index))
}

export interface AccountDigest {
  todayPosts: number
  todayViews: number
  lastActive: string | null
}

export function accountDigest(accountId: string, logs: AccountDayLog[], today: string): AccountDigest {
  const mine = logs.filter((item) => item.accountId === accountId && logHasActivity(item))
  const todayLog = mine.find((item) => item.date === today)
  const last = [...mine].sort((left, right) => right.date.localeCompare(left.date))[0]
  return {
    todayPosts: todayLog?.posts.length ?? 0,
    todayViews: todayLog?.metrics.views ?? 0,
    lastActive: last?.date ?? null,
  }
}

export function linkedMaterials(materials: AccountMaterial[], ids: string[]): AccountMaterial[] {
  const wanted = new Set(ids)
  return materials.filter((item) => wanted.has(item.id))
}

export function accountsByPlatform(accounts: SocialAccount[], platform: AccountPlatformId | 'all'): SocialAccount[] {
  const filtered = platform === 'all' ? accounts : accounts.filter((item) => item.platform === platform)
  return [...filtered].sort((left, right) => {
    if (left.platform !== right.platform) {
      return ACCOUNT_PLATFORMS.findIndex((item) => item.id === left.platform) -
        ACCOUNT_PLATFORMS.findIndex((item) => item.id === right.platform)
    }
    return left.name.localeCompare(right.name, 'zh')
  })
}
