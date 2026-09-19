import assert from 'node:assert/strict'
import test from 'node:test'
import type { WorkbenchFeature } from './features.ts'
import type { TodoItem } from './todo.ts'
import { buildSearchIndex, firstLine, searchDocs } from './search.ts'

const features: WorkbenchFeature[] = [
  { id: 'home', title: '今日', kind: 'view', view: 'home', mark: '今' },
  { id: 'todos', title: '待办', kind: 'view', view: 'todos', mark: '待' },
  { id: 'social-ammo', title: '社媒弹药', kind: 'view', view: 'social-ammo', mark: '弹' },
]

function todo(partial: Partial<TodoItem> & Pick<TodoItem, 'id' | 'title'>): TodoItem {
  return {
    notifyAt: null,
    notifiedAt: null,
    done: false,
    createdAt: '2026-08-30T00:00:00.000Z',
    source: 'test',
    tags: [],
    origin: 'user',
    ...partial,
  }
}

const docs = buildSearchIndex({
  features,
  todos: [
    todo({ id: 't1', title: '交周报', tags: ['OPC项目'] }),
    todo({ id: 't2', title: '回复评论', note: '小红书示例号', done: true }),
  ],
})

test('firstLine 取首行', () => {
  assert.equal(firstLine('示例工具墙\n第二行'), '示例工具墙')
})

test('空查询不返回结果', () => {
  assert.deepEqual(searchDocs(docs, '  '), [])
})

test('按模块名命中弹药手', () => {
  const hits = searchDocs(docs, '弹药')
  assert.equal(hits[0]?.id, 'view:social-ammo')
  assert.equal(hits[0]?.target, 'social-ammo')
})

test('待办标题与标签都能搜到', () => {
  const byTitle = searchDocs(docs, '周报')
  assert.equal(byTitle[0]?.id, 't1')
  const byTag = searchDocs(docs, 'OPC')
  assert.equal(byTag[0]?.id, 't1')
})

test('多词要全部命中', () => {
  assert.equal(searchDocs(docs, '周报 没有').length, 0)
  assert.equal(searchDocs(docs, '交 周报').length, 1)
})

test('标题命中排在正文命中前面', () => {
  const ranked = buildSearchIndex({
    features: [],
    todos: [
      todo({ id: 'body', title: '别的事', note: '周报附件' }),
      todo({ id: 'title', title: '周报提纲' }),
    ],
  })
  const hits = searchDocs(ranked, '周报')
  assert.equal(hits[0]?.id, 'title')
  assert.ok((hits[0]?.score ?? 0) > (hits[1]?.score ?? 0))
})
