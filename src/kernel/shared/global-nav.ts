export type GlobalNavId = 'home' | 'task' | 'schedule' | 'extensions'

/** 左栏四个全局入口里，当前该亮哪一个。设置走用户中心，不算这里。 */
export function currentGlobalNav(view: string, threadId: string, inboxId: string): GlobalNavId | undefined {
  switch (view) {
    case 'task':
      return 'task'
    case 'schedule':
      return 'schedule'
    case 'extensions':
      return 'extensions'
    case 'prefs':
      return undefined
    default:
      return threadId === inboxId ? 'home' : undefined
  }
}
