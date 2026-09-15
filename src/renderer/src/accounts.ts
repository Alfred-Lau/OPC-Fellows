import { dayKey } from '../../shared/datetime'
import { getProducts } from '../../shared/products'
import {
  ACCOUNT_PLATFORMS,
  POST_FORMATS,
  accountDigest,
  accountPlatform,
  accountsByPlatform,
  dateStrip,
  emptyMetrics,
  findDayLog,
  isAccountPlatformId,
  logHasActivity,
  shiftDay,
  type AccountDayLog,
  type AccountMaterial,
  type AccountPlatformId,
  type AccountsState,
  type DayMetrics,
  type SocialAccount,
} from '../../shared/accounts'

const ACCOUNT_KEY = 'ownworkbuddy.accountId'
const DATE_KEY = 'ownworkbuddy.accountDate'
const FILTER_KEY = 'ownworkbuddy.accountFilter'

const countEl = required('#accounts-count', HTMLSpanElement)
const newBtn = required('#accounts-new', HTMLButtonElement)
const filtersEl = required('#accounts-platform-filters', HTMLDivElement)
const listEl = required('#accounts-list', HTMLUListElement)
const createForm = required('#accounts-create', HTMLFormElement)
const createPlatform = required('#account-platform', HTMLSelectElement)
const createName = required('#account-name', HTMLInputElement)
const createHandle = required('#account-handle', HTMLInputElement)
const createNote = required('#account-note', HTMLInputElement)
const createId = required('#account-edit-id', HTMLInputElement)
const createCancel = required('#account-create-cancel', HTMLButtonElement)
const createSubmit = required('#account-create-submit', HTMLButtonElement)
const materialForm = required('#material-create', HTMLFormElement)
const materialTitle = required('#material-title', HTMLInputElement)
const materialProduct = required('#material-product', HTMLSelectElement)
const materialsEl = required('#materials-list', HTMLUListElement)
const emptyEl = required('#accounts-empty', HTMLDivElement)
const dayEl = required('#accounts-day', HTMLDivElement)
const headEl = required('#account-head', HTMLDivElement)
const dayPrev = required('#day-prev', HTMLButtonElement)
const dayNext = required('#day-next', HTMLButtonElement)
const dayToday = required('#day-today', HTMLButtonElement)
const dayDate = required('#day-date', HTMLInputElement)
const stripEl = required('#day-strip', HTMLDivElement)
const postForm = required('#post-form', HTMLFormElement)
const postTitle = required('#post-title', HTMLInputElement)
const postBody = required('#post-body', HTMLTextAreaElement)
const postUrl = required('#post-url', HTMLInputElement)
const postFormat = required('#post-format', HTMLSelectElement)
const postsEl = required('#posts-list', HTMLUListElement)
const metricsForm = required('#metrics-form', HTMLFormElement)
const metricsLabels = required('#metrics-labels', HTMLDivElement)
const dayMaterialsEl = required('#day-materials', HTMLDivElement)

type Filter = 'all' | AccountPlatformId

let state: AccountsState = { accounts: [], materials: [], logs: [] }
let filter: Filter = readFilter()
let selectedId = localStorage.getItem(ACCOUNT_KEY) ?? ''
let selectedDate = localStorage.getItem(DATE_KEY) || dayKey(new Date())
let bound = false
let editingId: string | null = null

function required<T extends typeof HTMLElement>(selector: string, ctor: T): InstanceType<T> {
  const node = document.querySelector(selector)
  if (!(node instanceof ctor)) {
    throw new Error(`missing ${selector}`)
  }
  return node as InstanceType<T>
}

function readFilter(): Filter {
  const raw = localStorage.getItem(FILTER_KEY)
  if (raw === 'all' || ACCOUNT_PLATFORMS.some((item) => item.id === raw)) {
    return raw as Filter
  }
  return 'all'
}

function selectedAccount(): SocialAccount | null {
  return state.accounts.find((item) => item.id === selectedId) ?? null
}

function selectedLog(): AccountDayLog | null {
  if (!selectedId) {
    return null
  }
  return findDayLog(state.logs, selectedId, selectedDate)
}

function remember(): void {
  if (selectedId) {
    localStorage.setItem(ACCOUNT_KEY, selectedId)
  } else {
    localStorage.removeItem(ACCOUNT_KEY)
  }
  localStorage.setItem(DATE_KEY, selectedDate)
  localStorage.setItem(FILTER_KEY, filter)
}

