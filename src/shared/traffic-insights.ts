import type { TopPagePoint, TrafficDailyPoint, VercelAlertInfo, VercelProjectInfo } from './monitor.ts'

/** 一条归因。weight 越大越值得先说，用于凑够条数时挑最有信息量的。 */
interface Reason {
  text: string
  weight: number
}

export type TrafficDirection = 'up' | 'down'

export interface TrafficInsight {
  projectId: string
  name: string
  direction: TrafficDirection
  todayPageviews: number
  yesterdayPageviews: number
  deltaPct: number | null
  /** 该站点今日浏览占全站的百分比，用于判断这次涨跌重不重要。 */
  sharePct: number
  /** 至少两条，按信息量降序。 */
  reasons: string[]
}

export interface TrafficInsightReport {
  totalToday: number
  totalYesterday: number
  totalDeltaPct: number | null
  siteCount: number
  up: TrafficInsight[]
  down: TrafficInsight[]
  /** 一句话总结，供面板顶部直接用。 */
  headline: string
}

/** 每个方向最少给这么多条归因，不足时用兜底口径补齐。 */
export const MIN_REASONS = 2

/** 低于这个量级的涨跌更可能是噪音，归因里要点明。 */
const SMALL_BASE = 20

const RECENT_DEPLOY_DAYS = 3

/** 双窗口总增量低于这个量级时，页面归因噪声太大，不强行点名。 */
const PAGE_DELTA_MIN = 10

/** 贡献最大的 path 占同向总增量不到这个比例，视为分布太散。 */
const PAGE_SHARE_MIN = 0.2

/** 页面归因比日曲线/部署更贴近「现在在变什么」，排在前面。 */
const PAGE_REASON_WEIGHT = 97

