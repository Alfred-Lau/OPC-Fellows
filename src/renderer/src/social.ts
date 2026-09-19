import {
  latestMetricsForDraft,
  packSocialDraft,
  SOCIAL_PLATFORMS,
  socialPlatform,
  type SocialDraft,
  type SocialPlatformId,
  type SocialState,
} from '../../shared/social'

const refreshBtn = required('#social-refresh', HTMLButtonElement)
const updatedEl = required('#social-updated', HTMLSpanElement)
const statusEl = required('#social-status', HTMLParagraphElement)
const copyMeta = required('#social-copy-meta', HTMLSpanElement)
const copyFilters = required('#social-copy-filters', HTMLDivElement)
const copyList = required('#social-copy-list', HTMLDivElement)
const metricsMeta = required('#social-metrics-meta', HTMLSpanElement)
const metricsBar = required('#social-metrics-bar', HTMLDivElement)
const metricsForm = required('#social-metrics-form', HTMLFormElement)
const metricsTarget = required('#social-metrics-target', HTMLSelectElement)
const metricsList = required('#social-metrics-list', HTMLUListElement)
const viewsInput = required('#social-m-views', HTMLInputElement)
const likesInput = required('#social-m-likes', HTMLInputElement)
const commentsInput = required('#social-m-comments', HTMLInputElement)
const sharesInput = required('#social-m-shares', HTMLInputElement)
const savesInput = required('#social-m-saves', HTMLInputElement)

type Filter = 'all' | 'overseas' | 'domestic' | SocialPlatformId

let filter: Filter = 'all'
let state: SocialState | null = null
let bound = false

function required<T extends typeof HTMLElement>(selector: string, ctor: T): InstanceType<T> {
  const node = document.querySelector(selector)
  if (!(node instanceof ctor)) {
    throw new Error(`missing ${selector}`)
  }
  return node as InstanceType<T>
}

export function bindSocial(): void {
  if (bound) {
    return
  }
  bound = true
  refreshBtn.addEventListener('click', () => void generate())
  metricsForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void submitMetrics()
  })
}

export function renderSocial(next: SocialState): void {
  state = next
  renderFilters()
  renderCopy()
  renderMetrics()
  const unpublished = next.drafts.filter((item) => !item.publishedAt).length
  statusEl.textContent = next.generated
    ? `本轮新写 ${next.generated} 条${next.usedModel ? '（模型润色）' : ''} · 待发 ${unpublished} · 共 ${next.drafts.length} 条`
    : `待发 ${unpublished} · 共 ${next.drafts.length} 条。装填会读监控快照里的产品能力，不刷新监控。`
}

async function submitMetrics(): Promise<void> {
  const value = metricsTarget.value
  if (!value) {
    return
  }
  const [kind, id] = value.split(':', 2)
  const input = {
    draftId: kind === 'draft' ? id : null,
    platform: (kind === 'platform' ? id : state?.drafts.find((item) => item.id === id)?.platform ?? 'x') as SocialPlatformId,
    views: Number(viewsInput.value) || 0,
    likes: Number(likesInput.value) || 0,
    comments: Number(commentsInput.value) || 0,
    shares: Number(sharesInput.value) || 0,
    saves: Number(savesInput.value) || 0,
  }
  const next = await window.ownworkbuddy.social.record(input)
  viewsInput.value = '0'
  likesInput.value = '0'
  commentsInput.value = '0'
  sharesInput.value = '0'
  savesInput.value = '0'
  renderSocial(next)
}

function renderFilters(): void {
  copyFilters.replaceChildren()
  const options: Array<{ id: Filter; label: string }> = [
    { id: 'all', label: '全部' },
    { id: 'overseas', label: '海外' },
    { id: 'domestic', label: '国内' },
    ...SOCIAL_PLATFORMS.map((item) => ({ id: item.id, label: item.name })),
  ]
  for (const option of options) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'social-chip'
    button.classList.toggle('is-current', filter === option.id)
    button.textContent = option.label
    button.addEventListener('click', () => {
      filter = option.id
      renderFilters()
      renderCopy()
    })
    copyFilters.append(button)
  }
}

