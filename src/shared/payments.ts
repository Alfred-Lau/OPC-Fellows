import type { AgentTodoDraft } from './agent-inbox.ts'

/**
 * 收款管理：一人公司（OPC）的财务台。
 *
 * 海外 MoR 走 Creem（负责支付、税务、退款争议、结算）。
 * 其余渠道——国内支付、知识星球、自媒体分账、海外社媒——与结算提现、成本支出靠手录。
 * 所有金额统一以「分」存储（整数），与 Creem API 保持一致：1999 = 19.99。
 */

export const PAYMENT_AGENT_ID = 'payments'
export const PAYMENT_TAG = '收款'

export const PAYMENT_GROUPS = [
  { id: 'overview', label: '总览 · 财务' },
  { id: 'transactions', label: '交易流水' },
  { id: 'subscriptions', label: '订阅管理' },
  { id: 'customers', label: '客户' },
  { id: 'products', label: '产品与收款链接' },
  { id: 'payouts', label: '结算提现' },
  { id: 'expenses', label: '支出成本' },
  { id: 'settings', label: 'Creem 设置' },
] as const

export type PaymentGroupId = (typeof PAYMENT_GROUPS)[number]['id']

export function isPaymentGroupId(value: unknown): value is PaymentGroupId {
  return typeof value === 'string' && PAYMENT_GROUPS.some((item) => item.id === value)
}

export type CreemEnvironment = 'test' | 'live'

export const CREEM_API_BASE: Record<CreemEnvironment, string> = {
  test: 'https://test-api.creem.io',
  live: 'https://api.creem.io',
}

export const CREEM_DASHBOARD_URL = 'https://creem.io/dashboard'

/** 从 key 前缀判断环境：creem_test_ 是沙箱，creem_ 是生产。 */
export function detectCreemEnvironment(apiKey: string | null | undefined): CreemEnvironment | null {
  const key = (apiKey ?? '').trim()
  if (!key) {
    return null
  }
  if (key.startsWith('creem_test_')) {
    return 'test'
  }
  if (key.startsWith('creem_')) {
    return 'live'
  }
  return null
}

export function maskApiKey(apiKey: string | null | undefined): string {
  const key = (apiKey ?? '').trim()
  if (!key) {
    return ''
  }
  const env = detectCreemEnvironment(key)
  const prefix = env === 'test' ? 'creem_test_' : env === 'live' ? 'creem_' : ''
  const tail = key.slice(-4)
  return `${prefix}…${tail}`
}

// —— 订阅状态 ——

export const SUBSCRIPTION_STATUSES = [
  'active',
  'trialing',
  'past_due',
  'scheduled_cancel',
  'paused',
  'canceled',
  'expired',
  'unpaid',
] as const

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  active: '活跃',
  trialing: '试用中',
  past_due: '扣款失败',
  scheduled_cancel: '到期取消',
  paused: '已暂停',
  canceled: '已取消',
  expired: '已过期',
  unpaid: '未支付',
}

export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return typeof value === 'string' && SUBSCRIPTION_STATUSES.some((item) => item === value)
}

/** 这些状态仍在计费，计入 MRR。 */
export function isBillingStatus(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'past_due' || status === 'scheduled_cancel'
}

export type SubscriptionAction = 'cancel-scheduled' | 'cancel-now' | 'pause' | 'resume'

export const SUBSCRIPTION_ACTION_LABEL: Record<SubscriptionAction, string> = {
  'cancel-scheduled': '到期取消',
  'cancel-now': '立即取消',
  pause: '暂停',
  resume: '恢复',
}

export function isSubscriptionAction(value: unknown): value is SubscriptionAction {
  return value === 'cancel-scheduled' || value === 'cancel-now' || value === 'pause' || value === 'resume'
}

/** 按 Creem 的生命周期规则给出每个状态可做的操作。 */
export function subscriptionActions(status: SubscriptionStatus): SubscriptionAction[] {
  switch (status) {
    case 'active':
    case 'trialing':
    case 'past_due':
      return ['cancel-scheduled', 'cancel-now', 'pause']
    case 'scheduled_cancel':
      return ['resume', 'cancel-now']
    case 'paused':
      return ['resume', 'cancel-now']
    case 'canceled':
    case 'expired':
    case 'unpaid':
      return []
    default: {
      const exhaustive: never = status
      return exhaustive
    }
  }
}

// —— Creem 归一化对象 ——

export type BillingType = 'onetime' | 'recurring'

export const BILLING_PERIODS = ['every-month', 'every-three-months', 'every-six-months', 'every-year'] as const
export type BillingPeriod = (typeof BILLING_PERIODS)[number]

export const BILLING_PERIOD_LABEL: Record<BillingPeriod, string> = {
  'every-month': '每月',
  'every-three-months': '每季',
  'every-six-months': '每半年',
  'every-year': '每年',
}

export function isBillingPeriod(value: unknown): value is BillingPeriod {
  return typeof value === 'string' && BILLING_PERIODS.some((item) => item === value)
}

export const TAX_CATEGORIES = ['saas', 'digital-goods-service', 'ebooks'] as const
export type TaxCategory = (typeof TAX_CATEGORIES)[number]

export function isTaxCategory(value: unknown): value is TaxCategory {
  return typeof value === 'string' && TAX_CATEGORIES.some((item) => item === value)
}

export const CREEM_CURRENCIES = ['USD', 'EUR'] as const
export type CreemCurrency = (typeof CREEM_CURRENCIES)[number]

export function isCreemCurrency(value: unknown): value is CreemCurrency {
  return value === 'USD' || value === 'EUR'
}

export interface CreemProduct {
  id: string
  name: string
  description: string
  /** 分 */
  price: number
  currency: string
  billingType: BillingType
  billingPeriod: string | null
  status: string
  taxMode: string
  taxCategory: string
  productUrl: string
  createdAt: string
}

export interface CreemCustomer {
  id: string
  email: string
  name: string
  country: string
  createdAt: string
}

export interface CreemSubscription {
  id: string
  productId: string
  productName: string
  customerId: string
  customerEmail: string
  status: SubscriptionStatus
  /** 每期金额（分），取自产品价格。 */
  amount: number
  currency: string
  billingPeriod: string | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  nextTransactionAt: string | null
  canceledAt: string | null
  createdAt: string
}

