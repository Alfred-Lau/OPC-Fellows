import { app } from 'electron'
import { Context } from '@deepseek-ai/cordis'
import { installFailLoud, loadLayeredEnv } from '@deepseek-ai/dsh-app-boot'
import { BUILTIN_MODULES } from '../../modules'
import { showWorkbench } from '../../main/workbench-window'
import { moduleAssetUrl } from '../shared/module-protocol'
import { applyOpcKernel } from './apply'
import { installShell } from './shell'
import { isShortListing } from '../../shared/listing'
import type { ProjectContextFile } from '../shared/agent'
import { asToolArgs } from '../shared/opc-tools'
import { executeOfficialToolIfPossible, type OfficialToolRuntime } from '../shared/opc-tool-bridge'
import { isToolPackId } from '../shared/tool-packs'
import { parseChatTurnOptions, parseComposerMode } from '../shared/plan-mode'
import { bootKernelTree } from '../shared/dsh-desktop-profile'
import { dshHome } from '../shared/opc-profile'
import { resolveActiveLlm, withLlmEnv } from '../../main/credentials'
import { llmOverlayYaml } from '../../shared/llm-overlay'

/**
 * 内核启动。能 in-process 时走官方 `boot()` + desktop profile；
 * 缺 host 才自建 Context，对话再 spawn opc。
 */
export async function bootKernel(quit: () => Promise<void>): Promise<Context> {
  Object.assign(process.env, withLlmEnv())
  process.env.DSH_TELEMETRY_DISABLED = '1'
  process.env.DSH_PERMISSION_MODE = 'workspace-write'
  loadLayeredEnv('dsh', process.cwd(), (line) => {
    console.warn(line)
  })
  installFailLoud('dsh')
  const ctx = await bootKernelTree({
    resourcesPath: typeof process.resourcesPath === 'string' ? process.resourcesPath : undefined,
    appPath: app.getAppPath(),
    cwd: process.cwd(),
    dshHome: dshHome(),
    applyHost: applyOpcKernel,
    overlayYaml: llmOverlayYaml(resolveActiveLlm()) ?? undefined,
  })

  registerKernelNav(ctx)
  registerKernelIpc(ctx)

  for (const definition of BUILTIN_MODULES) {
    ctx.modules.define(definition)
  }
  for (const definition of await ctx.repository.installed()) {
    ctx.modules.define(definition)
  }

  await ctx.modules.start()
  ctx.roster.syncFromModules()
  installShell(ctx, quit)

  // 模块开关会改动导航，托盘/菜单由 installShell 负责重建，
  // 这里只管通知渲染进程刷新侧栏，并让默认 Agent 跟着启停走。
  ctx.modules.onChanged(() => {
    ctx.roster.syncFromModules()
    ctx.bridge.send('workbench:modules-changed')
  })

  return ctx
}

/** 首页、待办、技能是内核自带的，不随模块开关消失。设置从用户中心进，不占导航。 */
function registerKernelNav(ctx: Context): void {
  ctx.workbench.nav({ id: 'todos', title: '待办拆解', mark: '办', kind: 'view', order: 10, accelerator: 'CommandOrControl+T' })
  ctx.workbench.nav({ id: 'extensions', title: '技能', mark: '技', kind: 'view', order: 1000 })
}

