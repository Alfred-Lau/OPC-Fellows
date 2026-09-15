import { clipboard, dialog, shell } from 'electron'
import type { IpcRegistrar } from '../kernel/main/ipc'
import { writeFileSync } from 'node:fs'
import { CreemApiError, type CreemClient } from './creem-client'
import {
  clearEvents,
  paymentsState,
  removeExpense,
  removePayout,
  removeReceipt,
  saveExpense,
  savePayout,
  saveReceipt,
  saveSettings,
  setApiKey,
} from './payment-store'
import { broadcastPayments, creemClient, schedulePaymentHeartbeat, syncPayments } from './payment-sync'
import {
  CREEM_DASHBOARD_URL,
  isSubscriptionAction,
  normalizeCheckoutInput,
  normalizeDiscountInput,
  normalizeExpenseInput,
  normalizePayoutInput,
  normalizeProductInput,
  normalizeReceiptInput,
  normalizeSettingsInput,
  type PaymentActionResult,
  type PaymentsState,
} from '../shared/payments'

function ok(url?: string): PaymentActionResult {
  return { ok: true, url, state: paymentsState() }
}

function fail(error: unknown): PaymentActionResult {
  const message = error instanceof CreemApiError && error.traceId
    ? `${error.message}（trace ${error.traceId}）`
    : error instanceof Error
      ? error.message
      : String(error)
  return { ok: false, error: message, state: paymentsState() }
}

/** 对 Creem 的写操作：成功后重新拉快照，让列表和 KPI 立即反映变化。 */
async function withCreem(run: (client: CreemClient) => Promise<string | void>): Promise<PaymentActionResult> {
  const resolved = creemClient()
  if ('error' in resolved) {
    return { ok: false, error: resolved.error, state: paymentsState() }
  }
  try {
    const url = await run(resolved.client)
    await syncPayments()
    return ok(url ?? undefined)
  } catch (error) {
    return fail(error)
  }
}