export type TransactionStatus =
  | 'pending'
  | 'paid'
  | 'refunded'
  | 'partialRefund'
  | 'chargedBack'
  | 'uncollectible'
  | 'declined'
  | 'canceled'
  | 'void'
  | 'unknown'

export const TRANSACTION_STATUS_LABEL: Record<TransactionStatus, string> = {
  pending: '处理中',
  paid: '已支付',
  refunded: '已退款',
  partialRefund: '部分退款',
  chargedBack: '拒付争议',
  uncollectible: '无法收款',
  declined: '被拒绝',
  canceled: '已取消',
  void: '作废',
  unknown: '未知',
}

export function toTransactionStatus(value: unknown): TransactionStatus {
  switch (value) {
    case 'pending':
    case 'paid':
    case 'refunded':
    case 'partialRefund':
    case 'chargedBack':
    case 'uncollectible':
    case 'declined':
    case 'canceled':
    case 'void':
      return value
    default:
      return 'unknown'
  }
}

export interface CreemTransaction {
  id: string
  /** 不含税的商品金额（分） */
  amount: number
  /** 客户实付（含税，分） */
  amountPaid: number
  currency: string
  taxAmount: number
  discountAmount: number
  refundedAmount: number
  status: TransactionStatus
  /** payment = 一次性，invoice = 订阅账单 */
  type: string
  description: string
  orderId: string | null
  subscriptionId: string | null
  customerId: string | null
  createdAt: string
}

export interface CreemDiscount {
  id: string
  name: string
  code: string
  type: 'percentage' | 'fixed'
  /** 百分比或固定金额（分） */
  amount: number
  currency: string | null
  status: string
  duration: string
  maxRedemptions: number | null
  redeemCount: number
  expiryDate: string | null
  appliesToProducts: string[]
}

export interface CreemSnapshot {
  environment: CreemEnvironment
  fetchedAt: string
  products: CreemProduct[]
  customers: CreemCustomer[]
  subscriptions: CreemSubscription[]
  transactions: CreemTransaction[]
  discounts: CreemDiscount[]
}

// —— 手工收款（Creem 以外的全部渠道） ——

export const CHANNEL_GROUPS = [
  { id: 'domestic', label: '国内支付', defaultCurrency: 'CNY' },
  { id: 'knowledge', label: '知识付费', defaultCurrency: 'CNY' },
  { id: 'creator-share', label: '自媒体分账', defaultCurrency: 'CNY' },
  { id: 'overseas-social', label: '海外社媒', defaultCurrency: 'USD' },
  { id: 'processor', label: '支付网关', defaultCurrency: 'USD' },
  { id: 'other', label: '其他', defaultCurrency: 'CNY' },
] as const

export type ChannelGroupId = (typeof CHANNEL_GROUPS)[number]['id']

export const MANUAL_CHANNELS = [
  { id: 'wechat', name: '微信', group: 'domestic', aliases: ['微信转账', '微信收款'] },
  { id: 'wechat-qr', name: '微信扫码', group: 'domestic', aliases: ['扫码收款', '收款码', '微信收款码', '微信支付'] },
  { id: 'alipay', name: '支付宝', group: 'domestic', aliases: [] },
  { id: 'bank', name: '银行转账', group: 'domestic', aliases: ['对公', '对公转账'] },
  { id: 'zsxq', name: '知识星球', group: 'knowledge', aliases: ['星球'] },
  { id: 'xiaohongshu', name: '小红书分账', group: 'creator-share', aliases: ['小红书'] },
  { id: 'channels', name: '视频号分账', group: 'creator-share', aliases: ['视频号'] },
  { id: 'douyin', name: '抖音分账', group: 'creator-share', aliases: ['抖音'] },
  { id: 'bilibili', name: 'B 站创作分成', group: 'creator-share', aliases: ['B站', '哔哩哔哩', 'bilibili'] },
  { id: 'wechat-mp', name: '公众号流量主', group: 'creator-share', aliases: ['公众号', '流量主'] },
  { id: 'patreon', name: 'Patreon', group: 'overseas-social', aliases: [] },
  { id: 'kofi', name: 'Ko-fi', group: 'overseas-social', aliases: ['kofi'] },
  { id: 'bmc', name: 'Buy Me a Coffee', group: 'overseas-social', aliases: ['buymeacoffee'] },
  { id: 'substack', name: 'Substack', group: 'overseas-social', aliases: [] },
  { id: 'youtube', name: 'YouTube', group: 'overseas-social', aliases: ['油管'] },
  { id: 'x-tips', name: 'X Tips', group: 'overseas-social', aliases: ['推特打赏', 'twitter tips', 'x 打赏'] },
  { id: 'tiktok', name: 'TikTok', group: 'overseas-social', aliases: [] },
  { id: 'stripe', name: 'Stripe', group: 'processor', aliases: [] },
  { id: 'appstore', name: 'App Store', group: 'processor', aliases: ['app store'] },
  { id: 'other', name: '其他', group: 'other', aliases: [] },
] as const

export type ManualChannelId = (typeof MANUAL_CHANNELS)[number]['id']

export function isManualChannelId(value: unknown): value is ManualChannelId {
  return typeof value === 'string' && MANUAL_CHANNELS.some((item) => item.id === value)
}

export function isChannelGroupId(value: unknown): value is ChannelGroupId {
  return typeof value === 'string' && CHANNEL_GROUPS.some((item) => item.id === value)
}

