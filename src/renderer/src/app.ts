import './theme.css'
import './studio-theme.css'
import './studio.css'
import './todos.css'
import './calendar.css'
import './social-ammo.css'
import './settings.css'
import './prefs.css'
import './app.css'
import { isSameDay, isTomorrow, pad2 } from '../../shared/datetime'
import type { WorkbenchView } from '../../shared/features'
import type { NavEntry } from '../../kernel/shared/nav'
import type { TodoItem } from '../../shared/todo'
import { activateSocial } from './social'
import { activatePrefs, hydrateProfile, leavePrefs } from './prefs'
import { activateSettings } from './settings'
import { ALL_TAG, collectTags, renderTagFilter, tagChips } from './tags-ui'
import { activateTheme } from './theme'
import { activateTodos, highlightTodo } from './todos'
import { applyCatalog } from '../../kernel/shared/catalog'
import {
  RAIL_WIDTH_COLLAPSED,
  RAIL_WIDTH_DEFAULT,
  RAIL_WIDTH_MIN,
  clampRailWidth,
  parseRailWidth,
} from '../../kernel/shared/rail-width'
import { activateHosted, unmountHosted } from './module-host'
import {
  bindStudio,
  focusAgent,
  focusInbox,
  handleComposer,
  openStudioTool,
  refreshStudio,
  setNavEntries,
  showExtensions,
  showPrefs,
} from './studio'

/**
 * 内置视图的挂载函数。哪些视图会出现在侧栏由内核的模块注册表决定，
 * 这里只回答「这个视图怎么渲染」。表里没有的 id 落到首页。
 */
const VIEWS: Record<string, () => void> = {
  todos: activateTodos,
  'social-ammo': activateSocial,
  extensions: activateSettings,
  prefs: activatePrefs,
}

/** 当前启用的模块导航项，由主进程给出。 */
let navEntries: NavEntry[] = []

const RECENT_KEY = 'ownworkbuddy.recent'
const TAG_KEY = 'ownworkbuddy.homeTag'
const RAIL_KEY = 'ownworkbuddy.rail'
const RAIL_WIDTH_KEY = 'ownworkbuddy.railWidth'
const inbox = required('#inbox', HTMLFormElement)
const command = required('#command', HTMLTextAreaElement)
const dueToday = required('#due-today', HTMLUListElement)
const openTodos = required('#open-todos', HTMLUListElement)
const todoTags = required('#todo-tags', HTMLDivElement)
const recentEl = required('#recent', HTMLUListElement)
const railToggle = required('#rail-toggle', HTMLButtonElement)
const railGutter = required('.rail-gutter', HTMLElement)

let homeTag = readHomeTag()
let lastRailToggle = 0

function required<T extends typeof HTMLElement>(selector: string, ctor: T): InstanceType<T> {
  const node = document.querySelector(selector)
  if (!(node instanceof ctor)) {
    throw new Error(`missing ${selector}`)
  }
  return node as InstanceType<T>
}

/** 内核自带的视图，不随模块开关消失。 */
const KERNEL_VIEWS = new Set(['home', 'todos', 'prefs', 'extensions'])

function isReachable(view: string): boolean {
  if (KERNEL_VIEWS.has(view)) {
    return true
  }
  // 导航还没从主进程拉回来时先放行，避免启动瞬间被打回首页。
  if (navEntries.length === 0) {
    return true
  }
  return navEntries.some((entry) => entry.id === view)
}

function showView(view: WorkbenchView): void {
  const target = isReachable(view) ? view : 'home'
  if (document.body.dataset.view === 'prefs' && target !== 'prefs') {
    leavePrefs()
  }
  document.body.dataset.view = target
  remember(target)
  const activate = VIEWS[target]
  if (activate) {
    unmountHosted()
    activate()
    if (target === 'home') {
      void renderDashboard()
    }
    return
  }
  const hosted = navEntries.find((entry) => entry.id === target && entry.kind === 'view')
  if (hosted) {
    void activateHosted(target)
    return
  }
  unmountHosted()
  void renderDashboard()
}

function remember(id: string): void {
  const next = [id, ...readRecent().filter((item) => item !== id)].slice(0, 5)
  localStorage.setItem(RECENT_KEY, JSON.stringify(next))
}

