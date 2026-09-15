import type {
  SpeedCountryPoint,
  SpeedInsightsState,
  VercelProjectInfo,
  VercelSpeedInsights,
} from './monitor.ts'

export type VitalId = 'lcp' | 'inp' | 'cls' | 'ttfb'
export type VitalRating = 'good' | 'ni' | 'poor' | 'unknown'
export type MetricsCliStatus = 'ok' | 'unsupported' | 'failed'

export interface MetricSample {
  projectId: string
  country: string | null
  value: number | null
  samples: number
  timestamp: string
}

export const SPEED_WINDOW_DAYS = 7

const THRESHOLDS: Record<VitalId, { good: number; ni: number }> = {
  lcp: { good: 2500, ni: 4000 },
  inp: { good: 200, ni: 500 },
  cls: { good: 0.1, ni: 0.25 },
  ttfb: { good: 800, ni: 1800 },
}

const COUNTRY_NAMES: Record<string, string> = {
  US: '美国',
  CN: '中国',
  JP: '日本',
  KR: '韩国',
  SG: '新加坡',
  HK: '香港',
  TW: '台湾',
  DE: '德国',
  GB: '英国',
  UK: '英国',
  FR: '法国',
  IN: '印度',
  AU: '澳大利亚',
  CA: '加拿大',
  BR: '巴西',
  NL: '荷兰',
  IE: '爱尔兰',
  IT: '意大利',
  ES: '西班牙',
  SE: '瑞典',
  CH: '瑞士',
  PL: '波兰',
  RU: '俄罗斯',
  MX: '墨西哥',
  ID: '印尼',
  TH: '泰国',
  VN: '越南',
  MY: '马来西亚',
  PH: '菲律宾',
  AE: '阿联酋',
  SA: '沙特',
  ZA: '南非',
  NZ: '新西兰',
  TR: '土耳其',
  AR: '阿根廷',
  IL: '以色列',
  FI: '芬兰',
  NO: '挪威',
  DK: '丹麦',
  BE: '比利时',
  AT: '奥地利',
  PT: '葡萄牙',
  CZ: '捷克',
}

export const SPEED_METRICS = [
  { id: 'vercel.speed_insights.lcp_ms', field: 'lcpMs' },
  { id: 'vercel.speed_insights.inp_ms', field: 'inpMs' },
  { id: 'vercel.speed_insights.cls', field: 'cls' },
  { id: 'vercel.speed_insights.ttfb_ms', field: 'ttfbMs' },
] as const

export type SpeedMetricField = (typeof SPEED_METRICS)[number]['field']

export function rateVital(id: VitalId, value: number | null | undefined): VitalRating {
  if (value == null || !Number.isFinite(value)) {
    return 'unknown'
  }
  const { good, ni } = THRESHOLDS[id]
  if (value <= good) return 'good'
  if (value <= ni) return 'ni'
  return 'poor'
}

export function ratingLabel(rating: VitalRating): string {
  switch (rating) {
    case 'good':
      return '好'
    case 'ni':
      return '待改进'
    case 'poor':
      return '差'
    case 'unknown':
      return '—'
    default: {
      const exhaustive: never = rating
      return exhaustive
    }
  }
}

export function countryName(code: string): string {
  const key = code.trim().toUpperCase()
  return COUNTRY_NAMES[key] ?? key
}

