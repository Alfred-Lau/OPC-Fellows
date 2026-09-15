import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, safeStorage } from 'electron'
import {
  DEFAULT_RATES,
  DEFAULT_SETTINGS,
  detectCreemEnvironment,
  diffSnapshots,
  isDateKey,
  isExpenseCategory,
  isManualChannelId,
  isPayoutSourceId,
  maskApiKey,
  normalizeCurrency,
  toCents,
  type CreemSnapshot,
  type ExchangeRates,
  type ExpenseRecord,
  type ExpenseRecordInput,
  type ManualReceipt,
  type ManualReceiptInput,
  type PaymentEvent,
  type PaymentSettings,
  type PaymentSettingsInput,
  type PaymentsState,
  type PayoutRecord,
  type PayoutRecordInput,
} from '../shared/payments'

const MAX_EVENTS = 200

interface StoredApiKey {
  encrypted?: string
  plain?: string
}

interface StoredSettings {
  heartbeatMinutes: number
  notify: boolean
  todoFollowUp: boolean
  successUrl: string
  rates: ExchangeRates
}

interface PaymentsFile {
  apiKey: StoredApiKey | null
  settings: StoredSettings
  snapshot: CreemSnapshot | null
  receipts: ManualReceipt[]
  payouts: PayoutRecord[]
  expenses: ExpenseRecord[]
  events: PaymentEvent[]
}

const store: PaymentsFile = {
  apiKey: null,
  settings: defaultStoredSettings(),
  snapshot: null,
  receipts: [],
  payouts: [],
  expenses: [],
  events: [],
}

let syncing = false
let lastError: string | null = null

function defaultStoredSettings(): StoredSettings {
  return {
    heartbeatMinutes: DEFAULT_SETTINGS.heartbeatMinutes,
    notify: DEFAULT_SETTINGS.notify,
    todoFollowUp: DEFAULT_SETTINGS.todoFollowUp,
    successUrl: DEFAULT_SETTINGS.successUrl,
    rates: { ...DEFAULT_RATES },
  }
}

export function paymentStorePath(): string {
  return join(app.getPath('userData'), 'payments.json')
}

export function loadPayments(): void {
  const path = paymentStorePath()
  if (!existsSync(path)) {
    reset()
    return
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object') {
      reset()
      return
    }
    const record = parsed as Partial<PaymentsFile>
    store.apiKey = isStoredApiKey(record.apiKey) ? record.apiKey : null
    store.settings = parseSettings(record.settings)
    store.snapshot = isSnapshot(record.snapshot) ? record.snapshot : null
    store.receipts = Array.isArray(record.receipts) ? record.receipts.filter(isReceipt) : []
    store.payouts = Array.isArray(record.payouts) ? record.payouts.filter(isPayout) : []
    store.expenses = Array.isArray(record.expenses) ? record.expenses.filter(isExpense) : []
    store.events = Array.isArray(record.events) ? record.events.filter(isEvent).slice(0, MAX_EVENTS) : []
  } catch {
    reset()
  }
}

// —— API key ——

/** 环境变量优先，方便打包版和 CI；否则读本地加密存储。 */
export function resolveApiKey(): { key: string | null; source: PaymentSettings['keySource'] } {
  const fromEnv = process.env.CREEM_API_KEY?.trim()
  if (fromEnv) {
    return { key: fromEnv, source: 'env' }
  }
  const stored = store.apiKey
  if (!stored) {
    return { key: null, source: 'none' }
  }
  if (stored.encrypted) {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const key = safeStorage.decryptString(Buffer.from(stored.encrypted, 'base64')).trim()
        return key ? { key, source: 'stored' } : { key: null, source: 'none' }
      }
    } catch {
      return { key: null, source: 'none' }
    }
    return { key: null, source: 'none' }
  }
  const plain = stored.plain?.trim()
  return plain ? { key: plain, source: 'stored' } : { key: null, source: 'none' }
}

export function setApiKey(raw: string | null): boolean {
  const key = (raw ?? '').trim()
  if (!key) {
    store.apiKey = null
    // 换店铺 / 清 key 时旧快照没有意义，事件流也一起清掉。
    store.snapshot = null
    store.events = []
    lastError = null
    persist()
    return true
  }
  if (!detectCreemEnvironment(key)) {
    return false
  }
  const previous = resolveApiKey().key
  if (safeStorage.isEncryptionAvailable()) {
    store.apiKey = { encrypted: safeStorage.encryptString(key).toString('base64') }
  } else {
    store.apiKey = { plain: key }
  }
  if (previous !== key) {
    store.snapshot = null
    store.events = []
    lastError = null
  }
  persist()
  return true
}

// —— 状态 ——

