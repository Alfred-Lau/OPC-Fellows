import {
  DOMAIN_LABEL,
  FORM_LABEL,
  MICRO_AGENT_ID,
  MICRO_GROUPS,
  MICRO_TAG,
  PAIN_SOURCES,
  STATUS_LABEL,
  VERDICT_LABEL,
  formatDayLabel,
  isMicroGroupId,
  kpis,
  parsePainSources,
  pipelineIdeas,
  todayIdeas,
  type IdeaStatus,
  type IdeaVerdict,
  type MicroGroupId,
  type MicroSourcingState,
  type PainDomain,
  type PainSignal,
  type ProductIdea,
} from '../../shared/micro-sourcing'
import { PRODUCT_NAME } from '../../shared/brand'
import { dayKey } from '../../shared/datetime'

const refreshBtn = required('#micro-refresh', HTMLButtonElement)
const updatedEl = required('#micro-updated', HTMLSpanElement)
const statusEl = required('#micro-status', HTMLParagraphElement)
const scanBar = required('#micro-scan-bar', HTMLDivElement)
const navEl = required('#micro-nav', HTMLElement)
const kpisEl = required('#micro-kpis', HTMLDivElement)
const domainFilters = required('#micro-domain-filters', HTMLDivElement)
const todayMeta = required('#micro-today-meta', HTMLSpanElement)
const todayList = required('#micro-today-list', HTMLDivElement)
const ideasMeta = required('#micro-ideas-meta', HTMLSpanElement)
const ideasList = required('#micro-ideas-list', HTMLDivElement)
const signalsMeta = required('#micro-signals-meta', HTMLSpanElement)
const signalsEl = required('#micro-signals', HTMLUListElement)
const pipelineMeta = required('#micro-pipeline-meta', HTMLSpanElement)
const pipelineList = required('#micro-pipeline-list', HTMLDivElement)
const sourcesEl = required('#micro-sources', HTMLUListElement)
const settingsForm = required('#micro-settings-form', HTMLFormElement)
const heartbeatEl = required('#micro-heartbeat', HTMLSelectElement)
const notifyEl = required('#micro-notify', HTMLInputElement)
const todoEl = required('#micro-todo', HTMLInputElement)
const proxyEl = required('#micro-proxy', HTMLInputElement)
const customSourcesEl = required('#micro-custom-sources', HTMLTextAreaElement)
const domCreator = required('#micro-dom-creator', HTMLInputElement)
const domEcommerce = required('#micro-dom-ecommerce', HTMLInputElement)
const domProductivity = required('#micro-dom-productivity', HTMLInputElement)
const domIndie = required('#micro-dom-indie', HTMLInputElement)

const STATUS_ACTIONS: readonly { status: IdeaStatus; label: string }[] = [
  { status: 'watching', label: '盯着' },
  { status: 'building', label: '动手做' },
  { status: 'parked', label: '搁置' },
  { status: 'dismissed', label: '丢掉' },
]

let bound = false
let loading = false
let currentGroup: MicroGroupId = 'today'
let domainFilter: PainDomain | 'all' = 'all'
let categoryFilter: SignalCategory | 'all' = 'all'
let state: MicroSourcingState | null = null

type SignalCategory = 'idea' | 'competitor' | 'self-promo' | 'discussion' | 'plea'

const CATEGORY_LABEL: Record<SignalCategory, string> = {
  idea: '已入 Idea',
  competitor: '竞品观察',
  'self-promo': '自推帖',
  discussion: '求助/讨论',
  plea: '求助/讨论',
}

const CATEGORY_FILTERS: readonly { id: SignalCategory | 'all'; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'competitor', label: '竞品观察' },
  { id: 'self-promo', label: '自推帖' },
  { id: 'plea', label: '求助讨论' },
  { id: 'idea', label: '已入 Idea' },
]

const COMPETITOR_TITLE_RE = /^(?:launch hn|show hn|tell hn)\b/i
const SELF_PROMO_TITLE_RE =
  /\b(?:i built|we built|i'm building|we're building|my side project|i made|we made|i spent \d+|sharing it|giving away|tear it apart|feedback wanted|first launch|we missed)\b/i

