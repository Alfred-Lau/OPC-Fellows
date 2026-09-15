import { dayKey } from '../../shared/datetime'
import {
  BILLING_PERIODS,
  BILLING_PERIOD_LABEL,
  CHANNEL_GROUPS,
  DEFAULT_SETTINGS,
  EXPENSE_CATEGORIES,
  MANUAL_CHANNELS,
  PAYMENT_GROUPS,
  PAYOUT_SOURCES,
  SUBSCRIPTION_ACTION_LABEL,
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_STATUS_LABEL,
  TRANSACTION_STATUS_LABEL,
  breakdownBy,
  buildLedger,
  customerDigests,
  defaultCurrencyForChannel,
  defaultCurrencyForPayoutSource,
  filterLedger,
  financeSummary,
  formatCny,
  formatMoney,
  isBillingPeriod,
  isCreemCurrency,
  isExpenseCategory,
  isManualChannelId,
  isPaymentGroupId,
  isPayoutSourceId,
  isSubscriptionStatus,
  isTaxCategory,
  ledgerMonths,
  ledgerToCsv,
  monthlyReportCsv,
  monthlySeries,
  parseAmountToCents,
  subscriptionActions,
  sumByCurrency,
  toCny,
  type CreemDiscount,
  type CreemProduct,
  type CreemSubscription,
  type ExpenseRecord,
  type LedgerEntry,
  type LedgerFilter,
  type ManualReceipt,
  type PaymentActionResult,
  type PaymentEvent,
  type PaymentGroupId,
  type PaymentsState,
  type PayoutRecord,
  type SubscriptionStatus,
} from '../../shared/payments'
import { getProducts } from '../../shared/products'

const GROUP_KEY = 'ownworkbuddy.paymentsGroup'
const SUBS_FILTER_KEY = 'ownworkbuddy.paymentsSubsFilter'

const envEl = required('#pay-env', HTMLSpanElement)
const statusEl = required('#pay-status', HTMLParagraphElement)
const syncBtn = required('#pay-sync', HTMLButtonElement)
const dashboardBtn = required('#pay-dashboard', HTMLButtonElement)
const navEl = required('#pay-nav', HTMLElement)

const kpisEl = required('#pay-kpis', HTMLDivElement)
const attentionEl = required('#pay-attention', HTMLDivElement)
const overviewMeta = required('#pay-overview-meta', HTMLSpanElement)
const chartEl = required('#pay-month-chart', HTMLDivElement)
const chartMeta = required('#pay-chart-meta', HTMLSpanElement)
const byProductEl = required('#pay-by-product', HTMLDivElement)
const byChannelEl = required('#pay-by-channel', HTMLDivElement)
const eventsEl = required('#pay-events', HTMLUListElement)
const eventsClear = required('#pay-events-clear', HTMLButtonElement)

const ledgerMonth = required('#pay-ledger-month', HTMLSelectElement)
const ledgerSource = required('#pay-ledger-source', HTMLSelectElement)
const ledgerProduct = required('#pay-ledger-product', HTMLSelectElement)
const ledgerQuery = required('#pay-ledger-query', HTMLInputElement)
const ledgerSummary = required('#pay-ledger-summary', HTMLDivElement)
const ledgerEl = required('#pay-ledger', HTMLUListElement)
const exportLedgerBtn = required('#pay-export-ledger', HTMLButtonElement)

const receiptForm = required('#pay-receipt-form', HTMLFormElement)
const receiptId = required('#pay-receipt-id', HTMLInputElement)
const receiptDate = required('#pay-receipt-date', HTMLInputElement)
const receiptChannel = required('#pay-receipt-channel', HTMLSelectElement)
const receiptAmount = required('#pay-receipt-amount', HTMLInputElement)
const receiptCurrency = required('#pay-receipt-currency', HTMLSelectElement)
const receiptProduct = required('#pay-receipt-product', HTMLSelectElement)
const receiptCustomer = required('#pay-receipt-customer', HTMLInputElement)
const receiptNote = required('#pay-receipt-note', HTMLInputElement)
const receiptSubmit = required('#pay-receipt-submit', HTMLButtonElement)
const receiptCancel = required('#pay-receipt-cancel', HTMLButtonElement)

const subsMeta = required('#pay-subs-meta', HTMLSpanElement)
const subsSummary = required('#pay-subs-summary', HTMLDivElement)
const subsFilters = required('#pay-subs-filters', HTMLDivElement)
const subsEl = required('#pay-subs', HTMLUListElement)

const customersMeta = required('#pay-customers-meta', HTMLSpanElement)
const customerQuery = required('#pay-customer-query', HTMLInputElement)
const customersEl = required('#pay-customers', HTMLUListElement)

const productsMeta = required('#pay-products-meta', HTMLSpanElement)
const productsEl = required('#pay-products', HTMLUListElement)
const checkoutForm = required('#pay-checkout-form', HTMLFormElement)
const checkoutProduct = required('#pay-checkout-product', HTMLSelectElement)
const checkoutEmail = required('#pay-checkout-email', HTMLInputElement)
const checkoutDiscount = required('#pay-checkout-discount', HTMLInputElement)
const checkoutSuccess = required('#pay-checkout-success', HTMLInputElement)
const checkoutReference = required('#pay-checkout-reference', HTMLInputElement)
const checkoutResult = required('#pay-checkout-result', HTMLParagraphElement)
const productForm = required('#pay-product-form', HTMLFormElement)
const productName = required('#pay-product-name', HTMLInputElement)
const productDescription = required('#pay-product-description', HTMLInputElement)
const productPrice = required('#pay-product-price', HTMLInputElement)
const productCurrency = required('#pay-product-currency', HTMLSelectElement)
const productBilling = required('#pay-product-billing', HTMLSelectElement)
const productPeriod = required('#pay-product-period', HTMLSelectElement)
const productTax = required('#pay-product-tax', HTMLSelectElement)
const productTaxMode = required('#pay-product-taxmode', HTMLSelectElement)
const discountsMeta = required('#pay-discounts-meta', HTMLSpanElement)
const discountsEl = required('#pay-discounts', HTMLUListElement)
const discountForm = required('#pay-discount-form', HTMLFormElement)
const discountName = required('#pay-discount-name', HTMLInputElement)
const discountCode = required('#pay-discount-code', HTMLInputElement)
const discountType = required('#pay-discount-type', HTMLSelectElement)
const discountAmount = required('#pay-discount-amount', HTMLInputElement)
const discountCurrency = required('#pay-discount-currency', HTMLSelectElement)
const discountDuration = required('#pay-discount-duration', HTMLSelectElement)
const discountMonths = required('#pay-discount-months', HTMLInputElement)
const discountMax = required('#pay-discount-max', HTMLInputElement)
const discountExpiry = required('#pay-discount-expiry', HTMLInputElement)
const discountProducts = required('#pay-discount-products', HTMLSelectElement)

const payoutsMeta = required('#pay-payouts-meta', HTMLSpanElement)
const payoutsSummary = required('#pay-payouts-summary', HTMLDivElement)
const payoutsEl = required('#pay-payouts', HTMLUListElement)
const payoutForm = required('#pay-payout-form', HTMLFormElement)
const payoutId = required('#pay-payout-id', HTMLInputElement)
const payoutDate = required('#pay-payout-date', HTMLInputElement)
const payoutSource = required('#pay-payout-source', HTMLSelectElement)
const payoutGross = required('#pay-payout-gross', HTMLInputElement)
const payoutFee = required('#pay-payout-fee', HTMLInputElement)
const payoutCurrency = required('#pay-payout-currency', HTMLSelectElement)
const payoutReceived = required('#pay-payout-received', HTMLInputElement)
const payoutReceivedCurrency = required('#pay-payout-received-currency', HTMLSelectElement)
const payoutAccount = required('#pay-payout-account', HTMLInputElement)
const payoutNote = required('#pay-payout-note', HTMLInputElement)
const payoutSubmit = required('#pay-payout-submit', HTMLButtonElement)
const payoutCancel = required('#pay-payout-cancel', HTMLButtonElement)

