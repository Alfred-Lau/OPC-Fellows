import type { DecomposeInput, DecomposeResult, DraftTodo } from '../shared/todo'
import { kernelLlm } from '../kernel/main/services/llm'
import { MISSING_LLM_KEY_HINT } from '../shared/deepseek'
import { parseNotifyAt, toIsoLocal } from './time'

const SPLIT = /(?:\n+|。|；|;|！|!|顺便|以及|还有|然后|并且|接着)+/

export async function decomposeTodos(input: DecomposeInput): Promise<DecomposeResult> {
  const text = input.text.trim()
  if (!text) {
    return { items: [], usedModel: false, fallbackReason: '请先输入要拆解的内容。' }
  }

  const defaultNotifyAt = normalizeDefault(input.defaultNotifyAt)
  try {
    const items = await decomposeWithModel(text, defaultNotifyAt)
    if (items.length > 0) {
      return { items, usedModel: true }
    }
  } catch (error) {
    return {
      items: decomposeLocally(text, defaultNotifyAt),
      usedModel: false,
      fallbackReason: error instanceof Error ? error.message : '模型拆解失败，已按语句拆解。',
    }
  }

  return { items: decomposeLocally(text, defaultNotifyAt), usedModel: false }
}

export function decomposeLocally(text: string, defaultNotifyAt: string | null = null): DraftTodo[] {
  const globalTime = parseNotifyAt(text)
  const parts = text
    .split(SPLIT)
    .map((part) => part.replace(/^[\s、，,]+|[\s、，,]+$/g, '').replace(/^\d+[\.、\)）]\s*/, ''))
    .filter((part) => part.length >= 2 && !isTimeOnly(part))

  const unique = parts.length > 0 ? parts : [text.trim()]
  return unique.map((title) => {
    const localTime = parseNotifyAt(title)
    const notifyAt = localTime
      ? toIsoLocal(localTime)
      : globalTime
        ? toIsoLocal(globalTime)
        : defaultNotifyAt
    return { title: cleanTitle(title), notifyAt }
  })
}

function normalizeDefault(value?: string | null): string | null {
  if (!value) {
    return null
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : toIsoLocal(date)
}

function isTimeOnly(text: string): boolean {
  return /^(今天|明天|后天|今晚|周[一二三四五六日天]|星期[一二三四五六日天]|上午|下午|晚上)?\s*\d{0,2}[:：点]?\d{0,2}\s*(提醒我|提醒)?$/.test(
    text.trim(),
  )
}

function cleanTitle(title: string): string {
  return title
    .replace(/^(请|帮我|麻烦|记得)?(在|于)?(今天|明天|后天|今晚|周[一二三四五六日天]|星期[一二三四五六日天])?(上午|下午|晚上|中午)?\s*\d{0,2}[:：点]?\d{0,2}\s*(之前|前|时)?(提醒我|提醒)?/, '')
    .replace(/^(把|将)/, '')
    .trim() || title.trim()
}

async function decomposeWithModel(text: string, defaultNotifyAt: string | null): Promise<DraftTodo[]> {
  const llm = kernelLlm()
  if (!llm?.hasKey()) {
    throw new Error(`未找到 DeepSeek API Key，已按语句拆解。${MISSING_LLM_KEY_HINT}`)
  }

  const now = new Date()
  const content = await llm.complete({
    system: [
      '你把用户输入拆成可执行的待办。只输出 JSON 数组，不要 Markdown。',
      '每项：{"title":"简短动词开头","note":"可选","notifyAt":"本地 ISO 或 null"}',
      `现在是 ${toIsoLocal(now)}，时区 Asia/Shanghai。`,
      '识别今天/明天/周五/X点/X分钟后等到点提醒；没有时间则 notifyAt 为 null。',
      '不要发明用户没说的任务，一条只做一件事。',
    ].join('\n'),
    messages: [{ role: 'user', content: text }],
    temperature: 0.2,
    timeoutMs: 20_000,
  })
  const parsed = parseModelItems(content, defaultNotifyAt)
  if (parsed.length === 0) {
    throw new Error('模型没有返回可用待办，已按语句拆解。')
  }
  return parsed
}

function parseModelItems(content: string, defaultNotifyAt: string | null): DraftTodo[] {
  const json = content.replace(/```json|```/g, '').trim()
  const start = json.indexOf('[')
  const end = json.lastIndexOf(']')
  if (start < 0 || end < 0) {
    return []
  }

  const raw = JSON.parse(json.slice(start, end + 1)) as unknown
  if (!Array.isArray(raw)) {
    return []
  }

  return raw.flatMap((row) => {
    if (!row || typeof row !== 'object') {
      return []
    }
    const record = row as { title?: unknown; note?: unknown; notifyAt?: unknown }
    const title = typeof record.title === 'string' ? record.title.trim() : ''
    if (!title) {
      return []
    }
    const note = typeof record.note === 'string' ? record.note.trim() : undefined
    const notifyAt = resolveModelTime(record.notifyAt) ?? defaultNotifyAt
    return [{ title, note: note || undefined, notifyAt }]
  })
}

function resolveModelTime(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || value === 'null') {
    return null
  }
  const parsed = parseNotifyAt(value) ?? new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : toIsoLocal(parsed)
}
