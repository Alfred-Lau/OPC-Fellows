import { markdownFence, markdownTable } from './chat-markdown.ts'
import { isOccupationAsk } from './intent-route.ts'
import { firstLine } from './search.ts'
import { dayKey } from './datetime.ts'
import {
  formatCny,
  formatMoney,
  buildLedger,
  channelNameStripPattern,
  defaultCurrencyForChannel,
  financeSummary,
  isExpenseCategory,
  matchManualChannel,
  monthlyReportCsv,
  monthlySeries,
  parseAmountToCents,
  manualChannelName,
  type ExpenseCategory,
  type ManualReceiptInput,
  type ExpenseRecordInput,
  type PaymentsState,
} from './payments.ts'
import { isFreshFailure, type MonitorCache } from './monitor.ts'
import { buildTrafficInsights } from './traffic-insights.ts'
import {
  countryName,
  formatVital,
  hasSpeedCurve,
  siteRating,
  speedEmptyReason,
  worstCountry,
} from './speed-insights.ts'
import {
  coverageSummary,
  WECHAT_TRIAGE_LABELS,
  type WechatAction,
  type WechatHubState,
  type WechatLookupKind,
  type WechatTriageDecision,
} from './wechat-hub.ts'
import {
  MAIL_TRIAGE_LABELS,
  openMailMessages,
  parseMailTriage,
  searchMailMessages,
  unreadMailMessages,
  type MailMessage,
  type MailState,
  type MailTriage,
} from './mail.ts'
import { latestMetricsForDraft, SOCIAL_PLATFORMS, type SocialMetricsInput, type SocialState } from './social.ts'
import type { WxDraftViewState } from './wx-draft.ts'
import { ACCOUNT_PLATFORMS, type AccountPlatformId, type AccountsState, type SocialAccount } from './accounts.ts'
import type { NoteItem } from './note.ts'
import {
  closedIdeaReply,
  isIdeaSourceOpen,
  pendingAmmoIdeas,
  resolveListedIdea,
  todayIdeas,
  type ProductIdea,
} from './micro-sourcing.ts'
import { pinByIds } from './listing.ts'
import { isExactSkillPhrase, isPickBestAsk, shouldPickFromData, withNamedFirst } from './read-answer.ts'

const ACCESS_LABEL = {
  missing: '未安装',
  engine: '缺索引',
  index: '仅索引',
  ready: '本机就绪',
} as const

export function formatMonitorRefresh(cache: MonitorCache | null): string {
  if (!cache) {
    return '还没有态势快照。要先说「刷新态势」。'
  }
  const traffic = formatMonitorTraffic(cache)
  const speed = formatMonitorSpeed(cache)
  const health = formatMonitorHealth(cache)
  return [`已刷新项目监控。`, '', traffic, '', speed, '', health, '', `明日待办 **${cache.proposals.length}** 条。`].join('\n')
}

export function formatMonitorTraffic(cache: MonitorCache | null): string {
  if (!cache) {
    return '还没有态势快照。要先说「刷新态势」。'
  }
  const report = buildTrafficInsights(cache.snapshot.vercel.projects, cache.snapshot.vercel.alerts)
  const rows = [
    ...report.down.slice(0, 3).map((row) => ['↓', row.name, `${row.deltaPct ?? 0}%`, row.reasons[0] ?? '']),
    ...report.up.slice(0, 3).map((row) => ['↑', row.name, `${row.deltaPct ?? 0}%`, row.reasons[0] ?? '']),
  ]
  if (rows.length === 0) {
    return report.headline
  }
  return [report.headline, '', markdownTable(['', '站点', '变化', '归因'], rows)].join('\n')
}

export function isMonitorRankAsk(text: string): boolean {
  return /流量.{0,12}(最好|最多|第一|谁)|最好.{0,8}(流量|浏览)|最多.{0,8}(流量|浏览)|哪个.{0,8}(流量|站|项目)/.test(text)
}

export function formatMonitorRead(cache: MonitorCache | null, text: string, phrase = '解读流量'): string {
  if (isExactSkillPhrase(text, phrase)) {
    return formatMonitorTraffic(cache)
  }
  if (isMonitorRankAsk(text) || isPickBestAsk(text)) {
    return formatMonitorTrafficRank(cache)
  }
  if (isMonitorBriefingAsk(text)) {
    return formatMonitorBriefing(cache)
  }
  return formatMonitorTraffic(cache)
}

