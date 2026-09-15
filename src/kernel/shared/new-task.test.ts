import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentRecord, ThreadRecord } from './agent.ts'
import { HOST_AGENT_ID } from './agent.ts'
import {
  NEW_PROJECT_EMPTY_HINT,
  NEW_TASK_PLACEHOLDER,
  PROJECT_DESC_MAX,
  PROJECT_TITLE_MAX,
  clickProjectAgent,
  describeNewTaskPage,
  ensureHostOnUserProjects,
  homeThreadForeignTitles,
  listProjects,
  normalizeProjectDescription,
  normalizeProjectTitle,
  planDeleteProject,
  planPinProject,
  planProjectCreate,
  planRenameProject,
  planReorderProjects,
  shouldShowThreadFeed,
  planProjectSubmit,
  titleFromTaskText,
  withHostAgent,
} from './new-task.ts'

const clock = { now: () => '2026-09-10T12:00:00.000Z' }

function agent(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: 'rumi',
    templateId: 'blank',
    title: '通用助手',
    mark: '助',
    description: '对话',
    hue: 2,
    kind: 'conversational',
    origin: 'user',
    moduleIds: [],
    singleton: false,
    status: 'ready',
    createdAt: clock.now(),
    updatedAt: clock.now(),
    workspaceName: '助手',
    ...overrides,
  }
}

function project(overrides: Partial<ThreadRecord> = {}): ThreadRecord {
  return {
    id: 'thread:user:poem',
    title: '古诗图文素材',
    kind: 'user',
    agentIds: ['micro', 'social-ammo'],
    workspaceAgentId: 'micro',
    description: '把目录和封面图一次收齐',
    createdAt: clock.now(),
    updatedAt: clock.now(),
    ...overrides,
  }
}

test('没选项目时标题是发起新项目，不预勾身份', () => {
  const page = describeNewTaskPage({
    threads: [project()],
    agents: [agent(), agent({ id: 'mina', title: 'Mina', mark: '米', hue: 1 })],
    hostName: 'opc.local',
  })
  assert.equal(page.headline, '发起新项目？')
  assert.equal(page.triggerLabel, '新项目')
  assert.equal(page.placeholder, NEW_TASK_PLACEHOLDER)
  assert.equal(page.hostLabel, 'opc.local')
  assert.equal(page.chipLabel, 'opc.local')
  assert.equal(page.folderLabel, '')
  assert.equal(page.selectedCount, 0)
  assert.equal(page.totalCount, 2)
  assert.equal(page.leadId, undefined)
  assert.equal(page.showComposer, false)
  assert.equal(page.emptyHint, NEW_PROJECT_EMPTY_HINT)
  assert.equal(page.brief, '')
  assert.deepEqual(
    page.projects.map((item) => item.title),
    ['古诗图文素材'],
  )
})

test('选了已有项目时标题点名，并带上参与者和主 Agent', () => {
  const page = describeNewTaskPage({
    threads: [project()],
    agents: [
      agent({ id: 'micro', title: '选品策略师', mark: '选', hue: 5 }),
      agent({ id: 'social-ammo', title: '社媒弹药手', mark: '弹', hue: 7 }),
    ],
    hostName: 'opc.local',
    projectId: 'thread:user:poem',
  })
  assert.equal(page.headline, '在「古诗图文素材」里继续？')
  assert.equal(page.triggerLabel, '古诗图文素材')
  assert.equal(page.isNew, false)
  assert.equal(page.showComposer, true)
  assert.equal(page.emptyHint, '')
  assert.equal(page.brief, '把目录和封面图一次收齐')
  assert.equal(page.leadId, 'micro')
  assert.equal(page.folderLabel, '')
  assert.equal(page.chipLabel, 'opc.local')
  assert.deepEqual(
    page.agents.map((item) => [item.id, item.selected, item.lead]),
    [
      ['micro', true, true],
      ['social-ammo', true, false],
    ],
  )
})

