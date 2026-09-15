import assert from 'node:assert/strict'
import test from 'node:test'
import {
  accountDigest,
  accountsByPlatform,
  clampMetric,
  dateStrip,
  findDayLog,
  hasMetrics,
  isAccountPlatformId,
  linkedMaterials,
  logHasActivity,
  normalizeMetrics,
  shiftDay,
  type AccountDayLog,
  type AccountMaterial,
  type SocialAccount,
} from './accounts.ts'

function log(partial: Partial<AccountDayLog> & Pick<AccountDayLog, 'id' | 'accountId' | 'date'>): AccountDayLog {
  return {
    posts: [],
    metrics: { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, followers: 0 },
    materialIds: [],
    updatedAt: '2026-08-31T00:00:00.000Z',
    ...partial,
  }
}

test('只认视频号、抖音、小红书', () => {
  assert.equal(isAccountPlatformId('xiaohongshu'), true)
  assert.equal(isAccountPlatformId('channels'), true)
  assert.equal(isAccountPlatformId('douyin'), true)
  assert.equal(isAccountPlatformId('x'), false)
  assert.equal(isAccountPlatformId('youtube'), false)
})

test('指标非法值归零，合法值取整', () => {
  assert.equal(clampMetric(-3), 0)
  assert.equal(clampMetric('12.6'), 13)
  assert.equal(clampMetric('nope'), 0)
  assert.deepEqual(normalizeMetrics({ views: -1, likes: 2.2 }), {
    views: 0,
    likes: 2,
    comments: 0,
    shares: 0,
    saves: 0,
    followers: 0,
  })
})

test('有内容、数据或选材才算活跃日', () => {
  assert.equal(logHasActivity(log({ id: 'a', accountId: 'acc', date: '2026-08-31' })), false)
  assert.equal(
    logHasActivity(
      log({
        id: 'b',
        accountId: 'acc',
        date: '2026-08-31',
        posts: [{ id: 'p', title: '今日一条', body: '', url: '', format: '短视频' }],
      }),
    ),
    true,
  )
  assert.equal(hasMetrics({ views: 1, likes: 0, comments: 0, shares: 0, saves: 0, followers: 0 }), true)
})

test('按账号+日期取当日记录', () => {
  const logs = [
    log({ id: '1', accountId: 'a', date: '2026-08-30' }),
    log({ id: '2', accountId: 'a', date: '2026-08-31' }),
    log({ id: '3', accountId: 'b', date: '2026-08-31' }),
  ]
  assert.equal(findDayLog(logs, 'a', '2026-08-31')?.id, '2')
  assert.equal(findDayLog(logs, 'a', '2026-08-29'), null)
})

test('日期平移跨月', () => {
  assert.equal(shiftDay('2026-08-31', 1), '2026-09-01')
  assert.equal(shiftDay('2026-09-01', -1), '2026-08-31')
  assert.equal(shiftDay('bad', 1), 'bad')
})

test('日期条以锚点为最后一天', () => {
  const days = dateStrip('2026-08-31', 3)
  assert.deepEqual(days, ['2026-08-29', '2026-08-30', '2026-08-31'])
})

test('账号摘要取今日条数和最近活跃日', () => {
  const digest = accountDigest(
    'acc',
    [
      log({
        id: '1',
        accountId: 'acc',
        date: '2026-08-30',
        posts: [{ id: 'p', title: '昨天', body: '', url: '', format: '图文' }],
      }),
      log({
        id: '2',
        accountId: 'acc',
        date: '2026-08-31',
        posts: [{ id: 'p2', title: '今天', body: '', url: '', format: '短视频' }],
        metrics: { views: 120, likes: 3, comments: 0, shares: 0, saves: 0, followers: 10 },
      }),
      log({ id: '3', accountId: 'other', date: '2026-08-31', metrics: { views: 999, likes: 0, comments: 0, shares: 0, saves: 0, followers: 0 } }),
    ],
    '2026-08-31',
  )
  assert.equal(digest.todayPosts, 1)
  assert.equal(digest.todayViews, 120)
  assert.equal(digest.lastActive, '2026-08-31')
})

test('选材按当日关联 id 过滤', () => {
  const materials: AccountMaterial[] = [
    { id: 'm1', title: '示例科研钩子', summary: '', productId: 'demo', createdAt: '2026-08-01T00:00:00.000Z' },
    { id: 'm2', title: '示例一人公司', summary: '', productId: 'demo-kit', createdAt: '2026-08-01T00:00:00.000Z' },
  ]
  assert.deepEqual(
    linkedMaterials(materials, ['m2']).map((item) => item.title),
    ['示例一人公司'],
  )
})

test('账号按平台顺序再按名字排', () => {
  const accounts: SocialAccount[] = [
    { id: '1', platform: 'douyin', name: '乙号', handle: '', note: '', createdAt: '2026-08-01T00:00:00.000Z' },
    { id: '2', platform: 'xiaohongshu', name: '乙号', handle: '', note: '', createdAt: '2026-08-01T00:00:00.000Z' },
    { id: '3', platform: 'xiaohongshu', name: '甲号', handle: '', note: '', createdAt: '2026-08-01T00:00:00.000Z' },
  ]
  const ordered = accountsByPlatform(accounts, 'all').map((item) => `${item.platform}:${item.name}`)
  assert.deepEqual(ordered, ['xiaohongshu:甲号', 'xiaohongshu:乙号', 'douyin:乙号'])
  assert.equal(accountsByPlatform(accounts, 'douyin').length, 1)
})