function normalizeSignalTitle(title: string): string {
  return title.replace(/\u2019/g, "'").replace(/\u2018/g, "'").trim()
}

function ideaSignalIds(snapshot: MicroSourcingState): Set<string> {
  return new Set(snapshot.ideas.flatMap((idea) => idea.signalIds))
}

function categoryFor(row: PainSignal, ideaIds: Set<string>): SignalCategory {
  if (ideaIds.has(row.id)) {
    return 'idea'
  }
  const title = normalizeSignalTitle(row.title)
  if (COMPETITOR_TITLE_RE.test(title)) {
    return 'competitor'
  }
  if (SELF_PROMO_TITLE_RE.test(title)) {
    return 'self-promo'
  }
  return 'plea'
}

function categoryFiltersEl(): HTMLDivElement {
  const existing = document.querySelector('#micro-category-filters')
  if (existing instanceof HTMLDivElement) {
    return existing
  }
  const node = document.createElement('div')
  node.id = 'micro-category-filters'
  node.className = 'social-filters'
  signalsEl.parentElement?.insertBefore(node, signalsEl)
  return node
}

function required<T extends typeof HTMLElement>(selector: string, ctor: T): InstanceType<T> {
  const node = document.querySelector(selector)
  if (!(node instanceof ctor)) {
    throw new Error(`missing ${selector}`)
  }
  return node as InstanceType<T>
}

function showGroup(id: MicroGroupId): void {
  currentGroup = id
  for (const group of document.querySelectorAll('#view-micro .micro-group')) {
    if (!(group instanceof HTMLElement)) {
      continue
    }
    group.hidden = group.dataset.group !== id
  }
  renderNav()
}

function renderNav(): void {
  navEl.replaceChildren()
  const snapshot = state
  for (const group of MICRO_GROUPS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'monitor-nav-item'
    button.classList.toggle('is-current', group.id === currentGroup)
    const label = document.createElement('span')
    label.className = 'monitor-nav-label'
    label.textContent = group.label
    button.append(label)
    if (snapshot) {
      const badge = badgeFor(group.id, snapshot)
      if (badge) {
        const mark = document.createElement('span')
        mark.className = 'tick-count'
        mark.textContent = badge
        button.append(mark)
      }
    }
    button.addEventListener('click', () => {
      showGroup(group.id)
    })
    navEl.append(button)
  }
}

function badgeFor(id: MicroGroupId, snapshot: MicroSourcingState): string {
  switch (id) {
    case 'today':
      return String(todayIdeas(snapshot.ideas).length)
    case 'ideas':
      return String(
        snapshot.ideas.filter((idea) => idea.status !== 'dismissed' && idea.postedDay === dayKey(new Date())).length,
      )
    case 'signals':
      return String(snapshot.signals.length)
    case 'pipeline':
      return String(pipelineIdeas(snapshot.ideas).length)
    case 'settings':
      return snapshot.lastRun?.errors.length ? String(snapshot.lastRun.errors.length) : ''
    default: {
      const _never: never = id
      return _never
    }
  }
}

function inDomain(idea: { domain: PainDomain }): boolean {
  return domainFilter === 'all' || idea.domain === domainFilter
}

function renderKpis(snapshot: MicroSourcingState): void {
  const numbers = kpis(snapshot)
  kpisEl.replaceChildren()
  for (const item of [
    { label: '信号', value: String(numbers.signals) },
    { label: 'Idea', value: String(numbers.ideas), key: true },
    { label: '盯着', value: String(numbers.watching) },
    { label: '动手做', value: String(numbers.building) },
    { label: '付费信号', value: String(numbers.pay) },
    { label: '最近扫描', value: numbers.scannedOn },
  ]) {
    const card = document.createElement('div')
    card.className = item.key ? 'users-stat is-key' : 'users-stat'
    const value = document.createElement('b')
    value.textContent = item.value
    const label = document.createElement('i')
    label.textContent = item.label
    card.append(value, label)
    kpisEl.append(card)
  }
}

