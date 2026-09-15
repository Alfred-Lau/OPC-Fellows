export type ToolTab = 'tool' | 'todos' | 'calendar'

export interface ToolPaneState {
  tab: ToolTab
  collapsed: boolean
  expanded: boolean
}

export function defaultToolPane(): ToolPaneState {
  return { tab: 'todos', collapsed: true, expanded: false }
}

/** 会话或全局动作打开面板：一定展开，不会误收起。 */
export function openToolTab(state: ToolPaneState, tab: ToolTab): ToolPaneState {
  return { tab, collapsed: false, expanded: state.expanded }
}

/** 点竖栏 Tab：关掉的打开；再点当前项则收起内容。 */
export function clickToolTab(state: ToolPaneState, tab: ToolTab): ToolPaneState {
  if (!state.collapsed && state.tab === tab) {
    return { ...state, collapsed: true, expanded: false }
  }
  return { tab, collapsed: false, expanded: false }
}

export function collapseToolPane(state: ToolPaneState): ToolPaneState {
  return { ...state, collapsed: true, expanded: false }
}

/** 回首页或选中身份只记住 Tab，不把右栏拉开。 */
export function parkToolTab(state: ToolPaneState, tab: ToolTab): ToolPaneState {
  return { tab, collapsed: true, expanded: false }
}

/** 技能等全幅页需要内容区，但不抢全幅开关。 */
export function revealToolPane(state: ToolPaneState): ToolPaneState {
  return { ...state, collapsed: false, expanded: false }
}

/** 技能页占满工具区；日历 Tab 会把设置页藏掉，先离开日历。 */
export function openSkillsPane(state: ToolPaneState): ToolPaneState {
  const tab = state.tab === 'calendar' ? 'todos' : state.tab
  return revealToolPane({ ...state, tab })
}

export function toggleToolExpanded(state: ToolPaneState): ToolPaneState {
  const expanded = !state.expanded
  return { ...state, collapsed: false, expanded }
}

export function isToolTab(value: string | undefined): value is ToolTab {
  return value === 'tool' || value === 'todos' || value === 'calendar'
}

/** 全局「日程」：打开日历并拉到主区宽度。 */
export function openSchedule(_state: ToolPaneState): ToolPaneState {
  return { tab: 'calendar', collapsed: false, expanded: true }
}
