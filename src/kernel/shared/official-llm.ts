/**
 * 分类 / 拆解 / 润色优先走官方 ctx.llm.stream。
 * 没有适配器或流失败时，调用方再退回 Completions fetch。
 */

export interface OfficialLlmStreamChunk {
  type?: string
  text?: string
  reason?: string
}

export interface OfficialLlmRuntime {
  stream?: (options: {
    provider: string
    model: string
    system?: string
    messages: Array<{ role: string; content: string }>
    temperature?: number
    signal?: AbortSignal
  }) => AsyncIterable<OfficialLlmStreamChunk>
}

export function officialLlmSystem(system: string, json?: boolean): string {
  if (!json) {
    return system
  }
  if (/只输出 JSON/.test(system)) {
    return system
  }
  return `${system}\n只输出 JSON，不要 Markdown。`
}

export function collectOfficialLlmText(chunks: readonly OfficialLlmStreamChunk[]): string | undefined {
  const parts: string[] = []
  for (const chunk of chunks) {
    if (chunk.type === 'finish' && (chunk.reason === 'error' || chunk.reason === 'aborted')) {
      return undefined
    }
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
      parts.push(chunk.text)
    }
  }
  const text = parts.join('').trim()
  return text || undefined
}

export async function completeViaOfficialLlm(
  llm: OfficialLlmRuntime | undefined,
  input: {
    provider: string
    model: string
    system: string
    messages: readonly { role: 'user' | 'assistant'; content: string }[]
    temperature?: number
    json?: boolean
    signal?: AbortSignal
  },
): Promise<string | undefined> {
  if (!llm || typeof llm.stream !== 'function') {
    return undefined
  }
  try {
    const chunks: OfficialLlmStreamChunk[] = []
    for await (const chunk of llm.stream({
      provider: input.provider,
      model: input.model,
      system: officialLlmSystem(input.system, input.json),
      messages: [...input.messages],
      temperature: input.temperature,
      signal: input.signal,
    })) {
      chunks.push(chunk)
    }
    return collectOfficialLlmText(chunks)
  } catch {
    return undefined
  }
}
