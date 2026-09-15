import {
  WECHAT_TRIAGE_DECISIONS,
  WECHAT_TRIAGE_LABELS,
  lookupHint,
  type WechatAction,
  type WechatHubAccess,
  type WechatHubState,
  type WechatLookupKind,
  type WechatTriageDecision,
} from '../../shared/wechat-hub'

type HubGroupId = 'today' | 'inbox' | 'lookup' | 'settings'

const GROUPS: { id: HubGroupId; label: string }[] = [
  { id: 'today', label: '今日行动' },
  { id: 'inbox', label: '待分流' },
  { id: 'lookup', label: '查找' },
  { id: 'settings', label: '本机接入' },
]

const ACCESS_LABEL: Record<WechatHubAccess, string> = {
  missing: '未安装',
  engine: '缺索引',
  index: '仅索引',
  ready: '本机就绪',
}

const view = required('#view-wxhub', HTMLElement)
const navEl = required('#wxhub-nav', HTMLElement)
const statusEl = required('#wxhub-status', HTMLParagraphElement)
const updatedEl = required('#wxhub-updated', HTMLSpanElement)
const refreshBtn = required('#wxhub-refresh', HTMLButtonElement)
const todayList = required('#wxhub-today-list', HTMLDivElement)
const inboxList = required('#wxhub-inbox-list', HTMLDivElement)
const todayMeta = required('#wxhub-today-meta', HTMLSpanElement)
const inboxMeta = required('#wxhub-inbox-meta', HTMLSpanElement)
const lookupKind = required('#wxhub-lookup-kind', HTMLSelectElement)
const lookupQuery = required('#wxhub-lookup-query', HTMLInputElement)
const lookupHintEl = required('#wxhub-lookup-hint', HTMLParagraphElement)
const lookupOut = required('#wxhub-lookup-out', HTMLPreElement)
const lookupCopy = required('#wxhub-lookup-copy', HTMLButtonElement)
const homeInput = required('#wxhub-home', HTMLInputElement)
const heartbeatEl = required('#wxhub-heartbeat', HTMLSelectElement)
const notifyEl = required('#wxhub-notify', HTMLInputElement)
const todoEl = required('#wxhub-todo', HTMLInputElement)
const coverageEl = required('#wxhub-coverage', HTMLParagraphElement)

let bound = false
let loading = false
let currentGroup: HubGroupId = 'today'
let state: WechatHubState | null = null

function required<T extends typeof HTMLElement>(selector: string, ctor: T): InstanceType<T> {
  const node = document.querySelector(selector)
  if (!(node instanceof ctor)) {
    throw new Error(`missing ${selector}`)
  }
  return node as InstanceType<T>
}

function api() {
  return window.ownworkbuddy.wxhub
}

function showGroup(id: HubGroupId): void {
  currentGroup = id
  for (const group of document.querySelectorAll('#view-wxhub .wxhub-group')) {
    if (!(group instanceof HTMLElement)) {
      continue
    }
    group.hidden = group.dataset.group !== id
  }
  renderNav()
}

function renderNav(): void {
  navEl.replaceChildren()
  for (const group of GROUPS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'monitor-nav-item'
    button.classList.toggle('is-current', group.id === currentGroup)
    const label = document.createElement('span')
    label.className = 'monitor-nav-label'
    label.textContent = group.label
    button.append(label)
    const badge = badgeFor(group.id)
    if (badge) {
      const mark = document.createElement('span')
      mark.className = 'tick-count'
      mark.textContent = badge
      button.append(mark)
    }
    button.addEventListener('click', () => {
      showGroup(group.id)
    })
    navEl.append(button)
  }
}

function badgeFor(id: HubGroupId): string {
  if (!state) {
    return ''
  }
  switch (id) {
    case 'today':
      return String(state.today.length)
    case 'inbox':
      return String(state.inbox.length)
    case 'lookup':
      return state.lookup ? '1' : ''
    case 'settings':
      return ACCESS_LABEL[state.coverage.access]
    default: {
      const _never: never = id
      return _never
    }
  }
}

