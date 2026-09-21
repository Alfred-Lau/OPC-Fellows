import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
import { join } from 'node:path'
import { app, dialog, shell } from 'electron'
import { Service, type Context } from '@deepseek-ai/cordis'
import { writeWorkspaceDocument } from '../../shared/workspace-note'
import { getWorkbenchWindow } from '../../../main/workbench-window'
import {
  hasIdentityDirectory,
  INBOX_THREAD_ID,
  type AgentRecord,
  type AgentSnapshot,
  type CreateAgentInput,
  type CreateAgentResult,
  type ProjectContextFile,
  type ShortListing,
  type ThreadMessage,
  type ThreadRecord,
  type WorkspaceEntry,
} from '../../shared/agent'
import {
  agentSystemPrompt,
  appendMessage,
  applyThreadListing,
  applyThreadPlan,
  ensureInboxThread,
  ensureRosterSortOrder,
  pickAgentName,
  planCreateAgent,
  planRemoveAgent,
  planRenameAgent,
  planReorderAgents,
  planDispatch,
  planConfigureAgent,
  promoteToClassify,
  routableSkills,
  recommendAgents,
  slugify,
  refreshAgentStatus,
  upsertAgentThread,
  keepOpensourceRoster,
  keepOpensourceThreads,
  upsertDefaultAgents,
  visibleAgents,
  type DispatchAction,
} from '../../shared/agents'
import {
  allocateIntentSystemPrompt,
  parseAllocateIntent,
  type ClassifyDecision,
} from '../../../shared/intent-route'
import {
  ensureHostOnUserProjects,
  ensureProjectSortOrder,
  homeThreadForeignTitles,
  nextProjectSortOrder,
  planDeleteProject,
  planPinProject,
  planProjectCreate,
  planProjectSubmit,
  planRenameProject,
  planReorderProjects,
} from '../../shared/new-task'
import { listedTemplates, templateById } from '../../shared/templates'
import {
  normalizeSkillIds,
  planAssignSkill,
  planRevokeSkill,
  workbenchSkillById,
} from '../../shared/workbench-skills'
import { composeToolFollowUp, dshSessionId } from '../../shared/dsh-rpc'
import { dshTreeHasAgentFactory } from '../../shared/dsh-in-process'
import { parseOpcToolCall, TOOL_ROUND_LIMIT } from '../../shared/opc-tools'
import { defaultToolPacks, normalizeToolPacks, WORKSPACE_TOOL_PACK, type ToolPackId } from '../../shared/tool-packs'
import {
  composerModePrompt,
  offersComposerModes,
  parseChatTurnOptions,
  parseComposerMode,
  planSavedReply,
  resolveComposerTurn,
  storedComposerModeOf,
  threadPlanOf,
  type ChatTurnOptions,
  type ComposerMode,
} from '../../shared/plan-mode'
import { composeRepoBrief } from '../../shared/coding-context'
import { writeMemberPreset } from '../../shared/member-preset'
import { citeAttachments, composeAttachmentCiteText } from '../../shared/dsh-attachment'
import { resolveAgentWorkspacePath } from '../../shared/identity-directory'
import { readJson, writeJson } from './storage'
import { defaultDshCwd } from './dsh-runtime'
import {
  canBindProjectFolder,
  isPathInside,
  planAttachProjectFiles,
  planClearProjectFolder,
  planDetachProjectFile,
  planSetProjectFolder,
  replaceThread,
  resolveProjectCwd,
  shouldWriteWorkspaceDocument,
  type AttachedFileContent,
} from '../../shared/project-context'

interface AgentStoreFile {
  agents: AgentRecord[]
}

interface ThreadStoreFile {
  threads: ThreadRecord[]
  messages: ThreadMessage[]
}

/**
 * Agent / 会话 / 工作区。模块启停仍归 ModulesService；
 * 这里只负责身份实例、默认会话和本地工作目录。
 */
export class AgentsService extends Service {
  static inject = ['bridge', 'completions', 'dshRuntime', 'opcTools']

  private agents: AgentRecord[] = []
  private threads: ThreadRecord[] = []
  private messages: ThreadMessage[] = []

