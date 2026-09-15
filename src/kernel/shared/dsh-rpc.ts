/**
 * DeepSeek Harness SDK 的 stdio JSON-RPC 线协议（newline-delimited JSON-RPC 2.0）。
 * 只负责组帧、拆帧、从 session.event 里抽出助手正文；不负责 spawn。
 */

export interface DshJsonRpcFrame {
  jsonrpc?: string
  id?: string | number
  method?: string
  params?: unknown
  result?: unknown
  error?: { code?: number; message?: string; data?: unknown }
}

export function encodeJsonRpcRequest(id: string | number, method: string, params?: unknown): string {
  const message =
    params === undefined
      ? { jsonrpc: '2.0', id, method }
      : { jsonrpc: '2.0', id, method, params }
  return `${JSON.stringify(message)}\n`
}

export function parseJsonRpcLine(line: string): DshJsonRpcFrame | null {
  const trimmed = line.trim()
  if (!trimmed) {
    return null
  }
  try {
    const value = JSON.parse(trimmed) as unknown
    if (!value || typeof value !== 'object') {
      return null
    }
    return value as DshJsonRpcFrame
  } catch {
    return null
  }
}

export class JsonRpcLineBuffer {
  private rest = ''

  push(chunk: string): DshJsonRpcFrame[] {
    this.rest += chunk
    const parts = this.rest.split('\n')
    this.rest = parts.pop() ?? ''
    const frames: DshJsonRpcFrame[] = []
    for (const part of parts) {
      const frame = parseJsonRpcLine(part)
      if (frame) {
        frames.push(frame)
      }
    }
    return frames
  }
}

export function dshSessionId(threadId: string, agentId: string): string {
  return `opc:${threadId}:${agentId}`.replace(/[^a-zA-Z0-9:_-]/g, '_')
}

/**
 * SDK `session/prompt` 只会 `agents.create`，不会 resume。
 * 同一条 OPC 会话在 dsh 重启后会撞上磁盘里的旧 session，所以每棵进程再加一段 runtime id。
 */
export function dshRuntimeSessionId(sessionId: string, runtimeId: string): string {
  const id = runtimeId.trim()
  if (!id) {
    return sessionId
  }
  return `${sessionId}:${id}`
}

export function isDshSessionExistsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /session ".*?" already exists/.test(message)
}

export function composeDshTurn(system: string, user: string): string {
  return `${system.trim()}\n\n---\n\n${user.trim()}`
}

/** 工具跑完仍带着人设和用户原话，避免模型只复述「工具已执行」或丢掉原问题。 */
export function composeToolFollowUp(
  persona: string,
  user: string,
  toolName: string,
  result: string,
): string {
  return composeDshTurn(
    `${persona.trim()}\n\n工具已执行。根据结果用中文直接回答用户原话。不要复述或翻译这些指令，不要把思考过程写进回复。`,
    `用户原话：${user}\n\n工具 ${toolName} 结果：\n${result}`,
  )
}

const NON_ANSWER_BLOCK_TYPES = new Set([
  'thinking',
  'reasoning',
  'reasoning_content',
  'thought',
  'redacted_thinking',
])

const THINK_TAG_RE = /<(think(?:ing)?|reasoning)\b[^>]*>([\s\S]*?)<\/\1>/gi

export interface AssistantPayload {
  text: string
  thinking: string
}

export function collectPlainText(value: unknown): string {
  return splitAssistantValue(value).text
}

export function splitAssistantPayload(raw: string): AssistantPayload {
  return splitAssistantText(raw)
}