function registerKernelIpc(ctx: Context): void {
  ctx.bridge.handle('workbench:modules', () => ctx.modules.list())
  ctx.bridge.handle('workbench:enable', (_event, id: string) => ctx.modules.enable(String(id)))
  ctx.bridge.handle('workbench:disable', (_event, id: string) => ctx.modules.disable(String(id)))
  ctx.bridge.handle('workbench:set-config', (_event, id: string, config: Record<string, unknown>) =>
    ctx.modules.setConfig(String(id), config ?? {}),
  )
  ctx.bridge.handle('workbench:reorder', (_event, ids: string[]) =>
    ctx.modules.reorder(Array.isArray(ids) ? ids.map(String) : []),
  )
  ctx.bridge.handle('workbench:logs', (_event, id?: string) =>
    ctx.modules.logs(typeof id === 'string' ? id : undefined),
  )
  ctx.bridge.handle('workbench:channels', () => ctx.bridge.channels())
  ctx.bridge.handle('workbench:open', async (_event, id: string) => {
    await ctx.workbench.open(String(id))
  })
  ctx.bridge.handle('workbench:nav', () =>
    ctx.workbench.entries().map(({ open: _open, ...entry }) => entry),
  )
  ctx.bridge.handle('workbench:ui', (_event, id: string) => {
    const info = ctx.modules.info(String(id))
    if (!info?.manifest.ui || !info.enabled) {
      return null
    }
    return { url: moduleAssetUrl(info.manifest.id, info.manifest.ui) }
  })

  ctx.bridge.handle('repo:sources', () => ctx.repository.sources())
  ctx.bridge.handle('repo:add-source', (_event, kind: string, location: string) =>
    ctx.repository.addSource(String(kind), String(location)),
  )
  ctx.bridge.handle('repo:remove-source', (_event, id: string) => ctx.repository.removeSource(String(id)))
  ctx.bridge.handle('repo:available', () => ctx.repository.available())
  ctx.bridge.handle('repo:install', (_event, sourceId: string, moduleId: string) =>
    ctx.repository.install(String(sourceId), String(moduleId)),
  )
  ctx.bridge.handle('repo:uninstall', (_event, moduleId: string) => ctx.repository.uninstall(String(moduleId)))

  ctx.bridge.handle('agents:snapshot', () => ctx.roster.snapshot())
  ctx.bridge.handle('agents:recommend', () => ctx.roster.recommend())
  ctx.bridge.handle('agents:next-name', () => ctx.roster.nextName())
  ctx.bridge.handle('agents:host-name', () => ctx.roster.hostName())
  ctx.bridge.handle('agents:create', (_event, input: Record<string, unknown>) =>
    ctx.roster.create({
      templateId: String(input.templateId ?? 'blank'),
      title: String(input.title ?? ''),
      ...(typeof input.description === 'string' ? { description: input.description } : {}),
      ...(typeof input.workspaceName === 'string' ? { workspaceName: input.workspaceName } : {}),
      ...(typeof input.cloneFrom === 'string' ? { cloneFrom: input.cloneFrom } : {}),
      ...(Array.isArray(input.extraModuleIds) ? { extraModuleIds: input.extraModuleIds.map(String) } : {}),
      ...(Array.isArray(input.extraToolPacks)
        ? { extraToolPacks: input.extraToolPacks.filter(isToolPackId) }
        : {}),
      ...(typeof input.planMode === 'boolean' ? { planMode: input.planMode } : {}),
    }),
  )
  ctx.bridge.handle('agents:configure', (_event, input: Record<string, unknown>) =>
    ctx.roster.configureAgent(
      String(input.agentId ?? ''),
      Array.isArray(input.toolPacks) ? input.toolPacks.filter(isToolPackId) : [],
      input.planMode === true,
    ),
  )
  ctx.bridge.handle('tools:invoke', async (_event, name: string, args: unknown) => {
    const record = asToolArgs(args)
    const toolName = String(name)
    const native = await executeOfficialToolIfPossible(
      ctx.get('tools') as OfficialToolRuntime | undefined,
      toolName,
      record,
    )
    if (native !== undefined) {
      return { text: native }
    }
    return ctx.opcTools.invoke(toolName, record, {
      writeAllowed: true,
      ...(record.agent_id ? { agentId: record.agent_id } : {}),
    })
  })
  ctx.bridge.handle(
    'agents:start-task',
    (
      _event,
      text: string,
      agentIds: unknown,
      workspaceAgentId?: string,
      projectId?: string,
      context?: { folderPath?: string; attachedFiles?: { path: string; name: string }[] },
    ) =>
      ctx.roster.startTask(
        String(text),
        Array.isArray(agentIds) ? agentIds.map(String) : [],
        typeof workspaceAgentId === 'string' && workspaceAgentId ? workspaceAgentId : undefined,
        typeof projectId === 'string' && projectId ? projectId : undefined,
        asProjectContext(context),
      ),
  )
  ctx.bridge.handle(
    'agents:create-project',
    (
      _event,
      title: string,
      description: string,
      agentIds: unknown,
      workspaceAgentId?: string,
      folderPath?: string,
      attachedFiles?: unknown,
    ) =>
      ctx.roster.createProject(
        String(title),
        String(description ?? ''),
        Array.isArray(agentIds) ? agentIds.map(String) : [],
        typeof workspaceAgentId === 'string' && workspaceAgentId ? workspaceAgentId : undefined,
        typeof folderPath === 'string' && folderPath ? folderPath : undefined,
        asAttachedFiles(attachedFiles),
      ),
  )
  ctx.bridge.handle('agents:post', (_event, threadId: string, text: string) =>
    ctx.roster.post(String(threadId), String(text)),
  )
  ctx.bridge.handle('agents:classify', (_event, agentId: string, text: string) =>
    ctx.roster.classify(String(agentId), String(text)),
  )
  ctx.bridge.handle('agents:chat', (_event, threadId: string, agentId: string, options?: unknown) =>
    ctx.roster.chat(String(threadId), String(agentId), parseChatTurnOptions(options)),
  )
  ctx.bridge.handle('agents:set-composer-mode', (_event, threadId: string, agentId: string, mode: unknown) => {
    const parsed = parseComposerMode(mode)
    if (!parsed) {
      throw new Error('开口模式只能是问、计划或动手。')
    }
    return ctx.roster.setComposerMode(String(threadId), String(agentId), parsed)
  })
  ctx.bridge.handle('agents:clear-plan', (_event, threadId: string) => ctx.roster.clearPlan(String(threadId)))
  ctx.bridge.handle('agents:approval-decide', (_event, id: string, decision: unknown) =>
    ctx.dshRuntime.decideApproval(String(id), decision),
  )
  ctx.bridge.handle('agents:reply', (_event, threadId: string, text: string, agentId?: string, listing?: unknown, thinking?: unknown) =>
    ctx.roster.reply(
      String(threadId),
      String(text),
      typeof agentId === 'string' ? agentId : undefined,
      'agent',
      isShortListing(listing) ? listing : undefined,
      typeof thinking === 'string' ? thinking : undefined,
    ),
  )
  ctx.bridge.handle('agents:messages', (_event, threadId: string) => ctx.roster.messagesOf(String(threadId)))
  ctx.bridge.handle('agents:workspace', (_event, agentId?: string, threadId?: string) =>
    ctx.roster.workspaceTree(
      typeof agentId === 'string' && agentId ? agentId : undefined,
      typeof threadId === 'string' && threadId ? threadId : undefined,
    ),
  )
  ctx.bridge.handle('agents:open-path', (_event, path: string, folderPath?: string) =>
    ctx.roster.openPath(String(path), typeof folderPath === 'string' && folderPath ? folderPath : undefined),
  )
  ctx.bridge.handle('agents:pick-folder', (_event, threadId?: string) =>
    ctx.roster.pickFolder(typeof threadId === 'string' && threadId ? threadId : undefined),
  )
  ctx.bridge.handle('agents:pick-files', (_event, threadId?: string) =>
    ctx.roster.pickFiles(typeof threadId === 'string' && threadId ? threadId : undefined),
  )
  ctx.bridge.handle('agents:set-folder', (_event, threadId: string, path: string) =>
    ctx.roster.setFolder(String(threadId), String(path)),
  )
  ctx.bridge.handle('agents:clear-folder', (_event, threadId: string) => ctx.roster.clearFolder(String(threadId)))
  ctx.bridge.handle('agents:attach-files', (_event, threadId: string, paths: unknown) =>
    ctx.roster.attachFiles(String(threadId), Array.isArray(paths) ? paths.map(String) : []),
  )
  ctx.bridge.handle('agents:detach-file', (_event, threadId: string, path: string) =>
    ctx.roster.detachFile(String(threadId), String(path)),
  )
  ctx.bridge.handle('agents:write-workspace-note', (_event, threadId: string, text: string) =>
    ctx.roster.writeWorkspaceNote(String(threadId), String(text ?? '')),
  )
  ctx.bridge.handle('agents:pin-project', (_event, threadId: string, pinned: boolean) =>
    ctx.roster.pinProject(String(threadId), Boolean(pinned)),
  )
  ctx.bridge.handle('agents:rename-project', (_event, threadId: string, title: string) =>
    ctx.roster.renameProject(String(threadId), String(title)),
  )
  ctx.bridge.handle('agents:delete-project', (_event, threadId: string) => ctx.roster.deleteProject(String(threadId)))
  ctx.bridge.handle('agents:rename', (_event, agentId: string, title: string) =>
    ctx.roster.renameAgent(String(agentId), String(title)),
  )
  ctx.bridge.handle('agents:remove', (_event, agentId: string) => ctx.roster.removeAgent(String(agentId)))
  ctx.bridge.handle('agents:assign-skill', (_event, agentId: string, skillId: string) =>
    ctx.roster.assignSkill(String(agentId), String(skillId)),
  )
  ctx.bridge.handle('agents:revoke-skill', (_event, agentId: string, skillId: string) =>
    ctx.roster.revokeSkill(String(agentId), String(skillId)),
  )
  ctx.bridge.handle('agents:skill-chat', (_event, threadId: string, agentId: string, skillId: string) =>
    ctx.roster.skillChat(String(threadId), String(agentId), String(skillId)),
  )
  ctx.bridge.handle('agents:reorder', (_event, ids: unknown) =>
    ctx.roster.reorderAgents(Array.isArray(ids) ? ids.map(String) : []),
  )
  ctx.bridge.handle('agents:reorder-projects', (_event, ids: unknown) =>
    ctx.roster.reorderProjects(Array.isArray(ids) ? ids.map(String) : []),
  )
}