test('置顶项目排在列表顶部，新钉的更靠上', () => {
  const older = project({
    id: 'thread:user:old',
    title: '旧项目',
    updatedAt: '2026-09-12T10:00:00.000Z',
    pinnedAt: '2026-09-12T08:00:00.000Z',
  })
  const newer = project({
    id: 'thread:user:new',
    title: '新项目',
    updatedAt: '2026-09-10T10:00:00.000Z',
    pinnedAt: '2026-09-12T09:00:00.000Z',
  })
  const loose = project({
    id: 'thread:user:loose',
    title: '未钉',
    updatedAt: '2026-09-13T10:00:00.000Z',
  })
  assert.deepEqual(
    listProjects([loose, older, newer]).map((item) => item.id),
    ['thread:user:new', 'thread:user:old', 'thread:user:loose'],
  )

  const pinned = planPinProject([loose], loose.id, true, clock)
  assert.equal(pinned.ok, true)
  if (pinned.ok) {
    assert.equal(pinned.threads[0]?.pinnedAt, clock.now())
  }
  const renamed = planRenameProject([loose], loose.id, '  改名了  ')
  assert.equal(renamed.ok, true)
  if (renamed.ok) {
    assert.equal(renamed.threads[0]?.title, '改名了')
  }
  const removed = planDeleteProject(
    [loose, older],
    [{ id: 'msg-1', threadId: loose.id, role: 'user', text: 'hi', createdAt: clock.now() }],
    loose.id,
  )
  assert.equal(removed.ok, true)
  if (removed.ok) {
    assert.deepEqual(
      removed.threads.map((item) => item.id),
      [older.id],
    )
    assert.equal(removed.messages.length, 0)
  }
})

test('项目拖动能改未置顶顺序，置顶组仍在最上', () => {
  const first = project({
    id: 'thread:user:a',
    title: '甲',
    updatedAt: '2026-09-13T10:00:00.000Z',
    sortOrder: 0,
  })
  const second = project({
    id: 'thread:user:b',
    title: '乙',
    updatedAt: '2026-09-13T11:00:00.000Z',
    sortOrder: 1,
  })
  const pinned = project({
    id: 'thread:user:pin',
    title: '钉住',
    pinnedAt: clock.now(),
    sortOrder: -1,
  })
  const moved = planReorderProjects([first, second, pinned], [pinned.id, second.id, first.id])
  assert.equal(moved.ok, true)
  if (moved.ok) {
    assert.deepEqual(
      listProjects(moved.threads).map((item) => item.id),
      [pinned.id, second.id, first.id],
    )
  }
})

test('项目列表只收用户开的事，主对话和今日不进', () => {
  const listed = listProjects([
    project(),
    {
      id: 'thread:inbox',
      title: '今日',
      kind: 'inbox',
      agentIds: [],
      createdAt: clock.now(),
      updatedAt: clock.now(),
    },
    {
      id: 'thread:micro',
      title: '选品策略师',
      kind: 'agent',
      agentIds: ['micro'],
      createdAt: clock.now(),
      updatedAt: clock.now(),
    },
  ])
  assert.deepEqual(
    listed.map((item) => item.id),
    ['thread:user:poem'],
  )
})

test('新任务列出可见身份，后台能力不进选择，停用的也不进名单', () => {
  const page = describeNewTaskPage({
    threads: [],
    agents: [
      agent(),
      agent({ id: 'harness', title: 'DeepSeek', kind: 'window', templateId: 'harness', moduleIds: ['harness'] }),
      agent({ id: 'pet', title: '台伴', kind: 'window', templateId: 'pet', moduleIds: ['pet'] }),
      agent({ id: 'pay', title: '收款', kind: 'dashboard', moduleIds: ['payments'], status: 'needs-module' }),
      agent({ id: 'monitor', title: '项目监控官', kind: 'dashboard', moduleIds: ['monitor'], mark: '监' }),
    ],
    hostName: 'opc.local',
  })
  assert.deepEqual(
    page.agents.map((item) => item.id),
    ['rumi', 'monitor'],
  )
})

