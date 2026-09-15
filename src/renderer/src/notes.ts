import type { NoteItem } from '../../shared/note'

const composer = required('#note-composer', HTMLFormElement)
const input = required('#note-input', HTMLInputElement)
const filter = required('#note-filter', HTMLInputElement)
const count = required('#note-count', HTMLSpanElement)
const list = required('#notes', HTMLUListElement)

let notes: NoteItem[] = []

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

function stamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const now = new Date()
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) {
    return time
  }
  if (date.getFullYear() === now.getFullYear()) {
    return `${String(date.getMonth() + 1)}/${String(date.getDate())} ${time}`
  }
  return `${String(date.getFullYear())}/${String(date.getMonth() + 1)}/${String(date.getDate())}`
}

function titleOf(text: string): string {
  return text.split(/\r?\n/, 1)[0]?.trim() || text
}

function visibleNotes(): NoteItem[] {
  const query = filter.value.trim().toLowerCase()
  if (!query) {
    return notes
  }
  return notes.filter((note) => note.text.toLowerCase().includes(query))
}

function emptyRow(text: string): HTMLLIElement {
  const item = document.createElement('li')
  item.className = 'empty'
  item.textContent = text
  return item
}

function noteRow(note: NoteItem, highlightId?: string): HTMLLIElement {
  const item = document.createElement('li')
  item.className = 'tick-row'
  item.dataset.id = note.id
  if (note.id === highlightId) {
    item.classList.add('is-flash')
    queueMicrotask(() => item.scrollIntoView({ block: 'nearest' }))
  }
  const when = document.createElement('span')
  when.className = 'note-when'
  when.textContent = stamp(note.createdAt)
  const title = document.createElement('p')
  title.className = 'title'
  title.textContent = titleOf(note.text)
  title.title = note.text
  const remove = document.createElement('button')
  remove.className = 'ghost'
  remove.type = 'button'
  remove.textContent = '删除'
  remove.addEventListener('click', async () => {
    await window.ownworkbuddy.notes.remove(note.id)
    await refreshNotes()
  })
  item.append(when, title, remove)
  return item
}

function renderNotes(highlightId?: string): void {
  const shown = visibleNotes()
  count.textContent = String(notes.length)
  list.replaceChildren()
  if (notes.length === 0) {
    list.append(emptyRow('还没有随手记，先在上面写一句'))
    return
  }
  if (shown.length === 0) {
    list.append(emptyRow('没有匹配的笔记'))
    return
  }
  for (const note of shown) {
    list.append(noteRow(note, highlightId))
  }
}

async function refreshNotes(highlightId?: string): Promise<void> {
  notes = await window.ownworkbuddy.notes.list()
  renderNotes(highlightId)
}

async function capture(): Promise<void> {
  const text = input.value
  if (!text.trim()) {
    return
  }
  const created = await window.ownworkbuddy.notes.add(text)
  input.value = ''
  if (created) {
    await refreshNotes(created.id)
  }
}

export function activateNotes(): void {
  input.focus()
}

export function revealNotesFind(query: string): void {
  filter.value = query
  void refreshNotes()
}

export function highlightNote(id: string): void {
  filter.value = ''
  void refreshNotes(id)
}

composer.addEventListener('submit', (event) => {
  event.preventDefault()
  void capture()
})

input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.isComposing || event.keyCode === 229)) {
    event.stopPropagation()
  }
})

filter.addEventListener('input', () => {
  renderNotes()
})

window.ownworkbuddy.notes.onFocusInput(activateNotes)

void refreshNotes()