function renderDomainFilters(): void {
  domainFilters.replaceChildren()
  const options: Array<{ id: PainDomain | 'all'; label: string }> = [
    { id: 'all', label: '全部领域' },
    { id: 'creator', label: DOMAIN_LABEL.creator },
    { id: 'ecommerce', label: DOMAIN_LABEL.ecommerce },
    { id: 'productivity', label: DOMAIN_LABEL.productivity },
    { id: 'indie', label: DOMAIN_LABEL.indie },
  ]
  for (const option of options) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'social-chip'
    button.textContent = option.label
    button.classList.toggle('is-current', option.id === domainFilter)
    button.addEventListener('click', () => {
      domainFilter = option.id
      if (state) {
        paint(state)
      }
    })
    domainFilters.append(button)
  }
}

function renderCategoryFilters(): void {
  const root = categoryFiltersEl()
  root.replaceChildren()
  for (const option of CATEGORY_FILTERS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'social-chip'
    button.textContent = option.label
    button.classList.toggle('is-current', option.id === categoryFilter)
    button.addEventListener('click', () => {
      categoryFilter = option.id
      if (state) {
        paint(state)
      }
    })
    root.append(button)
  }
}

function emptyBox(text: string): HTMLDivElement {
  const node = document.createElement('div')
  node.className = 'micro-empty'
  node.textContent = text
  return node
}

function renderIdeaList(root: HTMLElement, ideas: ProductIdea[], snapshot: MicroSourcingState, empty: string): void {
  root.replaceChildren()
  const visible = ideas.filter(inDomain)
  if (visible.length === 0) {
    root.append(emptyBox(empty))
    return
  }
  for (const idea of visible) {
    root.append(ideaCard(idea, snapshot))
  }
}

function verdictClass(verdict: IdeaVerdict): string {
  switch (verdict) {
    case 'build':
      return 'is-build'
    case 'watch':
      return 'is-watch'
    case 'kill':
      return 'is-kill'
    case 'unknown':
      return 'is-unknown'
    default: {
      const _never: never = verdict
      return _never
    }
  }
}

