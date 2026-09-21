import { DEEPSEEK_MODEL, DEEPSEEK_MODEL_LABEL, type LlmKeySource } from './deepseek.ts'

/** SDK initialize 只认已挂上的适配器；自定义网关也接到这条路由，不另开提供方。 */
export const DEEPSEEK_PROVIDER = 'deepseek-official'
export const DEFAULT_DEEPSEEK_URL = 'https://api.deepseek.com'

export interface ResolvedLlm {
  provider: string
  apiKey: string | null
  apiUrl: string
  model: string
  modelLabel: string
  keySource: LlmKeySource
}

export function stripLlmUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').replace(/\/chat\/completions$/i, '')
}

export function llmCompletionsUrl(apiUrl: string): string {
  return `${stripLlmUrl(apiUrl)}/chat/completions`
}

export function resolveLlmRuntime(input: {
  apiKey?: string | null
  keySource?: LlmKeySource
  env?: Record<string, string | undefined>
  model?: string | null
  apiUrl?: string | null
}): ResolvedLlm {
  const env = input.env ?? {}
  const apiUrl = stripLlmUrl(unquote(input.apiUrl) || unquote(env.DEEPSEEK_API_URL) || DEFAULT_DEEPSEEK_URL)
  const model = unquote(input.model) || unquote(env.DEEPSEEK_MODEL) || DEEPSEEK_MODEL
  return {
    provider: DEEPSEEK_PROVIDER,
    apiKey: input.apiKey?.trim() || null,
    apiUrl,
    model,
    modelLabel: model === DEEPSEEK_MODEL ? DEEPSEEK_MODEL_LABEL : model,
    keySource: input.keySource ?? 'none',
  }
}

export function dshSdkCall(runtime: Pick<ResolvedLlm, 'model'>): { provider: string; model: string } {
  return {
    provider: DEEPSEEK_PROVIDER,
    model: runtime.model,
  }
}

export function llmOverlayYaml(runtime: Pick<ResolvedLlm, 'apiUrl' | 'model' | 'modelLabel'>): string | null {
  if (usesBuiltInDeepSeek(runtime)) {
    return null
  }
  return openaiCompatOverlayYaml(runtime)
}

/** 给 desktop boot / opc `--patch`：把 OpenAI 兼容网关接到 dsh `llm-deepseek` 上。 */
export function openaiCompatOverlayYaml(
  runtime: Pick<ResolvedLlm, 'apiUrl' | 'model' | 'modelLabel'>,
): string {
  const baseURL = JSON.stringify(stripLlmUrl(runtime.apiUrl))
  const model = JSON.stringify(runtime.model)
  const name = JSON.stringify(runtime.modelLabel)
  return [
    '# generated overlay; do not edit',
    '- id: llm-deepseek',
    '  config:',
    '    apiKeyEnv: DEEPSEEK_API_KEY',
    `    baseURL: ${baseURL}`,
    '    thinking: disabled',
    '    reasoningEffort: off',
    '    models:',
    `      - id: ${model}`,
    `        name: ${name}`,
    '        contextWindow: 131072',
    '        maxTokens: 8192',
    '- id: agent-default-model',
    '  config:',
    `    provider: ${DEEPSEEK_PROVIDER}`,
    `    model: ${model}`,
    '',
  ].join('\n')
}

function usesBuiltInDeepSeek(runtime: Pick<ResolvedLlm, 'apiUrl' | 'model'>): boolean {
  return stripLlmUrl(runtime.apiUrl) === DEFAULT_DEEPSEEK_URL && runtime.model === DEEPSEEK_MODEL
}

function unquote(value: string | null | undefined): string {
  return value?.trim().replace(/^['"]|['"]$/g, '') ?? ''
}
