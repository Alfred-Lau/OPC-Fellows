import assert from 'node:assert/strict'
import test from 'node:test'
import { formatToolEventLine, toolCardTitle } from './tool-events.ts'

test('工具事件文案覆盖三种状态', () => {
  assert.equal(formatToolEventLine({ name: 'fs_read', status: 'running' }), '正在读文件…')
  assert.equal(formatToolEventLine({ name: 'bash', status: 'ok' }), '已完成 跑命令')
  assert.equal(formatToolEventLine({ name: 'grep', status: 'error', detail: '需要关键词' }), '搜索 失败：需要关键词')
})

test('工具卡片标题走中性映射', () => {
  assert.equal(toolCardTitle('notes_add'), '记下')
  assert.equal(toolCardTitle('agent_delegate'), '子任务')
  assert.equal(toolCardTitle('custom_tool'), 'custom tool')
})