function ideaCard(idea: ProductIdea, snapshot: MicroSourcingState): HTMLElement {
  const card = document.createElement('article')
  card.className = idea.rank <= 3 && idea.status === 'new' ? 'micro-card is-hot' : 'micro-card'
  const top = document.createElement('div')
  top.className = 'micro-card-top'
  const rank = document.createElement('span')
  rank.className = 'micro-rank'
  rank.textContent = idea.rank > 0 ? String(idea.rank).padStart(2, '0') : '—'
  const title = document.createElement('h3')
  title.textContent = idea.title
  top.append(rank, title)
  if (idea.prevRank && idea.rank > 0 && idea.prevRank !== idea.rank) {
    const delta = document.createElement('span')
    delta.className = idea.rank < idea.prevRank ? 'micro-delta' : 'micro-delta is-down'
    delta.textContent = idea.rank < idea.prevRank ? `↑${idea.prevRank - idea.rank}` : `↓${idea.rank - idea.prevRank}`
    top.append(delta)
  }

  const dates = document.createElement('p')
  dates.className = 'micro-dates'
  const posted = formatDayLabel(idea.postedDay)
  const scanned = formatDayLabel(idea.scanDay)
  dates.textContent =
    idea.postedDay === idea.scanDay
      ? `发帖日 ${posted} · 扫描 ${scanned}`
      : `证据日 ${posted} · 扫描 ${scanned} · 非今日新帖（管线保留）`

  const pain = document.createElement('p')
  pain.className = 'micro-pain'
  pain.textContent = idea.pain === idea.title ? `${idea.who} · ${idea.workaround}` : idea.pain

  const meta = document.createElement('div')
  meta.className = 'micro-meta'
  const verdict = document.createElement('span')
  verdict.className = `micro-chip is-verdict ${verdictClass(idea.analysis.verdict)}`
  verdict.textContent = `判决 ${VERDICT_LABEL[idea.analysis.verdict]}`
  meta.append(verdict)
  for (const text of [DOMAIN_LABEL[idea.domain], FORM_LABEL[idea.form], STATUS_LABEL[idea.status], idea.usedModel ? '模型调查' : '规则锐评']) {
    const chip = document.createElement('span')
    chip.className = 'micro-chip'
    chip.textContent = text
    meta.append(chip)
  }
  if (idea.paySignals > 0) {
    const chip = document.createElement('span')
    chip.className = 'micro-chip is-pay'
    chip.textContent = `${idea.paySignals} 条付费原话`
    meta.append(chip)
  }

  const scores = document.createElement('div')
  scores.className = 'micro-scores'
  for (const item of [
    { label: '综合', value: idea.composite },
    { label: '痛感', value: idea.painScore },
    { label: '热度', value: Math.round(idea.heat) },
    { label: '证据', value: idea.signalIds.length },
  ]) {
    const chip = document.createElement('span')
    chip.className = 'micro-chip is-score'
    const bold = document.createElement('b')
    bold.textContent = String(item.value)
    chip.append(`${item.label} `, bold)
    scores.append(chip)
  }

  const analysis = document.createElement('div')
  analysis.className = 'micro-analysis'
  if (idea.analysis.sharpness) {
    const sharp = document.createElement('p')
    sharp.className = 'micro-sharp'
    sharp.textContent = idea.analysis.sharpness
    analysis.append(sharp)
  }
  if (idea.analysis.market) {
    const market = document.createElement('p')
    market.className = 'micro-market'
    market.textContent = idea.analysis.market
    analysis.append(market)
  }
  const extras = [
    idea.who ? `谁在痛：${idea.who}` : '',
    idea.workaround ? `现在怎么凑合：${idea.workaround}` : '',
    idea.analysis.competitors ? `竞品/现成工具：${idea.analysis.competitors}` : '',
    idea.analysis.whyHard ? `做不起的地方：${idea.analysis.whyHard}` : '',
    idea.analysis.opcFit ? `一人公司门槛：${idea.analysis.opcFit}` : '',
  ].filter(Boolean)
  for (const line of extras) {
    const para = document.createElement('p')
    para.className = 'micro-fact'
    para.textContent = line
    analysis.append(para)
  }

  const evidence = document.createElement('ol')
  evidence.className = 'micro-evidence'
  const factLines = idea.analysis.evidence.length > 0
    ? idea.analysis.evidence
    : idea.signalIds
        .map((id) => snapshot.signals.find((signal) => signal.id === id))
        .filter((signal): signal is PainSignal => Boolean(signal))
        .slice(0, 6)
        .map((post) => `${post.community} · ${formatDayLabel(post.postedDay)} · 赞 ${post.score} / 评 ${post.comments} · ${post.title}`)
  for (const line of factLines.slice(0, 8)) {
    const item = document.createElement('li')
    item.textContent = line
    evidence.append(item)
  }
  const posts = idea.signalIds
    .map((id) => snapshot.signals.find((signal) => signal.id === id))
    .filter((signal): signal is PainSignal => Boolean(signal))
    .slice(0, 6)
  for (const post of posts) {
    const item = document.createElement('li')
    const link = document.createElement('a')
    link.href = post.url
    link.target = '_blank'
    link.rel = 'noreferrer'
    link.textContent = `原文 ${post.community} · ${post.title}`
    item.append(link)
    if (post.body) {
      const quote = document.createElement('p')
      quote.className = 'micro-quote'
      quote.textContent = post.body.slice(0, 280)
      item.append(quote)
    }
    evidence.append(item)
  }

  const actions = document.createElement('div')
  actions.className = 'micro-actions'
  for (const action of STATUS_ACTIONS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = action.label
    button.classList.toggle('is-on', idea.status === action.status)
    button.addEventListener('click', () => {
      void patchIdea(idea.id, { status: action.status })
    })
    actions.append(button)
  }
  const follow = document.createElement('button')
  follow.type = 'button'
  follow.textContent = '写成待办'
  follow.addEventListener('click', () => {
    void window.ownworkbuddy.todos.ingestAgent({
      agentId: MICRO_AGENT_ID,
      source: 'Micro 选品策略',
      tags: [MICRO_TAG],
      items: [
        {
          title: `验证选品：${idea.title}`,
          note: [idea.analysis.sharpness, idea.pain, idea.workaround, `发帖日 ${idea.postedDay}`, `形态 ${FORM_LABEL[idea.form]}`]
            .filter(Boolean)
            .join('\n'),
          dedupeKey: `micro:follow:${idea.id}`,
        },
      ],
    })
  })
  actions.append(follow)

  const note = document.createElement('input')
  note.className = 'micro-note'
  note.type = 'text'
  note.placeholder = '自己的判断 / 为什么做或不做（默认别信模型的好话）'
  note.value = idea.note
  note.addEventListener('change', () => {
    void patchIdea(idea.id, { note: note.value })
  })

  card.append(top, dates, pain, meta, scores, analysis, evidence, actions, note)
  return card
}

