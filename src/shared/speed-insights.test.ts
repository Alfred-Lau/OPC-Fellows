import assert from 'node:assert/strict'
import test from 'node:test'
import type { VercelProjectInfo } from './monitor.ts'
import {
  applySpeedInsights,
  countryName,
  formatMs,
  formatVital,
  mergeSpeedSamples,
  parseMetricSamples,
  rateVital,
  ratingLabel,
  siteRating,
  speedEmptyReason,
  speedStateOf,
  worstCountry,
} from './speed-insights.ts'

function project(partial: Partial<VercelProjectInfo> = {}): VercelProjectInfo {
  return {
    id: 'prj_demo',
    name: 'demo',
    url: 'demo.example',
    state: 'READY',
    updatedAt: 1,
    lastCommitMessage: null,
    lastCommitRef: 'main',
    hasAnalytics: false,
    analyticsState: 'disabled',
    analytics: null,
    hasSpeedInsights: false,
    hasProduction: true,
    users: null,
    ...partial,
  }
}

test('Web Vitals 阈值按 Google 口径分级', () => {
  assert.equal(rateVital('lcp', 2400), 'good')
  assert.equal(rateVital('lcp', 2500), 'good')
  assert.equal(rateVital('lcp', 2501), 'ni')
  assert.equal(rateVital('lcp', 4001), 'poor')
  assert.equal(rateVital('inp', 200), 'good')
  assert.equal(rateVital('inp', 501), 'poor')
  assert.equal(rateVital('cls', 0.1), 'good')
  assert.equal(rateVital('cls', 0.26), 'poor')
  assert.equal(rateVital('ttfb', 800), 'good')
  assert.equal(rateVital('ttfb', 1801), 'poor')
  assert.equal(rateVital('lcp', null), 'unknown')
  assert.equal(ratingLabel('ni'), '待改进')
})

test('解析 vercel metrics JSON：rollup 列、projectId、国家码', () => {
  const samples = parseMetricSamples(
    {
      data: [
        {
          timestamp: '2026-09-10T00:00:00.000Z',
          projectId: 'prj_a',
          country: 'jp',
          vercel_speed_insights_lcp_ms_p75: 3200,
          count: 40,
        },
        {
          timestamp: '2026-09-09T00:00:00.000Z',
          projectId: 'prj_a',
          country: 'JP',
          value: 4100,
          count: 12,
        },
        {
          timestamp: '2026-09-10T00:00:00.000Z',
          project_id: 'prj_b',
          value: 1800,
          samples: 80,
        },
        { timestamp: '2026-09-10T00:00:00.000Z', country: 'US', value: 900 },
      ],
    },
    'vercel.speed_insights.lcp_ms',
    'p75',
  )
  const japan = samples.find((row) => row.projectId === 'prj_a' && row.country === 'JP')
  const overall = samples.find((row) => row.projectId === 'prj_b' && row.country === null)
  assert.equal(japan?.value, 3200)
  assert.equal(japan?.samples, 40)
  assert.equal(overall?.value, 1800)
  assert.equal(
    samples.some((row) => row.projectId === '' || row.country === 'US' && !row.projectId),
    false,
  )
})

test('按站点和国家合并四项指标，国家按样本降序', () => {
  const map = mergeSpeedSamples({
    lcpMs: [
      { projectId: 'prj_a', country: null, value: 2100, samples: 90, timestamp: '' },
      { projectId: 'prj_a', country: 'US', value: 1800, samples: 50, timestamp: '' },
      { projectId: 'prj_a', country: 'JP', value: 3600, samples: 20, timestamp: '' },
    ],
    ttfbMs: [
      { projectId: 'prj_a', country: null, value: 700, samples: 90, timestamp: '' },
      { projectId: 'prj_a', country: 'JP', value: 1900, samples: 20, timestamp: '' },
    ],
    inpMs: [{ projectId: 'prj_a', country: null, value: 160, samples: 70, timestamp: '' }],
    cls: [{ projectId: 'prj_a', country: null, value: 0.04, samples: 70, timestamp: '' }],
  })
  const insights = map.get('prj_a')
  assert.ok(insights)
  assert.equal(insights.lcpMs, 2100)
  assert.equal(insights.ttfbMs, 700)
  assert.equal(insights.countries[0]?.country, 'US')
  assert.equal(insights.countries[1]?.ttfbMs, 1900)
  assert.equal(siteRating(insights), 'poor')
  assert.equal(worstCountry(insights, 'ttfbMs')?.country, 'JP')
  assert.equal(countryName('JP'), '日本')
  assert.equal(formatMs(2100), '2.1s')
  assert.equal(formatVital('cls', 0.04), '0.040')
})

test('没有已上线站点时不假装没开 Speed Insights', () => {
  assert.match(speedEmptyReason([]), /还没有已上线站点/)
})

test('CLI 不支持时只给已开通站点标 unsupported，不编数字', () => {
  const projects = [
    project({ id: 'on', name: 'on', hasSpeedInsights: true }),
    project({ id: 'off', name: 'off', hasSpeedInsights: false }),
  ]
  applySpeedInsights(projects, new Map(), 'unsupported')
  assert.equal(speedStateOf(projects[0]), 'unsupported')
  assert.equal(projects[0]?.speedInsights, null)
  assert.equal(speedStateOf(projects[1]), 'disabled')
  assert.match(speedEmptyReason(projects), /metrics/)
})

test('有样本的站点标 ok；开通但没数标 empty', () => {
  const projects = [
    project({ id: 'prj_a', name: 'alpha', hasSpeedInsights: true }),
    project({ id: 'prj_b', name: 'beta', hasSpeedInsights: true }),
  ]
  const map = mergeSpeedSamples({
    lcpMs: [{ projectId: 'prj_a', country: null, value: 1200, samples: 30, timestamp: '' }],
  })
  applySpeedInsights(projects, map, 'ok')
  assert.equal(speedStateOf(projects[0]), 'ok')
  assert.equal(projects[0]?.speedInsights?.lcpMs, 1200)
  assert.equal(speedStateOf(projects[1]), 'empty')
})
