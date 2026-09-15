import assert from 'node:assert/strict'
import test from 'node:test'
import { planAgentInbox } from './agent-inbox.ts'
import { extractTagsFromTitle, mergeTags, normalizeTags } from './tags.ts'
import type { TodoItem } from './todo.ts'

function todo(partial: Partial<TodoItem> & Pick<TodoItem, 'id' | 'title'>): TodoItem {
  return {
    notifyAt: null,
    notifiedAt: null,
    done: false,
    createdAt: '2026-08-27T00:00:00.000Z',
    source: 'test',
    tags: [],
    origin: 'user',
    ...partial,
  }
}

test('normalizeTags 去空白、去重、去 #', () => {
  assert.deepEqual(normalizeTags([' OPC项目 ', '#OPC项目', '流量', '']), ['OPC项目', '流量'])
})

test('extractTagsFromTitle 抽出井号标签', () => {
  assert.deepEqual(extractTagsFromTitle('#OPC项目 跟进部署'), {
    title: '跟进部署',
    tags: ['OPC项目'],
  })
})

test('mergeTags 合并默认标与事项标', () => {
  assert.deepEqual(mergeTags(['OPC项目'], ['流量', 'OPC项目']), ['OPC项目', '流量'])
})

test('planAgentInbox 按 dedupeKey 跳过已完成项', () => {
  const existing = [
    todo({
      id: '1',
      title: '整理 foo 未提交改动',
      done: true,
      origin: 'agent',
      agentId: 'monitor',
      dedupeKey: 'monitor:git-dirty:foo:2026-08-28',
      tags: ['OPC项目'],
    }),
  ]
  const plan = planAgentInbox(existing, {
    agentId: 'monitor',
    source: '项目监控 · 明日待办',
    tags: ['OPC项目'],
    items: [
      {
        title: '整理 foo 未提交改动',
        notifyAt: '2026-08-28T09:00:00',
        dedupeKey: 'monitor:git-dirty:foo:2026-08-28',
      },
    ],
  })
  assert.equal(plan.create.length, 0)
  assert.equal(plan.update.length, 0)
  assert.equal(plan.skipped, 1)
})

test('planAgentInbox 对未完成项做更新而不是重复写入', () => {
  const existing = [
    todo({
      id: '1',
      title: '旧标题',
      origin: 'agent',
      agentId: 'monitor',
      dedupeKey: 'monitor:git-dirty:foo:2026-08-28',
      tags: ['OPC项目'],
    }),
  ]
  const plan = planAgentInbox(existing, {
    agentId: 'monitor',
    source: '项目监控 · 明日待办',
    tags: ['OPC项目'],
    items: [
      {
        title: '整理 foo 未提交改动',
        notifyAt: '2026-08-28T09:00:00',
        dedupeKey: 'monitor:git-dirty:foo:2026-08-28',
      },
    ],
  })
  assert.equal(plan.create.length, 0)
  assert.equal(plan.update.length, 1)
  assert.equal(plan.update[0]?.title, '整理 foo 未提交改动')
  assert.deepEqual(plan.update[0]?.tags, ['OPC项目'])
})

test('planAgentInbox 无去重键则追加', () => {
  const plan = planAgentInbox([], {
    agentId: 'monitor',
    source: '项目监控',
    items: [{ title: '#OPC项目 跟进周报', notifyAt: null }],
  })
  assert.equal(plan.create.length, 1)
  assert.equal(plan.create[0]?.title, '跟进周报')
  assert.deepEqual(plan.create[0]?.tags, ['OPC项目'])
  assert.equal(plan.create[0]?.origin, 'agent')
})
