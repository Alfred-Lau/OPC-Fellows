import type { AgentInboxResult, AgentTodoDraft } from './agent-inbox.ts'
import type { ProjectUserStats } from './project-users.ts'
import type { SocialState } from './social.ts'

export interface GitProjectInfo {
  name: string
  dir: string
  isRepo: boolean
  branch: string | null
  lastCommit: string | null
  lastCommitAt: string | null
  dirty: boolean
  /** 未提交的文件数，比单个 dirty 布尔更能说明积压程度。 */
  dirtyCount: number
  ahead: number
  behind: number
  mtime: string | null
}

export interface TrafficDailyPoint {
  date: string
  pageviews: number
  visitors: number
}

export interface TopPagePoint {
  path: string
  pageviews: number
  visitors: number
  /** 上一窗口同一 path 的浏览；单窗口点或不存在时不填。 */
  prevPageviews?: number
  /** 上一窗口同一 path 的访客；单窗口点或不存在时不填。 */
  prevVisitors?: number
  /** (当前-上一)/上一，整数百分比；上一为 0 或缺失时为 null。单窗口点不填。 */
  deltaPct?: number | null
}

export interface VercelAnalytics {
  visitors: number
  pageviews: number
  daily: TrafficDailyPoint[]
  todayPageviews: number
  yesterdayPageviews: number
  deltaPct: number | null
  isGrowing: boolean
  /** 近 7 天 path 聚合（含上一窗口 prev/deltaPct）；老缓存或双窗口拉取失败时为 undefined。 */
  topPages?: TopPagePoint[]
}

/** 项目当前没有流量曲线的原因，供面板直接告知而不是静默留空。 */
export type AnalyticsState = 'ok' | 'disabled' | 'failed' | 'empty'

/** Speed Insights 没数字时的原因；老缓存没有该字段。 */
export type SpeedInsightsState = 'ok' | 'disabled' | 'failed' | 'empty' | 'unsupported'

export interface SpeedCountryPoint {
  country: string
  lcpMs: number | null
  inpMs: number | null
  cls: number | null
  ttfbMs: number | null
  samples: number
}

/** 近 7 天生产环境 P75 Web Vitals。countries 按样本数降序。 */
export interface VercelSpeedInsights {
  lcpMs: number | null
  inpMs: number | null
  cls: number | null
  ttfbMs: number | null
  samples: number
  countries: SpeedCountryPoint[]
}

export interface VercelProjectInfo {
  id: string
  name: string
  url: string | null
  state: string
  updatedAt: number | null
  lastCommitMessage: string | null
  lastCommitRef: string | null
  hasAnalytics: boolean
  analyticsState: AnalyticsState
  analytics: VercelAnalytics | null
  hasSpeedInsights: boolean
  speedInsightsState?: SpeedInsightsState
  speedInsights?: VercelSpeedInsights | null
  /** 是否有过生产部署；无部署的项目仍会列出，但归到「从未上线」。 */
  hasProduction: boolean
  users: ProjectUserStats | null
}

/**
 * 生产部署失败多久之内还值得追。
 * 账号里躺着不少一两年前就废弃的项目，它们的最后一次部署永远是 ERROR，
 * 不设窗口的话会把真正的新故障挤出待办和列表首屏。
 */
export const FAILURE_FRESH_DAYS = 14

export function isFreshFailure(
  project: Pick<VercelProjectInfo, 'state' | 'updatedAt'>,
  now: number = Date.now(),
): boolean {
  if (project.state !== 'ERROR' || !project.updatedAt) {
    return false
  }
  return now - project.updatedAt <= FAILURE_FRESH_DAYS * 86400000
}

export interface VercelAlertInfo {
  id: string
  title: string
  type: string
  status: string
  startedAt: string | null
  endedAt: string | null
  summary: string | null
}

/** 一次 /api/stats 采集记录。数值放在 stats 里，采集结果放在 error/skipped。 */
export interface ProductStatsRow {
  productId: string
  productName: string
  origin: string
  stats: ProjectUserStats
  fetchedAt: string
  error: string | null
  /** 站点侧尚未实现或域名未部署，本轮主动跳过，不算失败。 */
  skipped: boolean
}

export interface MonitorSnapshot {
  projects: GitProjectInfo[]
  vercel: {
    contextName: string
    projects: VercelProjectInfo[]
    alerts: VercelAlertInfo[]
    fetchedAt: string
    error: string | null
  }
  userStats: ProductStatsRow[]
  /** True when OWNWORKBUDDY_STATS_KEY is not set; stats poll was skipped. */
  userStatsKeyMissing: boolean
}

export interface MonitorRefreshResult {
  snapshot: MonitorSnapshot
  social: SocialState
  proposals: AgentTodoDraft[]
  inbox: AgentInboxResult
}

/**
 * 上一轮采集的留存副本，供打开面板时立即上屏，避免先看到空壳。
 * 不含 inbox：那是「这一次入库了什么」的结果，重放会造成误解。
 */
export interface MonitorCache {
  snapshot: MonitorSnapshot
  social: SocialState
  proposals: AgentTodoDraft[]
  cachedAt: string
}
