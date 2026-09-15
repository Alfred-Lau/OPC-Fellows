import assert from 'node:assert/strict'
import test from 'node:test'
import { proposeMonitorTodos } from './monitor-todos.ts'
import type { MonitorSnapshot } from './monitor.ts'
import { OPC_PROJECT_TAG } from './tags.ts'

function snapshot(partial: Partial<MonitorSnapshot['projects'][number]>[] = [], vercel: Partial<MonitorSnapshot['vercel']> = {}): MonitorSnapshot {
  return {
    projects: partial.map((project) => ({
      name: 'demo',
      dir: '/tmp/demo',
      isRepo: true,
      branch: 'main',
      lastCommit: 'wip',
      lastCommitAt: '2026-08-27T00:00:00.000Z',
      dirty: false,
      dirtyCount: 0,
      ahead: 0,
      behind: 0,
      mtime: null,
      ...project,
    })),
    vercel: {
      contextName: 'team',
      projects: [],
      alerts: [],
      fetchedAt: '2026-08-27T00:00:00.000Z',
      error: null,
      ...vercel,
    },
    userStats: [],
    userStatsKeyMissing: false,
  }
}

test('监控 Agent 给脏仓库生成 OPC 明日待办', () => {
  const now = new Date('2026-08-27T15:00:00')
  const drafts = proposeMonitorTodos(snapshot([{ name: 'ownworkbuddy', dirty: true }]), now)
  assert.equal(drafts.length, 1)
  assert.equal(drafts[0]?.title, '整理 ownworkbuddy 未提交改动')
  assert.deepEqual(drafts[0]?.tags, [OPC_PROJECT_TAG])
  assert.equal(drafts[0]?.notifyAt, '2026-08-28T09:00:00')
  assert.equal(drafts[0]?.dedupeKey, 'monitor:git-dirty:ownworkbuddy:2026-08-28')
})

test('部署失败、报警、流量回落都会生成待办', () => {
  const drafts = proposeMonitorTodos(
    snapshot([], {
      projects: [
        {
          id: 'p1',
          name: 'opc-web',
          url: 'opc.example',
          state: 'ERROR',
          updatedAt: Date.now(),
          lastCommitMessage: 'broken',
          lastCommitRef: 'main',
          hasAnalytics: true,
          analytics: {
            visitors: 10,
            pageviews: 100,
            daily: [],
            todayPageviews: 8,
            yesterdayPageviews: 20,
            deltaPct: -60,
            isGrowing: false,
          },
          analyticsState: 'ok',
          hasSpeedInsights: false,
          hasProduction: true,
          users: null,
        },
      ],
      alerts: [
        {
          id: 'a1',
          title: '5xx 升高',
          type: 'error',
          status: 'triggered',
          startedAt: '2026-08-27T01:00:00.000Z',
          endedAt: null,
          summary: '生产 5xx',
        },
      ],
    }),
    new Date('2026-08-27T15:00:00'),
  )
  const titles = drafts.map((item) => item.title)
  assert.ok(titles.includes('排查 opc-web 生产部署失败'))
  assert.ok(titles.includes('关注 opc-web 流量回落'))
  assert.ok(titles.includes('处理线上报警：5xx 升高'))
  assert.ok(drafts.every((item) => item.tags?.includes(OPC_PROJECT_TAG)))
})

test('Speed Insights 核心指标差会生成待办', () => {
  const drafts = proposeMonitorTodos(
    snapshot([], {
      projects: [
        {
          id: 'p3',
          name: 'geo-web',
          url: 'geo.example',
          state: 'READY',
          updatedAt: Date.now(),
          lastCommitMessage: 'ship',
          lastCommitRef: 'main',
          hasAnalytics: false,
          analytics: null,
          analyticsState: 'disabled',
          hasSpeedInsights: true,
          speedInsightsState: 'ok',
          speedInsights: {
            lcpMs: 4800,
            inpMs: 120,
            cls: 0.05,
            ttfbMs: 600,
            samples: 30,
            countries: [],
          },
          hasProduction: true,
          users: null,
        },
      ],
    }),
    new Date('2026-08-27T15:00:00'),
  )
  assert.equal(drafts[0]?.title, '关注 geo-web LCP 偏慢')
  assert.match(drafts[0]?.note ?? '', /4\.8s/)
})

test('陈年废弃项目的部署失败不再生成待办', () => {
  const now = new Date('2026-08-27T15:00:00')
  const stale = proposeMonitorTodos(
    snapshot([], {
      projects: [
        {
          id: 'p2',
          name: 'abandoned-demo',
          url: 'demo.example',
          state: 'ERROR',
          // 一年多以前的最后一次部署，不该再进明日待办。
          updatedAt: now.getTime() - 400 * 86400000,
          lastCommitMessage: 'broken',
          lastCommitRef: 'main',
          hasAnalytics: false,
          analyticsState: 'disabled',
          analytics: null,
          hasSpeedInsights: false,
          hasProduction: true,
          users: null,
        },
      ],
    }),
    now,
  )
  assert.deepEqual(stale, [])
})
