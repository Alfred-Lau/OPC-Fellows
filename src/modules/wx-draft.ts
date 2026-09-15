import type { Context } from '@deepseek-ai/cordis'
import type { ModuleDefinition } from '../kernel/main/services/modules'
import { registerWxDraftIpc, stopWxDraftRun } from '../main/wx-draft-ipc'
import { listRecords, loadWxDraft, wxDraftSettingsView } from '../main/wx-draft-store'
import { formatDraftHistory, parseWxDraftBody } from '../shared/skill-route'
import { reviewWxDraftMarkdown, formatReviewMessage } from '../shared/wx-draft-review'

export const wxDraftModule: ModuleDefinition = {
  source: 'builtin',
  manifest: {
    id: 'wxdraft',
    title: '公众号草稿',
    mark: '稿',
    description: '把 Markdown 主文档经扣子工作流转成微信公众号草稿：取 token、转 HTML、上传封面、写入草稿箱。',
    kind: 'view',
    version: '1.0.0',
    group: '内容',
    order: 65,
    accelerator: 'CommandOrControl+7',
    inject: ['bridge', 'workbench', 'tools'],
    capabilities: [
      'storage',
      'secrets',
      'clipboard',
      'net:api.coze.cn',
      'net:api.deepseek.com',
      'net:api.weixin.qq.com',
    ],
    removable: false,
  },
  plugin(ctx: Context) {
    loadWxDraft()
    registerWxDraftIpc((channel, listener) => {
      ctx.bridge.handle(channel, listener)
    })
    ctx.tools.register({
      name: 'wxdraft_history',
      description: '复查上次公众号草稿收成是成功还是失败。还没收成过就说明还没有。',
      moduleId: 'wxdraft',
      parameters: {},
      execute: async () =>
        formatDraftHistory({
          settings: wxDraftSettingsView(),
          records: listRecords(),
          running: false,
        }),
    })
    ctx.tools.register({
      name: 'wxdraft_ingest',
      description: '收下 Markdown 并做红线词/错别字审查。封面和上传在右栏确认后写入草稿箱。不改表意。',
      moduleId: 'wxdraft',
      effect: 'write',
      parameters: { text: { type: 'string', description: '含 Markdown 的用户原话或正文' } },
      execute: async (args) => {
        const parsed = parseWxDraftBody(args.text || '')
        if (!parsed.markdown || parsed.reply) {
          return parsed.reply ?? '收成草稿需要一篇 Markdown。不空跑。'
        }
        const reviewed = reviewWxDraftMarkdown(parsed.markdown)
        if (!reviewed.markdown.trim()) {
          return '审查后没有可发布的正文。请确认 Markdown 不是只剩封面图或 AI 指引。'
        }
        return [
          `正文已收下「${parsed.title || '未命名'}」。`,
          formatReviewMessage(reviewed),
          '封面请放在文档同级 images/ 封面.jpg，到右栏点收成才会写入公众号草稿箱。正文主人仍是源头。',
        ].join(' ')
      },
    })
    ctx.tools.register({
      name: 'wxdraft_meta',
      description: '说明将写入的作者、标题摘要和封面约定。不编封面。',
      moduleId: 'wxdraft',
      effect: 'read',
      parameters: {},
      execute: async () => {
        const state = wxDraftSettingsView()
        return `将写入作者「${state.defaultAuthor || '（未填）'}」。标题、摘要还空着的话，到面板里补；封面请放在文档同级 images/ 封面.jpg。`
      },
    })
    ctx.workbench.nav({
      id: 'wxdraft',
      title: '公众号草稿',
      mark: '稿',
      kind: 'view',
      order: 65,
      accelerator: 'CommandOrControl+7',
    })
    ctx.effect(() => () => {
      stopWxDraftRun()
    }, 'wxdraft.run')
  },
}