function paint(next: WechatHubState): void {
  state = next
  loading = next.scanning
  setBusy(next.scanning)
  updatedEl.textContent = next.lastRunAt ? stampOf(next.lastRunAt) : ''
  statusEl.classList.toggle('is-error', Boolean(next.lastError))
  statusEl.classList.toggle('is-scanning', next.scanning)
  statusEl.textContent = next.scanning
    ? '正在本机读取情报库…'
    : next.lastError || next.coverage.summary
  homeInput.value = next.settings.hubHome
  heartbeatEl.value = String(next.settings.heartbeatHours)
  notifyEl.checked = next.settings.notify
  todoEl.checked = next.settings.todoFollowUp
  coverageEl.textContent = [
    ACCESS_LABEL[next.coverage.access],
    next.coverage.hubHome ? `引擎 ${shortPath(next.coverage.hubHome)}` : '未找到引擎',
    next.coverage.readerBin ? `Reader ${shortPath(next.coverage.readerBin)}` : '无 Reader',
    next.coverage.radarDb ? `索引 ${next.coverage.radarDbPath}` : '无 radar.db',
    next.ingested ? `上次写入 ${next.ingested} 条待办` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  todayMeta.textContent = `${next.today.length} 项`
  inboxMeta.textContent = `${next.inbox.length} 项`
  renderActions(todayList, next.today, 'today')
  renderActions(inboxList, next.inbox, 'inbox')
  lookupHintEl.textContent = lookupHint(isLookupKindValue(lookupKind.value) ? lookupKind.value : 'search')
  lookupOut.textContent = next.lookup
    ? `${next.lookup.kind} · ${next.lookup.query}\n\n${next.lookup.text}`
    : '查找结果只留在本机。回复草稿可以复制，不会替你发出去。'
  lookupCopy.hidden = !next.lookup?.text
  renderNav()
}

function renderActions(root: HTMLElement, rows: WechatAction[], kind: 'today' | 'inbox'): void {
  root.replaceChildren()
  if (rows.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'hint'
    empty.textContent = kind === 'today' ? '这一窗没有到期行动。先刷新，或先完成本机接入。' : '没有待分流候选。'
    root.append(empty)
    return
  }
  for (const row of rows) {
    root.append(actionCard(row, kind === 'inbox'))
  }
}

function actionCard(row: WechatAction, triage: boolean): HTMLElement {
  const card = document.createElement('article')
  card.className = 'wxhub-card'
  const top = document.createElement('div')
  top.className = 'wxhub-card-top'
  const title = document.createElement('strong')
  title.textContent = `#${row.id} ${row.title}`
  const meta = document.createElement('span')
  meta.className = 'tick-count'
  meta.textContent = `P${row.priority}`
  top.append(title, meta)
  const tags = document.createElement('p')
  tags.className = 'wxhub-meta'
  tags.textContent = [row.status, row.recordType, row.stage, row.opportunityType, row.amount, row.followUp && `跟进 ${row.followUp}`]
    .filter(Boolean)
    .join(' · ')
  const next = document.createElement('p')
  next.textContent = row.nextAction ? `下一步：${row.nextAction}` : '下一步待确认'
  card.append(top, tags, next)
  if (row.notes) {
    const notes = document.createElement('p')
    notes.className = 'hint'
    notes.textContent = row.notes
    card.append(notes)
  }
  if (triage) {
    const actions = document.createElement('div')
    actions.className = 'wxhub-actions'
    for (const decision of WECHAT_TRIAGE_DECISIONS) {
      actions.append(triageButton(row.id, decision))
    }
    card.append(actions)
  }
  return card
}

function triageButton(id: number, decision: WechatTriageDecision): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'ghost wx-mini'
  button.textContent = WECHAT_TRIAGE_LABELS[decision]
  button.addEventListener('click', () => {
    void runTriage(id, decision)
  })
  return button
}

async function runTriage(id: number, decision: WechatTriageDecision): Promise<void> {
  let followUp: string | undefined
  if (decision === 'wait') {
    const value = window.prompt('等待到哪一天跟进？格式 YYYY-MM-DD', tomorrowDate())
    if (!value) {
      return
    }
    followUp = value.trim()
  }
  paint(await api().triage(id, decision, followUp))
}

function setBusy(active: boolean): void {
  refreshBtn.disabled = active
  refreshBtn.setAttribute('aria-busy', active ? 'true' : 'false')
}

function stampOf(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function shortPath(path: string): string {
  return path.replace(/\/Users\/[^/]+/, '~').replace(/\/home\/[^/]+/, '~')
}

function tomorrowDate(): string {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function isLookupKindValue(value: string): value is WechatLookupKind {
  return value === 'search' || value === 'person' || value === 'reply'
}

async function refresh(): Promise<void> {
  if (loading) {
    return
  }
  loading = true
  setBusy(true)
  try {
    paint(await api().refresh())
  } catch (error) {
    setBusy(false)
    statusEl.classList.add('is-error')
    statusEl.textContent = `刷新失败：${error instanceof Error ? error.message : String(error)}`
  } finally {
    loading = false
  }
}

export function revealWxhubGroup(id: HubGroupId): void {
  showGroup(id)
}

export function activateWechatHub(): void {
  if (!bound) {
    bound = true
    refreshBtn.addEventListener('click', () => {
      void refresh()
    })
    required('#wxhub-lookup-form', HTMLFormElement).addEventListener('submit', (event) => {
      event.preventDefault()
      const kind = lookupKind.value
      if (!isLookupKindValue(kind)) {
        return
      }
      void api()
        .lookup(kind, lookupQuery.value)
        .then((next) => {
          paint(next)
          showGroup('lookup')
        })
    })
    lookupKind.addEventListener('change', () => {
      lookupHintEl.textContent = lookupHint(isLookupKindValue(lookupKind.value) ? lookupKind.value : 'search')
    })
    lookupCopy.addEventListener('click', () => {
      const text = state?.lookup?.text
      if (text) {
        void api().copy(text)
      }
    })
    required('#wxhub-settings-form', HTMLFormElement).addEventListener('submit', (event) => {
      event.preventDefault()
      void api()
        .saveSettings({
          hubHome: homeInput.value,
          heartbeatHours: Number(heartbeatEl.value),
          notify: notifyEl.checked,
          todoFollowUp: todoEl.checked,
        })
        .then(paint)
    })
    required('#wxhub-pick-home', HTMLButtonElement).addEventListener('click', () => {
      void api().pickHome().then(paint)
    })
    required('#wxhub-install', HTMLAnchorElement).addEventListener('click', (event) => {
      event.preventDefault()
      void api().openInstall()
    })
    try {
      api().onChanged((next) => {
        if (document.body.dataset.view === 'wxhub' || view.dataset.active === 'true') {
          paint(next)
        } else {
          state = next
        }
      })
    } catch {
      /* loadState 会把错误写到状态行 */
    }
  }
  showGroup(currentGroup)
  void api()
    .probe()
    .then(paint)
    .catch((error) => {
      statusEl.classList.add('is-error')
      statusEl.textContent = error instanceof Error ? error.message : String(error)
    })
}
