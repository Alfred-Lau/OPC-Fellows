import type { Context } from '@deepseek-ai/cordis'
import type { ModuleDefinition } from '../kernel/main/services/modules'
import { OCCUPATION_DSH_BUNDLE } from '../kernel/shared/occupation-bundles'
import { registerPaymentIpc } from '../main/payment-ipc'
import { loadPayments, paymentsState, saveExpense, saveReceipt } from '../main/payment-store'
import {
  schedulePaymentHeartbeat,
  setPaymentNotifyClickHandler,
  stopPaymentHeartbeat,
  syncPayments,
} from '../main/payment-sync'
import { showWorkbench } from '../main/workbench-window'
import { formatLedgerRead, formatPaymentsSync, parseExpense, parseManualReceipt, formatMonthExport } from '../shared/skill-route'

export const paymentsModule: ModuleDefinition = {
  source: 'builtin',
  manifest: {
    id: 'payments',
    title: '收款管理',
    mark: '收',
    description: 'Creem 同步，加上分账、知识星球、微信扫码和海外社媒手录：营收、订阅、客户、结算与支出。',
    kind: 'view',
    version: '1.0.0',
    group: '财务',
    order: 70,
    accelerator: 'CommandOrControl+5',
    inject: ['bridge', 'workbench', 'todos', 'tools'],
    capabilities: ['storage', 'secrets', 'todos:write', 'notify', 'clipboard', 'fs:export', 'net:creem.io'],
    removable: false,
    dshBundle: OCCUPATION_DSH_BUNDLE,
  },
  plugin(ctx: Context) {
    loadPayments()
    registerPaymentIpc((channel, listener) => {
      ctx.bridge.handle(channel, listener)
    })
    setPaymentNotifyClickHandler(() => {
      showWorkbench('payments')
    })
    schedulePaymentHeartbeat()
    // 启动时先拉一次，让打开模块就有数据；没配 key 会静默跳过。
    void syncPayments()
    ctx.tools.register({
      name: 'payments_sync',
      description: '从 Creem 同步收款台账并给出本月摘要。缺密钥时说明要到收款台填 key，不要假装已经同步。',
      moduleId: 'payments',
      parameters: {},
      execute: async () => formatPaymentsSync(await syncPayments()),
    })
    ctx.tools.register({
      name: 'payments_read',
      description: '解读已有账本：本月营收、MRR、客户。没有账本时说明要先同步心跳，不要编数字。',
      moduleId: 'payments',
      effect: 'read',
      parameters: {},
      execute: async () => formatLedgerRead(paymentsState()),
    })
    ctx.tools.register({
      name: 'payments_manual',
      description: '手工入账。必须有金额和渠道，例如「入账 199 元 微信」。不会从微信成交自动流入。',
      moduleId: 'payments',
      parameters: { text: { type: 'string', description: '用户原话，含金额和渠道' } },
      execute: async (args) => {
        const planned = parseManualReceipt(args.text || '')
        if (planned.input) {
          saveReceipt(planned.input)
        }
        return planned.reply
      },
    })
    ctx.tools.register({
      name: 'payments_expense',
      description: '记下支出。必须有金额。提现要到结算面补，这条一次只改支出账。',
      moduleId: 'payments',
      parameters: { text: { type: 'string', description: '用户原话，含支出金额' } },
      execute: async (args) => {
        const planned = parseExpense(args.text || '')
        if (planned.kind === 'expense' && planned.input) {
          saveExpense(planned.input)
        }
        return planned.reply
      },
    })
    ctx.tools.register({
      name: 'payments_export',
      description: '导出本月台账 CSV 快照。这是快照，不是第二份账。',
      moduleId: 'payments',
      effect: 'write',
      parameters: {},
      execute: async () => {
        const file = formatMonthExport(paymentsState())
        return `${file.reply}\n\n文件名：${file.name}\n\n${file.csv}`
      },
    })
    ctx.workbench.nav({
      id: 'payments',
      title: '收款管理',
      mark: '收',
      kind: 'view',
      order: 70,
      accelerator: 'CommandOrControl+5',
    })
    ctx.effect(() => () => {
      stopPaymentHeartbeat()
      setPaymentNotifyClickHandler(() => undefined)
    }, 'payments.heartbeat')
  },
}