export function paymentsSettings(): PaymentSettings {
  const resolved = resolveApiKey()
  return {
    hasApiKey: Boolean(resolved.key),
    keyPreview: maskApiKey(resolved.key),
    keySource: resolved.source,
    environment: detectCreemEnvironment(resolved.key),
    heartbeatMinutes: store.settings.heartbeatMinutes,
    notify: store.settings.notify,
    todoFollowUp: store.settings.todoFollowUp,
    successUrl: store.settings.successUrl,
    rates: { ...store.settings.rates },
  }
}

export function paymentsState(): PaymentsState {
  return {
    settings: paymentsSettings(),
    snapshot: store.snapshot,
    receipts: [...store.receipts],
    payouts: [...store.payouts],
    expenses: [...store.expenses],
    events: [...store.events],
    syncing,
    lastError,
  }
}

export function saveSettings(input: PaymentSettingsInput): PaymentSettings {
  if (input.heartbeatMinutes !== undefined) {
    store.settings.heartbeatMinutes = input.heartbeatMinutes
  }
  if (input.notify !== undefined) {
    store.settings.notify = input.notify
  }
  if (input.todoFollowUp !== undefined) {
    store.settings.todoFollowUp = input.todoFollowUp
  }
  if (input.successUrl !== undefined) {
    store.settings.successUrl = input.successUrl
  }
  if (input.rates) {
    store.settings.rates = { ...store.settings.rates, ...input.rates }
  }
  persist()
  return paymentsSettings()
}

export function setSyncing(next: boolean): void {
  syncing = next
}

export function setLastError(message: string | null): void {
  lastError = message
}

export function currentSnapshot(): CreemSnapshot | null {
  return store.snapshot
}

/** 写入新快照并返回这次心跳相对上次的变化。 */
export function applySnapshot(next: CreemSnapshot, now = new Date()): PaymentEvent[] {
  const events = diffSnapshots(store.snapshot, next, now)
  store.snapshot = next
  if (events.length > 0) {
    const known = new Set(store.events.map((item) => item.id))
    const fresh = events.filter((item) => !known.has(item.id))
    store.events = [...fresh, ...store.events].slice(0, MAX_EVENTS)
  }
  lastError = null
  persist()
  return events
}

export function clearEvents(): void {
  store.events = []
  persist()
}

// —— 手工收款 ——

export function saveReceipt(input: ManualReceiptInput, now = new Date()): ManualReceipt | null {
  const existing = input.id ? store.receipts.find((item) => item.id === input.id) : undefined
  if (input.id && !existing) {
    return null
  }
  const receipt: ManualReceipt = {
    id: existing?.id ?? crypto.randomUUID(),
    date: input.date,
    channel: input.channel,
    amount: input.amount,
    currency: input.currency,
    productId: (input.productId ?? '').trim(),
    customer: (input.customer ?? '').trim(),
    note: (input.note ?? '').trim(),
    createdAt: existing?.createdAt ?? now.toISOString(),
  }
  store.receipts = existing
    ? store.receipts.map((item) => (item.id === receipt.id ? receipt : item))
    : [receipt, ...store.receipts]
  persist()
  return receipt
}

export function removeReceipt(id: string): boolean {
  const before = store.receipts.length
  store.receipts = store.receipts.filter((item) => item.id !== id)
  if (store.receipts.length === before) {
    return false
  }
  persist()
  return true
}

// —— 结算提现 ——

export function savePayout(input: PayoutRecordInput, now = new Date()): PayoutRecord | null {
  const existing = input.id ? store.payouts.find((item) => item.id === input.id) : undefined
  if (input.id && !existing) {
    return null
  }
  const payout: PayoutRecord = {
    id: existing?.id ?? crypto.randomUUID(),
    date: input.date,
    source: input.source,
    gross: input.gross,
    fee: input.fee,
    currency: input.currency,
    received: input.received,
    receivedCurrency: input.receivedCurrency,
    account: (input.account ?? '').trim(),
    note: (input.note ?? '').trim(),
    createdAt: existing?.createdAt ?? now.toISOString(),
  }
  store.payouts = existing
    ? store.payouts.map((item) => (item.id === payout.id ? payout : item))
    : [payout, ...store.payouts]
  persist()
  return payout
}

export function removePayout(id: string): boolean {
  const before = store.payouts.length
  store.payouts = store.payouts.filter((item) => item.id !== id)
  if (store.payouts.length === before) {
    return false
  }
  persist()
  return true
}

// —— 支出 ——

export function saveExpense(input: ExpenseRecordInput, now = new Date()): ExpenseRecord | null {
  const existing = input.id ? store.expenses.find((item) => item.id === input.id) : undefined
  if (input.id && !existing) {
    return null
  }
  const expense: ExpenseRecord = {
    id: existing?.id ?? crypto.randomUUID(),
    date: input.date,
    category: input.category,
    amount: input.amount,
    currency: input.currency,
    vendor: (input.vendor ?? '').trim(),
    productId: (input.productId ?? '').trim(),
    note: (input.note ?? '').trim(),
    createdAt: existing?.createdAt ?? now.toISOString(),
  }
  store.expenses = existing
    ? store.expenses.map((item) => (item.id === expense.id ? expense : item))
    : [expense, ...store.expenses]
  persist()
  return expense
}

