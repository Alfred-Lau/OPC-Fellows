import type { Context } from '@deepseek-ai/cordis'
import type { ModuleDefinition } from '../kernel/main/services/modules'
import { registerAccountIpc } from '../main/account-ipc'
import {
  accountsState,
  addPost,
  loadAccounts,
  saveAccount,
  saveMaterial,
  saveMetrics,
  setDayMaterials,
} from '../main/account-store'
import { loadMicroSourcing, microState } from '../main/micro-sourcing-store'
import { loadSocial, socialState } from '../main/social-store'
import { dayKey } from '../shared/datetime'
import {
  formatAccountList,
  parseAccountCreate,
  parseAccountLog,
  parseAccountMetrics,
  parseMaterialPointer,
  pickAccount,
} from '../shared/skill-route'

export const accountsModule: ModuleDefinition = {
  source: 'builtin',
  manifest: {
    id: 'accounts',
    title: '自媒体账号',
    mark: '号',
    description: '管视频号、抖音、小红书上的多个账号，按日记录内容、数据与选材关联。',
    kind: 'view',
    version: '1.0.0',
    group: '内容',
    order: 60,
    accelerator: 'CommandOrControl+4',
    inject: ['bridge', 'workbench', 'tools'],
    optional: ['social-ammo'],
    capabilities: ['storage', 'search'],
    removable: false,
  },
  plugin(ctx: Context) {
    loadAccounts()
    registerAccountIpc((channel, listener) => {
      ctx.bridge.handle(channel, listener)
    })
    ctx.tools.register({
      name: 'accounts_read',
      description: '列出已建档的小红书 / 视频号 / 抖音账号。没有账号就说明还没有，不要编粉丝数。',
      moduleId: 'accounts',
      parameters: {},
      execute: async () => formatAccountList(accountsState()),
    })
    ctx.tools.register({
      name: 'accounts_create',
      description: '建档一个小红书 / 视频号 / 抖音账号。要有平台和名称。',
      moduleId: 'accounts',
      effect: 'write',
      parameters: { text: { type: 'string', description: '用户原话' } },
      execute: async (args) => {
        const parsed = parseAccountCreate(args.text || '')
        if (!parsed.platform || !parsed.name) {
          return parsed.reply
        }
        saveAccount({ platform: parsed.platform, name: parsed.name })
        return parsed.reply
      },
    })
    ctx.tools.register({
      name: 'accounts_log',
      description: '把今日发出记进当天日记。国内已发弹药只收指针，不抄正文。',
      moduleId: 'accounts',
      effect: 'write',
      parameters: { text: { type: 'string', description: '用户原话，含账号和标题或链接' } },
      execute: async (args) => {
        const text = args.text || ''
        const state = accountsState()
        if (state.accounts.length === 0) {
          return formatAccountList(state)
        }
        const account = pickAccount(state.accounts, text) ?? (state.accounts.length === 1 ? state.accounts[0] : undefined)
        const parsed = parseAccountLog(text)
        if (!account || !parsed.title) {
          return '记今日发出要账号和标题（或链接）。国内已发弹药只收指针，不抄正文。'
        }
        const date = dayKey(new Date())
        addPost(account.id, date, { title: parsed.title, url: parsed.url })
        return `已记到 ${account.name} 的 ${date}。`
      },
    })
    ctx.tools.register({
      name: 'accounts_metrics',
      description: '记下某账号当日浏览和粉丝。没有数字就不编。',
      moduleId: 'accounts',
      effect: 'write',
      parameters: { text: { type: 'string', description: '用户原话，含数字' } },
      execute: async (args) => {
        const text = args.text || ''
        const state = accountsState()
        const account = pickAccount(state.accounts, text) ?? (state.accounts.length === 1 ? state.accounts[0] : undefined)
        const parsed = parseAccountMetrics(text)
        if (parsed.reply) {
          return parsed.reply
        }
        if (!account) {
          return formatAccountList(state)
        }
        const date = dayKey(new Date())
        saveMetrics(account.id, date, {
          ...(parsed.views != null ? { views: parsed.views } : {}),
          ...(parsed.followers != null ? { followers: parsed.followers } : {}),
        })
        return `已记下 ${account.name} ${date} 的日数据。`
      },
    })
    ctx.tools.register({
      name: 'accounts_material',
      description: '把选材指针关联到账号日记。只存指向 Idea 或 Ammo 的指针。',
      moduleId: 'accounts',
      effect: 'write',
      parameters: { text: { type: 'string', description: '用户原话' } },
      execute: async (args) => {
        const text = args.text || ''
        loadMicroSourcing()
        loadSocial()
        const accounts = accountsState()
        const parsed = parseMaterialPointer(text, microState().ideas, socialState().drafts)
        if ('reply' in parsed) {
          return parsed.reply
        }
        const account = pickAccount(accounts.accounts, text) ?? accounts.accounts[0]
        if (!account) {
          return '还没有账号。先建档，再关联选材。'
        }
        const material = saveMaterial({ title: parsed.title, summary: parsed.summary })
        if (material) {
          const date = dayKey(new Date())
          const log = accountsState().logs.find((item) => item.accountId === account.id && item.date === date)
          setDayMaterials(account.id, date, [...(log?.materialIds ?? []), material.id])
        }
        return `已关联选材「${parsed.title}」→ ${account.name}。只存指针。`
      },
    })
    ctx.workbench.nav({
      id: 'accounts',
      title: '自媒体账号',
      mark: '号',
      kind: 'view',
      order: 60,
      accelerator: 'CommandOrControl+4',
    })
  },
}
