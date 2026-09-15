export const SOCIAL_AGENT_ID = 'social-ammo'

export const SOCIAL_PLATFORMS = [
  {
    id: 'x',
    name: 'X',
    region: 'overseas',
    format: '短帖 280 / Premium 长帖 25,000 / Articles',
    metricLabels: { views: '曝光', likes: '喜欢', comments: '回复', shares: '转发', saves: '书签' },
  },
  {
    id: 'youtube',
    name: 'YouTube',
    region: 'overseas',
    format: 'Shorts ≤3 分钟竖屏 / 长视频标题+描述',
    metricLabels: { views: '观看', likes: '赞', comments: '评论', shares: '分享', saves: '收藏' },
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    region: 'overseas',
    format: '信息流 3,000 字 / 前 210 字钩子 / PDF 轮播',
    metricLabels: { views: '曝光', likes: '反应', comments: '评论', shares: '转发', saves: '收藏' },
  },
  {
    id: 'xiaohongshu',
    name: '小红书',
    region: 'domestic',
    format: '标题 20 字 / 图文 1000 / 长文 6000 / 标签 ≤10',
    metricLabels: { views: '浏览', likes: '点赞', comments: '评论', shares: '分享', saves: '收藏' },
  },
  {
    id: 'channels',
    name: '视频号',
    region: 'domestic',
    format: '竖屏口播 15–60 秒 / 封面字 / 简介话题',
    metricLabels: { views: '播放', likes: '点赞', comments: '评论', shares: '转发', saves: '收藏' },
  },
  {
    id: 'douyin',
    name: '抖音',
    region: 'domestic',
    format: '标题 60 字 / 黄金 3 秒 / 短视频+长图文',
    metricLabels: { views: '播放', likes: '点赞', comments: '评论', shares: '分享', saves: '收藏' },
  },
] as const

export type SocialPlatformId = (typeof SOCIAL_PLATFORMS)[number]['id']
export type SocialRegion = (typeof SOCIAL_PLATFORMS)[number]['region']

export interface SocialDraft {
  id: string
  fingerprint: string
  platform: SocialPlatformId
  productId: string
  productName: string
  productUrl: string
  featureTitle: string
  format: string
  title: string
  body: string
  outline: string
  tags: string[]
  mediaBrief: string
  /** Idea → Ammo 只存指针。源关掉后不再装填这一条。 */
  ideaId?: string
  createdAt: string
  publishedAt: string | null
  publishedUrl: string | null
}

export interface SocialDraftInput {
  fingerprint: string
  platform: SocialPlatformId
  productId: string
  productName: string
  productUrl: string
  featureTitle: string
  format: string
  title: string
  body: string
  outline: string
  tags: string[]
  mediaBrief: string
  ideaId?: string
}

export interface SocialMetrics {
  id: string
  draftId: string | null
  platform: SocialPlatformId
  recordedAt: string
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
}

export interface SocialMetricsInput {
  draftId?: string | null
  platform: SocialPlatformId
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
}

export interface SocialPlatformStats {
  platform: SocialPlatformId
  unpublished: number
  published: number
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
  stale: boolean
}

export interface SocialState {
  drafts: SocialDraft[]
  metrics: SocialMetrics[]
  stats: SocialPlatformStats[]
  generated: number
  usedModel: boolean
}

export function socialPlatform(id: SocialPlatformId): (typeof SOCIAL_PLATFORMS)[number] {
  const found = SOCIAL_PLATFORMS.find((item) => item.id === id)
  if (!found) {
    throw new Error(`unknown platform ${id}`)
  }
  return found
}

export function isSocialPlatformId(value: unknown): value is SocialPlatformId {
  return typeof value === 'string' && SOCIAL_PLATFORMS.some((item) => item.id === value)
}

export function packSocialDraft(draft: SocialDraft): string {
  const platform = socialPlatform(draft.platform)
  const tags = draft.tags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)).join(' ')
  return [
    `【${platform.name} · ${draft.format}】${draft.productName}`,
    draft.title ? `标题：${draft.title}` : '',
    '',
    draft.body,
    '',
    draft.outline ? `提纲：\n${draft.outline}` : '',
    tags ? `标签：${tags}` : '',
    `配图/拍摄：${draft.mediaBrief}`,
    draft.productUrl,
  ]
    .filter((line) => line !== '')
    .join('\n')
}

export function summarizeSocial(drafts: SocialDraft[], metrics: SocialMetrics[], now = new Date()): SocialPlatformStats[] {
  const cutoff = now.getTime() - 48 * 60 * 60 * 1000
  return SOCIAL_PLATFORMS.map((platform) => {
    const items = drafts.filter((draft) => draft.platform === platform.id)
    const published = items.filter((draft) => draft.publishedAt)
    const latestByKey = new Map<string, SocialMetrics>()
    for (const row of metrics) {
      if (row.platform !== platform.id) {
        continue
      }
      const key = row.draftId ?? `platform:${row.platform}`
      const existing = latestByKey.get(key)
      if (!existing || existing.recordedAt < row.recordedAt) {
        latestByKey.set(key, row)
      }
    }
    const perDraft = [...latestByKey.entries()].filter(([key]) => !key.startsWith('platform:')).map(([, row]) => row)
    const rollup = latestByKey.get(`platform:${platform.id}`)
    const source = perDraft.length > 0 ? perDraft : rollup ? [rollup] : []
    const totals = source.reduce(
      (acc, row) => ({
        views: acc.views + row.views,
        likes: acc.likes + row.likes,
        comments: acc.comments + row.comments,
        shares: acc.shares + row.shares,
        saves: acc.saves + row.saves,
      }),
      { views: 0, likes: 0, comments: 0, shares: 0, saves: 0 },
    )
    const stale = published.some((draft) => {
      const latest = latestByKey.get(draft.id)
      if (!latest) {
        return Date.parse(draft.publishedAt ?? '') < cutoff
      }
      return Date.parse(latest.recordedAt) < cutoff
    })
    return {
      platform: platform.id,
      unpublished: items.length - published.length,
      published: published.length,
      ...totals,
      stale,
    }
  })
}

export function latestMetricsForDraft(metrics: SocialMetrics[], draftId: string): SocialMetrics | null {
  return metrics
    .filter((row) => row.draftId === draftId)
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))[0] ?? null
}