const expensesSummary = required('#pay-expenses-summary', HTMLDivElement)
const expensesByCategory = required('#pay-expenses-by-category', HTMLDivElement)
const expensesEl = required('#pay-expenses', HTMLUListElement)
const exportReportBtn = required('#pay-export-report', HTMLButtonElement)
const expenseForm = required('#pay-expense-form', HTMLFormElement)
const expenseId = required('#pay-expense-id', HTMLInputElement)
const expenseDate = required('#pay-expense-date', HTMLInputElement)
const expenseCategory = required('#pay-expense-category', HTMLSelectElement)
const expenseAmount = required('#pay-expense-amount', HTMLInputElement)
const expenseCurrency = required('#pay-expense-currency', HTMLSelectElement)
const expenseVendor = required('#pay-expense-vendor', HTMLInputElement)
const expenseProduct = required('#pay-expense-product', HTMLSelectElement)
const expenseNote = required('#pay-expense-note', HTMLInputElement)
const expenseSubmit = required('#pay-expense-submit', HTMLButtonElement)
const expenseCancel = required('#pay-expense-cancel', HTMLButtonElement)

const keyStatus = required('#pay-key-status', HTMLParagraphElement)
const keyForm = required('#pay-key-form', HTMLFormElement)
const keyInput = required('#pay-key-input', HTMLInputElement)
const keyClear = required('#pay-key-clear', HTMLButtonElement)
const settingsForm = required('#pay-settings-form', HTMLFormElement)
const setHeartbeat = required('#pay-set-heartbeat', HTMLSelectElement)
const setNotify = required('#pay-set-notify', HTMLInputElement)
const setTodo = required('#pay-set-todo', HTMLInputElement)
const setSuccess = required('#pay-set-success', HTMLInputElement)
const setUsd = required('#pay-set-usd', HTMLInputElement)
const setEur = required('#pay-set-eur', HTMLInputElement)

let state: PaymentsState = {
  settings: DEFAULT_SETTINGS,
  snapshot: null,
  receipts: [],
  payouts: [],
  expenses: [],
  events: [],
  syncing: false,
  lastError: null,
}
let ledger: LedgerEntry[] = []
let currentGroup: PaymentGroupId = readGroup()
let subsFilter: SubscriptionStatus | 'all' = readSubsFilter()
let ledgerFilter: LedgerFilter = { month: 'all', source: 'all', productId: 'all', query: '' }
let bound = false
let unsubscribe: (() => void) | null = null

function required<T extends typeof HTMLElement>(selector: string, ctor: T): InstanceType<T> {
  const node = document.querySelector(selector)
  if (!(node instanceof ctor)) {
    throw new Error(`missing ${selector}`)
  }
  return node as InstanceType<T>
}

function readGroup(): PaymentGroupId {
  const raw = localStorage.getItem(GROUP_KEY)
  return isPaymentGroupId(raw) ? raw : 'overview'
}

function readSubsFilter(): SubscriptionStatus | 'all' {
  const raw = localStorage.getItem(SUBS_FILTER_KEY)
  return isSubscriptionStatus(raw) ? raw : 'all'
}

function productLabel(id: string): string {
  return getProducts().find((item) => item.id === id)?.name ?? id
}

function relative(iso: string): string {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) {
    return ''
  }
  const diff = Date.now() - time
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) {
    return '刚刚'
  }
  if (minutes < 60) {
    return `${minutes} 分钟前`
  }
  const hours = Math.round(minutes / 60)
  if (hours < 24) {
    return `${hours} 小时前`
  }
  const days = Math.round(hours / 24)
  if (days < 30) {
    return `${days} 天前`
  }
  return iso.slice(0, 10)
}

function shortDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '—'
}

// —— 生命周期 ——

export function revealPaymentsGroup(id: PaymentGroupId): void {
  currentGroup = id
  localStorage.setItem(GROUP_KEY, currentGroup)
  renderNav()
}

export function activatePayments(): void {
  bindPayments()
  void refreshPayments()
}

export async function refreshPayments(): Promise<void> {
  applyState(await window.ownworkbuddy.payments.state())
}

function applyState(next: PaymentsState): void {
  state = next
  ledger = buildLedger(state.snapshot, state.receipts, state.settings.rates, productLabel)
  render()
}

function bindPayments(): void {
  if (bound) {
    return
  }
  bound = true
  fillStaticSelects()
  receiptDate.value = dayKey(new Date())
  payoutDate.value = dayKey(new Date())
  expenseDate.value = dayKey(new Date())

  unsubscribe?.()
  unsubscribe = window.ownworkbuddy.payments.onChanged((next) => {
    applyState(next)
  })

  syncBtn.addEventListener('click', () => {
    void window.ownworkbuddy.payments.sync().then(applyState)
  })
  dashboardBtn.addEventListener('click', () => {
    void window.ownworkbuddy.payments.openDashboard()
  })
  eventsClear.addEventListener('click', () => {
    void window.ownworkbuddy.payments.clearEvents().then(applyState)
  })

  ledgerMonth.addEventListener('change', () => {
    ledgerFilter = { ...ledgerFilter, month: ledgerMonth.value === 'all' ? 'all' : ledgerMonth.value }
    renderLedger()
  })
  ledgerSource.addEventListener('change', () => {
    const value = ledgerSource.value
    ledgerFilter = { ...ledgerFilter, source: value === 'creem' || value === 'manual' ? value : 'all' }
    renderLedger()
  })
  ledgerProduct.addEventListener('change', () => {
    ledgerFilter = { ...ledgerFilter, productId: ledgerProduct.value === 'all' ? 'all' : ledgerProduct.value }
    renderLedger()
  })
  ledgerQuery.addEventListener('input', () => {
    ledgerFilter = { ...ledgerFilter, query: ledgerQuery.value }
    renderLedger()
  })
  exportLedgerBtn.addEventListener('click', () => {
    const rows = filterLedger(ledger, ledgerFilter)
    const name = ledgerFilter.month === 'all' ? '收款流水-全部' : `收款流水-${ledgerFilter.month}`
    void window.ownworkbuddy.payments.exportCsv(name, ledgerToCsv(rows))
  })

  receiptForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void submitReceipt()
  })
  receiptCancel.addEventListener('click', () => {
    resetReceiptForm()
  })
  receiptChannel.addEventListener('change', () => {
    if (isManualChannelId(receiptChannel.value)) {
      receiptCurrency.value = defaultCurrencyForChannel(receiptChannel.value)
    }
  })

  customerQuery.addEventListener('input', () => {
    renderCustomers()
  })

  checkoutForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void submitCheckout()
  })
  productBilling.addEventListener('change', () => {
    productPeriod.disabled = productBilling.value !== 'recurring'
  })
  productForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void submitProduct()
  })
  discountType.addEventListener('change', () => {
    discountCurrency.disabled = discountType.value !== 'fixed'
  })
  discountDuration.addEventListener('change', () => {
    discountMonths.disabled = discountDuration.value !== 'repeating'
  })
  discountForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void submitDiscount()
  })

  payoutForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void submitPayout()
  })
  payoutCancel.addEventListener('click', () => {
    resetPayoutForm()
  })
  payoutSource.addEventListener('change', () => {
    if (isPayoutSourceId(payoutSource.value)) {
      payoutCurrency.value = defaultCurrencyForPayoutSource(payoutSource.value)
    }
  })

  expenseForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void submitExpense()
  })
  expenseCancel.addEventListener('click', () => {
    resetExpenseForm()
  })
  exportReportBtn.addEventListener('click', () => {
    const points = monthlySeries(ledger, state.expenses, state.settings.rates, 12)
    void window.ownworkbuddy.payments.exportCsv('财务月报', monthlyReportCsv(points))
  })

  keyForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void submitApiKey()
  })
  keyClear.addEventListener('click', () => {
    if (!window.confirm('清除本机保存的 Creem API key？已同步的快照和动态也会一起清掉。')) {
      return
    }
    void window.ownworkbuddy.payments.setApiKey(null).then(handleAction(keyStatus))
  })
  settingsForm.addEventListener('submit', (event) => {
    event.preventDefault()
    void submitSettings()
  })

  productPeriod.disabled = productBilling.value !== 'recurring'
  discountCurrency.disabled = discountType.value !== 'fixed'
  discountMonths.disabled = discountDuration.value !== 'repeating'
}