function renderSignals(snapshot: MicroSourcingState): void {
  signalsEl.replaceChildren()
  const ideaIds = ideaSignalIds(snapshot)
  const rows = snapshot.signals
    .filter((row) => inDomain(row) && (categoryFilter === 'all' || categoryFor(row, ideaIds) === categoryFilter))
    .slice()
    .sort((left, right) => right.composite - left.composite)
    .slice(0, 80)
  if (rows.length === 0) {
    const item = document.createElement('li')
    item.className = 'empty'
    const inDomainCount = snapshot.signals.filter(inDomain).length
    item.textContent =
      snapshot.signals.length === 0
        ? '还没有扫描过。点右上角「扫描金矿」。'
        : inDomainCount === 0
          ? '今天这个领域没有新帖。'
          : '这个分类下没有信号。'
    signalsEl.append(item)
    return
  }
  for (const row of rows) {
    const item = document.createElement('li')
    const link = document.createElement('a')
    link.className = 'micro-signal'
    link.href = row.url
    link.target = '_blank'
    link.rel = 'noreferrer'
    const main = document.createElement('div')
    const title = document.createElement('strong')
    title.textContent = row.title
    const cat = document.createElement('span')
    const category = categoryFor(row, ideaIds)
    cat.className = `micro-cat is-${category}`
    cat.textContent = CATEGORY_LABEL[category]
    const meta = document.createElement('span')
    meta.textContent = `${formatDayLabel(row.postedDay)} · ${row.community} · ${DOMAIN_LABEL[row.domain]} · 赞 ${row.score} · 评 ${row.comments}${row.paySignal ? ' · 付费原话' : ''}`
    if (row.body) {
      const body = document.createElement('em')
      body.className = 'micro-signal-body'
      body.textContent = row.body.slice(0, 220)
      main.append(title, cat, meta, body)
    } else {
      main.append(title, cat, meta)
    }
    const score = document.createElement('b')
    score.textContent = String(row.composite)
    link.append(main, score)
    item.append(link)
    signalsEl.append(item)
  }
}

function renderSources(snapshot: MicroSourcingState): void {
  sourcesEl.replaceChildren()
  for (const source of [...PAIN_SOURCES, ...snapshot.settings.customSources]) {
    const item = document.createElement('li')
    const on = snapshot.settings.domains[source.domain]
    const link = document.createElement('div')
    link.className = 'micro-signal'
    const main = document.createElement('div')
    const title = document.createElement('strong')
    title.textContent = source.label
    const meta = document.createElement('span')
    const error = snapshot.lastRun?.errors.find((row) => row.source === source.label)
    meta.textContent = `${DOMAIN_LABEL[source.domain]} · ${source.kind === 'reddit' ? (source.subs ?? []).map((sub) => `r/${sub}`).join(' + ') : source.kind === 'appstore' ? `${(source.queries ?? []).join(' / ') || '未配置 App'} · ≤${source.starMax ?? 3}星差评` : source.kind === 'x' ? `X · ${(source.queries ?? []).length} 条搜索 · Latest` : `HN · ${source.hnTags ?? 'story'}`}${on ? '' : ' · 已关闭'}${error ? ` · ${error.message}` : ''}`
    main.append(title, meta)
    link.append(main)
    item.append(link)
    sourcesEl.append(item)
  }
}