export function formatMonitorTrafficRank(cache: MonitorCache | null): string {
  if (!cache) {
    return '还没有态势快照。要先说「刷新态势」。'
  }
  const ranked = cache.snapshot.vercel.projects
    .filter((project) => project.hasAnalytics && project.analytics)
    .sort((left, right) => (right.analytics?.todayPageviews ?? 0) - (left.analytics?.todayPageviews ?? 0))
  if (ranked.length === 0) {
    return '还没有站点回传流量数据。先说「刷新态势」。'
  }
  const top = ranked[0]
  const today = top.analytics?.todayPageviews ?? 0
  const total = ranked.reduce((sum, project) => sum + (project.analytics?.todayPageviews ?? 0), 0)
  const share = total > 0 ? Math.round((today / total) * 100) : 0
  const headline = `流量最好的是 **${top.name}**，今日 ${today} 次浏览，占 ${share}%。`
  return [
    headline,
    '',
    markdownTable(
      ['#', '站点', '今日浏览', '较昨日', '30 天浏览'],
      ranked.slice(0, 8).map((project, index) => [
        String(index + 1),
        project.name,
        String(project.analytics?.todayPageviews ?? 0),
        project.analytics?.deltaPct != null ? `${project.analytics.deltaPct}%` : '—',
        String(project.analytics?.pageviews ?? 0),
      ]),
    ),
  ].join('\n')
}

export function formatMonitorHealth(cache: MonitorCache | null, text = ''): string {
  if (!cache) {
    return '还没有态势快照。要先说「刷新态势」。'
  }
  if (cache.snapshot.projects.length === 0 && cache.snapshot.vercel.projects.length === 0) {
    return '还没有仓库，也没有站点。这和「全都健康」不是一回事。'
  }
  const dirty = cache.snapshot.projects.filter((project) => project.dirty)
  const ahead = cache.snapshot.projects.filter((project) => project.ahead > 0)
  const failed = cache.snapshot.vercel.projects.filter((project) => isFreshFailure(project))
  if (dirty.length === 0 && ahead.length === 0 && failed.length === 0) {
    return '仓库健康：未提交、超前、近期部署失败都没有。'
  }
  const worst = failed[0] ?? dirty[0] ?? ahead[0]
  const label = failed[0] ? '部署失败' : dirty[0] ? '未提交' : '超前'
  const rows = [
    ...dirty.slice(0, 5).map((project) => [project.name, '未提交', `${project.dirtyCount} 个文件`]),
    ...ahead.slice(0, 5).map((project) => [project.name, '超前', `${project.ahead} 个提交`]),
    ...failed.slice(0, 5).map((project) => [project.name, '部署失败', '近期']),
  ]
  return withNamedFirst(
    text,
    '项目健康',
    worst ? `最需要看的是 **${worst.name}**（${label}）。` : null,
    [`**仓库健康**`, '', markdownTable(['仓库', '状况', '细节'], rows)].join('\n'),
  )
}

export function isMonitorBriefingAsk(text: string): boolean {
  if (/项目数据|数据如何|态势如何|项目.{0,8}(流量|数据)|这几个(项目|站)|几个项目/.test(text)) {
    return true
  }
  return isOccupationAsk(text) && /项目|站点|仓库|态势/.test(text)
}

export function formatMonitorBriefing(cache: MonitorCache | null): string {
  if (!cache) {
    return '还没有态势快照。要先说「刷新态势」。'
  }
  return [formatMonitorTraffic(cache), '', formatMonitorSpeed(cache), '', formatMonitorHealth(cache), '', formatMonitorPages(cache)].join('\n')
}

export function isMonitorSlowAsk(text: string): boolean {
  return /最慢|最差|哪里慢|哪个国家|哪国|哪块慢/.test(text)
}

export function formatMonitorSpeed(cache: MonitorCache | null, text = ''): string {
  if (!cache) {
    return '还没有态势快照。要先说「刷新态势」。'
  }
  const shipped = cache.snapshot.vercel.projects.filter((project) => project.hasProduction)
  const ranked = shipped.filter(hasSpeedCurve).sort((left, right) => {
    const byRating = ratingRank(siteRating(right.speedInsights)) - ratingRank(siteRating(left.speedInsights))
    return byRating || (right.speedInsights?.lcpMs ?? 0) - (left.speedInsights?.lcpMs ?? 0)
  })
  if (ranked.length === 0) {
    return speedEmptyReason(shipped)
  }
  const table = markdownTable(
    ['站点', 'LCP', 'INP', 'CLS', 'TTFB', '最慢地区'],
    ranked.slice(0, 8).map((project) => {
      const insights = project.speedInsights
      const slow = insights ? worstCountry(insights, 'ttfbMs') : null
      return [
        project.name,
        formatVital('lcp', insights?.lcpMs),
        formatVital('inp', insights?.inpMs),
        formatVital('cls', insights?.cls),
        formatVital('ttfb', insights?.ttfbMs),
        slow?.ttfbMs != null ? `${countryName(slow.country)} ${formatVital('ttfb', slow.ttfbMs)}` : '—',
      ]
    }),
  )
  const worst = ranked.find((project) => siteRating(project.speedInsights) === 'poor') ?? ranked[0]
  const slow = worst.speedInsights ? worstCountry(worst.speedInsights, 'ttfbMs') : null
  const named =
    worst && isMonitorSlowAsk(text)
      ? `最该看的是 **${worst.name}**，LCP ${formatVital('lcp', worst.speedInsights?.lcpMs)}${
          slow?.ttfbMs != null ? `，TTFB 最慢在 ${countryName(slow.country)}` : ''
        }。`
      : null
  return withNamedFirst(
    text,
    '解读性能',
    named,
    [`**全球性能 · 近 7 天 P75**`, '', table].join('\n'),
  )
}

