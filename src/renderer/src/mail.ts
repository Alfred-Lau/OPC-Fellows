import {
  MAIL_PROVIDERS,
  MAIL_TRIAGE_LABELS,
  groupMailByWeek,
  isWatchedSender,
  openMailMessages,
  pinWatchedMail,
  type MailAccountInput,
  type MailMessage,
  type MailProvider,
  type MailState,
  type MailTriage,
} from '../../shared/mail'

type MailGroupId = 'inbox' | 'lookup' | 'settings'

const GROUPS: { id: MailGroupId; label: string }[] = [
  { id: 'inbox', label: '收件箱' },
  { id: 'lookup', label: '查找' },
  { id: 'settings', label: '接入' },
]

const view = required('#view-mail', HTMLElement)
const navEl = required('#mail-nav', HTMLElement)
const statusEl = required('#mail-status', HTMLParagraphElement)
const updatedEl = required('#mail-updated', HTMLSpanElement)
const refreshBtn = required('#mail-refresh', HTMLButtonElement)
const inboxList = required('#mail-inbox-list', HTMLDivElement)
const inboxMeta = required('#mail-inbox-meta', HTMLSpanElement)
const weekBtn = required('#mail-group-week', HTMLButtonElement)
const watchedList = required('#mail-watched', HTMLDivElement)
const lookupQuery = required('#mail-lookup-query', HTMLInputElement)
const lookupOut = required('#mail-lookup-out', HTMLDivElement)
const providerEl = required('#mail-provider', HTMLSelectElement)
const emailEl = required('#mail-email', HTMLInputElement)
const passwordEl = required('#mail-password', HTMLInputElement)
const accountList = required('#mail-accounts', HTMLDivElement)
const coverageEl = required('#mail-coverage', HTMLParagraphElement)
const localBtn = required('#mail-enable-local', HTMLButtonElement)

let bound = false
let loading = false
let currentGroup: MailGroupId = 'inbox'
let groupByWeek = true
let state: MailState | null = null

function required<T extends typeof HTMLElement>(selector: string, ctor: T): InstanceType<T> {
  const node = document.querySelector(selector)
  if (!(node instanceof ctor)) {
    throw new Error(`missing ${selector}`)
  }
  return node as InstanceType<T>
}

function api() {
  return window.ownworkbuddy.mail
}

function showGroup(id: MailGroupId): void {
  currentGroup = id
  for (const group of document.querySelectorAll('#view-mail .mail-group')) {
    if (!(group instanceof HTMLElement)) {
      continue
    }
    group.hidden = group.dataset.group !== id
  }
  renderNav()
}

export function revealMailGroup(group: MailGroupId): void {
  activateMail()
  showGroup(group)
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

function badgeFor(id: MailGroupId): string {
  if (!state) {
    return ''
  }
  switch (id) {
    case 'inbox':
      return String(openMailMessages(state.messages).length)
    case 'lookup':
      return ''
    case 'settings':
      return String(state.accounts.length)
    default: {
      const _never: never = id
      return _never
    }
  }
}

function paint(next: MailState): void {
  state = next
  updatedEl.textContent = next.lastSyncAt ? next.lastSyncAt.slice(11, 16) : ''
  statusEl.classList.remove('is-error')
  statusEl.textContent = next.lastError
    ? next.lastError
    : '本机邮件.app、iCloud、Gmail、QQ 都可以接入。只整理、写草稿，不代发。'
  statusEl.classList.toggle('is-error', Boolean(next.lastError))
  renderNav()
  renderInbox()
  renderAccounts()
  renderWatched()
  coverageEl.textContent = next.local.available
    ? `本机邮件.app：${next.local.accounts.join('、') || '可读'}`
    : next.local.error || '本机邮件.app 还没接通'
}

function renderInbox(): void {
  inboxList.replaceChildren()
  weekBtn.classList.toggle('is-on', groupByWeek)
  weekBtn.setAttribute('aria-pressed', groupByWeek ? 'true' : 'false')
  const rows = state ? openMailMessages(state.messages) : []
  const pinned = pinWatchedMail(rows, state?.watchedSenders ?? [])
  inboxMeta.textContent = pinned.watched.length
    ? `${String(rows.length)} 封 · 关注 ${String(pinned.watched.length)}`
    : `${String(rows.length)} 封`
  if (rows.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'hint'
    empty.textContent = '没有待整理的信。先到接入里加账号，再点刷新。'
    inboxList.append(empty)
    return
  }
  if (pinned.watched.length > 0) {
    inboxList.append(weekSection('关注的人', `${String(pinned.watched.length)} 封`, pinned.watched, true))
  }
  if (groupByWeek) {
    for (const week of groupMailByWeek(pinned.rest)) {
      inboxList.append(weekSection(week.label, `${String(week.messages.length)} 封`, week.messages, false))
    }
    return
  }
  for (const row of pinned.rest) {
    inboxList.append(messageCard(row))
  }
}

function weekSection(title: string, meta: string, rows: readonly MailMessage[], watched: boolean): HTMLElement {
  const wrap = document.createElement('section')
  wrap.className = watched ? 'mail-week is-watched' : 'mail-week'
  const head = document.createElement('h2')
  head.className = 'mail-week-title'
  head.textContent = `${title} · ${meta}`
  wrap.append(head)
  for (const row of rows) {
    wrap.append(messageCard(row))
  }
  return wrap
}

function messageCard(row: MailMessage): HTMLElement {
  const watched = Boolean(state && isWatchedSender(row.from, state.watchedSenders))
  const card = document.createElement('article')
  card.className = watched ? 'mail-card is-watched' : 'mail-card'
  const title = document.createElement('h3')
  title.textContent = row.unread ? `未读 · ${row.subject}` : row.subject
  const meta = document.createElement('p')
  meta.className = 'hint'
  meta.textContent = `${row.from || '未知发件人'} · ${MAIL_TRIAGE_LABELS[row.triage]}`
  const actions = document.createElement('div')
  actions.className = 'mail-actions'
  for (const decision of ['follow', 'archive', 'ignore'] as const) {
    actions.append(triageButton(row.id, decision))
  }
  actions.append(watchButton(row.from, watched))
  card.append(title, meta, actions)
  return card
}

function watchButton(from: string, watched: boolean): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'ghost'
  button.textContent = watched ? '取消关注' : '关注'
  button.addEventListener('click', () => {
    void api()
      .watchSender(from, !watched)
      .then(paint)
      .catch((error) => {
        statusEl.classList.add('is-error')
        statusEl.textContent = error instanceof Error ? error.message : String(error)
      })
  })
  return button
}