  constructor(ctx: Context) {
    super(ctx, 'roster')
    this.hydrate()
  }

  list(): AgentRecord[] {
    return visibleAgents(this.agents)
  }

  all(): AgentRecord[] {
    return [...this.agents]
  }

  get(id: string): AgentRecord | undefined {
    return this.agents.find((agent) => agent.id === id)
  }

  templates() {
    return listedTemplates()
  }

  recommend() {
    return recommendAgents(this.agents, this.threads)
  }

  nextName(): string {
    return pickAgentName(
      this.agents.map((agent) => agent.title),
      Date.now(),
    )
  }

  hostName(): string {
    return hostname()
  }

  snapshot(): AgentSnapshot {
    const inbox = this.threads.filter((thread) => thread.id === INBOX_THREAD_ID)
    const rest = this.threads
      .filter((thread) => thread.id !== INBOX_THREAD_ID)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    return {
      agents: this.list(),
      threads: [...inbox, ...rest],
      messages: [...this.messages],
    }
  }

  /** 按当前模块启停表补齐默认实例、刷新 needs-module。 */
  syncFromModules(): AgentRecord[] {
    const modules = this.ctx.modules.list().map((info) => ({ id: info.manifest.id, enabled: info.enabled }))
    this.agents = ensureRosterSortOrder(keepOpensourceRoster(upsertDefaultAgents(this.agents, modules)))
    this.threads = keepOpensourceThreads(
      ensureProjectSortOrder(ensureHostOnUserProjects(ensureInboxThread(this.threads))),
      this.agents,
    )
    for (const agent of this.agents) {
      this.threads = upsertAgentThread(this.threads, agent)
      this.ensureWorkspace(agent)
    }
    this.persist()
    return this.list()
  }

  async create(input: CreateAgentInput): Promise<CreateAgentResult> {
    const modules = this.ctx.modules.list().map((info) => ({ id: info.manifest.id, enabled: info.enabled }))
    const planned = planCreateAgent(this.agents, input, modules)
    if (!planned.ok || !planned.agent) {
      return planned
    }
    const hired = planned.agents ?? [planned.agent]
    const template = templateById(input.templateId)
    const enableIds = unique([...(template?.moduleIds ?? []), ...hired.flatMap((agent) => agent.moduleIds)])
    for (const moduleId of enableIds) {
      if (!this.ctx.modules.isEnabled(moduleId) && this.ctx.modules.info(moduleId)) {
        await this.ctx.modules.enable(moduleId)
      }
    }
    const ready = this.ctx.modules.list().map((info) => ({ id: info.manifest.id, enabled: info.enabled }))
    let focus = planned.agent
    const saved: AgentRecord[] = []
    for (const item of hired) {
      const next = refreshAgentStatus(item, ready)
      if (this.agents.some((agent) => agent.id === next.id)) {
        saved.push(this.agents.find((agent) => agent.id === next.id) ?? next)
        continue
      }
      this.agents = [...this.agents, next]
      this.threads = upsertAgentThread(ensureInboxThread(this.threads), next)
      this.ensureWorkspace(next)
      saved.push(next)
      if (item.id === planned.agent.id) {
        focus = next
      }
    }
    this.persist()
    this.emit()
    return { ok: true, agent: focus, agents: saved }
  }

