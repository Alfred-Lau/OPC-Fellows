import { contextBridge, ipcRenderer } from 'electron'
import type { AgentInboxInput, AgentInboxResult } from '../shared/agent-inbox'
import type { WorkbenchView } from '../shared/features'
import type { WorkbenchCatalog } from '../kernel/shared/catalog'
import type { WorkbenchProfileView } from '../kernel/shared/profile'
import type { ModuleInfo, ModuleLogEntry } from '../kernel/shared/module'
import type { NavEntry } from '../kernel/shared/nav'
import type { AvailableModule, InstallResult, ModuleSourceRef } from '../kernel/shared/repository'
import type {
  AgentRecommend,
  AgentSnapshot,
  ConfigureAgentInput,
  CreateAgentInput,
  CreateAgentResult,
  ShortListing,
  ThreadMessage,
  WorkspaceEntry,
  ProjectContextFile,
} from '../kernel/shared/agent'
import type { ToolEvent } from '../kernel/shared/tool-events'
import type { ApprovalDecision, ApprovalPrompt } from '../kernel/shared/approval'
import type { SocialMetricsInput, SocialState } from '../shared/social'
import type { HostStatus } from '../shared/status'
import type { LlmKeyResult, LlmSettings } from '../shared/deepseek'
import type { ThemePreference } from '../shared/theme'
import type { DecomposeInput, DecomposeResult, DraftTodo, TodoItem } from '../shared/todo'

type ThemeState = { preference: ThemePreference; dark: boolean }

