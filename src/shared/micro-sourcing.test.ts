import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_MICRO_SETTINGS,
  applyIdeaPatch,
  clusterSignals,
  compositeScore,
  inferDomain,
  inferForm,
  mergeIdeas,
  arcticShiftPostsUrl,
  isProxyConnectionFailed,
  normalizeProxyUrl,
  pickScanProxy,
  pruneSignals,
  proxyListenTarget,
  resolveScanProxy,
  scorePainText,
  scoreSignal,
  enabledSources,
  todayIdeas,
  draftAnalysis,
  formatIdeaReview,
  formatScanSummary,
  formatDayLabel,
  isIdeaSourceOpen,
  planHandoff,
  planPipelineChange,
  resolveReviewFocus,
  isPostedToday,
  isFreshSignal,
  parsePainSources,
  startOfLocalDayUnix,
  type PainSignal,
  type ProductIdea,
} from './micro-sourcing.ts'
import { proposeMicroTodos } from './micro-sourcing-todos.ts'

function signal(partial: Partial<PainSignal> & Pick<PainSignal, 'id' | 'title'>): PainSignal {
  return scoreSignal(
    {
      source: 'reddit',
      sourceId: partial.id,
      url: `https://reddit.com/${partial.id}`,
      body: '',
      community: 'r/shopify',
      sourceLabel: 'r/shopify',
      domain: 'ecommerce',
      score: 20,
      comments: 12,
      createdAt: '2026-09-07T04:00:00.000Z',
      fetchedAt: '2026-09-07T12:00:00.000Z',
      ...partial,
    },
    DEFAULT_MICRO_SETTINGS,
    new Date('2026-09-07T12:00:00.000Z'),
  )
}

test('代理地址会补协议，垃圾值丢掉', () => {
  assert.equal(normalizeProxyUrl('127.0.0.1:7890'), 'http://127.0.0.1:7890')
  assert.equal(normalizeProxyUrl('http://127.0.0.1:7890/'), 'http://127.0.0.1:7890')
  assert.equal(normalizeProxyUrl('socks5://127.0.0.1:7891'), 'socks5://127.0.0.1:7891')
  assert.equal(normalizeProxyUrl('not a proxy'), '')
  assert.equal(resolveScanProxy('', { HTTPS_PROXY: '127.0.0.1:6152' }), 'http://127.0.0.1:6152')
  assert.equal(resolveScanProxy('http://127.0.0.1:7890', { HTTPS_PROXY: 'http://ignored:1' }), 'http://127.0.0.1:7890')
})

test('Reddit 档案源走 Arctic Shift，不把限流的 Pullpush 当唯一退路', () => {
  assert.equal(
    arcticShiftPostsUrl('indiehackers', 25),
    'https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=indiehackers&limit=25',
  )
  assert.equal(
    arcticShiftPostsUrl('indiehackers', 40, 1_788_710_400),
    'https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=indiehackers&limit=40&after=1788710400',
  )
  assert.match(arcticShiftPostsUrl('somebodymakethis'), /subreddit=somebodymakethis/)
})

test('Clash 没起来时不能把死代理交给 Chromium', () => {
  assert.equal(isProxyConnectionFailed('net::ERR_PROXY_CONNECTION_FAILED'), true)
  assert.equal(isProxyConnectionFailed('HTTP 429'), false)
  assert.deepEqual(proxyListenTarget('http://127.0.0.1:7890'), { host: '127.0.0.1', port: 7890 })
  assert.equal(pickScanProxy('http://127.0.0.1:7890', false), '')
  assert.equal(pickScanProxy('http://127.0.0.1:7890', true), 'http://127.0.0.1:7890')
  assert.equal(pickScanProxy('', true, { HTTPS_PROXY: '127.0.0.1:7890' }), 'http://127.0.0.1:7890')
  assert.equal(pickScanProxy('', false, { HTTPS_PROXY: '127.0.0.1:7890' }), '')
})

