import { execFile } from 'node:child_process'
import { ensureDesktopPath } from './cli-path'
import type { VercelProjectInfo } from '../shared/monitor'
import {
  SPEED_METRICS,
  SPEED_WINDOW_DAYS,
  applySpeedInsights,
  extractJsonObject,
  mergeSpeedSamples,
  metricsCliFailure,
  parseMetricSamples,
  type MetricsCliStatus,
  type SpeedMetricField,
  type MetricSample,
} from '../shared/speed-insights'

const METRICS_TIMEOUT_MS = 60000

function runMetrics(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      {
        timeout: METRICS_TIMEOUT_MS,
        encoding: 'utf-8',
        maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, PATH: ensureDesktopPath() },
      },
      (_error, stdout, stderr) => {
        const out = typeof stdout === 'string' ? stdout : ''
        const err = typeof stderr === 'string' ? stderr : ''
        resolve([out, err].filter((part) => part.trim()).join('\n').trim())
      },
    )
  })
}

async function probeMetrics(bin: string): Promise<MetricsCliStatus> {
  const raw = await runMetrics(bin, ['metrics', '--help'])
  if (/unknown command|not a vercel command|command not found/i.test(raw)) {
    return 'unsupported'
  }
  if (!raw) {
    return 'failed'
  }
  if (!/\bmetrics\b/i.test(raw) && /usage:/i.test(raw)) {
    return 'unsupported'
  }
  return 'ok'
}

async function queryMetric(
  bin: string,
  metric: string,
  groupBy: string[],
): Promise<{ status: MetricsCliStatus; samples: MetricSample[] }> {
  const args = [
    'metrics',
    metric,
    '--aggregation',
    'p75',
    '--since',
    `${SPEED_WINDOW_DAYS}d`,
    '--prod',
    '--format',
    'json',
    '--limit',
    '100',
    '--all',
  ]
  for (const dim of groupBy) {
    args.push('--group-by', dim)
  }
  const raw = await runMetrics(bin, args)
  if (!raw) {
    return { status: 'failed', samples: [] }
  }
  const parsed = extractJsonObject(raw)
  const failure = metricsCliFailure(raw, parsed)
  if (failure) {
    return { status: failure, samples: [] }
  }
  return { status: 'ok', samples: parseMetricSamples(parsed, metric, 'p75') }
}

export async function attachSpeedInsights(bin: string, projects: VercelProjectInfo[]): Promise<void> {
  const shipped = projects.filter((project) => project.hasProduction)
  if (shipped.length === 0) {
    applySpeedInsights(projects, new Map(), 'ok')
    return
  }

  const probed = await probeMetrics(bin)
  if (probed === 'unsupported') {
    applySpeedInsights(projects, new Map(), 'unsupported')
    return
  }

  const overall = await Promise.all(
    SPEED_METRICS.map(async (metric) => {
      const result = await queryMetric(bin, metric.id, ['projectId'])
      return { field: metric.field, ...result }
    }),
  )
  const unsupported = overall.find((item) => item.status === 'unsupported')
  if (unsupported) {
    applySpeedInsights(projects, new Map(), 'unsupported')
    return
  }

  const regional = await Promise.all([
    queryMetric(bin, 'vercel.speed_insights.lcp_ms', ['projectId', 'country']),
    queryMetric(bin, 'vercel.speed_insights.ttfb_ms', ['projectId', 'country']),
  ])
  const buckets: Partial<Record<SpeedMetricField, MetricSample[]>> = {}
  for (const item of overall) {
    buckets[item.field] = item.samples
  }
  buckets.lcpMs = [...(buckets.lcpMs ?? []), ...regional[0].samples]
  buckets.ttfbMs = [...(buckets.ttfbMs ?? []), ...regional[1].samples]

  const failed = [...overall, ...regional].some((item) => item.status === 'failed')
  const hasAny = overall.some((item) => item.samples.length > 0) || regional.some((item) => item.samples.length > 0)
  const cli: MetricsCliStatus = hasAny || !failed ? 'ok' : 'failed'
  applySpeedInsights(projects, mergeSpeedSamples(buckets), cli)
}