function fillStaticSelects(): void {
  fillGroupedOptions(receiptChannel, MANUAL_CHANNELS, CHANNEL_GROUPS)
  fillGroupedOptions(payoutSource, PAYOUT_SOURCES, CHANNEL_GROUPS)
  fillOptions(expenseCategory, EXPENSE_CATEGORIES.map((item) => [item, item]))
  fillOptions(productPeriod, BILLING_PERIODS.map((item) => [item, BILLING_PERIOD_LABEL[item]]))
  const opc: Array<[string, string]> = [['', '不关联产品'], ...getProducts().map((item): [string, string] => [item.id, item.name])]
  fillOptions(receiptProduct, opc)
  fillOptions(expenseProduct, opc)
}

function fillOptions(select: HTMLSelectElement, options: Array<[string, string]>, keep = false): void {
  const previous = select.value
  select.replaceChildren()
  for (const [value, label] of options) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label
    select.append(option)
  }
  if (keep && options.some(([value]) => value === previous)) {
    select.value = previous
  }
}

function fillGroupedOptions(
  select: HTMLSelectElement,
  items: ReadonlyArray<{ id: string; name: string; group: string }>,
  groups: ReadonlyArray<{ id: string; label: string }>,
): void {
  select.replaceChildren()
  for (const group of groups) {
    const members = items.filter((item) => item.group === group.id)
    if (members.length === 0) {
      continue
    }
    const optgroup = document.createElement('optgroup')
    optgroup.label = group.label
    for (const item of members) {
      const option = document.createElement('option')
      option.value = item.id
      option.textContent = item.name
      optgroup.append(option)
    }
    select.append(optgroup)
  }
}

function handleAction(target: HTMLElement): (result: PaymentActionResult) => void {
  return (result) => {
    applyState(result.state)
    target.classList.toggle('is-error', !result.ok)
    if (!result.ok) {
      target.textContent = result.error ?? '操作失败'
    }
  }
}

// —— 提交 ——

async function submitReceipt(): Promise<void> {
  const amount = parseAmountToCents(receiptAmount.value)
  if (amount <= 0 || !isManualChannelId(receiptChannel.value)) {
    receiptAmount.focus()
    return
  }
  const next = await window.ownworkbuddy.payments.saveReceipt({
    id: receiptId.value || undefined,
    date: receiptDate.value,
    channel: receiptChannel.value,
    amount,
    currency: receiptCurrency.value,
    productId: receiptProduct.value,
    customer: receiptCustomer.value,
    note: receiptNote.value,
  })
  resetReceiptForm()
  applyState(next)
}

function resetReceiptForm(): void {
  receiptForm.reset()
  receiptId.value = ''
  receiptDate.value = dayKey(new Date())
  receiptSubmit.textContent = '记一笔'
  receiptCancel.hidden = true
}

function editReceipt(receipt: ManualReceipt): void {
  receiptId.value = receipt.id
  receiptDate.value = receipt.date
  receiptChannel.value = receipt.channel
  receiptAmount.value = (receipt.amount / 100).toFixed(2)
  receiptCurrency.value = receipt.currency
  receiptProduct.value = receipt.productId
  receiptCustomer.value = receipt.customer
  receiptNote.value = receipt.note
  receiptSubmit.textContent = '保存修改'
  receiptCancel.hidden = false
  receiptAmount.focus()
}

async function submitCheckout(): Promise<void> {
  if (!checkoutProduct.value) {
    checkoutResult.classList.add('is-error')
    checkoutResult.textContent = '先同步 Creem，再选一个产品'
    return
  }
  checkoutResult.classList.remove('is-error')
  checkoutResult.textContent = '生成中…'
  const result = await window.ownworkbuddy.payments.createCheckout({
    productId: checkoutProduct.value,
    customerEmail: checkoutEmail.value,
    discountCode: checkoutDiscount.value,
    successUrl: checkoutSuccess.value || state.settings.successUrl,
    referenceId: checkoutReference.value,
  })
  applyState(result.state)
  checkoutResult.replaceChildren()
  checkoutResult.classList.toggle('is-error', !result.ok)
  if (!result.ok || !result.url) {
    checkoutResult.textContent = result.error ?? '生成失败'
    return
  }
  const note = document.createElement('span')
  note.textContent = '已复制到剪贴板 · '
  const link = document.createElement('a')
  link.href = result.url
  link.target = '_blank'
  link.rel = 'noreferrer'
  link.textContent = result.url
  checkoutResult.append(note, link)
}

async function submitProduct(): Promise<void> {
  const price = parseAmountToCents(productPrice.value)
  if (price <= 0 || !isCreemCurrency(productCurrency.value)) {
    productPrice.focus()
    return
  }
  const billingType = productBilling.value === 'recurring' ? 'recurring' : 'onetime'
  const result = await window.ownworkbuddy.payments.createProduct({
    name: productName.value,
    description: productDescription.value,
    price,
    currency: productCurrency.value,
    billingType,
    billingPeriod: billingType === 'recurring' && isBillingPeriod(productPeriod.value) ? productPeriod.value : undefined,
    taxCategory: isTaxCategory(productTax.value) ? productTax.value : 'saas',
    taxMode: productTaxMode.value === 'inclusive' ? 'inclusive' : 'exclusive',
  })
  handleAction(statusEl)(result)
  if (result.ok) {
    productForm.reset()
    productPeriod.disabled = true
  }
}

async function submitDiscount(): Promise<void> {
  const type = discountType.value === 'fixed' ? 'fixed' : 'percentage'
  const amount = type === 'percentage' ? Math.round(Number(discountAmount.value)) : parseAmountToCents(discountAmount.value)
  if (!Number.isFinite(amount) || amount <= 0) {
    discountAmount.focus()
    return
  }
  const duration = discountDuration.value === 'once' || discountDuration.value === 'repeating' ? discountDuration.value : 'forever'
  const expiry = discountExpiry.value ? new Date(`${discountExpiry.value}T23:59:59`).toISOString() : undefined
  const result = await window.ownworkbuddy.payments.createDiscount({
    name: discountName.value,
    code: discountCode.value,
    type,
    amount,
    currency: type === 'fixed' && isCreemCurrency(discountCurrency.value) ? discountCurrency.value : undefined,
    duration,
    durationInMonths: duration === 'repeating' ? Number(discountMonths.value) || undefined : undefined,
    maxRedemptions: Number(discountMax.value) || undefined,
    expiryDate: expiry,
    appliesToProducts: [...discountProducts.selectedOptions].map((option) => option.value).filter(Boolean),
  })
  handleAction(statusEl)(result)
  if (result.ok) {
    discountForm.reset()
    discountCurrency.disabled = true
    discountMonths.disabled = true
  }
}

