export interface PetAlert {
  id: string
  title: string
  note?: string
}

export type PetWindowMode = 'idle' | 'alert'

export type PetWindowStacking = {
  alwaysOnTop: boolean
  visibleOnAllWorkspaces: boolean
  visibleOnFullScreen: boolean
  raise: boolean
}

/**
 * 台伴和工作台一样按普通窗口叠放。
 * 钉 alwaysOnTop / 全屏可见会把整个 Electron 应用顶在所有程序前面。
 */
export function petWindowStacking(mode: PetWindowMode): PetWindowStacking {
  switch (mode) {
    case 'idle':
      return {
        alwaysOnTop: false,
        visibleOnAllWorkspaces: false,
        visibleOnFullScreen: false,
        raise: false,
      }
    case 'alert':
      return {
        alwaysOnTop: false,
        visibleOnAllWorkspaces: false,
        visibleOnFullScreen: false,
        raise: true,
      }
    default: {
      const exhaustive: never = mode
      return exhaustive
    }
  }
}
