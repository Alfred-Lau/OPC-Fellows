import assert from 'node:assert/strict'
import test from 'node:test'
import { originOf, parseUserStats, statsUrlFor, summarizeUsers } from './project-users.ts'

test('origin 补协议并去掉路径', () => {
  assert.equal(originOf('demo.example.com'), 'https://demo.example.com')
  assert.equal(originOf('https://app.example.com/studio'), 'https://app.example.com')
  assert.equal(originOf(''), null)
  assert.equal(originOf('not a url %'), null)
})

test('stats 地址挂在 origin 下', () => {
  assert.equal(statsUrlFor('https://demo.example.com'), 'https://demo.example.com/api/stats')
  assert.equal(statsUrlFor(null), null)
})

test('解析 PromptMan 扁平 users / paid', () => {
  assert.deepEqual(parseUserStats({ users: 9, prompts: 0, paid: 2 }), {
    registered: 9,
    paid: 2,
    orders: null,
    revenue: null,
    available: true,
  })
})

test('解析订单与营收，扁平与嵌套都认', () => {
  assert.deepEqual(parseUserStats({ users: 9, paid: 2, orders: 14, revenue: 1288.5 }), {
    registered: 9,
    paid: 2,
    orders: 14,
    revenue: 1288.5,
    available: true,
  })
  const nested = parseUserStats({ data: { orders: { total: 6, revenue: '399' } } })
  assert.equal(nested.orders, 6)
  assert.equal(nested.revenue, 399)
  assert.equal(nested.available, true)
})

test('只报订单也算已接入', () => {
  const stats = parseUserStats({ orders: 3 })
  assert.equal(stats.available, true)
  assert.equal(stats.registered, null)
})

test('解析 SoloKit 管理后台嵌套结构', () => {
  const stats = parseUserStats({
    success: true,
    data: {
      users: { total: 42, newToday: 1 },
      subscriptions: { active: 7, trial: 3 },
    },
  })
  assert.equal(stats.registered, 42)
  assert.equal(stats.paid, 7)
  assert.equal(stats.available, true)
})

test('没有用户字段视为未接入', () => {
  assert.equal(parseUserStats({ ok: true }).available, false)
  assert.equal(parseUserStats(null).available, false)
})

test('汇总只加已接入站点', () => {
  const sum = summarizeUsers([
    { users: { registered: 9, paid: 1, orders: 2, revenue: 99.5, available: true } },
    { users: { registered: 42, paid: 7, orders: 11, revenue: 1200, available: true } },
    { users: { registered: null, paid: null, orders: null, revenue: null, available: false } },
    {},
  ])
  assert.deepEqual(sum, { registered: 51, paid: 8, orders: 13, revenue: 1299.5, known: 2, missing: 2 })
})
