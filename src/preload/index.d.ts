import type { AgentInboxInput, AgentInboxResult } from '../shared/agent-inbox'
import type { WorkbenchView } from '../shared/features'
import type { SocialMetricsInput, SocialState } from '../shared/social'
import type { HostStatus } from '../shared/status'
import type { LlmKeyResult, LlmSettings } from '../shared/deepseek'
import type { ThemePreference } from '../shared/theme'
import type { DecomposeInput, DecomposeResult, DraftTodo, TodoItem } from '../shared/todo'
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
  ThreadRecord,
  WorkspaceEntry,
  ProjectContextFile,
} from '../kernel/shared/agent'
import type { DispatchAction } from '../kernel/shared/agents'
import type { ToolEvent } from '../kernel/shared/tool-events'
import type { ApprovalDecision, ApprovalPrompt } from '../kernel/shared/approval'

type ThemeState = { preference: ThemePreference; dark: boolean }

export type { HostStatus }

declare global {
  interface Window {
    ownworkbuddy: {
      workbench: {
        modules: () => Promise<ModuleInfo[]>
        nav: () => Promise<NavEntry[]>
        enable: (id: string) => Promise<ModuleInfo[]>
        disable: (id: string) => Promise<ModuleInfo[]>
        setConfig: (id: string, config: Record<string, unknown>) => Promise<ModuleInfo[]>
        reorder: (ids: string[]) => Promise<ModuleInfo[]>
        logs: (id?: string) => Promise<ModuleLogEntry[]>
        channels: () => Promise<{ channel: string; moduleId: string }[]>
        open: (id: string) => Promise<void>
        ui: (id: string) => Promise<{ url: string } | null>
        invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
        catalog: () => Promise<WorkbenchCatalog>
        saveCatalog: (catalog: WorkbenchCatalog) => Promise<WorkbenchCatalog>
        resetCatalog: () => Promise<WorkbenchCatalog>
        onChanged: (callback: () => void) => () => void
        onCatalogChanged: (callback: (catalog: WorkbenchCatalog) => void) => () => void
      }
      profile: {
        get: () => Promise<WorkbenchProfileView>
        save: (input: { displayName: string }) => Promise<WorkbenchProfileView>
        pickAvatar: () => Promise<WorkbenchProfileView | null>
        clearAvatar: () => Promise<WorkbenchProfileView>
      }
      llm: {
        settings: () => Promise<LlmSettings>
        setApiKey: (key: string | null) => Promise<LlmKeyResult>
      }
      agents: {
        snapshot: () => Promise<AgentSnapshot>
        recommend: () => Promise<AgentRecommend>
        nextName: () => Promise<string>
        hostName: () => Promise<string>
        create: (input: CreateAgentInput) => Promise<CreateAgentResult>
        configure: (input: ConfigureAgentInput) => Promise<AgentSnapshot['agents'][number]>
        startTask: (
          text: string,
          agentIds: string[],
          workspaceAgentId?: string,
          projectId?: string,
          context?: { folderPath?: string; attachedFiles?: ProjectContextFile[] },
        ) => Promise<{
          thread: ThreadRecord
          messages: ThreadMessage[]
          actions: DispatchAction[]
        }>
        createProject: (
          title: string,
          description: string,
          agentIds: string[],
          workspaceAgentId?: string,
          folderPath?: string,
          attachedFiles?: ProjectContextFile[],
        ) => Promise<ThreadRecord>
        post: (threadId: string, text: string) => Promise<{
          thread: ThreadRecord
          messages: ThreadMessage[]
          actions: DispatchAction[]
        }>
        classify: (
          agentId: string,
          text: string,
        ) => Promise<{ kind: 'invoke' | 'chat' | 'miss' | 'note'; invoke?: string; text: string }>
        chat: (
          threadId: string,
          agentId: string,
          options?: { mode?: 'ask' | 'plan' | 'agent' },
        ) => Promise<ThreadMessage>
        setComposerMode: (
          threadId: string,
          agentId: string,
          mode: 'ask' | 'plan' | 'agent',
        ) => Promise<AgentSnapshot['threads'][number]>
        clearPlan: (threadId: string) => Promise<ThreadRecord>
        reply: (threadId: string, text: string, agentId?: string, listing?: ShortListing, thinking?: string) => Promise<ThreadMessage>
        messages: (threadId: string) => Promise<ThreadMessage[]>
        workspace: (agentId?: string, threadId?: string) => Promise<WorkspaceEntry[]>
        openPath: (path: string, folderPath?: string) => Promise<boolean>
        pickFolder: (threadId?: string) => Promise<{ path: string } | null>
        pickFiles: (threadId?: string) => Promise<{ paths: string[] } | null>
        setFolder: (threadId: string, path: string) => Promise<ThreadRecord>
        clearFolder: (threadId: string) => Promise<ThreadRecord>
        attachFiles: (threadId: string, paths: string[]) => Promise<ThreadRecord>
        detachFile: (threadId: string, path: string) => Promise<ThreadRecord>
        writeWorkspaceNote: (threadId: string, text: string) => Promise<string | undefined>
        pinProject: (threadId: string, pinned: boolean) => Promise<ThreadRecord>
        renameProject: (threadId: string, title: string) => Promise<ThreadRecord>
        deleteProject: (threadId: string) => Promise<boolean>
        rename: (agentId: string, title: string) => Promise<AgentSnapshot['agents'][number]>
        remove: (agentId: string) => Promise<boolean>
        assignSkill: (agentId: string, skillId: string) => Promise<AgentSnapshot['agents'][number]>
        revokeSkill: (agentId: string, skillId: string) => Promise<AgentSnapshot['agents'][number]>
        skillChat: (threadId: string, agentId: string, skillId: string) => Promise<ThreadMessage>
        reorder: (ids: string[]) => Promise<AgentSnapshot['agents']>
        reorderProjects: (ids: string[]) => Promise<AgentSnapshot['threads']>
        onChanged: (callback: () => void) => () => void
        onTool: (callback: (event: ToolEvent) => void) => () => void
        onApproval: (callback: (prompt: ApprovalPrompt) => void) => () => void
        decideApproval: (id: string, decision: ApprovalDecision) => Promise<boolean>
      }
      tools: {
        invoke: (name: string, args: Record<string, string>) => Promise<{ text: string; listing?: ShortListing }>
      }
      repository: {
        sources: () => Promise<ModuleSourceRef[]>
        addSource: (kind: 'local' | 'git', location: string) => Promise<ModuleSourceRef[]>
        removeSource: (id: string) => Promise<ModuleSourceRef[]>
        available: () => Promise<AvailableModule[]>
        install: (sourceId: string, moduleId: string) => Promise<InstallResult>
        uninstall: (moduleId: string) => Promise<{ ok: boolean; error?: string }>
      }
      theme: {
        get: () => Promise<ThemeState>
        set: (preference: ThemePreference) => Promise<ThemeState>
        onChanged: (callback: (state: ThemeState) => void) => () => void
      }
      social: {
        state: () => Promise<SocialState>
        generate: () => Promise<SocialState>
        publish: (id: string, url: string) => Promise<SocialState>
        discard: (id: string) => Promise<SocialState>
        record: (input: SocialMetricsInput) => Promise<SocialState>
      }
      onNavigate: (callback: (view: WorkbenchView) => void) => () => void
      onToggleRail: (callback: () => void) => () => void
      onStatus: (callback: (status: HostStatus) => void) => () => void
      todos: {
        list: () => Promise<TodoItem[]>
        decompose: (input: DecomposeInput) => Promise<DecomposeResult>
        save: (drafts: DraftTodo[], source: string) => Promise<TodoItem[]>
        ingestAgent: (input: AgentInboxInput) => Promise<AgentInboxResult>
        update: (id: string, patch: { done?: boolean; notifyAt?: string | null }) => Promise<TodoItem | null>
        updateMany: (ids: string[], patch: { done?: boolean; notifyAt?: string | null }) => Promise<TodoItem[]>
        remove: (id: string) => Promise<boolean>
        onChanged: (callback: () => void) => () => void
        onHighlight: (callback: (id: string) => void) => () => void
        onFocusInput: (callback: () => void) => () => void
      }
    }
  }
}

export {}
