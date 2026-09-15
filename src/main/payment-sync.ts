import { BrowserWindow, Notification } from 'electron'
import { ingestTodos } from './todo-ingest'
import { CreemClient } from './creem-client'
import {
  applySnapshot,
  paymentsSettings,
  paymentsState,
  resolveApiKey,
  setLastError,
  setSyncing,
} from './payment-store'
import {
  PAYMENT_AGENT_ID,
  PAYMENT_TAG,
  proposePaymentTodos,
  type PaymentEvent,
  type PaymentsState,
} from '../shared/payments'

const MIN_HEARTBEAT_MS = 5 * 60_000

let timer: NodeJS.Timeout | null = null
let inflight: Promise<PaymentsState> | null = null
let onNotificationClick: () => void = () => undefined

export function setPaymentNotifyClickHandler(handler: () => void): void {
  onNotificationClick = handler
}

/** 有 key 就返回客户端，没有就返回可读的原因。 */
export function creemClient(): { client: CreemClient } | { error: string } {
  const { key } = resolveApiKey()
  if (!key) {
    return { error: '还没有配置 Creem API key。到「Creem 设置」填入 creem_test_… 或 creem_… 开头的 key。' }
  }
  try {
    return { client: new CreemClient(key) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

export function broadcastPayments(): void {
  const state = paymentsState()
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('payments:changed', state)
    }
  }
}

/** 拉一次 Creem 全量快照。并发调用共用同一个请求。 */
export function syncPayments(): Promise<PaymentsState> {
  if (inflight) {
    return inflight
  }
  inflight = runSync().finally(() => {
    inflight = null
  })
  return inflight
}

async function runSync(): Promise<PaymentsState> {
  const resolved = creemClient()
  if ('error' in resolved) {
    setLastError(resolved.error)
    return paymentsState()
  }
  setSyncing(true)
  broadcastPayments()
  try {
    const snapshot = await resolved.client.snapshot()
    const events = applySnapshot(snapshot)
    afterHeartbeat(events)
  } catch (error) {
    setLastError(error instanceof Error ? error.message : String(error))
  } finally {
    setSyncing(false)
    broadcastPayments()
  }
  return paymentsState()
}

/** HEARTBEAT.md 的规则：有变化才说话，没变化保持安静。 */
function afterHeartbeat(events: PaymentEvent[]): void {
  if (events.length === 0) {
    return
  }
  const settings = paymentsSettings()
  if (settings.todoFollowUp) {
    const drafts = proposePaymentTodos(events)
    if (drafts.length > 0) {
      ingestTodos({
        agentId: PAYMENT_AGENT_ID,
        source: '收款管理 · Creem 心跳',
        tags: [PAYMENT_TAG],
        items: drafts,
      })
    }
  }
  if (settings.notify && Notification.isSupported()) {
    const [first, ...rest] = events
    if (!first) {
      return
    }
    const title = rest.length > 0 ? `收款管理 · ${events.length} 条新动态` : `收款管理 · ${first.title}`
    const body = rest.length > 0
      ? events.slice(0, 4).map((event) => `${event.title} · ${event.detail}`).join('\n')
      : first.detail
    const notification = new Notification({ title, body, silent: first.tone === 'good' })
    notification.on('click', () => {
      onNotificationClick()
    })
    notification.show()
  }
}

/** 按设置里的间隔跑心跳；间隔为 0 或没有 key 就不跑。 */
export function schedulePaymentHeartbeat(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  const settings = paymentsSettings()
  if (!settings.hasApiKey || settings.heartbeatMinutes <= 0) {
    return
  }
  const interval = Math.max(MIN_HEARTBEAT_MS, settings.heartbeatMinutes * 60_000)
  timer = setInterval(() => {
    void syncPayments()
  }, interval)
}

export function stopPaymentHeartbeat(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
