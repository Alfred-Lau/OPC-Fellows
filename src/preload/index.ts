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
import type { MonitorCache, MonitorRefreshResult } from '../shared/monitor'
import type { MicroSourcingSettings, MicroSourcingState, IdeaStatus } from '../shared/micro-sourcing'
import type {
  AccountMaterialInput,
  AccountPostInput,
  AccountsState,
  DayMetrics,
  SocialAccountInput,
} from '../shared/accounts'
import type {
  GrowthChannelInput,
  GrowthExperimentInput,
  GrowthLoopInput,
  GrowthState,
} from '../shared/growth'
import type { SocialMetricsInput, SocialState } from '../shared/social'
import type {
  CreateCheckoutInput,
  CreateDiscountInput,
  CreateProductInput,
  ExpenseRecordInput,
  ManualReceiptInput,
  PaymentActionResult,
  PaymentSettingsInput,
  PaymentsState,
  PayoutRecordInput,
  SubscriptionAction,
} from '../shared/payments'
import type { XPushSendResult, XPushStatus } from '../shared/x-push'
import type {
  IngestedDrop,
  PickedAssets,
  PickedMarkdown,
  WxDraftInput,
  WxDraftProgress,
  WxDraftRecord,
  WxDraftRunResult,
  WxDraftSettingsInput,
  WxDraftViewState,
} from '../shared/wx-draft'
import type {
  WechatHubSettings,
  WechatHubState,
  WechatLookupKind,
  WechatTriageDecision,
} from '../shared/wechat-hub'
import type { MailAccountInput, MailState, MailTriage } from '../shared/mail'
import type { PetAlert } from '../shared/pet'
import type { HostStatus } from '../shared/status'
import type { NoteItem } from '../shared/note'
import type { LlmKeyResult, LlmSettings } from '../shared/deepseek'
import type { ThemePreference } from '../shared/theme'
import type { DecomposeInput, DecomposeResult, DraftTodo, TodoItem } from '../shared/todo'

type ThemeState = { preference: ThemePreference; dark: boolean }