/** 启动时打开哪个视图。环境变量指定的模块若已停用则回首页。 */
export function initialView(ctx: Context): string {
  const requested = process.env.OWNWORKBUDDY_START_VIEW
  if (requested && (requested === 'home' || ctx.workbench.get(requested))) {
    return requested
  }
  return 'home'
}

export function openInitialView(ctx: Context): void {
  showWorkbench(initialView(ctx))
}

function asProjectContext(value: unknown): { folderPath?: string; attachedFiles?: ProjectContextFile[] } | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const record = value as { folderPath?: unknown; attachedFiles?: unknown }
  const folderPath = typeof record.folderPath === 'string' && record.folderPath ? record.folderPath : undefined
  const attachedFiles = asAttachedFiles(record.attachedFiles)
  if (!folderPath && (!attachedFiles || attachedFiles.length === 0)) {
    return undefined
  }
  return {
    ...(folderPath ? { folderPath } : {}),
    ...(attachedFiles && attachedFiles.length > 0 ? { attachedFiles } : {}),
  }
}

function asAttachedFiles(value: unknown): ProjectContextFile[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const files = value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return undefined
      }
      const record = item as { path?: unknown; name?: unknown }
      if (typeof record.path !== 'string' || !record.path) {
        return undefined
      }
      return {
        path: record.path,
        name: typeof record.name === 'string' && record.name ? record.name : record.path,
      }
    })
    .filter((file): file is ProjectContextFile => Boolean(file))
  return files.length > 0 ? files : undefined
}
