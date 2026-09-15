import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_SETTINGS, type PaymentsState } from './payments.ts'
import {
  formatAmmoRecap,
  formatLedgerRead,
  formatMonitorBriefing,
  formatMonitorHealth,
  formatMonitorRead,
  formatMonitorSpeed,
  formatMonitorTraffic,
  formatMonitorTrafficRank,
  formatMailAccess,
  formatMailDraft,
  formatMailInbox,
  formatMailLookup,
  formatMailTriage,
  formatNotesFind,
  formatWxToday,
  formatWxTriage,
  isMonitorBriefingAsk,
  isMonitorRankAsk,
  parseAccountCreate,
  parseAmmoMetrics,
  parseManualReceipt,
  parseMaterialPointer,
  parseTriageDecision,
  parseWxDraftBody,
  pickNoteToPromote,
  planAmmoLoad,
} from './skill-route.ts'
import type { ProductIdea } from './micro-sourcing.ts'
import type { MonitorCache } from './monitor.ts'
import type { SocialDraft, SocialMetrics, SocialState } from './social.ts'
import { emptyMailState, type MailMessage, type MailState } from './mail.ts'
import type { WechatAction, WechatHubState } from './wechat-hub.ts'

function emptyPayments(): PaymentsState {
  return {
    settings: DEFAULT_SETTINGS,
    snapshot: null,
    receipts: [],
    payouts: [],
    expenses: [],
    events: [],
    syncing: false,
    lastError: null,
  }
}

function emptyWx(access: WechatHubState['coverage']['access'] = 'ready'): WechatHubState {
  return {
    settings: { hubHome: '', heartbeatHours: 6, notify: true, todoFollowUp: true },
    coverage: {
      access,
      hubHome: null,
      hubScript: null,
      readerBin: null,
      radarDb: access === 'ready',
      radarDbPath: '',
      summary: access === 'ready' ? '就绪' : '未接入',
      dbStatus: '',
    },
    today: [],
    inbox: [],
    lookup: null,
    lastRunAt: null,
    scanning: false,
    lastError: null,
    ingested: 0,
  }
}

function action(partial: Partial<WechatAction> & Pick<WechatAction, 'id' | 'title'>): WechatAction {
  return {
    status: '',
    recordType: '',
    confidence: '',
    stage: '',
    opportunityType: '',
    priority: 1,
    amount: '',
    followUp: '',
    nextAction: '',
    lastSignal: '',
    notes: '',
    kind: 'inbox',
    ...partial,
  }
}

function emptyMail(): MailState {
  return emptyMailState()
}

function mailRow(partial: Partial<MailMessage>): MailMessage {
  return {
    id: 'm1',
    accountId: 'acc',
    provider: 'gmail',
    uid: '1',
    messageId: '<a@x>',
    from: 'Ada',
    to: 'me@gmail.com',
    subject: '主题',
    date: '2026-09-15T00:00:00.000Z',
    snippet: '',
    unread: false,
    triage: 'open',
    ...partial,
  }
}

test('财务解读账本不假装已经同步', () => {
  assert.match(formatLedgerRead(emptyPayments()), /还没有账本|还没有同步/)
})

test('微信今日行动把未接入和今天 0 条拆开', () => {
  assert.match(formatWxToday(emptyWx('missing')), /还不能读今日行动/)
  assert.match(formatWxToday(emptyWx('ready')), /今天没有待处理/)
  const state = emptyWx()
  state.today = [
    action({ id: 1, title: '低优先', priority: 1, kind: 'today' }),
    action({ id: 2, title: '高优先成交', priority: 9, kind: 'today' }),
  ]
  assert.match(formatWxToday(state, false, '今日行动'), /今日行动 \*\*2\*\* 条/)
  assert.doesNotMatch(formatWxToday(state, false, '今日行动'), /最该先跟/)
  assert.match(formatWxToday(state, false, '最紧急的是哪条'), /最该先跟的是 \*\*高优先成交\*\*/)
})