export function formatMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) {
    return '—'
  }
  if (Math.abs(ms) >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`
  }
  return `${Math.round(ms)}ms`
}

export function formatCls(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return '—'
  }
  return value.toFixed(3)
}

export function formatVital(id: VitalId, value: number | null | undefined): string {
  return id === 'cls' ? formatCls(value) : formatMs(value)
}

export function speedStateOf(project: Pick<VercelProjectInfo, 'hasSpeedInsights' | 'speedInsightsState'>): SpeedInsightsState {
  return project.speedInsightsState ?? (project.hasSpeedInsights ? 'empty' : 'disabled')
}

export function hasSpeedCurve(project: VercelProjectInfo): boolean {
  const insights = project.speedInsights
  if (!insights || speedStateOf(project) !== 'ok') {
    return false
  }
  return hasAnyVital(insights)
}

export function hasAnyVital(insights: VercelSpeedInsights): boolean {
  return (
    insights.lcpMs != null ||
    insights.inpMs != null ||
    insights.cls != null ||
    insights.ttfbMs != null ||
    insights.countries.length > 0
  )
}

/** 站点整体评级：整体或任一国家的核心指标为差则差。 */
export function siteRating(insights: VercelSpeedInsights | null | undefined): VitalRating {
  if (!insights) {
    return 'unknown'
  }
  const ratings: VitalRating[] = [
    rateVital('lcp', insights.lcpMs),
    rateVital('inp', insights.inpMs),
    rateVital('cls', insights.cls),
    rateVital('ttfb', insights.ttfbMs),
  ]
  for (const row of insights.countries) {
    ratings.push(
      rateVital('lcp', row.lcpMs),
      rateVital('inp', row.inpMs),
      rateVital('cls', row.cls),
      rateVital('ttfb', row.ttfbMs),
    )
  }
  if (ratings.includes('poor')) return 'poor'
  if (ratings.includes('ni')) return 'ni'
  if (ratings.includes('good')) return 'good'
  return 'unknown'
}

export function worstCountry(
  insights: VercelSpeedInsights,
  field: 'lcpMs' | 'ttfbMs',
): SpeedCountryPoint | null {
  const ranked = insights.countries.filter((row) => row[field] != null)
  if (ranked.length === 0) {
    return null
  }
  return ranked.reduce((worst, row) => ((row[field] ?? 0) > (worst[field] ?? 0) ? row : worst))
}

export function extractJsonObject(raw: string): unknown {
  const start = raw.indexOf('{')
  if (start < 0) {
    return null
  }
  try {
    return JSON.parse(raw.slice(start)) as unknown
  } catch {
    return null
  }
}

export function metricsCliFailure(raw: string, parsed: unknown): MetricsCliStatus | null {
  if (/unknown command|not a vercel command|command not found/i.test(raw)) {
    return 'unsupported'
  }
  if (!parsed || typeof parsed !== 'object') {
    return 'failed'
  }
  const record = parsed as { error?: unknown; code?: string; message?: string }
  if (record.error) {
    const message = typeof record.error === 'string' ? record.error : JSON.stringify(record.error)
    if (/observability plus|upgrade/i.test(message)) {
      return 'unsupported'
    }
    if (/unknown command|not (?:a )?valid/i.test(message)) {
      return 'unsupported'
    }
    return 'failed'
  }
  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function asRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((item) => {
    const row = asRecord(item)
    return row ? [row] : []
  })
}

function numeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function pick(row: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      return row[key]
    }
  }
  const lower = new Map(Object.keys(row).map((key) => [key.toLowerCase(), row[key]]))
  for (const key of keys) {
    const hit = lower.get(key.toLowerCase())
    if (hit !== undefined && hit !== null) {
      return hit
    }
  }
  return undefined
}

function rollupKeys(metric: string, aggregation: string): string[] {
  const underscored = `${metric.replace(/\./g, '_')}_${aggregation}`
  return ['value', aggregation, underscored, metric]
}

function countKeys(metric: string): string[] {
  const underscored = `${metric.replace(/\./g, '_')}_count`
  return ['count', 'samples', underscored, `${metric}_count`]
}

export function parseMetricSamples(raw: unknown, metric: string, aggregation: string): MetricSample[] {
  const root = asRecord(raw)
  if (!root) {
    return []
  }
  const rows = asRows(root.data)
  const valueKeys = rollupKeys(metric, aggregation)
  const sampleKeys = countKeys(metric)
  const byGroup = new Map<string, MetricSample>()

  for (const row of rows) {
    const projectId =
      text(pick(row, ['projectId', 'project_id', 'project'])) ??
      text(pick(row, ['projectName', 'project_name']))
    if (!projectId) {
      continue
    }
    const countryRaw = text(pick(row, ['country', 'countryCode', 'country_code', 'clientCountry']))
    const country = countryRaw && countryRaw !== 'Others' ? countryRaw.toUpperCase() : null
    const timestamp = text(pick(row, ['timestamp'])) ?? ''
    const value = numeric(pick(row, valueKeys))
    const samples = numeric(pick(row, sampleKeys)) ?? 0
    const key = `${projectId}\0${country ?? ''}`
    const existing = byGroup.get(key)
    if (!existing || timestamp > existing.timestamp) {
      byGroup.set(key, { projectId, country, value, samples, timestamp })
    }
  }

  return [...byGroup.values()]
}

export function emptySpeedInsights(): VercelSpeedInsights {
  return { lcpMs: null, inpMs: null, cls: null, ttfbMs: null, samples: 0, countries: [] }
}

function ensureProject(map: Map<string, VercelSpeedInsights>, projectId: string): VercelSpeedInsights {
  const existing = map.get(projectId)
  if (existing) {
    return existing
  }
  const created = emptySpeedInsights()
  map.set(projectId, created)
  return created
}

function ensureCountry(insights: VercelSpeedInsights, country: string): SpeedCountryPoint {
  const existing = insights.countries.find((row) => row.country === country)
  if (existing) {
    return existing
  }
  const created: SpeedCountryPoint = {
    country,
    lcpMs: null,
    inpMs: null,
    cls: null,
    ttfbMs: null,
    samples: 0,
  }
  insights.countries.push(created)
  return created
}

export function mergeSpeedSamples(
  buckets: Partial<Record<SpeedMetricField, readonly MetricSample[]>>,
): Map<string, VercelSpeedInsights> {
  const map = new Map<string, VercelSpeedInsights>()
  for (const metric of SPEED_METRICS) {
    for (const sample of buckets[metric.field] ?? []) {
      const insights = ensureProject(map, sample.projectId)
      if (sample.country) {
        const country = ensureCountry(insights, sample.country)
        country[metric.field] = sample.value
        country.samples = Math.max(country.samples, sample.samples)
      } else {
        insights[metric.field] = sample.value
        insights.samples = Math.max(insights.samples, sample.samples)
      }
    }
  }
  for (const insights of map.values()) {
    insights.countries.sort((left, right) => right.samples - left.samples || left.country.localeCompare(right.country))
  }
  return map
}

export function applySpeedInsights(
  projects: VercelProjectInfo[],
  byProject: Map<string, VercelSpeedInsights>,
  cli: MetricsCliStatus,
): void {
  const byName = new Map<string, VercelSpeedInsights>()
  for (const [id, insights] of byProject) {
    byName.set(id, insights)
  }

  for (const project of projects) {
    const insights = byProject.get(project.id) ?? byName.get(project.name)
    if (cli === 'unsupported') {
      project.speedInsightsState = project.hasSpeedInsights ? 'unsupported' : 'disabled'
      project.speedInsights = null
      continue
    }
    if (insights && hasAnyVital(insights)) {
      project.hasSpeedInsights = true
      project.speedInsights = insights
      project.speedInsightsState = 'ok'
      continue
    }
    if (cli === 'failed' && project.hasSpeedInsights) {
      project.speedInsightsState = 'failed'
      project.speedInsights = null
      continue
    }
    if (project.hasSpeedInsights) {
      project.speedInsightsState = 'empty'
      project.speedInsights = insights ?? null
      continue
    }
    project.speedInsightsState = 'disabled'
    project.speedInsights = null
  }
}

export function speedEmptyReason(projects: VercelProjectInfo[]): string {
  const shipped = projects.filter((project) => project.hasProduction)
  if (shipped.length === 0) {
    return '还没有已上线站点，谈不上全球性能。'
  }
  const unsupported = shipped.filter((project) => speedStateOf(project) === 'unsupported').length
  const failed = shipped.filter((project) => speedStateOf(project) === 'failed').length
  const disabled = shipped.filter((project) => speedStateOf(project) === 'disabled').length
  if (unsupported > 0) {
    return '本机 vercel CLI 还不支持 `metrics` 查询。升级 CLI 后刷新，才能看全球 Web Vitals'
  }
  if (failed > 0) {
    return `${failed} 个站点已开通 Speed Insights 但拉取失败，检查 vercel CLI 登录状态与团队 scope`
  }
  if (disabled > 0 && disabled === shipped.length) {
    return '已上线站点还没在 Vercel 打开 Speed Insights，打开后才有全球 LCP / TTFB'
  }
  if (disabled > 0) {
    return `${disabled} 个已上线站点还没打开 Speed Insights，打开后才有各地区性能`
  }
  return '已开通 Speed Insights 的站点暂时没有落到近 7 天样本'
}

export function poorVitalTodos(project: VercelProjectInfo): { vital: VitalId; value: number; where: string }[] {
  const insights = project.speedInsights
  if (!insights || speedStateOf(project) !== 'ok') {
    return []
  }
  const hits: { vital: VitalId; value: number; where: string }[] = []
  const overall: Array<[VitalId, number | null]> = [
    ['lcp', insights.lcpMs],
    ['inp', insights.inpMs],
    ['ttfb', insights.ttfbMs],
    ['cls', insights.cls],
  ]
  for (const [vital, value] of overall) {
    if (value != null && rateVital(vital, value) === 'poor') {
      hits.push({ vital, value, where: '全球 P75' })
    }
  }
  const slow = worstCountry(insights, 'ttfbMs')
  if (slow?.ttfbMs != null && rateVital('ttfb', slow.ttfbMs) === 'poor') {
    const already = hits.some((hit) => hit.vital === 'ttfb')
    if (!already) {
      hits.push({ vital: 'ttfb', value: slow.ttfbMs, where: `${countryName(slow.country)}` })
    }
  }
  return hits
}
