import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeWorkbenchConfig } from './workbench-config.ts'

test('空值和坏结构都收成空配置，不抛', () => {
  assert.deepEqual(normalizeWorkbenchConfig(null), { version: 1, entries: [] })
  assert.deepEqual(normalizeWorkbenchConfig('notes'), { version: 1, entries: [] })
  assert.deepEqual(normalizeWorkbenchConfig({}), { version: 1, entries: [] })
  assert.deepEqual(normalizeWorkbenchConfig({ entries: 'x' }), { version: 1, entries: [] })
})

test('缺 name 的条目补 builtin 前缀，非法条目丢掉', () => {
  const config = normalizeWorkbenchConfig({
    entries: [
      { id: 'notes', disabled: true, config: { folder: 'inbox' } },
      { id: '', name: 'builtin:ghost' },
      'not-an-entry',
      { id: 'micro', name: '/tmp/micro', order: 3 },
    ],
  })
  assert.deepEqual(config.entries, [
    { id: 'notes', name: 'builtin:notes', disabled: true, config: { folder: 'inbox' } },
    { id: 'micro', name: '/tmp/micro', disabled: false, config: {}, order: 3 },
  ])
})

test('disabled 必须是 true 才算停用，别的都当启用', () => {
  const config = normalizeWorkbenchConfig({
    entries: [{ id: 'pet', disabled: 'yes' }, { id: 'notes', disabled: false }],
  })
  assert.equal(config.entries[0]?.disabled, false)
  assert.equal(config.entries[1]?.disabled, false)
})