function ratingRank(rating: ReturnType<typeof siteRating>): number {
  switch (rating) {
    case 'poor':
      return 3
    case 'ni':
      return 2
    case 'good':
      return 1
    case 'unknown':
      return 0
    default: {
      const exhaustive: never = rating
      return exhaustive
    }
  }
}

export function formatMonitorPages(cache: MonitorCache | null, text = ''): string {
  if (!cache) {
    return '还没有态势快照。要先说「刷新态势」。'
  }
  const pages = cache.snapshot.vercel.projects.flatMap((project) =>
    (project.analytics?.topPages ?? []).map((page) => ({ name: project.name, ...page })),
  )
  const ranked = [...pages].sort((left, right) => right.pageviews - left.pageviews).slice(0, 8)
  if (ranked.length === 0) {
    return '没有页面增量，不强行归因。'
  }
  const top = ranked[0]
  return withNamedFirst(
    text,
    '页面归因',
    top ? `浏览最多的是 **${top.name}** 的 \`${top.path}\`，${top.pageviews} 次。` : null,
    [
      '**页面归因**',
      '',
      markdownTable(
        ['#', '站点', '路径', '浏览', '变化'],
        ranked.map((page, index) => [
          String(index + 1),
          page.name,
          page.path,
          String(page.pageviews),
          page.deltaPct != null ? `${page.deltaPct}%` : '—',
        ]),
      ),
    ].join('\n'),
  )
}

export function formatWxToday(state: WechatHubState, refresh = false, text = ''): string {
  if (state.coverage.access !== 'ready' && state.today.length === 0) {
    return `还不能读今日行动：${coverageSummary(state.coverage.access, state.coverage.radarDb, Boolean(state.coverage.readerBin))}。可以说「接入体检」。`
  }
  const prefix = refresh ? '已刷新本机微信情报。' : ''
  if (state.today.length === 0) {
    return `${prefix}今天没有待处理的微信行动。`.trim()
  }
  const top = [...state.today].sort((left, right) => right.priority - left.priority)[0]
  return [
    prefix,
    withNamedFirst(
      text,
      '今日行动',
      top ? `最该先跟的是 **${top.title}**。` : null,
      [`今日行动 **${state.today.length}** 条：`, '', formatWxTable(state.today.slice(0, 8))].join('\n'),
    ),
  ]
    .filter(Boolean)
    .join('\n')
}

export function formatWxInbox(state: WechatHubState, text = ''): string {
  if (state.inbox.length === 0) {
    return '没有待回复或待分流的候选。只出草稿，不发微信。'
  }
  const top = [...state.inbox].sort((left, right) => right.priority - left.priority)[0]
  return withNamedFirst(
    text,
    '待回复',
    top ? `最该先回的是 **${top.title}**。` : null,
    [`待分流 **${state.inbox.length}** 条：`, '', formatWxTable(state.inbox.slice(0, 8))].join('\n'),
  )
}

export function formatWxLookup(state: WechatHubState, query: string): string {
  if (!query.trim()) {
    return '要查谁或哪件事？说「查人查事 张三」或一个主题。'
  }
  if (!state.lookup?.text.trim()) {
    return `查「${query.trim()}」没有命中。`
  }
  return [`查 **${state.lookup.query || query.trim()}**：`, '', markdownFence(state.lookup.text.trim().slice(0, 800))].join('\n')
}

export function formatWxAccess(state: WechatHubState): string {
  const access = ACCESS_LABEL[state.coverage.access]
  return `接入体检：${access}。${state.coverage.summary}`.trim()
}

export function parseTriageDecision(text: string): WechatTriageDecision | undefined {
  if (/未成交|lost/.test(text)) {
    return 'lost'
  }
  if (/成交|won/.test(text)) {
    return 'won'
  }
  if (/推进|pursue/.test(text)) {
    return 'pursue'
  }
  if (/等待|wait/.test(text)) {
    return 'wait'
  }
  if (/忽略|ignore/.test(text)) {
    return 'ignore'
  }
  if (/暂缓|pause/.test(text)) {
    return 'pause'
  }
  return undefined
}

export function lookupKindOf(text: string): WechatLookupKind {
  if (/人|谁/.test(text)) {
    return 'person'
  }
  if (/回复|草稿/.test(text)) {
    return 'reply'
  }
  return 'search'
}

