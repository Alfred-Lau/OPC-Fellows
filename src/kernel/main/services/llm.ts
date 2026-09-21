import { Service, type Context } from '@deepseek-ai/cordis'
import {
  loadLlmCredentials,
  llmSettings,
  readDeepSeekApiKey,
  resolveActiveLlm,
  setDeepSeekApiKey,
} from '../../../main/credentials'
import { MISSING_LLM_KEY_HINT } from '../../../shared/deepseek'
import { dshSdkCall, llmCompletionsUrl } from '../../../shared/llm-overlay'
import { completeViaOfficialLlm, type OfficialLlmRuntime } from '../../shared/official-llm'

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

/** 主进程里拆解 / 弹药 / 润色走同一条 complete，不再各自 fetch。 */
export function kernelLlm(): LlmService | null {
  return active
}

/**
 * 待办拆解和职业 LLM 润色的 Completions 出口。
 * 中栏对话与只读子调研走 dsh SDK session，不再另开 Agent 循环。
 */
export class LlmService extends Service {
  static inject = ['bridge']

  constructor(ctx: Context) {
    super(ctx, 'completions')
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
    const runtime = resolveActiveLlm()
    const official = await completeViaOfficialLlm(this.ctx.get('llm') as OfficialLlmRuntime | undefined, {
      ...dshSdkCall(runtime),
      system: input.system,
      messages,
      temperature: input.temperature,
      json: input.json,
      signal,
    })
    if (official) {
      return official
    }
    const response = await fetch(llmCompletionsUrl(runtime.apiUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: runtime.model,
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
    completions: LlmService
  }
}
