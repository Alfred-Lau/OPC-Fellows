import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TopPagePoint, TrafficDailyPoint, VercelAlertInfo, VercelProjectInfo } from './monitor.ts'
import { buildTrafficInsights, MIN_REASONS } from './traffic-insights.ts'

const NOW = Date.parse('2026-09-03T21:00:00.000Z')
const DAY = 86400000

/** 造 30 天曲线，最后一天是 today，倒数第二天是 yesterday，其余用 base。 */
function daily(
  base: number,
  yesterday: number,
  today: number,
  visitorRatio = 0.5,
): TrafficDailyPoint[] {
  const points: TrafficDailyPoint[] = []
  for (let i = 0; i < 30; i += 1) {
    const views = i === 29 ? today : i === 28 ? yesterday : base
    points.push({
      date: new Date(NOW - (29 - i) * DAY).toISOString().slice(0, 10),
      pageviews: views,
      visitors: Math.max(1, Math.round(views * visitorRatio)),
    })
  }
  return points
}

function project(
  name: string,
  points: TrafficDailyPoint[],
  extra: Partial<VercelProjectInfo> = {},
): VercelProjectInfo {
  const today = points[points.length - 1].pageviews
  const yesterday = points[points.length - 2].pageviews
  return {
    id: `prj_${name}`,
    name,
    url: `${name}.example.com`,
    state: 'READY',
    updatedAt: NOW - 30 * DAY,
    lastCommitMessage: 'chore: 常规更新',
    lastCommitRef: 'main',
    hasAnalytics: true,
    analyticsState: 'ok',
    analytics: {
      visitors: points.reduce((sum, p) => sum + p.visitors, 0),
      pageviews: points.reduce((sum, p) => sum + p.pageviews, 0),
      daily: points,
      todayPageviews: today,
      yesterdayPageviews: yesterday,
      deltaPct: yesterday > 0 ? Math.round(((today - yesterday) / yesterday) * 100) : null,
      isGrowing: today > yesterday,
    },
    hasSpeedInsights: false,
    hasProduction: true,
    users: null,
    ...extra,
  }
}

test('上涨与回落的站点各自被分到 up / down', () => {
  const report = buildTrafficInsights(
    [project('rising', daily(100, 100, 180)), project('falling', daily(100, 100, 40))],
    [],
    NOW,
  )
  assert.deepEqual(report.up.map((i) => i.name), ['rising'])
  assert.deepEqual(report.down.map((i) => i.name), ['falling'])
})

test('每个涨跌站点都至少给出两条归因', () => {
  const report = buildTrafficInsights(
    [
      project('rising', daily(100, 100, 180)),
      project('falling', daily(100, 100, 40)),
      project('tiny', daily(3, 4, 9)),
      project('flat-ish', daily(50, 50, 52)),
    ],
    [],
    NOW,
  )
  const all = [...report.up, ...report.down]
  assert.equal(all.length, 4)
  for (const insight of all) {
    assert.ok(
      insight.reasons.length >= MIN_REASONS,
      `${insight.name} 只有 ${insight.reasons.length} 条归因`,
    )
  }
})

test('持平的站点既不算涨也不算跌', () => {
  const report = buildTrafficInsights([project('flat', daily(100, 100, 100))], [], NOW)
  assert.equal(report.up.length, 0)
  assert.equal(report.down.length, 0)
  assert.match(report.headline, /各站与昨日持平/)
})

test('连续多天上升会被识别成趋势而不是单日抖动', () => {
  const climbing = daily(50, 90, 140)
  climbing[26].pageviews = 60
  climbing[27].pageviews = 70
  const report = buildTrafficInsights([project('climb', climbing)], [], NOW)
  assert.ok(report.up[0].reasons.some((text) => /连续 \d+ 天走高/.test(text)))
})

test('刷新区间新高会被点出来', () => {
  const report = buildTrafficInsights([project('peak', daily(100, 110, 400))], [], NOW)
  assert.ok(report.up[0].reasons.some((text) => text.includes('刷新近')))
})

