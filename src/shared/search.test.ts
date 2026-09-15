import assert from 'node:assert/strict'
import test from 'node:test'
import type { WorkbenchFeature } from './features.ts'
import type { NoteItem } from './note.ts'
import type { TodoItem } from './todo.ts'
import { buildSearchIndex, firstLine, searchDocs } from './search.ts'

const features: WorkbenchFeature[] = [
  { id: 'home', title: '今日', kind: 'view', view: 'home', mark: '今' },
  { id: 'todos', title: '待办', kind: 'view', view: 'todos', mark: '待' },
  { id: 'harness', title: 'Harness', kind: 'harness', mark: 'H' },
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

function note(id: string, text: string): NoteItem {
  return { id, text, createdAt: '2026-08-30T00:00:00.000Z' }
}

const docs = buildSearchIndex({
  features,
  todos: [
    todo({ id: 't1', title: '交周报', tags: ['OPC项目'] }),
    todo({ id: 't2', title: '回复评论', note: '小红书示例号', done: true }),
  ],
  notes: [note('n1', '示例工具墙要补 Extension\n第二行')],
})

test('firstLine 取首行', () => {
  assert.equal(firstLine('示例工具墙\n第二行'), '示例工具墙')
})

test('空查询不返回结果', () => {
  assert.deepEqual(searchDocs(docs, '  '), [])
})

test('按模块名命中，Harness 跳外窗', () => {
  const hits = searchDocs(docs, 'harness')
  assert.equal(hits[0]?.id, 'view:harness')
  assert.equal(hits[0]?.target, 'harness')
})

test('待办标题与标签都能搜到', () => {
  const byTitle = searchDocs(docs, '周报')
  assert.equal(byTitle[0]?.id, 't1')
  const byTag = searchDocs(docs, 'OPC')
  assert.equal(byTag[0]?.id, 't1')
})

test('随手记按正文命中，标题用首行', () => {
  const hits = searchDocs(docs, 'Extension')
  assert.equal(hits[0]?.id, 'n1')
  assert.equal(hits[0]?.title, '示例工具墙要补 Extension')
})

test('多词要全部命中', () => {
  assert.equal(searchDocs(docs, '周报 没有').length, 0)
  assert.equal(searchDocs(docs, '交 周报').length, 1)
})

test('标题命中排在正文命中前面', () => {
  const ranked = buildSearchIndex({
    features: [],
    todos: [todo({ id: 'body', title: '别的事', note: '周报附件' })],
    notes: [note('title', '周报提纲')],
  })
  const hits = searchDocs(ranked, '周报')
  assert.equal(hits[0]?.id, 'title')
  assert.ok((hits[0]?.score ?? 0) > (hits[1]?.score ?? 0))
})

test('增长黑客模块能被搜到', () => {
  const ranked = buildSearchIndex({
    features: [{ id: 'growth', title: '增长黑客', kind: 'view', view: 'growth', mark: '增' }],
    todos: [],
    notes: [],
  })
  const hits = searchDocs(ranked, '漏斗')
  assert.equal(hits[0]?.id, 'view:growth')
  assert.equal(hits[0]?.target, 'growth')
})

test('Micro 选品模块能被搜到', () => {
  const ranked = buildSearchIndex({
    features: [{ id: 'micro', title: 'Micro 选品', kind: 'view', view: 'micro', mark: '选' }],
    todos: [],
    notes: [],
  })
  const hits = searchDocs(ranked, '痛点')
  assert.equal(hits[0]?.id, 'view:micro')
  assert.equal(hits[0]?.target, 'micro')
})

test('社媒弹药模块能被搜到', () => {
  const ranked = buildSearchIndex({
    features: [{ id: 'social-ammo', title: '社媒弹药', kind: 'view', view: 'social-ammo', mark: '弹' }],
    todos: [],
    notes: [],
  })
  const hits = searchDocs(ranked, '弹药')
  assert.equal(hits[0]?.id, 'view:social-ammo')
  assert.equal(hits[0]?.target, 'social-ammo')
})

test('微信情报模块能被搜到', () => {
  const ranked = buildSearchIndex({
    features: [{ id: 'wxhub', title: '微信情报', kind: 'view', view: 'wxhub', mark: '微' }],
    todos: [],
    notes: [],
  })
  const hits = searchDocs(ranked, '待回复')
  assert.equal(hits[0]?.id, 'view:wxhub')
  assert.equal(hits[0]?.target, 'wxhub')
})

test('邮件整理模块能被搜到', () => {
  const ranked = buildSearchIndex({
    features: [{ id: 'mail', title: '邮件整理', kind: 'view', view: 'mail', mark: '邮' }],
    todos: [],
    notes: [],
  })
  const hits = searchDocs(ranked, 'Gmail')
  assert.equal(hits[0]?.id, 'view:mail')
  assert.equal(hits[0]?.target, 'mail')
})

test('自媒体账号按名字和平台都能搜到', () => {
  const ranked = buildSearchIndex({
    features: [{ id: 'accounts', title: '自媒体账号', kind: 'view', view: 'accounts', mark: '号' }],
    todos: [],
    notes: [],
    accounts: [
      {
        id: 'acc1',
        platform: 'xiaohongshu',
        name: '示例号笔记',
        handle: 'demo',
        note: '',
        createdAt: '2026-08-30T00:00:00.000Z',
      },
    ],
  })
  const byName = searchDocs(ranked, '示例号笔记')
  assert.equal(byName[0]?.id, 'acc1')
  assert.equal(byName[0]?.target, 'accounts')
  const byModule = searchDocs(ranked, '视频号')
  assert.ok(byModule.some((hit) => hit.id === 'view:accounts'))
})
