import { markdownTable } from './chat-markdown.ts'
import { pinByIds } from './listing.ts'
import { shouldPickFromData, withNamedFirst } from './read-answer.ts'
import { latestMetricsForDraft, SOCIAL_PLATFORMS, type SocialMetricsInput, type SocialState } from './social.ts'

export function pickIndexed<T>(
  items: readonly T[],
  text: string,
  options?: { pinnedIds?: readonly string[]; idOf?: (item: T) => string },
): { item: T; index: number } | { needle: string } | { kind: 'list' } {
  const pool =
    options?.pinnedIds?.length && options.idOf
      ? pinByIds(items, options.pinnedIds, options.idOf)
      : [...items]
  const ordinal = text.match(/第\s*([一二三四五六七八九十\d]+)\s*条?/)
  if (ordinal?.[1]) {
    const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
    const index = map[ordinal[1]] ?? Number(ordinal[1])
    const item = pool[index - 1]
    return item ? { item, index } : { needle: `第${index}条` }
  }
  return { kind: 'list' }
}

export function formatAmmoLoad(state: SocialState): string {
  if (state.generated <= 0) {
    return '没有新的产品能力可写。先到「工作情况」登记站点，或打开弹药面板查看已有文案。'
  }
  const shown = state.drafts.slice(0, state.generated)
  return [
    `已装填 **${state.generated}** 条弹药${state.usedModel ? '（模型润色）' : ''}。`,
    '',
    markdownTable(
      ['#', '平台', '标题'],
      shown.map((draft, index) => [
        String(index + 1),
        SOCIAL_PLATFORMS.find((item) => item.id === draft.platform)?.name ?? draft.platform,
        draft.title,
      ]),
    ),
  ].join('\n')
}

export function formatAmmoRecap(state: SocialState, text = ''): string {
  const hot = state.drafts.filter((draft) => {
    if (!draft.publishedAt) {
      return false
    }
    const metrics = latestMetricsForDraft(state.metrics, draft.id)
    return (metrics?.comments ?? 0) > 0
  })
  if (hot.length === 0) {
    return '没有带评论的已发稿，不拿未发草稿充数。'
  }
  const ranked = [...hot].sort((left, right) => {
    const leftMetrics = latestMetricsForDraft(state.metrics, left.id)
    const rightMetrics = latestMetricsForDraft(state.metrics, right.id)
    return (rightMetrics?.comments ?? 0) - (leftMetrics?.comments ?? 0) || (rightMetrics?.likes ?? 0) - (leftMetrics?.likes ?? 0)
  })
  const shown = shouldPickFromData(text, '复盘热帖') ? ranked : hot
  const top = ranked[0]
  const topMetrics = top ? latestMetricsForDraft(state.metrics, top.id) : null
  return withNamedFirst(
    text,
    '复盘热帖',
    top ? `最热的是 **${top.title}**，${topMetrics?.comments ?? 0} 评 ${topMetrics?.likes ?? 0} 赞。` : null,
    [
      `复盘热帖 **${hot.length}** 条：`,
      '',
      markdownTable(
        ['#', '稿', '评', '赞'],
        shown.slice(0, 8).map((draft, index) => {
          const metrics = latestMetricsForDraft(state.metrics, draft.id)
          return [String(index + 1), draft.title, String(metrics?.comments ?? 0), String(metrics?.likes ?? 0)]
        }),
      ),
    ].join('\n'),
  )
}

export function parsePublish(
  text: string,
  drafts: SocialState['drafts'],
  pinnedIds?: readonly string[],
): { id?: string; url?: string; reply: string } {
  const url = text.match(/https?:\/\/\S+/)?.[0]
  const unpublished = drafts.filter((draft) => !draft.publishedAt)
  const picked = pickIndexed(unpublished.length > 0 ? unpublished : drafts, text, { pinnedIds, idOf: (item) => item.id })
  if (!url) {
    return { reply: '发布登记需要一条已发链接，加上第几条弹药。' }
  }
  if ('needle' in picked || 'kind' in picked) {
    const byTitle = drafts.find((draft) => draft.title && text.includes(draft.title.slice(0, 8)))
    if (byTitle) {
      return { id: byTitle.id, url, reply: `已记下「${byTitle.title}」的发布链接。` }
    }
    return { url, reply: '要对哪一条弹药？说「发布登记 第一条」加链接。' }
  }
  return { id: picked.item.id, url, reply: `已记下「${picked.item.title}」的发布链接。` }
}

export function parseAmmoMetrics(text: string): { input?: Omit<SocialMetricsInput, 'platform' | 'draftId'>; reply?: string } {
  const numberAt = (...labels: string[]): number | undefined => {
    for (const label of labels) {
      const hit = text.match(new RegExp(`${label}\\s*(\\d+)`))
      if (hit?.[1]) {
        return Number(hit[1])
      }
    }
    return undefined
  }
  const views = numberAt('浏览', '曝光', '播放')
  const likes = numberAt('赞', '喜欢')
  const comments = numberAt('评论', '评')
  const shares = numberAt('转发', '分享')
  const saves = numberAt('收藏', '书签')
  if (views == null && likes == null && comments == null && shares == null && saves == null) {
    return { reply: '采集互动要数字，例如「采集互动 第一条 浏览 120 赞 3 评 1」。不写 0 充数。' }
  }
  return {
    input: {
      views: views ?? 0,
      likes: likes ?? 0,
      comments: comments ?? 0,
      shares: shares ?? 0,
      saves: saves ?? 0,
    },
  }
}