function readRecent(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function readHomeTag(): string {
  return localStorage.getItem(TAG_KEY) || ALL_TAG
}

/** 首页固定在最前，中间是启用的模块。设置从用户中心进，不占这条导航。 */
function navItems(): NavEntry[] {
  const home: NavEntry = { id: 'home', title: '今日', mark: '今', kind: 'view', order: -1 }
  return [home, ...navEntries.filter((entry) => entry.kind !== 'background')]
}

function openEntry(entry: NavEntry): void {
  if (entry.kind === 'window') {
    remember(entry.id)
    void window.ownworkbuddy.workbench.open(entry.id)
    return
  }
  showView(entry.id)
  if (entry.id !== 'home') {
    openStudioTool(entry.id === 'todos' ? 'todos' : 'tool')
  }
}

/** 从内核拉一次导航，模块开关变化后也走这里。 */
async function syncNav(): Promise<void> {
  navEntries = await window.ownworkbuddy.workbench.nav()
  setNavEntries(navEntries)
  const current = document.body.dataset.view
  if (
    current &&
    current !== 'home' &&
    current !== 'task' &&
    current !== 'schedule' &&
    current !== 'prefs' &&
    current !== 'extensions' &&
    !navEntries.some((entry) => entry.id === current)
  ) {
    showView('home')
  }
  await refreshStudio()
}

function readRail(): 'open' | 'collapsed' {
  return localStorage.getItem(RAIL_KEY) === 'collapsed' ? 'collapsed' : 'open'
}

function applyRail(state: 'open' | 'collapsed'): void {
  document.body.dataset.rail = state
  const collapsed = state === 'collapsed'
  railToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
  railToggle.setAttribute('aria-label', collapsed ? '展开目录' : '收起目录')
  railToggle.title = collapsed ? '展开目录' : '收起目录'
}

function toggleRail(): void {
  const now = Date.now()
  if (now - lastRailToggle < 80) {
    return
  }
  lastRailToggle = now
  const next = document.body.dataset.rail === 'collapsed' ? 'open' : 'collapsed'
  localStorage.setItem(RAIL_KEY, next)
  applyRail(next)
}

function applyRailWidth(width: number): void {
  const next = clampRailWidth(width, window.innerWidth)
  document.documentElement.style.setProperty('--rail-width', `${String(next)}px`)
}

function readStoredRailWidth(): number {
  return clampRailWidth(parseRailWidth(localStorage.getItem(RAIL_WIDTH_KEY)) ?? RAIL_WIDTH_DEFAULT, window.innerWidth)
}

function currentRailWidth(): number {
  const rail = document.querySelector('.rail')
  if (rail instanceof HTMLElement) {
    return rail.getBoundingClientRect().width
  }
  return readStoredRailWidth()
}

function persistRailWidth(width: number): void {
  localStorage.setItem(RAIL_WIDTH_KEY, String(clampRailWidth(width, window.innerWidth)))
}

function bindRailResize(): void {
  applyRailWidth(readStoredRailWidth())
  let dragging = false
  let originX = 0
  let originWidth = RAIL_WIDTH_DEFAULT

  railGutter.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) {
      return
    }
    event.preventDefault()
    dragging = true
    originX = event.clientX
    originWidth = document.body.dataset.rail === 'collapsed' ? RAIL_WIDTH_COLLAPSED : currentRailWidth()
    document.body.dataset.railResizing = 'true'
    railGutter.setPointerCapture(event.pointerId)
  })

  railGutter.addEventListener('pointermove', (event) => {
    if (!dragging) {
      return
    }
    const next = originWidth + (event.clientX - originX)
    if (document.body.dataset.rail === 'collapsed' && next >= RAIL_WIDTH_MIN) {
      localStorage.setItem(RAIL_KEY, 'open')
      applyRail('open')
    }
    applyRailWidth(next)
  })

  const endDrag = (): void => {
    if (!dragging) {
      return
    }
    dragging = false
    delete document.body.dataset.railResizing
    const next = currentRailWidth()
    if (Math.abs(next - originWidth) >= 2) {
      persistRailWidth(next)
    }
  }

  railGutter.addEventListener('pointerup', endDrag)
  railGutter.addEventListener('pointercancel', endDrag)
  window.addEventListener('resize', () => {
    applyRailWidth(readStoredRailWidth())
  })
}

function timeLabel(iso: string | null): string {
  if (!iso) {
    return '未定时'
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return '时间无效'
  }
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function whenMeta(iso: string | null, now: Date): string {
  if (!iso) {
    return '未定时'
  }
  if (isSameDay(iso, now)) {
    return timeLabel(iso)
  }
  if (isTomorrow(iso, now)) {
    return `明天 ${timeLabel(iso)}`
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return '时间无效'
  }
  return `${date.getMonth() + 1}/${date.getDate()} ${timeLabel(iso)}`
}

function emptyRow(text: string): HTMLLIElement {
  const item = document.createElement('li')
  item.className = 'empty'
  item.textContent = text
  return item
}

function ghostAction(label: string, onClick: () => void | Promise<void>): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'ghost'
  button.textContent = label
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    void onClick()
  })
  return button
}

function completeTodo(id: string): Promise<TodoItem | null> {
  return window.ownworkbuddy.todos.update(id, { done: true })
}

function revealTodo(id: string): void {
  openStudioTool('todos')
  highlightTodo(id)
}

function attachToComposer(title: string): void {
  const snippet = `「${title}」`
  const prefix = command.value && !/\s$/.test(command.value) ? ' ' : ''
  command.value = `${command.value}${prefix}${snippet}`
  command.focus()
  const end = command.value.length
  command.setSelectionRange(end, end)
  command.dispatchEvent(new Event('input'))
}

