import {
  CREEM_API_BASE,
  detectCreemEnvironment,
  isoDateKey,
  isSubscriptionStatus,
  normalizeCurrency,
  toCents,
  toTransactionStatus,
  type CreateCheckoutInput,
  type CreateDiscountInput,
  type CreateProductInput,
  type CreemCustomer,
  type CreemDiscount,
  type CreemEnvironment,
  type CreemProduct,
  type CreemSnapshot,
  type CreemSubscription,
  type CreemTransaction,
  type SubscriptionAction,
} from '../shared/payments'

const PAGE_SIZE = 100
const MAX_PAGES = 20
const TIMEOUT_MS = 15000

export class CreemApiError extends Error {
  readonly status: number
  readonly traceId: string | null

  constructor(message: string, status: number, traceId: string | null) {
    super(message)
    this.name = 'CreemApiError'
    this.status = status
    this.traceId = traceId
  }
}

type Json = Record<string, unknown>

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' ? (value as Json) : {}
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

/** 关联字段可能是展开的对象，也可能只是 ID 字符串。 */
function refId(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  return asString(asRecord(value).id)
}

function pageItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload
  }
  const record = asRecord(payload)
  if (Array.isArray(record.items)) {
    return record.items
  }
  if (Array.isArray(record.data)) {
    return record.data
  }
  return []
}

function nextPage(payload: unknown, current: number): number | null {
  const pagination = asRecord(asRecord(payload).pagination)
  const next = pagination.next_page
  if (typeof next === 'number' && next > current) {
    return next
  }
  return null
}

export class CreemClient {
  readonly environment: CreemEnvironment
  private readonly apiKey: string
  private readonly base: string

  constructor(apiKey: string) {
    const environment = detectCreemEnvironment(apiKey)
    if (!environment) {
      throw new Error('Creem API key 需以 creem_ 或 creem_test_ 开头')
    }
    this.environment = environment
    this.apiKey = apiKey.trim()
    this.base = CREEM_API_BASE[environment]
  }

