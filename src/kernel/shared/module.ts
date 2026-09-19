/**
 * 模块契约。工作台的每个功能都是一个 Cordis 插件 + 一份 manifest；
 * 内核只认这两样东西，不认具体模块。
 */

/** 模块形态：挂在主舞台 / 自己开窗 / 只在后台跑。 */
export type ModuleKind = 'view' | 'window' | 'background'

/** 模块来源。内置随包分发，只能禁用不能卸载。 */
export type ModuleSource = 'builtin' | 'local' | 'git'

/**
 * 能力白名单。模块只能用 manifest 里声明过的能力，
 * 内核在调用点校验，声明之外一律拒绝。
 */
export type Capability =
  | `net:${string}`
  | `net:listen:${number}`
  | 'storage'
  | 'secrets'
  | 'notify'
  | 'todos:read'
  | 'todos:write'
  | 'search'
  | 'fs:export'
  | 'clipboard'
  | 'window'
  | 'subprocess'

/** 高危能力：安装第三方模块时需要单独高亮提示。 */
export const HIGH_RISK_CAPABILITIES: readonly string[] = ['subprocess', 'secrets']

export function isListenCapability(value: string): boolean {
  return value.startsWith('net:listen:')
}

export function isHighRisk(capability: string): boolean {
  return HIGH_RISK_CAPABILITIES.includes(capability) || isListenCapability(capability)
}

export interface ModuleManifest {
  /** 全局唯一，同时是 IPC 命名空间与存储目录名。 */
  id: string
  title: string
  /** 侧栏导航上的单字印。 */
  mark: string
  description: string
  kind: ModuleKind
  version: string
  /** 设置页里的分组。 */
  group: string
  /** 侧栏排序，小的在前。 */
  order: number
  accelerator?: string
  /** 硬依赖：内核服务名。不满足则停在 pending。 */
  inject?: string[]
  /** 软依赖：有就增强，没有也能跑。 */
  optional?: string[]
  capabilities: Capability[]
  /**
   * 允许注册的 IPC 通道前缀，缺省为模块 id 本身。
   * 少数模块的历史通道名和 id 对不上时，
   * 显式列出来，顺便挡住模块注册到别人命名空间的可能。
   */
  namespaces?: string[]
  /**
   * 渲染入口，相对模块根目录。导出 `mount(root, api)`，
   * 返回的函数在离开视图时调用。没有这项就只跑主进程。
   */
  ui?: string
  /** 内置模块为 false。 */
  removable: boolean
  /** 必填配置缺失时模块降级运行，设置页打提示角标。 */
  needsConfig?: boolean
  /** 声明了官方 `dsh.bundle` 时，启停会回写 opc profile 的 `cordis.patch.yml`。 */
  dshBundle?: { patch: string }
}

/**
 * 模块状态。比 Cordis 的 FiberState 多一个 needs-config ——
 * 模块启用了但必填配置缺失，此时降级运行而不是报错。
 */
export type ModuleStatus = 'active' | 'loading' | 'pending' | 'needs-config' | 'failed' | 'disabled'

export interface ModuleInfo {
  manifest: ModuleManifest
  source: ModuleSource
  status: ModuleStatus
  /** 用户在设置里的开关，与 status 分开：启用了也可能因依赖未就绪而 pending。 */
  enabled: boolean
  /** 一句人话解释当前状态，直接显示在设置页。 */
  detail: string
  /** 模块自己的配置。 */
  config: Record<string, unknown>
  /** 第三方模块的安装路径。 */
  path?: string
}

export interface ModuleLogEntry {
  at: string
  moduleId: string
  level: 'info' | 'error'
  message: string
}

/** workbench.yml 里的一条 entry，字段对齐 Cordis loader 的 EntryOptions。 */
export interface ModuleEntry {
  id: string
  /** 模块说明符：内置为 `builtin:<id>`，第三方为磁盘路径。 */
  name: string
  disabled?: boolean
  config?: Record<string, unknown>
  order?: number
}

export interface WorkbenchConfig {
  version: number
  entries: ModuleEntry[]
}

export const BUILTIN_PREFIX = 'builtin:'

export function builtinSpecifier(id: string): string {
  return `${BUILTIN_PREFIX}${id}`
}

export function isBuiltinSpecifier(name: string): boolean {
  return name.startsWith(BUILTIN_PREFIX)
}

/** 状态对应的人话，设置页直接用。 */
export function describeStatus(status: ModuleStatus, detail: string): string {
  if (detail) {
    return detail
  }
  switch (status) {
    case 'active':
      return '运行中'
    case 'loading':
      return '正在启动'
    case 'pending':
      return '等待依赖就绪'
    case 'needs-config':
      return '需要配置'
    case 'failed':
      return '启动失败'
    case 'disabled':
      return '已停用 · 数据保留'
    default: {
      const exhaustive: never = status
      return exhaustive
    }
  }
}