function applyState(next: AccountsState): void {
  state = next
  if (!selectedId || !state.accounts.some((item) => item.id === selectedId)) {
    selectedId = state.accounts[0]?.id ?? ''
  }
  remember()
  render()
}

export function activateAccounts(): void {
  bindAccounts()
  void refreshAccounts()
}

export function highlightAccount(id: string): void {
  selectedId = id
  remember()
  void refreshAccounts()
}

export async function refreshAccounts(): Promise<void> {
  applyState(await window.ownworkbuddy.accounts.state())
}

function bindAccounts(): void {
  if (bound) {
    return
  }
  bound = true
  fillSelects()
  newBtn.addEventListener('click', () => {
    openCreateForm()
  })
  createCancel.addEventListener('click', () => {
    closeCreateForm()
  })
  createForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void submitAccount()
  })
  materialForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void submitMaterial()
  })
  postForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void submitPost()
  })
  metricsForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void submitMetrics()
  })
  dayPrev.addEventListener('click', () => {
    selectedDate = shiftDay(selectedDate, -1)
    remember()
    renderDay()
  })
  dayNext.addEventListener('click', () => {
    selectedDate = shiftDay(selectedDate, 1)
    remember()
    renderDay()
  })
  dayToday.addEventListener('click', () => {
    selectedDate = dayKey(new Date())
    remember()
    renderDay()
  })
  dayDate.addEventListener('change', () => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dayDate.value)) {
      selectedDate = dayDate.value
      remember()
      renderDay()
    }
  })
}

function fillSelects(): void {
  createPlatform.replaceChildren()
  for (const platform of ACCOUNT_PLATFORMS) {
    const option = document.createElement('option')
    option.value = platform.id
    option.textContent = platform.name
    createPlatform.append(option)
  }
  postFormat.replaceChildren()
  for (const format of POST_FORMATS) {
    const option = document.createElement('option')
    option.value = format
    option.textContent = format
    postFormat.append(option)
  }
  materialProduct.replaceChildren()
  const blank = document.createElement('option')
  blank.value = ''
  blank.textContent = '不关联产品'
  materialProduct.append(blank)
  for (const product of getProducts()) {
    const option = document.createElement('option')
    option.value = product.id
    option.textContent = product.name
    materialProduct.append(option)
  }
}

function openCreateForm(account?: SocialAccount): void {
  editingId = account?.id ?? null
  createId.value = account?.id ?? ''
  createPlatform.value = account?.platform ?? 'xiaohongshu'
  createName.value = account?.name ?? ''
  createHandle.value = account?.handle ?? ''
  createNote.value = account?.note ?? ''
  createSubmit.textContent = account ? '保存账号' : '添加账号'
  createForm.hidden = false
  createName.focus()
}

function closeCreateForm(): void {
  editingId = null
  createForm.reset()
  createId.value = ''
  createSubmit.textContent = '添加账号'
  createForm.hidden = true
}

async function submitAccount(): Promise<void> {
  const name = createName.value.trim()
  if (!name) {
    return
  }
  const platform = createPlatform.value
  if (!isAccountPlatformId(platform)) {
    return
  }
  const next = await window.ownworkbuddy.accounts.saveAccount({
    id: editingId ?? undefined,
    platform,
    name,
    handle: createHandle.value,
    note: createNote.value,
  })
  selectedId = editingId ?? next.accounts.find((item) => item.name === name && item.platform === platform)?.id ?? selectedId
  closeCreateForm()
  applyState(next)
}

async function submitMaterial(): Promise<void> {
  const title = materialTitle.value.trim()
  if (!title) {
    return
  }
  const next = await window.ownworkbuddy.accounts.saveMaterial({
    title,
    productId: materialProduct.value,
  })
  materialTitle.value = ''
  materialProduct.value = ''
  applyState(next)
}

async function submitPost(): Promise<void> {
  if (!selectedId) {
    return
  }
  const title = postTitle.value.trim()
  if (!title) {
    return
  }
  const next = await window.ownworkbuddy.accounts.addPost(selectedId, selectedDate, {
    title,
    body: postBody.value,
    url: postUrl.value,
    format: postFormat.value,
  })
  postTitle.value = ''
  postBody.value = ''
  postUrl.value = ''
  applyState(next)
}

async function submitMetrics(): Promise<void> {
  if (!selectedId) {
    return
  }
  const next = await window.ownworkbuddy.accounts.saveMetrics(selectedId, selectedDate, readMetricsForm())
  applyState(next)
}