test('求助句和付费意愿会把痛感拉高', () => {
  const wish = scorePainText('Is there a tool to clip YouTube videos into TikTok?')
  const pay = scorePainText("I'd pay for a cheaper alternative to Zapier")
  const noise = scorePainText('Just launched my side project today, feedback welcome')
  assert.ok(wish.pain >= 8)
  assert.equal(pay.paySignal, true)
  assert.ok(pay.pain > wish.pain)
  assert.equal(noise.pain, 0)
  assert.equal(noise.paySignal, false)
})

test('领域和形态从正文推断', () => {
  assert.equal(inferDomain('auto captions for youtube shorts', 'indie'), 'creator')
  assert.equal(inferDomain('shopify cart abandonment emails', 'indie'), 'ecommerce')
  assert.equal(inferForm('looking for a chrome extension'), 'chrome')
  assert.equal(inferForm('sync youtube stats into notion'), 'notion')
})

test('综合分偏痛感而不是纯热度', () => {
  const hotButMild = compositeScore(40, 0, 8)
  const colderButPainful = compositeScore(12, 36, 13)
  assert.ok(colderButPainful > hotButMild)
})

test('相近求助帖会聚成同一个 idea', () => {
  const clips = signal({
    id: 'a',
    title: 'Is there a tool to clip YouTube long videos into TikTok with auto captions?',
    body: 'I waste hours doing this manually for every youtube video.',
    domain: 'creator',
    community: 'r/youtubers',
  })
  const captions = signal({
    id: 'b',
    title: 'Anyone know a tool for auto captions on YouTube shorts and TikTok clips?',
    body: 'Need a youtube clip tool with captions, tired of doing this manually.',
    domain: 'creator',
    community: 'r/NewTubers',
  })
  const cart = signal({
    id: 'c',
    title: 'Shopify cart abandonment emails feel generic, any alternative?',
    body: 'Checkout conversion is low. Looking for a shopify alternative to generic Klaviyo flows.',
    domain: 'ecommerce',
  })
  const clusters = clusterSignals([clips, captions, cart])
  const clipCluster = clusters.find((cluster) => cluster.some((item) => item.id === 'a'))
  assert.ok(clipCluster)
  assert.equal(clipCluster.some((item) => item.id === 'b'), true)
  assert.equal(clipCluster.some((item) => item.id === 'c'), false)
})

test('合并时保留盯着/动手做的状态，并给今日热榜排名', () => {
  const first = mergeIdeas(
    [],
    [
      signal({
        id: 'a',
        title: "I'd pay for a notion youtube dashboard sync tool",
        body: 'Wish there was a notion plugin to sync youtube stats automatically.',
        domain: 'productivity',
        community: 'r/Notion',
      }),
    ],
    new Date('2026-09-07T12:00:00.000Z'),
  )
  const watching = applyIdeaPatch(first, first[0]!.id, { status: 'watching', note: '值得做' })
  const next = mergeIdeas(
    watching,
    [
      signal({
        id: 'a',
        title: "I'd pay for a notion youtube dashboard sync tool",
        body: 'Wish there was a notion plugin to sync youtube stats automatically.',
        domain: 'productivity',
        community: 'r/Notion',
      }),
      signal({
        id: 'z',
        title: 'Just sharing my shopify theme',
        body: 'feedback welcome',
        score: 200,
        comments: 80,
      }),
    ],
    new Date('2026-09-07T13:00:00.000Z'),
  )
  const kept = next.find((idea) => idea.id === first[0]!.id)
  assert.equal(kept?.status, 'watching')
  assert.equal(kept?.note, '值得做')
  assert.equal(kept?.rank, 1)
  assert.ok(todayIdeas(next, new Date('2026-09-07T13:00:00.000Z')).length >= 1)
  assert.equal(todayIdeas(next, new Date('2026-09-08T13:00:00.000Z')).length, 0)
})

