import type { Context } from '@deepseek-ai/cordis'
import { KERNEL_PLUGIN_IDS, type KernelPluginId } from '../shared/kernel-bundle.ts'
import { AgentsService } from './services/agents'
import { BridgeService } from './services/bridge'
import { CatalogService } from './services/catalog'
import { DshRuntimeService } from './services/dsh-runtime'
import { KernelWorkService } from './services/kernel-work'
import { LlmService } from './services/llm'
import { ModulesService } from './services/modules'
import { ProfileService } from './services/profile'
import { RepositoryService } from './services/repository'
import { StorageService } from './services/storage'
import { TodosService } from './services/todos'
import { ToolsService } from './services/tools'
import { WorkbenchService } from './services/workbench'

/**
 * 按内核 bundle 的 insert 顺序挂服务。不要在 bootKernel 里再手写一份 plugin 列表。
 */
export async function applyOpcKernel(ctx: Context): Promise<void> {
  for (const id of KERNEL_PLUGIN_IDS) {
    await pluginKernelRow(ctx, id)
  }
}

async function pluginKernelRow(ctx: Context, id: KernelPluginId): Promise<void> {
  switch (id) {
    case 'opc-bridge':
      await ctx.plugin(BridgeService)
      return
    case 'opc-storage':
      await ctx.plugin(StorageService)
      return
    case 'opc-workbench':
      await ctx.plugin(WorkbenchService)
      return
    case 'opc-modules':
      await ctx.plugin(ModulesService)
      return
    case 'opc-todos':
      await ctx.plugin(TodosService)
      return
    case 'opc-catalog':
      await ctx.plugin(CatalogService)
      return
    case 'opc-profile':
      await ctx.plugin(ProfileService)
      return
    case 'opc-repository':
      await ctx.plugin(RepositoryService)
      return
    case 'opc-llm':
      await ctx.plugin(LlmService)
      return
    case 'opc-tools':
      await ctx.plugin(ToolsService)
      return
    case 'opc-dsh-runtime':
      await ctx.plugin(DshRuntimeService)
      return
    case 'opc-kernel-work':
      await ctx.plugin(KernelWorkService)
      return
    case 'opc-agents':
      await ctx.plugin(AgentsService)
      return
    default: {
      const exhaustive: never = id
      return exhaustive
    }
  }
}