async function submitPayout(): Promise<void> {
  const gross = parseAmountToCents(payoutGross.value)
  if (gross <= 0 || !isPayoutSourceId(payoutSource.value)) {
    payoutGross.focus()
    return
  }
  const fee = parseAmountToCents(payoutFee.value)
  const received = payoutReceived.value.trim() ? parseAmountToCents(payoutReceived.value) : gross - fee
  const next = await window.ownworkbuddy.payments.savePayout({
    id: payoutId.value || undefined,
    date: payoutDate.value,
    source: payoutSource.value,
    gross,
    fee,
    currency: payoutCurrency.value,
    received: Math.max(0, received),
    receivedCurrency: payoutReceived.value.trim() ? payoutReceivedCurrency.value : payoutCurrency.value,
    account: payoutAccount.value,
    note: payoutNote.value,
  })
  resetPayoutForm()
  applyState(next)
}

function resetPayoutForm(): void {
  payoutForm.reset()
  payoutId.value = ''
  payoutDate.value = dayKey(new Date())
  payoutSubmit.textContent = '记到账'
  payoutCancel.hidden = true
}

function editPayout(payout: PayoutRecord): void {
  payoutId.value = payout.id
  payoutDate.value = payout.date
  payoutSource.value = payout.source
  payoutGross.value = (payout.gross / 100).toFixed(2)
  payoutFee.value = (payout.fee / 100).toFixed(2)
  payoutCurrency.value = payout.currency
  payoutReceived.value = (payout.received / 100).toFixed(2)
  payoutReceivedCurrency.value = payout.receivedCurrency
  payoutAccount.value = payout.account
  payoutNote.value = payout.note
  payoutSubmit.textContent = '保存修改'
  payoutCancel.hidden = false
  payoutGross.focus()
}

async function submitExpense(): Promise<void> {
  const amount = parseAmountToCents(expenseAmount.value)
  if (amount <= 0 || !isExpenseCategory(expenseCategory.value)) {
    expenseAmount.focus()
    return
  }
  const next = await window.ownworkbuddy.payments.saveExpense({
    id: expenseId.value || undefined,
    date: expenseDate.value,
    category: expenseCategory.value,
    amount,
    currency: expenseCurrency.value,
    vendor: expenseVendor.value,
    productId: expenseProduct.value,
    note: expenseNote.value,
  })
  resetExpenseForm()
  applyState(next)
}

function resetExpenseForm(): void {
  expenseForm.reset()
  expenseId.value = ''
  expenseDate.value = dayKey(new Date())
  expenseSubmit.textContent = '记支出'
  expenseCancel.hidden = true
}

function editExpense(expense: ExpenseRecord): void {
  expenseId.value = expense.id
  expenseDate.value = expense.date
  expenseCategory.value = expense.category
  expenseAmount.value = (expense.amount / 100).toFixed(2)
  expenseCurrency.value = expense.currency
  expenseVendor.value = expense.vendor
  expenseProduct.value = expense.productId
  expenseNote.value = expense.note
  expenseSubmit.textContent = '保存修改'
  expenseCancel.hidden = false
  expenseAmount.focus()
}

async function submitApiKey(): Promise<void> {
  const key = keyInput.value.trim()
  if (!key) {
    keyInput.focus()
    return
  }
  keyStatus.classList.remove('is-error')
  keyStatus.textContent = '保存中…'
  const result = await window.ownworkbuddy.payments.setApiKey(key)
  handleAction(keyStatus)(result)
  if (result.ok) {
    keyInput.value = ''
    void window.ownworkbuddy.payments.sync().then(applyState)
  }
}

async function submitSettings(): Promise<void> {
  const next = await window.ownworkbuddy.payments.saveSettings({
    heartbeatMinutes: Number(setHeartbeat.value) || 0,
    notify: setNotify.checked,
    todoFollowUp: setTodo.checked,
    successUrl: setSuccess.value,
    rates: {
      USD: Number(setUsd.value) || undefined,
      EUR: Number(setEur.value) || undefined,
    },
  })
  applyState(next)
}

// —— 渲染 ——

function render(): void {
  renderHead()
  renderNav()
  renderOverview()
  renderLedgerFilters()
  renderLedger()
  renderSubscriptions()
  renderCustomers()
  renderProducts()
  renderDiscounts()
  renderPayouts()
  renderExpenses()
  renderSettings()
}

function renderHead(): void {
  const { settings, snapshot } = state
  envEl.textContent = settings.environment === 'test' ? '沙箱' : settings.environment === 'live' ? '生产' : '未接入'
  syncBtn.disabled = state.syncing || !settings.hasApiKey
  statusEl.classList.toggle('is-error', Boolean(state.lastError))
  if (state.syncing) {
    statusEl.dataset.syncing = ''
  } else {
    delete statusEl.dataset.syncing
  }
  if (state.lastError) {
    statusEl.textContent = state.lastError
    return
  }
  if (!settings.hasApiKey) {
    statusEl.textContent = '海外 MoR 走 Creem；分账、知识星球、微信扫码和海外社媒靠手录。先到「Creem 设置」填 API key。'
    return
  }
  if (!snapshot) {
    statusEl.textContent = 'key 已就绪，点「同步 Creem」拉产品、客户、订阅和交易。'
    return
  }
  statusEl.textContent = `Creem ${snapshot.environment === 'test' ? '沙箱' : '生产'} · ${snapshot.transactions.length} 笔交易 · ${snapshot.subscriptions.length} 个订阅 · ${snapshot.customers.length} 位客户 · 更新于 ${relative(snapshot.fetchedAt)}`
}

function renderNav(): void {
  const summary = financeSummary(ledger, state.snapshot, state.payouts, state.expenses, state.settings.rates)
  const attention = summary.attention.pastDue + summary.attention.scheduledCancel + summary.attention.disputes
  navEl.replaceChildren()
  for (const group of PAYMENT_GROUPS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'monitor-nav-item'
    const isCurrent = group.id === currentGroup
    button.classList.toggle('is-current', isCurrent)
    if (isCurrent) {
      button.setAttribute('aria-current', 'true')
    }
    const label = document.createElement('span')
    label.className = 'monitor-nav-label'
    label.textContent = group.label
    button.append(label)
    const badge = navBadge(group.id, attention)
    if (badge) {
      const chip = document.createElement('span')
      chip.className = `monitor-nav-badge is-${badge.tone}`
      chip.textContent = badge.text
      button.append(chip)
    }
    button.addEventListener('click', () => {
      currentGroup = group.id
      localStorage.setItem(GROUP_KEY, currentGroup)
      renderNav()
      showGroup()
    })
    navEl.append(button)
  }
  showGroup()
}

function navBadge(group: PaymentGroupId, attention: number): { text: string; tone: 'danger' | 'ok' | 'muted' } | null {
  switch (group) {
    case 'overview':
      return state.events.length > 0 ? { text: String(state.events.length), tone: 'muted' } : null
    case 'subscriptions':
      return attention > 0 ? { text: String(attention), tone: 'danger' } : null
    case 'settings':
      return state.settings.hasApiKey ? null : { text: '!', tone: 'danger' }
    case 'transactions':
    case 'customers':
    case 'products':
    case 'payouts':
    case 'expenses':
      return null
    default: {
      const exhaustive: never = group
      return exhaustive
    }
  }
}

