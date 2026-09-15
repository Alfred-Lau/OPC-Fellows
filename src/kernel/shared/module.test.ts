import assert from 'node:assert/strict'
import test from 'node:test'
import {
  builtinSpecifier,
  describeStatus,
  isBuiltinSpecifier,
  isHighRisk,
  isListenCapability,
} from './module.ts'

test('builtin 说明符带前缀', () => {
  assert.equal(builtinSpecifier('notes'), 'builtin:notes')
  assert.equal(isBuiltinSpecifier('builtin:notes'), true)
  assert.equal(isBuiltinSpecifier('/tmp/mods/notes'), false)
})

test('监听端口和高危能力要单独标出来', () => {
  assert.equal(isListenCapability('net:listen:18753'), true)
  assert.equal(isListenCapability('net:reddit.com'), false)
  assert.equal(isHighRisk('subprocess'), true)
  assert.equal(isHighRisk('secrets'), true)
  assert.equal(isHighRisk('net:listen:18753'), true)
  assert.equal(isHighRisk('storage'), false)
  assert.equal(isHighRisk('todos:read'), false)
})

test('状态文案优先用模块自报的 detail', () => {
  assert.equal(describeStatus('failed', '端口被占'), '端口被占')
  assert.equal(describeStatus('active', ''), '运行中')
  assert.equal(describeStatus('disabled', ''), '已停用 · 数据保留')
  assert.equal(describeStatus('needs-config', ''), '需要配置')
})