  private async request(method: 'GET' | 'POST' | 'DELETE', path: string, options: { query?: Record<string, string | number | undefined>; body?: unknown } = {}): Promise<unknown> {
    const url = new URL(`${this.base}${path}`)
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value))
      }
    }
    let response: Response
    try {
      response = await fetch(url, {
        method,
        headers: {
          'x-api-key': this.apiKey,
          accept: 'application/json',
          ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new CreemApiError(`请求 Creem 失败：${reason}`, 0, null)
    }
    const text = await response.text()
    let payload: unknown = null
    if (text) {
      try {
        payload = JSON.parse(text) as unknown
      } catch {
        payload = null
      }
    }
    if (!response.ok) {
      const record = asRecord(payload)
      const message = Array.isArray(record.message)
        ? record.message.map(String).join('；')
        : asString(record.message, asString(record.error, `HTTP ${response.status}`))
      const hint = response.status === 401 || response.status === 403 ? 'API key 无效或环境不匹配：' : ''
      throw new CreemApiError(`${hint}${message}`, response.status, asNullableString(record.trace_id))
    }
    return payload
  }

  private async listAll(path: string, query: Record<string, string | number | undefined> = {}): Promise<unknown[]> {
    const items: unknown[] = []
    let page: number | null = 1
    let guard = 0
    while (page !== null && guard < MAX_PAGES) {
      guard += 1
      const payload = await this.request('GET', path, { query: { ...query, page_number: page, page_size: PAGE_SIZE } })
      const chunk = pageItems(payload)
      items.push(...chunk)
      if (chunk.length === 0) {
        break
      }
      page = nextPage(payload, page)
    }
    return items
  }

  async listProducts(): Promise<CreemProduct[]> {
    return (await this.listAll('/v1/products/search')).map(parseProduct)
  }

  async listCustomers(): Promise<CreemCustomer[]> {
    return (await this.listAll('/v1/customers/list')).map(parseCustomer)
  }

  async listSubscriptions(): Promise<unknown[]> {
    return this.listAll('/v1/subscriptions/search')
  }

  async listTransactions(): Promise<CreemTransaction[]> {
    return (await this.listAll('/v1/transactions/search')).map(parseTransaction)
  }

  async listDiscounts(): Promise<CreemDiscount[]> {
    try {
      return (await this.listAll('/v1/discounts/search')).map(parseDiscount)
    } catch (error) {
      // 折扣码接口较新，老店铺 / 沙箱返回 404 时不影响其它数据。
      if (error instanceof CreemApiError && error.status === 404) {
        return []
      }
      throw error
    }
  }

  /** 一次拉齐产品、客户、订阅、交易、折扣码，订阅里的关联对象会用产品 / 客户表补全。 */
  async snapshot(): Promise<CreemSnapshot> {
    const [products, customers, rawSubscriptions, transactions, discounts] = await Promise.all([
      this.listProducts(),
      this.listCustomers(),
      this.listSubscriptions(),
      this.listTransactions(),
      this.listDiscounts(),
    ])
    const productMap = new Map(products.map((item) => [item.id, item]))
    const customerMap = new Map(customers.map((item) => [item.id, item]))
    const subscriptions = rawSubscriptions.map((raw) => parseSubscription(raw, productMap, customerMap))
    return {
      environment: this.environment,
      fetchedAt: new Date().toISOString(),
      products,
      customers,
      subscriptions,
      transactions,
      discounts,
    }
  }

  async createProduct(input: CreateProductInput): Promise<CreemProduct> {
    const payload = await this.request('POST', '/v1/products', {
      body: {
        name: input.name,
        description: input.description,
        price: input.price,
        currency: input.currency,
        billing_type: input.billingType,
        ...(input.billingType === 'recurring' ? { billing_period: input.billingPeriod } : {}),
        tax_mode: input.taxMode,
        tax_category: input.taxCategory,
      },
    })
    return parseProduct(payload)
  }

  async createCheckout(input: CreateCheckoutInput): Promise<string> {
    const payload = asRecord(
      await this.request('POST', '/v1/checkouts', {
        body: {
          product_id: input.productId,
          ...(input.successUrl ? { success_url: input.successUrl } : {}),
          ...(input.discountCode ? { discount_code: input.discountCode } : {}),
          ...(input.customerEmail ? { customer: { email: input.customerEmail } } : {}),
          ...(input.units ? { units: input.units } : {}),
          ...(input.referenceId ? { metadata: { referenceId: input.referenceId } } : {}),
        },
      }),
    )
    const url = asString(payload.checkout_url)
    if (!url) {
      throw new CreemApiError('Creem 没有返回 checkout_url', 0, asNullableString(payload.trace_id))
    }
    return url
  }

  async billingPortalLink(customerId: string): Promise<string> {
    const payload = asRecord(await this.request('POST', '/v1/customers/billing', { body: { customer_id: customerId } }))
    const url = asString(payload.customer_portal_link)
    if (!url) {
      throw new CreemApiError('Creem 没有返回客户门户链接', 0, asNullableString(payload.trace_id))
    }
    return url
  }

  async subscriptionAction(id: string, action: SubscriptionAction): Promise<void> {
    switch (action) {
      case 'cancel-scheduled':
        await this.request('POST', `/v1/subscriptions/${encodeURIComponent(id)}/cancel`, { body: { mode: 'scheduled' } })
        return
      case 'cancel-now':
        await this.request('POST', `/v1/subscriptions/${encodeURIComponent(id)}/cancel`, { body: { mode: 'immediate' } })
        return
      case 'pause':
        await this.request('POST', `/v1/subscriptions/${encodeURIComponent(id)}/pause`)
        return
      case 'resume':
        await this.request('POST', `/v1/subscriptions/${encodeURIComponent(id)}/resume`)
        return
      default: {
        const exhaustive: never = action
        return exhaustive
      }
    }
  }

  async createDiscount(input: CreateDiscountInput): Promise<CreemDiscount> {
    const payload = await this.request('POST', '/v1/discounts', {
      body: {
        name: input.name,
        code: input.code,
        type: input.type,
        ...(input.type === 'percentage' ? { percentage: input.amount } : { amount: input.amount, currency: input.currency }),
        duration: input.duration,
        ...(input.durationInMonths ? { duration_in_months: input.durationInMonths } : {}),
        ...(input.maxRedemptions ? { max_redemptions: input.maxRedemptions } : {}),
        ...(input.expiryDate ? { expiry_date: input.expiryDate } : {}),
        applies_to_products: input.appliesToProducts,
      },
    })
    return parseDiscount(payload)
  }

  async deleteDiscount(id: string): Promise<void> {
    await this.request('DELETE', `/v1/discounts/${encodeURIComponent(id)}/delete`)
  }

  async refundTransaction(transactionId: string): Promise<void> {
    await this.request('POST', '/v1/refunds', { body: { transaction_id: transactionId } })
  }
}

export function parseProduct(raw: unknown): CreemProduct {
  const record = asRecord(raw)
  return {
    id: asString(record.id),
    name: asString(record.name),
    description: asString(record.description),
    price: toCents(record.price),
    currency: normalizeCurrency(record.currency),
    billingType: record.billing_type === 'recurring' ? 'recurring' : 'onetime',
    billingPeriod: asNullableString(record.billing_period),
    status: asString(record.status, 'active'),
    taxMode: asString(record.tax_mode, 'exclusive'),
    taxCategory: asString(record.tax_category, 'saas'),
    productUrl: asString(record.product_url),
    createdAt: isoDateKey(asString(record.created_at)),
  }
}

export function parseCustomer(raw: unknown): CreemCustomer {
  const record = asRecord(raw)
  return {
    id: asString(record.id),
    email: asString(record.email),
    name: asString(record.name),
    country: asString(record.country),
    createdAt: isoDateKey(asString(record.created_at)),
  }
}

export function parseSubscription(
  raw: unknown,
  products: Map<string, CreemProduct>,
  customers: Map<string, CreemCustomer>,
): CreemSubscription {
  const record = asRecord(raw)
  const productId = refId(record.product)
  const customerId = refId(record.customer)
  const embeddedProduct = typeof record.product === 'object' ? parseProduct(record.product) : null
  const embeddedCustomer = typeof record.customer === 'object' ? parseCustomer(record.customer) : null
  const product = products.get(productId) ?? embeddedProduct
  const customer = customers.get(customerId) ?? embeddedCustomer
  const status = isSubscriptionStatus(record.status) ? record.status : 'unpaid'
  return {
    id: asString(record.id),
    productId,
    productName: product?.name ?? productId,
    customerId,
    customerEmail: customer?.email ?? '',
    status,
    amount: product?.price ?? 0,
    currency: product?.currency ?? 'USD',
    billingPeriod: product?.billingPeriod ?? null,
    currentPeriodStart: asNullableString(record.current_period_start_date),
    currentPeriodEnd: asNullableString(record.current_period_end_date),
    nextTransactionAt: asNullableString(record.next_transaction_date),
    canceledAt: asNullableString(record.canceled_at),
    createdAt: isoDateKey(asString(record.created_at)),
  }
}

export function parseTransaction(raw: unknown): CreemTransaction {
  const record = asRecord(raw)
  const createdRaw = record.created_at
  const createdAt = typeof createdRaw === 'number' ? isoDateKey(createdRaw) : isoDateKey(asString(createdRaw))
  return {
    id: asString(record.id),
    amount: toCents(record.amount),
    amountPaid: toCents(record.amount_paid ?? record.amount),
    currency: normalizeCurrency(record.currency),
    taxAmount: toCents(record.tax_amount),
    discountAmount: toCents(record.discount_amount),
    refundedAmount: toCents(record.refunded_amount),
    status: toTransactionStatus(record.status),
    type: asString(record.type, 'payment'),
    description: asString(record.description),
    orderId: asNullableString(refId(record.order)),
    subscriptionId: asNullableString(refId(record.subscription)),
    customerId: asNullableString(refId(record.customer)),
    createdAt,
  }
}

export function parseDiscount(raw: unknown): CreemDiscount {
  const record = asRecord(raw)
  const type = record.type === 'fixed' ? 'fixed' : 'percentage'
  return {
    id: asString(record.id),
    name: asString(record.name),
    code: asString(record.code),
    type,
    amount: type === 'percentage' ? toCents(record.percentage ?? record.amount) : toCents(record.amount),
    currency: asNullableString(record.currency),
    status: asString(record.status, 'active'),
    duration: asString(record.duration, 'forever'),
    maxRedemptions: typeof record.max_redemptions === 'number' ? record.max_redemptions : null,
    redeemCount: toCents(record.redeem_count),
    expiryDate: asNullableString(record.expiry_date),
    appliesToProducts: Array.isArray(record.applies_to_products)
      ? record.applies_to_products.map(refId).filter(Boolean)
      : [],
  }
}
