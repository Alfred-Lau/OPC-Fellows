import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CHAT_PANE_MIN,
  TOOL_WIDTH_DEFAULT,
  TOOL_WIDTH_MIN,
  clampToolWidth,
  defaultToolWidth,
  parseToolWidth,
} from './tool-width.ts'

test('工具栏宽度夹在最小与聊天区余量之间', () => {
  assert.equal(clampToolWidth(200, 1200), TOOL_WIDTH_MIN)
  assert.equal(clampToolWidth(1000, 1200), 1200 - CHAT_PANE_MIN)
  assert.equal(clampToolWidth(480, 1200), 480)
})

test('窗口变窄时给聊天区留出最小宽度', () => {
  assert.equal(clampToolWidth(600, 700), 700 - CHAT_PANE_MIN)
})

test('坏值落到默认宽度；未存过则按工作室一半', () => {
  assert.equal(clampToolWidth(Number.NaN), TOOL_WIDTH_DEFAULT)
  assert.equal(parseToolWidth(null), undefined)
  assert.equal(parseToolWidth('abc'), undefined)
  assert.equal(parseToolWidth('512'), 512)
  assert.equal(defaultToolWidth(1000), 480)
})
