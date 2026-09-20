/**
 * 中栏气泡从 dsh Session 表层投影。
 * 操作者 / 成员对白进 Session；座位提示（没 key、超时、转发）不进模型日志。
 * 可分享日志不写本机绝对路径。
 */

import type { DialogueSource, ThreadMessage } from './agent.ts'

const CITE_PREFIX = '用户引用了这些文件'
const FOLLOW_PREFIX = '用户原话：'

export interface SessionSurfaceTurn {
  user?: { seq?: number; text: string }
  assistant?: { seq?: number; text: string; thinking?: string }
}

export function sessionMessageId(sessionId: string, seq: number): string {
  return `session:${sessionId}:${seq}`
}

export function dialogueSourceForRole(role: ThreadMessage['role'], explicit?: DialogueSource): DialogueSource {
  if (explicit) {
    return explicit
  }
  return role === 'user' ? 'session' : 'seat'
}

export function isSeatMessage(message: Pick<ThreadMessage, 'role' | 'source'>): boolean {
  switch (message.source) {
    case 'seat':
      return true
    case 'session':
      return false
    case undefined:
      return message.role === 'system'
    default: {
      const exhaustive: never = message.source
      return exhaustive
    }
  }
}

export function isShareableAbsPath(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.startsWith('/') || trimmed.startsWith('~') || /^[A-Za-z]:[\\/]/.test(trimmed)
}

export function shareableLogPath(path: string, fallbackName = ''): string {
  const trimmed = path.trim()
  const name = fallbackName.trim() || fileNameOf(trimmed) || 'file'
  if (!trimmed || isShareableAbsPath(trimmed)) {
    return name
  }
  return trimmed
}

function fileNameOf(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return cut >= 0 ? path.slice(cut + 1) : path
}

export function projectSessionSurface(events: readonly unknown[]): SessionSurfaceTurn {
  let user: SessionSurfaceTurn['user']
  let assistant: SessionSurfaceTurn['assistant']
  for (const raw of events) {
    const event = asRecord(raw)
    if (!event) {
      continue
    }
    const operator = operatorUserText(event)
    if (operator) {
      user = { text: operator, ...(eventSeq(event) != null ? { seq: eventSeq(event) } : {}) }
      continue
    }
    const member = memberAssistant(event)
    if (member) {
      assistant = { ...member, ...(eventSeq(event) != null ? { seq: eventSeq(event) } : {}) }
    }
  }
  return {
    ...(user ? { user } : {}),
    ...(assistant ? { assistant } : {}),
  }
}

export function stampSessionUser(
  messages: ThreadMessage[],
  threadId: string,
  sessionId: string,
  user: SessionSurfaceTurn['user'],
): void {
  const text = user?.text.trim()
  if (!text) {
    return
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message || message.threadId !== threadId || message.role !== 'user') {
      continue
    }
    if (message.text.trim() !== text) {
      continue
    }
    message.source = 'session'
    if (user?.seq != null) {
      message.id = sessionMessageId(sessionId, user.seq)
      message.sessionSeq = user.seq
    }
    return
  }
}

function operatorUserText(event: Record<string, unknown>): string | null {
  if (event.type !== 'user/message') {
    return null
  }
  const data = asRecord(event.data)
  const source = asRecord(data?.source)
  const kind = source?.kind
  if (typeof kind === 'string' && kind !== 'user') {
    return null
  }
  const visible = messageTexts(data).filter(
    (text) => !text.startsWith(CITE_PREFIX) && !text.startsWith(FOLLOW_PREFIX),
  )
  const text = visible.join('\n').trim()
  return text || null
}

function memberAssistant(event: Record<string, unknown>): { text: string; thinking?: string } | null {
  if (event.type !== 'assistant/message') {
    return null
  }
  const data = asRecord(event.data)
  const message = asRecord(data?.message) ?? data
  const text = messageTexts(message).join('\n').trim()
  if (!text) {
    return null
  }
  const thinking = messageThinking(message)
  return thinking ? { text, thinking } : { text }
}

function messageTexts(message: Record<string, unknown> | null): string[] {
  if (!message) {
    return []
  }
  const content = message.content
  const texts: string[] = []
  if (Array.isArray(content)) {
    for (const block of content) {
      const row = asRecord(block)
      if (!row || typeof row.text !== 'string') {
        continue
      }
      const type = typeof row.type === 'string' ? row.type : 'text'
      if (isThinkingType(type)) {
        continue
      }
      const text = row.text.trim()
      if (text) {
        texts.push(text)
      }
    }
  }
  if (texts.length === 0 && typeof message.text === 'string' && message.text.trim()) {
    texts.push(message.text.trim())
  }
  return texts
}

function messageThinking(message: Record<string, unknown> | null): string | undefined {
  if (!message) {
    return undefined
  }
  const content = message.content
  const parts: string[] = []
  if (Array.isArray(content)) {
    for (const block of content) {
      const row = asRecord(block)
      if (!row || typeof row.text !== 'string') {
        continue
      }
      const type = typeof row.type === 'string' ? row.type : ''
      if (isThinkingType(type) && row.text.trim()) {
        parts.push(row.text.trim())
      }
    }
  }
  return parts.length > 0 ? parts.join('\n') : undefined
}

function isThinkingType(type: string): boolean {
  switch (type) {
    case 'thinking':
    case 'reasoning':
    case 'reasoning_content':
    case 'thought':
    case 'redacted_thinking':
      return true
    default:
      return false
  }
}

function eventSeq(event: Record<string, unknown>): number | undefined {
  return typeof event.seq === 'number' && Number.isSafeInteger(event.seq) ? event.seq : undefined
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  return value as Record<string, unknown>
}