test('商机分流要对象；推进第三条才改判', () => {
  assert.equal(parseTriageDecision('未成交'), 'lost')
  assert.equal(parseTriageDecision('成交'), 'won')
  const state = emptyWx()
  state.inbox = [action({ id: 1, title: '甲' }), action({ id: 2, title: '乙' }), action({ id: 3, title: '丙' })]
  const listed = formatWxTriage(state, '商机分流')
  assert.match(listed.reply, /待分流 \*\*3\*\* 条/)
  assert.match(listed.reply, /\| # \| 行动 \|/)
  const ask = formatWxTriage(state, '推进')
  assert.match(ask.reply, /哪一条/)
  const hit = formatWxTriage(state, '推进第三条')
  assert.equal(hit.decision, 'pursue')
  assert.equal(hit.action?.title, '丙')
})

test('监控空仓库和全都健康要分开说', () => {
  const empty = {
    snapshot: {
      projects: [],
      vercel: { contextName: '', projects: [], alerts: [], fetchedAt: '', error: null },
      userStats: [],
      userStatsKeyMissing: true,
    },
    social: { drafts: [], metrics: [], stats: [], generated: 0, usedModel: false },
    proposals: [],
    cachedAt: '',
  } satisfies MonitorCache
  assert.match(formatMonitorHealth(empty), /还没有仓库/)
  assert.match(formatMonitorHealth(null), /还没有态势快照/)
})

test('问项目数据要综合解读，不回技能菜单', () => {
  assert.equal(isMonitorBriefingAsk('我今天的项目数据如何？'), true)
  assert.equal(isMonitorBriefingAsk('我这几个项目流量如何？'), true)
  assert.equal(isMonitorBriefingAsk('这几个项目如何'), true)
  assert.equal(isMonitorBriefingAsk('帮忙盯一下站点'), true)
  assert.equal(isMonitorBriefingAsk('这个月流量如何'), false)
  assert.equal(isMonitorBriefingAsk('流量怎么样'), false)
  const empty = {
    snapshot: {
      projects: [],
      vercel: { contextName: '', projects: [], alerts: [], fetchedAt: '', error: null },
      userStats: [],
      userStatsKeyMissing: true,
    },
    social: { drafts: [], metrics: [], stats: [], generated: 0, usedModel: false },
    proposals: [],
    cachedAt: '',
  } satisfies MonitorCache
  const briefing = formatMonitorBriefing(empty)
  assert.match(briefing, /还没有仓库|没有流量|没有页面/)
  assert.doesNotMatch(briefing, /对不上/)
  assert.doesNotMatch(briefing, /可以说/)
  assert.match(formatMonitorBriefing(null), /还没有态势快照/)
})

test('问流量最好要按今日浏览点名，不甩涨跌表', () => {
  assert.equal(isMonitorRankAsk('这些项目中流量最好的是什么'), true)
  assert.equal(isMonitorRankAsk('哪个站浏览最多'), true)
  assert.equal(isMonitorRankAsk('这个月流量如何'), false)
  const cache = {
    snapshot: {
      projects: [],
      vercel: {
        contextName: 'team',
        projects: [
          {
            id: 'small',
            name: '示例站',
            url: null,
            state: 'READY',
            updatedAt: null,
            lastCommitMessage: null,
            lastCommitRef: null,
            hasAnalytics: true,
            analyticsState: 'ok',
            analytics: {
              visitors: 10,
              pageviews: 80,
              daily: [],
              todayPageviews: 12,
              yesterdayPageviews: 10,
              deltaPct: 20,
              isGrowing: true,
            },
            hasSpeedInsights: false,
            hasProduction: true,
            users: null,
          },
          {
            id: 'big',
            name: '示例产品',
            url: null,
            state: 'READY',
            updatedAt: null,
            lastCommitMessage: null,
            lastCommitRef: null,
            hasAnalytics: true,
            analyticsState: 'ok',
            analytics: {
              visitors: 40,
              pageviews: 400,
              daily: [],
              todayPageviews: 90,
              yesterdayPageviews: 80,
              deltaPct: 13,
              isGrowing: true,
            },
            hasSpeedInsights: false,
            hasProduction: true,
            users: null,
          },
        ],
        alerts: [],
        fetchedAt: '',
        error: null,
      },
      userStats: [],
      userStatsKeyMissing: true,
    },
    social: { drafts: [], metrics: [], stats: [], generated: 0, usedModel: false },
    proposals: [],
    cachedAt: '',
  } satisfies MonitorCache
  const reply = formatMonitorTrafficRank(cache)
  assert.match(reply, /示例产品/)
  assert.match(reply, /今日 90/)
  assert.doesNotMatch(reply, /对不上/)
  assert.doesNotMatch(reply, /领涨/)
  assert.match(formatMonitorTrafficRank(null), /还没有态势快照/)
  assert.equal(formatMonitorRead(cache, '解读流量'), formatMonitorTraffic(cache))
  assert.equal(formatMonitorRead(cache, '/解读流量'), formatMonitorTraffic(cache))
  assert.match(formatMonitorRead(cache, '这些项目中流量最好的是什么'), /流量最好的是 \*\*示例产品\*\*/)
})

test('解读性能点名最慢站点，空快照不编 LCP', () => {
  const empty = {
    snapshot: {
      projects: [],
      vercel: { contextName: '', projects: [], alerts: [], fetchedAt: '', error: null },
      userStats: [],
      userStatsKeyMissing: true,
    },
    social: { drafts: [], metrics: [], stats: [], generated: 0, usedModel: false },
    proposals: [],
    cachedAt: '',
  } satisfies MonitorCache
  assert.match(formatMonitorSpeed(null), /还没有态势快照/)
  assert.match(formatMonitorSpeed(empty), /还没有已上线站点/)
  const cache = {
    snapshot: {
      projects: [],
      vercel: {
        contextName: 'team',
        projects: [
          {
            id: 'slow',
            name: '慢站',
            url: null,
            state: 'READY',
            updatedAt: null,
            lastCommitMessage: null,
            lastCommitRef: null,
            hasAnalytics: false,
            analyticsState: 'disabled',
            analytics: null,
            hasSpeedInsights: true,
            speedInsightsState: 'ok',
            speedInsights: {
              lcpMs: 4500,
              inpMs: 180,
              cls: 0.04,
              ttfbMs: 900,
              samples: 40,
              countries: [{ country: 'JP', lcpMs: 5200, inpMs: null, cls: null, ttfbMs: 2100, samples: 12 }],
            },
            hasProduction: true,
            users: null,
          },
        ],
        alerts: [],
        fetchedAt: '',
        error: null,
      },
      userStats: [],
      userStatsKeyMissing: true,
    },
    social: { drafts: [], metrics: [], stats: [], generated: 0, usedModel: false },
    proposals: [],
    cachedAt: '',
  } satisfies MonitorCache
  const table = formatMonitorSpeed(cache, '解读性能')
  assert.match(table, /全球性能/)
  assert.match(table, /慢站/)
  assert.doesNotMatch(table, /最该看的是/)
  assert.match(formatMonitorSpeed(cache, '哪个国家最慢'), /最该看的是 \*\*慢站\*\*/)
  assert.match(formatMonitorSpeed(cache, '哪个国家最慢'), /日本/)
})

test('复盘热帖点中原句回表，问最热才点名', () => {
  const drafts: SocialDraft[] = [
    {
      id: 'cool',
      fingerprint: 'social:x',
      platform: 'x',
      productId: 'demo',
      productName: 'Demo Product',
      productUrl: 'https://example.com/',
      featureTitle: 'folders',
      format: '短帖',
      title: '冷帖',
      body: 'hello',
      outline: '',
      tags: [],
      mediaBrief: '',
      createdAt: '2026-08-29T00:00:00.000Z',
      publishedAt: '2026-08-29T00:00:00.000Z',
      publishedUrl: 'https://x.com/s/1',
    },
    {
      id: 'hot',
      fingerprint: 'social:x',
      platform: 'x',
      productId: 'demo',
      productName: 'Demo Product',
      productUrl: 'https://example.com/',
      featureTitle: 'folders',
      format: '短帖',
      title: '热帖标题',
      body: 'hello',
      outline: '',
      tags: [],
      mediaBrief: '',
      createdAt: '2026-08-29T00:00:00.000Z',
      publishedAt: '2026-08-29T00:00:00.000Z',
      publishedUrl: 'https://x.com/s/2',
    },
  ]
  const metrics: SocialMetrics[] = [
    {
      id: 'm1',
      draftId: 'cool',
      platform: 'x',
      recordedAt: '2026-08-30T10:00:00.000Z',
      views: 10,
      likes: 1,
      comments: 1,
      shares: 0,
      saves: 0,
    },
    {
      id: 'm2',
      draftId: 'hot',
      platform: 'x',
      recordedAt: '2026-08-30T11:00:00.000Z',
      views: 200,
      likes: 20,
      comments: 8,
      shares: 0,
      saves: 0,
    },
  ]
  const state: SocialState = { drafts, metrics, stats: [], generated: 0, usedModel: false }
  assert.match(formatAmmoRecap(state, '复盘热帖'), /复盘热帖 \*\*2\*\* 条/)
  assert.doesNotMatch(formatAmmoRecap(state, '复盘热帖'), /最热的是/)
  assert.match(formatAmmoRecap(state, '哪条最热'), /最热的是 \*\*热帖标题\*\*/)
})

test('写 Skill 字段不齐就追问', () => {
  assert.match(parseManualReceipt('手工入账').reply, /金额和渠道/)
  assert.equal(parseManualReceipt('入账 199 元 微信 阿宁').input?.amount, 19900)
  assert.equal(parseManualReceipt('入账 199 元 微信 阿宁').input?.channel, 'wechat')
  assert.equal(parseManualReceipt('入账 199 元 微信扫码 阿宁').input?.channel, 'wechat-qr')
  assert.equal(parseManualReceipt('入账 199 元 微信扫码 阿宁').input?.customer, '阿宁')
  assert.equal(parseManualReceipt('入账 99 知识星球').input?.channel, 'zsxq')
  assert.equal(parseManualReceipt('入账 800 小红书分账').input?.channel, 'xiaohongshu')
  assert.equal(parseManualReceipt('入账 9.99 美元 Patreon').input?.channel, 'patreon')
  assert.equal(parseManualReceipt('入账 9.99 美元 Patreon').input?.currency, 'USD')
  assert.match(parseAccountCreate('建档账号').reply, /平台和名字/)
  assert.equal(parseAccountCreate('建档账号 小红书 阿宁').platform, 'xiaohongshu')
  assert.match(parseAmmoMetrics('采集互动第一条').reply ?? '', /要数字/)
  assert.equal(parseAmmoMetrics('采集互动 第一条 浏览 120 赞 3 评 1').input?.views, 120)
  assert.match(parseWxDraftBody('收成草稿').reply ?? '', /不空跑/)
})

test('装填认已交接的 Idea，关掉的源不再往下写', () => {
  const open: ProductIdea = {
    id: 'idea-1',
    title: '切片加字幕',
    pain: '手切',
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
  }
  const closed = { ...open, id: 'idea-2', title: '已丢掉', status: 'dismissed' as const, note: 'ammo:idea-2' }
  const pending = planAmmoLoad('装填弹药', [open])
  assert.equal(pending.idea?.id, 'idea-1')
  assert.equal(pending.reply, undefined)
  const pinned = planAmmoLoad('装填第一条', [open, closed], ['idea-2', 'idea-1'])
  assert.match(pinned.reply ?? '', /已关掉/)
  const material = parseMaterialPointer('关联选材 已丢掉', [closed], [])
  assert.equal('reply' in material && material.reply.includes('已关掉'), true)
})

test('邮件收件箱把未接入和空箱拆开，分流要点名', () => {
  assert.match(formatMailInbox(emptyMailState()), /还没有接入邮箱/)
  const ready = emptyMail()
  ready.accounts = [
    {
      id: 'acc',
      provider: 'gmail',
      label: 'Gmail',
      email: 'me@gmail.com',
      enabled: true,
      hasPassword: true,
    },
  ]
  assert.match(formatMailInbox(ready), /没有待整理/)
  ready.messages = [
    mailRow({ id: 'm1', subject: '发票', from: '财务', unread: true }),
    mailRow({ id: 'm2', subject: '导师回信', from: 'Ada', unread: false }),
  ]
  assert.match(formatMailInbox(ready, '收件箱'), /待整理 \*\*2\*\* 封/)
  assert.doesNotMatch(formatMailInbox(ready, '收件箱'), /最该先看/)
  assert.match(formatMailInbox(ready, '最紧急的是哪条'), /最该先看的是 \*\*发票\*\*/)
  assert.match(formatMailLookup(ready, 'Ada'), /导师回信/)
  assert.match(formatMailLookup(ready, ''), /要查谁/)
  assert.match(formatMailAccess(ready), /线上 1\/1/)
  const ask = formatMailTriage(ready, '归档')
  assert.match(ask.reply, /哪一封/)
  const hit = formatMailTriage(ready, '归档第二条')
  assert.equal(hit.decision, 'archive')
  assert.equal(hit.message?.subject, '导师回信')
  const draft = formatMailDraft(ready, '回信草稿 第一条 下周见面')
  assert.equal(draft.message?.subject, '发票')
  assert.equal(draft.draft, '下周见面')
})

test('随手记升格没点名就追问最近一条', () => {
  const notes = [
    { id: 'n1', text: '买牛奶', createdAt: '2026-09-12T01:00:00.000Z' },
    { id: 'n2', text: '写周报', createdAt: '2026-09-12T02:00:00.000Z' },
  ]
  assert.equal(pickNoteToPromote(notes, '升格待办'), undefined)
  assert.equal(pickNoteToPromote(notes, '升格待办 第二条')?.id, 'n2')
  assert.match(formatNotesFind(notes, '找回 牛奶'), /买牛奶/)
})
