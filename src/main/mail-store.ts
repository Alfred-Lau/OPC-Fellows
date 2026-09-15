import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, safeStorage } from 'electron'
import {
  defaultMailLabel,
  emptyMailState,
  mailProviderOf,
  normalizeWatchedSender,
  type MailAccount,
  type MailAccountView,
  type MailDraft,
  type MailLocalCoverage,
  type MailMessage,
  type MailProvider,
  type MailState,
} from '../shared/mail'

type SecretBox = { encrypted: string } | { plain: string }

interface StoredAccount extends MailAccount {
  secret?: SecretBox | null
}

interface MailStoreFile {
  accounts: StoredAccount[]
  messages: MailMessage[]
  drafts: MailDraft[]
  watchedSenders?: string[]
  lastSyncAt?: string
}

const MAX_MESSAGES = 400
const MAX_DRAFTS = 80

const store: {
  accounts: StoredAccount[]
  messages: MailMessage[]
  drafts: MailDraft[]
  watchedSenders: string[]
  local: MailLocalCoverage
  lastSyncAt: string
  lastError?: string
} = {
  accounts: [],
  messages: [],
  drafts: [],
  watchedSenders: [],
  local: { available: false, accounts: [] },
  lastSyncAt: '',
}

export function mailStorePath(): string {
  return join(app.getPath('userData'), 'mail.json')
}

export function loadMail(): void {
  const path = mailStorePath()
  if (!existsSync(path)) {
    return
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<MailStoreFile>
    store.accounts = Array.isArray(parsed.accounts) ? parsed.accounts.filter(isStoredAccount) : []
    store.messages = Array.isArray(parsed.messages) ? parsed.messages.filter(isMessage).slice(0, MAX_MESSAGES) : []
    store.drafts = Array.isArray(parsed.drafts) ? parsed.drafts.filter(isDraft).slice(0, MAX_DRAFTS) : []
    store.watchedSenders = Array.isArray(parsed.watchedSenders)
      ? uniqueSenders(parsed.watchedSenders)
      : []
    store.lastSyncAt = typeof parsed.lastSyncAt === 'string' ? parsed.lastSyncAt : ''
  } catch {
    // 损坏的存档不影响启动
  }
}

export function mailState(): MailState {
  return {
    accounts: store.accounts.map(toView),
    messages: store.messages,
    drafts: store.drafts,
    watchedSenders: store.watchedSenders,
    local: store.local,
    lastSyncAt: store.lastSyncAt,
    lastError: store.lastError,
  }
}

export function listMailAccounts(): StoredAccount[] {
  return store.accounts
}

export function accountPassword(account: StoredAccount): string {
  return decryptSecret(account.secret)
}

export function upsertMailAccount(input: {
  id?: string
  provider: MailProvider
  label?: string
  email?: string
  password?: string
  enabled?: boolean
}): MailState {
  const provider = mailProviderOf(input.provider) ? input.provider : 'gmail'
  const id = input.id?.trim() || crypto.randomUUID()
  const existing = store.accounts.find((item) => item.id === id)
  const email = (input.email ?? existing?.email ?? '').trim()
  const next: StoredAccount = {
    id,
    provider,
    email,
    label: (input.label ?? existing?.label ?? defaultMailLabel(provider, email)).trim(),
    enabled: input.enabled ?? existing?.enabled ?? true,
    lastError: existing?.lastError,
    lastSyncAt: existing?.lastSyncAt,
    secret: existing?.secret ?? null,
  }
  if (input.password !== undefined) {
    next.secret = input.password.trim() ? encryptSecret(input.password.trim()) : null
  }
  store.accounts = existing
    ? store.accounts.map((item) => (item.id === id ? next : item))
    : [...store.accounts, next]
  persist()
  return mailState()
}

export function removeMailAccount(id: string): MailState {
  store.accounts = store.accounts.filter((item) => item.id !== id)
  store.messages = store.messages.filter((item) => item.accountId !== id)
  persist()
  return mailState()
}