test('昨天的热帖不能冒充今日 idea', () => {
  const now = new Date('2026-09-07T12:00:00.000Z')
  assert.equal(isPostedToday('2026-09-07T04:00:00.000Z', now), true)
  assert.equal(isPostedToday('2026-09-06T04:00:00.000Z', now), false)
  assert.ok(startOfLocalDayUnix(now) < Math.floor(now.getTime() / 1000))
  const stale = mergeIdeas(
    [],
    [
      signal({
        id: 'old-hot',
        title: "I'd pay for a shopify tool",
        body: 'Wish there was a cheaper alternative',
        createdAt: '2026-09-01T04:00:00.000Z',
        fetchedAt: '2026-09-07T12:00:00.000Z',
      }),
    ],
    now,
  )
  assert.equal(stale.filter((idea) => idea.status === 'new').length, 0)
})

test('锐评默认偏苛刻，不把单帖和无付费当机会', () => {
  const now = new Date('2026-09-07T12:00:00.000Z')
  const ideas = mergeIdeas(
    [],
    [
      signal({
        id: 'solo',
        title: 'Is there a tool to clip YouTube videos',
        body: 'I waste hours doing this manually for youtube.',
        domain: 'creator',
        community: 'r/youtubers',
      }),
    ],
    now,
  )
  const idea = ideas[0]
  assert.ok(idea)
  const analysis = draftAnalysis(idea, [
    signal({
      id: 'solo',
      title: 'Is there a tool to clip YouTube videos',
      body: 'I waste hours doing this manually for youtube.',
      domain: 'creator',
      community: 'r/youtubers',
    }),
  ])
  assert.equal(analysis.verdict, 'kill')
  assert.match(analysis.sharpness, /一条有效帖|付钱|自欺/)
  assert.equal(analysis.sharpness.includes('很适合你'), false)
  assert.match(analysis.market, /9月7日|样本/)
  assert.equal(formatDayLabel('2026-09-07'), '9月7日')
})

test('过期信号会被丢掉', () => {
  const old = signal({
    id: 'old',
    title: 'Is there a tool for this',
    fetchedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
  })
  const fresh = signal({ id: 'fresh', title: 'Is there a tool for shopify checkout' })
  const kept = pruneSignals([old, fresh], new Date('2026-09-07T12:00:00.000Z'))
  assert.deepEqual(kept.map((item) => item.id), ['fresh'])
})

