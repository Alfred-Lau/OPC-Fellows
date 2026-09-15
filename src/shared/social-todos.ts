import type { AgentTodoDraft } from './agent-inbox.ts'
import { dayKey, toIsoLocal, tomorrowMorning } from './datetime.ts'
import { latestMetricsForDraft, type SocialDraft, type SocialMetrics, type SocialState } from './social.ts'
import { getProjectTag } from './tags.ts'

const MAX_SOCIAL_TODOS = 4
const STALE_HOURS = 48

export function proposeSocialTodos(state: Pick<SocialState, 'drafts' | 'metrics'>, now = new Date()): AgentTodoDraft[] {
  const notifyAt = toIsoLocal(tomorrowMorning(now))
  const stamp = dayKey(tomorrowMorning(now))
  const drafts: AgentTodoDraft[] = []

  const unpublished = state.drafts.filter((item) => !item.publishedAt)
  const overseas = unpublished.find((item) => item.platform === 'x' || item.platform === 'youtube' || item.platform === 'linkedin')
  const domestic = unpublished.find(
    (item) => item.platform === 'xiaohongshu' || item.platform === 'channels' || item.platform === 'douyin',
  )
  if (overseas) {
    drafts.push(
      tagged({
        title: `发布 ${overseas.productName} 海外社媒（X / YouTube / LinkedIn）`,
        note: overseas.featureTitle,
        notifyAt,
        dedupeKey: `monitor:social-publish-overseas:${overseas.productId}:${stamp}`,
      }),
    )
  }
  if (domestic) {
    drafts.push(
      tagged({
        title: `发布 ${domestic.productName} 国内社媒（小红书 / 视频号 / 抖音）`,
        note: domestic.featureTitle,
        notifyAt,
        dedupeKey: `monitor:social-publish-domestic:${domestic.productId}:${stamp}`,
      }),
    )
  }

  const stale = stalePublished(state.drafts, state.metrics, now)
  if (stale) {
    drafts.push(
      tagged({
        title: `采集 ${platformName(stale.platform)} 浏览与互动数据`,
        note: stale.publishedUrl ?? stale.featureTitle,
        notifyAt,
        dedupeKey: `monitor:social-metrics:${stale.platform}:${stamp}`,
      }),
    )
  }

  const hot = state.drafts.find((item) => {
    if (!item.publishedAt) {
      return false
    }
    const latest = latestMetricsForDraft(state.metrics, item.id)
    return (latest?.comments ?? 0) > 0
  })
  if (hot) {
    drafts.push(
      tagged({
        title: `回复 ${platformName(hot.platform)} 上 ${hot.productName} 的评论`,
        note: hot.publishedUrl ?? hot.featureTitle,
        notifyAt,
        dedupeKey: `monitor:social-reply:${hot.platform}:${stamp}`,
      }),
    )
  }

  return drafts.slice(0, MAX_SOCIAL_TODOS)
}

function stalePublished(drafts: SocialDraft[], metrics: SocialMetrics[], now: Date): SocialDraft | undefined {
  const cutoff = now.getTime() - STALE_HOURS * 60 * 60 * 1000
  return drafts.find((item) => {
    if (!item.publishedAt) {
      return false
    }
    const publishedAt = Date.parse(item.publishedAt)
    if (!Number.isFinite(publishedAt) || publishedAt > cutoff) {
      return false
    }
    const latest = latestMetricsForDraft(metrics, item.id)
    if (!latest) {
      return true
    }
    return Date.parse(latest.recordedAt) < cutoff
  })
}

function tagged(draft: Omit<AgentTodoDraft, 'tags'>): AgentTodoDraft {
  return { ...draft, tags: [getProjectTag()] }
}

function platformName(id: SocialDraft['platform']): string {
  switch (id) {
    case 'x':
      return 'X'
    case 'youtube':
      return 'YouTube'
    case 'linkedin':
      return 'LinkedIn'
    case 'xiaohongshu':
      return '小红书'
    case 'channels':
      return '视频号'
    case 'douyin':
      return '抖音'
  }
}
