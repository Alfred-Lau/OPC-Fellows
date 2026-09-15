import { Service, type Context } from '@deepseek-ai/cordis'
import {
  loadLlmCredentials,
  llmSettings,
  readDeepSeekApiKey,
  setDeepSeekApiKey,
} from '../../../main/credentials'
import { DEEPSEEK_MODEL, MISSING_LLM_KEY_HINT } from '../../../shared/deepseek'

export interface LlmTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface LlmCompleteInput {
  system: string
  messages: readonly LlmTurn[]
  temperature?: number
  json?: boolean
  timeoutMs?: number
  signal?: AbortSignal
}

let active: LlmService | null = null

/** 主进程里选品 / 拆解 / 弹药 / 公众号走同一条 complete，不再各自 fetch。 */
export function kernelLlm(): LlmService | null {
  return active
}

/**
 * 分类器、待办拆解和职业 LLM 润色的唯一 Completions 出口。
 * 中栏闲聊仍走 dsh SDK session。
 */
export class LlmService extends Service {
  static inject = ['bridge']

  constructor(ctx: Context) {
    super(ctx, 'llm')
    active = this
    loadLlmCredentials()
    ctx.bridge.handle('llm:settings', () => llmSettings())
    ctx.bridge.handle('llm:set-api-key', (_event, raw: unknown) => {
      const key = typeof raw === 'string' ? raw : null
      return setDeepSeekApiKey(key)
    })
    ctx.effect(() => () => {
      if (active === this) {
        active = null
      }
    }, 'llm.unbind')
  }

  hasKey(): boolean {
    return Boolean(readDeepSeekApiKey())
  }

  async complete(input: LlmCompleteInput): Promise<string> {
    const apiKey = readDeepSeekApiKey()
    if (!apiKey) {
      throw new Error(`未找到 DeepSeek API Key。${MISSING_LLM_KEY_HINT}`)
    }
    const messages = input.messages.filter((turn) => turn.content.trim())
    if (messages.length === 0) {
      throw new Error('没有可发送的对话内容。')
    }

    const timeout = AbortSignal.timeout(input.timeoutMs ?? 45_000)
    const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        temperature: input.temperature ?? 0.7,
        ...(input.json ? { response_format: { type: 'json_object' } } : {}),
        messages: [{ role: 'system', content: input.system }, ...messages],
      }),
      signal,
    })

    if (!response.ok) {
      throw new Error(`模型接口返回 ${String(response.status)}。`)
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = payload.choices?.[0]?.message?.content?.trim()
    if (!content) {
      throw new Error('模型没有返回内容。')
    }
    return content
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    llm: LlmService
  }
}
