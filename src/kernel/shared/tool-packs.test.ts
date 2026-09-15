import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultToolPacks, isToolPackId, normalizeToolPacks, toolPackTitle } from './tool-packs.ts'

test('模板默认工具包：主理人和工程全开，空白有工作区，职业只有待办', () => {
  assert.deepEqual(defaultToolPacks('host', 'conversational'), [
    'kernel',
    'workspace',
    'mcp-github',
    'mcp-browser',
  ])
  assert.deepEqual(defaultToolPacks('engineer', 'conversational'), [
    'kernel',
    'workspace',
    'mcp-github',
    'mcp-browser',
  ])
  assert.deepEqual(defaultToolPacks('blank', 'conversational'), ['kernel', 'workspace'])
  assert.deepEqual(defaultToolPacks('monitor', 'dashboard'), ['kernel'])
  assert.deepEqual(defaultToolPacks('pet', 'window'), [])
})

test('工具包 id 去重并跳过未知项', () => {
  assert.equal(isToolPackId('workspace'), true)
  assert.equal(isToolPackId('fs'), false)
  assert.deepEqual(normalizeToolPacks(['kernel', 'kernel', 'nope', 'mcp-browser']), ['kernel', 'mcp-browser'])
  assert.deepEqual(normalizeToolPacks('kernel'), [])
  assert.equal(toolPackTitle('mcp-github'), 'GitHub')
})