export function pickIndexed<T>(
  items: readonly T[],
  text: string,
  options?: { pinnedIds?: readonly string[]; idOf?: (item: T) => string },
): { item: T; index: number } | { needle: string } | { kind: 'list' } {
  const pool =
    options?.pinnedIds?.length && options.idOf
      ? pinByIds(items, options.pinnedIds, options.idOf)
      : [...items]
  const ordinal = text.match(/第\s*([一二三四五六七八九十\d]+)\s*条?/)
  if (ordinal?.[1]) {
    const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
    const index = map[ordinal[1]] ?? Number(ordinal[1])
    const item = pool[index - 1]
    return item ? { item, index } : { needle: `第${index}条` }
  }
  return { kind: 'list' }
}

export function planAmmoLoad(
  text: string,
  ideas: ProductIdea[],
  pinnedIds?: readonly string[],
): { idea?: ProductIdea; reply?: string } {
  const pinned = pinnedIds?.length ? pinByIds(ideas, pinnedIds, (idea) => idea.id) : []
  const pending = pendingAmmoIdeas(ideas)
  const listed = pinned.length > 0 ? pinned : pending.length > 0 ? pending : todayIdeas(ideas)
  const focus = resolveListedIdea(
    text,
    listed,
    /装填弹药|生成弹药|装填|第\s*(十一|十二|十|[一二三四五六七八九]|\d+)\s*条?/g,
  )
  if (focus.kind === 'unknown') {
    return { reply: `对不上「${focus.needle}」这一条。装填要 Idea 指针。` }
  }
  if (focus.kind === 'list') {
    if (pending.length === 1 && pending[0] && pinned.length === 0) {
      return isIdeaSourceOpen(pending[0])
        ? { idea: pending[0] }
        : { idea: pending[0], reply: closedIdeaReply(pending[0]) }
    }
    if (listed.length === 0) {
      return { reply: '装填要一条 Idea 指针。先立项交接，或说「装填第三条」。不从监控能力偷偷写弹药。' }
    }
    return { reply: '要装填哪一条？说「装填第三条」或标题。' }
  }
  if (!isIdeaSourceOpen(focus.idea)) {
    return { idea: focus.idea, reply: closedIdeaReply(focus.idea) }
  }
  return { idea: focus.idea }
}

export function formatWxTriage(
  state: WechatHubState,
  text: string,
  pinnedIds?: readonly string[],
): { decision?: WechatTriageDecision; action?: WechatAction; reply: string } {
  const decision = parseTriageDecision(text)
  const listed = state.inbox.length > 0 ? state.inbox : state.today
  const picked = pickIndexed(listed, text, { pinnedIds, idOf: (item) => String(item.id) })
  if ('needle' in picked) {
    return { reply: `对不上「${picked.needle}」这一条。` }
  }
  if ('kind' in picked) {
    if (!decision) {
      return { reply: formatWxInbox(state) }
    }
    return { decision, reply: '要改判哪一条？说「推进第三条」或标题。' }
  }
  if (!decision) {
    return {
      action: picked.item,
      reply: [`**${picked.index} · ${picked.item.title}**`, '', '要推进、等待还是忽略？'].join('\n'),
    }
  }
  return {
    decision,
    action: picked.item,
    reply: `已把「${picked.item.title}」标成${WECHAT_TRIAGE_LABELS[decision]}。`,
  }
}

export function lookupQuery(text: string): string {
  return text.replace(/查人查事|查找|查一下|查/g, ' ').replace(/\s+/g, ' ').trim()
}

export function formatLedgerRead(state: PaymentsState): string {
  if (!state.snapshot && state.receipts.length === 0) {
    return state.settings.hasApiKey
      ? '还没有同步过账本。要先说「同步心跳」。'
      : '还没有账本。先到收款台填 Creem key，或手录一笔。不要假装已经同步。'
  }
  const names = new Map((state.snapshot?.products ?? []).map((product) => [product.id, product.name]))
  const ledger = buildLedger(state.snapshot, state.receipts, state.settings.rates, (id) => names.get(id) ?? id)
  const summary = financeSummary(ledger, state.snapshot, state.payouts, state.expenses, state.settings.rates)
  return [
    `**解读账本 ${summary.month}**`,
    '',
    markdownTable(
      ['本月', 'MRR', '客户', '待结算', '逾期', '将取消'],
      [
        [
          formatCny(summary.monthRevenueCny),
          formatCny(summary.mrrCny),
          String(summary.customers),
          formatCny(summary.pendingSettlementCny),
          String(summary.attention.pastDue),
          String(summary.attention.scheduledCancel),
        ],
      ],
    ),
  ].join('\n')
}

export function formatPaymentsSync(state: PaymentsState): string {
  if (!state.settings.hasApiKey) {
    return '缺 Creem 密钥，没有同步。先到收款台填 key。'
  }
  return [`已同步收款台账。`, formatLedgerRead(state)].join('\n')
}