export function manualChannelName(id: ManualChannelId): string {
  return MANUAL_CHANNELS.find((item) => item.id === id)?.name ?? id
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 用于口语匹配与从入账句子里剥掉渠道名。`other` 太泛，不参与匹配。 */
export function channelPhrases(id?: ManualChannelId): string[] {
  const items = id ? MANUAL_CHANNELS.filter((item) => item.id === id) : [...MANUAL_CHANNELS]
  return items.flatMap((item) => (item.id === 'other' ? [] : [item.name, ...item.aliases]))
}

/** 最长别名优先，避免「微信扫码」落到「微信」。 */
export function matchManualChannel(text: string): ManualChannelId | undefined {
  const phrases = MANUAL_CHANNELS.flatMap((item) =>
    channelPhrases(item.id).map((phrase) => ({ id: item.id, phrase })),
  ).sort((left, right) => right.phrase.length - left.phrase.length)
  const haystack = text.toLowerCase()
  for (const { id, phrase } of phrases) {
    if (haystack.includes(phrase.toLowerCase())) {
      return id
    }
  }
  return undefined
}

export function defaultCurrencyForGroup(group: ChannelGroupId): string {
  return CHANNEL_GROUPS.find((item) => item.id === group)?.defaultCurrency ?? 'CNY'
}

export function defaultCurrencyForChannel(id: ManualChannelId): string {
  const channel = MANUAL_CHANNELS.find((item) => item.id === id)
  return channel ? defaultCurrencyForGroup(channel.group) : 'CNY'
}

export function channelNameStripPattern(): RegExp {
  const phrases = channelPhrases().slice().sort((left, right) => right.length - left.length)
  return new RegExp(phrases.map(escapeRegExp).join('|'), 'gi')
}

export interface ManualReceipt {
  id: string
  /** YYYY-MM-DD */
  date: string
  channel: ManualChannelId
  amount: number
  currency: string
  productId: string
  customer: string
  note: string
  createdAt: string
}

export interface ManualReceiptInput {
  id?: string
  date: string
  channel: ManualChannelId
  amount: number
  currency: string
  productId?: string
  customer?: string
  note?: string
}

// —— 结算提现 ——

export const PAYOUT_SOURCES = [
  { id: 'creem', name: 'Creem', group: 'processor' },
  { id: 'stripe', name: 'Stripe', group: 'processor' },
  { id: 'appstore', name: 'App Store', group: 'processor' },
  { id: 'wechat', name: '微信', group: 'domestic' },
  { id: 'alipay', name: '支付宝', group: 'domestic' },
  { id: 'zsxq', name: '知识星球', group: 'knowledge' },
  { id: 'xiaohongshu', name: '小红书', group: 'creator-share' },
  { id: 'channels', name: '视频号', group: 'creator-share' },
  { id: 'douyin', name: '抖音', group: 'creator-share' },
  { id: 'bilibili', name: 'B 站', group: 'creator-share' },
  { id: 'wechat-mp', name: '公众号', group: 'creator-share' },
  { id: 'patreon', name: 'Patreon', group: 'overseas-social' },
  { id: 'kofi', name: 'Ko-fi', group: 'overseas-social' },
  { id: 'bmc', name: 'Buy Me a Coffee', group: 'overseas-social' },
  { id: 'substack', name: 'Substack', group: 'overseas-social' },
  { id: 'youtube', name: 'YouTube', group: 'overseas-social' },
  { id: 'x-tips', name: 'X', group: 'overseas-social' },
  { id: 'tiktok', name: 'TikTok', group: 'overseas-social' },
  { id: 'other', name: '其他', group: 'other' },
] as const

export type PayoutSourceId = (typeof PAYOUT_SOURCES)[number]['id']

export function isPayoutSourceId(value: unknown): value is PayoutSourceId {
  return typeof value === 'string' && PAYOUT_SOURCES.some((item) => item.id === value)
}

export function defaultCurrencyForPayoutSource(id: PayoutSourceId): string {
  const source = PAYOUT_SOURCES.find((item) => item.id === id)
  return source ? defaultCurrencyForGroup(source.group) : 'USD'
}

export interface PayoutRecord {
  id: string
  date: string
  source: PayoutSourceId
  /** 提现总额（分，原币种） */
  gross: number
  /** 手续费（分，原币种） */
  fee: number
  currency: string
  /** 实际到账（分，到账币种） */
  received: number
  receivedCurrency: string
  /** 到账账户：银行 / 支付宝 / USDC 钱包 */
  account: string
  note: string
  createdAt: string
}

export interface PayoutRecordInput {
  id?: string
  date: string
  source: PayoutSourceId
  gross: number
  fee: number
  currency: string
  received: number
  receivedCurrency: string
  account?: string
  note?: string
}

// —— 支出成本 ——

export const EXPENSE_CATEGORIES = ['SaaS 订阅', '云服务', '域名', 'AI 模型', '设计素材', '推广', '税费', '其他'] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return typeof value === 'string' && EXPENSE_CATEGORIES.some((item) => item === value)
}

export interface ExpenseRecord {
  id: string
  date: string
  category: ExpenseCategory
  amount: number
  currency: string
  vendor: string
  productId: string
  note: string
  createdAt: string
}

export interface ExpenseRecordInput {
  id?: string
  date: string
  category: ExpenseCategory
  amount: number
  currency: string
  vendor?: string
  productId?: string
  note?: string
}

// —— 心跳事件 ——

export type PaymentEventKind =
  | 'sale'
  | 'new_customer'
  | 'sub_new'
  | 'sub_canceled'
  | 'sub_scheduled_cancel'
  | 'sub_past_due'
  | 'sub_expired'
  | 'sub_paused'
  | 'sub_resumed'
  | 'refund'
  | 'dispute'

export type PaymentEventTone = 'good' | 'warn' | 'info'

export interface PaymentEvent {
  id: string
  kind: PaymentEventKind
  title: string
  detail: string
  at: string
  tone: PaymentEventTone
}

export function eventTone(kind: PaymentEventKind): PaymentEventTone {
  switch (kind) {
    case 'sale':
    case 'new_customer':
    case 'sub_new':
    case 'sub_resumed':
      return 'good'
    case 'sub_canceled':
    case 'sub_scheduled_cancel':
    case 'sub_past_due':
    case 'sub_expired':
    case 'refund':
    case 'dispute':
      return 'warn'
    case 'sub_paused':
      return 'info'
    default: {
      const exhaustive: never = kind
      return exhaustive
    }
  }
}

// —— 设置与状态 ——

export interface PaymentSettings {
  hasApiKey: boolean
  keyPreview: string
  keySource: 'stored' | 'env' | 'none'
  environment: CreemEnvironment | null
  /** 心跳同步间隔（分钟），0 关闭。 */
  heartbeatMinutes: number
  notify: boolean
  /** 扣款失败 / 到期取消 / 争议是否写入待办。 */
  todoFollowUp: boolean
  successUrl: string
  /** 折算人民币用的汇率。 */
  rates: ExchangeRates
}

export interface PaymentSettingsInput {
  heartbeatMinutes?: number
  notify?: boolean
  todoFollowUp?: boolean
  successUrl?: string
  rates?: Partial<ExchangeRates>
}

export interface ExchangeRates {
  USD: number
  EUR: number
}