export function replaceMailMessages(messages: MailMessage[]): MailState {
  store.messages = messages.slice(0, MAX_MESSAGES)
  store.lastSyncAt = new Date().toISOString()
  persist()
  return mailState()
}

export function patchMailMessage(id: string, patch: Partial<MailMessage>): MailState {
  store.messages = store.messages.map((item) => (item.id === id ? { ...item, ...patch } : item))
  persist()
  return mailState()
}

export function toggleWatchedSender(raw: string, watched?: boolean): MailState {
  const email = normalizeWatchedSender(raw)
  if (!email) {
    return mailState()
  }
  const has = store.watchedSenders.includes(email)
  const next = watched ?? !has
  store.watchedSenders = next
    ? uniqueSenders([...store.watchedSenders, email])
    : store.watchedSenders.filter((item) => item !== email)
  persist()
  return mailState()
}

export function upsertMailDraft(messageId: string, text: string): MailState {
  const now = new Date().toISOString()
  const existing = store.drafts.find((item) => item.messageId === messageId)
  const draft: MailDraft = {
    id: existing?.id ?? crypto.randomUUID(),
    messageId,
    text: text.trim(),
    updatedAt: now,
  }
  store.drafts = existing
    ? store.drafts.map((item) => (item.messageId === messageId ? draft : item))
    : [draft, ...store.drafts].slice(0, MAX_DRAFTS)
  persist()
  return mailState()
}

export function setMailLocal(coverage: MailLocalCoverage): void {
  store.local = coverage
}

export function setAccountSyncMeta(id: string, error?: string): void {
  store.accounts = store.accounts.map((item) =>
    item.id === id ? { ...item, lastError: error, lastSyncAt: new Date().toISOString() } : item,
  )
  persist()
}

export function setMailError(error?: string): MailState {
  store.lastError = error
  return mailState()
}

function persist(): void {
  const path = mailStorePath()
  mkdirSync(dirname(path), { recursive: true })
  const payload: MailStoreFile = {
    accounts: store.accounts,
    messages: store.messages,
    drafts: store.drafts,
    watchedSenders: store.watchedSenders,
    lastSyncAt: store.lastSyncAt,
  }
  writeFileSync(path, JSON.stringify(payload, null, 2))
}

function uniqueSenders(values: readonly unknown[]): string[] {
  const seen = new Set<string>()
  const rows: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') {
      continue
    }
    const email = normalizeWatchedSender(value)
    if (!email || seen.has(email)) {
      continue
    }
    seen.add(email)
    rows.push(email)
  }
  return rows
}

function toView(account: StoredAccount): MailAccountView {
  return {
    id: account.id,
    provider: account.provider,
    label: account.label,
    email: account.email,
    enabled: account.enabled,
    lastError: account.lastError,
    lastSyncAt: account.lastSyncAt,
    hasPassword: Boolean(accountPassword(account)),
  }
}

function encryptSecret(raw: string): SecretBox {
  if (safeStorage.isEncryptionAvailable()) {
    return { encrypted: safeStorage.encryptString(raw).toString('base64') }
  }
  return { plain: raw }
}

function decryptSecret(box: SecretBox | null | undefined): string {
  if (!box) {
    return ''
  }
  if ('encrypted' in box) {
    try {
      return safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(Buffer.from(box.encrypted, 'base64')).trim()
        : ''
    } catch {
      return ''
    }
  }
  return box.plain.trim()
}

function isStoredAccount(value: unknown): value is StoredAccount {
  if (!value || typeof value !== 'object') {
    return false
  }
  const row = value as StoredAccount
  return typeof row.id === 'string' && typeof row.provider === 'string'
}

function isMessage(value: unknown): value is MailMessage {
  if (!value || typeof value !== 'object') {
    return false
  }
  const row = value as MailMessage
  return typeof row.id === 'string' && typeof row.accountId === 'string' && typeof row.subject === 'string'
}

function isDraft(value: unknown): value is MailDraft {
  if (!value || typeof value !== 'object') {
    return false
  }
  const row = value as MailDraft
  return typeof row.id === 'string' && typeof row.messageId === 'string' && typeof row.text === 'string'
}

export { emptyMailState }
