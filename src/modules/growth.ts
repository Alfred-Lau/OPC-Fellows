import type { Context } from '@deepseek-ai/cordis'
import type { ModuleDefinition } from '../kernel/main/services/modules'
import { registerGrowthIpc } from '../main/growth-ipc'
import { formatDiagnose, planChannel, planLoop, planOpenExperiment, planShip, planVerdict, GROWTH_AGENT_ID, GROWTH_TAG, experimentTodoTitle } from '../shared/growth'
import { isRosterAgent } from '../kernel/shared/agents'
import { parseFlagArg, parsePinnedArg } from '../kernel/shared/occupation-tools'
import { loadGrowth, growthState, saveExperiment, saveLoop, saveChannel } from '../main/growth-store'

export const growthModule: ModuleDefinition = {
  source: 'builtin',
  manifest: {
    id: 'growth',
    title: '增长黑客',
    mark: '增',
    description: '把增长拆成可判定的实验、可复利的环和该扩/该停的渠道。流量看监控官，文案看弹药手。',
    kind: 'view',
    version: '1.0.0',
    group: '项目',
    order: 52,
    inject: ['bridge', 'workbench', 'todos', 'tools'],
    optional: ['micro', 'social-ammo', 'monitor', 'payments'],
    capabilities: ['storage', 'todos:write'],
    removable: false,
  },
  plugin(ctx: Context) {
    loadGrowth()
    registerGrowthIpc((channel, listener) => {
      ctx.bridge.handle(channel, listener)
    })
    ctx.tools.register({
      name: 'growth_diagnose',
      description: '诊断增长漏斗与在跑实验。台是空的就说明先开实验。不写文案、不刷新流量、不碰账本。',
      moduleId: 'growth',
      parameters: { text: { type: 'string', description: '用户原话，可选', required: false } },
      execute: async (args) => formatDiagnose(growthState(), args.text || ''),
    })
    ctx.tools.register({
      name: 'growth_experiment',
      description: '开一条可判定的实验。要有假设。不写文案、不刷新流量、不碰账本。',
      moduleId: 'growth',
      effect: 'write',
      parameters: {
        text: { type: 'string', description: '用户原话，含假设' },
        pinned: { type: 'string', description: 'Idea id', required: false },
      },
      execute: async (args) => {
        const plan = planOpenExperiment(args.text || '', growthState(), parsePinnedArg(args.pinned))
        if (plan.input) {
          saveExperiment(plan.input)
        }
        return plan.reply
      },
    })
    ctx.tools.register({
      name: 'growth_verdict',
      description: '判定一条实验：赢了 / 输了 / 无结论。',
      moduleId: 'growth',
      effect: 'write',
      parameters: {
        text: { type: 'string', description: '用户原话' },
        pinned: { type: 'string', description: '实验 id', required: false },
      },
      execute: async (args) => {
        const state = growthState()
        const plan = planVerdict(args.text || '', state.experiments, parsePinnedArg(args.pinned))
        if (plan.id && plan.status) {
          const current = state.experiments.find((item) => item.id === plan.id)
          if (current) {
            saveExperiment({ ...current, status: plan.status })
            ctx.todos.ingest({
              agentId: GROWTH_AGENT_ID,
              source: '增长黑客',
              tags: [GROWTH_TAG],
              items: [
                {
                  title: experimentTodoTitle({ title: current.title, status: plan.status }),
                  note: `experiment:${current.id}`,
                  dedupeKey: `growth:verdict:${current.id}`,
                },
              ],
            })
          }
        }
        return plan.reply
      },
    })
    ctx.tools.register({
      name: 'growth_loop',
      description: '画一条增长环：内容 / 裂变 / 付费 / 销售 / 产品。',
      moduleId: 'growth',
      effect: 'write',
      parameters: { text: { type: 'string', description: '用户原话' } },
      execute: async (args) => {
        const plan = planLoop(args.text || '', growthState().loops)
        if (plan.input) {
          saveLoop(plan.input)
        }
        return plan.reply
      },
    })
    ctx.tools.register({
      name: 'growth_rank',
      description: '给渠道一个处置：试水 / 扩量 / 暂停 / 杀掉。',
      moduleId: 'growth',
      effect: 'write',
      parameters: { text: { type: 'string', description: '用户原话' } },
      execute: async (args) => {
        const plan = planChannel(args.text || '', growthState().channels)
        if (plan.input) {
          saveChannel(plan.input)
        }
        return plan.reply
      },
    })
    ctx.tools.register({
      name: 'growth_ship',
      description: '把赢了的实验指针交给弹药手。没赢不交接，不复制弹药正文。',
      moduleId: 'growth',
      effect: 'write',
      parameters: {
        text: { type: 'string', description: '用户原话' },
        pinned: { type: 'string', description: '实验 id', required: false },
        has_ammo: { type: 'string', description: '弹药手是否在场', required: false },
      },
      execute: async (args) => {
        const state = growthState()
        const hasAmmo =
          parseFlagArg(args.has_ammo) ||
          (ctx.agents?.all().some(
            (agent) => isRosterAgent(agent) && agent.moduleIds.includes('social-ammo') && agent.status !== 'needs-module',
          ) ?? false)
        const plan = planShip(args.text || '', state.experiments, hasAmmo, parsePinnedArg(args.pinned))
        if (plan.id) {
          const current = state.experiments.find((item) => item.id === plan.id)
          if (current) {
            saveExperiment({ ...current, ammoNote: `ammo:${current.id}` })
          }
        }
        return plan.reply
      },
    })
    ctx.workbench.nav({
      id: 'growth',
      title: '增长黑客',
      mark: '增',
      kind: 'view',
      order: 52,
    })
  },
}
