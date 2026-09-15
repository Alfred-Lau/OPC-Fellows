import type { Context } from '@deepseek-ai/cordis'
import type { ModuleDefinition } from '../kernel/main/services/modules'
import { parsePinnedArg } from '../kernel/shared/occupation-tools'
import { registerMailIpc } from '../main/mail-ipc'
import { loadMail, mailState, patchMailMessage, upsertMailDraft } from '../main/mail-store'
import { refreshMailCoverage, syncMailInboxes } from '../main/mail-sync'
import {
  formatMailAccess,
  formatMailDraft,
  formatMailInbox,
  formatMailLookup,
  formatMailTriage,
} from '../shared/skill-route'
import { lookupMailQuery } from '../shared/mail'

export const mailModule: ModuleDefinition = {
  source: 'builtin',
  manifest: {
    id: 'mail',
    title: '邮件整理',
    mark: '邮',
    description: '对接本机邮箱和 iCloud、Gmail、QQ，把收件箱收成待跟进、可归档和回信草稿。不代发邮件。',
    kind: 'view',
    version: '1.0.0',
    group: '项目',
    order: 69,
    accelerator: 'CommandOrControl+9',
    inject: ['bridge', 'workbench', 'tools'],
    capabilities: [
      'storage',
      'secrets',
      'clipboard',
      'subprocess',
      'net:imap.gmail.com',
      'net:imap.mail.me.com',
      'net:imap.qq.com',
    ],
    removable: false,
  },
  plugin(ctx: Context) {
    loadMail()
    registerMailIpc((channel, listener) => {
      ctx.bridge.handle(channel, listener)
    })
    ctx.tools.register({
      name: 'mail_inbox',
      description: '读整理后的收件箱。带「刷新」才拉本机邮件.app 或 IMAP。不代发。',
      moduleId: 'mail',
      parameters: { text: { type: 'string', description: '用户原话', required: false } },
      execute: async (args) => {
        const text = args.text || ''
        if (/刷新|同步|再拉/.test(text)) {
          await syncMailInboxes()
        }
        return formatMailInbox(mailState(), text)
      },
    })
    ctx.tools.register({
      name: 'mail_triage',
      description: '分流一封信：跟进 / 归档 / 忽略。不改正文，不代发。',
      moduleId: 'mail',
      effect: 'write',
      parameters: {
        text: { type: 'string', description: '用户原话' },
        pinned: { type: 'string', description: '邮件 id', required: false },
      },
      execute: async (args) => {
        const plan = formatMailTriage(mailState(), args.text || '', parsePinnedArg(args.pinned))
        if (plan.message && plan.decision) {
          patchMailMessage(plan.message.id, { triage: plan.decision })
        }
        return plan.reply
      },
    })
    ctx.tools.register({
      name: 'mail_lookup',
      description: '按发件人、主题或关键词查已同步的信。没命中就说没有。',
      moduleId: 'mail',
      effect: 'read',
      parameters: { text: { type: 'string', description: '用户原话' } },
      execute: async (args) => formatMailLookup(mailState(), lookupMailQuery(args.text || '')),
    })
    ctx.tools.register({
      name: 'mail_draft',
      description: '给一封信留回信草稿，只留本机，不代发。',
      moduleId: 'mail',
      effect: 'write',
      parameters: { text: { type: 'string', description: '用户原话' } },
      execute: async (args) => {
        const plan = formatMailDraft(mailState(), args.text || '')
        if (plan.message && plan.draft) {
          upsertMailDraft(plan.message.messageId, plan.draft)
        }
        return plan.reply
      },
    })
    ctx.tools.register({
      name: 'mail_access',
      description: '体检本机邮件.app 和已保存的 iCloud / Gmail / QQ 账号。按真实接入状态回答。',
      moduleId: 'mail',
      parameters: {},
      execute: async () => {
        await refreshMailCoverage()
        return formatMailAccess(mailState())
      },
    })
    ctx.workbench.nav({
      id: 'mail',
      title: '邮件整理',
      mark: '邮',
      kind: 'view',
      order: 69,
      accelerator: 'CommandOrControl+9',
    })
    void refreshMailCoverage()
  },
}