function dashRow(item: TodoItem, meta: string): HTMLLIElement {
  const row = document.createElement('li')
  row.className = 'dash-row'

  const box = document.createElement('input')
  box.type = 'checkbox'
  box.className = 'dash-check'
  box.title = '完成'
  box.setAttribute('aria-label', `完成 ${item.title}`)
  box.addEventListener('click', (event) => event.stopPropagation())
  box.addEventListener('change', () => {
    void completeTodo(item.id)
  })

  const open = document.createElement('button')
  open.type = 'button'
  open.className = 'dash-open'
  open.title = '在待办里打开'
  const main = document.createElement('span')
  main.className = 'dash-main'
  const name = document.createElement('span')
  name.className = 'title'
  name.textContent = item.title
  main.append(name)
  if (item.tags.length > 0) {
    main.append(tagChips(item.tags))
  }
  const aside = document.createElement('span')
  aside.className = 'meta'
  aside.textContent = meta
  open.append(main, aside)
  open.addEventListener('click', () => revealTodo(item.id))

  const actions = document.createElement('span')
  actions.className = 'dash-actions'
  actions.append(
    ghostAction('完成', () => completeTodo(item.id)),
    ghostAction('打开', () => revealTodo(item.id)),
    ghostAction('提到', () => attachToComposer(item.title)),
  )

  row.append(box, open, actions)
  return row
}

function recentChip(title: string, meta: string, onClick: () => void): HTMLLIElement {
  const item = document.createElement('li')
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'home-recent-chip'
  button.textContent = title
  button.title = meta
  button.addEventListener('click', onClick)
  item.append(button)
  return item
}

async function renderDashboard(): Promise<void> {
  try {
    const now = new Date()
    const items = await window.ownworkbuddy.todos.list()
    const open = items.filter((item) => !item.done)
    const due = open
      .filter((item) => isSameDay(item.notifyAt, now))
      .sort((left, right) => Date.parse(left.notifyAt ?? '') - Date.parse(right.notifyAt ?? ''))

    fillList(dueToday, due, '今天没有提醒', (item) => whenMeta(item.notifyAt, now))

    const tags = collectTags(open)
    if (homeTag !== ALL_TAG && !tags.includes(homeTag)) {
      homeTag = ALL_TAG
    }
    renderTagFilter(todoTags, tags, homeTag, (tag) => {
      homeTag = tag
      localStorage.setItem(TAG_KEY, tag)
      void renderDashboard()
    })
    const personal = homeTag === ALL_TAG ? open : open.filter((item) => item.tags.includes(homeTag))
    fillList(
      openTodos,
      personal.slice(0, 8),
      homeTag === ALL_TAG ? '没有未完成的事' : `没有「${homeTag}」待办`,
      (item) => whenMeta(item.notifyAt, now),
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '待办还没读出来'
    fillList(dueToday, [], message, () => '')
    fillList(openTodos, [], message, () => '')
  }

  recentEl.replaceChildren()
  // 停用掉的模块不再出现在最近使用里。
  const recent = readRecent()
    .map((id) => navItems().find((entry) => entry.id === id))
    .filter((entry): entry is NavEntry => Boolean(entry))
  if (recent.length === 0) {
    recentEl.append(emptyRow('还没有切换过模块'))
    return
  }
  for (const entry of recent) {
    recentEl.append(
      recentChip(entry.title, entry.kind === 'window' ? '外窗' : '模块', () => {
        openEntry(entry)
      }),
    )
  }
}

function fillList(
  root: HTMLUListElement,
  items: TodoItem[],
  empty: string,
  meta: (item: TodoItem) => string,
): void {
  root.replaceChildren()
  if (items.length === 0) {
    root.append(emptyRow(empty))
    return
  }
  for (const item of items) {
    root.append(dashRow(item, meta(item)))
  }
}

inbox.addEventListener('submit', (event) => {
  event.preventDefault()
  const text = command.value.trim()
  command.value = ''
  void handleComposer(text)
})
command.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    inbox.requestSubmit()
  }
})

window.addEventListener('keydown', (event) => {
  if (event.isComposing) {
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
    event.preventDefault()
    toggleRail()
  }
})

applyRail(readRail())
bindRailResize()
activateTheme()
void hydrateProfile()
bindStudio(showView)
focusInbox('home')
void window.ownworkbuddy.workbench.catalog().then((catalog) => {
  applyCatalog(catalog)
})
window.ownworkbuddy.workbench.onCatalogChanged((catalog) => {
  applyCatalog(catalog)
})
void syncNav()
window.ownworkbuddy.workbench.onChanged(() => {
  void syncNav()
})
railToggle.addEventListener('click', toggleRail)
void renderDashboard()

window.ownworkbuddy.onNavigate((view) => {
  if (view === 'home') {
    focusInbox('home')
    return
  }
  if (view === 'todos' || view === 'prefs' || view === 'extensions' || view === 'settings') {
    if (view === 'prefs' || view === 'settings') {
      showPrefs()
      return
    }
    if (view === 'extensions') {
      showExtensions()
      return
    }
    focusInbox('todos')
    return
  }
  void focusAgent(view, { revealTool: true })
})

window.ownworkbuddy.onToggleRail?.(() => {
  toggleRail()
})

window.ownworkbuddy.todos.onChanged(() => {
  if (document.body.dataset.view === 'home') {
    void renderDashboard()
  }
})