function showGroup(): void {
  for (const node of document.querySelectorAll<HTMLElement>('#view-payments .pay-group')) {
    node.hidden = node.dataset.group !== currentGroup
  }
}

function stat(label: string, value: string, tone: 'key' | 'warn' | 'muted' | 'plain' = 'plain', sub?: string): HTMLDivElement {
  const box = document.createElement('div')
  box.className = 'users-stat'
  if (tone !== 'plain') {
    box.classList.add(`is-${tone}`)
  }
  const strong = document.createElement('b')
  strong.textContent = value
  const caption = document.createElement('i')
  caption.textContent = label
  box.append(strong, caption)
  if (sub) {
    const small = document.createElement('small')
    small.textContent = sub
    box.append(small)
  }
  return box
}

function emptyRow(text: string): HTMLLIElement {
  const item = document.createElement('li')
  item.className = 'empty'
  item.textContent = text
  return item
}

function badge(text: string, tone: 'ok' | 'warn' | 'muted' | 'brass' = 'brass'): HTMLSpanElement {
  const node = document.createElement('span')
  node.className = 'pay-badge'
  if (tone !== 'brass') {
    node.classList.add(`is-${tone}`)
  }
  node.textContent = text
  return node
}

function row(options: {
  title: string
  badges?: HTMLSpanElement[]
  meta: string
  amount?: string
  amountTone?: 'ok' | 'negative' | 'muted'
  amountSub?: string
  actions?: HTMLButtonElement[]
}): HTMLLIElement {
  const item = document.createElement('li')
  item.className = 'pay-row'
  const main = document.createElement('div')
  main.className = 'pay-row-main'
  const title = document.createElement('div')
  title.className = 'pay-row-title'
  const name = document.createElement('span')
  name.textContent = options.title
  title.append(name, ...(options.badges ?? []))
  const meta = document.createElement('div')
  meta.className = 'pay-row-meta'
  meta.textContent = options.meta
  meta.title = options.meta
  main.append(title, meta)
  const side = document.createElement('div')
  side.className = 'pay-row-side'
  if (options.amount) {
    const amount = document.createElement('span')
    amount.className = 'pay-amount'
    if (options.amountTone === 'negative') {
      amount.classList.add('is-negative')
    } else if (options.amountTone === 'muted') {
      amount.classList.add('is-muted')
    }
    amount.textContent = options.amount
    if (options.amountSub) {
      const small = document.createElement('small')
      small.textContent = options.amountSub
      amount.append(small)
    }
    side.append(amount)
  }
  if (options.actions && options.actions.length > 0) {
    const actions = document.createElement('div')
    actions.className = 'pay-row-actions'
    actions.append(...options.actions)
    side.append(actions)
  }
  item.append(main, side)
  return item
}

function actionButton(label: string, onClick: () => void, ghost = false): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  if (ghost) {
    button.className = 'ghost'
  }
  button.textContent = label
  button.addEventListener('click', onClick)
  return button
}

function renderBreakdown(root: HTMLElement, rows: ReturnType<typeof breakdownBy>, empty: string): void {
  root.replaceChildren()
  if (rows.length === 0) {
    const text = document.createElement('p')
    text.className = 'empty'
    text.textContent = empty
    root.append(text)
    return
  }
  const max = Math.max(...rows.map((item) => item.cny), 1)
  for (const item of rows.slice(0, 8)) {
    const line = document.createElement('div')
    line.className = 'pay-bar'
    const label = document.createElement('span')
    label.textContent = item.label
    label.title = item.label
    const track = document.createElement('span')
    track.className = 'track'
    const fill = document.createElement('i')
    fill.style.width = `${Math.max(2, Math.round((item.cny / max) * 100))}%`
    track.append(fill)
    const value = document.createElement('b')
    value.textContent = formatCny(item.cny)
    const count = document.createElement('small')
    count.textContent = `${item.count} 笔`
    value.append(count)
    line.append(label, track, value)
    root.append(line)
  }
}

function renderOverview(): void {
  const summary = financeSummary(ledger, state.snapshot, state.payouts, state.expenses, state.settings.rates)
  overviewMeta.textContent = summary.month
  kpisEl.replaceChildren(
    stat('本月收入', formatCny(summary.monthRevenueCny), 'key', `上月 ${formatCny(summary.lastMonthRevenueCny)}`),
    stat('本月支出', formatCny(summary.monthExpensesCny), summary.monthExpensesCny > 0 ? 'warn' : 'muted'),
    stat('本月利润', formatCny(summary.monthProfitCny), summary.monthProfitCny >= 0 ? 'key' : 'warn'),
    stat(
      'MRR',
      formatCny(summary.mrrCny),
      'plain',
      summary.mrr.length > 0 ? summary.mrr.map((item) => formatMoney(item.cents, item.currency)).join(' + ') : `ARR ${formatCny(summary.arrCny)}`,
    ),
    stat('活跃订阅', String(summary.activeSubscriptions), 'plain', `客户 ${summary.customers}`),
    stat('累计收入', formatCny(summary.totalRevenueCny), 'plain', `退款 ${formatCny(summary.totalRefundsCny)}`),
    stat('Creem 费用估算', formatCny(summary.creemFeeCny), 'muted', '3.9% + 0.40'),
    stat('待结算估算', formatCny(summary.pendingSettlementCny), summary.pendingSettlementCny >= 5000 * 100 ? 'key' : 'muted', `已提现 ${formatCny(summary.totalPayoutsCny)}`),
  )

  attentionEl.replaceChildren()
  const alerts: Array<[number, string, PaymentGroupId, SubscriptionStatus | null]> = [
    [summary.attention.pastDue, '扣款失败', 'subscriptions', 'past_due'],
    [summary.attention.scheduledCancel, '到期取消', 'subscriptions', 'scheduled_cancel'],
    [summary.attention.disputes, '拒付争议', 'transactions', null],
    [summary.attention.refunds, '退款', 'transactions', null],
  ]
  for (const [count, label, group, status] of alerts) {
    if (count === 0) {
      continue
    }
    attentionEl.append(
      actionButton(`${label} ${count}`, () => {
        currentGroup = group
        localStorage.setItem(GROUP_KEY, currentGroup)
        if (status) {
          subsFilter = status
          localStorage.setItem(SUBS_FILTER_KEY, subsFilter)
          renderSubscriptions()
        }
        renderNav()
      }),
    )
  }

  const points = monthlySeries(ledger, state.expenses, state.settings.rates, 12)
  const total = points.reduce((sum, point) => sum + point.revenueCny, 0)
  chartMeta.textContent = total > 0 ? `合计 ${formatCny(total)}` : ''
  chartEl.replaceChildren()
  const max = Math.max(...points.map((point) => Math.max(point.revenueCny, point.expensesCny)), 1)
  if (total === 0 && points.every((point) => point.expensesCny === 0)) {
    const empty = document.createElement('p')
    empty.className = 'pay-chart-empty'
    empty.textContent = '还没有收入或支出数据'
    chartEl.append(empty)
  } else {
    const current = points.at(-1)?.month
    for (const point of points) {
      const col = document.createElement('div')
      col.className = 'pay-chart-col'
      col.classList.toggle('is-current', point.month === current)
      col.title = `${point.month} 收入 ${formatCny(point.revenueCny)} · 支出 ${formatCny(point.expensesCny)}`
      const revenue = document.createElement('i')
      revenue.style.height = `${Math.max(2, Math.round((point.revenueCny / max) * 100))}%`
      const spend = document.createElement('i')
      spend.className = 'is-spend'
      spend.style.height = `${Math.max(2, Math.round((point.expensesCny / max) * 100))}%`
      const label = document.createElement('b')
      label.textContent = point.month.slice(5)
      col.append(revenue, spend, label)
      chartEl.append(col)
    }
  }

  renderBreakdown(
    byProductEl,
    breakdownBy(ledger, (entry) => ({ key: entry.productId || entry.productName || '未归类', label: entry.productName || '未归类' })),
    '同步 Creem 或手录一笔后这里会按产品汇总',
  )
  renderBreakdown(
    byChannelEl,
    breakdownBy(ledger, (entry) => ({ key: entry.channel, label: entry.channel })),
    '还没有收入',
  )

  eventsEl.replaceChildren()
  if (state.events.length === 0) {
    eventsEl.append(emptyRow(state.settings.hasApiKey ? '心跳还没发现变化：新收款、订阅取消、扣款失败会出现在这里' : '接入 Creem 后这里会显示店铺动态'))
  } else {
    for (const event of state.events.slice(0, 40)) {
      eventsEl.append(eventRow(event))
    }
  }
}

