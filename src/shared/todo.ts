export type TodoOrigin = 'user' | 'agent'

export interface TodoItem {
  id: string
  title: string
  note?: string
  notifyAt: string | null
  notifiedAt: string | null
  done: boolean
  createdAt: string
  source: string
  tags: string[]
  origin: TodoOrigin
  agentId?: string
  dedupeKey?: string
}

export interface DraftTodo {
  title: string
  note?: string
  notifyAt: string | null
  tags?: string[]
  origin?: TodoOrigin
  agentId?: string
  dedupeKey?: string
}

export interface DecomposeInput {
  text: string
  defaultNotifyAt?: string | null
}

export interface DecomposeResult {
  items: DraftTodo[]
  usedModel: boolean
  fallbackReason?: string
}

export interface TodoPatch {
  done?: boolean
  notifyAt?: string | null
  notifiedAt?: string | null
  title?: string
  note?: string
  tags?: string[]
}
