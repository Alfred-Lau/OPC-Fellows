import type { Context } from '@deepseek-ai/cordis'
import type { ModuleDefinition } from '../kernel/main/services/modules'
import { registerWechatHubIpc } from '../main/wechat-hub-ipc'
import { loadWechatHub, wechatHubState } from '../main/wechat-hub-store'
import { lookupWechat, refreshWechatCoverage, refreshWechatHub, scheduleWechatHeartbeat, setWechatNotifyClickHandler, stopWechatHeartbeat, triageWechat } from '../main/wechat-hub-sync'
import { showWorkbench } from '../main/workbench-window'
import { formatWxAccess, formatWxInbox, formatWxLookup, formatWxToday, formatWxTriage, lookupKindOf, lookupQuery } from '../shared/skill-route'
import { parsePinnedArg } from '../kernel/shared/occupation-tools'

export const wxhubModule: ModuleDefinition = {
  source: 'builtin',
  manifest: {
    id: 'wxhub',
    title: '微信情报',
    mark: '微',
    description: '本机只读微信情报：今日行动、待回复、商机分流和回复草稿。聊天不出本机，不发微信。',
    kind: 'view',
    version: '1.0.0',
    group: '项目',
    order: 68,
    accelerator: 'CommandOrControl+8',
    inject: ['bridge', 'workbench', 'todos', 'tools'],
    capabilities: ['storage', 'todos:write', 'notify', 'clipboard', 'subprocess'],
    removable: false,
  },
  plugin(ctx: Context) {
    loadWechatHub()
    registerWechatHubIpc((channel, listener) => {
      ctx.bridge.handle(channel, listener)
    })
    setWechatNotifyClickHandler(() => {
      showWorkbench('wxhub')
    })
    scheduleWechatHeartbeat()
    ctx.tools.register({
      name: 'wxhub_today',
      description: '读今日微信行动。带「刷新」才外跑情报库。不能读就说接入体检。不发微信。',
      moduleId: 'wxhub',
      parameters: { text: { type: 'string', description: '用户原话', required: false } },
      execute: async (args) => {
        const text = args.text || ''
        const refresh = /刷新情报|刷新/.test(text)
        if (refresh) {
          await refreshWechatHub()
        }
        return formatWxToday(wechatHubState(), refresh, text)
      },
    })
    ctx.tools.register({
      name: 'wxhub_inbox',
      description: '列出待回复或待分流候选。只出草稿，不发微信。',
      moduleId: 'wxhub',
      parameters: { text: { type: 'string', description: '用户原话', required: false } },
      execute: async (args) => formatWxInbox(wechatHubState(), args.text || ''),
    })
    ctx.tools.register({
      name: 'wxhub_triage',
      description: '分流一条候选：推进 / 等待 / 忽略。成交不会自动入账。不发微信。',
      moduleId: 'wxhub',
      effect: 'write',
      parameters: {
        text: { type: 'string', description: '用户原话' },
        pinned: { type: 'string', description: '行动 id', required: false },
      },
      execute: async (args) => {
        const plan = formatWxTriage(wechatHubState(), args.text || '', parsePinnedArg(args.pinned))
        if (plan.action && plan.decision) {
          await triageWechat(plan.action.id, plan.decision)
        }
        return plan.reply
      },
    })
    ctx.tools.register({
      name: 'wxhub_lookup',
      description: '按人、主题或关键词查本机情报。没命中就说没有。聊天不出本机。',
      moduleId: 'wxhub',
      effect: 'read',
      parameters: { text: { type: 'string', description: '用户原话' } },
      execute: async (args) => {
        const text = args.text || ''
        const query = lookupQuery(text)
        if (!query) {
          return formatWxLookup(wechatHubState(), query)
        }
        const state = await lookupWechat(lookupKindOf(text), query)
        return formatWxLookup(state, query)
      },
    })
    ctx.tools.register({
      name: 'wxhub_access',
      description: '体检本机微信情报库是否可读。按真实接入状态回答。',
      moduleId: 'wxhub',
      parameters: {},
      execute: async () => {
        await refreshWechatCoverage()
        return formatWxAccess(wechatHubState())
      },
    })
    ctx.workbench.nav({
      id: 'wxhub',
      title: '微信情报',
      mark: '微',
      kind: 'view',
      order: 68,
      accelerator: 'CommandOrControl+8',
    })
    void refreshWechatCoverage()
    ctx.effect(() => () => {
      stopWechatHeartbeat()
      setWechatNotifyClickHandler(() => undefined)
    }, 'wxhub.heartbeat')
  },
}
