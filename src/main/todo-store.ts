import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { extractTagsFromTitle, mergeTags, normalizeTags } from '../shared/tags'
import type { DraftTodo, TodoItem, TodoOrigin, TodoPatch } from '../shared/todo'

const store = {
  items: [] as TodoItem[],
}

export function todoStorePath(): string {
  return join(app.getPath('userData'), 'todos.json')
}

export function loadTodos(): TodoItem[] {
  const path = todoStorePath()
  if (!existsSync(path)) {
    store.items = []
    return store.items
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    store.items = Array.isArray(parsed) ? parsed.flatMap((row) => {
      const item = hydrateTodo(row)
      return item ? [item] : []
    }) : []
  } catch {
    store.items = []
  }
  return store.items
}

export function listTodos(): TodoItem[] {
  return store.items
}

export function addTodos(drafts: DraftTodo[], source: string): TodoItem[] {
  const created = drafts.flatMap((draft) => {
    const extracted = extractTagsFromTitle(draft.title)
    const title = extracted.title
    if (!title) {
      return []
    }
    const item: TodoItem = {
      id: crypto.randomUUID(),
      title,
      note: draft.note?.trim() || undefined,
      notifyAt: draft.notifyAt,
      notifiedAt: null,
      done: false,
      createdAt: new Date().toISOString(),
      source,
      tags: mergeTags(draft.tags, extracted.tags),
      origin: draft.origin === 'agent' ? 'agent' : 'user',
      agentId: draft.agentId?.trim() || undefined,
      dedupeKey: draft.dedupeKey?.trim() || undefined,
    }
    return [item]
  })
  store.items = [...created, ...store.items]
  persist()
  return created
}

export function updateTodo(id: string, patch: TodoPatch): TodoItem | null {
  return updateTodos([id], patch)[0] ?? null
}

export function updateTodos(ids: string[], patch: TodoPatch): TodoItem[] {
  const wanted = new Set(ids.filter((id) => id.length > 0))
  if (wanted.size === 0) {
    return []
  }
  const updated: TodoItem[] = []
  store.items = store.items.map((item) => {
    if (!wanted.has(item.id)) {
      return item
    }
    const next = applyPatch(item, patch)
    updated.push(next)
    return next
  })
  if (updated.length > 0) {
    persist()
  }
  return updated
}

function applyPatch(item: TodoItem, patch: TodoPatch): TodoItem {
  const next = { ...item }
  if (patch.title !== undefined) {
    next.title = patch.title
  }
  if (patch.note !== undefined) {
    next.note = patch.note.trim() || undefined
  }
  if (patch.done !== undefined) {
    next.done = patch.done
  }
  if (patch.notifyAt !== undefined) {
    if (patch.notifyAt !== next.notifyAt) {
      next.notifiedAt = null
    }
    next.notifyAt = patch.notifyAt
  }
  if (patch.notifiedAt !== undefined) {
    next.notifiedAt = patch.notifiedAt
  }
  if (patch.tags !== undefined) {
    next.tags = normalizeTags(patch.tags)
  }
  return next
}

export function removeTodo(id: string): boolean {
  const before = store.items.length
  store.items = store.items.filter((item) => item.id !== id)
  if (store.items.length === before) {
    return false
  }
  persist()
  return true
}

function persist(): void {
  const path = todoStorePath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(store.items, null, 2))
}

function hydrateTodo(value: unknown): TodoItem | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const item = value as Partial<TodoItem>
  if (typeof item.id !== 'string' || typeof item.title !== 'string') {
    return null
  }
  const origin: TodoOrigin = item.origin === 'agent' ? 'agent' : 'user'
  return {
    id: item.id,
    title: item.title,
    note: typeof item.note === 'string' ? item.note : undefined,
    notifyAt: typeof item.notifyAt === 'string' ? item.notifyAt : null,
    notifiedAt: typeof item.notifiedAt === 'string' ? item.notifiedAt : null,
    done: Boolean(item.done),
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
    source: typeof item.source === 'string' ? item.source : '',
    tags: normalizeTags(item.tags),
    origin,
    agentId: typeof item.agentId === 'string' ? item.agentId : undefined,
    dedupeKey: typeof item.dedupeKey === 'string' ? item.dedupeKey : undefined,
  }
}