function readMetricsForm(): DayMetrics {
  const metrics = emptyMetrics()
  for (const key of Object.keys(metrics) as Array<keyof DayMetrics>) {
    const input = metricsForm.querySelector<HTMLInputElement>(`[name="${key}"]`)
    metrics[key] = Number(input?.value) || 0
  }
  return metrics
}

function render(): void {
  countEl.textContent = String(state.accounts.length)
  renderFilters()
  renderAccountList()
  renderMaterialsPool()
  renderDay()
}

function renderFilters(): void {
  filtersEl.replaceChildren()
  const options: Array<{ id: Filter; label: string }> = [
    { id: 'all', label: '全部' },
    ...ACCOUNT_PLATFORMS.map((item) => ({ id: item.id, label: item.name })),
  ]
  for (const option of options) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'social-chip'
    button.classList.toggle('is-current', filter === option.id)
    button.textContent = option.label
    button.addEventListener('click', () => {
      filter = option.id
      remember()
      renderFilters()
      renderAccountList()
    })
    filtersEl.append(button)
  }
}

function renderAccountList(): void {
  const accounts = accountsByPlatform(state.accounts, filter)
  listEl.replaceChildren()
  if (accounts.length === 0) {
    const empty = document.createElement('li')
    empty.className = 'empty'
    empty.textContent = filter === 'all' ? '还没有账号' : '这个平台还没有账号'
    listEl.append(empty)
    return
  }
  const today = dayKey(new Date())
  for (const account of accounts) {
    const platform = accountPlatform(account.platform)
    const digest = accountDigest(account.id, state.logs, today)
    const item = document.createElement('li')
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'account-item'
    button.classList.toggle('is-current', account.id === selectedId)
    const name = document.createElement('strong')
    name.textContent = account.name
    const meta = document.createElement('span')
    meta.textContent = digest.todayPosts > 0 ? `${platform.name} · 今日 ${digest.todayPosts} 条` : platform.name
    button.append(name, meta)
    button.addEventListener('click', () => {
      selectedId = account.id
      remember()
      render()
    })
    item.append(button)
    listEl.append(item)
  }
}

function renderMaterialsPool(): void {
  materialsEl.replaceChildren()
  if (state.materials.length === 0) {
    const empty = document.createElement('li')
    empty.className = 'empty'
    empty.textContent = '还没有选材'
    materialsEl.append(empty)
    return
  }
  for (const material of state.materials) {
    materialsEl.append(materialRow(material))
  }
}

function materialRow(material: AccountMaterial): HTMLLIElement {
  const item = document.createElement('li')
  item.className = 'material-row'
  const title = document.createElement('span')
  title.textContent = material.title
  const product = getProducts().find((item) => item.id === material.productId)
  if (product) {
    const badge = document.createElement('i')
    badge.textContent = product.name
    item.append(title, badge)
  } else {
    item.append(title)
  }
  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'ghost'
  remove.textContent = '删'
  remove.addEventListener('click', () => {
    void window.ownworkbuddy.accounts.removeMaterial(material.id).then(applyState)
  })
  item.append(remove)
  return item
}

function renderDay(): void {
  const account = selectedAccount()
  const hasAccounts = state.accounts.length > 0
  emptyEl.hidden = hasAccounts && Boolean(account)
  dayEl.hidden = !account
  if (!account) {
    emptyEl.replaceChildren()
    const text = document.createElement('p')
    text.className = 'traffic-empty'
    text.textContent = hasAccounts ? '左侧选一个账号，开始记当日内容和数据' : '先加一个视频号、抖音或小红书账号'
    const action = document.createElement('button')
    action.type = 'button'
    action.textContent = '新账号'
    action.addEventListener('click', () => {
      openCreateForm()
    })
    emptyEl.append(text, action)
    return
  }
  renderHead(account)
  dayDate.value = selectedDate
  renderStrip(account)
  renderPosts(account)
  renderMetrics(account)
  renderDayMaterials(account)
}

function renderHead(account: SocialAccount): void {
  const platform = accountPlatform(account.platform)
  headEl.replaceChildren()
  const title = document.createElement('div')
  title.className = 'account-head-title'
  const name = document.createElement('h2')
  name.textContent = account.name
  const badge = document.createElement('span')
  badge.className = 'social-badge'
  badge.textContent = platform.name
  title.append(name, badge)
  const meta = document.createElement('p')
  meta.className = 'account-head-meta'
  meta.textContent = [account.handle, account.note, platform.formatHint].filter(Boolean).join(' · ')
  const actions = document.createElement('div')
  actions.className = 'account-head-actions'
  const edit = document.createElement('button')
  edit.type = 'button'
  edit.textContent = '改资料'
  edit.addEventListener('click', () => {
    openCreateForm(account)
  })
  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'ghost'
  remove.textContent = '删除账号'
  remove.addEventListener('click', () => {
    if (!window.confirm(`删除「${account.name}」？当日内容和数据也会一起清掉。`)) {
      return
    }
    void window.ownworkbuddy.accounts.removeAccount(account.id).then((next) => {
      selectedId = next.accounts[0]?.id ?? ''
      applyState(next)
    })
  })
  actions.append(edit, remove)
  headEl.append(title, meta, actions)
}