export const DEFAULT_RATES: ExchangeRates = { USD: 7.2, EUR: 7.8 }

export const DEFAULT_SETTINGS: PaymentSettings = {
  hasApiKey: false,
  keyPreview: '',
  keySource: 'none',
  environment: null,
  heartbeatMinutes: 60,
  notify: true,
  todoFollowUp: true,
  successUrl: '',
  rates: DEFAULT_RATES,
}

export interface PaymentsState {
  settings: PaymentSettings
  snapshot: CreemSnapshot | null
  receipts: ManualReceipt[]
  payouts: PayoutRecord[]
  expenses: ExpenseRecord[]
  events: PaymentEvent[]
  syncing: boolean
  lastError: string | null
}

export interface PaymentActionResult {
  ok: boolean
  error?: string
  /** 收款链接 / 客户门户链接之类的产出。 */
  url?: string
  state: PaymentsState
}

export interface CreateProductInput {
  name: string
  description: string
  price: number
  currency: CreemCurrency
  billingType: BillingType
  billingPeriod?: BillingPeriod
  taxCategory: TaxCategory
  taxMode: 'inclusive' | 'exclusive'
}

export interface CreateCheckoutInput {
  productId: string
  successUrl?: string
  discountCode?: string
  customerEmail?: string
  referenceId?: string
  units?: number
}

export interface CreateDiscountInput {
  name: string
  code: string
  type: 'percentage' | 'fixed'
  /** 百分比 (1-100) 或固定金额（分） */
  amount: number
  currency?: CreemCurrency
  duration: 'forever' | 'once' | 'repeating'
  durationInMonths?: number
  maxRedemptions?: number
  expiryDate?: string
  appliesToProducts: string[]
}

// —— 金额与日期 ——

export function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function normalizeCurrency(value: unknown, fallback = 'USD'): string {
  if (typeof value !== 'string') {
    return fallback
  }
  const code = value.trim().toUpperCase()
  return /^[A-Z]{3}$/.test(code) ? code : fallback
}

export function toCents(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0) {
    return 0
  }
  return Math.round(n)
}

/** 把用户输入的「19.99」「¥ 1,288」变成分。 */
export function parseAmountToCents(raw: string): number {
  const cleaned = raw.replace(/[^\d.\-]/g, '')
  if (!cleaned) {
    return 0
  }
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 0) {
    return 0
  }
  return Math.round(n * 100)
}

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$',
  EUR: '€',
  CNY: '¥',
  GBP: '£',
  JPY: '¥',
  HKD: 'HK$',
}

export function formatMoney(cents: number, currency: string): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? `${currency} `
  const negative = cents < 0
  const abs = Math.abs(cents)
  const whole = Math.floor(abs / 100)
  const frac = String(abs % 100).padStart(2, '0')
  const grouped = whole.toLocaleString('en-US')
  return `${negative ? '-' : ''}${symbol}${grouped}.${frac}`
}

export function formatCny(cents: number): string {
  return formatMoney(cents, 'CNY')
}

export function toCny(cents: number, currency: string, rates: ExchangeRates): number {
  if (currency === 'CNY') {
    return cents
  }
  const rate = currency === 'USD' ? rates.USD : currency === 'EUR' ? rates.EUR : null
  if (rate === null) {
    return cents
  }
  return Math.round(cents * rate)
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function shiftMonth(key: string, delta: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(key)
  if (!match) {
    return key
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1 + delta, 1)
  return monthKeyOf(date)
}

export function isoDateKey(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return ''
  }
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return date.toISOString()
}

// —— 统一流水 ——

export type LedgerSource = 'creem' | 'manual'

export interface LedgerEntry {
  id: string
  source: LedgerSource
  /** ISO 时间 */
  at: string
  /** 渠道：Creem 一次性 / Creem 订阅 / 微信扫码 / 知识星球 … */
  channel: string
  productId: string
  productName: string
  customer: string
  /** 商品金额（分，不含税） */
  amount: number
  /** 已退款（分，不含税口径的估算） */
  refunded: number
  currency: string
  status: TransactionStatus
  /** 折人民币（分） */
  amountCny: number
  refundedCny: number
  note: string
}

/** Creem 的 refunded_amount 含税；按商品 / 实付比例折回不含税口径。 */
export function refundedExTax(transaction: CreemTransaction): number {
  if (transaction.refundedAmount <= 0) {
    return 0
  }
  if (transaction.status === 'refunded' || transaction.status === 'chargedBack') {
    return transaction.amount
  }
  if (transaction.amountPaid <= 0) {
    return Math.min(transaction.amount, transaction.refundedAmount)
  }
  const ratio = transaction.refundedAmount / transaction.amountPaid
  return Math.min(transaction.amount, Math.round(transaction.amount * ratio))
}

/** 只有真正收到钱的交易才进流水；pending / declined / canceled 等不算收入。 */
export function countsAsRevenue(status: TransactionStatus): boolean {
  return status === 'paid' || status === 'refunded' || status === 'partialRefund' || status === 'chargedBack'
}

export function buildLedger(
  snapshot: CreemSnapshot | null,
  receipts: ManualReceipt[],
  rates: ExchangeRates,
  productNames: (id: string) => string,
): LedgerEntry[] {
  const entries: LedgerEntry[] = []
  if (snapshot) {
    const customers = new Map(snapshot.customers.map((item) => [item.id, item]))
    const subscriptions = new Map(snapshot.subscriptions.map((item) => [item.id, item]))
    const products = new Map(snapshot.products.map((item) => [item.id, item]))
    for (const transaction of snapshot.transactions) {
      if (!countsAsRevenue(transaction.status)) {
        continue
      }
      const subscription = transaction.subscriptionId ? subscriptions.get(transaction.subscriptionId) : undefined
      const product = subscription ? products.get(subscription.productId) : undefined
      const customer = transaction.customerId ? customers.get(transaction.customerId) : undefined
      const refunded = refundedExTax(transaction)
      entries.push({
        id: transaction.id,
        source: 'creem',
        at: transaction.createdAt,
        channel: transaction.type === 'invoice' ? 'Creem 订阅' : 'Creem 一次性',
        productId: product?.id ?? '',
        productName: product?.name ?? subscription?.productName ?? transaction.description,
        customer: customer?.email ?? subscription?.customerEmail ?? transaction.customerId ?? '',
        amount: transaction.amount,
        refunded,
        currency: transaction.currency,
        status: transaction.status,
        amountCny: toCny(transaction.amount, transaction.currency, rates),
        refundedCny: toCny(refunded, transaction.currency, rates),
        note: transaction.description,
      })
    }
  }
  for (const receipt of receipts) {
    entries.push({
      id: receipt.id,
      source: 'manual',
      at: `${receipt.date}T12:00:00.000Z`,
      channel: manualChannelName(receipt.channel),
      productId: receipt.productId,
      productName: receipt.productId ? productNames(receipt.productId) : '',
      customer: receipt.customer,
      amount: receipt.amount,
      refunded: 0,
      currency: receipt.currency,
      status: 'paid',
      amountCny: toCny(receipt.amount, receipt.currency, rates),
      refundedCny: 0,
      note: receipt.note,
    })
  }
  return entries.sort((left, right) => right.at.localeCompare(left.at))
}