function visibleDrafts(): SocialDraft[] {
  const drafts = state?.drafts ?? []
  if (filter === 'all') {
    return drafts
  }
  if (filter === 'overseas' || filter === 'domestic') {
    return drafts.filter((item) => socialPlatform(item.platform).region === filter)
  }
  return drafts.filter((item) => item.platform === filter)
}

function renderCopy(): void {
  const drafts = visibleDrafts()
  const unpublished = (state?.drafts ?? []).filter((item) => !item.publishedAt).length
  copyMeta.textContent = state
    ? `${unpublished} 条待发${state.generated > 0 ? ` · 本轮新写 ${state.generated}` : ''}${state.usedModel ? ' · 已润色' : ''}`
    : ''
  copyList.replaceChildren()
  if (drafts.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'traffic-empty'
    empty.textContent = '刷新后会按最新产品能力生成六平台文案'
    copyList.append(empty)
    return
  }
  for (const draft of drafts) {
    copyList.append(copyCard(draft))
  }
}

function copyCard(draft: SocialDraft): HTMLElement {
  const platform = socialPlatform(draft.platform)
  const card = document.createElement('article')
  card.className = 'social-card'
  card.classList.toggle('is-published', Boolean(draft.publishedAt))

  const head = document.createElement('div')
  head.className = 'social-card-head'
  const name = document.createElement('strong')
  name.textContent = `${platform.name} · ${draft.productName}`
  const badge = document.createElement('span')
  badge.className = draft.publishedAt ? 'social-badge is-up' : 'social-badge'
  badge.textContent = draft.publishedAt ? '已发布' : platform.region === 'overseas' ? '海外' : '国内'
  head.append(name, badge)

  const format = document.createElement('p')
  format.className = 'social-format'
  format.textContent = `${draft.format} · ${draft.featureTitle}`

  if (draft.title) {
    const title = document.createElement('p')
    title.className = 'social-title'
    title.textContent = draft.title
    card.append(head, format, title)
  } else {
    card.append(head, format)
  }

  const body = document.createElement('pre')
  body.className = 'social-body'
  body.textContent = draft.body
  card.append(body)

  if (draft.publishedUrl) {
    const link = document.createElement('a')
    link.className = 'social-url'
    link.href = draft.publishedUrl
    link.target = '_blank'
    link.rel = 'noreferrer'
    link.textContent = draft.publishedUrl
    card.append(link)
  }

  const actions = document.createElement('div')
  actions.className = 'social-actions'
  const copyBtn = document.createElement('button')
  copyBtn.type = 'button'
  copyBtn.textContent = '复制'
  copyBtn.addEventListener('click', () => {
    void navigator.clipboard.writeText(packSocialDraft(draft)).then(() => {
      copyBtn.textContent = '已复制'
      setTimeout(() => {
        copyBtn.textContent = '复制'
      }, 1200)
    })
  })
  actions.append(copyBtn)

  if (!draft.publishedAt) {
    const url = document.createElement('input')
    url.type = 'url'
    url.placeholder = '发布后贴链接（可选）'
    url.spellcheck = false
    const publishBtn = document.createElement('button')
    publishBtn.type = 'button'
    publishBtn.textContent = '已发布'
    publishBtn.addEventListener('click', () => {
      void window.ownworkbuddy.social.publish(draft.id, url.value).then(renderSocial)
    })
    const discardBtn = document.createElement('button')
    discardBtn.type = 'button'
    discardBtn.textContent = '丢掉'
    discardBtn.addEventListener('click', () => {
      void window.ownworkbuddy.social.discard(draft.id).then(renderSocial)
    })
    actions.append(url, publishBtn, discardBtn)
  }

  card.append(actions)
  return card
}