export function formatMonthExport(state: PaymentsState): { name: string; csv: string; reply: string } {
  const names = new Map((state.snapshot?.products ?? []).map((product) => [product.id, product.name]))
  const ledger = buildLedger(state.snapshot, state.receipts, state.settings.rates, (id) => names.get(id) ?? id)
  const points = monthlySeries(ledger, state.expenses, state.settings.rates)
  return {
    name: '财务月报',
    csv: monthlyReportCsv(points),
    reply: '已导出财务月报 CSV。这是快照，不是第二份账。',
  }
}

export function formatAmmoLoad(state: SocialState, idea?: ProductIdea): string {
  if (state.generated <= 0) {
    return idea
      ? `没有为「${idea.title}」写出新弹药。可能已经装填过。`
      : '没有新的产品能力可写。先让项目监控官刷新一次，或打开弹药面板查看已有文案。'
  }
  const fresh = state.drafts.filter((draft) => (idea ? draft.ideaId === idea.id : true)).slice(0, state.generated)
  const shown = fresh.length > 0 ? fresh : state.drafts.slice(0, state.generated)
  return [
    idea
      ? `已按 Idea「${idea.title}」装填 **${state.generated}** 条弹药。只存指针 \`idea:${idea.id}\`。`
      : `已装填 **${state.generated}** 条弹药${state.usedModel ? '（模型润色）' : ''}。`,
    '',
    markdownTable(
      ['#', '平台', '标题'],
      shown.map((draft, index) => [
        String(index + 1),
        SOCIAL_PLATFORMS.find((item) => item.id === draft.platform)?.name ?? draft.platform,
        draft.title,
      ]),
    ),
  ].join('\n')
}

export function formatAmmoRecap(state: SocialState, text = ''): string {
  const hot = state.drafts.filter((draft) => {
    if (!draft.publishedAt) {
      return false
    }
    const metrics = latestMetricsForDraft(state.metrics, draft.id)
    return (metrics?.comments ?? 0) > 0
  })
  if (hot.length === 0) {
    return '没有带评论的已发稿，不拿未发草稿充数。'
  }
  const ranked = [...hot].sort((left, right) => {
    const leftMetrics = latestMetricsForDraft(state.metrics, left.id)
    const rightMetrics = latestMetricsForDraft(state.metrics, right.id)
    return (rightMetrics?.comments ?? 0) - (leftMetrics?.comments ?? 0) || (rightMetrics?.likes ?? 0) - (leftMetrics?.likes ?? 0)
  })
  const shown = shouldPickFromData(text, '复盘热帖') ? ranked : hot
  const top = ranked[0]
  const topMetrics = top ? latestMetricsForDraft(state.metrics, top.id) : null
  return withNamedFirst(
    text,
    '复盘热帖',
    top ? `最热的是 **${top.title}**，${topMetrics?.comments ?? 0} 评 ${topMetrics?.likes ?? 0} 赞。` : null,
    [
      `复盘热帖 **${hot.length}** 条：`,
      '',
      markdownTable(
        ['#', '稿', '评', '赞'],
        shown.slice(0, 8).map((draft, index) => {
          const metrics = latestMetricsForDraft(state.metrics, draft.id)
          return [String(index + 1), draft.title, String(metrics?.comments ?? 0), String(metrics?.likes ?? 0)]
        }),
      ),
    ].join('\n'),
  )
}

export function parsePublish(
  text: string,
  drafts: SocialState['drafts'],
  pinnedIds?: readonly string[],
): { id?: string; url?: string; reply: string } {
  const url = text.match(/https?:\/\/\S+/)?.[0]
  const unpublished = drafts.filter((draft) => !draft.publishedAt)
  const picked = pickIndexed(unpublished.length > 0 ? unpublished : drafts, text, { pinnedIds, idOf: (item) => item.id })
  if (!url) {
    return { reply: '发布登记需要一条已发链接，加上第几条弹药。' }
  }
  if ('needle' in picked || 'kind' in picked) {
    const byTitle = drafts.find((draft) => draft.title && text.includes(draft.title.slice(0, 8)))
    if (byTitle) {
      return { id: byTitle.id, url, reply: `已记下「${byTitle.title}」的发布链接。` }
    }
    return { url, reply: '要对哪一条弹药？说「发布登记 第一条」加链接。' }
  }
  return { id: picked.item.id, url, reply: `已记下「${picked.item.title}」的发布链接。` }
}

export function formatDraftHistory(state: WxDraftViewState): string {
  const last = state.records[0]
  if (!last) {
    return '还没收成过草稿。'
  }
  return [
    '**复查记录**',
    '',
    markdownTable(
      ['标题', '结果', '详情'],
      [[last.title, last.status === 'success' ? '成功' : '失败', last.draftMediaId || last.error || '—']],
    ),
  ].join('\n')
}

export function formatAccountList(state: AccountsState): string {
  if (state.accounts.length === 0) {
    return '还没有账号。建档只要小红书 / 视频号 / 抖音，并带上名字。'
  }
  return [
    `账号 **${state.accounts.length}** 个：`,
    '',
    markdownTable(
      ['#', '平台', '名字'],
      state.accounts.map((account, index) => [
        String(index + 1),
        ACCOUNT_PLATFORMS.find((item) => item.id === account.platform)?.name ?? account.platform,
        account.name,
      ]),
    ),
  ].join('\n')
}

