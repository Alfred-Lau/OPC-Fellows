/**
 * Agent 工作台的一等公民。模块仍是 Cordis 能力包；
 * 这里描述的是用户能 @ 的身份、会话和工作区。
 */

import type { ShortListing } from '../../shared/listing.ts'
import type { ThreadPlan } from './plan-mode.ts'
import type { ToolPackId } from './tool-packs.ts'

export type AgentKind = 'conversational' | 'dashboard' | 'window' | 'background'

export type AgentOrigin = 'builtin-default' | 'user' | 'cloned'

export type AgentStatus = 'ready' | 'needs-module' | 'window' | 'background'

export type ThreadKind = 'inbox' | 'agent' | 'user'

export type MessageRole = 'user' | 'agent' | 'system'

export interface AgentTemplate {
  id: string
  role: string
  description: string
  persona: string
  mark: string
  hue: number
  agentKind: AgentKind
  singleton: boolean
  moduleIds: string[]
  /** 右栏默认打开的视图 id，缺省取第一个有界面的模块。 */
  viewId?: string
  /** 默认实例的稳定 id，必须对齐历史上的 ingest agentId。 */
  defaultAgentId: string
  workspaceName: string
  group: string
  suggestedCapabilities: string[]
  /** 内核 / 工作区 / MCP 工具包，创建时写入成员。 */
  toolPacks?: ToolPackId[]
  /** 先出计划再动手。 */
  planMode?: boolean
  /** 缺省进左栏 / @ / 新建。false 则只留模块能力，不当职业身份。 */
  inRoster?: boolean
  /** 出现在雇成员目录。false 则开机自带、不当再雇的模板。 */
  inCatalog?: boolean
  /** 雇佣快捷方式：一次确保这些职业身份在左栏，自己不当身体。 */
  hireTemplateIds?: string[]
}

export interface AgentRecord {
  id: string
  templateId: string
  title: string
  mark: string
  description: string
  hue: number
  kind: AgentKind
  origin: AgentOrigin
  moduleIds: string[]
  /** 赋能到这位成员的 Workbench Skill id。职业私有 SOP 不进这里。 */
  skillIds?: string[]
  /** 通用工具包：待办、工作区、GitHub、浏览器。 */
  toolPacks?: ToolPackId[]
  /** 先出计划，用户确认后再调用写工具。 */
  planMode?: boolean
  viewId?: string
  workspaceName: string
  workspacePath?: string
  singleton: boolean
  status: AgentStatus
  /** 左栏花名册顺序，越小越靠上。缺省按 updatedAt。 */
  sortOrder?: number
  createdAt: string
  updatedAt: string
}

export interface CreateAgentInput {
  templateId: string
  title: string
  description?: string
  workspaceName?: string
  cloneFrom?: string
  extraModuleIds?: string[]
  extraToolPacks?: ToolPackId[]
  planMode?: boolean
}

export interface ConfigureAgentInput {
  agentId: string
  toolPacks: ToolPackId[]
  planMode: boolean
}

export interface CreateAgentResult {
  ok: boolean
  agent?: AgentRecord
  /** 雇佣快捷方式一次雇出的身份，含已在左栏的。 */
  agents?: AgentRecord[]
  /** 单例模板已有实例时带上，UI 改为打开已有。 */
  existingId?: string
  error?: string
}

export interface AgentRecommend {
  templates: AgentTemplate[]
  agents: AgentRecord[]
}

export type { ListingKind, ShortListing } from '../../shared/listing.ts'

export interface ThreadRecord {
  id: string
  title: string
  kind: ThreadKind
  agentIds: string[]
  workspaceAgentId?: string
  /** 用户开项目时写下的一句话，不是会话正文。 */
  description?: string
  /** 该 Thread 上次短结果的行顺序。「第 N 条」钉死这一面。 */
  lastListing?: ShortListing
  /** 计划模式记下的步骤；approved 后才跑写工具。 */
  plan?: ThreadPlan
  /** 置顶时间。有值则进入左栏置顶列表，不进项目列表。 */
  pinnedAt?: string
  /** 左栏项目顺序，越小越靠上。置顶列表和项目列表各自排序。 */
  sortOrder?: number
  /** 项目工作目录。dsh initialize 的 cwd；读写代码和文档都在这里。 */
  folderPath?: string
  /** 引用进对话的文件（dsh-attachment 语义），必须落在 folderPath 内。 */
  attachedFiles?: ProjectContextFile[]
  createdAt: string
  updatedAt: string
}

export interface ProjectContextFile {
  path: string
  name: string
}

export interface ThreadMessage {
  id: string
  threadId: string
  role: MessageRole
  agentId?: string
  text: string
  /** 模型思考过程，气泡里默认收起。 */
  thinking?: string
  createdAt: string
}

export interface WorkspaceEntry {
  name: string
  path: string
  kind: 'dir' | 'file'
  children?: WorkspaceEntry[]
}

export interface AgentSnapshot {
  agents: AgentRecord[]
  threads: ThreadRecord[]
  messages: ThreadMessage[]
}

export const INBOX_THREAD_ID = 'thread:inbox'

export const BLANK_TEMPLATE_ID = 'blank'

/** 每个项目都在场的默认主成员。稳定 id，开机幂等创建。 */
export const HOST_TEMPLATE_ID = 'host'

export const HOST_AGENT_ID = 'host'

/** 左栏、@ 和项目芯片上主理人的短标记。 */
export const HOST_BADGE_LABEL = '默认'

export const HOST_BADGE_TITLE = '每个项目都在场的默认主成员'

export const AGENT_NAME_POOL = [
  'Rumi',
  'Mina',
  '阿宁',
  '小禾',
  '青石',
  '木白',
  '南风',
  '台伴',
  '墨铜',
  '扣子',
] as const

export function describeAgentKind(kind: AgentKind): string {
  switch (kind) {
    case 'conversational':
      return '对话'
    case 'dashboard':
      return '工具台'
    case 'window':
      return '独立窗'
    case 'background':
      return '后台'
    default: {
      const exhaustive: never = kind
      return exhaustive
    }
  }
}

export function describeAgentStatus(status: AgentStatus): string {
  switch (status) {
    case 'ready':
      return '可用'
    case 'needs-module':
      return '能力已停用'
    case 'window':
      return '独立窗'
    case 'background':
      return '后台通道'
    default: {
      const exhaustive: never = status
      return exhaustive
    }
  }
}