export function registerPaymentIpc(handle: IpcRegistrar): void {
  handle('payments:state', (): PaymentsState => paymentsState())
  handle('payments:sync', () => syncPayments())

  handle('payments:set-api-key', (_event, raw: unknown): PaymentActionResult => {
    const key = typeof raw === 'string' ? raw : null
    if (!setApiKey(key)) {
      return { ok: false, error: 'API key 需以 creem_test_（沙箱）或 creem_（生产）开头', state: paymentsState() }
    }
    schedulePaymentHeartbeat()
    broadcastPayments()
    return ok()
  })

  handle('payments:save-settings', (_event, raw: unknown): PaymentsState => {
    saveSettings(normalizeSettingsInput(raw))
    schedulePaymentHeartbeat()
    broadcastPayments()
    return paymentsState()
  })

  handle('payments:save-receipt', (_event, raw: unknown): PaymentsState => {
    const input = normalizeReceiptInput(raw)
    if (input) {
      saveReceipt(input)
      broadcastPayments()
    }
    return paymentsState()
  })
  handle('payments:remove-receipt', (_event, id: unknown): PaymentsState => {
    if (typeof id === 'string' && removeReceipt(id)) {
      broadcastPayments()
    }
    return paymentsState()
  })

  handle('payments:save-payout', (_event, raw: unknown): PaymentsState => {
    const input = normalizePayoutInput(raw)
    if (input) {
      savePayout(input)
      broadcastPayments()
    }
    return paymentsState()
  })
  handle('payments:remove-payout', (_event, id: unknown): PaymentsState => {
    if (typeof id === 'string' && removePayout(id)) {
      broadcastPayments()
    }
    return paymentsState()
  })

  handle('payments:save-expense', (_event, raw: unknown): PaymentsState => {
    const input = normalizeExpenseInput(raw)
    if (input) {
      saveExpense(input)
      broadcastPayments()
    }
    return paymentsState()
  })
  handle('payments:remove-expense', (_event, id: unknown): PaymentsState => {
    if (typeof id === 'string' && removeExpense(id)) {
      broadcastPayments()
    }
    return paymentsState()
  })

  handle('payments:clear-events', (): PaymentsState => {
    clearEvents()
    broadcastPayments()
    return paymentsState()
  })

  handle('payments:create-product', (_event, raw: unknown) => {
    const input = normalizeProductInput(raw)
    if (!input) {
      return { ok: false, error: '产品名、描述、价格、币种必填；订阅产品还需要计费周期', state: paymentsState() } satisfies PaymentActionResult
    }
    return withCreem(async (client) => {
      await client.createProduct(input)
    })
  })

  handle('payments:create-checkout', (_event, raw: unknown) => {
    const input = normalizeCheckoutInput(raw)
    if (!input) {
      return { ok: false, error: '先选一个产品', state: paymentsState() } satisfies PaymentActionResult
    }
    const resolved = creemClient()
    if ('error' in resolved) {
      return { ok: false, error: resolved.error, state: paymentsState() } satisfies PaymentActionResult
    }
    // 收款链接不改店铺数据，不用重新拉快照。
    return resolved.client
      .createCheckout(input)
      .then((url) => {
        clipboard.writeText(url)
        return ok(url)
      })
      .catch(fail)
  })

  handle('payments:billing-portal', (_event, customerId: unknown) => {
    if (typeof customerId !== 'string' || !customerId) {
      return { ok: false, error: '缺少客户 ID', state: paymentsState() } satisfies PaymentActionResult
    }
    const resolved = creemClient()
    if ('error' in resolved) {
      return { ok: false, error: resolved.error, state: paymentsState() } satisfies PaymentActionResult
    }
    return resolved.client
      .billingPortalLink(customerId)
      .then((url) => {
        clipboard.writeText(url)
        return ok(url)
      })
      .catch(fail)
  })

  handle('payments:subscription-action', (_event, id: unknown, action: unknown) => {
    if (typeof id !== 'string' || !id || !isSubscriptionAction(action)) {
      return { ok: false, error: '不支持的订阅操作', state: paymentsState() } satisfies PaymentActionResult
    }
    return withCreem(async (client) => {
      await client.subscriptionAction(id, action)
    })
  })

  handle('payments:refund', (_event, transactionId: unknown) => {
    if (typeof transactionId !== 'string' || !transactionId) {
      return { ok: false, error: '缺少交易 ID', state: paymentsState() } satisfies PaymentActionResult
    }
    return withCreem(async (client) => {
      await client.refundTransaction(transactionId)
    })
  })

  handle('payments:create-discount', (_event, raw: unknown) => {
    const input = normalizeDiscountInput(raw)
    if (!input) {
      return { ok: false, error: '折扣名、代码、类型和数值必填；固定金额需要币种', state: paymentsState() } satisfies PaymentActionResult
    }
    return withCreem(async (client) => {
      await client.createDiscount(input)
    })
  })

  handle('payments:delete-discount', (_event, id: unknown) => {
    if (typeof id !== 'string' || !id) {
      return { ok: false, error: '缺少折扣 ID', state: paymentsState() } satisfies PaymentActionResult
    }
    return withCreem(async (client) => {
      await client.deleteDiscount(id)
    })
  })

  handle('payments:copy', (_event, text: unknown): boolean => {
    if (typeof text !== 'string' || !text) {
      return false
    }
    clipboard.writeText(text)
    return true
  })

  handle('payments:open-dashboard', (_event, path: unknown): Promise<void> => {
    const suffix = typeof path === 'string' && path.startsWith('/') ? path : ''
    return shell.openExternal(`${CREEM_DASHBOARD_URL}${suffix}`)
  })

  handle('payments:export-csv', async (_event, name: unknown, csv: unknown): Promise<boolean> => {
    if (typeof csv !== 'string' || !csv) {
      return false
    }
    const safeName = typeof name === 'string' && name ? name.replace(/[^\w\u4e00-\u9fa5.-]+/g, '-') : 'payments'
    const result = await dialog.showSaveDialog({
      title: '导出 CSV',
      defaultPath: `${safeName}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    })
    if (result.canceled || !result.filePath) {
      return false
    }
    // 带 BOM，Excel / Numbers 打开中文不乱码。
    writeFileSync(result.filePath, `\ufeff${csv}`, 'utf8')
    return true
  })
}