export interface LedgerFilter {
  month: string | 'all'
  source: LedgerSource | 'all'
  productId: string | 'all'
  query: string
}

export function filterLedger(entries: LedgerEntry[], filter: LedgerFilter): LedgerEntry[] {
  const query = filter.query.trim().toLowerCase()
  return entries.filter((entry) => {
    if (filter.month !== 'all' && monthKey(entry.at) !== filter.month) {
      return false
    }
    if (filter.source !== 'all' && entry.source !== filter.source) {
      return false
    }
    if (filter.productId !== 'all' && entry.productId !== filter.productId) {
      return false
    }
    if (query) {
      const hay = `${entry.customer} ${entry.productName} ${entry.note} ${entry.channel} ${entry.id}`.toLowerCase()
      if (!hay.includes(query)) {
        return false
      }
    }
    return true
  })
}

export function ledgerMonths(entries: LedgerEntry[]): string[] {
  return [...new Set(entries.map((entry) => monthKey(entry.at)))].sort((left, right) => right.localeCompare(left))
}

// —— 汇总 ——

export interface MoneyByCurrency {
  currency: string
  cents: number
}

export function sumByCurrency(items: Array<{ currency: string; cents: number }>): MoneyByCurrency[] {
  const totals = new Map<string, number>()
  for (const item of items) {
    totals.set(item.currency, (totals.get(item.currency) ?? 0) + item.cents)
  }
  return [...totals.entries()]
    .map(([currency, cents]) => ({ currency, cents }))
    .sort((left, right) => left.currency.localeCompare(right.currency))
}

/** 按 Creem 的计费周期把每期金额折成月度金额。 */
export function monthlyShare(amount: number, billingPeriod: string | null): number {
  switch (billingPeriod) {
    case 'every-month':
      return amount
    case 'every-three-months':
      return amount / 3
    case 'every-six-months':
      return amount / 6
    case 'every-year':
      return amount / 12
    default:
      return amount
  }
}

export function mrrByCurrency(subscriptions: CreemSubscription[]): MoneyByCurrency[] {
  return sumByCurrency(
    subscriptions
      .filter((item) => isBillingStatus(item.status))
      .map((item) => ({ currency: item.currency, cents: Math.round(monthlyShare(item.amount, item.billingPeriod)) })),
  )
}

export function countByStatus(subscriptions: CreemSubscription[]): Record<SubscriptionStatus, number> {
  const counts = Object.fromEntries(SUBSCRIPTION_STATUSES.map((status) => [status, 0])) as Record<SubscriptionStatus, number>
  for (const item of subscriptions) {
    counts[item.status] += 1
  }
  return counts
}

/** Creem 平台费：3.9% + 0.40（按含税总额收）。仅用于估算净收入。 */
export function estimateCreemFee(amountPaidCents: number): number {
  if (amountPaidCents <= 0) {
    return 0
  }
  return Math.round(amountPaidCents * 0.039 + 40)
}

export interface FinanceSummary {
  month: string
  /** 当月收入（折人民币，分，已扣退款） */
  monthRevenueCny: number
  lastMonthRevenueCny: number
  /** 累计收入（折人民币，分，已扣退款） */
  totalRevenueCny: number
  totalRefundsCny: number
  /** Creem 平台费估算（折人民币，分，累计） */
  creemFeeCny: number
  monthExpensesCny: number
  totalExpensesCny: number
  totalPayoutsCny: number
  /** 当月利润 = 当月收入 − 当月支出 */
  monthProfitCny: number
  /** 累计待结算 = Creem 净收入 − 已提现 */
  pendingSettlementCny: number
  mrr: MoneyByCurrency[]
  mrrCny: number
  arrCny: number
  activeSubscriptions: number
  customers: number
  attention: { pastDue: number; scheduledCancel: number; disputes: number; refunds: number }
}

export function financeSummary(
  entries: LedgerEntry[],
  snapshot: CreemSnapshot | null,
  payouts: PayoutRecord[],
  expenses: ExpenseRecord[],
  rates: ExchangeRates,
  now = new Date(),
): FinanceSummary {
  const month = monthKeyOf(now)
  const lastMonth = shiftMonth(month, -1)
  let monthRevenueCny = 0
  let lastMonthRevenueCny = 0
  let totalRevenueCny = 0
  let totalRefundsCny = 0
  for (const entry of entries) {
    const net = entry.amountCny - entry.refundedCny
    totalRevenueCny += net
    totalRefundsCny += entry.refundedCny
    const key = monthKey(entry.at)
    if (key === month) {
      monthRevenueCny += net
    } else if (key === lastMonth) {
      lastMonthRevenueCny += net
    }
  }

  let creemFeeCny = 0
  let disputes = 0
  let refunds = 0
  if (snapshot) {
    for (const transaction of snapshot.transactions) {
      if (!countsAsRevenue(transaction.status)) {
        continue
      }
      creemFeeCny += toCny(estimateCreemFee(transaction.amountPaid), transaction.currency, rates)
      if (transaction.status === 'chargedBack') {
        disputes += 1
      }
      if (transaction.status === 'refunded' || transaction.status === 'partialRefund') {
        refunds += 1
      }
    }
  }

  let monthExpensesCny = 0
  let totalExpensesCny = 0
  for (const expense of expenses) {
    const cny = toCny(expense.amount, expense.currency, rates)
    totalExpensesCny += cny
    if (monthKey(expense.date) === month) {
      monthExpensesCny += cny
    }
  }

  const totalPayoutsCny = payouts.reduce((sum, payout) => sum + toCny(payout.gross, payout.currency, rates), 0)
  const creemNetCny = entries
    .filter((entry) => entry.source === 'creem')
    .reduce((sum, entry) => sum + entry.amountCny - entry.refundedCny, 0) - creemFeeCny

  const subscriptions = snapshot?.subscriptions ?? []
  const counts = countByStatus(subscriptions)
  const mrr = mrrByCurrency(subscriptions)
  const mrrCny = mrr.reduce((sum, item) => sum + toCny(item.cents, item.currency, rates), 0)

  return {
    month,
    monthRevenueCny,
    lastMonthRevenueCny,
    totalRevenueCny,
    totalRefundsCny,
    creemFeeCny,
    monthExpensesCny,
    totalExpensesCny,
    totalPayoutsCny,
    monthProfitCny: monthRevenueCny - monthExpensesCny,
    pendingSettlementCny: creemNetCny - totalPayoutsCny,
    mrr,
    mrrCny,
    arrCny: mrrCny * 12,
    activeSubscriptions: counts.active + counts.trialing + counts.past_due + counts.scheduled_cancel,
    customers: snapshot?.customers.length ?? 0,
    attention: {
      pastDue: counts.past_due,
      scheduledCancel: counts.scheduled_cancel,
      disputes,
      refunds,
    },
  }
}

