import assert from 'node:assert/strict'
import test from 'node:test'
import { formatToolEventLine } from './tool-events.ts'

test('工具事件文案覆盖三种状态', () => {
  assert.equal(formatToolEventLine({ name: 'fs_read', status: 'running' }), '正在调用 fs_read…')
  assert.equal(formatToolEventLine({ name: 'bash', status: 'ok' }), '已完成 bash')
  assert.equal(formatToolEventLine({ name: 'grep', status: 'error', detail: '需要关键词' }), 'grep 失败：需要关键词')
})