contextBridge.exposeInMainWorld('ownworkbuddy', {
  openHarness: () => ipcRenderer.invoke('harness:open') as Promise<void>,
  harness: {
    origin: () =>
      ipcRenderer.invoke('harness:origin') as Promise<{ origin?: string; error?: string }>,
    open: () => ipcRenderer.invoke('harness:open') as Promise<void>,
  },
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
    chat: (threadId: string, agentId: string) =>
      ipcRenderer.invoke('agents:chat', threadId, agentId) as Promise<ThreadMessage>,
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
  monitor: {
    refresh: () => ipcRenderer.invoke('monitor:refresh') as Promise<MonitorRefreshResult>,
    cached: () => ipcRenderer.invoke('monitor:cached') as Promise<MonitorCache | null>,
  },
  micro: {
    state: () => ipcRenderer.invoke('micro:state') as Promise<MicroSourcingState>,
    scan: () => ipcRenderer.invoke('micro:scan') as Promise<MicroSourcingState>,
    saveSettings: (input: Partial<MicroSourcingSettings>) =>
      ipcRenderer.invoke('micro:save-settings', input) as Promise<MicroSourcingState>,
    patchIdea: (id: string, patch: { status?: IdeaStatus; note?: string }) =>
      ipcRenderer.invoke('micro:patch-idea', id, patch) as Promise<MicroSourcingState>,
    onChanged: (callback: (state: MicroSourcingState) => void) => {
      const listener = (_event: unknown, next: MicroSourcingState): void => {
        callback(next)
      }
      ipcRenderer.on('micro:changed', listener)
      return () => {
        ipcRenderer.removeListener('micro:changed', listener)
      }
    },
  },
  social: {
    state: () => ipcRenderer.invoke('social:state') as Promise<SocialState>,
    generate: (input?: { ideaId?: string }) => ipcRenderer.invoke('social:generate', input) as Promise<SocialState>,
    publish: (id: string, url: string) => ipcRenderer.invoke('social:publish', id, url) as Promise<SocialState>,
    discard: (id: string) => ipcRenderer.invoke('social:discard', id) as Promise<SocialState>,
    record: (input: SocialMetricsInput) => ipcRenderer.invoke('social:record', input) as Promise<SocialState>,
  },
  xPush: {
    status: () => ipcRenderer.invoke('xpush:status') as Promise<XPushStatus>,
    send: (draftId: string) => ipcRenderer.invoke('xpush:send', draftId) as Promise<XPushSendResult>,
  },
  xBridge: {
    dmDraft: (draftId: string) => ipcRenderer.invoke('xbridge:dm-draft', draftId) as Promise<{ ok: boolean; error?: string; queueLength?: number }>,
    status: () => ipcRenderer.invoke('xbridge:status') as Promise<{ running: boolean; queueLength: number; lastResult: { taskId: string; ok: boolean; error?: string; at: string } | null }>,
  },
  accounts: {
    state: () => ipcRenderer.invoke('accounts:state') as Promise<AccountsState>,
    saveAccount: (input: SocialAccountInput) =>
      ipcRenderer.invoke('accounts:save-account', input) as Promise<AccountsState>,
    removeAccount: (id: string) => ipcRenderer.invoke('accounts:remove-account', id) as Promise<AccountsState>,
    saveMaterial: (input: AccountMaterialInput) =>
      ipcRenderer.invoke('accounts:save-material', input) as Promise<AccountsState>,
    removeMaterial: (id: string) => ipcRenderer.invoke('accounts:remove-material', id) as Promise<AccountsState>,
    addPost: (accountId: string, date: string, input: AccountPostInput) =>
      ipcRenderer.invoke('accounts:add-post', accountId, date, input) as Promise<AccountsState>,
    removePost: (accountId: string, date: string, postId: string) =>
      ipcRenderer.invoke('accounts:remove-post', accountId, date, postId) as Promise<AccountsState>,
    saveMetrics: (accountId: string, date: string, metrics: Partial<DayMetrics>) =>
      ipcRenderer.invoke('accounts:save-metrics', accountId, date, metrics) as Promise<AccountsState>,
    setMaterials: (accountId: string, date: string, materialIds: string[]) =>
      ipcRenderer.invoke('accounts:set-materials', accountId, date, materialIds) as Promise<AccountsState>,
  },
  growth: {
    state: () => ipcRenderer.invoke('growth:state') as Promise<GrowthState>,
    saveExperiment: (input: GrowthExperimentInput) =>
      ipcRenderer.invoke('growth:save-experiment', input) as Promise<GrowthState>,
    removeExperiment: (id: string) => ipcRenderer.invoke('growth:remove-experiment', id) as Promise<GrowthState>,
    saveLoop: (input: GrowthLoopInput) => ipcRenderer.invoke('growth:save-loop', input) as Promise<GrowthState>,
    removeLoop: (id: string) => ipcRenderer.invoke('growth:remove-loop', id) as Promise<GrowthState>,
    saveChannel: (input: GrowthChannelInput) =>
      ipcRenderer.invoke('growth:save-channel', input) as Promise<GrowthState>,
    removeChannel: (id: string) => ipcRenderer.invoke('growth:remove-channel', id) as Promise<GrowthState>,
  },
  payments: {
    state: () => ipcRenderer.invoke('payments:state') as Promise<PaymentsState>,
    sync: () => ipcRenderer.invoke('payments:sync') as Promise<PaymentsState>,
    setApiKey: (key: string | null) => ipcRenderer.invoke('payments:set-api-key', key) as Promise<PaymentActionResult>,
    saveSettings: (input: PaymentSettingsInput) =>
      ipcRenderer.invoke('payments:save-settings', input) as Promise<PaymentsState>,
    saveReceipt: (input: ManualReceiptInput) => ipcRenderer.invoke('payments:save-receipt', input) as Promise<PaymentsState>,
    removeReceipt: (id: string) => ipcRenderer.invoke('payments:remove-receipt', id) as Promise<PaymentsState>,
    savePayout: (input: PayoutRecordInput) => ipcRenderer.invoke('payments:save-payout', input) as Promise<PaymentsState>,
    removePayout: (id: string) => ipcRenderer.invoke('payments:remove-payout', id) as Promise<PaymentsState>,
    saveExpense: (input: ExpenseRecordInput) => ipcRenderer.invoke('payments:save-expense', input) as Promise<PaymentsState>,
    removeExpense: (id: string) => ipcRenderer.invoke('payments:remove-expense', id) as Promise<PaymentsState>,
    clearEvents: () => ipcRenderer.invoke('payments:clear-events') as Promise<PaymentsState>,
    createProduct: (input: CreateProductInput) =>
      ipcRenderer.invoke('payments:create-product', input) as Promise<PaymentActionResult>,
    createCheckout: (input: CreateCheckoutInput) =>
      ipcRenderer.invoke('payments:create-checkout', input) as Promise<PaymentActionResult>,
    billingPortal: (customerId: string) =>
      ipcRenderer.invoke('payments:billing-portal', customerId) as Promise<PaymentActionResult>,
    subscriptionAction: (id: string, action: SubscriptionAction) =>
      ipcRenderer.invoke('payments:subscription-action', id, action) as Promise<PaymentActionResult>,
    refund: (transactionId: string) => ipcRenderer.invoke('payments:refund', transactionId) as Promise<PaymentActionResult>,
    createDiscount: (input: CreateDiscountInput) =>
      ipcRenderer.invoke('payments:create-discount', input) as Promise<PaymentActionResult>,
    deleteDiscount: (id: string) => ipcRenderer.invoke('payments:delete-discount', id) as Promise<PaymentActionResult>,
    copy: (text: string) => ipcRenderer.invoke('payments:copy', text) as Promise<boolean>,
    openDashboard: (path?: string) => ipcRenderer.invoke('payments:open-dashboard', path) as Promise<void>,
    exportCsv: (name: string, csv: string) => ipcRenderer.invoke('payments:export-csv', name, csv) as Promise<boolean>,
    onChanged: (callback: (state: PaymentsState) => void) => {
      const listener = (_event: unknown, state: PaymentsState): void => {
        callback(state)
      }
      ipcRenderer.on('payments:changed', listener)
      return () => {
        ipcRenderer.removeListener('payments:changed', listener)
      }
    },
  },
  wxdraft: {
    state: () => ipcRenderer.invoke('wxdraft:state') as Promise<WxDraftViewState>,
    saveSettings: (input: WxDraftSettingsInput) =>
      ipcRenderer.invoke('wxdraft:save-settings', input) as Promise<WxDraftViewState>,
    run: (input: WxDraftInput) => ipcRenderer.invoke('wxdraft:run', input) as Promise<WxDraftRunResult>,
    stop: () => ipcRenderer.invoke('wxdraft:stop') as Promise<boolean>,
    removeRecord: (id: string) =>
      ipcRenderer.invoke('wxdraft:remove-record', id) as Promise<WxDraftRecord[]>,
    copy: (text: string) => ipcRenderer.invoke('wxdraft:copy', text) as Promise<boolean>,
    openExternal: (url: string) => ipcRenderer.invoke('wxdraft:open-external', url) as Promise<boolean>,
    pickMarkdown: () => ipcRenderer.invoke('wxdraft:pick-markdown') as Promise<PickedMarkdown | null>,
    pickAssets: () => ipcRenderer.invoke('wxdraft:pick-assets') as Promise<PickedAssets | null>,
    ingestDrop: (paths: string[]) =>
      ipcRenderer.invoke('wxdraft:ingest-drop', paths) as Promise<IngestedDrop>,
    onProgress: (callback: (progress: WxDraftProgress) => void) => {
      const listener = (_event: unknown, progress: WxDraftProgress): void => {
        callback(progress)
      }
      ipcRenderer.on('wxdraft:progress', listener)
      return () => {
        ipcRenderer.removeListener('wxdraft:progress', listener)
      }
    },
  },
  wxhub: {
    state: () => ipcRenderer.invoke('wxhub:state') as Promise<WechatHubState>,
    probe: () => ipcRenderer.invoke('wxhub:probe') as Promise<WechatHubState>,
    refresh: () => ipcRenderer.invoke('wxhub:refresh') as Promise<WechatHubState>,
    lookup: (kind: WechatLookupKind, query: string) =>
      ipcRenderer.invoke('wxhub:lookup', kind, query) as Promise<WechatHubState>,
    triage: (id: number, decision: WechatTriageDecision, followUp?: string, note?: string) =>
      ipcRenderer.invoke('wxhub:triage', id, decision, followUp, note) as Promise<WechatHubState>,
    saveSettings: (input: Partial<WechatHubSettings>) =>
      ipcRenderer.invoke('wxhub:save-settings', input) as Promise<WechatHubState>,
    pickHome: () => ipcRenderer.invoke('wxhub:pick-home') as Promise<WechatHubState>,
    copy: (text: string) => ipcRenderer.invoke('wxhub:copy', text) as Promise<boolean>,
    openInstall: () => ipcRenderer.invoke('wxhub:open-install') as Promise<boolean>,
    onChanged: (callback: (state: WechatHubState) => void) => {
      const listener = (_event: unknown, next: WechatHubState): void => {
        callback(next)
      }
      ipcRenderer.on('wxhub:changed', listener)
      return () => {
        ipcRenderer.removeListener('wxhub:changed', listener)
      }
    },
  },
  mail: {
    state: () => ipcRenderer.invoke('mail:state') as Promise<MailState>,
    probe: () => ipcRenderer.invoke('mail:probe') as Promise<MailState>,
    sync: () => ipcRenderer.invoke('mail:sync') as Promise<MailState>,
    saveAccount: (input: MailAccountInput) => ipcRenderer.invoke('mail:save-account', input) as Promise<MailState>,
    removeAccount: (id: string) => ipcRenderer.invoke('mail:remove-account', id) as Promise<MailState>,
    triage: (id: string, decision: MailTriage) => ipcRenderer.invoke('mail:triage', id, decision) as Promise<MailState>,
    watchSender: (from: string, watched?: boolean) =>
      ipcRenderer.invoke('mail:watch-sender', from, watched) as Promise<MailState>,
    saveDraft: (messageId: string, text: string) =>
      ipcRenderer.invoke('mail:save-draft', messageId, text) as Promise<MailState>,
    copy: (text: string) => ipcRenderer.invoke('mail:copy', text) as Promise<boolean>,
    onChanged: (callback: (state: MailState) => void) => {
      const listener = (_event: unknown, next: MailState): void => {
        callback(next)
      }
      ipcRenderer.on('mail:changed', listener)
      return () => {
        ipcRenderer.removeListener('mail:changed', listener)
      }
    },
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
  notes: {
    list: () => ipcRenderer.invoke('notes:list') as Promise<NoteItem[]>,
    add: (text: string) => ipcRenderer.invoke('notes:add', text) as Promise<NoteItem | null>,
    remove: (id: string) => ipcRenderer.invoke('notes:remove', id) as Promise<boolean>,
    onFocusInput: (callback: () => void) => {
      const listener = (): void => {
        callback()
      }
      ipcRenderer.on('notes:focus-input', listener)
      return () => {
        ipcRenderer.removeListener('notes:focus-input', listener)
      }
    },
  },
  pet: {
    dismiss: () => ipcRenderer.invoke('pet:dismiss') as Promise<void>,
    openTodo: (id: string) => ipcRenderer.invoke('pet:open-todo', id) as Promise<void>,
    openHome: () => ipcRenderer.invoke('pet:open-home') as Promise<void>,
    onAlert: (callback: (alert: PetAlert) => void) => {
      const listener = (_event: unknown, alert: PetAlert): void => {
        callback(alert)
      }
      ipcRenderer.on('pet:alert', listener)
      return () => {
        ipcRenderer.removeListener('pet:alert', listener)
      }
    },
    onIdle: (callback: () => void) => {
      const listener = (): void => {
        callback()
      }
      ipcRenderer.on('pet:idle', listener)
      return () => {
        ipcRenderer.removeListener('pet:idle', listener)
      }
    },
  },
})
