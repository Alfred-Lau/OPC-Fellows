import type { IpcRegistrar } from '../kernel/main/ipc'
import { execFile } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { ingestTodos } from './todo-ingest'
import { ensureDesktopPath, resolveBinary } from './cli-path'
import { proposeMonitorTodos } from '../shared/monitor-todos'
import { collectFeatures, featureFromIdea, generateSocialCopy } from '../shared/social-copy'
import { isIdeaSourceOpen } from '../shared/micro-sourcing'
import { loadMicroSourcing, microState } from './micro-sourcing-store'
import { isSocialPlatformId, type SocialMetricsInput } from '../shared/social'
import { polishSocialCopy } from './social-copy-llm'
import { loadMonitorCache, saveMonitorCache } from './monitor-cache'
import {
  discardSocialDraft,
  ingestSocialDrafts,
  publishSocialDraft,
  recordSocialMetrics,
  socialState,
} from './social-store'
import { MONITOR_AGENT_ID, getProjectTag } from '../shared/tags'
import type {
  GitProjectInfo,
  MonitorRefreshResult,
  MonitorSnapshot,
  ProductStatsRow,
  TopPagePoint,
  TrafficDailyPoint,
  VercelAlertInfo,
  VercelAnalytics,
  VercelProjectInfo,
} from '../shared/monitor'
import { isWebAnalyticsEnabled } from '../shared/web-analytics'
import { attachSpeedInsights } from './vercel-metrics'
import { getProducts, statsStatusOf } from '../shared/products'
import {
  emptyUserStats,
  originOf,
  parseUserStats,
  statsUrlFor,
  type ProjectUserStats,
} from '../shared/project-users'

const SCAN_DIRS = [join(homedir(), 'workspace'), join(homedir(), 'codezone')]
const ANALYTICS_WINDOW_DAYS = 30
const TOP_PAGES_WINDOW_DAYS = 7

function run(cmd: string, args: string[], timeout = 10000): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      {
        timeout,
        encoding: 'utf-8',
        maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, PATH: ensureDesktopPath() },
      },
      (error, stdout) => {
        resolve(error ? '' : stdout.trim())
      },
    )
  })
}

function resolveVercel(): string | null {
  return resolveBinary('vercel', ['/opt/homebrew/bin/vercel', '/usr/local/bin/vercel'])
}

function parseAheadBehind(sb: string): { ahead: number; behind: number } {
  const match = sb.match(/\[ahead (\d+)(?:, behind (\d+))?\]/)
  if (!match) return { ahead: 0, behind: 0 }
  return { ahead: Number(match[1] ?? 0), behind: Number(match[2] ?? 0) }
}

async function scanGitProject(dir: string): Promise<GitProjectInfo> {
  const name = basename(dir)
  const isRepoRaw = await run('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree'])
  if (isRepoRaw !== 'true') {
    return {
      name,
      dir,
      isRepo: false,
      branch: null,
      lastCommit: null,
      lastCommitAt: null,
      dirty: false,
      dirtyCount: 0,
      ahead: 0,
      behind: 0,
      mtime: null,
    }
  }

  const [branch, log, porcelain, sb] = await Promise.all([
    run('git', ['-C', dir, 'branch', '--show-current']),
    run('git', ['-C', dir, 'log', '-1', '--format=%s%n%ci']),
    run('git', ['-C', dir, 'status', '--porcelain']),
    run('git', ['-C', dir, 'status', '-sb']),
  ])

  const [lastCommit = null, lastCommitAt = null] = log ? log.split('\n') : []
  const { ahead, behind } = parseAheadBehind(sb)
  const dirtyCount = porcelain ? porcelain.split('\n').filter((line) => line.trim()).length : 0

  let mtime: string | null = null
  try {
    mtime = statSync(dir).mtime.toISOString()
  } catch {
    /* ignore */
  }

  return {
    name,
    dir,
    isRepo: true,
    branch: branch || null,
    lastCommit,
    lastCommitAt,
    dirty: dirtyCount > 0,
    dirtyCount,
    ahead,
    behind,
    mtime,
  }
}

async function scanGitProjects(): Promise<GitProjectInfo[]> {
  const dirs: string[] = []
  for (const root of SCAN_DIRS) {
    if (!existsSync(root)) continue
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        dirs.push(join(root, entry.name))
      }
    }
  }
  const settled = await Promise.allSettled(dirs.map((dir) => scanGitProject(dir)))
  return settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
}

/** /v9/projects 里 targets.production 就是该项目最新的生产部署。 */
interface RawProductionTarget {
  url?: string
  readyState?: string
  createdAt?: number
  alias?: string[]
  meta?: {
    githubCommitMessage?: string
    githubCommitRef?: string
  }
}

