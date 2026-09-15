import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { clip, collectFeatures, featureFromIdea, generateSocialCopy } from './social-copy.ts'
import { cloneProduct, EXAMPLE_PRODUCT, getProducts, setProducts } from './products.ts'
import type { MonitorSnapshot } from './monitor.ts'

const demo = cloneProduct(EXAMPLE_PRODUCT)
const previousProducts = getProducts()

before(() => {
  setProducts([demo])
})

after(() => {
  setProducts(previousProducts)
})

function snapshot(partial: Partial<MonitorSnapshot> = {}): MonitorSnapshot {
  return {
    projects: [],
    vercel: {
      contextName: 'team',
      projects: [],
      alerts: [],
      fetchedAt: '2026-08-30T10:00:00.000Z',
      error: null,
    },
    userStats: [],
    userStatsKeyMissing: false,
    ...partial,
  }
}

test('匹配 git 仓库名到目录产品，并按六平台生成文案', () => {
  const features = collectFeatures(
    snapshot({
      projects: [
        {
          name: 'demo',
          dir: '/tmp/demo',
          isRepo: true,
          branch: 'main',
          lastCommit: 'add prompt library folders',
          lastCommitAt: '2026-08-29T00:00:00.000Z',
          dirty: false,
          dirtyCount: 0,
          ahead: 0,
          behind: 0,
          mtime: null,
        },
      ],
    }),
    new Date('2026-08-30T12:00:00'),
  )
  assert.equal(features[0]?.product.id, 'demo')
  const drafts = generateSocialCopy(features)
  assert.equal(drafts.length, 6)
  const x = drafts.find((item) => item.platform === 'x')
  const xhs = drafts.find((item) => item.platform === 'xiaohongshu')
  const yt = drafts.find((item) => item.platform === 'youtube')
  assert.ok(x)
  assert.ok(xhs)
  assert.ok(yt)
  assert.ok(Array.from(x.body).length <= 280)
  assert.ok(Array.from(xhs.title).length <= 20)
  assert.ok(Array.from(yt.title).length <= 100)
  assert.ok(x.body.includes('https://example.com/'))
  assert.ok(xhs.body.includes('一人公司'))
  assert.ok(yt.format.includes('Shorts'))
})

test('流量上涨会生成可发社媒的卖点', () => {
  const features = collectFeatures(
    snapshot({
      vercel: {
        contextName: 'team',
        alerts: [],
        fetchedAt: '2026-08-30T10:00:00.000Z',
        error: null,
        projects: [
          {
            id: 'p1',
            name: 'demo',
            url: 'example.com',
            state: 'READY',
            updatedAt: Date.parse('2026-08-30T08:00:00.000Z'),
            lastCommitMessage: null,
            lastCommitRef: 'main',
            hasAnalytics: true,
            analytics: {
              visitors: 40,
              pageviews: 200,
              daily: [],
              todayPageviews: 30,
              yesterdayPageviews: 10,
              deltaPct: 200,
              isGrowing: true,
            },
            analyticsState: 'ok',
            hasSpeedInsights: false,
            hasProduction: true,
            users: null,
          },
        ],
      },
    }),
    new Date('2026-08-30T12:00:00'),
  )
  assert.equal(features[0]?.product.id, 'demo')
  assert.equal(features[0]?.source, 'traffic')
})

test('clip 按码点截断', () => {
  assert.equal(clip('示例产品新能力上线了', 5), '示例产品…')
})

test('Idea 装填带 ideaId，不假装成监控产品能力', () => {
  const drafts = generateSocialCopy([
    featureFromIdea({
      id: 'idea-1',
      title: 'YouTube 切片加字幕',
      pain: '手切太慢',
      who: '创作者',
      workaround: '',
      form: 'ai-micro',
      domain: 'creator',
      status: 'new',
      signalIds: [],
      composite: 40,
      heat: 10,
      painScore: 20,
      paySignals: 1,
      rank: 1,
      prevRank: null,
      firstSeenAt: '2026-09-12T01:00:00.000Z',
      lastSeenAt: '2026-09-12T01:00:00.000Z',
      postedDay: '2026-09-12',
      scanDay: '2026-09-12',
      note: 'ammo:idea-1',
      usedModel: false,
      analysis: { verdict: 'watch', sharpness: '', market: '', evidence: [], competitors: '', whyHard: '', opcFit: '' },
    }),
  ])
  assert.equal(drafts.length, 6)
  assert.ok(drafts.every((draft) => draft.ideaId === 'idea-1'))
  assert.ok(drafts.every((draft) => draft.productId === 'idea:idea-1'))
})