contextBridge.exposeInMainWorld('ownworkbuddy', {
  /**
   * 内核通道，永远可用。模块自己的通道会随模块停用而消失，
   * 这一组不会 —— 否则关掉模块之后就没法再打开它了。
   */
  workbench: {
    modules: () => ipcRenderer.invoke('workbench:modules') as Promise<ModuleInfo[]>,
    nav: () => ipcRenderer.invoke('workbench:nav') as Promise<NavEntry[]>,
    enable: (id: string) => ipcRenderer.invoke('workbench:enable', id) as Promise<ModuleInfo[]>,
    disable: (id: string) => ipcRenderer.invoke('workbench:disable', id) as Promise<ModuleInfo[]>,
    setConfig: (id: string, config: Record<string, unknown>) =>
      ipcRenderer.invoke('workbench:set-config', id, config) as Promise<ModuleInfo[]>,
    reorder: (ids: string[]) => ipcRenderer.invoke('workbench:reorder', ids) as Promise<ModuleInfo[]>,
    logs: (id?: string) => ipcRenderer.invoke('workbench:logs', id) as Promise<ModuleLogEntry[]>,
    channels: () => ipcRenderer.invoke('workbench:channels') as Promise<{ channel: string; moduleId: string }[]>,
    open: (id: string) => ipcRenderer.invoke('workbench:open', id) as Promise<void>,
    ui: (id: string) => ipcRenderer.invoke('workbench:ui', id) as Promise<{ url: string } | null>,
    invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
    catalog: () => ipcRenderer.invoke('workbench:catalog') as Promise<WorkbenchCatalog>,
    saveCatalog: (catalog: WorkbenchCatalog) =>
      ipcRenderer.invoke('workbench:save-catalog', catalog) as Promise<WorkbenchCatalog>,
    resetCatalog: () => ipcRenderer.invoke('workbench:reset-catalog') as Promise<WorkbenchCatalog>,
    onChanged: (callback: () => void) => {
      const listener = (): void => {
        callback()
      }
      ipcRenderer.on('workbench:modules-changed', listener)
      return () => {
        ipcRenderer.removeListener('workbench:modules-changed', listener)
      }
    },
    onCatalogChanged: (callback: (catalog: WorkbenchCatalog) => void) => {
      const listener = (_event: unknown, catalog: WorkbenchCatalog): void => {
        callback(catalog)
      }
      ipcRenderer.on('workbench:catalog-changed', listener)
      return () => {
        ipcRenderer.removeListener('workbench:catalog-changed', listener)
      }
    },
  },
  profile: {
    get: () => ipcRenderer.invoke('profile:get') as Promise<WorkbenchProfileView>,
    save: (input: { displayName: string }) =>
      ipcRenderer.invoke('profile:save', input) as Promise<WorkbenchProfileView>,
    pickAvatar: () => ipcRenderer.invoke('profile:pick-avatar') as Promise<WorkbenchProfileView | null>,
    clearAvatar: () => ipcRenderer.invoke('profile:clear-avatar') as Promise<WorkbenchProfileView>,
  },
  llm: {
    settings: () => ipcRenderer.invoke('llm:settings') as Promise<LlmSettings>,
    setApiKey: (key: string | null) => ipcRenderer.invoke('llm:set-api-key', key) as Promise<LlmKeyResult>,
  },
  agents: {
    snapshot: () => ipcRenderer.invoke('agents:snapshot') as Promise<AgentSnapshot>,
    recommend: () => ipcRenderer.invoke('agents:recommend') as Promise<AgentRecommend>,
    nextName: () => ipcRenderer.invoke('agents:next-name') as Promise<string>,
    hostName: () => ipcRenderer.invoke('agents:host-name') as Promise<string>,
    create: (input: CreateAgentInput) => ipcRenderer.invoke('agents:create', input) as Promise<CreateAgentResult>,
    configure: (input: ConfigureAgentInput) =>
      ipcRenderer.invoke('agents:configure', input) as Promise<AgentSnapshot['agents'][number]>,
    startTask: (
      text: string,
      agentIds: string[],
      workspaceAgentId?: string,
      projectId?: string,
      context?: { folderPath?: string; attachedFiles?: ProjectContextFile[] },
    ) =>
      ipcRenderer.invoke('agents:start-task', text, agentIds, workspaceAgentId, projectId, context) as Promise<{
        thread: AgentSnapshot['threads'][number]
        messages: ThreadMessage[]
        actions: { kind: string; agentId?: string; agentIds?: string[]; text: string; invoke?: string }[]
      }>,
    createProject: (
      title: string,
      description: string,
      agentIds: string[],
      workspaceAgentId?: string,
      folderPath?: string,
      attachedFiles?: ProjectContextFile[],
    ) =>
      ipcRenderer.invoke(
        'agents:create-project',
        title,
        description,
        agentIds,
        workspaceAgentId,
        folderPath,
        attachedFiles,
      ) as Promise<AgentSnapshot['threads'][number]>,
    post: (threadId: string, text: string) =>
      ipcRenderer.invoke('agents:post', threadId, text) as Promise<{
        thread: AgentSnapshot['threads'][number]
        messages: ThreadMessage[]
        actions: { kind: string; agentId?: string; agentIds?: string[]; text: string; invoke?: string }[]
      }>,
    classify: (agentId: string, text: string) =>
      ipcRenderer.invoke('agents:classify', agentId, text) as Promise<{
        kind: 'invoke' | 'chat' | 'miss' | 'note'
        invoke?: string
        text: string
      }>,
    chat: (threadId: string, agentId: string, options?: { mode?: 'ask' | 'plan' | 'agent' }) =>
      ipcRenderer.invoke('agents:chat', threadId, agentId, options) as Promise<ThreadMessage>,
    setComposerMode: (threadId: string, agentId: string, mode: 'ask' | 'plan' | 'agent') =>
      ipcRenderer.invoke('agents:set-composer-mode', threadId, agentId, mode) as Promise<
        AgentSnapshot['threads'][number]
      >,
    clearPlan: (threadId: string) =>
      ipcRenderer.invoke('agents:clear-plan', threadId) as Promise<AgentSnapshot['threads'][number]>,
    reply: (threadId: string, text: string, agentId?: string, listing?: ShortListing, thinking?: string) =>
      ipcRenderer.invoke('agents:reply', threadId, text, agentId, listing, thinking) as Promise<ThreadMessage>,
    messages: (threadId: string) => ipcRenderer.invoke('agents:messages', threadId) as Promise<ThreadMessage[]>,
    workspace: (agentId?: string, threadId?: string) =>
      ipcRenderer.invoke('agents:workspace', agentId, threadId) as Promise<WorkspaceEntry[]>,
    openPath: (path: string, folderPath?: string) =>
      ipcRenderer.invoke('agents:open-path', path, folderPath) as Promise<boolean>,
    pickFolder: (threadId?: string) =>
      ipcRenderer.invoke('agents:pick-folder', threadId) as Promise<{ path: string } | null>,
    pickFiles: (threadId?: string) =>
      ipcRenderer.invoke('agents:pick-files', threadId) as Promise<{ paths: string[] } | null>,
    setFolder: (threadId: string, path: string) =>
      ipcRenderer.invoke('agents:set-folder', threadId, path) as Promise<AgentSnapshot['threads'][number]>,
    clearFolder: (threadId: string) =>
      ipcRenderer.invoke('agents:clear-folder', threadId) as Promise<AgentSnapshot['threads'][number]>,
    attachFiles: (threadId: string, paths: string[]) =>
      ipcRenderer.invoke('agents:attach-files', threadId, paths) as Promise<AgentSnapshot['threads'][number]>,
    detachFile: (threadId: string, path: string) =>
      ipcRenderer.invoke('agents:detach-file', threadId, path) as Promise<AgentSnapshot['threads'][number]>,
    writeWorkspaceNote: (threadId: string, text: string) =>
      ipcRenderer.invoke('agents:write-workspace-note', threadId, text) as Promise<string | undefined>,
    pinProject: (threadId: string, pinned: boolean) =>
      ipcRenderer.invoke('agents:pin-project', threadId, pinned) as Promise<AgentSnapshot['threads'][number]>,
    renameProject: (threadId: string, title: string) =>
      ipcRenderer.invoke('agents:rename-project', threadId, title) as Promise<AgentSnapshot['threads'][number]>,
    deleteProject: (threadId: string) => ipcRenderer.invoke('agents:delete-project', threadId) as Promise<boolean>,
    rename: (agentId: string, title: string) =>
      ipcRenderer.invoke('agents:rename', agentId, title) as Promise<AgentSnapshot['agents'][number]>,
    remove: (agentId: string) => ipcRenderer.invoke('agents:remove', agentId) as Promise<boolean>,
    assignSkill: (agentId: string, skillId: string) =>
      ipcRenderer.invoke('agents:assign-skill', agentId, skillId) as Promise<AgentSnapshot['agents'][number]>,
    revokeSkill: (agentId: string, skillId: string) =>
      ipcRenderer.invoke('agents:revoke-skill', agentId, skillId) as Promise<AgentSnapshot['agents'][number]>,
    skillChat: (threadId: string, agentId: string, skillId: string) =>
      ipcRenderer.invoke('agents:skill-chat', threadId, agentId, skillId) as Promise<ThreadMessage>,
    reorder: (ids: string[]) => ipcRenderer.invoke('agents:reorder', ids) as Promise<AgentSnapshot['agents']>,
    reorderProjects: (ids: string[]) =>
      ipcRenderer.invoke('agents:reorder-projects', ids) as Promise<AgentSnapshot['threads']>,
    onChanged: (callback: () => void) => {
      const listener = (): void => {
        callback()
      }
      ipcRenderer.on('agents:changed', listener)
      return () => {
        ipcRenderer.removeListener('agents:changed', listener)
      }
    },
    onTool: (callback: (event: ToolEvent) => void) => {
      const listener = (_event: unknown, payload: ToolEvent): void => {
        callback(payload)
      }
      ipcRenderer.on('agents:tool', listener)
      return () => {
        ipcRenderer.removeListener('agents:tool', listener)
      }
    },
    onApproval: (callback: (prompt: ApprovalPrompt) => void) => {
      const listener = (_event: unknown, payload: ApprovalPrompt): void => {
        callback(payload)
      }
      ipcRenderer.on('agents:approval', listener)
      return () => {
        ipcRenderer.removeListener('agents:approval', listener)
      }
    },
    decideApproval: (id: string, decision: ApprovalDecision) =>
      ipcRenderer.invoke('agents:approval-decide', id, decision) as Promise<boolean>,
  },
  tools: {
    invoke: (name: string, args: Record<string, string>) =>
      ipcRenderer.invoke('tools:invoke', name, args) as Promise<{ text: string; listing?: ShortListing }>,
  },
  repository: {
    sources: () => ipcRenderer.invoke('repo:sources') as Promise<ModuleSourceRef[]>,
    addSource: (kind: 'local' | 'git', location: string) =>
      ipcRenderer.invoke('repo:add-source', kind, location) as Promise<ModuleSourceRef[]>,
    removeSource: (id: string) => ipcRenderer.invoke('repo:remove-source', id) as Promise<ModuleSourceRef[]>,
    available: () => ipcRenderer.invoke('repo:available') as Promise<AvailableModule[]>,
    install: (sourceId: string, moduleId: string) =>
      ipcRenderer.invoke('repo:install', sourceId, moduleId) as Promise<InstallResult>,
    uninstall: (moduleId: string) =>
      ipcRenderer.invoke('repo:uninstall', moduleId) as Promise<{ ok: boolean; error?: string }>,
  },
  theme: {
    get: () => ipcRenderer.invoke('theme:get') as Promise<ThemeState>,
    set: (preference: ThemePreference) => ipcRenderer.invoke('theme:set', preference) as Promise<ThemeState>,
    onChanged: (callback: (state: ThemeState) => void) => {
      const listener = (_event: unknown, state: ThemeState): void => {
        callback(state)
      }
      ipcRenderer.on('theme:changed', listener)
      return () => {
        ipcRenderer.removeListener('theme:changed', listener)
      }
    },
  },
  social: {
    state: () => ipcRenderer.invoke('social:state') as Promise<SocialState>,
    generate: () => ipcRenderer.invoke('social:generate') as Promise<SocialState>,
    publish: (id: string, url: string) => ipcRenderer.invoke('social:publish', id, url) as Promise<SocialState>,
    discard: (id: string) => ipcRenderer.invoke('social:discard', id) as Promise<SocialState>,
    record: (input: SocialMetricsInput) => ipcRenderer.invoke('social:record', input) as Promise<SocialState>,
  },
  onNavigate: (callback: (view: WorkbenchView) => void) => {
    const listener = (_event: unknown, view: WorkbenchView): void => {
      callback(view)
    }
    ipcRenderer.on('workbench:navigate', listener)
    return () => {
      ipcRenderer.removeListener('workbench:navigate', listener)
    }
  },
  onToggleRail: (callback: () => void) => {
    const listener = (): void => {
      callback()
    }
    ipcRenderer.on('workbench:toggle-rail', listener)
    return () => {
      ipcRenderer.removeListener('workbench:toggle-rail', listener)
    }
  },
  onStatus: (callback: (status: HostStatus) => void) => {
    const listener = (_event: unknown, status: HostStatus): void => {
      callback(status)
    }
    ipcRenderer.on('host:status', listener)
    return () => {
      ipcRenderer.removeListener('host:status', listener)
    }
  },
  todos: {
    list: () => ipcRenderer.invoke('todos:list') as Promise<TodoItem[]>,
    decompose: (input: DecomposeInput) => ipcRenderer.invoke('todos:decompose', input) as Promise<DecomposeResult>,
    save: (drafts: DraftTodo[], source: string) =>
      ipcRenderer.invoke('todos:save', { drafts, source }) as Promise<TodoItem[]>,
    ingestAgent: (input: AgentInboxInput) =>
      ipcRenderer.invoke('todos:ingest-agent', input) as Promise<AgentInboxResult>,
    update: (id: string, patch: { done?: boolean; notifyAt?: string | null }) =>
      ipcRenderer.invoke('todos:update', { id, ...patch }) as Promise<TodoItem | null>,
    updateMany: (ids: string[], patch: { done?: boolean; notifyAt?: string | null }) =>
      ipcRenderer.invoke('todos:update-many', { ids, ...patch }) as Promise<TodoItem[]>,
    remove: (id: string) => ipcRenderer.invoke('todos:remove', id) as Promise<boolean>,
    onChanged: (callback: () => void) => {
      const listener = (): void => {
        callback()
      }
      ipcRenderer.on('todos:changed', listener)
      return () => {
        ipcRenderer.removeListener('todos:changed', listener)
      }
    },
    onHighlight: (callback: (id: string) => void) => {
      const listener = (_event: unknown, id: string): void => {
        callback(id)
      }
      ipcRenderer.on('todos:highlight', listener)
      return () => {
        ipcRenderer.removeListener('todos:highlight', listener)
      }
    },
    onFocusInput: (callback: () => void) => {
      const listener = (): void => {
        callback()
      }
      ipcRenderer.on('todos:focus-input', listener)
      return () => {
        ipcRenderer.removeListener('todos:focus-input', listener)
      }
    },
  },
})