function renderMetrics(): void {
  if (!state) {
    return
  }
  const totals = state.stats.reduce(
    (acc, row) => ({
      views: acc.views + row.views,
      likes: acc.likes + row.likes,
      comments: acc.comments + row.comments,
    }),
    { views: 0, likes: 0, comments: 0 },
  )
  metricsMeta.textContent = `浏览 ${totals.views} · 赞 ${totals.likes} · 评 ${totals.comments}`

  metricsBar.replaceChildren()
  for (const row of state.stats) {
    const platform = socialPlatform(row.platform)
    const chip = document.createElement('div')
    chip.className = 'social-stat'
    chip.classList.toggle('is-stale', row.stale)
    const title = document.createElement('b')
    title.textContent = platform.name
    const meta = document.createElement('i')
    meta.textContent = row.stale
      ? '待采数'
      : `${row.views} ${platform.metricLabels.views} · ${row.likes} ${platform.metricLabels.likes}`
    chip.append(title, meta)
    metricsBar.append(chip)
  }

  const keep = metricsTarget.value
  metricsTarget.replaceChildren()
  for (const platform of SOCIAL_PLATFORMS) {
    const option = document.createElement('option')
    option.value = `platform:${platform.id}`
    option.textContent = `${platform.name} · 平台汇总`
    metricsTarget.append(option)
  }
  for (const draft of state.drafts.filter((item) => item.publishedAt)) {
    const option = document.createElement('option')
    option.value = `draft:${draft.id}`
    option.textContent = `${socialPlatform(draft.platform).name} · ${draft.productName}`
    metricsTarget.append(option)
  }
  if ([...metricsTarget.options].some((option) => option.value === keep)) {
    metricsTarget.value = keep
  }

  metricsList.replaceChildren()
  const published = state.drafts.filter((item) => item.publishedAt)
  if (published.length === 0) {
    const empty = document.createElement('li')
    empty.className = 'empty'
    empty.textContent = '发布后把创作者中心的浏览 / 赞 / 评 / 转 / 收藏记在这里。国内平台没有开放接口，靠手录。'
    metricsList.append(empty)
    return
  }
  for (const draft of published) {
    const latest = latestMetricsForDraft(state.metrics, draft.id)
    const platform = socialPlatform(draft.platform)
    const item = document.createElement('li')
    item.className = 'mon-row'
    const title = document.createElement('span')
    title.className = 'mon-title'
    title.textContent = `${platform.name} · ${draft.productName}`
    const extra = document.createElement('span')
    extra.className = 'mon-extra'
    extra.textContent = latest
      ? `${latest.views} ${platform.metricLabels.views} · ${latest.likes} ${platform.metricLabels.likes} · ${latest.comments} ${platform.metricLabels.comments} · ${latest.shares} ${platform.metricLabels.shares} · ${latest.saves} ${platform.metricLabels.saves}`
      : '还没有采集数据'
    const meta = document.createElement('span')
    meta.className = 'mon-meta'
    meta.textContent = latest ? `记于 ${timeAgo(latest.recordedAt)}` : '待采集'
    item.append(title, extra, meta)
    metricsList.append(item)
  }
}

async function generate(): Promise<void> {
  refreshBtn.disabled = true
  statusEl.textContent = '正在按产品能力装填弹药…'
  try {
    const next = await window.ownworkbuddy.social.generate()
    statusEl.classList.remove('is-error')
    renderSocial(next)
    updatedEl.textContent = stampText(new Date().toISOString(), '装填于')
  } catch (error) {
    statusEl.textContent = `装填失败：${error instanceof Error ? error.message : String(error)}`
    statusEl.classList.add('is-error')
  } finally {
    refreshBtn.disabled = false
  }
}

async function showState(): Promise<void> {
  try {
    renderSocial(await window.ownworkbuddy.social.state())
  } catch {
    statusEl.textContent = '还没有弹药。点装填，或先让项目监控官刷新一次再来。'
  }
}

function stampText(iso: string, prefix: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) {
    return ''
  }
  const date = at.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
  const time = at.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return `${prefix} ${date} ${time}`
}

export function activateSocial(): void {
  bindSocial()
  statusEl.classList.remove('is-error')
  if (state) {
    return
  }
  void showState()
}

function timeAgo(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000)
  if (minutes < 1) {
    return '刚刚'
  }
  if (minutes < 60) {
    return `${minutes} 分钟前`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours} 小时前`
  }
  return `${Math.floor(hours / 24)} 天前`
}