function triageButton(id: string, decision: MailTriage): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'ghost'
  button.textContent = MAIL_TRIAGE_LABELS[decision]
  button.addEventListener('click', () => {
    void api()
      .triage(id, decision)
      .then(paint)
      .catch((error) => {
        statusEl.classList.add('is-error')
        statusEl.textContent = error instanceof Error ? error.message : String(error)
      })
  })
  return button
}

function renderAccounts(): void {
  accountList.replaceChildren()
  if (!state || state.accounts.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'hint'
    empty.textContent = '还没有账号。本机邮件不用密码；线上邮箱请用专用密码 / 授权码。'
    accountList.append(empty)
    return
  }
  for (const account of state.accounts) {
    const row = document.createElement('div')
    row.className = 'mail-account'
    const title = document.createElement('strong')
    title.textContent = account.label
    const meta = document.createElement('span')
    meta.className = 'hint'
    meta.textContent = account.hasPassword || account.provider === 'local' ? '已接入' : '缺密码'
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'ghost'
    remove.textContent = '移除'
    remove.addEventListener('click', () => {
      void api().removeAccount(account.id).then(paint)
    })
    row.append(title, meta, remove)
    accountList.append(row)
  }
}

function renderWatched(): void {
  watchedList.replaceChildren()
  const senders = state?.watchedSenders ?? []
  if (senders.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'hint'
    empty.textContent = '还没有关注的人。在收件箱卡片上点「关注」。'
    watchedList.append(empty)
    return
  }
  for (const sender of senders) {
    const row = document.createElement('div')
    row.className = 'mail-account'
    const title = document.createElement('strong')
    title.textContent = sender
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'ghost'
    remove.textContent = '取消关注'
    remove.addEventListener('click', () => {
      void api().watchSender(sender, false).then(paint)
    })
    row.append(title, remove)
    watchedList.append(row)
  }
}

function bind(): void {
  if (bound) {
    return
  }
  bound = true
  weekBtn.addEventListener('click', () => {
    groupByWeek = !groupByWeek
    renderInbox()
  })
  refreshBtn.addEventListener('click', () => {
    if (loading) {
      return
    }
    loading = true
    refreshBtn.setAttribute('aria-busy', 'true')
    void api()
      .sync()
      .then(paint)
      .finally(() => {
        loading = false
        refreshBtn.setAttribute('aria-busy', 'false')
      })
  })
  required('#mail-lookup-form', HTMLFormElement).addEventListener('submit', (event) => {
    event.preventDefault()
    const query = lookupQuery.value.trim()
    lookupOut.replaceChildren()
    if (!state || !query) {
      return
    }
    const hits = state.messages.filter((item) =>
      `${item.from} ${item.subject} ${item.snippet}`.toLowerCase().includes(query.toLowerCase()),
    )
    if (hits.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'hint'
      empty.textContent = `查「${query}」没有命中。`
      lookupOut.append(empty)
      return
    }
    for (const hit of hits.slice(0, 12)) {
      lookupOut.append(messageCard(hit))
    }
  })
  required('#mail-account-form', HTMLFormElement).addEventListener('submit', (event) => {
    event.preventDefault()
    const provider = providerEl.value as MailProvider
    const input: MailAccountInput = {
      provider,
      email: emailEl.value.trim(),
      password: passwordEl.value,
    }
    void api()
      .saveAccount(input)
      .then((next) => {
        passwordEl.value = ''
        paint(next)
      })
  })
  localBtn.addEventListener('click', () => {
    void api()
      .saveAccount({ provider: 'local', enabled: true })
      .then(() => api().sync())
      .then(paint)
  })
  api().onChanged(paint)
}

export function activateMail(): void {
  bind()
  if (!providerEl.options.length) {
    for (const item of MAIL_PROVIDERS.filter((row) => row.id !== 'local')) {
      const option = document.createElement('option')
      option.value = item.id
      option.textContent = item.name
      providerEl.append(option)
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

void view
