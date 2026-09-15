import assert from 'node:assert/strict'
import test from 'node:test'
import { isWebAnalyticsEnabled } from './web-analytics.ts'

test('未配置或仅有资源 id 都不算已开通', () => {
  assert.equal(isWebAnalyticsEnabled(undefined), false)
  assert.equal(isWebAnalyticsEnabled(null), false)
  assert.equal(isWebAnalyticsEnabled({}), false)
  assert.equal(isWebAnalyticsEnabled({ id: 'icfg_only' }), false)
})

test('enabledAt 或 hasData 视为已开通，可拉取流量', () => {
  assert.equal(isWebAnalyticsEnabled({ id: 'a', enabledAt: 1_775_000_000_000 }), true)
  assert.equal(isWebAnalyticsEnabled({ id: 'a', hasData: true }), true)
  assert.equal(isWebAnalyticsEnabled({ id: 'a', enabledAt: 1, hasData: true }), true)
})

test('已停用或已取消不算开通', () => {
  assert.equal(isWebAnalyticsEnabled({ id: 'a', enabledAt: 1, disabledAt: 2 }), false)
  assert.equal(isWebAnalyticsEnabled({ id: 'a', enabledAt: 1, canceledAt: 2 }), false)
  assert.equal(isWebAnalyticsEnabled({ id: 'a', enabledAt: 3, disabledAt: 2 }), true)
})
