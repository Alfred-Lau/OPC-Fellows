import type { DraftTodo, TodoItem } from '../../shared/todo'
import { ALL_TAG, collectTags, renderTagFilter, tagChips } from './tags-ui'

const source = required('#source', HTMLTextAreaElement)
const defaultTime = required('#default-time', HTMLInputElement)
const hint = required('#hint', HTMLParagraphElement)
const todoCount = required('#todo-count', HTMLSpanElement)
const doneCaption = required('#done-caption', HTMLElement)
const draftBlock = required('#draft-block', HTMLElement)
const doneBlock = required('#done-block', HTMLDetailsElement)
const draftsEl = required('#drafts', HTMLUListElement)
const savedEl = required('#saved', HTMLUListElement)
const doneEl = required('#done', HTMLUListElement)
const savedTags = required('#saved-tags', HTMLDivElement)
const decomposeBtn = required('#decompose', HTMLButtonElement)
const saveBtn = required('#save', HTMLButtonElement)
const completeBatchBtn = required('#complete-batch', HTMLButtonElement)

let drafts: DraftTodo[] = []
let saved: TodoItem[] = []
let savedTag = ALL_TAG
const selectedIds = new Set<string>()
let lastSelectedId: string | null = null

function required<T extends typeof HTMLElement>(selector: string, ctor: T): InstanceType<T> {
  const node = document.querySelector(selector)
  if (!(node instanceof ctor)) {
    throw new Error(`missing ${selector}`)
  }
  return node as InstanceType<T>
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function toLocalInput(iso: string | null): string {
  if (!iso) {
    return ''
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function todayDefaultInput(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T18:00`
}

function ensureDefaultTime(): void {
  if (!defaultTime.value) {
    defaultTime.value = todayDefaultInput()
  }
}

function fromLocalInput(value: string): string | null {
  return value ? `${value}:00` : null
}

function setHint(message: string, isError = false): void {
  hint.textContent = message
  hint.classList.toggle('is-error', isError)
}

function renderDrafts(): void {
  draftsEl.replaceChildren()
  draftBlock.hidden = drafts.length === 0
  saveBtn.disabled = drafts.length === 0
  saveBtn.textContent = drafts.length > 0 ? `全部写入 ${String(drafts.length)} 条` : '全部写入'
  for (const [index, draft] of drafts.entries()) {
    draftsEl.append(draftRow(draft, index))
  }
}

function openTodos(): TodoItem[] {
  return saved.filter((item) => !item.done)
}

function visibleOpenTodos(): TodoItem[] {
  const open = openTodos()
  return savedTag === ALL_TAG ? open : open.filter((item) => item.tags.includes(savedTag))
}

function pruneSelection(visible: TodoItem[]): void {
  const allowed = new Set(visible.map((item) => item.id))
  for (const id of [...selectedIds]) {
    if (!allowed.has(id)) {
      selectedIds.delete(id)
    }
  }
  if (lastSelectedId && !allowed.has(lastSelectedId)) {
    lastSelectedId = null
  }
}

function renderCompleteBatch(visible: TodoItem[]): void {
  const selected = visible.filter((item) => selectedIds.has(item.id)).length
  const count = selected > 0 ? selected : visible.length
  completeBatchBtn.hidden = visible.length === 0
  completeBatchBtn.disabled = count === 0
  completeBatchBtn.textContent =
    selected > 0 ? `完成选中 ${String(selected)} 条` : `全部完成 ${String(visible.length)} 条`
}

function renderSaved(highlightId?: string): void {
  const open = openTodos()
  const done = saved.filter((item) => item.done)
  const tags = collectTags(open)
  if (savedTag !== ALL_TAG && !tags.includes(savedTag)) {
    savedTag = ALL_TAG
  }
  renderTagFilter(savedTags, tags, savedTag, (tag) => {
    savedTag = tag
    selectedIds.clear()
    lastSelectedId = null
    renderSaved(highlightId)
  })
  const visible = visibleOpenTodos()
  pruneSelection(visible)
  todoCount.textContent = String(open.length)
  renderCompleteBatch(visible)
  savedEl.replaceChildren()
  if (visible.length === 0) {
    savedEl.append(
      emptyRow(
        drafts.length > 0
          ? '写入后会出现在这里'
          : savedTag === ALL_TAG
            ? '还没有任务，先在上面添加'
            : `没有「${savedTag}」待办`,
      ),
    )
  } else {
    for (const todo of visible) {
      savedEl.append(savedRow(todo, highlightId))
    }
  }
  doneEl.replaceChildren()
  doneBlock.hidden = done.length === 0
  doneCaption.textContent = `已完成 ${String(done.length)}`
  if (highlightId && done.some((item) => item.id === highlightId)) {
    doneBlock.open = true
  }
  for (const todo of done) {
    doneEl.append(savedRow(todo, highlightId))
  }
}

function emptyRow(text: string): HTMLLIElement {
  const item = document.createElement('li')
  item.className = 'empty'
  item.textContent = text
  return item
}

function draftRow(draft: DraftTodo, index: number): HTMLLIElement {
  const item = document.createElement('li')
  item.className = 'tick-row'
  const title = document.createElement('p')
  title.className = 'title'
  title.textContent = draft.title
  title.title = draft.note ?? draft.title
  const time = whenInput(toLocalInput(draft.notifyAt), (value) => {
    drafts[index] = { ...draft, notifyAt: fromLocalInput(value) }
  })
  const remove = ghostButton('去掉', () => {
    drafts.splice(index, 1)
    renderDrafts()
  })
  item.append(title, time, remove)
  return item
}

function savedRow(todo: TodoItem, highlightId?: string): HTMLLIElement {
  const item = document.createElement('li')
  item.className = todo.done ? 'tick-row is-done' : 'tick-row is-pickable'
  item.dataset.id = todo.id
  if (!todo.done && selectedIds.has(todo.id)) {
    item.classList.add('is-selected')
  }
  if (todo.id === highlightId) {
    item.classList.add('is-flash')
    queueMicrotask(() => item.scrollIntoView({ block: 'nearest' }))
  }
  const box = document.createElement('input')
  box.type = 'checkbox'
  box.checked = todo.done
  box.addEventListener('change', async () => {
    await window.ownworkbuddy.todos.update(todo.id, { done: box.checked })
    selectedIds.delete(todo.id)
    await refreshSaved()
  })
  const title = document.createElement('p')
  title.className = 'title'
  title.textContent = todo.title
  title.title = notifyLabel(todo)
  const body = document.createElement('div')
  body.className = 'tick-body'
  body.append(title)
  if (todo.tags.length > 0) {
    body.append(tagChips(todo.tags))
  }
  const time = whenInput(toLocalInput(todo.notifyAt), async (value) => {
    await window.ownworkbuddy.todos.update(todo.id, { notifyAt: fromLocalInput(value) })
    await refreshSaved()
  })
  const remove = ghostButton('删除', async () => {
    await window.ownworkbuddy.todos.remove(todo.id)
    selectedIds.delete(todo.id)
    await refreshSaved()
  })
  if (!todo.done) {
    item.addEventListener('click', (event) => {
      if (!(event.target instanceof Element) || event.target.closest('input, button')) {
        return
      }
      toggleSelected(todo.id, event.shiftKey)
      renderSaved(highlightId)
    })
  }
  item.append(box, body, time, remove)
  return item
}

function toggleSelected(id: string, range: boolean): void {
  const visible = visibleOpenTodos()
  if (range && lastSelectedId) {
    const from = visible.findIndex((item) => item.id === lastSelectedId)
    const to = visible.findIndex((item) => item.id === id)
    if (from >= 0 && to >= 0) {
      const [start, end] = from < to ? [from, to] : [to, from]
      for (const item of visible.slice(start, end + 1)) {
        selectedIds.add(item.id)
      }
      lastSelectedId = id
      return
    }
  }
  if (selectedIds.has(id)) {
    selectedIds.delete(id)
  } else {
    selectedIds.add(id)
  }
  lastSelectedId = id
}

function whenInput(value: string, onChange: (value: string) => void | Promise<void>): HTMLInputElement {
  const time = document.createElement('input')
  time.type = 'datetime-local'
  time.value = value
  time.addEventListener('change', () => {
    void onChange(time.value)
  })
  return time
}

function ghostButton(label: string, onClick: () => void | Promise<void>): HTMLButtonElement {
  const button = document.createElement('button')
  button.className = 'ghost'
  button.type = 'button'
  button.textContent = label
  button.addEventListener('click', () => {
    void onClick()
  })
  return button
}

function notifyLabel(todo: TodoItem): string {
  if (todo.done) {
    return '已完成'
  }
  if (!todo.notifyAt) {
    return '不提醒'
  }
  if (todo.notifiedAt) {
    return '已经提醒过'
  }
  const date = new Date(todo.notifyAt)
  if (Number.isNaN(date.getTime())) {
    return '时间无效'
  }
  return `将在 ${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())} 通知`
}

function fitSource(): void {
  source.style.height = 'auto'
  source.style.height = `${String(Math.min(Math.max(source.scrollHeight, 36), 88))}px`
}

async function refreshSaved(highlightId?: string): Promise<void> {
  saved = await window.ownworkbuddy.todos.list()
  renderSaved(highlightId)
}

async function runDecompose(): Promise<void> {
  decomposeBtn.disabled = true
  setHint('正在拆解…')
  try {
    const result = await window.ownworkbuddy.todos.decompose({
      text: source.value,
      defaultNotifyAt: fromLocalInput(defaultTime.value),
    })
    drafts = result.items
    renderDrafts()
    if (result.items.length === 0) {
      setHint(result.fallbackReason ?? '没有拆出待办。', true)
    } else if (result.usedModel) {
      setHint(`模型拆出 ${String(result.items.length)} 条，可改时间后再写入。`)
    } else {
      setHint(result.fallbackReason ?? `按语句拆出 ${String(result.items.length)} 条。`)
    }
  } catch (error) {
    setHint(error instanceof Error ? error.message : '拆解失败', true)
  } finally {
    decomposeBtn.disabled = false
  }
}

decomposeBtn.addEventListener('click', () => {
  void runDecompose()
})

source.addEventListener('input', fitSource)
source.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void runDecompose()
  }
})

completeBatchBtn.addEventListener('click', () => {
  void completeBatch()
})

window.addEventListener('keydown', (event) => {
  if (document.body.dataset.view !== 'todos' || event.isComposing) {
    return
  }
  if (event.key === 'Escape' && selectedIds.size > 0) {
    selectedIds.clear()
    lastSelectedId = null
    renderSaved()
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
    const target = event.target
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return
    }
    const visible = visibleOpenTodos()
    if (visible.length === 0) {
      return
    }
    event.preventDefault()
    for (const item of visible) {
      selectedIds.add(item.id)
    }
    lastSelectedId = visible[visible.length - 1]?.id ?? null
    renderSaved()
  }
})

async function completeBatch(): Promise<void> {
  const visible = visibleOpenTodos()
  const ids =
    selectedIds.size > 0
      ? visible.filter((item) => selectedIds.has(item.id)).map((item) => item.id)
      : visible.map((item) => item.id)
  if (ids.length === 0) {
    return
  }
  completeBatchBtn.disabled = true
  try {
    await window.ownworkbuddy.todos.updateMany(ids, { done: true })
    selectedIds.clear()
    lastSelectedId = null
    await refreshSaved()
    setHint(`已完成 ${String(ids.length)} 条。`)
  } catch (error) {
    setHint(error instanceof Error ? error.message : '批量完成失败', true)
    renderCompleteBatch(visibleOpenTodos())
  }
}

saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true
  try {
    const created = await window.ownworkbuddy.todos.save(drafts, source.value.trim())
    drafts = []
    source.value = ''
    fitSource()
    renderDrafts()
    await refreshSaved()
    const timed = created.filter((item) => item.notifyAt).length
    setHint(`已写入 ${String(created.length)} 条${timed ? `，其中 ${String(timed)} 条会到点通知` : ''}。`)
  } catch (error) {
    setHint(error instanceof Error ? error.message : '写入失败', true)
    saveBtn.disabled = false
  }
})

export function activateTodos(): void {
  ensureDefaultTime()
  source.focus()
}

export async function seedTodos(text: string): Promise<void> {
  source.value = text
  fitSource()
  activateTodos()
  await runDecompose()
}

export function highlightTodo(id: string): void {
  savedTag = ALL_TAG
  void refreshSaved(id)
}

window.ownworkbuddy.todos.onHighlight((id) => {
  void refreshSaved(id)
})
window.ownworkbuddy.todos.onFocusInput(activateTodos)
window.ownworkbuddy.todos.onChanged(() => {
  if (document.body.dataset.view === 'todos' || document.body.dataset.tool === 'todos') {
    void refreshSaved()
  }
})

ensureDefaultTime()
renderDrafts()
void refreshSaved()