function splitAssistantValue(value: unknown): AssistantPayload {
  if (typeof value === 'string') {
    return splitAssistantText(value)
  }
  if (Array.isArray(value)) {
    return joinPayloads(value.map(splitAssistantValue))
  }
  const record = asRecord(value)
  if (!record) {
    return emptyPayload()
  }
  if (typeof record.type === 'string' && isThinkingType(record.type)) {
    return { text: '', thinking: thinkingBody(record) }
  }
  const extras: AssistantPayload[] = []
  const reasoning = fieldText(record.reasoning_content) || fieldText(record.reasoning)
  const thinkingField = fieldText(record.thinking)
  if (reasoning) {
    extras.push({ text: '', thinking: reasoning })
  }
  if (thinkingField && record.type !== 'text') {
    extras.push({ text: '', thinking: thinkingField })
  }
  if (typeof record.text === 'string' && (!record.type || record.type === 'text')) {
    extras.push(splitAssistantText(record.text))
    return joinPayloads(extras)
  }
  if ('content' in record) {
    extras.push(splitAssistantValue(record.content))
    return joinPayloads(extras)
  }
  if ('message' in record) {
    extras.push(splitAssistantValue(record.message))
    return joinPayloads(extras)
  }
  return joinPayloads(extras)
}

export interface DshPromptResult {
  text: string
  thinking?: string
}

function emptyPayload(): AssistantPayload {
  return { text: '', thinking: '' }
}

function fieldText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isThinkingType(type: string): boolean {
  if (NON_ANSWER_BLOCK_TYPES.has(type)) {
    return true
  }
  const last = type.split(/[/._-]/).pop()?.toLowerCase() ?? type
  return NON_ANSWER_BLOCK_TYPES.has(last)
}

function thinkingBody(record: Record<string, unknown>): string {
  if (typeof record.text === 'string' && record.text.trim()) {
    return record.text.trim()
  }
  const nested = splitAssistantValue(record.content)
  return (nested.thinking || nested.text).trim()
}

function joinThinking(values: readonly string[]): string {
  const seen = new Set<string>()
  const parts: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) {
      continue
    }
    seen.add(trimmed)
    parts.push(trimmed)
  }
  return parts.join('\n\n')
}

function joinPayloads(parts: readonly AssistantPayload[]): AssistantPayload {
  return {
    text: parts
      .map((part) => part.text)
      .filter((part) => part.trim())
      .join(''),
    thinking: joinThinking(parts.map((part) => part.thinking)),
  }
}

function peelThinkTags(raw: string): AssistantPayload {
  const thinking: string[] = []
  const text = raw.replace(new RegExp(THINK_TAG_RE.source, 'gi'), (_match, _tag: string, body: string) => {
    thinking.push(String(body).trim())
    return '\n'
  })
  return {
    text: text.replace(/\n{3,}/g, '\n\n').trim(),
    thinking: joinThinking(thinking),
  }
}

const CJK_RE = /[\u3400-\u9fff]/
const LATIN_LINE_RE = /^[\t\x20-\x7e]*$/

function peelLeadingLatinReasoning(raw: string): AssistantPayload {
  const trimmed = raw.trim()
  if (!CJK_RE.test(trimmed) || trimmed.startsWith('{')) {
    return { text: trimmed, thinking: '' }
  }
  const lines = trimmed.split('\n')
  let cut = 0
  let latinChars = 0
  for (let index = 0; index < lines.length; index += 1) {
    const stripped = (lines[index] ?? '').trim()
    if (!stripped) {
      cut = index + 1
      continue
    }
    if (CJK_RE.test(stripped) || !LATIN_LINE_RE.test(stripped) || !/[A-Za-z]/.test(stripped)) {
      break
    }
    latinChars += stripped.length
    cut = index + 1
  }
  if (cut <= 0 || cut >= lines.length || latinChars < 40) {
    return { text: trimmed, thinking: '' }
  }
  const thinking = lines.slice(0, cut).join('\n').trim()
  const text = lines.slice(cut).join('\n').trim()
  if (!text) {
    return { text: trimmed, thinking: '' }
  }
  return { text, thinking }
}

