import assert from 'node:assert/strict'
import test from 'node:test'
import { formatAmmoLoad, formatAmmoRecap, parseAmmoMetrics, parsePublish, pickIndexed } from './skill-route.ts'
import type { SocialDraft, SocialMetrics, SocialState } from './social.ts'

function draft(partial: Partial<SocialDraft> & Pick<SocialDraft, 'id' | 'title'>): SocialDraft {
  return {
    fingerprint: partial.id,
    platform: 'x',
    productId: 'demo',
    productName: '示例',
    productUrl: 'https://example.com/',
    featureTitle: partial.title,
    format: '短帖',
    body: '',
    outline: '',
    tags: [],
    mediaBrief: '',
    createdAt: '2026-08-30T00:00:00.000Z',
    publishedAt: null,
    publishedUrl: null,
    ...partial,
  }
}

function metrics(partial: Partial<SocialMetrics> & Pick<SocialMetrics, 'draftId'>): SocialMetrics {
  return {
    id: `m-${partial.draftId}`,
    platform: 'x',
    recordedAt: '2026-08-30T00:00:00.000Z',
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    ...partial,
  }
}

function state(partial: Partial<SocialState> = {}): SocialState {
  return {
    drafts: [],
    metrics: [],
    generated: 0,
    usedModel: false,
    ...partial,
  }
}

test('pickIndexed 认第几条', () => {
  const items = [{ id: 'a' }, { id: 'b' }]
  assert.deepEqual(pickIndexed(items, '第一条'), { item: items[0], index: 1 })
  assert.deepEqual(pickIndexed(items, '第 2 条'), { item: items[1], index: 2 })
  assert.deepEqual(pickIndexed(items, '随便看看'), { kind: 'list' })
})

test('formatAmmoLoad 空目录不编', () => {
  assert.match(formatAmmoLoad(state()), /工作情况/)
})

test('formatAmmoLoad 列出本轮新写', () => {
  const next = state({
    generated: 2,
    drafts: [draft({ id: '1', title: '钩子一' }), draft({ id: '2', title: '钩子二' })],
  })
  const text = formatAmmoLoad(next)
  assert.match(text, /已装填 \*\*2\*\* 条/)
  assert.match(text, /钩子一/)
})

test('parsePublish 要链接和第几条', () => {
  const drafts = [draft({ id: '1', title: '钩子一' })]
  assert.match(parsePublish('发布登记第一条', drafts).reply, /链接/)
  const ok = parsePublish('发布登记第一条 https://x.com/a/1', drafts)
  assert.equal(ok.id, '1')
  assert.equal(ok.url, 'https://x.com/a/1')
})

test('parseAmmoMetrics 要数字', () => {
  assert.match(parseAmmoMetrics('采集互动').reply ?? '', /数字/)
  assert.deepEqual(parseAmmoMetrics('浏览 120 赞 3 评 1').input, {
    views: 120,
    likes: 3,
    comments: 1,
    shares: 0,
    saves: 0,
  })
})

test('formatAmmoRecap 只看带评论的已发稿', () => {
  const empty = formatAmmoRecap(state({ drafts: [draft({ id: '1', title: '未发' })] }))
  assert.match(empty, /不拿未发草稿充数/)
  const hot = formatAmmoRecap(
    state({
      drafts: [draft({ id: '1', title: '热帖', publishedAt: '2026-08-30T00:00:00.000Z' })],
      metrics: [metrics({ draftId: '1', comments: 4, likes: 9 })],
    }),
  )
  assert.match(hot, /热帖/)
})