export function parseAccountCreate(text: string): { platform?: AccountPlatformId; name?: string; reply: string } {
  const platform: AccountPlatformId | undefined = /小红书/.test(text)
    ? 'xiaohongshu'
    : /视频号/.test(text)
      ? 'channels'
      : /抖音/.test(text)
        ? 'douyin'
        : undefined
  const name = text.replace(/建档账号|建档|小红书|视频号|抖音/g, ' ').replace(/\s+/g, ' ').trim()
  if (!platform || !name) {
    return { platform, name, reply: '建档要平台和名字，例如「建档账号 小红书 阿宁」。' }
  }
  return { platform, name, reply: `已建档 ${ACCOUNT_PLATFORMS.find((item) => item.id === platform)?.name} · ${name}。` }
}

export function formatNotesFind(notes: NoteItem[], text: string): string {
  const query = text.replace(/找回|找一下|找/g, ' ').replace(/\s+/g, ' ').trim()
  if (!query) {
    return notes.length === 0 ? '随手记是空的。' : '要找哪一句？说「找回 关键词」。'
  }
  const hits = notes.filter((note) => note.text.includes(query))
  if (hits.length === 0) {
    return `找回「${query}」没有命中。`
  }
  return [
    `找回 **${hits.length}** 条：`,
    '',
    markdownTable(
      ['#', '笔记'],
      hits.slice(0, 8).map((note, index) => [String(index + 1), firstLine(note.text)]),
    ),
  ].join('\n')
}

export function pickNoteToPromote(notes: NoteItem[], text: string, pinnedIds?: readonly string[]): NoteItem | undefined {
  const picked = pickIndexed(notes, text, { pinnedIds, idOf: (item) => item.id })
  if ('item' in picked) {
    return picked.item
  }
  const query = text.replace(/升格待办|升格/g, ' ').replace(/\s+/g, ' ').trim()
  if (query) {
    return notes.find((note) => note.text.includes(query))
  }
  return undefined
}