function fillSettings(snapshot: MicroSourcingState): void {
  const settings = snapshot.settings
  heartbeatEl.value = String(settings.heartbeatHours)
  notifyEl.checked = settings.notify
  todoEl.checked = settings.todoFollowUp
  proxyEl.value = settings.proxyUrl
  domCreator.checked = settings.domains.creator
  domEcommerce.checked = settings.domains.ecommerce
  domProductivity.checked = settings.domains.productivity
  domIndie.checked = settings.domains.indie
  customSourcesEl.value = settings.customSources.length > 0 ? JSON.stringify(settings.customSources, null, 2) : ''
}

function stampOf(iso: string | null | undefined): string {
  if (!iso) {
    return '未扫描'
  }
  const when = new Date(iso)
  if (Number.isNaN(when.getTime())) {
    return '未扫描'
  }
  return `${when.getMonth() + 1}/${when.getDate()} ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`
}

function setScanningUi(active: boolean): void {
  refreshBtn.disabled = active
  refreshBtn.textContent = active ? '扫描中…' : '扫描金矿'
  refreshBtn.setAttribute('aria-busy', active ? 'true' : 'false')
  scanBar.hidden = !active
  statusEl.classList.toggle('is-scanning', active)
  if (active) {
    updatedEl.textContent = '扫描中'
    statusEl.classList.remove('is-error')
    statusEl.textContent = '正在扫当天的 Reddit / HN 新帖，拉正文和评论，再做不迎合的调查…可能要半分钟。'
  }
}

function paint(snapshot: MicroSourcingState): void {
  state = snapshot
  setScanningUi(snapshot.scanning)
  if (!snapshot.scanning) {
    updatedEl.textContent = stampOf(snapshot.lastRun?.at)
  }
  const errors = snapshot.lastRun?.errors ?? []
  statusEl.classList.toggle('is-error', Boolean(snapshot.lastError) && !snapshot.scanning)
  if (snapshot.scanning) {
    statusEl.textContent = '正在扫当天的 Reddit / HN 新帖，拉正文和评论，再做不迎合的调查…可能要半分钟。'
  } else if (snapshot.lastError) {
    statusEl.textContent = snapshot.lastError
  } else if (snapshot.lastRun) {
    const model = snapshot.lastRun.usedModel
      ? 'DeepSeek 已按帖内事实做锐评（默认偏杀，不编市场规模）。'
      : '按规则锐评；配 DeepSeek key 会做更深的调查，仍然禁止迎合。'
    const fail = errors.length > 0 ? ` ${errors.length} 个源失败。` : ''
    statusEl.textContent = `${formatDayLabel(dayKey(new Date(snapshot.lastRun.at)))} 当天帖 ${snapshot.lastRun.signalCount} 条，聚成 ${snapshot.lastRun.ideaCount} 个 idea，新出现 ${snapshot.lastRun.newIdeas} 个。只收当天，不用存量热帖充数。${model}${fail}`
  } else {
    statusEl.textContent = '只捞今天新发的 Reddit / Ask HN 帖，标清日期，再用事实做不迎合的选品调查。'
  }
  renderNav()
  renderKpis(snapshot)
  renderDomainFilters()
  renderCategoryFilters()
  const ranked = snapshot.ideas.filter((idea) => idea.status !== 'dismissed')
  const day = snapshot.lastRun ? dayKey(new Date(snapshot.lastRun.at)) : dayKey(new Date())
  todayMeta.textContent = `${formatDayLabel(day)} · ${todayIdeas(ranked).filter(inDomain).length} 条当天`
  renderIdeaList(todayList, todayIdeas(ranked), snapshot, `今天（${formatDayLabel(day)}）还没有够痛的新帖。不会拿昨天的热帖来凑。`)
  ideasMeta.textContent = `${ranked.filter(inDomain).length} 条`
  renderIdeaList(ideasList, ranked.filter((idea) => idea.postedDay === day), snapshot, '今天没有可做的 idea。管线里的旧判断在「观察管线」。')
  const inDomainSignals = snapshot.signals.filter(inDomain)
  const ideaIds = ideaSignalIds(snapshot)
  let competitorCount = 0
  let selfPromoCount = 0
  for (const row of inDomainSignals) {
    const category = categoryFor(row, ideaIds)
    if (category === 'competitor') {
      competitorCount += 1
    } else if (category === 'self-promo') {
      selfPromoCount += 1
    }
  }
  signalsMeta.textContent = `共 ${inDomainSignals.length} 条 · 竞品观察 ${competitorCount} 条 · 自推 ${selfPromoCount} 条`
  renderSignals(snapshot)
  const pipeline = pipelineIdeas(snapshot.ideas)
  pipelineMeta.textContent = `${pipeline.filter(inDomain).length} 条`
  renderIdeaList(pipelineList, pipeline, snapshot, '还没有盯着或动手做的 idea。在热榜上点「盯着」。')
  renderSources(snapshot)
  fillSettings(snapshot)
}