function eventRow(event: PaymentEvent): HTMLLIElement {
  const item = document.createElement('li')
  item.className = `pay-event is-${event.tone}`
  const body = document.createElement('div')
  const title = document.createElement('strong')
  title.textContent = event.title
  const detail = document.createElement('p')
  detail.textContent = event.detail
  detail.title = event.detail
  body.append(title, detail)
  const time = document.createElement('time')
  time.dateTime = event.at
  time.textContent = relative(event.at)
  item.append(body, time)
  return item
}

function renderLedgerFilters(): void {
  const months = ledgerMonths(ledger)
  fillOptions(ledgerMonth, [['all', '全部月份'], ...months.map((month): [string, string] => [month, month])], true)
  if (!months.includes(ledgerFilter.month) && ledgerFilter.month !== 'all') {
    ledgerFilter = { ...ledgerFilter, month: 'all' }
  }
  ledgerMonth.value = ledgerFilter.month
  const products = new Map<string, string>()
  for (const entry of ledger) {
    if (entry.productId) {
      products.set(entry.productId, entry.productName)
    }
  }
  fillOptions(ledgerProduct, [['all', '全部产品'], ...[...products.entries()].map(([id, name]): [string, string] => [id, name])], true)
  if (ledgerFilter.productId !== 'all' && !products.has(ledgerFilter.productId)) {
    ledgerFilter = { ...ledgerFilter, productId: 'all' }
  }
  ledgerProduct.value = ledgerFilter.productId
  ledgerSource.value = ledgerFilter.source
}

function renderLedger(): void {
  const rows = filterLedger(ledger, ledgerFilter)
  const net = rows.reduce((sum, entry) => sum + entry.amountCny - entry.refundedCny, 0)
  const refunds = rows.reduce((sum, entry) => sum + entry.refundedCny, 0)
  const native = sumByCurrency(rows.map((entry) => ({ currency: entry.currency, cents: entry.amount - entry.refunded })))
  ledgerSummary.replaceChildren(
    stat('笔数', String(rows.length)),
    stat('净收入（折人民币）', formatCny(net), 'key', native.map((item) => formatMoney(item.cents, item.currency)).join(' + ') || undefined),
    stat('退款', formatCny(refunds), refunds > 0 ? 'warn' : 'muted'),
  )
  ledgerEl.replaceChildren()
  if (rows.length === 0) {
    ledgerEl.append(emptyRow(ledger.length === 0 ? '同步 Creem 或在下方手录第一笔收款' : '这个筛选下没有交易'))
    return
  }
  const receipts = new Map(state.receipts.map((item) => [item.id, item]))
  for (const entry of rows.slice(0, 300)) {
    const tone = entry.status === 'paid' ? 'ok' : entry.status === 'chargedBack' ? 'warn' : entry.status === 'refunded' || entry.status === 'partialRefund' ? 'warn' : 'muted'
    const badges = [badge(entry.channel, 'brass')]
    if (entry.status !== 'paid') {
      badges.push(badge(TRANSACTION_STATUS_LABEL[entry.status], tone))
    }
    const actions: HTMLButtonElement[] = []
    if (entry.source === 'manual') {
      const receipt = receipts.get(entry.id)
      if (receipt) {
        actions.push(
          actionButton('改', () => editReceipt(receipt), true),
          actionButton('删', () => {
            void window.ownworkbuddy.payments.removeReceipt(receipt.id).then(applyState)
          }, true),
        )
      }
    } else if (entry.status === 'paid') {
      actions.push(
        actionButton('退款', () => {
          if (!window.confirm(`全额退款 ${formatMoney(entry.amount, entry.currency)} 给 ${entry.customer || '该客户'}？Creem 会同步扣回已结算金额。`)) {
            return
          }
          void window.ownworkbuddy.payments.refund(entry.id).then(handleAction(statusEl))
        }, true),
      )
    }
    const net = entry.amount - entry.refunded
    ledgerEl.append(
      row({
        title: entry.productName || entry.note || entry.channel,
        badges,
        meta: [entry.at.slice(0, 10), entry.customer, entry.note !== entry.productName ? entry.note : ''].filter(Boolean).join(' · '),
        amount: formatMoney(net, entry.currency),
        amountTone: net <= 0 ? 'muted' : 'ok',
        amountSub: entry.currency === 'CNY' ? undefined : `≈ ${formatCny(entry.amountCny - entry.refundedCny)}`,
        actions,
      }),
    )
  }
}

function renderSubscriptions(): void {
  const subscriptions = state.snapshot?.subscriptions ?? []
  const counts = new Map<SubscriptionStatus, number>()
  for (const item of subscriptions) {
    counts.set(item.status, (counts.get(item.status) ?? 0) + 1)
  }
  subsMeta.textContent = subscriptions.length > 0 ? `${subscriptions.length} 个` : ''
  const summary = financeSummary(ledger, state.snapshot, state.payouts, state.expenses, state.settings.rates)
  subsSummary.replaceChildren(
    stat('活跃', String(counts.get('active') ?? 0), 'key'),
    stat('试用', String(counts.get('trialing') ?? 0)),
    stat('扣款失败', String(counts.get('past_due') ?? 0), (counts.get('past_due') ?? 0) > 0 ? 'warn' : 'muted'),
    stat('到期取消', String(counts.get('scheduled_cancel') ?? 0), (counts.get('scheduled_cancel') ?? 0) > 0 ? 'warn' : 'muted'),
    stat('MRR', summary.mrr.map((item) => formatMoney(item.cents, item.currency)).join(' + ') || formatCny(0), 'plain', `≈ ${formatCny(summary.mrrCny)}`),
  )

  subsFilters.replaceChildren()
  const filters: Array<[SubscriptionStatus | 'all', string]> = [
    ['all', `全部 ${subscriptions.length}`],
    ...SUBSCRIPTION_STATUSES.filter((status) => (counts.get(status) ?? 0) > 0).map(
      (status): [SubscriptionStatus, string] => [status, `${SUBSCRIPTION_STATUS_LABEL[status]} ${counts.get(status) ?? 0}`],
    ),
  ]
  for (const [id, label] of filters) {
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'social-chip'
    chip.classList.toggle('is-current', subsFilter === id)
    chip.textContent = label
    chip.addEventListener('click', () => {
      subsFilter = id
      localStorage.setItem(SUBS_FILTER_KEY, id)
      renderSubscriptions()
    })
    subsFilters.append(chip)
  }

  subsEl.replaceChildren()
  const visible = subscriptions
    .filter((item) => subsFilter === 'all' || item.status === subsFilter)
    .sort((left, right) => (right.nextTransactionAt ?? right.createdAt).localeCompare(left.nextTransactionAt ?? left.createdAt))
  if (visible.length === 0) {
    subsEl.append(emptyRow(subscriptions.length === 0 ? '还没有订阅数据，先同步 Creem' : '这个状态下没有订阅'))
    return
  }
  for (const subscription of visible) {
    subsEl.append(subscriptionRow(subscription))
  }
}

