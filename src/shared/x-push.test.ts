import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildXPostText, X_POST_LIMIT } from './x-push.ts'

test('buildXPostText 拼接标题/正文/标签/链接', () => {
  const text = buildXPostText({
    title: '标题',
    body: '正文内容',
    tags: ['tag1', '#tag2'],
    productUrl: 'https://example.com',
  })
  assert.ok(text.includes('标题'))
  assert.ok(text.includes('正文内容'))
  assert.ok(text.includes('#tag1 #tag2'))
  assert.ok(text.includes('https://example.com'))
})

test('buildXPostText 超过 280 字符时截断且保留标题与链接', () => {
  const body = 'X'.repeat(500)
  const text = buildXPostText({
    title: 'T',
    body,
    tags: ['t'],
    productUrl: 'https://example.com',
  })
  assert.ok(text.length <= X_POST_LIMIT, `length=${text.length}`)
  assert.ok(text.startsWith('T'), '保留标题')
  assert.ok(text.endsWith('https://example.com') || text.includes('https://example.com'), '保留链接')
  assert.ok(text.endsWith('…') || !text.includes('X'.repeat(300)), '正文被截断')
})

test('buildXPostText 短内容原样返回', () => {
  const text = buildXPostText({ title: '短', body: '好', tags: [], productUrl: '' })
  assert.equal(text, '短\n\n好')
})