test('昨天 reddit/hn 仍被 mergeIdeas 和 pruneSignals 丢掉，X/App Store 走各自窗口', () => {
  const now = new Date('2026-09-07T12:00:00.000Z')
  const yesterdayReddit = signal({
    id: 'reddit-yesterday',
    source: 'reddit',
    title: "I'd pay for a shopify tool",
    body: 'Wish there was a cheaper alternative',
    createdAt: '2026-09-06T04:00:00.000Z',
  })
  const yesterdayHn = signal({
    id: 'hn-yesterday',
    source: 'hn',
    community: 'Ask HN',
    sourceLabel: 'Ask HN',
    title: "I'd pay for a shopify tool",
    body: 'Wish there was a cheaper alternative',
    createdAt: '2026-09-06T04:00:00.000Z',
  })
  const todayReddit = signal({
    id: 'reddit-today',
    title: "I'd pay for a shopify tool",
    body: 'Wish there was a cheaper alternative',
    createdAt: '2026-09-07T04:00:00.000Z',
  })
  const twoDayX = signal({
    id: 'x-2d',
    source: 'x',
    community: 'X',
    sourceLabel: 'X · 痛点搜索',
    title: "I'd pay for a shopify tool",
    body: 'Wish there was a cheaper alternative',
    createdAt: '2026-09-05T12:00:00.000Z',
  })
  const fourDayX = signal({
    id: 'x-4d',
    source: 'x',
    community: 'X',
    sourceLabel: 'X · 痛点搜索',
    title: "I'd pay for a shopify tool",
    body: 'Wish there was a cheaper alternative',
    createdAt: '2026-09-03T12:00:00.000Z',
  })
  const sixDayApp = signal({
    id: 'app-6d',
    source: 'appstore',
    community: 'Notion',
    sourceLabel: 'App Store 差评',
    title: "I'd pay for a shopify tool",
    body: 'Wish there was a cheaper alternative',
    createdAt: '2026-09-01T12:00:00.000Z',
  })

  assert.equal(isPostedToday(yesterdayReddit.createdAt, now), false)
  assert.equal(isPostedToday(yesterdayHn.createdAt, now), false)
  assert.equal(isFreshSignal(yesterdayReddit, now), false)
  assert.equal(isFreshSignal(yesterdayHn, now), false)
  assert.equal(isFreshSignal(todayReddit, now), true)
  assert.equal(isFreshSignal(twoDayX, now), true)
  assert.equal(isFreshSignal(fourDayX, now), false)
  assert.equal(isFreshSignal(sixDayApp, now), true)

  const merged = mergeIdeas([], [yesterdayReddit, yesterdayHn, todayReddit, twoDayX, fourDayX, sixDayApp], now)
  const mergedIds = new Set(merged.flatMap((idea) => idea.signalIds))
  assert.equal(mergedIds.has('reddit-yesterday'), false)
  assert.equal(mergedIds.has('hn-yesterday'), false)
  assert.equal(mergedIds.has('reddit-today'), true)
  assert.equal(mergedIds.has('x-2d'), true)
  assert.equal(mergedIds.has('x-4d'), false)
  assert.equal(mergedIds.has('app-6d'), true)

  const pruned = pruneSignals(
    [yesterdayReddit, yesterdayHn, todayReddit, twoDayX, fourDayX, sixDayApp],
    now,
  ).map((item) => item.id)
  assert.equal(pruned.includes('reddit-yesterday'), false)
  assert.equal(pruned.includes('hn-yesterday'), false)
  assert.equal(pruned.includes('reddit-today'), true)
  assert.equal(pruned.includes('x-2d'), true)
  assert.equal(pruned.includes('x-4d'), false)
  assert.equal(pruned.includes('app-6d'), true)
})

test('parsePainSources 放行 x kind，默认源含 x-pain', () => {
  const parsed = parsePainSources([
    { id: 'x-pain', kind: 'x', label: 'X · 痛点搜索', domain: 'indie', queries: ['"is there a tool that" lang:en -filter:replies'] },
    { id: 'bad', kind: 'bluesky', domain: 'indie' },
  ])
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0]?.kind, 'x')
  assert.ok(enabledSources(DEFAULT_MICRO_SETTINGS).some((source) => source.id === 'x-pain' && source.kind === 'x'))
})

