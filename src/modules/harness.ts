import type { Context } from '@deepseek-ai/cordis'
import type { ModuleDefinition } from '../kernel/main/services/modules'
import { showWorkbench } from '../main/workbench-window'

export const harnessModule: ModuleDefinition = {
  source: 'builtin',
  manifest: {
    id: 'harness',
    title: 'DeepSeek Harness',
    mark: 'H',
    description: '官方 Agent 运行时已并入中栏与 Local API；此模块只留兼容入口，不再起 dsh web。',
    kind: 'background',
    version: '1.0.0',
    group: '实验',
    order: 90,
    inject: ['bridge'],
    capabilities: [],
    removable: false,
  },
  plugin(ctx: Context) {
    ctx.bridge.handle('harness:open', async () => {
      showWorkbench('home')
    })
    ctx.bridge.handle('harness:origin', async () => {
      return { origin: '' }
    })
  },
}
