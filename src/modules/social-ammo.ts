import type { Context } from '@deepseek-ai/cordis'
import type { ModuleDefinition } from '../kernel/main/services/modules'
import { generateSocialAmmo, registerSocialIpc } from '../main/monitor-ipc'
import { setSocialAmmoEnabled } from '../main/module-flags'
import { loadMicroSourcing, microState } from '../main/micro-sourcing-store'
import { loadSocial, socialState, publishSocialDraft, recordSocialMetrics } from '../main/social-store'
import {
  formatAmmoLoad,
  formatAmmoRecap,
  parseAmmoMetrics,
  parsePublish,
  pickIndexed,
  planAmmoLoad,
} from '../shared/skill-route'
import { parsePinnedArg } from '../kernel/shared/occupation-tools'

export const socialAmmoModule: ModuleDefinition = {
  source: 'builtin',
  manifest: {
    id: 'social-ammo',
    title: '社媒弹药',
    mark: '弹',
    description: '按最新产品能力生成六平台文案草稿，记录发布与互动数据。',
    kind: 'view',
    version: '1.0.0',
    group: '内容',
    order: 45,
    inject: ['bridge', 'workbench', 'todos', 'tools'],
    optional: ['monitor'],
    capabilities: ['storage', 'todos:write'],
    namespaces: ['social'],
    removable: false,
  },
  plugin(ctx: Context) {
    setSocialAmmoEnabled(true)
    loadSocial()
    registerSocialIpc((channel, listener) => {
      ctx.bridge.handle(channel, listener)
    })
    ctx.tools.register({
      name: 'social_load',
      description: '按 Idea 或产品能力装填六平台弹药。没有指针就问装填哪一条，不从监控偷偷写弹药。',
      moduleId: 'social-ammo',
      parameters: { text: { type: 'string', description: '用户原话，可含第几条 Idea', required: false } },
      execute: async (args) => {
        loadMicroSourcing()
        const planned = planAmmoLoad(args.text || '', microState().ideas)
        if (planned.reply && !planned.idea) {
          return planned.reply
        }
        const state = await generateSocialAmmo(planned.idea?.id)
        return formatAmmoLoad(state, planned.idea)
      },
    })
    ctx.tools.register({
      name: 'social_recap',
      description: '复盘有评论的已发稿。没有带评论的已发稿，不拿未发草稿充数。',
      moduleId: 'social-ammo',
      effect: 'read',
      parameters: { text: { type: 'string', description: '用户原话', required: false } },
      execute: async (args) => formatAmmoRecap(socialState(), args.text || ''),
    })
    ctx.tools.register({
      name: 'social_publish',
      description: '记下已发链接。不代发。缺链接就问。',
      moduleId: 'social-ammo',
      effect: 'write',
      parameters: {
        text: { type: 'string', description: '用户原话，含链接和第几条' },
        pinned: { type: 'string', description: '弹药 id', required: false },
      },
      execute: async (args) => {
        const state = socialState()
        const parsed = parsePublish(args.text || '', state.drafts, parsePinnedArg(args.pinned))
        if (!parsed.id || !parsed.url) {
          return parsed.reply
        }
        publishSocialDraft(parsed.id, parsed.url)
        return parsed.reply
      },
    })
    ctx.tools.register({
      name: 'social_metrics',
      description: '记下一条已发弹药的浏览、赞评转发收藏。没有数字就不写 0 充数。',
      moduleId: 'social-ammo',
      effect: 'write',
      parameters: {
        text: { type: 'string', description: '用户原话，含数字' },
        pinned: { type: 'string', description: '弹药 id', required: false },
      },
      execute: async (args) => {
        const state = socialState()
        const published = state.drafts.filter((draft) => draft.publishedAt)
        const picked = pickIndexed(published, args.text || '', {
          pinnedIds: parsePinnedArg(args.pinned),
          idOf: (item) => item.id,
        })
        const metrics = parseAmmoMetrics(args.text || '')
        if (metrics.reply) {
          return metrics.reply
        }
        if ('needle' in picked || 'kind' in picked || !metrics.input) {
          return '要对哪一条已发弹药？说「采集互动 第一条 浏览 120 赞 3」。'
        }
        recordSocialMetrics({
          draftId: picked.item.id,
          platform: picked.item.platform,
          ...metrics.input,
        })
        return `已记下「${picked.item.title}」的互动。`
      },
    })
    ctx.effect(() => () => {
      setSocialAmmoEnabled(false)
    }, 'social-ammo.flag')
    ctx.workbench.nav({
      id: 'social-ammo',
      title: '社媒弹药',
      mark: '弹',
      kind: 'view',
      order: 45,
    })
  },
}
