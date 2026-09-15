import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeSocial, type SocialDraft, type SocialMetrics } from './social.ts'

function draft(partial: Partial<SocialDraft>): SocialDraft {
  return {
    id: 'd1',
    fingerprint: 'social:x',
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
    publishedAt: '2026-08-29T00:00:00.000Z',
    publishedUrl: 'https://x.com/s/1',
    ...partial,
  }
}

test('平台汇总在已有单条数据时不重复加总', () => {
  const metrics: SocialMetrics[] = [
    {
      id: 'm1',
      draftId: 'd1',
      platform: 'x',
      recordedAt: '2026-08-30T10:00:00.000Z',
      views: 100,
      likes: 2,
      comments: 1,
      shares: 0,
      saves: 0,
    },
    {
      id: 'm2',
      draftId: null,
      platform: 'x',
      recordedAt: '2026-08-30T11:00:00.000Z',
      views: 100,
      likes: 2,
      comments: 1,
      shares: 0,
      saves: 0,
    },
  ]
  const stats = summarizeSocial([draft({})], metrics, new Date('2026-08-30T12:00:00Z'))
  const x = stats.find((row) => row.platform === 'x')
  assert.equal(x?.views, 100)
  assert.equal(x?.likes, 2)
})
