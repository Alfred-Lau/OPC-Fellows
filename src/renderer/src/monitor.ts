import type { AgentInboxResult, AgentTodoDraft } from '../../shared/agent-inbox'
import type {
  GitProjectInfo,
  MonitorSnapshot,
  ProductStatsRow,
  TrafficDailyPoint,
  VercelAlertInfo,
  VercelProjectInfo,
} from '../../shared/monitor'
import { isFreshFailure } from '../../shared/monitor'
import { summarizeUsers, type UserStatsSummary } from '../../shared/project-users'
import {
  buildTrafficInsights,
  type TrafficInsight,
  type TrafficInsightReport,
} from '../../shared/traffic-insights'
import {
  countryName,
  formatVital,
  hasSpeedCurve,
  rateVital,
  ratingLabel,
  siteRating,
  speedEmptyReason,
  speedStateOf,
  worstCountry,
  type VitalRating,
} from '../../shared/speed-insights'
import { tagChips } from './tags-ui'

const refreshBtn = required('#monitor-refresh', HTMLButtonElement)
const updatedEl = required('#monitor-updated', HTMLSpanElement)
const statusEl = required('#monitor-status', HTMLParagraphElement)
const projectsEl = required('#monitor-projects', HTMLUListElement)
const vercelEl = required('#monitor-vercel', HTMLUListElement)
const trafficList = required('#traffic-list', HTMLDivElement)
const trafficHead = required('#traffic-head', HTMLDivElement)
const trafficChart = required('#traffic-chart', HTMLDivElement)
const trafficStats = required('#traffic-stats', HTMLDivElement)
const trafficAnalysis = required('#traffic-analysis', HTMLDivElement)
const totalChart = required('#traffic-total-chart', HTMLDivElement)
const attributionEl = required('#traffic-attribution', HTMLDivElement)
const usersChart = required('#users-chart', HTMLDivElement)
const deploysChart = required('#deploys-chart', HTMLDivElement)
const projectsChart = required('#projects-chart', HTMLDivElement)
const usersSummary = required('#users-summary', HTMLDivElement)
const usersEl = required('#monitor-users', HTMLUListElement)
const usersMeta = required('#monitor-users-meta', HTMLSpanElement)
const alertsEl = required('#monitor-alerts', HTMLUListElement)
const alertsMeta = required('#monitor-alerts-meta', HTMLSpanElement)
const alertsSummary = required('#alerts-summary', HTMLDivElement)
const tomorrowEl = required('#monitor-todos', HTMLUListElement)
const tomorrowMeta = required('#monitor-todo-meta', HTMLSpanElement)
const navEl = required('#monitor-nav', HTMLElement)
const overviewSummary = required('#overview-summary', HTMLDivElement)
const overviewMeta = required('#monitor-overview-meta', HTMLSpanElement)
const projectsSummary = required('#projects-summary', HTMLDivElement)
const projectsMeta = required('#monitor-projects-meta', HTMLSpanElement)
const deploysSummary = required('#deploys-summary', HTMLDivElement)
const vercelMeta = required('#monitor-vercel-meta', HTMLSpanElement)
const perfMeta = required('#monitor-perf-meta', HTMLSpanElement)
const perfSummary = required('#perf-summary', HTMLDivElement)
const perfChart = required('#perf-chart', HTMLDivElement)
const perfList = required('#perf-list', HTMLDivElement)
const perfHead = required('#perf-head', HTMLDivElement)
const perfStats = required('#perf-stats', HTMLDivElement)
const perfCountries = required('#perf-countries', HTMLDivElement)

const MONITOR_GROUPS = [
  { id: 'overview', label: '总览 · 流量' },
  { id: 'projects', label: '仓库' },
  { id: 'deploys', label: '站点部署' },
  { id: 'perf', label: '全球性能' },
  { id: 'alerts', label: '线上报警' },
  { id: 'users', label: '后台用户' },
  { id: 'todos', label: '明日待办' },
] as const

type MonitorGroupId = (typeof MONITOR_GROUPS)[number]['id']

interface NavBadge {
  text: string
  tone: 'danger' | 'ok' | 'muted'
}

let loading = false
let selectedTrafficId: string | null = null
let selectedPerfId: string | null = null
let bound = false
let currentGroup: MonitorGroupId = 'overview'
let navBadges: Partial<Record<MonitorGroupId, NavBadge>> = {}

function required<T extends typeof HTMLElement>(selector: string, ctor: T): InstanceType<T> {
  const node = document.querySelector(selector)
  if (!(node instanceof ctor)) {
    throw new Error(`missing ${selector}`)
  }
  return node as InstanceType<T>
}

function setStatus(message: string, isError = false): void {
  statusEl.textContent = message
  statusEl.classList.toggle('is-error', isError)
}

function visibleGroups(): typeof MONITOR_GROUPS[number][] {
  return [...MONITOR_GROUPS]
}

function renderNav(): void {
  navEl.replaceChildren()
  for (const group of visibleGroups()) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'monitor-nav-item'
    const isCurrent = group.id === currentGroup
    button.classList.toggle('is-current', isCurrent)
    // aria-current="false" 仍会被读屏当成存在，非当前项直接不带这个属性。
    if (isCurrent) {
      button.setAttribute('aria-current', 'true')
    }

    const label = document.createElement('span')
    label.className = 'monitor-nav-label'
    label.textContent = group.label
    button.append(label)

    const badge = navBadges[group.id]
    if (badge) {
      const chip = document.createElement('span')
      chip.className = `monitor-nav-badge is-${badge.tone === 'muted' ? 'muted' : badge.tone}`
      chip.textContent = badge.text
      button.append(chip)
    }

    button.addEventListener('click', () => selectGroup(group.id))
    navEl.append(button)
  }
}

export function revealMonitorGroup(id: MonitorGroupId): void {
  selectGroup(id)
}