interface RawProject {
  id?: string
  name?: string
  alias?: string[]
  accountId?: string
  targets?: { production?: RawProductionTarget | null }
  webAnalytics?: {
    id?: string
    enabledAt?: number
    disabledAt?: number
    canceledAt?: number
    hasData?: boolean
  }
  speedInsights?: { hasData?: boolean }
}

function fetchJson(bin: string, args: string[], timeout = 40000): Promise<unknown> {
  return run(bin, args, timeout).then((raw) => {
    if (!raw) return null
    try {
      return JSON.parse(raw) as unknown
    } catch {
      return null
    }
  })
}

function parseProjectList(raw: unknown): RawProject[] {
  if (Array.isArray(raw)) {
    return raw as RawProject[]
  }
  return ((raw as { projects?: RawProject[] } | null)?.projects ?? [])
}

/** 自定义域名优先，退回 vercel.app 域名，最后用部署 URL。 */
function preferredUrl(project: RawProject, target: RawProductionTarget | null): string | null {
  const aliases = [...(target?.alias ?? []), ...(project.alias ?? [])]
  return (
    aliases.find((alias) => alias && !alias.endsWith('.vercel.app')) ??
    aliases.find((alias) => Boolean(alias)) ??
    target?.url ??
    null
  )
}

async function fetchContextName(bin: string, accountId: string | undefined): Promise<string> {
  if (!accountId?.startsWith('team_')) {
    return await run(bin, ['whoami'])
  }
  const raw = (await fetchJson(bin, ['api', `/v2/teams/${accountId}`, '--raw'], 15000)) as {
    slug?: string
    name?: string
  } | null
  return raw?.slug ?? raw?.name ?? ''
}

function parseAlerts(raw: unknown): VercelAlertInfo[] {
  const data = raw as { groups?: unknown[] } | null
  const groups = Array.isArray(data?.groups) ? data.groups : []
  const alerts = groups.flatMap((group) => {
    if (typeof group !== 'object' || group === null) return []
    const g = group as { alerts?: unknown[] }
    return Array.isArray(g.alerts) ? g.alerts : []
  })
  return alerts.map((item) => {
    const a = item as {
      id?: string
      title?: string
      type?: string
      status?: string
      startedAt?: string | null
      endedAt?: string | null
      summary?: string | null
    }
    return {
      id: a.id ?? '',
      title: a.title ?? a.type ?? '报警',
      type: a.type ?? '',
      status: a.status ?? '',
      startedAt: a.startedAt ?? null,
      endedAt: a.endedAt ?? null,
      summary: a.summary ?? null,
    }
  })
}

