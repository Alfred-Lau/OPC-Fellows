import { Service, type Context } from '@deepseek-ai/cordis'
import type { ModuleKind } from '../../shared/module'
import { showWorkbench } from '../../../main/workbench-window'

export interface NavContribution {
  id: string
  title: string
  mark: string
  kind: ModuleKind
  order: number
  accelerator?: string
  /** window 类模块点击时开自己的窗口，view 类走主舞台。 */
  open?: () => void | Promise<void>
}

export type NavListener = () => void

/**
 * 工作台外壳：侧栏导航、托盘、应用菜单、快捷键的贡献点。
 *
 * 模块调 `ctx.workbench.nav()` 挂一项，禁用时随 fiber 自动摘掉，
 * 托盘和菜单会跟着重建 —— 不再有硬编码的模块清单。
 */
export class WorkbenchService extends Service {
  private navMap = new Map<string, NavContribution>()
  private listeners = new Set<NavListener>()

  constructor(ctx: Context) {
    super(ctx, 'workbench')
  }

  nav(contribution: NavContribution): void {
    this.navMap.set(contribution.id, contribution)
    this.emit()
    this.ctx.effect(() => () => {
      this.navMap.delete(contribution.id)
      this.emit()
    }, `workbench.nav(${contribution.id})`)
  }

  /** 按 order 排好的导航项，托盘 / 菜单 / 侧栏共用这一份。 */
  entries(): NavContribution[] {
    return [...this.navMap.values()].sort((left, right) => left.order - right.order)
  }

  get(id: string): NavContribution | undefined {
    return this.navMap.get(id)
  }

  /** 打开某个模块：view 类切主舞台，window 类开自己的窗。 */
  async open(id: string): Promise<void> {
    const entry = this.navMap.get(id)
    if (!entry) {
      return
    }
    if (entry.kind === 'window' && entry.open) {
      await entry.open()
      return
    }
    showWorkbench(id)
  }

  /** 导航项变化时重建托盘与菜单、通知渲染进程。 */
  onChanged(listener: NavListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
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
    workbench: WorkbenchService
  }
}