test('近期部署会作为归因给出，且带上 commit', () => {
  const report = buildTrafficInsights(
    [
      project('shipped', daily(100, 100, 200), {
        updatedAt: NOW - 12 * 3600000,
        lastCommitMessage: 'perf: 首页改成静态预渲染',
      }),
    ],
    [],
    NOW,
  )
  const hit = report.up[0].reasons.find((text) => text.includes('生产部署'))
  assert.ok(hit, '应该有部署归因')
  assert.ok(hit.includes('perf: 首页改成静态预渲染'))
})

test('未恢复的报警会关联到对应站点的回落归因', () => {
  const alerts: VercelAlertInfo[] = [
    {
      id: 'a1',
      title: '5xx 错误率升高',
      type: 'error_rate',
      status: 'triggered',
      startedAt: new Date(NOW - 3600000).toISOString(),
      endedAt: null,
      summary: 'broken 生产环境 5xx 占比 4%',
    },
  ]
  const report = buildTrafficInsights([project('broken', daily(100, 100, 30))], alerts, NOW)
  assert.ok(report.down[0].reasons.some((text) => text.includes('未恢复报警')))
})

test('已恢复的报警不再作为归因', () => {
  const alerts: VercelAlertInfo[] = [
    {
      id: 'a1',
      title: '早已修好',
      type: 'error_rate',
      status: 'resolved',
      startedAt: new Date(NOW - 5 * DAY).toISOString(),
      endedAt: new Date(NOW - 4 * DAY).toISOString(),
      summary: 'broken 生产环境 5xx 占比 4%',
    },
  ]
  const report = buildTrafficInsights([project('broken', daily(100, 100, 30))], alerts, NOW)
  assert.ok(!report.down[0].reasons.some((text) => text.includes('未恢复报警')))
})

test('基数小的涨幅会提示别过度解读', () => {
  const report = buildTrafficInsights([project('tiny', daily(2, 2, 8))], [], NOW)
  assert.ok(report.up[0].reasons.some((text) => text.includes('基数偏小')))
})

test('人均页数上升时归因指向浏览更深而非拉新', () => {
  const points = daily(100, 100, 200)
  // 昨日 100 浏览 / 50 访客 = 2 页；今日 200 浏览 / 55 访客 ≈ 3.6 页
  points[29].visitors = 55
  const report = buildTrafficInsights([project('deep', points)], [], NOW)
  assert.ok(report.up[0].reasons.some((text) => text.includes('浏览更深')))
})

test('部署失败的站点会被点明线上可能还是旧版本', () => {
  const report = buildTrafficInsights(
    [project('stuck', daily(100, 100, 40), { state: 'ERROR' })],
    [],
    NOW,
  )
  assert.ok(report.down[0].reasons.some((text) => text.includes('部署是失败的')))
})

test('影响大的站点排在前面', () => {
  const report = buildTrafficInsights(
    [project('small-gain', daily(10, 10, 20)), project('big-gain', daily(100, 100, 300))],
    [],
    NOW,
  )
  assert.deepEqual(report.up.map((i) => i.name), ['big-gain', 'small-gain'])
})

test('汇总数字与占比按站点浏览量计算', () => {
  const report = buildTrafficInsights(
    [project('a', daily(100, 100, 150)), project('b', daily(50, 50, 50))],
    [],
    NOW,
  )
  assert.equal(report.totalToday, 200)
  assert.equal(report.totalYesterday, 150)
  assert.equal(report.totalDeltaPct, 33)
  assert.equal(report.siteCount, 2)
  assert.equal(report.up[0].sharePct, 75)
})

test('没有流量数据时给出明确 headline 而不是空字符串', () => {
  const report = buildTrafficInsights([], [], NOW)
  assert.equal(report.siteCount, 0)
  assert.equal(report.headline, '还没有站点回传流量数据')
})

function withTopPages(info: VercelProjectInfo, topPages: TopPagePoint[]): VercelProjectInfo {
  if (!info.analytics) return info
  return { ...info, analytics: { ...info.analytics, topPages } }
}