export function removeExpense(id: string): boolean {
  const before = store.expenses.length
  store.expenses = store.expenses.filter((item) => item.id !== id)
  if (store.expenses.length === before) {
    return false
  }
  persist()
  return true
}

// —— 内部 ——

function persist(): void {
  const path = paymentStorePath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(store, null, 2))
}

function reset(): void {
  store.apiKey = null
  store.settings = defaultStoredSettings()
  store.snapshot = null
  store.receipts = []
  store.payouts = []
  store.expenses = []
  store.events = []
}

function isStoredApiKey(value: unknown): value is StoredApiKey {
  if (!value || typeof value !== 'object') {
    return false
  }
  const item = value as StoredApiKey
  return typeof item.encrypted === 'string' || typeof item.plain === 'string'
}

function parseSettings(value: unknown): StoredSettings {
  const base = defaultStoredSettings()
  if (!value || typeof value !== 'object') {
    return base
  }
  const record = value as Partial<StoredSettings>
  const rates: Partial<ExchangeRates> = record.rates && typeof record.rates === 'object' ? record.rates : {}
  return {
    heartbeatMinutes:
      typeof record.heartbeatMinutes === 'number' && Number.isFinite(record.heartbeatMinutes)
        ? Math.max(0, Math.round(record.heartbeatMinutes))
        : base.heartbeatMinutes,
    notify: typeof record.notify === 'boolean' ? record.notify : base.notify,
    todoFollowUp: typeof record.todoFollowUp === 'boolean' ? record.todoFollowUp : base.todoFollowUp,
    successUrl: typeof record.successUrl === 'string' ? record.successUrl : base.successUrl,
    rates: {
      USD: typeof rates.USD === 'number' && rates.USD > 0 ? rates.USD : base.rates.USD,
      EUR: typeof rates.EUR === 'number' && rates.EUR > 0 ? rates.EUR : base.rates.EUR,
    },
  }
}

function isSnapshot(value: unknown): value is CreemSnapshot {
  if (!value || typeof value !== 'object') {
    return false
  }
  const item = value as Partial<CreemSnapshot>
  if (item.environment !== 'test' && item.environment !== 'live') {
    return false
  }
  return (
    typeof item.fetchedAt === 'string' &&
    Array.isArray(item.products) &&
    Array.isArray(item.customers) &&
    Array.isArray(item.subscriptions) &&
    Array.isArray(item.transactions) &&
    Array.isArray(item.discounts)
  )
}

function isReceipt(value: unknown): value is ManualReceipt {
  if (!value || typeof value !== 'object') {
    return false
  }
  const item = value as ManualReceipt
  if (typeof item.id !== 'string' || !isDateKey(item.date) || !isManualChannelId(item.channel)) {
    return false
  }
  item.amount = toCents(item.amount)
  item.currency = normalizeCurrency(item.currency, 'CNY')
  item.productId = typeof item.productId === 'string' ? item.productId : ''
  item.customer = typeof item.customer === 'string' ? item.customer : ''
  item.note = typeof item.note === 'string' ? item.note : ''
  return true
}

function isPayout(value: unknown): value is PayoutRecord {
  if (!value || typeof value !== 'object') {
    return false
  }
  const item = value as PayoutRecord
  if (typeof item.id !== 'string' || !isDateKey(item.date) || !isPayoutSourceId(item.source)) {
    return false
  }
  item.gross = toCents(item.gross)
  item.fee = toCents(item.fee)
  item.received = toCents(item.received)
  item.currency = normalizeCurrency(item.currency, 'USD')
  item.receivedCurrency = normalizeCurrency(item.receivedCurrency, 'CNY')
  item.account = typeof item.account === 'string' ? item.account : ''
  item.note = typeof item.note === 'string' ? item.note : ''
  return true
}

function isExpense(value: unknown): value is ExpenseRecord {
  if (!value || typeof value !== 'object') {
    return false
  }
  const item = value as ExpenseRecord
  if (typeof item.id !== 'string' || !isDateKey(item.date) || !isExpenseCategory(item.category)) {
    return false
  }
  item.amount = toCents(item.amount)
  item.currency = normalizeCurrency(item.currency, 'CNY')
  item.vendor = typeof item.vendor === 'string' ? item.vendor : ''
  item.productId = typeof item.productId === 'string' ? item.productId : ''
  item.note = typeof item.note === 'string' ? item.note : ''
  return true
}

function isEvent(value: unknown): value is PaymentEvent {
  if (!value || typeof value !== 'object') {
    return false
  }
  const item = value as PaymentEvent
  return typeof item.id === 'string' && typeof item.kind === 'string' && typeof item.title === 'string' && typeof item.at === 'string'
}
