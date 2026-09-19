import { Service, symbols, type Context } from '@deepseek-ai/cordis'
import type { Fiber } from '@deepseek-ai/cordis'
import {
  builtinSpecifier,
  isBuiltinSpecifier,
  type ModuleEntry,
  type ModuleInfo,
  type ModuleLogEntry,
  type ModuleManifest,
  type ModuleSource,
  type ModuleStatus,
} from '../../shared/module'
import { isOpensourceDefaultModule } from '../../shared/templates'
import { readConfig, writeConfig } from '../config'
import { dshHome, writeOpcWorkbenchPatch } from '../../shared/opc-profile'

/** Cordis FiberState 的数值，`const enum` 不能在运行时引用，这里自己留一份。 */
const FIBER_PENDING = 0
const FIBER_LOADING = 1
const FIBER_ACTIVE = 2
const FIBER_FAILED = 3

const MAX_LOGS = 200

export interface ModuleDefinition {
  manifest: ModuleManifest
  /** Cordis 插件：函数 / 对象 / class 三形态皆可。 */
  plugin: (ctx: Context, config: Record<string, unknown>) => void | Promise<void>
  source: ModuleSource
  path?: string
}

interface ModuleRecord {
  definition: ModuleDefinition
  entry: ModuleEntry
  fiber?: Fiber
  /** 模块自报的降级原因，非空即 needs-config。 */
  needsConfig?: string
  error?: string
}

/**
 * 模块注册表：装了哪些、哪些开着、各自什么状态。
 *
 * enable / disable 落到 Cordis 的 fiber 上 —— dispose 会把模块注册过的
 * IPC 通道、导航项、定时器、通知回调全部逆序回收，不需要模块自己写清理。
 */
export class ModulesService extends Service {
  static inject = ['bridge']

  private records = new Map<string, ModuleRecord>()
  private logEntries: ModuleLogEntry[] = []
  private listeners = new Set<() => void>()
  private ready = false

  constructor(ctx: Context) {
    super(ctx, 'modules')
  }

  /** 注册一个内置模块定义。启动时调用，此时还没有加载。 */
  define(definition: ModuleDefinition): void {
    const { id } = definition.manifest
    if (this.records.has(id)) {
      throw new Error(`模块 ${id} 重复注册`)
    }
    this.ctx.bridge.namespaces.set(id, definition.manifest.namespaces ?? [id])
    this.records.set(id, { definition, entry: this.entryFor(definition) })
  }

  /**
   * 安装或升级后立刻接管：已有的先卸再换定义，没有的直接启用。
   * 这样装完不用重启。
   */
  async adopt(definition: ModuleDefinition): Promise<ModuleInfo[]> {
    const { id } = definition.manifest
    const existing = this.records.get(id)
    if (existing) {
      await this.unload(existing)
      existing.definition = definition
      existing.error = undefined
      this.ctx.bridge.namespaces.set(id, definition.manifest.namespaces ?? [id])
      if (!existing.entry.disabled) {
        await this.load(existing)
      }
    } else {
      this.define(definition)
      await this.enable(id)
    }
    this.emit()
    return this.list()
  }

  /** 卸载时从表里拿掉，配置也不再保留。 */
  async drop(id: string): Promise<ModuleInfo[]> {
    const record = this.records.get(id)
    if (!record) {
      return this.list()
    }
    await this.unload(record)
    this.records.delete(id)
    this.ctx.bridge.namespaces.delete(id)
    this.persist(new Set([id]))
    this.emit()
    return this.list()
  }

  /** 按配置把该启用的模块全部加载起来。 */
  async start(): Promise<void> {
    this.ready = true
    for (const record of this.ordered()) {
      if (!record.entry.disabled) {
        await this.load(record)
      }
    }
    this.emit()
  }

  list(): ModuleInfo[] {
    return this.ordered().map((record) => this.toInfo(record))
  }

  info(id: string): ModuleInfo | null {
    const record = this.records.get(id)
    return record ? this.toInfo(record) : null
  }

