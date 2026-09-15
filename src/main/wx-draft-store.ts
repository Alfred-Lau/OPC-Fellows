import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, safeStorage } from 'electron'
import {
  DEFAULT_AUTHOR,
  DEFAULT_WORKFLOW_ID,
  maskSecret,
  type WxDraftChannel,
  type WxDraftRecord,
  type WxDraftSettingsInput,
  type WxDraftSettingsView,
  type WxDraftState,
} from '../shared/wx-draft'

const MAX_RECORDS = 50

type SecretBox = { encrypted: string } | { plain: string } | null

const store: WxDraftState = {
  settings: {
    workflowId: DEFAULT_WORKFLOW_ID,
    defaultAuthor: DEFAULT_AUTHOR,
    appid: '',
    needOpenComment: 0,
    onlyFansCanComment: 0,
    channel: 'direct',
    cozeToken: null,
    wxSecret: null,
  },
  records: [],
}

export function wxDraftStorePath(): string {
  return join(app.getPath('userData'), 'wx-draft.json')
}

export function loadWxDraft(): void {
  const path = wxDraftStorePath()
  if (!existsSync(path)) {
    return
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<WxDraftState>
    const settings = parsed.settings
    if (settings) {
      store.settings = {
        workflowId: typeof settings.workflowId === 'string' ? settings.workflowId : DEFAULT_WORKFLOW_ID,
        defaultAuthor: typeof settings.defaultAuthor === 'string' ? settings.defaultAuthor : DEFAULT_AUTHOR,
        appid: typeof settings.appid === 'string' ? settings.appid : '',
        needOpenComment: settings.needOpenComment === 1 ? 1 : 0,
        onlyFansCanComment: settings.onlyFansCanComment === 1 ? 1 : 0,
        channel: settings.channel === 'coze' ? 'coze' : 'direct',
        cozeToken: isSecretBox(settings.cozeToken) ? settings.cozeToken : null,
        wxSecret: isSecretBox(settings.wxSecret) ? settings.wxSecret : null,
      }
    }
    store.records = Array.isArray(parsed.records) ? parsed.records.filter(isRecord).slice(0, MAX_RECORDS) : []
  } catch {
    // 损坏的存档不影响启动，保留默认空状态。
  }
}

// —— 敏感信息 ——

function encryptSecret(raw: string): SecretBox {
  if (safeStorage.isEncryptionAvailable()) {
    return { encrypted: safeStorage.encryptString(raw).toString('base64') }
  }
  return { plain: raw }
}

function decryptSecret(box: SecretBox | undefined | null): string {
  if (!box) {
    return ''
  }
  if ('encrypted' in box) {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(box.encrypted, 'base64')).trim()
      }
    } catch {
      return ''
    }
    return ''
  }
  return (box.plain ?? '').trim()
}

/** 扣子 PAT：环境变量 COZE_TOKEN 优先，否则读本地加密存储。 */
export function resolveCozeToken(): string {
  return process.env.COZE_TOKEN?.trim() || decryptSecret(store.settings.cozeToken)
}

/** 公众号 AppSecret：环境变量 WX_APP_SECRET 优先。 */
export function resolveWxSecret(): string {
  return process.env.WX_APP_SECRET?.trim() || decryptSecret(store.settings.wxSecret)
}

/** 公众号 AppID：环境变量 WX_APPID 优先，否则用设置里的值。 */
export function resolveAppid(): string {
  return process.env.WX_APPID?.trim() || store.settings.appid.trim()
}

export function workflowId(): string {
  return store.settings.workflowId.trim()
}

export function draftChannel(): WxDraftChannel {
  return store.settings.channel
}

export function defaultAuthor(): string {
  return store.settings.defaultAuthor.trim() || DEFAULT_AUTHOR
}

// —— 设置读写 ——

function applySecret(current: SecretBox | undefined, next: string | null | undefined): SecretBox | undefined {
  if (next === undefined || next === '') {
    return current
  }
  if (next === null) {
    return null
  }
  return encryptSecret(next.trim())
}

export function saveWxDraftSettings(input: WxDraftSettingsInput): WxDraftSettingsView {
  const s = store.settings
  if (input.workflowId !== undefined) {
    s.workflowId = input.workflowId.trim()
  }
  if (input.defaultAuthor !== undefined) {
    s.defaultAuthor = input.defaultAuthor.trim()
  }
  if (input.appid !== undefined) {
    s.appid = input.appid.trim()
  }
  if (input.needOpenComment !== undefined) {
    s.needOpenComment = input.needOpenComment === 1 ? 1 : 0
  }
  if (input.onlyFansCanComment !== undefined) {
    s.onlyFansCanComment = input.onlyFansCanComment === 1 ? 1 : 0
  }
  if (typeof input.channel === 'string' && (input.channel === 'direct' || input.channel === 'coze')) {
    s.channel = input.channel
  }
  s.cozeToken = applySecret(s.cozeToken, input.cozeToken)
  s.wxSecret = applySecret(s.wxSecret, input.wxSecret)
  persist()
  return wxDraftSettingsView()
}

export function wxDraftSettingsView(): WxDraftSettingsView {
  const token = resolveCozeToken()
  const secret = resolveWxSecret()
  return {
    workflowId: workflowId(),
    defaultAuthor: defaultAuthor(),
    appid: resolveAppid(),
    needOpenComment: store.settings.needOpenComment,
    onlyFansCanComment: store.settings.onlyFansCanComment,
    channel: draftChannel(),
    hasCozeToken: Boolean(token),
    cozeTokenPreview: maskSecret(token),
    hasWxSecret: Boolean(secret),
    wxSecretPreview: maskSecret(secret),
  }
}

// —— 历史记录 ——

export function listRecords(): WxDraftRecord[] {
  return [...store.records].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

export function addRecord(record: WxDraftRecord): WxDraftRecord[] {
  store.records = [record, ...store.records].slice(0, MAX_RECORDS)
  persist()
  return listRecords()
}

export function removeRecord(id: string): boolean {
  const before = store.records.length
  store.records = store.records.filter((record) => record.id !== id)
  if (store.records.length === before) {
    return false
  }
  persist()
  return true
}

function persist(): void {
  const path = wxDraftStorePath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(store, null, 2))
}

function isSecretBox(value: unknown): value is NonNullable<SecretBox> {
  if (!value || typeof value !== 'object') {
    return false
  }
  const box = value as Record<string, unknown>
  return typeof box.encrypted === 'string' || typeof box.plain === 'string'
}

function isRecord(value: unknown): value is WxDraftRecord {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as WxDraftRecord
  return (
    typeof record.id === 'string' &&
    typeof record.title === 'string' &&
    typeof record.createdAt === 'string' &&
    (record.status === 'success' || record.status === 'failed')
  )
}
