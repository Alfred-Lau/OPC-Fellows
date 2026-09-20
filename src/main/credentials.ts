import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { app, safeStorage } from 'electron'
import {
  maskDeepSeekApiKey,
  MIN_DEEPSEEK_API_KEY_LENGTH,
  resolveLlmApiKey,
  type LlmKeyResult,
  type LlmSettings,
} from '../shared/deepseek'
import { resolveLlmRuntime, type ResolvedLlm } from '../shared/llm-overlay'

interface StoredApiKey {
  encrypted?: string
  plain?: string
}

interface LlmFile {
  apiKey: StoredApiKey | null
}

const store: LlmFile = { apiKey: null }
let loaded = false

export function llmStorePath(): string {
  return join(app.getPath('userData'), 'llm.json')
}

export function loadLlmCredentials(): void {
  loaded = true
  try {
    const path = llmStorePath()
    if (!existsSync(path)) {
      store.apiKey = null
      return
    }
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object') {
      store.apiKey = null
      return
    }
    const record = parsed as Partial<LlmFile>
    store.apiKey = isStoredApiKey(record.apiKey) ? record.apiKey : null
  } catch {
    store.apiKey = null
  }
}

export function readDeepSeekApiKey(): string | null {
  return resolveDeepSeekApiKey().key
}

export function llmSettings(): LlmSettings {
  const resolved = resolveDeepSeekApiKey()
  return {
    hasApiKey: Boolean(resolved.key),
    keyPreview: maskDeepSeekApiKey(resolved.key),
    keySource: resolved.source,
  }
}

export function setDeepSeekApiKey(raw: string | null): LlmKeyResult {
  ensureLoaded()
  const key = (raw ?? '').trim()
  if (!key) {
    store.apiKey = null
    persist()
    return { ok: true, settings: llmSettings() }
  }
  if (key.length < MIN_DEEPSEEK_API_KEY_LENGTH) {
    return {
      ok: false,
      error: 'API Key 太短，请粘贴完整的 DeepSeek Key。',
      settings: llmSettings(),
    }
  }
  if (safeStorage.isEncryptionAvailable()) {
    store.apiKey = { encrypted: safeStorage.encryptString(key).toString('base64') }
  } else {
    store.apiKey = { plain: key }
  }
  persist()
  return { ok: true, settings: llmSettings() }
}

/** 给 SDK 进程 / dsh CLI 带上工作台这份 key，不再要求去 Harness 里另填。 */
export function withDeepSeekApiKey(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const next = { ...env }
  const runtime = resolveActiveLlm()
  if (runtime.apiKey) {
    next.DEEPSEEK_API_KEY = runtime.apiKey
  }
  return next
}

export function withLlmEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return withDeepSeekApiKey(env)
}

export function resolveActiveLlm(): ResolvedLlm {
  const resolved = resolveDeepSeekApiKey()
  return resolveLlmRuntime({
    apiKey: resolved.key,
    keySource: resolved.source,
    env: process.env,
  })
}

function resolveDeepSeekApiKey(): ReturnType<typeof resolveLlmApiKey> {
  ensureLoaded()
  return resolveLlmApiKey({
    env: process.env.DEEPSEEK_API_KEY,
    stored: storedKey(),
    legacy: legacyKey(),
  })
}

function ensureLoaded(): void {
  if (!loaded) {
    loadLlmCredentials()
  }
}

function storedKey(): string | null {
  const stored = store.apiKey
  if (!stored) {
    return null
  }
  if (stored.encrypted) {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        return null
      }
      return clean(safeStorage.decryptString(Buffer.from(stored.encrypted, 'base64')))
    } catch {
      return null
    }
  }
  return clean(stored.plain)
}

function legacyKey(): string | null {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const fromDotEnv = readKeyFromText(readIfExists(join(home, '.env')), /(?:^|\n)\s*DEEPSEEK_API_KEY\s*=\s*(.+)/)
  if (fromDotEnv) {
    return fromDotEnv
  }
  return readKeyFromText(
    readIfExists(join(home, '.credentials.yaml')),
    /DEEPSEEK_API_KEY:\s*['"]?([^\s'"]+)/,
  )
}

function persist(): void {
  const path = llmStorePath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`)
}

function isStoredApiKey(value: unknown): value is StoredApiKey {
  if (!value || typeof value !== 'object') {
    return false
  }
  const item = value as StoredApiKey
  return typeof item.encrypted === 'string' || typeof item.plain === 'string'
}

function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

function readKeyFromText(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern)
  return match ? clean(match[1]) : null
}

function clean(value: string | undefined): string | null {
  const next = value?.trim().replace(/^['"]|['"]$/g, '')
  return next ? next : null
}
