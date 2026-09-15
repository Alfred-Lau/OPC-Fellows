/** DeepSeek Chat Completions 当前默认模型：V4.1 Flash。 */
export const DEEPSEEK_MODEL = 'deepseek-flash'

export const DEEPSEEK_MODEL_LABEL = 'DeepSeek V4.1 Flash'

/** 本机填写时最短长度；环境变量和遗留配置仍按原样采用。 */
export const MIN_DEEPSEEK_API_KEY_LENGTH = 8

export const MISSING_LLM_KEY_HINT = '可在设置 → 模型里填写，或设置 DEEPSEEK_API_KEY。'

export type LlmKeySource = 'env' | 'stored' | 'legacy' | 'none'

export interface LlmSettings {
  hasApiKey: boolean
  keyPreview: string
  keySource: LlmKeySource
}

export interface LlmKeyResult {
  ok: boolean
  error?: string
  settings: LlmSettings
}

export function resolveLlmApiKey(input: {
  env?: string | null
  stored?: string | null
  legacy?: string | null
}): { key: string | null; source: LlmKeySource } {
  const env = input.env?.trim()
  if (env) {
    return { key: env, source: 'env' }
  }
  const stored = input.stored?.trim()
  if (stored) {
    return { key: stored, source: 'stored' }
  }
  const legacy = input.legacy?.trim()
  if (legacy) {
    return { key: legacy, source: 'legacy' }
  }
  return { key: null, source: 'none' }
}

export function maskDeepSeekApiKey(apiKey: string | null | undefined): string {
  const key = (apiKey ?? '').trim()
  if (!key) {
    return ''
  }
  const tail = key.slice(-4)
  return key.startsWith('sk-') ? `sk-…${tail}` : `…${tail}`
}

export function describeLlmKeyStatus(settings: LlmSettings): string {
  switch (settings.keySource) {
    case 'env':
      return `已配置 ${settings.keyPreview}（来自环境变量 DEEPSEEK_API_KEY）`
    case 'stored':
      return `已配置 ${settings.keyPreview}（本机加密存储）`
    case 'legacy':
      return `已配置 ${settings.keyPreview}（来自 DeepSeek Harness 遗留配置，建议改存到这里）`
    case 'none':
      return '未配置。到 platform.deepseek.com 复制一把 API Key。'
    default: {
      const _exhaustive: never = settings.keySource
      return _exhaustive
    }
  }
}