  threadsOf(): ThreadRecord[] {
    return [...this.threads].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  thread(id: string): ThreadRecord | undefined {
    return this.threads.find((item) => item.id === id)
  }

  messagesOf(threadId: string): ThreadMessage[] {
    return this.messages.filter((item) => item.threadId === threadId)
  }

  startTask(
    text: string,
    agentIds: string[],
    workspaceAgentId?: string,
    projectId?: string,
    context?: { folderPath?: string; attachedFiles?: readonly ProjectContextFile[] },
  ): { thread: ThreadRecord; messages: ThreadMessage[]; actions: DispatchAction[] } {
    const trimmed = text.trim()
    if (!trimmed) {
      throw new Error('先写一句这次要做什么')
    }
    const planned = planProjectSubmit({
      text: trimmed,
      agentIds,
      workspaceAgentId,
      projectId,
      folderPath: context?.folderPath,
      attachedFiles: context?.attachedFiles,
    })
    if (!planned.ok) {
      throw new Error(planned.error)
    }
    switch (planned.mode) {
      case 'create':
        this.threads = [
          ...this.threads,
          { ...planned.thread, sortOrder: nextProjectSortOrder(this.threads) },
        ]
        return this.post(planned.thread.id, trimmed)
      case 'continue': {
        const existing = this.thread(planned.threadId)
        if (!existing || existing.kind !== 'user') {
          throw new Error('没有这个项目')
        }
        let next: ThreadRecord = {
          ...existing,
          agentIds: planned.agentIds,
          workspaceAgentId: planned.workspaceAgentId,
        }
        if (planned.folderPath) {
          const folder = planSetProjectFolder([next], next.id, planned.folderPath)
          if (!folder.ok) {
            throw new Error(folder.error)
          }
          next = folder.thread
        }
        if (planned.attachedFiles && planned.attachedFiles.length > 0) {
          const files = planAttachProjectFiles(
            [next],
            next.id,
            planned.attachedFiles.map((file) => file.path),
          )
          if (!files.ok) {
            throw new Error(files.error)
          }
          next = files.thread
        }
        this.threads = this.threads.map((item) => (item.id === planned.threadId ? next : item))
        return this.post(planned.threadId, trimmed)
      }
      default: {
        const exhaustive: never = planned
        return exhaustive
      }
    }
  }

  createProject(
    title: string,
    description: string,
    agentIds: string[],
    workspaceAgentId?: string,
    folderPath?: string,
    attachedFiles?: readonly ProjectContextFile[],
  ): ThreadRecord {
    const planned = planProjectCreate({
      title,
      description,
      agentIds,
      workspaceAgentId,
      folderPath,
      attachedFiles,
    })
    if (!planned.ok) {
      throw new Error(planned.error)
    }
    const thread = { ...planned.thread, sortOrder: nextProjectSortOrder(this.threads) }
    this.threads = [...this.threads, thread]
    this.persist()
    this.emit()
    return thread
  }

  pinProject(threadId: string, pinned: boolean): ThreadRecord {
    const planned = planPinProject(this.threads, threadId, pinned)
    if (!planned.ok) {
      throw new Error(planned.error)
    }
    this.threads = planned.threads
    this.persist()
    this.emit()
    const thread = this.thread(threadId)
    if (!thread) {
      throw new Error('没有这个项目')
    }
    return thread
  }

  renameProject(threadId: string, title: string): ThreadRecord {
    const planned = planRenameProject(this.threads, threadId, title)
    if (!planned.ok) {
      throw new Error(planned.error)
    }
    this.threads = planned.threads
    this.persist()
    this.emit()
    const thread = this.thread(threadId)
    if (!thread) {
      throw new Error('没有这个项目')
    }
    return thread
  }

  deleteProject(threadId: string): boolean {
    const planned = planDeleteProject(this.threads, this.messages, threadId)
    if (!planned.ok) {
      throw new Error(planned.error)
    }
    this.threads = planned.threads
    this.messages = planned.messages
    this.persist()
    this.emit()
    return true
  }

  renameAgent(agentId: string, title: string): AgentRecord {
    const planned = planRenameAgent(this.agents, this.threads, agentId, title)
    if (!planned.ok) {
      throw new Error(planned.error)
    }
    this.agents = planned.agents
    this.threads = planned.threads
    this.persist()
    this.emit()
    const agent = this.get(agentId)
    if (!agent) {
      throw new Error('没有这个成员')
    }
    return agent
  }

  configureAgent(agentId: string, toolPacks: ToolPackId[], planMode: boolean): AgentRecord {
    const planned = planConfigureAgent(this.agents, agentId, { toolPacks, planMode })
    if (!planned.ok) {
      throw new Error(planned.error)
    }
    this.agents = planned.agents
    this.persist()
    this.emit()
    const agent = this.get(agentId)
    if (!agent) {
      throw new Error('没有这个成员')
    }
    return agent
  }

  setComposerMode(threadId: string, agentId: string, mode: ComposerMode): ThreadRecord {
    const thread = this.thread(threadId)
    if (!thread) {
      throw new Error('没有这条会话')
    }
    const next: ThreadRecord = {
      ...thread,
      composerMode: mode,
      composerModes: { ...thread.composerModes, [agentId]: mode },
      updatedAt: new Date().toISOString(),
    }
    return this.commitThread(next)
  }

  clearPlan(threadId: string): ThreadRecord {
    if (!this.thread(threadId)) {
      throw new Error('没有这条记录')
    }
    this.threads = applyThreadPlan(this.threads, threadId, undefined)
    this.persist()
    this.emit()
    const thread = this.thread(threadId)
    if (!thread) {
      throw new Error('没有这条记录')
    }
    return thread
  }

  removeAgent(agentId: string): boolean {
    const planned = planRemoveAgent(this.agents, this.threads, this.messages, agentId)
    if (!planned.ok) {
      throw new Error(planned.error)
    }
    this.agents = planned.agents
    this.threads = planned.threads
    this.messages = planned.messages
    this.persist()
    this.emit()
    return true
  }

  reorderAgents(ids: string[]): AgentRecord[] {
    const planned = planReorderAgents(this.agents, ids)
    if (!planned.ok) {
      throw new Error(planned.error)
    }
    this.agents = planned.agents
    this.persist()
    this.emit()
    return this.list()
  }

  assignSkill(agentId: string, skillId: string): AgentRecord {
    const planned = planAssignSkill(this.agents, agentId, skillId, { now: () => new Date().toISOString() })
    if (!planned.ok || !planned.agents) {
      throw new Error(planned.error ?? '赋能失败')
    }
    this.agents = planned.agents
    this.persist()
    this.emit()
    const agent = this.get(agentId)
    if (!agent) {
      throw new Error('没有这个成员')
    }
    return agent
  }

  revokeSkill(agentId: string, skillId: string): AgentRecord {
    const planned = planRevokeSkill(this.agents, agentId, skillId, { now: () => new Date().toISOString() })
    if (!planned.ok || !planned.agents) {
      throw new Error(planned.error ?? '撤下失败')
    }
    this.agents = planned.agents
    this.persist()
    this.emit()
    const agent = this.get(agentId)
    if (!agent) {
      throw new Error('没有这个成员')
    }
    return agent
  }

  reorderProjects(ids: string[]): ThreadRecord[] {
    const planned = planReorderProjects(this.threads, ids)
    if (!planned.ok) {
      throw new Error(planned.error)
    }
    this.threads = planned.threads
    this.persist()
    this.emit()
    return this.snapshot().threads
  }

  post(threadId: string, text: string): { thread: ThreadRecord; messages: ThreadMessage[]; actions: DispatchAction[] } {
    const thread = this.threads.find((item) => item.id === threadId)
    if (!thread) {
      throw new Error('没有这条记录')
    }
    const trimmed = text.trim()
    if (!trimmed) {
      return { thread, messages: this.messagesOf(threadId), actions: [] }
    }
    const foreign = homeThreadForeignTitles(thread, trimmed, this.agents)
    if (foreign.length > 0) {
      this.messages.push(appendMessage(this.messages, { threadId, role: 'user', text: trimmed }))
      this.messages.push(
        appendMessage(this.messages, {
          threadId,
          role: 'system',
          text: `主对话里不能叫第二个人。开一个项目，把 ${foreign.map((name) => `「${name}」`).join('、')} 加进去。`,
        }),
      )
      this.persist()
      this.emit()
      const latest = this.thread(threadId)
      if (!latest) {
        throw new Error('没有这条记录')
      }
      return { thread: latest, messages: this.messagesOf(threadId), actions: [] }
    }
    const implicitAgentId = thread.workspaceAgentId ?? (thread.kind === 'agent' ? thread.agentIds[0] : undefined)
    const dispatch = planDispatch(trimmed, this.agents, {
      implicitAgentId,
      ...(thread.kind === 'user' ? { projectAgentIds: thread.agentIds } : {}),
    })
    this.messages.push(appendMessage(this.messages, { threadId, role: 'user', text: trimmed }))
    if (dispatch.actions.some((action) => action.kind === 'forward') && dispatch.agentIds.length > 1) {
      const names = dispatch.agentIds
        .map((id) => this.get(id)?.title)
        .filter((title): title is string => Boolean(title))
      this.messages.push(
        appendMessage(this.messages, {
          threadId,
          role: 'system',
          text: `已把问题转给 ${names.map((name) => `@${name}`).join(' ')}`,
        }),
      )
    }
    const now = new Date().toISOString()
    this.threads = this.threads.map((item) =>
      item.id === threadId
        ? {
            ...item,
            updatedAt: now,
            agentIds: unique([...item.agentIds, ...dispatch.agentIds]),
          }
        : item,
    )
    if (dispatch.agentIds.length > 0) {
      this.agents = this.agents.map((agent) =>
        dispatch.agentIds.includes(agent.id) ? { ...agent, updatedAt: now } : agent,
      )
    }
    this.persist()
    this.emit()
    const latest = this.thread(threadId)
    if (!latest) {
      throw new Error('没有这条记录')
    }
    return {
      thread: latest,
      messages: this.messagesOf(threadId),
      actions: promoteToClassify(dispatch.actions, this.agents, { hasKey: this.ctx.completions.hasKey() }),
    }
  }

  async classify(agentId: string, text: string): Promise<ClassifyDecision> {
    const agent = this.get(agentId)
    if (!agent) {
      return { kind: 'miss', text }
    }
    const skills = routableSkills(agent)
    try {
      const raw = await this.ctx.completions.complete({
        system: allocateIntentSystemPrompt(agent.title, skills),
        messages: [{ role: 'user', content: text }],
        temperature: 0,
        json: true,
        timeoutMs: 8_000,
      })
      const decision = parseAllocateIntent(raw, skills)
      switch (decision.kind) {
        case 'invoke':
          return { kind: 'invoke', invoke: decision.skillId, text }
        case 'chat':
          return { kind: 'chat', text }
        case 'note':
          return { kind: 'note', text }
        case 'miss':
          return { kind: 'miss', text }
        default: {
          const exhaustive: never = decision
          return exhaustive
        }
      }
    } catch {
      return { kind: 'miss', text }
    }
  }

  reply(
    threadId: string,
    text: string,
    agentId?: string,
    role: ThreadMessage['role'] = 'agent',
    listing?: ShortListing,
    thinking?: string,
  ): ThreadMessage {
    const message = appendMessage(this.messages, { threadId, role, text, agentId, thinking })
    this.messages.push(message)
    this.threads = applyThreadListing(this.threads, threadId, listing)
    this.persist()
    this.emit()
    return message
  }

  async skillChat(threadId: string, agentId: string, skillId: string): Promise<ThreadMessage> {
    const agent = this.get(agentId)
    const skill = workbenchSkillById(skillId)
    if (!agent || !skill) {
      throw new Error('没有这条赋能 Skill')
    }
    return this.chat(threadId, agentId)
  }

  async chat(threadId: string, agentId: string, options: ChatTurnOptions = {}): Promise<ThreadMessage> {
    const agent = this.get(agentId)
    if (!agent) {
      throw new Error('没有这个成员')
    }
    if (!this.ctx.dshRuntime.hasKey()) {
      return this.reply(
        threadId,
        '需要模型才能开口。先到设置 → 模型里填写 DeepSeek API Key。',
        agentId,
        'system',
      )
    }
    const sessionId = dshSessionId(threadId, agentId)
    try {
      const userBase = latestUserText(this.messagesOf(threadId))
      const packs = normalizeToolPacks(agent.toolPacks).length
        ? normalizeToolPacks(agent.toolPacks)
        : defaultToolPacks(agent.templateId, agent.kind)
      const tools = this.ctx.opcTools.catalog(agent.moduleIds, packs)
      const cwd = this.projectCwd(threadId, agentId)
      const thread = this.thread(threadId)
      const cites = citeAttachments(thread?.folderPath ?? cwd, thread?.attachedFiles ?? [])
      const citeText = composeAttachmentCiteText(cites)
      const user = citeText ? `${citeText}\n\n${userBase}` : userBase
      const composer = offersComposerModes(agent)
        ? resolveComposerTurn({
            requested: options.mode ?? parseComposerMode(thread?.composerMode),
            stored: storedComposerModeOf(thread, agentId),
            userText: userBase,
            agent,
          })
        : { mode: 'agent' as const, writeAllowed: true, savePlan: false, injectPlan: false }
      if (composer.injectPlan) {
        const existing = threadPlanOf(thread, agentId)
        this.threads = applyThreadPlan(this.threads, threadId, {
          status: 'approved',
          text: existing?.text ?? userBase,
          agentId,
        })
      }
      const repoBrief = packs.includes(WORKSPACE_TOOL_PACK) ? composeRepoBrief(cwd) : ''
      const persona = [
        agentSystemPrompt(agent, tools, {
          cwd,
          repoBrief,
          toolProtocol: dshTreeHasAgentFactory(this.ctx) ? 'native' : 'json',
        }),
        composerModePrompt(composer, threadPlanOf(this.thread(threadId), agentId)?.text ?? ''),
      ]
        .filter(Boolean)
        .join('\n')
      writeMemberPreset(app.getPath('userData'), sessionId, persona)
      this.ctx.dshRuntime.beginTurn({
        sessionId,
        threadId,
        agentId,
        cwd,
        writeAllowed: composer.writeAllowed,
        ...(hasIdentityDirectory(agent) ? { identityDirectory: this.workspaceRoot(agent.id) } : {}),
        allowedTools: tools.map((tool) => tool.name),
      })
      let text = user
      try {
        for (let round = 0; round < TOOL_ROUND_LIMIT; round += 1) {
          const turn = await this.ctx.dshRuntime.prompt({ sessionId, text, cwd })
          const call = parseOpcToolCall(turn.text)
          if (!call) {
            if (composer.savePlan && !composer.writeAllowed) {
              this.threads = applyThreadPlan(this.threads, threadId, {
                status: 'draft',
                text: turn.text,
                agentId,
              })
              this.persist()
              return this.reply(threadId, planSavedReply(turn.text), agentId, 'agent', undefined, turn.thinking)
            }
            return this.reply(threadId, turn.text, agentId, 'agent', undefined, turn.thinking)
          }
          const allowed = tools.some((tool) => tool.name === call.name)
          let result: string
          try {
            if (!allowed) {
              throw new Error(`当前成员不能调用「${call.name}」。`)
            }
            result = (
              await this.ctx.opcTools.invoke(call.name, call.args, {
                threadId,
                agentId,
                workspaceRoot: cwd,
                identityDirectory: hasIdentityDirectory(agent) ? this.workspaceRoot(agent.id) : undefined,
                writeAllowed: composer.writeAllowed,
              })
            ).text
          } catch (error) {
            result = error instanceof Error ? error.message : String(error)
          }
          text = composeToolFollowUp(persona, user, call.name, result)
        }
        return this.reply(threadId, '工具调用次数过多，先停在这里。', agentId, 'system')
      } finally {
        this.ctx.dshRuntime.endTurn(sessionId)
      }
    } catch (error) {
      this.ctx.dshRuntime.endTurn(sessionId)
      const message = error instanceof Error ? error.message : String(error)
      return this.reply(threadId, `没法接上：${message}`, agentId, 'system')
    }
  }

  async pickFolder(threadId?: string): Promise<{ path: string } | null> {
    const current = threadId ? this.thread(threadId)?.folderPath : undefined
    const path = await this.openLocalPath({
      title: '选择项目文件夹',
      properties: ['openDirectory'],
      defaultPath: current,
    })
    if (!path) {
      return null
    }
    if (threadId && canBindProjectFolder(this.thread(threadId))) {
      this.setFolder(threadId, path)
    }
    return { path }
  }

  async pickFiles(threadId?: string): Promise<{ paths: string[] } | null> {
    const current = threadId ? this.thread(threadId)?.folderPath : undefined
    const paths = await this.openLocalPaths({
      title: '选择要引用的文件',
      properties: ['openFile', 'multiSelections'],
      defaultPath: current,
    })
    if (paths.length === 0) {
      return null
    }
    if (threadId && canBindProjectFolder(this.thread(threadId))) {
      this.attachFiles(threadId, paths)
    }
    return { paths }
  }

  setFolder(threadId: string, path: string): ThreadRecord {
    const planned = planSetProjectFolder(this.threads, threadId, path)
    if (!planned.ok) {
      throw new Error(planned.error)
    }
    return this.commitThread(planned.thread)
  }

  clearFolder(threadId: string): ThreadRecord {
    const planned = planClearProjectFolder(this.threads, threadId)
    if (!planned.ok) {
      throw new Error(planned.error)
    }
    return this.commitThread(planned.thread)
  }

  attachFiles(threadId: string, paths: readonly string[]): ThreadRecord {
    const planned = planAttachProjectFiles(this.threads, threadId, paths)
    if (!planned.ok) {
      throw new Error(planned.error)
    }
    return this.commitThread(planned.thread)
  }

  detachFile(threadId: string, path: string): ThreadRecord {
    const planned = planDetachProjectFile(this.threads, threadId, path)
    if (!planned.ok) {
      throw new Error(planned.error)
    }
    return this.commitThread(planned.thread)
  }

  writeWorkspaceNote(threadId: string, text: string): string | undefined {
    const cwd = this.thread(threadId)?.folderPath
    if (!cwd || !shouldWriteWorkspaceDocument(cwd, app.getPath('userData'))) {
      return undefined
    }
    return writeWorkspaceDocument(cwd, text, new Date().toISOString(), `note-${Date.now().toString(36)}`) ?? undefined
  }

  projectCwd(threadId?: string, agentId?: string): string {
    const thread = threadId ? this.thread(threadId) : undefined
    const root = resolveProjectCwd({
      folderPath: thread?.folderPath,
      agentWorkspace: agentId ? this.workspaceRoot(agentId) : undefined,
      fallback: defaultDshCwd(),
    })
    mkdirSync(root, { recursive: true })
    return root
  }

  workspaceTree(agentId?: string, threadId?: string): WorkspaceEntry[] {
    const root = this.projectCwd(threadId, agentId)
    if (!existsSync(root)) {
      mkdirSync(root, { recursive: true })
    }
    return readTree(root, 0)
  }

  async openPath(path: string, folderPath?: string): Promise<boolean> {
    if (!path || !existsSync(path)) {
      return false
    }
    if (folderPath && !isPathInside(folderPath, path)) {
      return false
    }
    const error = await shell.openPath(path)
    return error === ''
  }

  workspaceRoot(agentId?: string): string {
    const userData = app.getPath('userData')
    if (!agentId) {
      return join(userData, 'workspaces')
    }
    const agent = this.get(agentId)
    if (!agent || !hasIdentityDirectory(agent)) {
      return join(userData, 'workspaces', slugify(agent?.id ?? agentId))
    }
    const legacy = join(userData, 'workspaces', slugify(agent.id))
    const resolved =
      resolveAgentWorkspacePath({
        kind: agent.kind,
        workspacePath: agent.workspacePath,
        title: agent.title,
        agentId: agent.id,
        home: homedir(),
        userData,
        legacyExists: existsSync(legacy),
      }) ?? legacy
    mkdirSync(resolved, { recursive: true })
    if (agent.workspacePath !== resolved) {
      agent.workspacePath = resolved
    }
    return resolved
  }

  private commitThread(thread: ThreadRecord): ThreadRecord {
    this.threads = replaceThread(this.threads, thread)
    this.persist()
    this.emit()
    return thread
  }

  private readAttachedContents(thread?: ThreadRecord): AttachedFileContent[] {
    const files = thread?.attachedFiles ?? []
    const folder = thread?.folderPath
    return files.map((file) => {
      if (folder && !isPathInside(folder, file.path)) {
        return { ...file, omitted: '不在项目文件夹里' }
      }
      try {
        const buf = readFileSync(file.path)
        if (buf.includes(0)) {
          return { ...file, omitted: '不是文本' }
        }
        const text = buf.toString('utf8')
        if (text.length > 80_000) {
          return { ...file, text: text.slice(0, 80_000), omitted: '已截断' }
        }
        return { ...file, text }
      } catch {
        return { ...file, omitted: '读不到' }
      }
    })
  }

  private async openLocalPath(options: Electron.OpenDialogOptions): Promise<string | undefined> {
    const paths = await this.openLocalPaths({ ...options, properties: options.properties ?? ['openDirectory'] })
    return paths[0]
  }

  private async openLocalPaths(options: Electron.OpenDialogOptions): Promise<string[]> {
    const parent = getWorkbenchWindow()
    const picked = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    if (picked.canceled) {
      return []
    }
    return picked.filePaths.filter(Boolean)
  }

  private ensureWorkspace(agent: AgentRecord): void {
    const root = this.workspaceRoot(agent.id)
    mkdirSync(root, { recursive: true })
    agent.workspacePath = root
  }

  private hydrate(): void {
    const stored = readJson<AgentStoreFile>(this.agentsPath(), { agents: [] })
    const threadStore = readJson<ThreadStoreFile>(this.threadsPath(), { threads: [], messages: [] })
    const loaded = Array.isArray(stored.agents) ? stored.agents : []
    this.agents = ensureRosterSortOrder(
      keepOpensourceRoster(
        loaded.map((agent) => {
          const skillIds = normalizeSkillIds(agent.skillIds)
          const toolPacks = normalizeToolPacks(agent.toolPacks)
          const packs = toolPacks.length > 0 ? toolPacks : defaultToolPacks(agent.templateId, agent.kind)
          return {
            ...agent,
            skillIds: skillIds.length > 0 ? skillIds : undefined,
            toolPacks: packs,
            planMode: agent.planMode === true,
          }
        }),
      ),
    )
    const loadedThreads = Array.isArray(threadStore.threads) ? threadStore.threads : []
    this.threads = keepOpensourceThreads(
      ensureProjectSortOrder(ensureHostOnUserProjects(ensureInboxThread(loadedThreads))),
      this.agents,
    )
    this.messages = Array.isArray(threadStore.messages) ? threadStore.messages : []
    const agentsDirty =
      this.agents.length !== loaded.length || this.agents.some((agent, index) => agent !== loaded[index])
    const threadsDirty =
      this.threads.length !== loadedThreads.length ||
      this.threads.some((thread) => {
      const prev = loadedThreads.find((item) => item.id === thread.id)
      if (!prev) {
        return true
      }
      if (thread.kind === 'user' && (prev.sortOrder !== thread.sortOrder || prev.workspaceAgentId !== thread.workspaceAgentId)) {
        return true
      }
      return thread.kind === 'user' && (prev.agentIds.length !== thread.agentIds.length || prev.agentIds.some((id, index) => id !== thread.agentIds[index]))
    })
    if (agentsDirty || threadsDirty) {
      this.persist()
    }
  }

  private persist(): void {
    writeJson(this.agentsPath(), { agents: this.agents })
    writeJson(this.threadsPath(), { threads: this.threads, messages: this.messages })
  }

  private agentsPath(): string {
    return join(app.getPath('userData'), 'kernel', 'agents.json')
  }

  private threadsPath(): string {
    return join(app.getPath('userData'), 'kernel', 'threads.json')
  }

  private emit(): void {
    this.ctx.bridge.send('agents:changed')
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function latestUserText(messages: readonly ThreadMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'user' && message.text.trim()) {
      return message.text.trim()
    }
  }
  throw new Error('没有可发送的对话内容。')
}

function readTree(dir: string, depth: number): WorkspaceEntry[] {
  if (depth > 4) {
    return []
  }
  let names: string[] = []
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  return names
    .filter((name) => !name.startsWith('.'))
    .map((name) => {
      const path = join(dir, name)
      try {
        const stat = statSync(path)
        if (stat.isDirectory()) {
          return { name, path, kind: 'dir' as const, children: readTree(path, depth + 1) }
        }
        return { name, path, kind: 'file' as const }
      } catch {
        return { name, path, kind: 'file' as const }
      }
    })
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'dir' ? -1 : 1
      }
      return left.name.localeCompare(right.name, 'zh')
    })
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    roster: AgentsService
  }
}