function selectGroup(id: MonitorGroupId): void {
  currentGroup = id
  for (const node of document.querySelectorAll<HTMLDivElement>('.monitor-group')) {
    const group = node.dataset.group
    node.hidden = group !== currentGroup
  }
  renderNav()
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function emptyRow(text: string): HTMLLIElement {
  const item = document.createElement('li')
  item.className = 'empty'
  item.textContent = text
  return item
}

function row(title: string, meta: string, extra?: string, accent = false): HTMLLIElement {
  const item = document.createElement('li')
  item.className = 'mon-row'
  const name = document.createElement('span')
  name.className = 'mon-title'
  name.textContent = title
  if (accent) name.classList.add('is-accent')
  const aside = document.createElement('span')
  aside.className = 'mon-meta'
  aside.textContent = meta
  item.append(name)
  if (extra) {
    const detail = document.createElement('span')
    detail.className = 'mon-extra'
    detail.textContent = extra
    item.append(detail)
  }
  item.append(aside)
  return item
}

/** 需要动手的仓库排前面：未提交 > 待推送 > 待拉取 > 其余按最近提交。 */
function gitUrgency(project: GitProjectInfo): number {
  if (!project.isRepo) return 4
  if (project.dirty) return 0
  if (project.ahead > 0) return 1
  if (project.behind > 0) return 2
  return 3
}

function renderProjects(projects: GitProjectInfo[]): void {
  projectsEl.replaceChildren()
  const repos = projects.filter((p) => p.isRepo)
  const dirty = repos.filter((p) => p.dirty)
  const ahead = repos.filter((p) => p.ahead > 0)
  const behind = repos.filter((p) => p.behind > 0)
  const dirtyFiles = repos.reduce((sum, p) => sum + p.dirtyCount, 0)

  projectsMeta.textContent = `${repos.length} 个仓库 · ${projects.length - repos.length} 个非 git 目录`
  projectsSummary.replaceChildren(
    userStatBox('未提交仓库', String(dirty.length), dirty.length > 0),
    userStatBox('未提交文件', String(dirtyFiles)),
    userStatBox('待推送', String(ahead.length)),
    userStatBox('待拉取', String(behind.length)),
  )

  // 只画有积压的仓库，全干净时不占地方。
  // 排序与条长共用同一个口径，否则会出现「排在后面的条更长」。
  const backlogSize = (p: GitProjectInfo): number => p.dirtyCount + p.ahead + p.behind
  projectsChart.replaceChildren()
  const backlog = repos
    .filter((p) => backlogSize(p) > 0)
    .sort((left, right) => backlogSize(right) - backlogSize(left))
    .slice(0, 8)
    .map((p) => ({
      label: p.name,
      value: backlogSize(p),
      note: [
        p.dirtyCount > 0 ? `${p.dirtyCount} 未提交` : '',
        p.ahead > 0 ? `${p.ahead} 待推送` : '',
        p.behind > 0 ? `${p.behind} 待拉取` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      tone: p.dirtyCount > 0 ? ('danger' as const) : ('brass' as const),
    }))
  const backlogChart = barChart(backlog, '待处理积压 · 按改动量')
  if (backlogChart) {
    projectsChart.append(backlogChart)
  }

  if (projects.length === 0) {
    projectsEl.append(emptyRow('未扫描到项目目录'))
    return
  }

  const ranked = [...projects].sort(
    (left, right) =>
      gitUrgency(left) - gitUrgency(right) ||
      right.dirtyCount - left.dirtyCount ||
      (Date.parse(right.lastCommitAt ?? '') || 0) - (Date.parse(left.lastCommitAt ?? '') || 0),
  )
  for (const p of ranked) {
    if (!p.isRepo) {
      projectsEl.append(row(p.name, '非 git 目录'))
      continue
    }
    // 箭头类字形在当前字体下会缺失，"⇡1" 看着像 "11"，一律用文字。
    const bits = [p.branch ?? 'detached']
    if (p.dirtyCount > 0) bits.push(`${p.dirtyCount} 个文件未提交`)
    if (p.ahead > 0) bits.push(`待推送 ${p.ahead}`)
    if (p.behind > 0) bits.push(`待拉取 ${p.behind}`)
    bits.push(timeAgo(p.lastCommitAt))
    projectsEl.append(row(p.name, bits.join(' · '), p.lastCommit ?? '', p.dirty))
  }
}

function userExtra(project: VercelProjectInfo): string {
  const stats = project.users
  if (!stats?.available) {
    return ''
  }
  const parts = [`注册 ${stats.registered ?? 0}`]
  if (stats.paid !== null) parts.push(`付费 ${stats.paid}`)
  if (stats.orders !== null) parts.push(`订单 ${stats.orders}`)
  if (stats.revenue !== null) parts.push(`营收 ${stats.revenue}`)
  return parts.join(' · ')
}

function userStatBox(label: string, value: string, key = false): HTMLSpanElement {
  const box = document.createElement('span')
  box.className = key ? 'users-stat is-key' : 'users-stat'
  const v = document.createElement('b')
  v.textContent = value
  const l = document.createElement('i')
  l.textContent = label
  box.append(v, l)
  return box
}

function renderVercel(projects: VercelProjectInfo[]): void {
  vercelEl.replaceChildren()
  const listed = projects.filter((p) => p.hasProduction)
  const neverShipped = projects.length - listed.length
  const failing = listed.filter((p) => p.state === 'ERROR')
  const fresh = failing.filter((p) => isFreshFailure(p))
  const withTraffic = listed.filter((p) => p.analyticsState === 'ok')

  vercelMeta.textContent = `${listed.length} 已上线 · ${neverShipped} 未上线`
  deploysSummary.replaceChildren(
    userStatBox('近期失败', String(fresh.length), fresh.length > 0),
    userStatBox('历史失败', String(failing.length - fresh.length)),
    userStatBox('有流量', `${withTraffic.length} / ${listed.length}`),
    userStatBox('未开流量', String(listed.filter((p) => p.analyticsState === 'disabled').length)),
  )

  // 有流量的站点画流量对比，看清大盘由谁撑着。
  deploysChart.replaceChildren()
  const traffic = listed
    .filter((p) => p.analytics && p.analytics.todayPageviews > 0)
    .sort((left, right) => (right.analytics?.todayPageviews ?? 0) - (left.analytics?.todayPageviews ?? 0))
    .slice(0, 8)
    .map((p) => {
      const a = p.analytics
      const delta = a?.deltaPct
      return {
        label: p.name,
        value: a?.todayPageviews ?? 0,
        note: `${a?.todayPageviews ?? 0} 次${delta !== null && delta !== undefined ? `（${delta > 0 ? '+' : ''}${delta}%）` : ''}`,
        tone: a?.isGrowing ? ('ok' as const) : ('brass' as const),
      }
    })
  const trafficChart = barChart(traffic, '今日浏览对比 · 前 8 名')
  if (trafficChart) {
    deploysChart.append(trafficChart)
  }

  if (listed.length === 0) {
    vercelEl.append(emptyRow('暂无 Vercel 部署'))
    return
  }
  // 只有近期失败值得置顶；陈年废弃项目的 ERROR 按时间自然沉底。
  const ranked = [...listed].sort((left, right) => {
    const byFresh = Number(isFreshFailure(right)) - Number(isFreshFailure(left))
    return byFresh || (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
  })
  for (const p of ranked) {
    vercelEl.append(deployRow(p))
  }
  if (neverShipped > 0) {
    vercelEl.append(emptyRow(`另有 ${neverShipped} 个项目从未部署到生产`))
  }
}

function deployRow(project: VercelProjectInfo): HTMLLIElement {
  const item = document.createElement('li')
  item.className = 'mon-row'
  const isError = project.state === 'ERROR'

  const title = document.createElement('span')
  title.className = 'mon-title'
  title.textContent = project.name
  if (isError) title.classList.add('is-accent')
  if (isFreshFailure(project)) {
    title.classList.add('has-flag')
    const badge = document.createElement('span')
    badge.className = 'mon-flag is-danger'
    badge.textContent = '近期失败'
    title.append(badge)
  }

  const facts = document.createElement('span')
  facts.className = 'mon-users'
  const traffic = project.analytics
  if (traffic) {
    const views = document.createElement('b')
    views.textContent = `今日 ${traffic.todayPageviews} 浏览`
    facts.append(views)
    if (traffic.deltaPct !== null) {
      const delta = document.createElement('span')
      delta.textContent = traffic.deltaPct > 0 ? `↑${traffic.deltaPct}%` : `↓${Math.abs(traffic.deltaPct)}%`
      facts.append(delta)
    }
    const spark = sparkline(traffic.daily)
    if (spark) {
      facts.append(spark)
    }
  } else {
    const why = document.createElement('span')
    why.className = 'is-muted'
    why.textContent = project.analyticsState === 'disabled' ? '未开 Web Analytics' : '流量未取到'
    facts.append(why)
  }
  const users = userExtra(project)
  if (users) {
    const span = document.createElement('span')
    span.textContent = users
    facts.append(span)
  }

  const meta = document.createElement('span')
  meta.className = 'mon-meta'
  meta.textContent = `${project.state} · ${timeAgo(project.updatedAt ? new Date(project.updatedAt).toISOString() : null)}${
    project.lastCommitMessage ? ` · ${project.lastCommitMessage}` : ''
  }`

  item.append(title, facts)
  if (project.url) {
    item.append(externalLink(project.url))
  }
  item.append(meta)
  return item
}

/** 域名点开走系统浏览器，主进程的 window-open 处理器负责拦下。 */
function externalLink(url: string): HTMLAnchorElement {
  const link = document.createElement('a')
  link.className = 'mon-link'
  link.href = url.includes('://') ? url : `https://${url}`
  link.target = '_blank'
  link.rel = 'noreferrer'
  link.textContent = url
  return link
}

function trafficChartSVG(daily: TrafficDailyPoint[]): string {
  const w = 340
  const h = 110
  const pad = 6
  const values = daily.map((d) => d.pageviews)
  const max = Math.max(...values, 1)
  const n = Math.max(values.length - 1, 1)
  const points = values.map((value, index) => {
    const x = pad + (index * (w - pad * 2)) / n
    const y = h - pad - (value / max) * (h - pad * 2)
    return [x, y] as const
  })
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${pad},${h - pad} ${line} ${w - pad},${h - pad}`
  const dots = points
    .map(([x, y], index) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${index === points.length - 1 ? 3 : 1.6}" class="traffic-dot${index === points.length - 1 ? ' is-last' : ''}"/>`)
    .join('')
  return `
<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="traffic-svg" role="img" aria-label="30 天浏览量曲线">
  <defs>
    <linearGradient id="traffic-fill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.02"/>
    </linearGradient>
  </defs>
  <polygon points="${area}" fill="url(#traffic-fill)"/>
  <polyline points="${line}" fill="none" class="traffic-line"/>
  ${dots}
</svg>`
}

interface BarDatum {
  label: string
  value: number
  /** 次要数值，画成同一根条上的深色段，用来看构成（如付费占注册）。 */
  inner?: number
  note?: string
  tone?: 'ok' | 'danger' | 'brass'
}

/**
 * 横向条形图。同一份数字既给条长也给数值标签，避免只能靠长度估。
 * 空数据时返回 null，由调用方决定是否留白。
 */
function barChart(data: BarDatum[], caption: string): HTMLDivElement | null {
  const usable = data.filter((item) => Number.isFinite(item.value))
  if (usable.length === 0) return null
  const max = Math.max(...usable.map((item) => item.value), 1)

  const wrap = document.createElement('div')
  wrap.className = 'bar-chart-inner'
  const head = document.createElement('p')
  head.className = 'bar-chart-caption'
  head.textContent = caption
  wrap.append(head)

  for (const item of usable) {
    const rowEl = document.createElement('div')
    rowEl.className = 'bar-row'

    const label = document.createElement('span')
    label.className = 'bar-label'
    label.textContent = item.label
    label.title = item.label

    const track = document.createElement('span')
    track.className = 'bar-track'
    const fill = document.createElement('span')
    fill.className = `bar-fill${item.tone ? ` is-${item.tone}` : ''}`
    fill.style.width = `${Math.round((item.value / max) * 100)}%`
    track.append(fill)
    if (item.inner !== undefined && item.inner > 0) {
      const inner = document.createElement('span')
      inner.className = 'bar-inner'
      inner.style.width = `${Math.round((item.inner / max) * 100)}%`
      track.append(inner)
    }

    const value = document.createElement('span')
    value.className = 'bar-value'
    value.textContent = item.note ?? String(item.value)

    rowEl.append(label, track, value)
    wrap.append(rowEl)
  }

  const box = document.createElement('div')
  box.append(wrap)
  return box
}

/** 把多站点的日曲线按日期相加，得到全站趋势。 */
function totalDaily(projects: VercelProjectInfo[]): TrafficDailyPoint[] {
  const byDate = new Map<string, TrafficDailyPoint>()
  for (const project of projects) {
    for (const point of project.analytics?.daily ?? []) {
      const found = byDate.get(point.date)
      if (found) {
        found.pageviews += point.pageviews
        found.visitors += point.visitors
      } else {
        byDate.set(point.date, { ...point })
      }
    }
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date))
}

/** 行内迷你曲线，只表达形状，不标数值。 */
function sparkline(daily: TrafficDailyPoint[], days = 14): SVGSVGElement | null {
  const points = daily.slice(-days)
  if (points.length < 3) return null
  const w = 72
  const h = 18
  const values = points.map((p) => p.pageviews)
  const max = Math.max(...values, 1)
  const n = Math.max(values.length - 1, 1)
  const coords = values.map((value, index) => {
    const x = (index * w) / n
    const y = h - 1 - (value / max) * (h - 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
  svg.setAttribute('class', 'sparkline')
  svg.setAttribute('aria-hidden', 'true')
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
  line.setAttribute('points', coords.join(' '))
  line.setAttribute('class', 'sparkline-line')
  svg.append(line)
  return svg
}

/** 全站 30 天汇总趋势：单站曲线只能看局部，汇总才看得出大盘。 */
function renderTotalTrafficChart(projects: VercelProjectInfo[]): void {
  totalChart.replaceChildren()
  const daily = totalDaily(projects.filter((p) => p.analytics))
  if (daily.length < 3) return

  const head = document.createElement('div')
  head.className = 'total-chart-head'
  const caption = document.createElement('span')
  caption.className = 'bar-chart-caption'
  caption.textContent = '全站合计 · 近 30 天浏览'
  const peak = Math.max(...daily.map((d) => d.pageviews))
  const peakDay = daily.find((d) => d.pageviews === peak)
  const meta = document.createElement('span')
  meta.className = 'total-chart-meta'
  meta.textContent = peakDay ? `峰值 ${peak} 次（${peakDay.date}）` : ''
  head.append(caption, meta)

  const chartBody = document.createElement('div')
  chartBody.className = 'total-chart-body'
  chartBody.innerHTML = trafficChartSVG(daily)

  totalChart.append(head, chartBody)
}

/**
 * 一句话大盘口径。数字已经在上方摘要卡、各站涨跌已经在下方归因卡里，
 * 这里只补它们都没说的：访客总量与站点数。
 */
function renderTrafficAnalysis(projects: VercelProjectInfo[], report: TrafficInsightReport): void {
  const withData = projects.filter((p) => p.hasAnalytics && p.analytics)
  trafficAnalysis.replaceChildren()
  if (withData.length === 0) return

  const totalVisitors = withData.reduce((sum, p) => sum + (p.analytics?.visitors ?? 0), 0)

  const summary = document.createElement('p')
  summary.className = 'traffic-analysis-summary'
  summary.textContent = `${report.headline}。近 30 天累计 ${totalVisitors} 访客。`

  trafficAnalysis.append(summary)
}

/** 每个涨跌站点单独一张卡：曲线看形状，归因列表说为什么。 */
function renderAttribution(projects: VercelProjectInfo[], report: TrafficInsightReport): void {
  attributionEl.replaceChildren()
  if (report.up.length === 0 && report.down.length === 0) return

  const byId = new Map(projects.map((p) => [p.id, p]))
  const sections: Array<{ title: string; items: TrafficInsight[] }> = [
    { title: `上涨 ${report.up.length} 个站点 · 归因`, items: report.up },
    { title: `回落 ${report.down.length} 个站点 · 归因`, items: report.down },
  ]

  for (const section of sections) {
    if (section.items.length === 0) continue
    const block = document.createElement('div')
    block.className = 'attr-block'
    const head = document.createElement('p')
    head.className = 'bar-chart-caption'
    head.textContent = section.title
    block.append(head)

    for (const insight of section.items) {
      block.append(attributionCard(insight, byId.get(insight.projectId)))
    }
    attributionEl.append(block)
  }
}

function attributionCard(
  insight: TrafficInsight,
  project: VercelProjectInfo | undefined,
): HTMLDivElement {
  const card = document.createElement('div')
  card.className = `attr-card is-${insight.direction}`

  const head = document.createElement('div')
  head.className = 'attr-head'

  const name = document.createElement('strong')
  name.textContent = insight.name

  const move = document.createElement('span')
  move.className = `attr-move is-${insight.direction}`
  const arrow = insight.direction === 'up' ? '↑' : '↓'
  move.textContent =
    insight.deltaPct !== null
      ? `${arrow}${Math.abs(insight.deltaPct)}%`
      : `${arrow}${Math.abs(insight.todayPageviews - insight.yesterdayPageviews)}`

  const counts = document.createElement('span')
  counts.className = 'attr-counts'
  counts.textContent = `${insight.yesterdayPageviews} → ${insight.todayPageviews} 次 · 占全站 ${insight.sharePct}%`

  head.append(name, move, counts)
  const spark = sparkline(project?.analytics?.daily ?? [])
  if (spark) {
    head.append(spark)
  }
  card.append(head)

  const list = document.createElement('ul')
  list.className = 'attr-reasons'
  for (const reason of insight.reasons.slice(0, 4)) {
    const li = document.createElement('li')
    li.textContent = reason
    list.append(li)
  }
  card.append(list)
  return card
}

/** 没有曲线时说明卡在哪一步，而不是只说「没有数据」。 */
function trafficEmptyReason(projects: VercelProjectInfo[]): string {
  const disabled = projects.filter((p) => p.hasProduction && p.analyticsState === 'disabled').length
  const failed = projects.filter((p) => p.analyticsState === 'failed').length
  if (failed > 0) {
    return `${failed} 个站点已开通 Web Analytics 但拉取失败，检查 vercel CLI 登录状态与团队 scope`
  }
  if (disabled > 0) {
    return `${disabled} 个已上线站点还没在 Vercel 打开 Web Analytics，打开后才有流量曲线`
  }
  return '已开通 Web Analytics 的站点暂时没有落到数据'
}

function hasTrafficCurve(project: VercelProjectInfo): boolean {
  const daily = project.analytics?.daily.length ?? 0
  return Boolean(project.hasAnalytics && project.analytics && (daily > 0 || (project.analytics.pageviews ?? 0) > 0))
}

function renderTraffic(
  projects: VercelProjectInfo[],
  error: string | null,
  alerts: VercelAlertInfo[] = [],
): void {
  const report = buildTrafficInsights(projects, alerts)
  renderTotalTrafficChart(projects)
  renderTrafficAnalysis(projects, report)
  renderAttribution(projects, report)
  const withData = projects.filter(hasTrafficCurve)
  if (withData.length === 0) {
    trafficList.replaceChildren()
    trafficHead.replaceChildren()
    trafficChart.replaceChildren()
    trafficStats.replaceChildren()
    const empty = document.createElement('p')
    empty.className = 'traffic-empty'
    empty.textContent = error ?? trafficEmptyReason(projects)
    trafficList.append(empty)
    return
  }

  if (!selectedTrafficId || !withData.some((p) => p.id === selectedTrafficId)) {
    selectedTrafficId = withData.find((p) => p.analytics?.isGrowing)?.id ?? withData[0].id
  }

  trafficList.replaceChildren()
  for (const p of withData) {
    const a = p.analytics
    if (!a) continue
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'traffic-item'
    item.classList.toggle('is-current', p.id === selectedTrafficId)
    const name = document.createElement('span')
    name.className = 'traffic-name'
    name.textContent = p.name
    const badge = document.createElement('span')
    badge.className = 'traffic-count'
    badge.textContent = `${a.todayPageviews}`
    if (a.isGrowing && a.deltaPct !== null) {
      const up = document.createElement('span')
      up.className = 'traffic-up'
      up.textContent = `↑${a.deltaPct}%`
      item.append(name, up, badge)
    } else {
      item.append(name, badge)
    }
    item.addEventListener('click', () => {
      selectedTrafficId = p.id
      renderTraffic(projects, error, alerts)
    })
    trafficList.append(item)
  }

  const selected = withData.find((p) => p.id === selectedTrafficId)
  if (!selected?.analytics) return
  renderTrafficDetail(selected)
}

function renderTrafficDetail(project: VercelProjectInfo): void {
  const a = project.analytics
  if (!a) return

  trafficHead.replaceChildren()
  const title = document.createElement('div')
  title.className = 'traffic-title'
  title.textContent = project.name
  if (a.isGrowing) {
    const badge = document.createElement('span')
    badge.className = 'traffic-badge'
    badge.textContent = a.deltaPct !== null ? `今日 ↑${a.deltaPct}%` : '今日有增长'
    title.append(badge)
  }
  trafficHead.append(title)

  trafficChart.replaceChildren()
  trafficChart.innerHTML = trafficChartSVG(a.daily)

  trafficStats.replaceChildren()
  const stat = (label: string, value: string): HTMLSpanElement => {
    const box = document.createElement('span')
    box.className = 'traffic-stat'
    const v = document.createElement('b')
    v.textContent = value
    const l = document.createElement('i')
    l.textContent = label
    box.append(v, l)
    return box
  }
  trafficStats.append(
    stat('今日浏览', String(a.todayPageviews)),
    stat('昨日浏览', String(a.yesterdayPageviews)),
    stat('30 天浏览', String(a.pageviews)),
    stat('30 天访客', String(a.visitors)),
  )
  renderTopPages(project)
}

function renderTopPages(project: VercelProjectInfo): void {
  const pagesEl = required('#traffic-pages', HTMLDivElement)
  const pages = project.analytics?.topPages
  pagesEl.replaceChildren()
  if (!pages || pages.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'traffic-pages-empty'
    empty.textContent = '页面明细暂不可用：需要一次带页面级数据的刷新（双窗口任一失败则无明细）'
    pagesEl.append(empty)
    return
  }

  const caption = document.createElement('p')
  caption.className = 'traffic-pages-caption'
  caption.textContent = '近 7 天 Top 页面 · 较前 7 天'
  pagesEl.append(caption)

  const head = document.createElement('div')
  head.className = 'tp-row'
  const headPath = document.createElement('span')
  headPath.className = 'tp-path'
  headPath.textContent = '路径'
  const headPv = document.createElement('span')
  headPv.className = 'tp-pv'
  headPv.textContent = '浏览量'
  const headVis = document.createElement('span')
  headVis.className = 'tp-pv'
  headVis.textContent = '访客'
  const headDelta = document.createElement('span')
  headDelta.className = 'tp-delta'
  headDelta.textContent = '较前 7 天'
  head.append(headPath, headPv, headVis, headDelta)
  pagesEl.append(head)

  const ranked = [...pages].sort((a, b) => b.pageviews - a.pageviews)
  const shown = ranked.slice(0, 15)
  for (const point of shown) {
    const row = document.createElement('div')
    row.className = 'tp-row'

    let pathText = point.path
    try {
      pathText = decodeURIComponent(point.path)
    } catch {
      pathText = point.path
    }
    const pathEl = document.createElement('span')
    pathEl.className = 'tp-path'
    pathEl.textContent = pathText

    const pvEl = document.createElement('span')
    pvEl.className = 'tp-pv'
    pvEl.textContent = String(point.pageviews)

    const visEl = document.createElement('span')
    visEl.className = 'tp-pv'
    visEl.textContent = String(point.visitors)

    const deltaEl = document.createElement('span')
    const delta = point.deltaPct
    if (delta === null || delta === undefined) {
      deltaEl.className = 'tp-delta is-new'
      deltaEl.textContent = '新增'
    } else if (delta > 0) {
      deltaEl.className = 'tp-delta is-up'
      deltaEl.textContent = `↑${delta}%`
    } else if (delta < 0) {
      deltaEl.className = 'tp-delta is-down'
      deltaEl.textContent = `↓${Math.abs(delta)}%`
    } else {
      deltaEl.className = 'tp-delta'
      deltaEl.textContent = '持平'
    }

    row.append(pathEl, pvEl, visEl, deltaEl)
    pagesEl.append(row)
  }

  if (ranked.length > 15) {
    const more = document.createElement('div')
    more.className = 'tp-row'
    more.textContent = `…共 ${ranked.length} 条,此处显示前 15`
    pagesEl.append(more)
  }
}

function vitalTone(rating: VitalRating): BarDatum['tone'] {
  switch (rating) {
    case 'good':
      return 'ok'
    case 'poor':
      return 'danger'
    case 'ni':
    case 'unknown':
      return 'brass'
    default: {
      const exhaustive: never = rating
      return exhaustive
    }
  }
}

function renderSpeed(projects: VercelProjectInfo[], error: string | null): void {
  const shipped = projects.filter((project) => project.hasProduction)
  const withData = shipped.filter(hasSpeedCurve)
  const poor = withData.filter((project) => siteRating(project.speedInsights) === 'poor')
  const disabled = shipped.filter((project) => speedStateOf(project) === 'disabled').length
  perfMeta.textContent = `${withData.length} 有样本 · ${shipped.length} 已上线`
  perfSummary.replaceChildren(
    userStatBox('有样本', String(withData.length), true),
    userStatBox('Web Vitals 差', String(poor.length), poor.length > 0),
    userStatBox('未开通', String(disabled)),
    userStatBox('近 7 天 P75', '生产环境'),
  )

  perfChart.replaceChildren()
  const countryBars = globalTtfbBars(withData)
  const chart = barChart(countryBars, '各地区最慢 TTFB · 近 7 天 P75')
  if (chart) {
    perfChart.append(chart)
  }

  if (withData.length === 0) {
    perfList.replaceChildren()
    perfHead.replaceChildren()
    perfStats.replaceChildren()
    perfCountries.replaceChildren()
    const empty = document.createElement('p')
    empty.className = 'traffic-empty'
    empty.textContent = error ?? speedEmptyReason(projects)
    perfList.append(empty)
    return
  }

  if (!selectedPerfId || !withData.some((project) => project.id === selectedPerfId)) {
    selectedPerfId = poor[0]?.id ?? withData[0].id
  }

  perfList.replaceChildren()
  for (const project of withData) {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'traffic-item'
    item.classList.toggle('is-current', project.id === selectedPerfId)
    const name = document.createElement('span')
    name.className = 'traffic-name'
    name.textContent = project.name
    const badge = document.createElement('span')
    const rating = siteRating(project.speedInsights)
    badge.className = `vital-badge is-${rating === 'unknown' ? 'ni' : rating}`
    badge.textContent = ratingLabel(rating)
    item.append(name, badge)
    item.addEventListener('click', () => {
      selectedPerfId = project.id
      renderSpeed(projects, error)
    })
    perfList.append(item)
  }

  const selected = withData.find((project) => project.id === selectedPerfId)
  if (!selected?.speedInsights) {
    return
  }
  renderSpeedDetail(selected)
}

function globalTtfbBars(projects: VercelProjectInfo[]): BarDatum[] {
  const byCountry = new Map<string, number>()
  for (const project of projects) {
    for (const row of project.speedInsights?.countries ?? []) {
      if (row.ttfbMs == null) continue
      const current = byCountry.get(row.country)
      if (current == null || row.ttfbMs > current) {
        byCountry.set(row.country, row.ttfbMs)
      }
    }
  }
  return [...byCountry.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([code, ms]) => {
      const rating = rateVital('ttfb', ms)
      return {
        label: countryName(code),
        value: ms,
        note: formatVital('ttfb', ms),
        tone: vitalTone(rating),
      }
    })
}

function renderSpeedDetail(project: VercelProjectInfo): void {
  const insights = project.speedInsights
  if (!insights) return

  perfHead.replaceChildren()
  const title = document.createElement('div')
  title.className = 'traffic-title'
  title.textContent = project.name
  const rating = siteRating(insights)
  const badge = document.createElement('span')
  const ratingClass = rating === 'poor' ? 'poor' : rating === 'good' ? 'good' : 'ni'
  badge.className = `vital-badge is-${ratingClass}`
  badge.textContent = `整体 ${ratingLabel(rating)}`
  title.append(badge)
  perfHead.append(title)

  perfStats.replaceChildren()
  const stat = (label: string, value: string, rating: VitalRating): HTMLSpanElement => {
    const box = document.createElement('span')
    box.className = 'traffic-stat'
    const v = document.createElement('b')
    v.textContent = value
    const l = document.createElement('i')
    l.textContent = label
    if (rating === 'poor') {
      v.classList.add('is-accent')
    }
    box.append(v, l)
    return box
  }
  perfStats.append(
    stat('LCP', formatVital('lcp', insights.lcpMs), rateVital('lcp', insights.lcpMs)),
    stat('INP', formatVital('inp', insights.inpMs), rateVital('inp', insights.inpMs)),
    stat('CLS', formatVital('cls', insights.cls), rateVital('cls', insights.cls)),
    stat('TTFB', formatVital('ttfb', insights.ttfbMs), rateVital('ttfb', insights.ttfbMs)),
  )
  renderSpeedCountries(project)
}

function renderSpeedCountries(project: VercelProjectInfo): void {
  const insights = project.speedInsights
  perfCountries.replaceChildren()
  if (!insights || insights.countries.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'traffic-pages-empty'
    empty.textContent = '还没有按国家拆开的样本。整体 P75 仍可看，地区明细要等更多真实用户访问'
    perfCountries.append(empty)
    return
  }
  const countries = insights.countries

  const caption = document.createElement('p')
  caption.className = 'traffic-pages-caption'
  caption.textContent = '按国家 · LCP / TTFB · 近 7 天 P75'
  perfCountries.append(caption)

  const head = document.createElement('div')
  head.className = 'tp-row'
  for (const [text, className] of [
    ['国家', 'tp-path'],
    ['LCP', 'tp-pv'],
    ['TTFB', 'tp-pv'],
    ['样本', 'tp-delta'],
  ] as const) {
    const cell = document.createElement('span')
    cell.className = className
    cell.textContent = text
    head.append(cell)
  }
  perfCountries.append(head)

  const ranked = [...countries].sort((left, right) => (right.ttfbMs ?? 0) - (left.ttfbMs ?? 0) || right.samples - left.samples)
  for (const row of ranked.slice(0, 15)) {
    const item = document.createElement('div')
    item.className = 'tp-row'
    const pathEl = document.createElement('span')
    pathEl.className = 'tp-path'
    pathEl.textContent = `${countryName(row.country)} · ${row.country}`
    const lcpEl = document.createElement('span')
    lcpEl.className = 'tp-pv'
    lcpEl.textContent = formatVital('lcp', row.lcpMs)
    const ttfbEl = document.createElement('span')
    ttfbEl.className = 'tp-pv'
    ttfbEl.textContent = formatVital('ttfb', row.ttfbMs)
    const samplesEl = document.createElement('span')
    const ttfbRating = rateVital('ttfb', row.ttfbMs)
    samplesEl.className = `tp-delta${ttfbRating === 'poor' ? ' is-down' : ttfbRating === 'good' ? ' is-up' : ''}`
    samplesEl.textContent = String(row.samples)
    item.append(pathEl, lcpEl, ttfbEl, samplesEl)
    perfCountries.append(item)
  }

  const slow = worstCountry(insights, 'ttfbMs')
  if (slow?.ttfbMs != null) {
    const note = document.createElement('div')
    note.className = 'tp-row'
    note.textContent = `TTFB 最慢是 ${countryName(slow.country)} ${formatVital('ttfb', slow.ttfbMs)}`
    perfCountries.append(note)
  }
}

function isOpenAlert(alert: VercelAlertInfo): boolean {
  return !alert.endedAt && !/resolved|ok|good/i.test(alert.status)
}

/** 报警持续了多久；已恢复的报的是从开始到恢复的跨度。 */
function alertDuration(alert: VercelAlertInfo): string {
  const start = alert.startedAt ? Date.parse(alert.startedAt) : NaN
  if (Number.isNaN(start)) return '时长未知'
  const end = alert.endedAt ? Date.parse(alert.endedAt) : Date.now()
  const minutes = Math.max(0, Math.round((end - start) / 60000))
  if (minutes < 60) return `持续 ${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return minutes % 60 === 0 ? `持续 ${hours} 小时` : `持续 ${hours} 小时 ${minutes % 60} 分`
  }
  const days = Math.floor(hours / 24)
  return hours % 24 === 0 ? `持续 ${days} 天` : `持续 ${days} 天 ${hours % 24} 小时`
}

function renderAlerts(alerts: VercelAlertInfo[], projects: VercelProjectInfo[]): void {
  alertsEl.replaceChildren()
  const open = alerts.filter(isOpenAlert)
  alertsMeta.textContent = alerts.length > 0 ? `${open.length} 未恢复 / ${alerts.length} 条` : '无报警'

  const failing = projects.filter((p) => p.hasProduction && p.state === 'ERROR').length
  alertsSummary.replaceChildren(
    userStatBox('未恢复', String(open.length), open.length > 0),
    userStatBox('已恢复', String(alerts.length - open.length)),
    userStatBox('部署失败站点', String(failing)),
    userStatBox('已上线站点', String(projects.filter((p) => p.hasProduction).length)),
  )

  if (alerts.length === 0) {
    const shipped = projects.filter((p) => p.hasProduction).length
    alertsEl.append(
      emptyRow(
        failing > 0
          ? `没有线上报警，但 ${failing} 个站点最后一次生产部署是失败的`
          : `没有线上报警 ✓ ${shipped} 个站点在线`,
      ),
    )
    return
  }

  // 未恢复的排前面，同组内新的在前。
  const ranked = [...alerts].sort(
    (left, right) =>
      Number(isOpenAlert(right)) - Number(isOpenAlert(left)) ||
      (Date.parse(right.startedAt ?? '') || 0) - (Date.parse(left.startedAt ?? '') || 0),
  )
  for (const a of ranked) {
    const openNow = isOpenAlert(a)
    const meta = [a.status, alertDuration(a), timeAgo(a.startedAt)].filter(Boolean).join(' · ')
    const extra = [a.summary ?? '', a.type].filter(Boolean).join(' · ')
    const li = row(openNow ? a.title : `${a.title}（已恢复）`, meta, extra || undefined, openNow)
    alertsEl.append(li)
  }
}

function renderUserStats(items: ProductStatsRow[], keyMissing: boolean): void {
  usersEl.replaceChildren()
  usersSummary.replaceChildren()
  usersChart.replaceChildren()
  if (keyMissing) {
    usersMeta.textContent = '未配置 key'
    usersSummary.append(
      userStatBox('注册用户', '—', true),
      userStatBox('付费用户', '—'),
      userStatBox('订单', '—'),
      userStatBox('已接入', '—'),
    )
    usersEl.append(emptyRow('需设置 OWNWORKBUDDY_STATS_KEY 环境变量，否则跳过用户统计'))
    return
  }
  if (items.length === 0) {
    usersMeta.textContent = '—'
    usersEl.append(emptyRow('暂无配置 statsOrigin 的产品'))
    return
  }

  const sum = summarizeUsers(items.map((item) => ({ users: item.stats })))
  const failed = items.filter((item) => !item.skipped && item.error).length
  usersMeta.textContent = `${sum.known} 已接入 · ${failed} 失败 · ${items.length - sum.known - failed} 待实现`
  usersSummary.append(
    userStatBox('注册用户', String(sum.registered), true),
    userStatBox('付费用户', String(sum.paid)),
    userStatBox('订单', sum.orders > 0 ? String(sum.orders) : '—'),
    userStatBox('营收', sum.revenue > 0 ? String(sum.revenue) : '—'),
  )

  // 注册条里嵌一段付费，一眼看出各站的付费转化厚度。
  const live = items
    .filter((item) => item.stats.available)
    .sort((left, right) => (right.stats.registered ?? 0) - (left.stats.registered ?? 0))
  const registeredBars = live.map((item) => {
    const registered = item.stats.registered ?? 0
    const paid = item.stats.paid ?? 0
    const rate = registered > 0 ? Math.round((paid / registered) * 100) : 0
    return {
      label: item.productName,
      value: registered,
      inner: paid,
      note: `${registered} 注册 · ${paid} 付费${registered > 0 ? `（${rate}%）` : ''}`,
      tone: 'ok' as const,
    }
  })
  const registeredChart = barChart(registeredBars, '注册与付费对比 · 深色段为付费')
  if (registeredChart) {
    usersChart.append(registeredChart)
  }

  const revenueBars = live
    .filter((item) => (item.stats.revenue ?? 0) > 0)
    .sort((left, right) => (right.stats.revenue ?? 0) - (left.stats.revenue ?? 0))
    .map((item) => ({
      label: item.productName,
      value: item.stats.revenue ?? 0,
      note: `${item.stats.revenue} 元 · ${item.stats.orders ?? 0} 单`,
      tone: 'brass' as const,
    }))
  const revenueChart = barChart(revenueBars, '累计营收对比')
  if (revenueChart) {
    usersChart.append(revenueChart)
  }

  // 已出数的排前面，其次是失败（需要处理），最后是站点侧还没实现的。
  const rank = (item: ProductStatsRow): number =>
    item.stats.available ? 0 : item.skipped ? 2 : 1
  const ranked = [...items].sort(
    (left, right) =>
      rank(left) - rank(right) ||
      (right.stats.registered ?? 0) - (left.stats.registered ?? 0) ||
      left.productName.localeCompare(right.productName, 'zh'),
  )
  for (const item of ranked) {
    const meta = item.stats.available ? statsMeta(item) : (item.error ?? '无数据')
    const li = row(item.productName, meta, item.stats.available ? item.origin : '', !item.skipped && Boolean(item.error))
    if (item.error && !item.skipped) li.classList.add('monitor-users-row-error')
    if (item.skipped) li.classList.add('monitor-users-row-pending')
    usersEl.append(li)
  }
}

function statsMeta(item: ProductStatsRow): string {
  const parts = [`${item.stats.registered ?? 0} 注册`, `${item.stats.paid ?? 0} 付费`]
  if (item.stats.orders !== null) parts.push(`${item.stats.orders} 订单`)
  if (item.stats.revenue !== null) parts.push(`营收 ${item.stats.revenue}`)
  return parts.join(' · ')
}

function renderTomorrow(proposals: AgentTodoDraft[], inbox: AgentInboxResult): void {
  tomorrowEl.replaceChildren()
  const wrote = inbox.created.length + inbox.updated.length
  if (proposals.length === 0) {
    tomorrowMeta.textContent = '未生成'
    tomorrowEl.append(emptyRow('态势平稳，没有新的明日待办'))
    return
  }
  tomorrowMeta.textContent =
    wrote > 0
      ? `已写入工作台 ${inbox.created.length} 新 / ${inbox.updated.length} 更新`
      : inbox.skipped > 0
        ? `已完成 ${inbox.skipped} 条，未重复写入`
        : `${proposals.length} 条`
  for (const draft of proposals) {
    const item = row(draft.title, draft.notifyAt ? '明天 09:00' : '未定时', draft.note)
    if (draft.tags && draft.tags.length > 0) {
      item.append(tagChips(draft.tags))
    }
    tomorrowEl.append(item)
  }
}

function renderOverview(snapshot: MonitorSnapshot, sum: UserStatsSummary): void {
  const projects = snapshot.vercel.projects
  const todayViews = projects.reduce((total, p) => total + (p.analytics?.todayPageviews ?? 0), 0)
  const shipped = projects.filter((p) => p.hasProduction).length
  const open = snapshot.vercel.alerts.filter(isOpenAlert).length

  overviewMeta.textContent = snapshot.vercel.contextName
    ? `scope ${snapshot.vercel.contextName}`
    : ''
  overviewSummary.replaceChildren(
    userStatBox('今日浏览', String(todayViews), true),
    userStatBox('注册 / 付费', `${sum.registered} / ${sum.paid}`),
    userStatBox('已上线站点', `${shipped} / ${projects.length}`),
    userStatBox('未恢复报警', String(open)),
  )
}

/** 侧栏徽标：切到某一组时，其他组有没有事仍然一眼可见。 */
function renderBadges(snapshot: MonitorSnapshot, todoCount: number): void {
  const projects = snapshot.vercel.projects
  const dirty = snapshot.projects.filter((p) => p.isRepo && p.dirty).length
  const fresh = projects.filter((p) => isFreshFailure(p)).length
  const open = snapshot.vercel.alerts.filter(isOpenAlert).length
  const live = snapshot.userStats.filter((item) => item.stats.available).length
  const speedOk = projects.filter((p) => hasSpeedCurve(p)).length
  const speedPoor = projects.filter((p) => siteRating(p.speedInsights) === 'poor').length

  navBadges = {
    projects: dirty > 0 ? { text: String(dirty), tone: 'danger' } : { text: '净', tone: 'ok' },
    deploys: fresh > 0 ? { text: String(fresh), tone: 'danger' } : { text: String(projects.filter((p) => p.hasProduction).length), tone: 'muted' },
    perf: speedPoor > 0 ? { text: String(speedPoor), tone: 'danger' } : speedOk > 0 ? { text: String(speedOk), tone: 'ok' } : { text: '—', tone: 'muted' },
    alerts: open > 0 ? { text: String(open), tone: 'danger' } : { text: '✓', tone: 'ok' },
    users: snapshot.userStatsKeyMissing
      ? { text: '无 key', tone: 'danger' }
      : { text: `${live}/${snapshot.userStats.length}`, tone: 'muted' },
    todos: todoCount > 0 ? { text: String(todoCount), tone: 'muted' } : undefined,
  }
  renderNav()
}

/** 带日期的时间戳；只给时分的话隔天打开会误以为是刚采的。 */
function stampText(iso: string, prefix: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) {
    return ''
  }
  const date = at.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
  const time = at.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return `${prefix} ${date} ${time}`
}

function render(
  snapshot: MonitorSnapshot,
  proposals: AgentTodoDraft[],
  inbox: AgentInboxResult,
): void {
  renderProjects(snapshot.projects)
  renderVercel(snapshot.vercel.projects)
  renderTraffic(snapshot.vercel.projects, snapshot.vercel.error, snapshot.vercel.alerts)
  renderSpeed(snapshot.vercel.projects, snapshot.vercel.error)
  renderAlerts(snapshot.vercel.alerts, snapshot.vercel.projects)
  renderTomorrow(proposals, inbox)
  renderUserStats(snapshot.userStats, snapshot.userStatsKeyMissing)

  const sum = summarizeUsers(snapshot.userStats.map((item) => ({ users: item.stats })))
  const shipped = snapshot.vercel.projects.filter((p) => p.hasProduction).length
  renderOverview(snapshot, sum)
  renderBadges(snapshot, proposals.length)
  setStatus(
    `${snapshot.projects.length} 个项目 · ${shipped}/${snapshot.vercel.projects.length} 个站点已上线 · 注册 ${sum.registered} · 付费 ${sum.paid} · 订单 ${sum.orders} · ${snapshot.vercel.alerts.length} 条报警 · 明日待办 ${proposals.length} 条`,
  )
}

async function refresh(): Promise<void> {
  if (loading) return
  loading = true
  refreshBtn.disabled = true
  const hadData = Boolean(updatedEl.textContent)
  // 已经有缓存上屏时不要清掉状态行里的数字，只在末尾挂一句「后台刷新中」。
  if (hadData) {
    statusEl.dataset.refreshing = 'true'
  } else {
    setStatus('正在采集项目、站点与后台用户…')
  }
  try {
    const result = await window.ownworkbuddy.monitor.refresh()
    delete statusEl.dataset.refreshing
    render(result.snapshot, result.proposals, result.inbox)
    updatedEl.textContent = stampText(result.snapshot.vercel.fetchedAt, '更新于')
  } catch (err) {
    delete statusEl.dataset.refreshing
    const message = `采集失败：${err instanceof Error ? err.message : String(err)}`
    // 有缓存时别把已有数据的状态行覆盖成纯错误，注明看到的是旧数据。
    setStatus(hadData ? `${message}（当前显示的是上次缓存）` : message, true)
  } finally {
    loading = false
    refreshBtn.disabled = false
  }
}

/** 先把上次的结果铺上去，避免开面板时看到空壳；随后由 refresh 覆盖。 */
async function showCached(): Promise<boolean> {
  try {
    const cached = await window.ownworkbuddy.monitor.cached()
    if (!cached) return false
    render(cached.snapshot, cached.proposals, { created: [], updated: [], skipped: 0 })
    updatedEl.textContent = stampText(cached.cachedAt, '缓存于')
    return true
  } catch {
    return false
  }
}

export function activateMonitor(): void {
  if (!bound) {
    refreshBtn.addEventListener('click', () => void refresh())
    bound = true
  }
  selectGroup(currentGroup)
  if (updatedEl.textContent) {
    return
  }
  void (async () => {
    await showCached()
    await refresh()
  })()
}
