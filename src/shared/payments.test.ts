import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_RATES,
  buildLedger,
  defaultCurrencyForChannel,
  detectCreemEnvironment,
  diffSnapshots,
  estimateCreemFee,
  filterLedger,
  financeSummary,
  formatMoney,
  ledgerToCsv,
  maskApiKey,
  matchManualChannel,
  monthlySeries,
  mrrByCurrency,
  normalizeDiscountInput,
  normalizeProductInput,
  normalizeReceiptInput,
  parseAmountToCents,
  proposePaymentTodos,
  refundedExTax,
  subscriptionActions,
  type CreemSnapshot,
  type CreemSubscription,
  type CreemTransaction,
  type ManualReceipt,
} from './payments.ts'

function snapshot(partial: Partial<CreemSnapshot> = {}): CreemSnapshot {
  return {
    environment: 'test',
    fetchedAt: '2026-09-07T00:00:00.000Z',
    products: [
      {
        id: 'prod_pro',
        name: 'Pro Plan',
        description: 'Monthly pro',
        price: 1999,
        currency: 'USD',
        billingType: 'recurring',
        billingPeriod: 'every-month',
        status: 'active',
        taxMode: 'exclusive',
        taxCategory: 'saas',
        productUrl: '',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    customers: [
      { id: 'cust_a', email: 'alice@example.com', name: 'Alice', country: 'US', createdAt: '2026-01-02T00:00:00.000Z' },
    ],
    subscriptions: [],
    transactions: [],
    discounts: [],
    ...partial,
  }
}

function subscription(partial: Partial<CreemSubscription> = {}): CreemSubscription {
  return {
    id: 'sub_1',
    productId: 'prod_pro',
    productName: 'Pro Plan',
    customerId: 'cust_a',
    customerEmail: 'alice@example.com',
    status: 'active',
    amount: 1999,
    currency: 'USD',
    billingPeriod: 'every-month',
    currentPeriodStart: '2026-09-01T00:00:00.000Z',
    currentPeriodEnd: '2026-10-01T00:00:00.000Z',
    nextTransactionAt: '2026-10-01T00:00:00.000Z',
    canceledAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...partial,
  }
}

function transaction(partial: Partial<CreemTransaction> = {}): CreemTransaction {
  return {
    id: 'tran_1',
    amount: 1999,
    amountPaid: 2399,
    currency: 'USD',
    taxAmount: 400,
    discountAmount: 0,
    refundedAmount: 0,
    status: 'paid',
    type: 'invoice',
    description: 'Subscription payment',
    orderId: 'ord_1',
    subscriptionId: 'sub_1',
    customerId: 'cust_a',
    createdAt: '2026-09-03T10:00:00.000Z',
    ...partial,
  }
}

function receipt(partial: Partial<ManualReceipt> = {}): ManualReceipt {
  return {
    id: 'rcpt_1',
    date: '2026-09-05',
    channel: 'wechat',
    amount: 19900,
    currency: 'CNY',
    productId: 'demo',
    customer: '小王',
    note: '年费',
    createdAt: '2026-09-05T00:00:00.000Z',
    ...partial,
  }
}

const now = new Date('2026-09-07T12:00:00')

test('按 key 前缀识别 Creem 环境并打码', () => {
  assert.equal(detectCreemEnvironment('creem_test_abcd1234'), 'test')
  assert.equal(detectCreemEnvironment('creem_live9999'), 'live')
  assert.equal(detectCreemEnvironment('sk_stripe'), null)
  assert.equal(detectCreemEnvironment(''), null)
  assert.equal(maskApiKey('creem_test_abcd1234'), 'creem_test_…1234')
  assert.equal(maskApiKey(null), '')
})

test('金额以分存储，输入解析与格式化互为逆运算', () => {
  assert.equal(parseAmountToCents('19.99'), 1999)
  assert.equal(parseAmountToCents('¥ 1,288'), 128800)
  assert.equal(parseAmountToCents('abc'), 0)
  assert.equal(parseAmountToCents('-5'), 0)
  assert.equal(formatMoney(1999, 'USD'), '$19.99')
  assert.equal(formatMoney(128800, 'CNY'), '¥1,288.00')
  assert.equal(formatMoney(-500, 'EUR'), '-€5.00')
})

test('Creem 平台费按 3.9% + 0.40 估算', () => {
  assert.equal(estimateCreemFee(2400), Math.round(2400 * 0.039 + 40))
  assert.equal(estimateCreemFee(0), 0)
})

test('退款金额从含税口径折回不含税', () => {
  assert.equal(refundedExTax(transaction({ status: 'refunded', refundedAmount: 2399 })), 1999)
  assert.equal(refundedExTax(transaction({ status: 'partialRefund', refundedAmount: 1200 })), 1000)
  assert.equal(refundedExTax(transaction({ refundedAmount: 0 })), 0)
})

test('订阅操作按状态给出，已结束的订阅没有操作', () => {
  assert.deepEqual(subscriptionActions('active'), ['cancel-scheduled', 'cancel-now', 'pause'])
  assert.deepEqual(subscriptionActions('scheduled_cancel'), ['resume', 'cancel-now'])
  assert.deepEqual(subscriptionActions('paused'), ['resume', 'cancel-now'])
  assert.deepEqual(subscriptionActions('canceled'), [])
  assert.deepEqual(subscriptionActions('expired'), [])
})

test('MRR 只算仍在计费的订阅，并把年付折成月', () => {
  const mrr = mrrByCurrency([
    subscription({ id: 'a', status: 'active', amount: 1200, billingPeriod: 'every-year' }),
    subscription({ id: 'b', status: 'past_due', amount: 1000 }),
    subscription({ id: 'c', status: 'canceled', amount: 5000 }),
    subscription({ id: 'd', status: 'active', amount: 900, currency: 'EUR', billingPeriod: 'every-three-months' }),
  ])
  assert.deepEqual(mrr, [
    { currency: 'EUR', cents: 300 },
    { currency: 'USD', cents: 1100 },
  ])
})

test('统一流水合并 Creem 交易与手录收款，折人民币并按时间倒序', () => {
  const snap = snapshot({
    subscriptions: [subscription()],
    transactions: [
      transaction(),
      transaction({ id: 'tran_pending', status: 'pending', createdAt: '2026-09-06T00:00:00.000Z' }),
    ],
  })
  const ledger = buildLedger(snap, [receipt()], DEFAULT_RATES, (id) => (id === 'demo' ? '示例产品' : id))
  assert.equal(ledger.length, 2)
  assert.equal(ledger[0]?.source, 'manual')
  assert.equal(ledger[0]?.productName, '示例产品')
  assert.equal(ledger[0]?.channel, '微信')
  assert.equal(ledger[0]?.amountCny, 19900)
  assert.equal(ledger[1]?.source, 'creem')
  assert.equal(ledger[1]?.productName, 'Pro Plan')
  assert.equal(ledger[1]?.customer, 'alice@example.com')
  assert.equal(ledger[1]?.amountCny, Math.round(1999 * DEFAULT_RATES.USD))

  assert.equal(filterLedger(ledger, { month: '2026-09', source: 'creem', productId: 'all', query: '' }).length, 1)
  assert.equal(filterLedger(ledger, { month: 'all', source: 'all', productId: 'all', query: 'alice' }).length, 1)
  assert.equal(filterLedger(ledger, { month: '2026-08', source: 'all', productId: 'all', query: '' }).length, 0)
})

test('财务汇总：本月 / 上月收入、利润、待结算与需关注项', () => {
  const snap = snapshot({
    subscriptions: [subscription(), subscription({ id: 'sub_late', status: 'past_due', customerId: 'cust_b' })],
    transactions: [
      transaction(),
      transaction({ id: 'tran_aug', createdAt: '2026-08-15T00:00:00.000Z' }),
      transaction({ id: 'tran_refund', status: 'refunded', refundedAmount: 2399, createdAt: '2026-09-04T00:00:00.000Z' }),
    ],
  })
  const ledger = buildLedger(snap, [receipt()], DEFAULT_RATES, (id) => id)
  const expenses = [
    { id: 'e1', date: '2026-09-02', category: 'SaaS 订阅' as const, amount: 2000, currency: 'USD', vendor: 'Vercel', productId: '', note: '', createdAt: '' },
  ]
  const payouts = [
    { id: 'p1', date: '2026-09-01', source: 'creem' as const, gross: 5000, fee: 700, currency: 'USD', received: 30000, receivedCurrency: 'CNY', account: '', note: '', createdAt: '' },
  ]
  const summary = financeSummary(ledger, snap, payouts, expenses, DEFAULT_RATES, now)
  const usd = (cents: number): number => Math.round(cents * DEFAULT_RATES.USD)

  assert.equal(summary.month, '2026-09')
  assert.equal(summary.monthRevenueCny, usd(1999) + 19900)
  assert.equal(summary.lastMonthRevenueCny, usd(1999))
  assert.equal(summary.totalRefundsCny, usd(1999))
  assert.equal(summary.monthExpensesCny, usd(2000))
  assert.equal(summary.monthProfitCny, summary.monthRevenueCny - usd(2000))
  assert.equal(summary.activeSubscriptions, 2)
  assert.equal(summary.attention.pastDue, 1)
  assert.equal(summary.attention.refunds, 1)
  assert.equal(summary.mrr[0]?.cents, 3998)
  const fee = usd(estimateCreemFee(2399)) * 3
  assert.equal(summary.creemFeeCny, fee)
  assert.equal(summary.pendingSettlementCny, usd(1999) * 2 - fee - usd(5000))
})

test('月度序列固定 12 个月，缺月补零', () => {
  const ledger = buildLedger(snapshot({ subscriptions: [subscription()], transactions: [transaction()] }), [], DEFAULT_RATES, (id) => id)
  const series = monthlySeries(ledger, [], DEFAULT_RATES, 12, now)
  assert.equal(series.length, 12)
  assert.equal(series[0]?.month, '2025-10')
  assert.equal(series.at(-1)?.month, '2026-09')
  assert.equal(series.at(-1)?.revenueCny, Math.round(1999 * DEFAULT_RATES.USD))
  assert.equal(series[0]?.revenueCny, 0)
})

test('心跳 diff：新收款、新客户、订阅状态变化，首轮不报', () => {
  const before = snapshot({
    subscriptions: [subscription(), subscription({ id: 'sub_2', status: 'paused', customerEmail: 'bob@example.com' })],
    transactions: [transaction()],
  })
  assert.deepEqual(diffSnapshots(null, before, now), [])
  const after = snapshot({
    customers: [...before.customers, { id: 'cust_c', email: 'carol@example.com', name: '', country: 'DE', createdAt: '' }],
    subscriptions: [
      subscription({ status: 'scheduled_cancel' }),
      subscription({ id: 'sub_2', status: 'active', customerEmail: 'bob@example.com' }),
      subscription({ id: 'sub_3', status: 'trialing', customerEmail: 'carol@example.com' }),
    ],
    transactions: [
      transaction(),
      transaction({ id: 'tran_2', amount: 4900, amountPaid: 4900, type: 'payment', subscriptionId: null, customerId: 'cust_c', description: 'Lifetime' }),
    ],
  })
  const events = diffSnapshots(before, after, now)
  const kinds = events.map((event) => event.kind).sort()
  assert.deepEqual(kinds, ['new_customer', 'sale', 'sub_new', 'sub_resumed', 'sub_scheduled_cancel'])
  const sale = events.find((event) => event.kind === 'sale')
  assert.equal(sale?.title, '新收款 $49.00')
  assert.match(sale?.detail ?? '', /carol@example.com/)
  const cancel = events.find((event) => event.kind === 'sub_scheduled_cancel')
  assert.match(cancel?.detail ?? '', /2026-10-01/)
})

test('心跳事件里只有需要跟进的才写待办，并带去重键', () => {
  const events = diffSnapshots(
    snapshot({ subscriptions: [subscription(), subscription({ id: 'sub_2' })] }),
    snapshot({ subscriptions: [subscription({ status: 'past_due' }), subscription({ id: 'sub_2', status: 'canceled' })] }),
    now,
  )
  const drafts = proposePaymentTodos(events, now)
  assert.equal(drafts.length, 1)
  assert.match(drafts[0]?.title ?? '', /扣款失败/)
  assert.equal(drafts[0]?.dedupeKey, 'sub:sub_1:past_due')
})

test('CSV 导出带表头并转义逗号', () => {
  const ledger = buildLedger(null, [receipt({ note: '年费, 含发票' })], DEFAULT_RATES, (id) => id)
  const csv = ledgerToCsv(ledger)
  const lines = csv.split('\n')
  assert.equal(lines.length, 2)
  assert.match(lines[0] ?? '', /^日期,来源,渠道/)
  assert.match(lines[1] ?? '', /"年费, 含发票"/)
  assert.match(lines[1] ?? '', /199\.00/)
})

test('手录渠道按最长别名匹配，并给出默认币种', () => {
  assert.equal(matchManualChannel('入账 199 微信扫码'), 'wechat-qr')
  assert.equal(matchManualChannel('入账 199 微信'), 'wechat')
  assert.equal(matchManualChannel('知识星球续费'), 'zsxq')
  assert.equal(matchManualChannel('小红书分账到账'), 'xiaohongshu')
  assert.equal(matchManualChannel('Patreon pledge'), 'patreon')
  assert.equal(matchManualChannel('没有渠道'), undefined)
  assert.equal(defaultCurrencyForChannel('wechat-qr'), 'CNY')
  assert.equal(defaultCurrencyForChannel('zsxq'), 'CNY')
  assert.equal(defaultCurrencyForChannel('patreon'), 'USD')
})

test('IPC 输入归一化拒绝残缺数据', () => {
  assert.equal(normalizeReceiptInput({ date: '2026-9-1', channel: 'wechat', amount: 100 }), null)
  assert.equal(normalizeReceiptInput({ date: '2026-09-01', channel: 'paypal', amount: 100 }), null)
  assert.equal(normalizeReceiptInput({ date: '2026-09-01', channel: 'wechat', amount: 0 }), null)
  assert.equal(normalizeReceiptInput({ date: '2026-09-01', channel: 'wechat-qr', amount: 19900 })?.channel, 'wechat-qr')
  assert.equal(normalizeReceiptInput({ date: '2026-09-01', channel: 'zsxq', amount: 9900 })?.channel, 'zsxq')
  assert.deepEqual(normalizeReceiptInput({ date: '2026-09-01', channel: 'wechat', amount: 100.4, currency: 'cny' }), {
    id: undefined,
    date: '2026-09-01',
    channel: 'wechat',
    amount: 100,
    currency: 'CNY',
    productId: '',
    customer: '',
    note: '',
  })
  assert.equal(normalizeProductInput({ name: 'Pro', description: '', price: 1999, currency: 'USD', billingType: 'onetime' }), null)
  assert.equal(normalizeProductInput({ name: 'Pro', description: 'x', price: 1999, currency: 'USD', billingType: 'recurring' }), null)
  assert.equal(normalizeProductInput({ name: 'Pro', description: 'x', price: 1999, currency: 'USD', billingType: 'recurring', billingPeriod: 'every-month' })?.billingPeriod, 'every-month')
  assert.equal(normalizeDiscountInput({ name: 'x', code: 'a', type: 'percentage', amount: 120 }), null)
  assert.equal(normalizeDiscountInput({ name: 'x', code: 'a', type: 'fixed', amount: 500 }), null)
  assert.equal(normalizeDiscountInput({ name: 'x', code: 'launch20', type: 'percentage', amount: 20 })?.code, 'LAUNCH20')
})
