import { ipcMain } from 'electron'
import { Service, type Context } from '@deepseek-ai/cordis'
import { getWorkbenchWindow } from '../../../main/workbench-window'
import type { IpcListener } from '../ipc'

export interface ChannelOwner {
  channel: string
  moduleId: string
}

/**
 * IPC 通道注册表。模块用 `ctx.bridge.handle()` 注册，
 * 注册动作本身是一个 effect —— 模块被禁用时 Cordis 逆序回收，
 * 通道自动注销，前端再调就拿不到 handler。
 *
 * 通道名沿用现有的 `<模块>:<动作>` 形式，所以 preload 与渲染层不用改。
 */
export class BridgeService extends Service {
  // 不能用 JS #私有字段：cordis 经 ctx 调 service 方法时会把 this 换成 shadow 代理，
  // # 字段要求 this 必须是真实例，子 fiber（TodosService / 模块）里会直接炸。
  private owners = new Map<string, string>()

  constructor(ctx: Context) {
    super(ctx, 'bridge')
  }

  /** 当前 context 所属的模块 id，用于记账。 */
  private moduleId(): string {
    return this.ctx.fiber?.name ?? 'kernel'
  }

  /**
   * 只有进了注册表的模块才受命名空间限制。
   * 根 fiber 叫 root，待办服务的 fiber 叫 TodosService —— 它们不在表里，
   * 不能按模块 id 去卡，否则内核自己的通道都注册不上。
   */
  private assertNamespace(moduleId: string, channel: string): void {
    const prefixes = this.namespaces.get(moduleId)
    if (!prefixes) {
      return
    }
    if (!prefixes.some((prefix) => channel.startsWith(`${prefix}:`))) {
      throw new Error(`模块 ${moduleId} 不能注册通道 ${channel}，允许的前缀：${prefixes.join(' / ')}`)
    }
  }

  /** 模块 id → 允许的通道前缀，由注册表在加载模块前填好。 */
  readonly namespaces = new Map<string, string[]>()

  handle(channel: string, listener: IpcListener): void {
    const moduleId = this.moduleId()
    const existing = this.owners.get(channel)
    if (existing) {
      throw new Error(`IPC 通道 ${channel} 已被模块 ${existing} 占用`)
    }
    this.assertNamespace(moduleId, channel)
    this.owners.set(channel, moduleId)
    ipcMain.handle(channel, listener)
    this.ctx.effect(() => () => {
      ipcMain.removeHandler(channel)
      this.owners.delete(channel)
    }, `bridge.handle(${channel})`)
  }

  /** 主进程 → 渲染进程的推送。工作台窗口没开时静默丢弃。 */
  send(channel: string, ...args: unknown[]): void {
    getWorkbenchWindow()?.webContents.send(channel, ...args)
  }

  /** 通道归属表，给设置页的开发者视图看。 */
  channels(): ChannelOwner[] {
    return [...this.owners.entries()]
      .map(([channel, moduleId]) => ({ channel, moduleId }))
      .sort((left, right) => left.channel.localeCompare(right.channel))
  }

  ownerOf(channel: string): string | undefined {
    return this.owners.get(channel)
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    bridge: BridgeService
  }
}