function subscriptionRow(subscription: CreemSubscription): HTMLLIElement {
  const tone = subscription.status === 'active' || subscription.status === 'trialing'
    ? 'ok'
    : subscription.status === 'past_due' || subscription.status === 'scheduled_cancel'
      ? 'warn'
      : 'muted'
  const period = isBillingPeriod(subscription.billingPeriod) ? BILLING_PERIOD_LABEL[subscription.billingPeriod] : ''
  const meta = [
    subscription.customerEmail,
    subscription.status === 'scheduled_cancel' || subscription.status === 'canceled'
      ? `到 ${shortDate(subscription.currentPeriodEnd)} 止`
      : subscription.nextTransactionAt
        ? `下次扣款 ${shortDate(subscription.nextTransactionAt)}`
        : `开始于 ${shortDate(subscription.createdAt)}`,
    subscription.id,
  ]
    .filter(Boolean)
    .join(' · ')
  const actions = subscriptionActions(subscription.status).map((action) =>
    actionButton(
      SUBSCRIPTION_ACTION_LABEL[action],
      () => {
        const danger = action === 'cancel-now'
        const message = danger
          ? `立即取消 ${subscription.customerEmail} 的「${subscription.productName}」？客户会马上失去访问，Creem 建议优先用「到期取消」。`
          : `${SUBSCRIPTION_ACTION_LABEL[action]} ${subscription.customerEmail} 的「${subscription.productName}」？`
        if (!window.confirm(message)) {
          return
        }
        void window.ownworkbuddy.payments.subscriptionAction(subscription.id, action).then(handleAction(statusEl))
      },
      action === 'cancel-now',
    ),
  )
  return row({
    title: subscription.productName,
    badges: [badge(SUBSCRIPTION_STATUS_LABEL[subscription.status], tone)],
    meta,
    amount: formatMoney(subscription.amount, subscription.currency),
    amountTone: tone === 'muted' ? 'muted' : 'ok',
    amountSub: period ? `/ ${period}` : undefined,
    actions,
  })
}

function renderCustomers(): void {
  const digests = customerDigests(state.snapshot)
  customersMeta.textContent = digests.length > 0 ? `${digests.length} 位` : ''
  const query = customerQuery.value.trim().toLowerCase()
  const visible = query
    ? digests.filter((item) =>
        `${item.customer.email} ${item.customer.name} ${item.customer.country} ${item.customer.id}`.toLowerCase().includes(query),
      )
    : digests
  customersEl.replaceChildren()
  if (visible.length === 0) {
    customersEl.append(emptyRow(digests.length === 0 ? '还没有客户数据，先同步 Creem' : '没有匹配的客户'))
    return
  }
  for (const digest of visible.slice(0, 200)) {
    const active = digest.subscriptions.filter((item) => item.status === 'active' || item.status === 'trialing' || item.status === 'past_due' || item.status === 'scheduled_cancel')
    const badges = active.length > 0 ? [badge(`${active.length} 个订阅`, 'ok')] : digest.subscriptions.length > 0 ? [badge('订阅已结束', 'muted')] : []
    const lifetime = digest.lifetime.map((item) => formatMoney(item.cents, item.currency)).join(' + ')
    customersEl.append(
      row({
        title: digest.customer.email || digest.customer.id,
        badges,
        meta: [digest.customer.name, digest.customer.country, digest.lastPaidAt ? `最近付款 ${shortDate(digest.lastPaidAt)}` : `注册于 ${shortDate(digest.customer.createdAt)}`, digest.customer.id]
          .filter(Boolean)
          .join(' · '),
        amount: lifetime || formatMoney(0, 'USD'),
        amountTone: lifetime ? 'ok' : 'muted',
        actions: [
          actionButton('账单门户链接', () => {
            void window.ownworkbuddy.payments.billingPortal(digest.customer.id).then((result) => {
              handleAction(statusEl)(result)
              if (result.ok) {
                statusEl.classList.remove('is-error')
                statusEl.textContent = `已复制 ${digest.customer.email} 的账单门户链接，发给客户即可自助改卡 / 下载发票 / 取消订阅。`
              }
            })
          }),
          actionButton('复制邮箱', () => {
            void window.ownworkbuddy.payments.copy(digest.customer.email)
          }, true),
        ],
      }),
    )
  }
}

function renderProducts(): void {
  const products = state.snapshot?.products ?? []
  productsMeta.textContent = products.length > 0 ? `${products.length} 个` : ''
  const options = products.map((item): [string, string] => [item.id, `${item.name} · ${formatMoney(item.price, item.currency)}${item.billingType === 'recurring' ? ' 订阅' : ''}`])
  fillOptions(checkoutProduct, options.length > 0 ? options : [['', '先同步 Creem']], true)
  fillOptions(discountProducts, products.map((item): [string, string] => [item.id, item.name]), true)
  productsEl.replaceChildren()
  if (products.length === 0) {
    productsEl.append(emptyRow(state.settings.hasApiKey ? '店铺里还没有产品，用右下方表单建一个' : '接入 Creem 后这里列出所有可售产品'))
    return
  }
  const subscriptions = state.snapshot?.subscriptions ?? []
  for (const product of products) {
    productsEl.append(productRow(product, subscriptions.filter((item) => item.productId === product.id)))
  }
}

function productRow(product: CreemProduct, subscriptions: CreemSubscription[]): HTMLLIElement {
  const active = subscriptions.filter((item) => item.status === 'active' || item.status === 'trialing').length
  const period = isBillingPeriod(product.billingPeriod) ? BILLING_PERIOD_LABEL[product.billingPeriod] : ''
  const badges = [badge(product.billingType === 'recurring' ? `订阅 · ${period}` : '一次性', 'brass')]
  if (product.status !== 'active') {
    badges.push(badge(product.status, 'muted'))
  }
  const actions = [
    actionButton('收款链接', () => {
      checkoutProduct.value = product.id
      void submitCheckout()
    }),
  ]
  if (product.productUrl) {
    actions.push(
      actionButton('复制商品页', () => {
        void window.ownworkbuddy.payments.copy(product.productUrl)
      }, true),
    )
  }
  return row({
    title: product.name,
    badges,
    meta: [product.description, product.billingType === 'recurring' ? `${active} 个活跃订阅` : '', `${product.taxCategory} · ${product.taxMode === 'inclusive' ? '价内税' : '价外税'}`, product.id]
      .filter(Boolean)
      .join(' · '),
    amount: formatMoney(product.price, product.currency),
    amountTone: 'ok',
    actions,
  })
}

function renderDiscounts(): void {
  const discounts = state.snapshot?.discounts ?? []
  discountsMeta.textContent = discounts.length > 0 ? `${discounts.length} 个` : ''
  discountsEl.replaceChildren()
  if (discounts.length === 0) {
    discountsEl.append(emptyRow('还没有折扣码；上线、挽留、老客回购都可以先建一个'))
    return
  }
  const products = new Map((state.snapshot?.products ?? []).map((item) => [item.id, item.name]))
  for (const discount of discounts) {
    discountsEl.append(discountRow(discount, products))
  }
}