function readCustomSources(): ReturnType<typeof parsePainSources> {
  const raw = customSourcesEl.value.trim()
  if (!raw) {
    return []
  }
  try {
    return parsePainSources(JSON.parse(raw))
  } catch {
    return []
  }
}

function microApi(): Window['ownworkbuddy']['micro'] {
  const api = window.ownworkbuddy.micro
  if (!api?.scan) {
    throw new Error(`主进程还是旧窗口，选品接口没挂上。请完全退出 ${PRODUCT_NAME} 后重新 pnpm dev（preload 不会热更新）。`)
  }
  return api
}

async function patchIdea(id: string, patch: { status?: IdeaStatus; note?: string }): Promise<void> {
  paint(await microApi().patchIdea(id, patch))
}

async function loadState(): Promise<void> {
  paint(await microApi().state())
}

async function scan(): Promise<void> {
  if (loading) {
    return
  }
  loading = true
  setScanningUi(true)
  try {
    paint(await microApi().scan())
  } catch (error) {
    setScanningUi(false)
    updatedEl.textContent = stampOf(state?.lastRun?.at)
    statusEl.classList.add('is-error')
    statusEl.textContent = `扫描失败：${error instanceof Error ? error.message : String(error)}`
  } finally {
    loading = false
  }
}

export function revealTodayBoard(): void {
  domainFilter = 'all'
  showGroup('today')
  if (state) {
    paint(state)
  }
}

export function revealPipeline(): void {
  domainFilter = 'all'
  showGroup('pipeline')
  if (state) {
    paint(state)
  }
}

export function activateMicroSourcing(): void {
  if (!bound) {
    bound = true
    refreshBtn.addEventListener('click', () => {
      void scan()
    })
    settingsForm.addEventListener('submit', (event) => {
      event.preventDefault()
      void microApi().saveSettings({
        heartbeatHours: Number(heartbeatEl.value),
        notify: notifyEl.checked,
        todoFollowUp: todoEl.checked,
        proxyUrl: proxyEl.value,
        customSources: readCustomSources(),
        domains: {
          creator: domCreator.checked,
          ecommerce: domEcommerce.checked,
          productivity: domProductivity.checked,
          indie: domIndie.checked,
        },
      }).then((next) => {
        paint(next)
      })
    })
    try {
      microApi().onChanged((next) => {
        if (document.body.dataset.view === 'micro') {
          paint(next)
        } else {
          state = next
        }
      })
    } catch {
      /* loadState 会把同样的错误写到状态行 */
    }
  }
  showGroup(isMicroGroupId(currentGroup) ? currentGroup : 'today')
  void loadState().catch((error) => {
    setScanningUi(false)
    statusEl.classList.add('is-error')
    statusEl.textContent = error instanceof Error ? error.message : String(error)
  })
}