test('页面增量集中时上涨归因指向贡献最大的 path，并排在前面', () => {
  const report = buildTrafficInsights(
    [
      withTopPages(project('demo', daily(100, 100, 180)), [
        {
          path: '/knowledge/did/event-study',
          pageviews: 80,
          visitors: 70,
          prevPageviews: 30,
          prevVisitors: 30,
          deltaPct: 167,
        },
        {
          path: '/',
          pageviews: 40,
          visitors: 30,
          prevPageviews: 35,
          prevVisitors: 28,
          deltaPct: 14,
        },
      ]),
    ],
    [],
    NOW,
  )
  assert.equal(report.up[0].reasons[0], '近 7 天增量主要来自 /knowledge/did/event-study(+50 次)')
})

test('页面掉量集中时回落归因指向拖累最大的 path，并排在前面', () => {
  const report = buildTrafficInsights(
    [
      withTopPages(project('blog', daily(100, 100, 40)), [
        {
          path: '/blog/xxx',
          pageviews: 10,
          visitors: 8,
          prevPageviews: 60,
          prevVisitors: 50,
          deltaPct: -83,
        },
        {
          path: '/',
          pageviews: 40,
          visitors: 30,
          prevPageviews: 45,
          prevVisitors: 32,
          deltaPct: -11,
        },
      ]),
    ],
    [],
    NOW,
  )
  assert.equal(report.down[0].reasons[0], '/blog/xxx 掉了 50 次，拖累整体')
})

test('编码过的 path 在页面归因里会 decode 后再展示', () => {
  const report = buildTrafficInsights(
    [
      withTopPages(project('demo', daily(100, 100, 180)), [
        {
          path: '/knowledge/topic-basics/26-%e6%a0%87%e5%87%86%e5%8c%96-vs-%e5%8f%96%e5%af%b9%e6%95%b0',
          pageviews: 40,
          visitors: 30,
          prevPageviews: 10,
          prevVisitors: 10,
          deltaPct: 300,
        },
      ]),
    ],
    [],
    NOW,
  )
  assert.equal(
    report.up[0].reasons[0],
    '近 7 天增量主要来自 /knowledge/topic-basics/26-标准化-vs-取对数(+30 次)',
  )
})

test('仅当前窗口出现的新页面按从 0 起算增量参与归因', () => {
  const report = buildTrafficInsights(
    [
      withTopPages(project('demo', daily(100, 100, 180)), [
        { path: '/new-post', pageviews: 40, visitors: 30, deltaPct: null },
        {
          path: '/',
          pageviews: 20,
          visitors: 15,
          prevPageviews: 18,
          prevVisitors: 14,
          deltaPct: 11,
        },
      ]),
    ],
    [],
    NOW,
  )
  assert.equal(report.up[0].reasons[0], '近 7 天增量主要来自 /new-post(+40 次)')
})

test('总增量过小或页面分布太散时不强行做页面归因', () => {
  const small = buildTrafficInsights(
    [
      withTopPages(project('tiny-page', daily(100, 100, 180)), [
        {
          path: '/x',
          pageviews: 8,
          visitors: 5,
          prevPageviews: 3,
          prevVisitors: 2,
          deltaPct: 167,
        },
      ]),
    ],
    [],
    NOW,
  )
  assert.ok(!small.up[0].reasons.some((text) => text.includes('增量主要来自')))

  const scatteredPages: TopPagePoint[] = [1, 2, 3, 4, 5, 6].map((i) => ({
    path: `/p/${i}`,
    pageviews: 20,
    visitors: 10,
    prevPageviews: 10,
    prevVisitors: 8,
    deltaPct: 100,
  }))
  const scattered = buildTrafficInsights(
    [withTopPages(project('spread', daily(100, 100, 180)), scatteredPages)],
    [],
    NOW,
  )
  assert.ok(!scattered.up[0].reasons.some((text) => text.includes('增量主要来自')))
})
