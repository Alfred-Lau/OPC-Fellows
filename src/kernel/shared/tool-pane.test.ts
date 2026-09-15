import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clickToolTab,
  collapseToolPane,
  defaultToolPane,
  openSchedule,
  openSkillsPane,
  openToolTab,
  parkToolTab,
  revealToolPane,
  toggleToolExpanded,
} from './tool-pane.ts'

test('工具面板默认收起，只留待办 Tab 待命', () => {
  assert.deepEqual(defaultToolPane(), { tab: 'todos', collapsed: true, expanded: false })
})

test('点一个 Tab 会打开面板并切到该 Tab', () => {
  const opened = clickToolTab(defaultToolPane(), 'tool')
  assert.deepEqual(opened, { tab: 'tool', collapsed: false, expanded: false })
})

test('再点当前 Tab 会收起内容，不丢掉选中的 Tab', () => {
  const closed = clickToolTab({ tab: 'todos', collapsed: false, expanded: true }, 'todos')
  assert.deepEqual(closed, { tab: 'todos', collapsed: true, expanded: false })
})

test('回首页只待命，不把已经拉开的面板继续撑开', () => {
  assert.deepEqual(parkToolTab({ tab: 'tool', collapsed: false, expanded: true }, 'todos'), {
    tab: 'todos',
    collapsed: true,
    expanded: false,
  })
})

test('选中身份只把对应 Tab 待命，不拉开右栏', () => {
  assert.deepEqual(parkToolTab(defaultToolPane(), 'tool'), {
    tab: 'tool',
    collapsed: true,
    expanded: false,
  })
})

test('会话里打开工具时一定展开，不会误收起', () => {
  const already = openToolTab({ tab: 'tool', collapsed: false, expanded: false }, 'tool')
  assert.equal(already.collapsed, false)
  assert.equal(already.tab, 'tool')
})

test('日程入口打开日历并拉到主区', () => {
  assert.deepEqual(openSchedule(defaultToolPane()), {
    tab: 'calendar',
    collapsed: false,
    expanded: true,
  })
})

test('技能页离开日历 Tab，避免和设置页抢显示', () => {
  assert.deepEqual(openSkillsPane(openSchedule(defaultToolPane())), {
    tab: 'todos',
    collapsed: false,
    expanded: false,
  })
  assert.deepEqual(openSkillsPane({ tab: 'tool', collapsed: true, expanded: true }), {
    tab: 'tool',
    collapsed: false,
    expanded: false,
  })
})

test('新任务收起全幅日历，只记住当前 Tab', () => {
  assert.deepEqual(parkToolTab(openSchedule(defaultToolPane()), 'calendar'), {
    tab: 'calendar',
    collapsed: true,
    expanded: false,
  })
})

test('收起只藏内容；全幅开关互斥', () => {
  const collapsed = collapseToolPane({ tab: 'tool', collapsed: false, expanded: true })
  assert.deepEqual(collapsed, { tab: 'tool', collapsed: true, expanded: false })
  const wide = toggleToolExpanded({ tab: 'todos', collapsed: true, expanded: false })
  assert.deepEqual(wide, { tab: 'todos', collapsed: false, expanded: true })
  const settings = revealToolPane({ tab: 'todos', collapsed: true, expanded: true })
  assert.deepEqual(settings, { tab: 'todos', collapsed: false, expanded: false })
})
