import type { ModuleKind } from './module'

/** 一条侧栏导航项。主进程发给渲染层的形态，不带 open 回调。 */
export interface NavEntry {
  id: string
  title: string
  mark: string
  kind: ModuleKind
  order: number
  accelerator?: string
}