test('点选成员：未选则加入，已选非主则改主，主再点则移出；主理人不能移出', () => {
  const added = clickProjectAgent([], undefined, 'rumi')
  assert.deepEqual(added, { selectedIds: [HOST_AGENT_ID, 'rumi'], leadId: HOST_AGENT_ID })

  const joined = clickProjectAgent(['rumi'], 'rumi', 'mina')
  assert.deepEqual(joined, { selectedIds: [HOST_AGENT_ID, 'rumi', 'mina'], leadId: 'rumi' })

  const switched = clickProjectAgent(['rumi', 'mina'], 'rumi', 'mina')
  assert.deepEqual(switched, { selectedIds: [HOST_AGENT_ID, 'rumi', 'mina'], leadId: 'mina' })

  const dropped = clickProjectAgent(['rumi', 'mina'], 'mina', 'mina')
  assert.deepEqual(dropped, { selectedIds: [HOST_AGENT_ID, 'rumi'], leadId: HOST_AGENT_ID })

  const kept = clickProjectAgent([HOST_AGENT_ID, 'rumi'], HOST_AGENT_ID, HOST_AGENT_ID)
  assert.deepEqual(kept, { selectedIds: [HOST_AGENT_ID, 'rumi'], leadId: HOST_AGENT_ID })
})

test('弹窗建项目：要标题和成员，简述可空，标题取用户写的而不是第一句聊天', () => {
  assert.equal(normalizeProjectTitle('  \n古诗图文素材\n第二行'), '古诗图文素材')
  assert.equal(normalizeProjectTitle(''), '')
  assert.equal(normalizeProjectTitle('x'.repeat(PROJECT_TITLE_MAX + 4)).length, PROJECT_TITLE_MAX)
  assert.equal(normalizeProjectDescription('  把目录收齐  '), '把目录收齐')
  assert.equal(normalizeProjectDescription('y'.repeat(PROJECT_DESC_MAX + 8)).length, PROJECT_DESC_MAX)

  const untitled = planProjectCreate({ title: '  ', agentIds: ['rumi'], clock })
  assert.equal(untitled.ok, false)
  if (!untitled.ok) {
    assert.equal(untitled.error, '先给项目起个标题')
  }

  const empty = planProjectCreate({ title: '古诗图文素材', agentIds: [], clock })
  assert.equal(empty.ok, true)
  if (empty.ok) {
    assert.deepEqual(empty.thread.agentIds, [HOST_AGENT_ID])
    assert.equal(empty.thread.workspaceAgentId, HOST_AGENT_ID)
  }

  const created = planProjectCreate({
    title: '古诗图文素材',
    description: '把目录和封面图一次收齐',
    agentIds: ['rumi', 'mina'],
    workspaceAgentId: 'mina',
    folderPath: '/tmp/demo-project',
    clock,
  })
  assert.equal(created.ok, true)
  if (created.ok) {
    assert.equal(created.thread.id, 'thread:user:2026-09-10T12:00:00.000Z')
    assert.equal(created.thread.kind, 'user')
    assert.equal(created.thread.title, '古诗图文素材')
    assert.equal(created.thread.description, '把目录和封面图一次收齐')
    assert.deepEqual(created.thread.agentIds, [HOST_AGENT_ID, 'rumi', 'mina'])
    assert.equal(created.thread.workspaceAgentId, 'mina')
    assert.equal(created.thread.folderPath, '/tmp/demo-project')
  }

  const bare = planProjectCreate({ title: '周报', agentIds: ['rumi'], clock })
  assert.equal(bare.ok, true)
  if (bare.ok) {
    assert.equal(bare.thread.description, undefined)
    assert.deepEqual(bare.thread.agentIds, [HOST_AGENT_ID, 'rumi'])
    assert.equal(bare.thread.workspaceAgentId, HOST_AGENT_ID)
  }
})