export interface MonthPoint {
  month: string
  revenueCny: number
  expensesCny: number
}

export function monthlySeries(entries: LedgerEntry[], expenses: ExpenseRecord[], rates: ExchangeRates, months = 12, now = new Date()): MonthPoint[] {
  const current = monthKeyOf(now)
  const keys = Array.from({ length: months }, (_, index) => shiftMonth(current, index - (months - 1)))
  const revenue = new Map(keys.map((key) => [key, 0]))
  const spend = new Map(keys.map((key) => [key, 0]))
  for (const entry of entries) {
    const key = monthKey(entry.at)
    if (revenue.has(key)) {
      revenue.set(key, (revenue.get(key) ?? 0) + entry.amountCny - entry.refundedCny)
    }
  }
  for (const expense of expenses) {
    const key = monthKey(expense.date)
    if (spend.has(key)) {
      spend.set(key, (spend.get(key) ?? 0) + toCny(expense.amount, expense.currency, rates))
    }
  }
  return keys.map((month) => ({ month, revenueCny: revenue.get(month) ?? 0, expensesCny: spend.get(month) ?? 0 }))
}

export interface BreakdownRow {
  key: string
  label: string
  cny: number
  count: number
}

export function breakdownBy(entries: LedgerEntry[], pick: (entry: LedgerEntry) => { key: string; label: string }): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>()
  for (const entry of entries) {
    const { key, label } = pick(entry)
    const row = rows.get(key) ?? { key, label, cny: 0, count: 0 }
    row.cny += entry.amountCny - entry.refundedCny
    row.count += 1
    rows.set(key, row)
  }
  return [...rows.values()].sort((left, right) => right.cny - left.cny)
}

// —— 客户 ——

export interface CustomerDigest {
  customer: CreemCustomer
  subscriptions: CreemSubscription[]
  lifetime: MoneyByCurrency[]
  lastPaidAt: string | null
}

export function customerDigests(snapshot: CreemSnapshot | null): CustomerDigest[] {
  if (!snapshot) {
    return []
  }
  return snapshot.customers
    .map((customer) => {
      const paid = snapshot.transactions.filter(
        (item) => item.customerId === customer.id && countsAsRevenue(item.status),
      )
      const subscriptions = snapshot.subscriptions.filter((item) => item.customerId === customer.id)
      const lastPaidAt = paid.map((item) => item.createdAt).sort().at(-1) ?? null
      return {
        customer,
        subscriptions,
        lifetime: sumByCurrency(paid.map((item) => ({ currency: item.currency, cents: item.amount - refundedExTax(item) }))),
        lastPaidAt,
      }
    })
    .sort((left, right) => (right.lastPaidAt ?? right.customer.createdAt).localeCompare(left.lastPaidAt ?? left.customer.createdAt))
}

// —— 心跳 diff（按 creem.io/HEARTBEAT.md 的规则） ——