function discountRow(discount: CreemDiscount, products: Map<string, string>): HTMLLIElement {
  const value = discount.type === 'percentage' ? `${discount.amount}%` : formatMoney(discount.amount, discount.currency ?? 'USD')
  const durationLabel = discount.duration === 'once' ? '仅首期' : discount.duration === 'repeating' ? '若干月' : '永久'
  const scope = discount.appliesToProducts.length > 0 ? discount.appliesToProducts.map((id) => products.get(id) ?? id).join('、') : '全部产品'
  const meta = [
    discount.name,
    durationLabel,
    discount.maxRedemptions !== null ? `${discount.redeemCount}/${discount.maxRedemptions} 次` : `${discount.redeemCount} 次`,
    discount.expiryDate ? `到 ${shortDate(discount.expiryDate)}` : '',
    scope,
  ]
    .filter(Boolean)
    .join(' · ')
  return row({
    title: discount.code,
    badges: [badge(discount.status === 'active' ? '可用' : discount.status, discount.status === 'active' ? 'ok' : 'muted')],
    meta,
    amount: value,
    amountTone: 'ok',
    actions: [
      actionButton('复制', () => {
        void window.ownworkbuddy.payments.copy(discount.code)
      }, true),
      actionButton('删除', () => {
        if (!window.confirm(`删除折扣码 ${discount.code}？已使用的订阅不受影响。`)) {
          return
        }
        void window.ownworkbuddy.payments.deleteDiscount(discount.id).then(handleAction(statusEl))
      }, true),
    ],
  })
}

function renderPayouts(): void {
  const summary = financeSummary(ledger, state.snapshot, state.payouts, state.expenses, state.settings.rates)
  const rates = state.settings.rates
  payoutsMeta.textContent = state.payouts.length > 0 ? `${state.payouts.length} 笔` : ''
  const gross = sumByCurrency(state.payouts.map((item) => ({ currency: item.currency, cents: item.gross })))
  const fees = state.payouts.reduce((sum, item) => sum + toCny(item.fee, item.currency, rates), 0)
  const received = sumByCurrency(state.payouts.map((item) => ({ currency: item.receivedCurrency, cents: item.received })))
  payoutsSummary.replaceChildren(
    stat('待结算估算', formatCny(summary.pendingSettlementCny), summary.pendingSettlementCny > 0 ? 'key' : 'muted', 'Creem 净收入 − 已提现'),
    stat('已提现', gross.map((item) => formatMoney(item.cents, item.currency)).join(' + ') || formatCny(0), 'plain', `≈ ${formatCny(summary.totalPayoutsCny)}`),
    stat('提现手续费', formatCny(fees), fees > 0 ? 'warn' : 'muted'),
    stat('实际到账', received.map((item) => formatMoney(item.cents, item.currency)).join(' + ') || formatCny(0), 'key'),
  )
  payoutsEl.replaceChildren()
  if (state.payouts.length === 0) {
    payoutsEl.append(emptyRow('Creem 打款到账后在下方记一笔，含手续费和实际到账，方便对账报税'))
    return
  }
  const sorted = [...state.payouts].sort((left, right) => right.date.localeCompare(left.date))
  for (const payout of sorted) {
    const source = PAYOUT_SOURCES.find((item) => item.id === payout.source)?.name ?? payout.source
    payoutsEl.append(
      row({
        title: `${source} 结算`,
        badges: payout.fee > 0 ? [badge(`手续费 ${formatMoney(payout.fee, payout.currency)}`, 'muted')] : [],
        meta: [payout.date, payout.account, payout.note].filter(Boolean).join(' · '),
        amount: formatMoney(payout.received, payout.receivedCurrency),
        amountTone: 'ok',
        amountSub: payout.receivedCurrency !== payout.currency || payout.fee > 0 ? `提 ${formatMoney(payout.gross, payout.currency)}` : undefined,
        actions: [
          actionButton('改', () => editPayout(payout), true),
          actionButton('删', () => {
            void window.ownworkbuddy.payments.removePayout(payout.id).then(applyState)
          }, true),
        ],
      }),
    )
  }
}

function renderExpenses(): void {
  const summary = financeSummary(ledger, state.snapshot, state.payouts, state.expenses, state.settings.rates)
  const rates = state.settings.rates
  expensesSummary.replaceChildren(
    stat('本月支出', formatCny(summary.monthExpensesCny), summary.monthExpensesCny > 0 ? 'warn' : 'muted'),
    stat('本月收入', formatCny(summary.monthRevenueCny), 'key'),
    stat('本月利润', formatCny(summary.monthProfitCny), summary.monthProfitCny >= 0 ? 'key' : 'warn'),
    stat('累计支出', formatCny(summary.totalExpensesCny), 'plain', `累计收入 ${formatCny(summary.totalRevenueCny)}`),
  )
  const byCategory = new Map<string, { key: string; label: string; cny: number; count: number }>()
  for (const expense of state.expenses) {
    const item = byCategory.get(expense.category) ?? { key: expense.category, label: expense.category, cny: 0, count: 0 }
    item.cny += toCny(expense.amount, expense.currency, rates)
    item.count += 1
    byCategory.set(expense.category, item)
  }
  renderBreakdown(expensesByCategory, [...byCategory.values()].sort((left, right) => right.cny - left.cny), '记下 SaaS、云服务、模型账单，利润才算得准')
  expensesEl.replaceChildren()
  if (state.expenses.length === 0) {
    expensesEl.append(emptyRow('还没有支出记录'))
    return
  }
  const sorted = [...state.expenses].sort((left, right) => right.date.localeCompare(left.date))
  for (const expense of sorted.slice(0, 300)) {
    expensesEl.append(
      row({
        title: expense.vendor || expense.category,
        badges: [badge(expense.category, 'muted')],
        meta: [expense.date, expense.productId ? productLabel(expense.productId) : '', expense.note].filter(Boolean).join(' · '),
        amount: `-${formatMoney(expense.amount, expense.currency)}`,
        amountTone: 'negative',
        amountSub: expense.currency === 'CNY' ? undefined : `≈ ${formatCny(toCny(expense.amount, expense.currency, rates))}`,
        actions: [
          actionButton('改', () => editExpense(expense), true),
          actionButton('删', () => {
            void window.ownworkbuddy.payments.removeExpense(expense.id).then(applyState)
          }, true),
        ],
      }),
    )
  }
}

function renderSettings(): void {
  const { settings } = state
  if (!keyStatus.classList.contains('is-error')) {
    keyStatus.textContent = settings.hasApiKey
      ? `已配置 ${settings.keyPreview}（${settings.environment === 'test' ? '沙箱' : '生产'} · ${settings.keySource === 'env' ? '来自环境变量 CREEM_API_KEY' : '本机加密存储'}）`
      : '未配置。到 Creem Dashboard → Developers → API Keys 复制一把 key。'
  }
  keyClear.disabled = !settings.hasApiKey || settings.keySource === 'env'
  if (document.activeElement !== setHeartbeat) {
    const wanted = String(settings.heartbeatMinutes)
    if (![...setHeartbeat.options].some((option) => option.value === wanted)) {
      const option = document.createElement('option')
      option.value = wanted
      option.textContent = `${wanted} 分钟`
      setHeartbeat.append(option)
    }
    setHeartbeat.value = wanted
  }
  setNotify.checked = settings.notify
  setTodo.checked = settings.todoFollowUp
  if (document.activeElement !== setSuccess) {
    setSuccess.value = settings.successUrl
  }
  if (document.activeElement !== setUsd) {
    setUsd.value = String(settings.rates.USD)
  }
  if (document.activeElement !== setEur) {
    setEur.value = String(settings.rates.EUR)
  }
}