test('只把当日最痛的新 idea 写成待办', () => {
  const ideas: ProductIdea[] = [
    {
      id: 'one',
      title: 'YouTube 切片加字幕',
      pain: '长视频切短视频太手工',
      who: '海外自媒体',
      workaround: '手切',
      form: 'ai-micro',
      domain: 'creator',
      status: 'new',
      signalIds: ['a'],
      composite: 40,
      heat: 20,
      painScore: 24,
      paySignals: 1,
      rank: 1,
      prevRank: null,
      firstSeenAt: '2026-09-07T12:00:00.000Z',
      lastSeenAt: '2026-09-07T12:00:00.000Z',
      postedDay: '2026-09-07',
      scanDay: '2026-09-07',
      note: '',
      usedModel: false,
      analysis: {
        verdict: 'watch',
        sharpness: '有付费原话，但仍是单日样本。',
        market: '样本限于 9月7日。',
        evidence: ['r/youtubers · 赞 20：「I waste hours」'],
        competitors: 'youtube',
        whyHard: '分发贵',
        opcFit: '两周做不出可收费形态就杀',
      },
    },
    {
      id: 'two',
      title: '已经在做的东西',
      pain: 'x',
      who: '独立站',
      workaround: '',
      form: 'saas',
      domain: 'ecommerce',
      status: 'building',
      signalIds: ['b'],
      composite: 50,
      heat: 10,
      painScore: 10,
      paySignals: 0,
      rank: 2,
      prevRank: 1,
      firstSeenAt: '2026-09-01T12:00:00.000Z',
      lastSeenAt: '2026-09-07T12:00:00.000Z',
      postedDay: '2026-09-01',
      scanDay: '2026-09-07',
      note: '',
      usedModel: false,
      analysis: {
        verdict: 'watch',
        sharpness: '',
        market: '',
        evidence: [],
        competitors: '',
        whyHard: '',
        opcFit: '',
      },
    },
  ]
  const drafts = proposeMicroTodos(ideas, new Date('2026-09-07T12:00:00.000Z'))
  assert.equal(drafts.length, 1)
  assert.match(drafts[0]!.title, /YouTube 切片加字幕/)
  assert.equal(drafts[0]!.dedupeKey, 'micro:one:2026-09-07')
  assert.deepEqual(drafts[0]!.tags, ['选品'])
})

test('自定义源会拼到内置源后面，关闭的领域不扫', () => {
  const extra = {
    id: 'reddit-ai',
    kind: 'reddit' as const,
    label: 'r/artificial',
    domain: 'indie' as const,
    subs: ['artificial'],
    mode: 'hot' as const,
  }
  const all = enabledSources({ ...DEFAULT_MICRO_SETTINGS, customSources: [extra] })
  assert.ok(all.some((source) => source.id === 'reddit-ai'))
  const closed = enabledSources({
    ...DEFAULT_MICRO_SETTINGS,
    customSources: [extra],
    domains: { ...DEFAULT_MICRO_SETTINGS.domains, indie: false },
  })
  assert.equal(closed.some((source) => source.id === 'reddit-ai'), false)
})

function idea(partial: Partial<ProductIdea> & Pick<ProductIdea, 'id' | 'title'>): ProductIdea {
  return {
    pain: partial.pain ?? partial.title,
    who: '海外自媒体',
    workaround: '手切',
    form: 'ai-micro',
    domain: 'creator',
    status: 'new',
    signalIds: [partial.id],
    composite: 40,
    heat: 20,
    painScore: 24,
    paySignals: 1,
    rank: 1,
    prevRank: null,
    firstSeenAt: '2026-09-12T01:00:00.000Z',
    lastSeenAt: '2026-09-12T01:00:00.000Z',
    postedDay: '2026-09-12',
    scanDay: '2026-09-12',
    note: '',
    usedModel: false,
    analysis: {
      verdict: 'watch',
      sharpness: '',
      market: '',
      evidence: [],
      competitors: '',
      whyHard: '',
      opcFit: '',
    },
    ...partial,
  }
}

