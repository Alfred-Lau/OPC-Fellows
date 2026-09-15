import type { Context } from '@deepseek-ai/cordis'
import type { ModuleDefinition } from '../kernel/main/services/modules'
import { OCCUPATION_DSH_BUNDLE } from '../kernel/shared/occupation-bundles'
import { registerMicroSourcingIpc } from '../main/micro-sourcing-ipc'
import { loadMicroSourcing, microState } from '../main/micro-sourcing-store'
import { scheduleMicroHeartbeat, setMicroNotifyClickHandler, stopMicroHeartbeat, scanMicroSourcing } from '../main/micro-sourcing-sync'
import { showWorkbench } from '../main/workbench-window'
import { formatIdeaReview, formatScanSummary, planHandoff, planPipelineChange, todayIdeas } from '../shared/micro-sourcing'
import { isRosterAgent } from '../kernel/shared/agents'
import { parseFlagArg, parsePinnedArg } from '../kernel/shared/occupation-tools'
import { patchStoredIdea } from '../main/micro-sourcing-store'

export const microModule: ModuleDefinition = {
  source: 'builtin',
  manifest: {
    id: 'micro',
    title: 'Micro 选品',
    mark: '选',
    description: '每天从 Reddit / Ask HN 捞真实痛点帖，按痛感 × 热度 × 贴合度聚类成产品 idea。',
    kind: 'view',
    version: '1.0.0',
    group: '项目',
    order: 50,
    accelerator: 'CommandOrControl+6',
    inject: ['bridge', 'workbench', 'todos', 'tools'],
    capabilities: ['storage', 'todos:write', 'notify', 'net:reddit.com', 'net:news.ycombinator.com'],
    removable: false,
    dshBundle: OCCUPATION_DSH_BUNDLE,
  },
  plugin(ctx: Context) {
    loadMicroSourcing()
    registerMicroSourcingIpc((channel, listener) => {
      ctx.bridge.handle(channel, listener)
    })
    setMicroNotifyClickHandler(() => {
      showWorkbench('micro')
    })
    scheduleMicroHeartbeat()
    ctx.tools.register({
      name: 'micro_scan',
      description: '扫描公开论坛痛点并聚成今日产品 idea。扫不到就说明缺源，不要拿昨天的帖凑今日热榜。',
      moduleId: 'micro',
      parameters: {},
      execute: async () => formatScanSummary(await scanMicroSourcing()),
    })
    ctx.tools.register({
      name: 'micro_review',
      description: '评估今日热榜或点名的 idea：痛感、热度和判决。没有扫描结果时说明要先扫描痛点。',
      moduleId: 'micro',
      effect: 'read',
      parameters: { text: { type: 'string', description: '用户原话，可含第几条或标题', required: false } },
      execute: async (args) => {
        loadMicroSourcing()
        return formatIdeaReview(microState(), args.text || '评估 idea')
      },
    })
    ctx.tools.register({
      name: 'micro_pipeline',
      description: '改一条 Idea 的管线状态：盯着 / 动手做 / 搁置 / 丢掉。要点名序号或标题。',
      moduleId: 'micro',
      effect: 'write',
      parameters: {
        text: { type: 'string', description: '用户原话' },
        pinned: { type: 'string', description: '钉死的 idea id', required: false },
      },
      execute: async (args) => {
        loadMicroSourcing()
        const state = microState()
        const plan = planPipelineChange(args.text || '', state.ideas, new Date(), parsePinnedArg(args.pinned))
        if (plan.idea && plan.status) {
          patchStoredIdea(plan.idea.id, { status: plan.status })
        }
        return plan.reply
      },
    })
    ctx.tools.register({
      name: 'micro_handoff',
      description: '把仍开放的 Idea 指针交给弹药手。源关闭则下游停，不复制第二份选题。',
      moduleId: 'micro',
      effect: 'write',
      parameters: {
        text: { type: 'string', description: '用户原话' },
        pinned: { type: 'string', description: '钉死的 idea id', required: false },
        has_ammo: { type: 'string', description: '弹药手是否在场', required: false },
      },
      execute: async (args) => {
        loadMicroSourcing()
        const state = microState()
        const hasAmmo =
          parseFlagArg(args.has_ammo) ||
          (ctx.agents?.all().some(
            (agent) => isRosterAgent(agent) && agent.moduleIds.includes('social-ammo') && agent.status !== 'needs-module',
          ) ?? false)
        const plan = planHandoff(args.text || '', state.ideas, hasAmmo, new Date(), parsePinnedArg(args.pinned))
        if (plan.idea && hasAmmo && plan.reply.includes('指针交给弹药手')) {
          patchStoredIdea(plan.idea.id, { note: `ammo:${plan.idea.id}` })
        }
        return plan.reply
      },
    })
    ctx.workbench.nav({
      id: 'micro',
      title: 'Micro 选品',
      mark: '选',
      kind: 'view',
      order: 50,
      accelerator: 'CommandOrControl+6',
    })
    // 停用 = 心跳停掉、通知回调摘掉，不再有后台扫描。
    ctx.effect(() => () => {
      stopMicroHeartbeat()
      setMicroNotifyClickHandler(() => undefined)
    }, 'micro.heartbeat')
  },
}
