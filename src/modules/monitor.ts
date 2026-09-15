import type { Context } from '@deepseek-ai/cordis'
import type { ModuleDefinition } from '../kernel/main/services/modules'
import { OCCUPATION_DSH_BUNDLE } from '../kernel/shared/occupation-bundles'
import { registerMonitorIpc, refreshMonitor } from '../main/monitor-ipc'
import { loadMonitorCache } from '../main/monitor-cache'
import { formatMonitorRead, formatMonitorRefresh, formatMonitorHealth, formatMonitorPages, formatMonitorSpeed } from '../shared/skill-route'

export const monitorModule: ModuleDefinition = {
  source: 'builtin',
  manifest: {
    id: 'monitor',
    title: '项目监控',
    mark: '监',
    description: '项目健康度、站点流量、全球性能、页面归因与后台用户统计，刷新时生成明日待办。',
    kind: 'view',
    version: '1.0.0',
    group: '项目',
    order: 40,
    accelerator: 'CommandOrControl+3',
    inject: ['bridge', 'workbench', 'todos', 'tools'],
    capabilities: ['storage', 'todos:write', 'net:vercel.com'],
    removable: false,
    dshBundle: OCCUPATION_DSH_BUNDLE,
  },
  plugin(ctx: Context) {
    registerMonitorIpc((channel, listener) => {
      ctx.bridge.handle(channel, listener)
    })
    ctx.tools.register({
      name: 'monitor_refresh',
      description: '刷新项目监控态势：仓库、站点流量、明日待办。没有数据时说明原因，不要编浏览量。',
      moduleId: 'monitor',
      parameters: {},
      execute: async () => {
        const result = await refreshMonitor()
        return formatMonitorRefresh({
          snapshot: result.snapshot,
          social: result.social,
          proposals: result.proposals,
          cachedAt: new Date().toISOString(),
        })
      },
    })
    ctx.tools.register({
      name: 'monitor_read',
      description: '解读已有态势快照：流量、健康、页面归因、全球性能。没有快照时说明要先刷新态势，不要编数字。',
      moduleId: 'monitor',
      effect: 'read',
      parameters: { text: { type: 'string', description: '用户原话，用来判断看流量、健康还是页面', required: false } },
      execute: async (args) => formatMonitorRead(loadMonitorCache(), args.text || '解读流量'),
    })
    ctx.tools.register({
      name: 'monitor_health',
      description: '解读仓库健康：未提交、超前、部署失败。没有快照时说明要先刷新态势。',
      moduleId: 'monitor',
      effect: 'read',
      parameters: { text: { type: 'string', description: '用户原话', required: false } },
      execute: async (args) => formatMonitorHealth(loadMonitorCache(), args.text || '项目健康'),
    })
    ctx.tools.register({
      name: 'monitor_pages',
      description: '解读页面归因 Top Pages。没有快照时说明要先刷新态势。',
      moduleId: 'monitor',
      effect: 'read',
      parameters: { text: { type: 'string', description: '用户原话', required: false } },
      execute: async (args) => formatMonitorPages(loadMonitorCache(), args.text || '页面归因'),
    })
    ctx.tools.register({
      name: 'monitor_speed',
      description: '解读 Vercel Speed Insights：全球 Core Web Vitals 与各地区 TTFB。没有快照时说明要先刷新态势，不要编 LCP。',
      moduleId: 'monitor',
      effect: 'read',
      parameters: { text: { type: 'string', description: '用户原话', required: false } },
      execute: async (args) => formatMonitorSpeed(loadMonitorCache(), args.text || '解读性能'),
    })
    ctx.workbench.nav({
      id: 'monitor',
      title: '项目监控',
      mark: '监',
      kind: 'view',
      order: 40,
      accelerator: 'CommandOrControl+3',
    })
    if (!process.env.OWNWORKBUDDY_STATS_KEY) {
      ctx.modules.needsConfig('缺少 OWNWORKBUDDY_STATS_KEY，后台用户统计会跳过（其余功能正常）')
    }
  },
}