function decodeRequestPath(path: string): string {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

function pageDeltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

/** 当前窗口为主；只在上一窗口出现的 path 丢弃；新增 path 不填 prev，deltaPct=null。 */
function mergeTopPages(current: TopPagePoint[], previous: TopPagePoint[]): TopPagePoint[] {
  const prevByPath = new Map(previous.map((point) => [point.path, point]))
  return current.map((point) => {
    const prev = prevByPath.get(point.path)
    if (!prev) {
      return { ...point, deltaPct: null }
    }
    return {
      ...point,
      prevPageviews: prev.pageviews,
      prevVisitors: prev.visitors,
      deltaPct: pageDeltaPct(point.pageviews, prev.pageviews),
    }
  })
}

async function fetchTopPages(
  bin: string,
  projectId: string,
  sinceIso?: string,
  untilIso?: string,
): Promise<TopPagePoint[] | null> {
  try {
    const since = sinceIso ?? new Date(Date.now() - ANALYTICS_WINDOW_DAYS * 86400000).toISOString()
    const until = untilIso ?? new Date().toISOString()
    const raw = await fetchJson(bin, [
      'api',
      `/v1/query/web-analytics/visits/aggregate?projectId=${projectId}&by=requestPath&since=${since}&until=${until}&limit=50`,
      '--raw',
    ])
    const rows = (raw as { data?: unknown[] } | null)?.data
    if (!Array.isArray(rows)) {
      return null
    }
    const byPath = new Map<string, TopPagePoint>()
    for (const row of rows) {
      const r = row as { requestPath?: string; pageviews?: number; visitors?: number }
      const rawPath = typeof r.requestPath === 'string' ? r.requestPath.trim() : ''
      if (!rawPath || rawPath === 'Others') continue
      const path = decodeRequestPath(rawPath)
      const pageviews = r.pageviews ?? 0
      const visitors = r.visitors ?? 0
      const existing = byPath.get(path)
      if (existing) {
        existing.pageviews += pageviews
        existing.visitors += visitors
      } else {
        byPath.set(path, { path, pageviews, visitors })
      }
    }
    return [...byPath.values()]
      .sort((a, b) => b.pageviews - a.pageviews || b.visitors - a.visitors)
      .slice(0, 50)
  } catch {
    return null
  }
}

async function fetchVercelAnalytics(bin: string, projectId: string): Promise<VercelAnalytics | null> {
  const since = new Date(Date.now() - ANALYTICS_WINDOW_DAYS * 86400000).toISOString()
  const until = new Date().toISOString()
  const pageCurrSince = new Date(Date.now() - TOP_PAGES_WINDOW_DAYS * 86400000).toISOString()
  const pagePrevSince = new Date(Date.now() - 2 * TOP_PAGES_WINDOW_DAYS * 86400000).toISOString()

  const [totalsRaw, dailyRaw, currPages, prevPages] = await Promise.all([
    fetchJson(bin, [
      'api',
      `/v1/query/web-analytics/visits/count?since=${since}&until=${until}&projectId=${projectId}`,
      '--raw',
    ]),
    fetchJson(bin, [
      'api',
      `/v1/query/web-analytics/visits/aggregate?projectId=${projectId}&by=day&since=${since}&until=${until}&limit=${ANALYTICS_WINDOW_DAYS + 1}`,
      '--raw',
    ]),
    fetchTopPages(bin, projectId, pageCurrSince, until),
    fetchTopPages(bin, projectId, pagePrevSince, pageCurrSince),
  ])

  const totals = totalsRaw as { data?: { visitors?: number; pageviews?: number } } | null
  if (!totals?.data) {
    return null
  }

  const rows = (dailyRaw as { data?: unknown[] } | null)?.data ?? []
  const daily = rows
    .map((row) => {
      const r = row as { timestamp?: string; pageviews?: number; visitors?: number }
      if (!r.timestamp) return null
      return {
        date: r.timestamp.slice(0, 10),
        pageviews: r.pageviews ?? 0,
        visitors: r.visitors ?? 0,
      }
    })
    .filter((d): d is TrafficDailyPoint => d !== null)
    .sort((a, b) => a.date.localeCompare(b.date))

  const todayPageviews = daily.at(-1)?.pageviews ?? 0
  const yesterdayPageviews = daily.at(-2)?.pageviews ?? 0
  const deltaPct =
    yesterdayPageviews > 0 ? Math.round(((todayPageviews - yesterdayPageviews) / yesterdayPageviews) * 100) : null
  const topPages = currPages && prevPages ? mergeTopPages(currPages, prevPages) : null

  return {
    visitors: totals.data.visitors ?? 0,
    pageviews: totals.data.pageviews ?? 0,
    daily,
    todayPageviews,
    yesterdayPageviews,
    deltaPct,
    isGrowing: todayPageviews > yesterdayPageviews,
    ...(topPages ? { topPages } : {}),
  }
}

async function fetchVercel(): Promise<MonitorSnapshot['vercel']> {
  const empty = (): MonitorSnapshot['vercel'] => ({
    contextName: '',
    projects: [],
    alerts: [],
    fetchedAt: new Date().toISOString(),
    error: null,
  })

  const bin = resolveVercel()
  if (!bin) {
    return {
      ...empty(),
      error: '未找到 vercel CLI。打包版从访达打开时系统 PATH 很短，请安装 CLI 并保证本机可执行 `vercel`。',
    }
  }

  const [projectsRaw, alertsRaw] = await Promise.all([
    fetchJson(bin, ['api', '/v9/projects?limit=100', '--paginate', '--raw']),
    fetchJson(bin, ['alerts', '-F', 'json', '--all', '--limit', '50']),
  ])

  if (!projectsRaw && !alertsRaw) {
    return {
      ...empty(),
      error: 'vercel CLI 无有效输出。请先在终端执行 `vercel login`，再刷新项目监控。',
    }
  }

  const raw = parseProjectList(projectsRaw).filter((p) => p.id && p.name)
  const projects = raw.map((p): VercelProjectInfo => {
    const target = p.targets?.production ?? null
    return {
      id: p.id ?? '',
      name: p.name ?? '',
      url: preferredUrl(p, target),
      state: target?.readyState ?? 'UNKNOWN',
      updatedAt: target?.createdAt ?? null,
      lastCommitMessage: target?.meta?.githubCommitMessage?.split('\n')[0] ?? null,
      lastCommitRef: target?.meta?.githubCommitRef ?? null,
      hasAnalytics: isWebAnalyticsEnabled(p.webAnalytics),
      analyticsState: isWebAnalyticsEnabled(p.webAnalytics) ? 'empty' : 'disabled',
      analytics: null,
      hasSpeedInsights: p.speedInsights?.hasData ?? false,
      speedInsightsState: p.speedInsights?.hasData ? 'empty' : 'disabled',
      speedInsights: null,
      hasProduction: Boolean(target),
      users: null,
    }
  })

  const withAnalytics = projects.filter((p) => p.hasAnalytics)
  const analyticsResults = await Promise.allSettled(
    withAnalytics.map((p) => fetchVercelAnalytics(bin, p.id)),
  )
  withAnalytics.forEach((project, index) => {
    const result = analyticsResults[index]
    if (result.status !== 'fulfilled') {
      project.analyticsState = 'failed'
      return
    }
    if (!result.value) {
      // 接口通了但没有 data，多半是 Vercel 侧刚开通还没落数据。
      project.analyticsState = 'failed'
      return
    }
    project.analytics = result.value
    project.analyticsState = result.value.pageviews > 0 || result.value.daily.length > 0 ? 'ok' : 'empty'
  })

  await attachSpeedInsights(bin, projects)

  return {
    contextName: await fetchContextName(bin, raw[0]?.accountId),
    projects,
    alerts: parseAlerts(alertsRaw),
    fetchedAt: new Date().toISOString(),
    error: null,
  }
}

/** 拉一个站点的 /api/stats。返回解析结果，或一条可读的失败原因。 */
async function fetchOneProductStats(
  origin: string,
  key: string,
): Promise<{ stats: ProjectUserStats } | { error: string }> {
  const url = `${statsUrlFor(originOf(origin)) ?? ''}`
  if (!url) {
    return { error: `statsOrigin 不是合法地址：${origin}` }
  }
  let res: Response
  try {
    res = await fetch(url, {
      headers: { 'x-ownworkbuddy-key': key },
      signal: AbortSignal.timeout(8000),
    })
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return { error: `请求失败：${reason}` }
  }
  if (res.status === 401 || res.status === 403) {
    return { error: `${res.status} 鉴权失败，检查 OWNWORKBUDDY_STATS_KEY 是否与站点一致` }
  }
  if (!res.ok) {
    return { error: `HTTP ${res.status}，站点可能未实现 /api/stats` }
  }
  let payload: unknown
  try {
    payload = await res.json()
  } catch {
    return { error: '响应不是 JSON，站点可能把 /api/stats 落到了 404 页面' }
  }
  const stats = parseUserStats(payload)
  if (!stats.available) {
    return { error: '响应里没有可识别的用户 / 订单字段' }
  }
  return { stats }
}

async function collectProductStats(): Promise<{ items: ProductStatsRow[]; keyMissing: boolean }> {
  const key = process.env.OWNWORKBUDDY_STATS_KEY ?? ''
  const targets = getProducts().filter((p): p is typeof p & { statsOrigin: string } => Boolean(p.statsOrigin))
  const skipReason: Record<'pending' | 'unavailable', string> = {
    pending: '站点尚未实现 /api/stats',
    unavailable: '域名未部署或无法解析',
  }

  if (!key) {
    return { items: [], keyMissing: true }
  }

  const settled = await Promise.allSettled(
    targets.map(async (product): Promise<ProductStatsRow> => {
      const base = {
        productId: product.id,
        productName: product.name,
        origin: product.statsOrigin,
        fetchedAt: new Date().toISOString(),
      }
      const status = statsStatusOf(product)
      if (status !== 'live') {
        return { ...base, stats: emptyUserStats(), error: skipReason[status], skipped: true }
      }
      const result = await fetchOneProductStats(product.statsOrigin, key)
      return 'error' in result
        ? { ...base, stats: emptyUserStats(), error: result.error, skipped: false }
        : { ...base, stats: result.stats, error: null, skipped: false }
    }),
  )
  const items = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  return { items, keyMissing: false }
}

/** 按生产域名把后台统计挂到对应的 Vercel 项目上，比按项目名模糊匹配可靠。 */
function joinUserStats(projects: VercelProjectInfo[], rows: ProductStatsRow[]): void {
  const byOrigin = new Map<string, ProductStatsRow>()
  for (const row of rows) {
    const origin = originOf(row.origin)
    if (origin) {
      byOrigin.set(origin, row)
    }
  }
  for (const project of projects) {
    const origin = originOf(project.url)
    const row = origin ? byOrigin.get(origin) : null
    project.users = row && !row.skipped && row.stats.available ? row.stats : null
  }
}

async function refreshSocial(snapshot: MonitorSnapshot) {
  const features = collectFeatures(snapshot)
  const templates = generateSocialCopy(features)
  const fresh = templates.filter((item) => !socialState().drafts.some((draft) => draft.fingerprint === item.fingerprint))
  const polished = await polishSocialCopy(fresh)
  const created = ingestSocialDrafts(polished.items)
  return socialState(created.length, polished.usedModel)
}

function emptyMonitorSnapshot(): MonitorSnapshot {
  return {
    projects: [],
    vercel: { contextName: '', projects: [], alerts: [], fetchedAt: new Date().toISOString(), error: null },
    userStats: [],
    userStatsKeyMissing: true,
  }
}

export async function generateSocialAmmo(ideaId?: string) {
  if (ideaId) {
    loadMicroSourcing()
    const idea = microState().ideas.find((item) => item.id === ideaId)
    if (!idea || !isIdeaSourceOpen(idea)) {
      return socialState(0, false)
    }
    const templates = generateSocialCopy([featureFromIdea(idea)])
    const fresh = templates.filter((item) => !socialState().drafts.some((draft) => draft.fingerprint === item.fingerprint))
    const polished = await polishSocialCopy(fresh)
    const created = ingestSocialDrafts(polished.items)
    return socialState(created.length, polished.usedModel)
  }
  const snapshot = loadMonitorCache()?.snapshot ?? emptyMonitorSnapshot()
  return refreshSocial(snapshot)
}

export async function refreshMonitor(): Promise<MonitorRefreshResult> {
  const [projects, vercel, statsResult] = await Promise.allSettled([
    scanGitProjects(),
    fetchVercel(),
    collectProductStats(),
  ])
  const { items: userStats, keyMissing: userStatsKeyMissing } =
    statsResult.status === 'fulfilled' ? statsResult.value : { items: [], keyMissing: false }
  const snapshot: MonitorSnapshot = {
    projects: projects.status === 'fulfilled' ? projects.value : [],
    vercel: vercel.status === 'fulfilled'
      ? vercel.value
      : { contextName: '', projects: [], alerts: [], fetchedAt: new Date().toISOString(), error: '项目监控采集失败' },
    userStats,
    userStatsKeyMissing,
  }
  joinUserStats(snapshot.vercel.projects, snapshot.userStats)
  const proposals = proposeMonitorTodos(snapshot).slice(0, 16)
  const inbox = ingestTodos({
    agentId: MONITOR_AGENT_ID,
    source: '项目监控 · 明日待办',
    tags: [getProjectTag()],
    items: proposals,
  })
  const result: MonitorRefreshResult = { snapshot, social: socialState(), proposals, inbox }
  saveMonitorCache(result)
  return result
}

export function registerMonitorIpc(handle: IpcRegistrar): void {
  handle('monitor:refresh', () => refreshMonitor())
  handle('monitor:cached', () => loadMonitorCache())
}

/**
 * 社媒弹药的通道由 social-ammo 模块注册，不跟着监控一起开关。
 * 装填读监控快照里的产品能力；没有快照时仍交出当前弹药，不偷偷刷新监控。
 */
export function registerSocialIpc(handle: IpcRegistrar): void {
  handle('social:state', () => socialState())
  handle('social:generate', (_event, raw?: unknown) => {
    const ideaId =
      raw && typeof raw === 'object' && 'ideaId' in raw && typeof (raw as { ideaId?: unknown }).ideaId === 'string'
        ? (raw as { ideaId: string }).ideaId
        : undefined
    return generateSocialAmmo(ideaId)
  })
  handle('social:publish', (_event, id: unknown, url: unknown) => {
    if (typeof id !== 'string') {
      return socialState()
    }
    publishSocialDraft(id, typeof url === 'string' ? url : '')
    return socialState()
  })
  handle('social:discard', (_event, id: unknown) => {
    if (typeof id === 'string') {
      discardSocialDraft(id)
    }
    return socialState()
  })
  handle('social:record', (_event, raw: unknown) => {
    const input = parseMetricsInput(raw)
    if (input) {
      recordSocialMetrics(input)
    }
    return socialState()
  })
}

function parseMetricsInput(raw: unknown): SocialMetricsInput | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const record = raw as SocialMetricsInput
  if (!isSocialPlatformId(record.platform) && !record.draftId) {
    return null
  }
  return {
    draftId: typeof record.draftId === 'string' ? record.draftId : null,
    platform: isSocialPlatformId(record.platform) ? record.platform : 'x',
    views: Number(record.views) || 0,
    likes: Number(record.likes) || 0,
    comments: Number(record.comments) || 0,
    shares: Number(record.shares) || 0,
    saves: Number(record.saves) || 0,
  }
}