test('评估 idea 只念今日热榜，空态不串扫描', () => {
  const now = new Date('2026-09-12T10:00:00.000Z')
  const listed = [
    idea({ id: 'low', title: '低分工具', composite: 20, painScore: 12 }),
    idea({ id: 'high', title: 'YouTube 切片加字幕', composite: 80, painScore: 30, analysis: {
      verdict: 'build',
      sharpness: '',
      market: '',
      evidence: [],
      competitors: '',
      whyHard: '',
      opcFit: '',
    } }),
    idea({ id: 'old', title: '昨天的', postedDay: '2026-09-11', status: 'watching' }),
    idea({ id: 'building', title: '已经在做', status: 'building', composite: 90 }),
  ]
  const scanned = { ideas: listed, lastRun: { at: '2026-09-12T09:00:00.000Z', signalCount: 4, ideaCount: 2, newIdeas: 2, errors: [], usedModel: false } }
  const reply = formatIdeaReview(scanned, '今天的产品 idea 是什么', now)
  assert.match(reply, /今日热榜 \*\*2\*\* 条/)
  assert.match(reply, /YouTube 切片加字幕/)
  assert.match(reply, /可做/)
  assert.match(reply, /低分工具/)
  assert.match(reply, /再看/)
  assert.match(reply, /\| # \| Idea \|/)
  assert.equal(reply.includes('昨天的'), false)
  assert.equal(reply.includes('已经在做'), false)

  const third = resolveReviewFocus('第三条怎么样', listed, now)
  assert.equal(third.kind, 'unknown')
  const first = resolveReviewFocus('评估第一条', listed, now)
  assert.equal(first.kind, 'one')
  if (first.kind === 'one') {
    assert.equal(first.idea.id, 'high')
  }
  const byTitle = resolveReviewFocus('评估 切片', listed, now)
  assert.equal(byTitle.kind, 'one')

  assert.match(formatIdeaReview({ ideas: [], lastRun: null }, '今天的产品 idea 是什么', now), /还没有扫描结果/)
  const emptyToday = formatIdeaReview(
    {
      ideas: [idea({ id: 'watch', title: '旧的盯着', postedDay: '2026-09-01', status: 'watching' })],
      lastRun: { at: '2026-09-12T09:00:00.000Z', signalCount: 0, ideaCount: 0, newIdeas: 0, errors: [], usedModel: false },
    },
    '今天有什么 idea',
    now,
  )
  assert.match(emptyToday, /今天没有够痛的新帖/)
  assert.match(emptyToday, /观察管线里还有 1 条/)

  const pick = formatIdeaReview(scanned, '哪个 idea 最值得做', now)
  assert.match(pick, /今日最值得看的是 \*\*YouTube 切片加字幕\*\*/)
  assert.match(pick, /今日热榜 \*\*2\*\* 条/)
  assert.doesNotMatch(formatIdeaReview(scanned, '评估 idea', now), /今日最值得看/)
})

test('扫描短结果念热榜摘要；管线改判和立项只动点名的那一条', () => {
  const now = new Date('2026-09-12T10:00:00.000Z')
  const listed = [
    idea({ id: 'low', title: '低分工具', composite: 20, painScore: 12 }),
    idea({ id: 'high', title: 'YouTube 切片加字幕', composite: 80, painScore: 30 }),
  ]
  const scanned = {
    ideas: listed,
    lastRun: { at: '2026-09-12T09:00:00.000Z', signalCount: 4, ideaCount: 2, newIdeas: 1, errors: [], usedModel: false },
  }
  assert.match(formatScanSummary(scanned, now), /当天帖 4 条/)
  assert.match(formatScanSummary({ ideas: [], lastRun: null }, now), /还没有扫描结果/)

  const watch = planPipelineChange('盯着第一条', listed, now)
  assert.equal(watch.idea?.id, 'high')
  assert.equal(watch.status, 'watching')
  assert.match(watch.reply, /盯着/)

  const miss = planPipelineChange('丢掉第十二条', listed, now)
  assert.match(miss.reply, /对不上/)

  const handoff = planHandoff('第一条立项', listed, true, now)
  assert.equal(handoff.idea?.id, 'high')
  assert.match(handoff.reply, /指针交给弹药手/)

  const noAmmo = planHandoff('第一条立项', listed, false, now)
  assert.match(noAmmo.reply, /弹药手还没雇/)

  const pinned = planHandoff('第一条立项', listed, true, now, ['low', 'high'])
  assert.equal(pinned.idea?.id, 'low')

  const closed = planHandoff('第一条立项', [idea({ id: 'dead', title: '已丢掉', status: 'dismissed' })], true, now, ['dead'])
  assert.match(closed.reply, /已关掉/)
  assert.equal(isIdeaSourceOpen({ status: 'dismissed' }), false)
  assert.equal(isIdeaSourceOpen({ status: 'building' }), true)
})
