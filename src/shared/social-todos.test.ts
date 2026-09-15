import assert from 'node:assert/strict'
import test from 'node:test'
import { proposeSocialTodos } from './social-todos.ts'
import type { SocialDraft, SocialMetrics } from './social.ts'
import { OPC_PROJECT_TAG } from './tags.ts'

function draft(partial: Partial<SocialDraft>): SocialDraft {
  return {
    id: 'd1',
    fingerprint: 'social:demo:x',
    platform: 'x',
    productId: 'demo',
    productName: 'Demo Product',
    productUrl: 'https://example.com/',
    featureTitle: 'folders',
    format: '短帖',
    title: '',
    body: 'hello',
    outline: '',
    tags: [],
    mediaBrief: '',
    createdAt: '2026-08-29T00:00:00.000Z',
    publishedAt: null,
    publishedUrl: null,
    ...partial,
  }
}

test('未发布的海外/国内草稿会生成 OPC 发布待办', () => {
  const todos = proposeSocialTodos(
    {
      drafts: [draft({ platform: 'x' }), draft({ id: 'd2', platform: 'xiaohongshu', fingerprint: 'social:demo:xiaohongshu' })],
      metrics: [],
    },
    new Date('2026-08-30T15:00:00'),
  )
  const titles = todos.map((item) => item.title)
  assert.ok(titles.some((title) => title.includes('海外社媒')))
  assert.ok(titles.some((title) => title.includes('国内社媒')))
  assert.ok(todos.every((item) => item.tags?.includes(OPC_PROJECT_TAG)))
})

test('已发布但超 48 小时未采数、以及有评论时生成跟进待办', () => {
  const published = draft({
    publishedAt: '2026-08-27T00:00:00.000Z',
    publishedUrl: 'https://x.com/example/status/1',
  })
  const metrics: SocialMetrics[] = [
    {
      id: 'm1',
      draftId: published.id,
      platform: 'x',
      recordedAt: '2026-08-27T01:00:00.000Z',
      views: 120,
      likes: 4,
      comments: 3,
      shares: 1,
      saves: 0,
    },
  ]
  const todos = proposeSocialTodos({ drafts: [published], metrics }, new Date('2026-08-30T15:00:00'))
  const titles = todos.map((item) => item.title)
  assert.ok(titles.some((title) => title.includes('浏览与互动数据')))
  assert.ok(titles.some((title) => title.includes('回复')))
})