test('没有另选成员也能开项目，默认带上主理人；新建用第一句话当标题；续写只改成员', () => {
  assert.equal(titleFromTaskText('把封面图和目录一起带上'), '把封面图和目录一起带上')
  assert.equal(titleFromTaskText('  \n明天交周报，附上数据\n第二行'), '明天交周报，附上数据')
  assert.equal(titleFromTaskText(''), '新项目')

  const empty = planProjectSubmit({ text: '做封面', agentIds: [], clock })
  assert.equal(empty.ok, true)
  if (empty.ok && empty.mode === 'create') {
    assert.deepEqual(empty.thread.agentIds, [HOST_AGENT_ID])
    assert.equal(empty.thread.workspaceAgentId, HOST_AGENT_ID)
  }

  const created = planProjectSubmit({
    text: '把封面图和目录一起带上',
    agentIds: ['rumi', 'mina'],
    workspaceAgentId: 'rumi',
    clock,
  })
  assert.equal(created.ok, true)
  if (created.ok && created.mode === 'create') {
    assert.equal(created.thread.id, 'thread:user:2026-09-10T12:00:00.000Z')
    assert.equal(created.thread.kind, 'user')
    assert.equal(created.thread.title, '把封面图和目录一起带上')
    assert.deepEqual(created.thread.agentIds, [HOST_AGENT_ID, 'rumi', 'mina'])
    assert.equal(created.thread.workspaceAgentId, 'rumi')
  }

  const continued = planProjectSubmit({
    text: '整理目录',
    agentIds: ['rumi', 'mina'],
    workspaceAgentId: 'mina',
    projectId: 'thread:user:poem',
    clock,
  })
  assert.equal(continued.ok, true)
  if (continued.ok && continued.mode === 'continue') {
    assert.equal(continued.threadId, 'thread:user:poem')
    assert.deepEqual(continued.agentIds, [HOST_AGENT_ID, 'rumi', 'mina'])
    assert.equal(continued.workspaceAgentId, 'mina')
  }
})

test('主对话里 @ 别人要点名，项目里不拦', () => {
  const rumi = agent()
  const mina = agent({ id: 'mina', title: 'Mina', mark: '米', hue: 1 })
  const home: ThreadRecord = {
    id: 'thread:rumi',
    title: '通用助手',
    kind: 'agent',
    agentIds: ['rumi'],
    createdAt: clock.now(),
    updatedAt: clock.now(),
  }
  assert.deepEqual(homeThreadForeignTitles(home, '@Mina 一起看封面', [rumi, mina]), ['Mina'])
  assert.deepEqual(homeThreadForeignTitles(home, '@通用助手 继续', [rumi, mina]), [])
  assert.deepEqual(homeThreadForeignTitles(project(), '@Mina 一起看封面', [rumi, mina]), [])
})

test('发起新项目不带会话列表，今日空收件箱也不出空列表', () => {
  assert.equal(shouldShowThreadFeed('task', 4), false)
  assert.equal(shouldShowThreadFeed('schedule', 2), false)
  assert.equal(shouldShowThreadFeed('home', 0), false)
  assert.equal(shouldShowThreadFeed('home', 2), true)
  assert.equal(shouldShowThreadFeed('monitor', 0), true)
})

test('有主理人时新项目默认勾上且不能移出；旧项目补进主理人，今日不塞', () => {
  const host = agent({
    id: HOST_AGENT_ID,
    templateId: 'host',
    title: '主理人',
    mark: '主',
    origin: 'builtin-default',
    singleton: true,
  })
  const page = describeNewTaskPage({
    threads: [],
    agents: [host, agent()],
    hostName: 'opc.local',
  })
  assert.equal(page.selectedCount, 1)
  assert.equal(page.leadId, HOST_AGENT_ID)
  assert.deepEqual(
    page.agents.map((item) => [item.id, item.selected, item.lead, item.locked]),
    [
      [HOST_AGENT_ID, true, true, true],
      ['rumi', false, false, false],
    ],
  )

  const inbox: ThreadRecord = {
    id: 'thread:inbox',
    title: '今日',
    kind: 'inbox',
    agentIds: [],
    createdAt: clock.now(),
    updatedAt: clock.now(),
  }
  const hydrated = ensureHostOnUserProjects([project(), inbox])
  assert.deepEqual(hydrated[0]?.agentIds, [HOST_AGENT_ID, 'micro', 'social-ammo'])
  assert.equal(hydrated[0]?.workspaceAgentId, 'micro')
  assert.deepEqual(hydrated[1]?.agentIds, [])
  assert.deepEqual(withHostAgent(['mina', HOST_AGENT_ID, 'mina']), [HOST_AGENT_ID, 'mina'])
})