export function parseManualReceipt(text: string, now = new Date()): { input?: ManualReceiptInput; reply: string } {
  const amountMatch = text.match(/(\d+(?:\.\d+)?)\s*(元|块|cny|rmb|美元|刀|usd|欧元|eur)?/i)
  const amount = amountMatch ? parseAmountToCents(amountMatch[1] ?? '') : 0
  const channel = matchManualChannel(text)
  const unit = amountMatch?.[2] ?? ''
  const currency = /美元|刀|usd/i.test(unit)
    ? 'USD'
    : /欧元|eur/i.test(unit)
      ? 'EUR'
      : channel
        ? defaultCurrencyForChannel(channel)
        : 'CNY'
  const customer = text
    .replace(/手工入账|入账|元|块|美元|刀|欧元/gi, ' ')
    .replace(channelNameStripPattern(), ' ')
    .replace(/\d+(?:\.\d+)?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (amount <= 0 || !channel) {
    return {
      reply: '手工入账要金额和渠道，例如「入账 199 元 微信 阿宁」或「入账 99 知识星球」。不会从微信成交或平台后台自动流入。',
    }
  }
  return {
    input: { date: dayKey(now), channel, amount, currency, customer },
    reply: `已手录 ${formatMoney(amount, currency)} · ${manualChannelName(channel)}${customer ? ` · ${customer}` : ''}。`,
  }
}

const EXPENSE_FROM_TEXT: { id: ExpenseCategory; re: RegExp }[] = [
  { id: 'SaaS 订阅', re: /saas|订阅/i },
  { id: '云服务', re: /云|vercel|aws/i },
  { id: '域名', re: /域名/ },
  { id: 'AI 模型', re: /模型|token|llm/i },
  { id: '设计素材', re: /设计|素材/ },
  { id: '推广', re: /推广|广告/ },
  { id: '税费', re: /税/ },
]

export function parseExpense(text: string, now = new Date()): { kind: 'payout' | 'expense'; input?: ExpenseRecordInput; reply: string } {
  if (/提现|结算到账|打款/.test(text)) {
    return { kind: 'payout', reply: '结算提现要到账金额、来源和账户。到结算提现那一面补，这条 Skill 一次只改一本账。' }
  }
  const amountMatch = text.match(/(\d+(?:\.\d+)?)\s*(元|块|美元|刀|usd)?/i)
  const amount = amountMatch ? parseAmountToCents(amountMatch[1] ?? '') : 0
  const category: ExpenseCategory | undefined = EXPENSE_FROM_TEXT.find((item) => item.re.test(text))?.id
  const vendor = text
    .replace(/支出结算|记一笔支出|记支出|支出|元|块/g, ' ')
    .replace(/\d+(?:\.\d+)?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (amount <= 0) {
    return { kind: 'expense', reply: '记支出要金额，例如「记支出 79 元 SaaS」。' }
  }
  return {
    kind: 'expense',
    input: {
      date: dayKey(now),
      category: category && isExpenseCategory(category) ? category : '其他',
      amount,
      currency: /美元|刀|usd/i.test(text) ? 'USD' : 'CNY',
      vendor,
    },
    reply: `已记下支出 ${formatCny(amount)}${vendor ? ` · ${vendor}` : ''}。`,
  }
}

export function parseAmmoMetrics(text: string): { input?: Omit<SocialMetricsInput, 'platform' | 'draftId'>; reply?: string } {
  const numberAt = (...labels: string[]): number | undefined => {
    for (const label of labels) {
      const hit = text.match(new RegExp(`${label}\\s*(\\d+)`))
      if (hit?.[1]) {
        return Number(hit[1])
      }
    }
    return undefined
  }
  const views = numberAt('浏览', '曝光', '播放')
  const likes = numberAt('赞', '喜欢')
  const comments = numberAt('评论', '评')
  const shares = numberAt('转发', '分享')
  const saves = numberAt('收藏', '书签')
  if (views == null && likes == null && comments == null && shares == null && saves == null) {
    return { reply: '采集互动要数字，例如「采集互动 第一条 浏览 120 赞 3 评 1」。不写 0 充数。' }
  }
  return {
    input: {
      views: views ?? 0,
      likes: likes ?? 0,
      comments: comments ?? 0,
      shares: shares ?? 0,
      saves: saves ?? 0,
    },
  }
}

export function pickAccount(accounts: SocialAccount[], text: string): SocialAccount | undefined {
  const picked = pickIndexed(accounts, text)
  if ('item' in picked) {
    return picked.item
  }
  const platform: AccountPlatformId | undefined = /小红书/.test(text)
    ? 'xiaohongshu'
    : /视频号/.test(text)
      ? 'channels'
      : /抖音/.test(text)
        ? 'douyin'
        : undefined
  if (platform) {
    const hits = accounts.filter((account) => account.platform === platform)
    return hits.length === 1 ? hits[0] : hits.find((account) => text.includes(account.name))
  }
  return accounts.find((account) => text.includes(account.name))
}

export function parseAccountLog(text: string): { title?: string; url?: string } {
  const url = text.match(/https?:\/\/\S+/)?.[0]
  const title = text
    .replace(/记今日发出|今日发出|小红书|视频号|抖音|第\s*[一二三四五六七八九十\d]+\s*条?/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { title: title || undefined, url }
}

export function parseAccountMetrics(text: string): { views?: number; followers?: number; reply?: string } {
  const views = text.match(/浏览\s*(\d+)/)?.[1] ?? text.match(/播放\s*(\d+)/)?.[1]
  const followers = text.match(/粉丝\s*(\d+)/)?.[1]
  if (!views && !followers) {
    return { reply: '采当日数据要浏览或粉丝数字，例如「采当日数据 小红书 浏览 800 粉丝 12」。这不是单条弹药互动。' }
  }
  return { views: views ? Number(views) : undefined, followers: followers ? Number(followers) : undefined }
}

export function parseMaterialPointer(
  text: string,
  ideas: ProductIdea[],
  drafts: SocialState['drafts'],
): { title: string; summary: string } | { reply: string } {
  const needle = text.replace(/关联选材|选材/g, ' ').replace(/\s+/g, ' ').trim()
  if (!needle) {
    return { reply: '关联选材只要 Idea 或 Ammo 的指针。先点名标题，或先去选品 / 弹药手。' }
  }
  const idea = ideas.find((item) => item.title.includes(needle) || needle.includes(item.title.slice(0, 6)))
  if (idea) {
    if (!isIdeaSourceOpen(idea)) {
      return { reply: closedIdeaReply(idea) }
    }
    return { title: idea.title, summary: `idea:${idea.id}` }
  }
  const draft = drafts.find((item) => item.title.includes(needle) || needle.includes(item.title.slice(0, 6)))
  if (draft) {
    return { title: draft.title, summary: `ammo:${draft.id}` }
  }
  return { reply: '没有对上 Idea 或 Ammo。先去选品或弹药手，不在账号侧复制一份选题。' }
}

export function parseWxDraftBody(text: string): { markdown?: string; title?: string; reply?: string } {
  const body = text.replace(/收成草稿|转稿/g, '').trim()
  if (body.length < 80) {
    return { reply: '收成草稿需要一篇 Markdown。把文件拖到公众号面板，或贴上足够长的正文。不空跑。' }
  }
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim()
  return { markdown: body, title: heading || firstLine(body).slice(0, 64) }
}

export function formatMailInbox(state: MailState, text = ''): string {
  if (state.accounts.length === 0 && !state.local.available) {
    return '还没有接入邮箱。可以说「接入邮箱」，加上本机邮件.app，或 iCloud / Gmail / QQ。不代发。'
  }
  const open = openMailMessages(state.messages)
  const unread = unreadMailMessages(state.messages)
  if (open.length === 0) {
    return state.lastError
      ? `收件箱是空的。上次同步：${state.lastError}`
      : '收件箱里没有待整理的信。带「刷新」才会再拉一次。不代发。'
  }
  const top = unread[0] ?? open[0]
  return withNamedFirst(
    text,
    '收件箱',
    top ? `最该先看的是 **${top.subject}**（${top.from}）。` : null,
    [
      `待整理 **${open.length}** 封${unread.length ? ` · 未读 ${unread.length}` : ''}：`,
      '',
      formatMailTable(open.slice(0, 8)),
    ].join('\n'),
  )
}

export function formatMailLookup(state: MailState, query: string): string {
  if (!query.trim()) {
    return '要查谁或哪封？说「查邮件 导师」或主题里的词。'
  }
  const hits = searchMailMessages(state.messages, query)
  if (hits.length === 0) {
    return `查「${query.trim()}」没有命中。先刷新收件箱。`
  }
  return [`查 **${query.trim()}** 命中 ${String(hits.length)} 封：`, '', formatMailTable(hits.slice(0, 8))].join('\n')
}

export function formatMailAccess(state: MailState): string {
  const local = state.local.available
    ? `本机邮件.app 可读（${state.local.accounts.join('、') || '已接入'}）`
    : state.local.error || '本机邮件.app 还没接通'
  const online = state.accounts.filter((item) => item.provider !== 'local')
  const ready = online.filter((item) => item.hasPassword && item.enabled)
  const lines = [
    `接入体检：${local}。`,
    online.length === 0
      ? '还没有 iCloud / Gmail / QQ。在邮件整理面板用专用密码接入，不要填登录密码。'
      : `线上 ${String(ready.length)}/${String(online.length)} 个账号已保存密码。`,
  ]
  if (state.lastError) {
    lines.push(state.lastError)
  }
  return lines.join(' ')
}

export function formatMailTriage(
  state: MailState,
  text: string,
  pinnedIds?: readonly string[],
): { decision?: MailTriage; message?: MailMessage; reply: string } {
  const decision = parseMailTriage(text)
  const listed = openMailMessages(state.messages)
  const picked = pickIndexed(listed, text, { pinnedIds, idOf: (item) => item.id })
  if ('needle' in picked) {
    return { reply: `对不上「${picked.needle}」这一封。` }
  }
  if ('kind' in picked) {
    if (!decision) {
      return { reply: formatMailInbox(state) }
    }
    return { decision, reply: '要改哪一封？说「归档第三条」或主题。' }
  }
  if (!decision) {
    return {
      message: picked.item,
      reply: [`**${picked.index} · ${picked.item.subject}**`, '', '要跟进、归档还是忽略？'].join('\n'),
    }
  }
  return {
    decision,
    message: picked.item,
    reply: `已把「${picked.item.subject}」标成${MAIL_TRIAGE_LABELS[decision]}。不代发。`,
  }
}

export function formatMailDraft(
  state: MailState,
  text: string,
  pinnedIds?: readonly string[],
): { message?: MailMessage; draft?: string; reply: string } {
  const listed = openMailMessages(state.messages)
  const picked = pickIndexed(listed, text, { pinnedIds, idOf: (item) => item.id })
  const draft = text
    .replace(/邮件回复|回信草稿|写回信|回复草稿/g, ' ')
    .replace(/第\s*([一二三四五六七八九十\d]+)\s*条?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if ('needle' in picked) {
    return { reply: `对不上「${picked.needle}」这一封。` }
  }
  if ('kind' in picked) {
    return { reply: listed.length === 0 ? formatMailInbox(state) : '回哪一封？说「回信草稿 第三条」再写正文。只留本机，不代发。' }
  }
  if (!draft) {
    const existing = state.drafts.find((item) => item.messageId === picked.item.messageId)
    return {
      message: picked.item,
      reply: existing
        ? [`「${picked.item.subject}」已有草稿：`, '', markdownFence(existing.text.slice(0, 400))].join('\n')
        : `给「${picked.item.subject}」写一句回信，我只存草稿，不代发。`,
    }
  }
  return {
    message: picked.item,
    draft,
    reply: `已为「${picked.item.subject}」留下回信草稿。只留本机，不代发。`,
  }
}

function formatMailTable(rows: MailMessage[]): string {
  return markdownTable(
    ['#', '来自', '主题', '状态'],
    rows.map((row, index) => [
      String(index + 1),
      row.from.slice(0, 24) || '—',
      row.subject.slice(0, 32),
      row.unread ? '未读' : MAIL_TRIAGE_LABELS[row.triage],
    ]),
  )
}

function formatWxTable(rows: WechatAction[]): string {
  return markdownTable(
    ['#', '行动', '下一步'],
    rows.map((row, index) => [String(index + 1), row.title, row.nextAction || row.lastSignal || row.status || '—']),
  )
}
