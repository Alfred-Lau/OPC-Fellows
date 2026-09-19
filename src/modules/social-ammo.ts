import type { Context } from '@deepseek-ai/cordis'
import type { ModuleDefinition } from '../kernel/main/services/modules'
import { generateSocialAmmo, registerSocialIpc } from '../main/social-ipc'
import { setSocialAmmoEnabled } from '../main/module-flags'
import { loadSocial, socialState, publishSocialDraft, recordSocialMetrics } from '../main/social-store'
import {
  formatAmmoLoad,
  formatAmmoRecap,
  parseAmmoMetrics,
  parsePublish,
  pickIndexed,
} from '../shared/skill-route'
import { parsePinnedArg } from '../kernel/shared/occupation-tools'

export const socialAmmoModule: ModuleDefinition = {
  source: 'builtin',
  manifest: {
    id: 'social-ammo',
    title: '社媒弹药',
    mark: '弹',
    description: '按产品目录生成六平台文案草稿，记录发布与互动数据。',
    kind: 'view',
    version: '1.0.0',
    group: '内容',
    order: 45,
    inject: ['bridge', 'workbench', 'todos', 'opcTools'],
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
    ctx.opcTools.register({
      name: 'social_load',
      description: '按产品目录装填六平台弹药。目录为空就请用户先登记站点。',
      moduleId: 'social-ammo',
      parameters: { text: { type: 'string', description: '用户原话', required: false } },
      execute: async () => {
        const state = await generateSocialAmmo()
        return formatAmmoLoad(state)
      },
    })
    ctx.opcTools.register({
      name: 'social_recap',
      description: '复盘有评论的已发稿。没有带评论的已发稿，不拿未发草稿充数。',
      moduleId: 'social-ammo',
      effect: 'read',
      parameters: { text: { type: 'string', description: '用户原话', required: false } },
      execute: async (args) => formatAmmoRecap(socialState(), args.text || ''),
    })
    ctx.opcTools.register({
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
    ctx.opcTools.register({
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
