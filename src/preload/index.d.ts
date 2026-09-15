import type { AgentInboxInput, AgentInboxResult } from '../shared/agent-inbox'
import type { WorkbenchView } from '../shared/features'
import type { MonitorCache, MonitorRefreshResult } from '../shared/monitor'
import type { IdeaStatus, MicroSourcingSettings, MicroSourcingState } from '../shared/micro-sourcing'
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

type ThemeState = { preference: ThemePreference; dark: boolean }

export type { HostStatus }
export type { MonitorRefreshResult }

declare global {
  interface Window {
    ownworkbuddy: {
      openHarness: () => Promise<void>
      harness: {
        origin: () => Promise<{ origin?: string; error?: string }>
        open: () => Promise<void>
      }
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
        chat: (threadId: string, agentId: string) => Promise<ThreadMessage>
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
      monitor: {
        refresh: () => Promise<MonitorRefreshResult>
        cached: () => Promise<MonitorCache | null>
      }
      micro: {
        state: () => Promise<MicroSourcingState>
        scan: () => Promise<MicroSourcingState>
        saveSettings: (input: Partial<MicroSourcingSettings>) => Promise<MicroSourcingState>
        patchIdea: (id: string, patch: { status?: IdeaStatus; note?: string }) => Promise<MicroSourcingState>
        onChanged: (callback: (state: MicroSourcingState) => void) => () => void
      }
      social: {
        state: () => Promise<SocialState>
        generate: (input?: { ideaId?: string }) => Promise<SocialState>
        publish: (id: string, url: string) => Promise<SocialState>
        discard: (id: string) => Promise<SocialState>
        record: (input: SocialMetricsInput) => Promise<SocialState>
      }
      xPush: {
        status: () => Promise<XPushStatus>
        send: (draftId: string) => Promise<XPushSendResult>
      }
      xBridge: {
        dmDraft: (draftId: string) => Promise<{ ok: boolean; error?: string; queueLength?: number }>
        status: () => Promise<{ running: boolean; queueLength: number; lastResult: { taskId: string; ok: boolean; error?: string; at: string } | null }>
      }
      accounts: {
        state: () => Promise<AccountsState>
        saveAccount: (input: SocialAccountInput) => Promise<AccountsState>
        removeAccount: (id: string) => Promise<AccountsState>
        saveMaterial: (input: AccountMaterialInput) => Promise<AccountsState>
        removeMaterial: (id: string) => Promise<AccountsState>
        addPost: (accountId: string, date: string, input: AccountPostInput) => Promise<AccountsState>
        removePost: (accountId: string, date: string, postId: string) => Promise<AccountsState>
        saveMetrics: (accountId: string, date: string, metrics: Partial<DayMetrics>) => Promise<AccountsState>
        setMaterials: (accountId: string, date: string, materialIds: string[]) => Promise<AccountsState>
      }
      growth: {
        state: () => Promise<GrowthState>
        saveExperiment: (input: GrowthExperimentInput) => Promise<GrowthState>
        removeExperiment: (id: string) => Promise<GrowthState>
        saveLoop: (input: GrowthLoopInput) => Promise<GrowthState>
        removeLoop: (id: string) => Promise<GrowthState>
        saveChannel: (input: GrowthChannelInput) => Promise<GrowthState>
        removeChannel: (id: string) => Promise<GrowthState>
      }
      payments: {
        state: () => Promise<PaymentsState>
        sync: () => Promise<PaymentsState>
        setApiKey: (key: string | null) => Promise<PaymentActionResult>
        saveSettings: (input: PaymentSettingsInput) => Promise<PaymentsState>
        saveReceipt: (input: ManualReceiptInput) => Promise<PaymentsState>
        removeReceipt: (id: string) => Promise<PaymentsState>
        savePayout: (input: PayoutRecordInput) => Promise<PaymentsState>
        removePayout: (id: string) => Promise<PaymentsState>
        saveExpense: (input: ExpenseRecordInput) => Promise<PaymentsState>
        removeExpense: (id: string) => Promise<PaymentsState>
        clearEvents: () => Promise<PaymentsState>
        createProduct: (input: CreateProductInput) => Promise<PaymentActionResult>
        createCheckout: (input: CreateCheckoutInput) => Promise<PaymentActionResult>
        billingPortal: (customerId: string) => Promise<PaymentActionResult>
        subscriptionAction: (id: string, action: SubscriptionAction) => Promise<PaymentActionResult>
        refund: (transactionId: string) => Promise<PaymentActionResult>
        createDiscount: (input: CreateDiscountInput) => Promise<PaymentActionResult>
        deleteDiscount: (id: string) => Promise<PaymentActionResult>
        copy: (text: string) => Promise<boolean>
        openDashboard: (path?: string) => Promise<void>
        exportCsv: (name: string, csv: string) => Promise<boolean>
        onChanged: (callback: (state: PaymentsState) => void) => () => void
      }
      wxdraft: {
        state: () => Promise<WxDraftViewState>
        saveSettings: (input: WxDraftSettingsInput) => Promise<WxDraftViewState>
        run: (input: WxDraftInput) => Promise<WxDraftRunResult>
        stop: () => Promise<boolean>
        removeRecord: (id: string) => Promise<WxDraftRecord[]>
        copy: (text: string) => Promise<boolean>
        openExternal: (url: string) => Promise<boolean>
        pickMarkdown: () => Promise<PickedMarkdown | null>
        pickAssets: () => Promise<PickedAssets | null>
        ingestDrop: (paths: string[]) => Promise<IngestedDrop>
        onProgress: (callback: (progress: WxDraftProgress) => void) => () => void
      }
      wxhub: {
        state: () => Promise<WechatHubState>
        probe: () => Promise<WechatHubState>
        refresh: () => Promise<WechatHubState>
        lookup: (kind: WechatLookupKind, query: string) => Promise<WechatHubState>
        triage: (id: number, decision: WechatTriageDecision, followUp?: string, note?: string) => Promise<WechatHubState>
        saveSettings: (input: Partial<WechatHubSettings>) => Promise<WechatHubState>
        pickHome: () => Promise<WechatHubState>
        copy: (text: string) => Promise<boolean>
        openInstall: () => Promise<boolean>
        onChanged: (callback: (state: WechatHubState) => void) => () => void
      }
      mail: {
        state: () => Promise<MailState>
        probe: () => Promise<MailState>
        sync: () => Promise<MailState>
        saveAccount: (input: MailAccountInput) => Promise<MailState>
        removeAccount: (id: string) => Promise<MailState>
        triage: (id: string, decision: MailTriage) => Promise<MailState>
        watchSender: (from: string, watched?: boolean) => Promise<MailState>
        saveDraft: (messageId: string, text: string) => Promise<MailState>
        copy: (text: string) => Promise<boolean>
        onChanged: (callback: (state: MailState) => void) => () => void
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
      notes: {
        list: () => Promise<NoteItem[]>
        add: (text: string) => Promise<NoteItem | null>
        remove: (id: string) => Promise<boolean>
        onFocusInput: (callback: () => void) => () => void
      }
      pet: {
        dismiss: () => Promise<void>
        openTodo: (id: string) => Promise<void>
        openHome: () => Promise<void>
        onAlert: (callback: (alert: PetAlert) => void) => () => void
        onIdle: (callback: () => void) => () => void
      }
    }
  }
}

export {}