export function diffSnapshots(previous: CreemSnapshot | null, next: CreemSnapshot, now = new Date()): PaymentEvent[] {
  if (!previous || previous.environment !== next.environment) {
    return []
  }
  const events: PaymentEvent[] = []
  const at = now.toISOString()
  const customers = new Map(next.customers.map((item) => [item.id, item]))
  const products = new Map(next.products.map((item) => [item.id, item]))
  const subscriptions = new Map(next.subscriptions.map((item) => [item.id, item]))
  const emailOf = (customerId: string | null): string => (customerId ? customers.get(customerId)?.email ?? customerId : '未知客户')

  const knownTransactions = new Set(previous.transactions.map((item) => item.id))
  for (const transaction of next.transactions) {
    if (knownTransactions.has(transaction.id)) {
      continue
    }
    if (transaction.status === 'paid') {
      const subscription = transaction.subscriptionId ? subscriptions.get(transaction.subscriptionId) : undefined
      const product = subscription ? products.get(subscription.productId) : undefined
      const label = product?.name ?? subscription?.productName ?? transaction.description
      events.push({
        id: `sale:${transaction.id}`,
        kind: 'sale',
        title: `新收款 ${formatMoney(transaction.amount, transaction.currency)}`,
        detail: `${label} · ${emailOf(transaction.customerId)} · ${transaction.type === 'invoice' ? '订阅' : '一次性'}`,
        at,
        tone: eventTone('sale'),
      })
    }
  }

  const previousTransactions = new Map(previous.transactions.map((item) => [item.id, item]))
  for (const transaction of next.transactions) {
    const before = previousTransactions.get(transaction.id)
    if (!before || before.status === transaction.status) {
      continue
    }
    if (transaction.status === 'refunded' || transaction.status === 'partialRefund') {
      events.push({
        id: `refund:${transaction.id}:${transaction.refundedAmount}`,
        kind: 'refund',
        title: `退款 ${formatMoney(transaction.refundedAmount, transaction.currency)}`,
        detail: `${emailOf(transaction.customerId)} · ${transaction.description}`,
        at,
        tone: eventTone('refund'),
      })
    }
    if (transaction.status === 'chargedBack') {
      events.push({
        id: `dispute:${transaction.id}`,
        kind: 'dispute',
        title: `拒付争议 ${formatMoney(transaction.amountPaid, transaction.currency)}`,
        detail: `${emailOf(transaction.customerId)} · 到 Creem Dashboard 补证据`,
        at,
        tone: eventTone('dispute'),
      })
    }
  }

  const knownCustomers = new Set(previous.customers.map((item) => item.id))
  for (const customer of next.customers) {
    if (!knownCustomers.has(customer.id)) {
      events.push({
        id: `customer:${customer.id}`,
        kind: 'new_customer',
        title: `新客户 ${customer.email}`,
        detail: [customer.name, customer.country].filter(Boolean).join(' · '),
        at,
        tone: eventTone('new_customer'),
      })
    }
  }

  const previousSubscriptions = new Map(previous.subscriptions.map((item) => [item.id, item.status]))
  for (const subscription of next.subscriptions) {
    const before = previousSubscriptions.get(subscription.id)
    const who = `${subscription.customerEmail || '未知客户'} · ${subscription.productName}`
    if (before === undefined) {
      if (subscription.status === 'active' || subscription.status === 'trialing') {
        events.push({
          id: `sub-new:${subscription.id}`,
          kind: 'sub_new',
          title: subscription.status === 'trialing' ? '新试用订阅' : '新订阅',
          detail: `${who} · ${formatMoney(subscription.amount, subscription.currency)}`,
          at,
          tone: eventTone('sub_new'),
        })
      }
      continue
    }
    if (before === subscription.status) {
      continue
    }
    const change = subscriptionChangeEvent(before, subscription.status)
    if (!change) {
      continue
    }
    events.push({
      id: `sub:${subscription.id}:${subscription.status}`,
      kind: change.kind,
      title: change.title,
      detail: subscription.status === 'scheduled_cancel' && subscription.currentPeriodEnd
        ? `${who} · 到 ${subscription.currentPeriodEnd.slice(0, 10)} 为止`
        : who,
      at,
      tone: eventTone(change.kind),
    })
  }

  return events
}

function subscriptionChangeEvent(
  before: SubscriptionStatus,
  after: SubscriptionStatus,
): { kind: PaymentEventKind; title: string } | null {
  switch (after) {
    case 'canceled':
      return { kind: 'sub_canceled', title: '订阅已取消' }
    case 'scheduled_cancel':
      return { kind: 'sub_scheduled_cancel', title: '订阅将到期取消' }
    case 'past_due':
      return { kind: 'sub_past_due', title: '订阅扣款失败' }
    case 'expired':
    case 'unpaid':
      return { kind: 'sub_expired', title: '订阅已过期' }
    case 'paused':
      return { kind: 'sub_paused', title: '订阅已暂停' }
    case 'active':
      return before === 'paused' || before === 'scheduled_cancel' || before === 'past_due'
        ? { kind: 'sub_resumed', title: '订阅已恢复' }
        : null
    case 'trialing':
      return null
    default: {
      const exhaustive: never = after
      return exhaustive
    }
  }
}

/** 需要人跟进的事件写成待办，按 dedupeKey 去重，避免每次心跳都重复。 */
export function proposePaymentTodos(events: PaymentEvent[], now = new Date()): AgentTodoDraft[] {
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(10, 0, 0, 0)
  const notifyAt = tomorrow.toISOString()
  const drafts: AgentTodoDraft[] = []
  for (const event of events) {
    switch (event.kind) {
      case 'sub_past_due':
        drafts.push({
          title: `跟进扣款失败：${event.detail}`,
          note: '给客户发一封更新支付方式的提醒，或从客户页生成账单门户链接。',
          notifyAt,
          dedupeKey: event.id,
        })
        break
      case 'sub_scheduled_cancel':
        drafts.push({
          title: `挽留到期取消：${event.detail}`,
          note: '问一句取消原因，看是否给折扣码或换更便宜的档位。',
          notifyAt,
          dedupeKey: event.id,
        })
        break
      case 'dispute':
        drafts.push({
          title: `处理拒付争议：${event.detail}`,
          note: '到 Creem Dashboard 提交交付证据；争议由 Creem 作为 MoR 承担，但仍需配合。',
          notifyAt: now.toISOString(),
          dedupeKey: event.id,
        })
        break
      case 'sale':
      case 'new_customer':
      case 'sub_new':
      case 'sub_canceled':
      case 'sub_expired':
      case 'sub_paused':
      case 'sub_resumed':
      case 'refund':
        break
      default: {
        const exhaustive: never = event.kind
        return exhaustive
      }
    }
  }
  return drafts
}

// —— 导出 ——

function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function ledgerToCsv(entries: LedgerEntry[]): string {
  const header = ['日期', '来源', '渠道', '产品', '客户', '金额', '已退款', '币种', '折人民币', '状态', '备注', 'ID']
  const rows = entries.map((entry) => [
    entry.at.slice(0, 10),
    entry.source === 'creem' ? 'Creem' : '手录',
    entry.channel,
    entry.productName,
    entry.customer,
    (entry.amount / 100).toFixed(2),
    (entry.refunded / 100).toFixed(2),
    entry.currency,
    ((entry.amountCny - entry.refundedCny) / 100).toFixed(2),
    TRANSACTION_STATUS_LABEL[entry.status],
    entry.note,
    entry.id,
  ])
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
}

export function monthlyReportCsv(points: MonthPoint[]): string {
  const header = ['月份', '收入（元）', '支出（元）', '利润（元）']
  const rows = points.map((point) => [
    point.month,
    (point.revenueCny / 100).toFixed(2),
    (point.expensesCny / 100).toFixed(2),
    ((point.revenueCny - point.expensesCny) / 100).toFixed(2),
  ])
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
}

// —— 输入归一化（IPC 边界共用） ——