  isEnabled(id: string): boolean {
    const record = this.records.get(id)
    return Boolean(record) && !record!.entry.disabled
  }

  async enable(id: string): Promise<ModuleInfo[]> {
    const record = this.records.get(id)
    if (!record) {
      return this.list()
    }
    record.entry.disabled = false
    this.persist()
    await this.load(record)
    this.emit()
    return this.list()
  }

  async disable(id: string): Promise<ModuleInfo[]> {
    const record = this.records.get(id)
    if (!record || record.entry.disabled) {
      return this.list()
    }
    record.entry.disabled = true
    this.persist()
    await this.unload(record)
    this.emit()
    return this.list()
  }

  async setConfig(id: string, config: Record<string, unknown>): Promise<ModuleInfo[]> {
    const record = this.records.get(id)
    if (!record) {
      return this.list()
    }
    record.entry.config = { ...record.entry.config, ...config }
    this.persist()
    // 配置变了要重启模块才生效，走和 disable→enable 一样的路径。
    if (!record.entry.disabled) {
      await this.unload(record)
      await this.load(record)
    }
    this.emit()
    return this.list()
  }

  /** 调整侧栏顺序。 */
  async reorder(ids: string[]): Promise<ModuleInfo[]> {
    ids.forEach((id, index) => {
      const record = this.records.get(id)
      if (record) {
        record.entry.order = index
      }
    })
    this.persist()
    this.emit()
    return this.list()
  }

  configOf(id: string): Record<string, unknown> {
    return this.records.get(id)?.entry.config ?? {}
  }

  /**
   * 模块自报「启用了但必填配置缺失」，此时降级运行。
   * 传空字符串表示恢复正常。
   */
  needsConfig(detail: string): void {
    const id = this.ctx.fiber?.name
    const record = id ? this.records.get(id) : undefined
    if (!record) {
      return
    }
    record.needsConfig = detail || undefined
    this.emit()
    this.ctx.effect(() => () => {
      record.needsConfig = undefined
    }, 'modules.needsConfig')
  }

  log(moduleId: string, level: 'info' | 'error', message: string): void {
    this.logEntries.unshift({ at: new Date().toISOString(), moduleId, level, message })
    if (this.logEntries.length > MAX_LOGS) {
      this.logEntries.length = MAX_LOGS
    }
  }

  logs(moduleId?: string): ModuleLogEntry[] {
    return moduleId ? this.logEntries.filter((entry) => entry.moduleId === moduleId) : [...this.logEntries]
  }