function splitAssistantText(raw: string): AssistantPayload {
  const tagged = peelThinkTags(raw)
  const peeled = peelLeadingLatinReasoning(tagged.text)
  return {
    text: peeled.text,
    thinking: joinThinking([tagged.thinking, peeled.thinking]),
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  return value as Record<string, unknown>
}

function firstAnswer(parts: readonly AssistantPayload[]): string {
  for (const part of parts) {
    if (part.text.trim()) {
      return part.text
    }
  }
  return ''
}

/**
 * dsh 0.1.5 的 assistant/message 正文在 `data.message.content`。
 * 旧测试夹具仍可能把 content 直接放在 data 上。
 */
export function assistantPayload(event: Record<string, unknown>): AssistantPayload {
  const type = typeof event.type === 'string' ? event.type : ''
  if (isThinkingType(type)) {
    const nested = splitAssistantValue(event.data ?? event.content ?? event)
    return { text: '', thinking: joinThinking([nested.thinking, nested.text]) }
  }
  if (type !== 'assistant/message') {
    return emptyPayload()
  }
  const data = asRecord(event.data)
  const parts: AssistantPayload[] = []
  if (data) {
    if (data.message != null) {
      parts.push(splitAssistantValue(data.message))
    } else {
      parts.push(splitAssistantValue(data.content))
      parts.push(splitAssistantValue(data.text))
    }
    const reasoning = fieldText(data.reasoning_content) || fieldText(data.reasoning)
    if (reasoning) {
      parts.push({ text: '', thinking: reasoning })
    }
  }
  parts.push(splitAssistantValue(event.content))
  return {
    text: firstAnswer(parts),
    thinking: joinThinking(parts.map((part) => part.thinking)),
  }
}

export function assistantPlainText(event: Record<string, unknown>): string {
  return assistantPayload(event).text
}

export function toolResultPlainText(event: Record<string, unknown>): string {
  if (event.type !== 'tool/result') {
    return ''
  }
  const data = asRecord(event.data)
  if (!data) {
    return ''
  }
  return collectPlainText(asRecord(data.message)?.content ?? data.message)
}

export function isTurnEndEvent(event: Record<string, unknown>): boolean {
  return event.type === 'turn/end'
}

export function turnEndFailure(event: Record<string, unknown>): string | null {
  if (!isTurnEndEvent(event)) {
    return null
  }
  const reason = asRecord(asRecord(event.data)?.reason)
  if (!reason) {
    return null
  }
  const kind = reason.kind
  if (kind === 'error') {
    const error = asRecord(reason.error)
    if (typeof error?.message === 'string' && error.message.trim()) {
      return error.message
    }
    return '模型调用失败。'
  }
  if (kind === 'blocked') {
    return '这一轮被拦住了。'
  }
  return null
}

export class DshTurnCollector {
  readonly sessionId: string
  assistant = ''
  thinking = ''
  tools = ''
  failure: string | null = null
  finished = false
  private sawRunning = false

  constructor(sessionId: string) {
    this.sessionId = sessionId
  }

  result(): DshPromptResult {
    const text = this.assistant.trim() || this.tools.trim()
    const thinking = this.assistant.trim() ? this.thinking.trim() : ''
    return thinking ? { text, thinking } : { text }
  }

  reply(): string {
    return this.result().text
  }

  push(frame: DshJsonRpcFrame): void {
    if (this.finished) {
      return
    }
    if (frame.method === 'session.event') {
      const params = asRecord(frame.params)
      if (!params || params.sessionId !== this.sessionId) {
        return
      }
      const event = asRecord(params.event)
      if (!event) {
        return
      }
      const payload = assistantPayload(event)
      if (payload.thinking.trim()) {
        this.thinking = payload.thinking
      }
      if (payload.text.trim()) {
        this.assistant = payload.text
      }
      const toolText = toolResultPlainText(event)
      if (toolText.trim()) {
        this.tools = this.tools ? `${this.tools}\n${toolText}` : toolText
      }
      const failure = turnEndFailure(event)
      if (failure) {
        this.failure = failure
      }
      if (isTurnEndEvent(event)) {
        this.finished = true
      }
      return
    }
    if (frame.method === 'session.status') {
      const params = asRecord(frame.params)
      if (params?.sessionId !== this.sessionId) {
        return
      }
      if (params.status === 'running') {
        this.sawRunning = true
        return
      }
      // 新建 session 会先发 idle；要等见过 running，才把 idle 当回合结束。
      if (params.status === 'idle' && this.sawRunning) {
        this.finished = true
      }
    }
  }
}
