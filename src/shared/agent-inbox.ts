import { extractTagsFromTitle, mergeTags, normalizeTag } from './tags.ts'
import type { DraftTodo, TodoItem } from './todo.ts'

export interface AgentTodoDraft {
  title: string
  note?: string
  notifyAt?: string | null
  tags?: string[]
  dedupeKey?: string
}

export interface AgentInboxInput {
  agentId: string
  source: string
  tags?: string[]
  items: AgentTodoDraft[]
}

export interface InboxCreate extends DraftTodo {
  origin: 'agent'
  agentId: string
  tags: string[]
}

export interface InboxUpdate {
  id: string
  title: string
  note?: string
  notifyAt: string | null
  tags: string[]
}

export interface InboxPlan {
  create: InboxCreate[]
  update: InboxUpdate[]
  skipped: number
}

export interface AgentInboxResult {
  created: TodoItem[]
  updated: TodoItem[]
  skipped: number
}

export function planAgentInbox(existing: TodoItem[], input: AgentInboxInput): InboxPlan {
  const agentId = normalizeTag(input.agentId)
  const defaultTags = input.tags ?? []
  const create: InboxCreate[] = []
  const update: InboxUpdate[] = []
  let skipped = 0

  if (!agentId) {
    return { create, update, skipped: input.items.length }
  }

  for (const item of input.items) {
    const extracted = extractTagsFromTitle(item.title)
    const title = extracted.title
    if (!title) {
      skipped += 1
      continue
    }

    const tags = mergeTags(defaultTags, item.tags, extracted.tags)
    const notifyAt = item.notifyAt ?? null
    const note = item.note?.trim() || undefined
    const dedupeKey = item.dedupeKey?.trim() || undefined

    if (dedupeKey) {
      const matched = existing.find((todo) => todo.dedupeKey === dedupeKey)
      if (matched?.done) {
        skipped += 1
        continue
      }
      if (matched) {
        update.push({
          id: matched.id,
          title,
          note,
          notifyAt,
          tags: mergeTags(matched.tags, tags),
        })
        continue
      }
    }

    create.push({
      title,
      note,
      notifyAt,
      tags,
      origin: 'agent',
      agentId,
      dedupeKey,
    })
  }

  return { create, update, skipped }
}