function pct(from: number, to: number): number | null {
  if (from <= 0) return null
  return Math.round(((to - from) / from) * 100)
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/** 末尾连续同向的天数，含今日。 */
function streakDays(daily: TrafficDailyPoint[], direction: TrafficDirection): number {
  let count = 0
  for (let i = daily.length - 1; i > 0; i -= 1) {
    const today = daily[i].pageviews
    const prev = daily[i - 1].pageviews
    const sameWay = direction === 'up' ? today > prev : today < prev
    if (!sameWay) break
    count += 1
  }
  return count
}

function perVisitor(point: TrafficDailyPoint | undefined): number | null {
  if (!point || point.visitors <= 0) return null
  return Math.round((point.pageviews / point.visitors) * 10) / 10
}

function displayPath(path: string): string {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

function pageWindowDelta(point: TopPagePoint): number {
  return point.pageviews - (point.prevPageviews ?? 0)
}

/** 近 7 天 vs 再前 7 天的页面涨跌；增量过小或太散时不输出。 */
function collectPageReasons(pages: TopPagePoint[] | undefined, direction: TrafficDirection): Reason[] {
  if (!pages || pages.length === 0) return []
  const scored = pages.map((point) => ({ point, delta: pageWindowDelta(point) }))
  if (direction === 'up') {
    const gains = scored.filter((item) => item.delta > 0)
    const total = gains.reduce((sum, item) => sum + item.delta, 0)
    if (total < PAGE_DELTA_MIN) return []
    const best = gains.reduce((lead, item) => (item.delta > lead.delta ? item : lead))
    if (best.delta / total < PAGE_SHARE_MIN) return []
    return [
      {
        text: `近 7 天增量主要来自 ${displayPath(best.point.path)}(+${best.delta} 次)`,
        weight: PAGE_REASON_WEIGHT,
      },
    ]
  }
  const drops = scored.filter((item) => item.delta < 0)
  const total = drops.reduce((sum, item) => sum + item.delta, 0)
  if (Math.abs(total) < PAGE_DELTA_MIN) return []
  const worst = drops.reduce((lead, item) => (item.delta < lead.delta ? item : lead))
  if (Math.abs(worst.delta) / Math.abs(total) < PAGE_SHARE_MIN) return []
  return [
    {
      text: `${displayPath(worst.point.path)} 掉了 ${Math.abs(worst.delta)} 次，拖累整体`,
      weight: PAGE_REASON_WEIGHT,
    },
  ]
}

/** 归因全部来自已有数据：日曲线、部署时间、报警、用户数，不做无根据推测。 */
function collectReasons(
  project: VercelProjectInfo,
  direction: TrafficDirection,
  sharePct: number,
  alerts: VercelAlertInfo[],
  now: number,
): string[] {
  const a = project.analytics
  if (!a) return []
  const daily = a.daily
  const today = a.todayPageviews
  const yesterday = a.yesterdayPageviews
  const reasons: Reason[] = []
  const rising = direction === 'up'

  reasons.push(...collectPageReasons(a.topPages, direction))

  const streak = streakDays(daily, direction)
  if (streak >= 2) {
    reasons.push({
      text: `已连续 ${streak} 天${rising ? '走高' : '走低'}，不是单日抖动`,
      weight: 90,
    })
  } else {
    reasons.push({
      text: `仅今日单日${rising ? '走高' : '回落'}，前一日方向相反，先观察一天`,
      weight: 40,
    })
  }

  // 今日相对近 7 日与近 30 日均值的位置。
  const recent = daily.slice(-8, -1).map((d) => d.pageviews)
  const weekMean = Math.round(mean(recent))
  if (weekMean > 0) {
    const vsWeek = pct(weekMean, today)
    if (vsWeek !== null && Math.abs(vsWeek) >= 10) {
      reasons.push({
        text: `今日 ${today} 次，比近 7 日均值 ${weekMean} 次${vsWeek > 0 ? '高' : '低'} ${Math.abs(vsWeek)}%`,
        weight: 85,
      })
    } else if (vsWeek !== null) {
      reasons.push({
        text: `今日 ${today} 次仍贴近近 7 日均值 ${weekMean} 次，整体水位没变`,
        weight: 55,
      })
    }
  }

  // 是否创造了区间新高/新低。
  const window = daily.slice(-30, -1).map((d) => d.pageviews)
  if (window.length >= 7) {
    const peak = Math.max(...window)
    const floor = Math.min(...window)
    if (rising && today > peak) {
      reasons.push({ text: `刷新近 ${window.length} 天最高，此前峰值 ${peak} 次`, weight: 95 })
    }
    if (!rising && today < floor) {
      reasons.push({ text: `跌破近 ${window.length} 天最低，此前谷值 ${floor} 次`, weight: 95 })
    }
  }

  // 与上周同一天对比，排掉工作日/周末的周期性影响。
  const sameWeekday = daily[daily.length - 8]
  if (sameWeekday && sameWeekday.pageviews > 0) {
    const vsLastWeek = pct(sameWeekday.pageviews, today)
    if (vsLastWeek !== null) {
      reasons.push({
        text: `较上周同一天（${sameWeekday.date} 的 ${sameWeekday.pageviews} 次）${
          vsLastWeek >= 0 ? '增' : '减'
        } ${Math.abs(vsLastWeek)}%，排除了周内周期影响`,
        weight: 80,
      })
    }
  }

  // 人均页面数区分「来的人多了」和「同一批人翻得更深」。
  const todayPoint = daily[daily.length - 1]
  const yesterdayPoint = daily[daily.length - 2]
  const depthToday = perVisitor(todayPoint)
  const depthYesterday = perVisitor(yesterdayPoint)
  if (depthToday !== null && depthYesterday !== null && todayPoint && yesterdayPoint) {
    const visitorDelta = pct(yesterdayPoint.visitors, todayPoint.visitors)
    if (depthToday > depthYesterday + 0.3) {
      reasons.push({
        text: `人均看 ${depthToday} 页（昨日 ${depthYesterday} 页），访客数${
          visitorDelta !== null ? `${visitorDelta >= 0 ? '增' : '减'} ${Math.abs(visitorDelta)}%` : '基本持平'
        }，变化来自浏览更深而非纯拉新`,
        weight: 88,
      })
    } else if (depthToday < depthYesterday - 0.3) {
      reasons.push({
        text: `人均看 ${depthToday} 页（昨日 ${depthYesterday} 页），来的人更多但看得更浅，多为一次性到访`,
        weight: 88,
      })
    } else if (visitorDelta !== null && Math.abs(visitorDelta) >= 10) {
      reasons.push({
        text: `访客数${visitorDelta > 0 ? '增' : '减'} ${Math.abs(visitorDelta)}%、人均页数持平在 ${depthToday} 页，是访客量本身在变`,
        weight: 82,
      })
    }
  }

  // 近期生产部署是最常见的直接原因。
  if (project.updatedAt) {
    const days = (now - project.updatedAt) / 86400000
    if (days <= RECENT_DEPLOY_DAYS) {
      const when = days < 1 ? '今天' : `${Math.round(days)} 天前`
      const commit = project.lastCommitMessage ? `：${project.lastCommitMessage}` : ''
      reasons.push({
        text: `${when}刚有一次生产部署${commit}，时间点与这次${rising ? '增长' : '回落'}吻合`,
        weight: 92,
      })
    }
  }

  if (project.state === 'ERROR') {
    reasons.push({
      text: '最后一次生产部署是失败的，线上可能仍是旧版本',
      weight: 93,
    })
  }

  const related = alerts.filter(
    (alert) => !alert.endedAt && (alert.summary ?? '').includes(project.name),
  )
  if (related.length > 0) {
    reasons.push({
      text: `有未恢复报警「${related[0].title}」指向该站点，可能已影响可用性`,
      weight: 96,
    })
  }

  // 基数小的时候百分比很容易骗人，必须点明。
  if (Math.max(today, yesterday) < SMALL_BASE) {
    reasons.push({
      text: `基数偏小（今日 ${today} 次、昨日 ${yesterday} 次），百分比波动放大，别过度解读`,
      weight: 70,
    })
  }

  reasons.push({
    text: `占今日全站浏览的 ${sharePct}%，${sharePct >= 30 ? '足以带动整体走向' : '对整体影响有限'}`,
    weight: 50,
  })

  if (project.users?.available) {
    const registered = project.users.registered ?? 0
    const paid = project.users.paid ?? 0
    reasons.push({
      text: `后台侧注册 ${registered} · 付费 ${paid}，可对照这波流量有没有转化`,
      weight: 45,
    })
  }

  return reasons
    .sort((left, right) => right.weight - left.weight)
    .map((item) => item.text)
}

function buildInsight(
  project: VercelProjectInfo,
  direction: TrafficDirection,
  totalToday: number,
  alerts: VercelAlertInfo[],
  now: number,
): TrafficInsight {
  const a = project.analytics
  const today = a?.todayPageviews ?? 0
  const sharePct = totalToday > 0 ? Math.round((today / totalToday) * 100) : 0
  return {
    projectId: project.id,
    name: project.name,
    direction,
    todayPageviews: today,
    yesterdayPageviews: a?.yesterdayPageviews ?? 0,
    deltaPct: a?.deltaPct ?? null,
    sharePct,
    reasons: collectReasons(project, direction, sharePct, alerts, now),
  }
}

export function buildTrafficInsights(
  projects: VercelProjectInfo[],
  alerts: VercelAlertInfo[] = [],
  now: number = Date.now(),
): TrafficInsightReport {
  const withData = projects.filter((p) => p.analytics && p.hasAnalytics)
  const totalToday = withData.reduce((sum, p) => sum + (p.analytics?.todayPageviews ?? 0), 0)
  const totalYesterday = withData.reduce((sum, p) => sum + (p.analytics?.yesterdayPageviews ?? 0), 0)
  const totalDeltaPct = pct(totalYesterday, totalToday)

  const up: TrafficInsight[] = []
  const down: TrafficInsight[] = []
  for (const project of withData) {
    const a = project.analytics
    if (!a) continue
    if (a.todayPageviews > a.yesterdayPageviews) {
      up.push(buildInsight(project, 'up', totalToday, alerts, now))
    } else if (a.todayPageviews < a.yesterdayPageviews) {
      down.push(buildInsight(project, 'down', totalToday, alerts, now))
    }
  }

  const byImpact = (left: TrafficInsight, right: TrafficInsight): number =>
    Math.abs(right.todayPageviews - right.yesterdayPageviews) -
    Math.abs(left.todayPageviews - left.yesterdayPageviews)
  up.sort(byImpact)
  down.sort(byImpact)

  return {
    totalToday,
    totalYesterday,
    totalDeltaPct,
    siteCount: withData.length,
    up,
    down,
    headline: headlineOf(totalToday, totalDeltaPct, withData.length, up, down),
  }
}

function headlineOf(
  totalToday: number,
  totalDeltaPct: number | null,
  siteCount: number,
  up: TrafficInsight[],
  down: TrafficInsight[],
): string {
  if (siteCount === 0) {
    return '还没有站点回传流量数据'
  }
  const scale = `今日 ${siteCount} 个站点共 ${totalToday} 次浏览`
  const move =
    totalDeltaPct === null
      ? ''
      : `，较昨日 ${totalDeltaPct > 0 ? '+' : ''}${totalDeltaPct}%`
  if (up.length === 0 && down.length === 0) {
    return `${scale}${move}，各站与昨日持平`
  }
  const parts: string[] = []
  if (up.length > 0) {
    parts.push(`${up.length} 个站点上涨（${up[0].name} 领涨）`)
  }
  if (down.length > 0) {
    parts.push(`${down.length} 个站点回落（${down[0].name} 拖累最大）`)
  }
  return `${scale}${move}，${parts.join('、')}`
}