  onChanged(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Service 方法里的 `this.ctx` 会被 cordis 换成带 `[symbols.shadow]` 的调用方上下文。
   * 子 fiber 继承这个 shadow 后，service getter 去读的是父 fiber 的 inject
   * （ModulesService 只有 `bridge`），模块自己声明的 inject 会被跳过。
   * 见 `@deepseek-ai/cordis` `src/reflect.ts` handler.get、`src/context.ts` extend()。
   */
  private pluginHost(): Context {
    const host = this.ctx as Context & { [key: symbol]: Context | undefined }
    return host[symbols.shadow] ?? this.ctx
  }

  private async load(record: ModuleRecord): Promise<void> {
    if (record.fiber) {
      return
    }
    const { id } = record.definition.manifest
    record.error = undefined
    try {
      const fiber = this.pluginHost().plugin(
        {
          name: id,
          inject: record.definition.manifest.inject ?? [],
          apply: record.definition.plugin,
        },
        record.entry.config ?? {},
      )
      record.fiber = fiber
      await fiber.await()
      // PENDING 时 await 会立刻返回，不能当成加载成功。
      if (fiber.state === FIBER_ACTIVE) {
        this.log(id, 'info', '已加载')
      } else if (fiber.state === FIBER_PENDING) {
        this.log(id, 'info', '已启用，等待依赖就绪')
      }
    } catch (error) {
      record.error = error instanceof Error ? error.message : String(error)
      this.log(id, 'error', `加载失败: ${record.error}`)
    }
  }

  private async unload(record: ModuleRecord): Promise<void> {
    const fiber = record.fiber
    if (!fiber) {
      return
    }
    record.fiber = undefined
    record.needsConfig = undefined
    try {
      await fiber.dispose()
      this.log(record.definition.manifest.id, 'info', '已停用')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.log(record.definition.manifest.id, 'error', `停用时出错: ${message}`)
    }
  }

  private toInfo(record: ModuleRecord): ModuleInfo {
    const enabled = !record.entry.disabled
    const status = this.status(record)
    return {
      manifest: record.definition.manifest,
      source: record.definition.source,
      status,
      enabled,
      detail: this.detail(record, status),
      config: record.entry.config ?? {},
      ...(record.definition.path ? { path: record.definition.path } : {}),
    }
  }

  private status(record: ModuleRecord): ModuleStatus {
    if (record.entry.disabled) {
      return 'disabled'
    }
    if (record.error) {
      return 'failed'
    }
    const state = record.fiber?.state
    if (state === FIBER_FAILED) {
      return 'failed'
    }
    if (state === FIBER_PENDING) {
      return 'pending'
    }
    if (state === FIBER_LOADING) {
      return 'loading'
    }
    if (state === FIBER_ACTIVE) {
      return record.needsConfig ? 'needs-config' : 'active'
    }
    return this.ready ? 'disabled' : 'loading'
  }

  private detail(record: ModuleRecord, status: ModuleStatus): string {
    if (status === 'failed') {
      return record.error ?? '启动失败'
    }
    if (status === 'needs-config') {
      return record.needsConfig ?? '需要配置'
    }
    if (status === 'pending') {
      const missing = (record.definition.manifest.inject ?? []).filter((name) => !(name in this.ctx))
      return missing.length > 0 ? `等待依赖：${missing.join(' / ')}` : '等待依赖就绪'
    }
    return ''
  }

  private ordered(): ModuleRecord[] {
    return [...this.records.values()].sort((left, right) => {
      const a = left.entry.order ?? left.definition.manifest.order
      const b = right.entry.order ?? right.definition.manifest.order
      return a - b
    })
  }

  /** 配置里已有就用配置，没有就按 manifest 默认值建一条。 */
  private entryFor(definition: ModuleDefinition): ModuleEntry {
    const stored = readConfig().entries.find((entry) => entry.id === definition.manifest.id)
    if (stored) {
      return { ...stored, name: stored.name || builtinSpecifier(definition.manifest.id) }
    }
    return {
      id: definition.manifest.id,
      name:
        definition.source === 'builtin'
          ? builtinSpecifier(definition.manifest.id)
          : (definition.path ?? builtinSpecifier(definition.manifest.id)),
      disabled: definition.source === 'builtin' && !isOpensourceDefaultModule(definition.manifest.id),
      config: {},
    }
  }

  private persist(removed = new Set<string>()): void {
    const entries = this.ordered().map((record) => record.entry)
    // 保留配置里那些当前没有对应定义的 entry（比如第三方模块暂时装不上），
    // 否则重启后用户的安装记录会被悄悄抹掉。主动 drop 的除外。
    const known = new Set(entries.map((entry) => entry.id))
    const orphans = readConfig().entries.filter(
      (entry) => !known.has(entry.id) && !removed.has(entry.id) && !isBuiltinSpecifier(entry.name),
    )
    writeConfig({ version: 1, entries: [...entries, ...orphans] })
    try {
      writeOpcWorkbenchPatch(
        dshHome(),
        this.ordered().map((record) => ({
          id: record.definition.manifest.id,
          disabled: Boolean(record.entry.disabled),
          ...(record.definition.manifest.dshBundle ? { dshBundle: record.definition.manifest.dshBundle } : {}),
        })),
      )
    } catch {
      // opc 用户层写失败不影响 workbench.yml。
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    modules: ModulesService
  }
}