export function normalizeReceiptInput(raw: unknown): ManualReceiptInput | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const record = raw as Record<string, unknown>
  if (!isDateKey(record.date) || !isManualChannelId(record.channel)) {
    return null
  }
  const amount = toCents(record.amount)
  if (amount <= 0) {
    return null
  }
  return {
    id: typeof record.id === 'string' ? record.id : undefined,
    date: record.date,
    channel: record.channel,
    amount,
    currency: normalizeCurrency(record.currency, 'CNY'),
    productId: typeof record.productId === 'string' ? record.productId : '',
    customer: typeof record.customer === 'string' ? record.customer : '',
    note: typeof record.note === 'string' ? record.note : '',
  }
}

export function normalizePayoutInput(raw: unknown): PayoutRecordInput | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const record = raw as Record<string, unknown>
  if (!isDateKey(record.date) || !isPayoutSourceId(record.source)) {
    return null
  }
  const gross = toCents(record.gross)
  if (gross <= 0) {
    return null
  }
  const currency = normalizeCurrency(record.currency, 'USD')
  return {
    id: typeof record.id === 'string' ? record.id : undefined,
    date: record.date,
    source: record.source,
    gross,
    fee: toCents(record.fee),
    currency,
    received: toCents(record.received),
    receivedCurrency: normalizeCurrency(record.receivedCurrency, 'CNY'),
    account: typeof record.account === 'string' ? record.account : '',
    note: typeof record.note === 'string' ? record.note : '',
  }
}

export function normalizeExpenseInput(raw: unknown): ExpenseRecordInput | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const record = raw as Record<string, unknown>
  if (!isDateKey(record.date) || !isExpenseCategory(record.category)) {
    return null
  }
  const amount = toCents(record.amount)
  if (amount <= 0) {
    return null
  }
  return {
    id: typeof record.id === 'string' ? record.id : undefined,
    date: record.date,
    category: record.category,
    amount,
    currency: normalizeCurrency(record.currency, 'CNY'),
    vendor: typeof record.vendor === 'string' ? record.vendor : '',
    productId: typeof record.productId === 'string' ? record.productId : '',
    note: typeof record.note === 'string' ? record.note : '',
  }
}

export function normalizeSettingsInput(raw: unknown): PaymentSettingsInput {
  if (!raw || typeof raw !== 'object') {
    return {}
  }
  const record = raw as Record<string, unknown>
  const next: PaymentSettingsInput = {}
  if (typeof record.heartbeatMinutes === 'number' && Number.isFinite(record.heartbeatMinutes)) {
    next.heartbeatMinutes = Math.max(0, Math.min(24 * 60, Math.round(record.heartbeatMinutes)))
  }
  if (typeof record.notify === 'boolean') {
    next.notify = record.notify
  }
  if (typeof record.todoFollowUp === 'boolean') {
    next.todoFollowUp = record.todoFollowUp
  }
  if (typeof record.successUrl === 'string') {
    next.successUrl = record.successUrl.trim()
  }
  if (record.rates && typeof record.rates === 'object') {
    const rates = record.rates as Record<string, unknown>
    const picked: Partial<ExchangeRates> = {}
    if (typeof rates.USD === 'number' && rates.USD > 0) {
      picked.USD = rates.USD
    }
    if (typeof rates.EUR === 'number' && rates.EUR > 0) {
      picked.EUR = rates.EUR
    }
    next.rates = picked
  }
  return next
}

export function normalizeProductInput(raw: unknown): CreateProductInput | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const record = raw as Record<string, unknown>
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const description = typeof record.description === 'string' ? record.description.trim() : ''
  const price = toCents(record.price)
  if (!name || !description || price <= 0 || !isCreemCurrency(record.currency)) {
    return null
  }
  const billingType: BillingType = record.billingType === 'recurring' ? 'recurring' : 'onetime'
  if (billingType === 'recurring' && !isBillingPeriod(record.billingPeriod)) {
    return null
  }
  return {
    name,
    description,
    price,
    currency: record.currency,
    billingType,
    billingPeriod: billingType === 'recurring' && isBillingPeriod(record.billingPeriod) ? record.billingPeriod : undefined,
    taxCategory: isTaxCategory(record.taxCategory) ? record.taxCategory : 'saas',
    taxMode: record.taxMode === 'inclusive' ? 'inclusive' : 'exclusive',
  }
}

export function normalizeCheckoutInput(raw: unknown): CreateCheckoutInput | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const record = raw as Record<string, unknown>
  if (typeof record.productId !== 'string' || !record.productId.trim()) {
    return null
  }
  const units = typeof record.units === 'number' && record.units >= 1 ? Math.round(record.units) : undefined
  return {
    productId: record.productId.trim(),
    successUrl: typeof record.successUrl === 'string' && record.successUrl.trim() ? record.successUrl.trim() : undefined,
    discountCode: typeof record.discountCode === 'string' && record.discountCode.trim() ? record.discountCode.trim() : undefined,
    customerEmail: typeof record.customerEmail === 'string' && record.customerEmail.trim() ? record.customerEmail.trim() : undefined,
    referenceId: typeof record.referenceId === 'string' && record.referenceId.trim() ? record.referenceId.trim() : undefined,
    units,
  }
}

export function normalizeDiscountInput(raw: unknown): CreateDiscountInput | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const record = raw as Record<string, unknown>
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const code = typeof record.code === 'string' ? record.code.trim().toUpperCase() : ''
  const type = record.type === 'fixed' ? 'fixed' : record.type === 'percentage' ? 'percentage' : null
  const amount = toCents(record.amount)
  if (!name || !code || !type || amount <= 0) {
    return null
  }
  if (type === 'percentage' && amount > 100) {
    return null
  }
  if (type === 'fixed' && !isCreemCurrency(record.currency)) {
    return null
  }
  const duration = record.duration === 'once' || record.duration === 'repeating' ? record.duration : 'forever'
  return {
    name,
    code,
    type,
    amount,
    currency: type === 'fixed' && isCreemCurrency(record.currency) ? record.currency : undefined,
    duration,
    durationInMonths:
      duration === 'repeating' && typeof record.durationInMonths === 'number' && record.durationInMonths >= 1
        ? Math.round(record.durationInMonths)
        : undefined,
    maxRedemptions:
      typeof record.maxRedemptions === 'number' && record.maxRedemptions >= 1 ? Math.round(record.maxRedemptions) : undefined,
    expiryDate: typeof record.expiryDate === 'string' && record.expiryDate.trim() ? record.expiryDate.trim() : undefined,
    appliesToProducts: Array.isArray(record.appliesToProducts)
      ? record.appliesToProducts.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
      : [],
  }
}