function renderStrip(account: SocialAccount): void {
  stripEl.replaceChildren()
  const today = dayKey(new Date())
  for (const date of dateStrip(selectedDate, 14)) {
    const log = findDayLog(state.logs, account.id, date)
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'day-chip'
    button.classList.toggle('is-current', date === selectedDate)
    button.classList.toggle('is-today', date === today)
    button.classList.toggle('has-activity', logHasActivity(log))
    const day = document.createElement('b')
    day.textContent = String(Number(date.slice(-2)))
    const mark = document.createElement('i')
    mark.textContent = logHasActivity(log) ? '·' : ''
    button.append(day, mark)
    button.title = date
    button.addEventListener('click', () => {
      selectedDate = date
      remember()
      renderDay()
    })
    stripEl.append(button)
  }
}

function renderPosts(account: SocialAccount): void {
  const log = selectedLog()
  postsEl.replaceChildren()
  const posts = log?.posts ?? []
  if (posts.length === 0) {
    const empty = document.createElement('li')
    empty.className = 'empty'
    empty.textContent = '今天还没记发出去的内容'
    postsEl.append(empty)
    return
  }
  for (const post of posts) {
    const item = document.createElement('li')
    item.className = 'post-card'
    const head = document.createElement('div')
    head.className = 'post-card-head'
    const title = document.createElement('strong')
    title.textContent = post.title
    const format = document.createElement('span')
    format.textContent = post.format
    head.append(title, format)
    item.append(head)
    if (post.body) {
      const body = document.createElement('p')
      body.textContent = post.body
      item.append(body)
    }
    if (post.url) {
      const link = document.createElement('a')
      link.href = post.url
      link.target = '_blank'
      link.rel = 'noreferrer'
      link.textContent = post.url
      item.append(link)
    }
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'ghost'
    remove.textContent = '去掉'
    remove.addEventListener('click', () => {
      void window.ownworkbuddy.accounts.removePost(account.id, selectedDate, post.id).then(applyState)
    })
    item.append(remove)
    postsEl.append(item)
  }
}

function renderMetrics(account: SocialAccount): void {
  const platform = accountPlatform(account.platform)
  const metrics = selectedLog()?.metrics ?? emptyMetrics()
  metricsLabels.replaceChildren()
  const fields: Array<{ key: keyof DayMetrics; label: string }> = [
    { key: 'views', label: platform.metricLabels.views },
    { key: 'likes', label: platform.metricLabels.likes },
    { key: 'comments', label: platform.metricLabels.comments },
    { key: 'shares', label: platform.metricLabels.shares },
    { key: 'saves', label: platform.metricLabels.saves },
    { key: 'followers', label: platform.metricLabels.followers },
  ]
  for (const field of fields) {
    const label = document.createElement('label')
    label.textContent = field.label
    const input = document.createElement('input')
    input.type = 'number'
    input.min = '0'
    input.step = '1'
    input.name = field.key
    input.value = String(metrics[field.key])
    label.append(input)
    metricsLabels.append(label)
  }
}

function renderDayMaterials(account: SocialAccount): void {
  dayMaterialsEl.replaceChildren()
  if (state.materials.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'traffic-empty'
    empty.textContent = '左侧选材库先加一条，再点这里挂到当天'
    dayMaterialsEl.append(empty)
    return
  }
  const linked = new Set(selectedLog()?.materialIds ?? [])
  for (const material of state.materials) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'social-chip'
    button.classList.toggle('is-current', linked.has(material.id))
    const product = getProducts().find((item) => item.id === material.productId)
    button.textContent = product ? `${material.title} · ${product.name}` : material.title
    button.addEventListener('click', () => {
      const next = new Set(linked)
      if (next.has(material.id)) {
        next.delete(material.id)
      } else {
        next.add(material.id)
      }
      void window.ownworkbuddy.accounts.setMaterials(account.id, selectedDate, [...next]).then(applyState)
    })
    dayMaterialsEl.append(button)
  }
}
