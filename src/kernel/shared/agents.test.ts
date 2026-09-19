import assert from 'node:assert/strict'
import test from 'node:test'
import { PRODUCT_NAME } from '../../shared/brand.ts'
import { DEEPSEEK_MODEL_LABEL } from '../../shared/deepseek.ts'
import { isSkillMissText } from '../../shared/intent-route.ts'
import { INBOX_THREAD_ID, type AgentRecord } from './agent.ts'
import {
  agentSystemPrompt,
  chatTurns,
  ensureInboxThread,
  filterMentionAgents,
  rosterAgentsByIds,
  listComposerSkills,
  mentionQueryAt,
  mentionSpans,
  modulesReady,
  parseMentions,
  pickAgentName,
  appendMessage,
  applyThreadListing,
  canRemoveAgent,
  ensureRosterSortOrder,
  planCreateAgent,
  planConfigureAgent,
  planRemoveAgent,
  planRenameAgent,
  planReorderAgents,
  occupationSkillChoices,
  planDispatch,
  promoteMissToClassify,
  promoteToClassify,
  inboxMissReply,
  skillMissReply,
  recommendAgents,
  skillQueryAt,
  slugify,
  upsertDefaultAgents,
  visibleAgents,
  type ModulePresence,
} from './agents.ts'
import { listedTemplates, templateForModule } from './templates.ts'

const clock = { now: () => '2026-09-10T01:00:00.000Z' }

function sampleAgent(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: 'social-ammo',
    templateId: 'social-ammo',
    title: '社媒弹药手',
    mark: '弹',
    description: '写弹药',
    hue: 7,
    kind: 'dashboard',
    origin: 'builtin-default',
    moduleIds: ['social-ammo'],
    viewId: 'social-ammo',
    workspaceName: '弹药',
    singleton: true,
    status: 'ready',
    createdAt: clock.now(),
    updatedAt: clock.now(),
    ...overrides,
  }
}

test('slugify 吃中文也能给出稳定 id', () => {
  assert.equal(slugify('Rumi'), 'rumi')
  assert.equal(slugify('Hello World'), 'hello-world')
  assert.equal(slugify('选品策略师'), '选品策略师')
})

test('默认实例 id 对齐历史上的 ingest agentId', () => {
  assert.equal(templateForModule('social-ammo')?.defaultAgentId, 'social-ammo')
  assert.equal(templateForModule('monitor'), undefined)
  assert.equal(listedTemplates().some((template) => template.id === 'host'), false)
  assert.deepEqual(
    listedTemplates().map((template) => template.id),
    ['social-ammo'],
  )
})

test('开源默认花名册只长主理人和社媒弹药手，其它模块不长成员', () => {
  const modules: ModulePresence[] = [
    { id: 'monitor', enabled: true },
    { id: 'payments', enabled: false },
    { id: 'notes', enabled: true },
    { id: 'social-ammo', enabled: true },
  ]
  const first = upsertDefaultAgents([], modules, clock)
  assert.equal(first.find((agent) => agent.id === 'host')?.title, '主理人')
  assert.equal(first.find((agent) => agent.id === 'host')?.origin, 'builtin-default')
  assert.deepEqual(first.find((agent) => agent.id === 'host')?.toolPacks, [
    'kernel',
    'workspace',
    'mcp-github',
  ])
  assert.equal(first.find((agent) => agent.id === 'host')?.planMode, true)
  assert.deepEqual(first.find((agent) => agent.id === 'host')?.skillIds, [
    'research-brief',
    'verify-loop',
    'grill-change',
    'ship-change',
    'tdd',
    'code-review',
    'diagnose-bug',
  ])
  assert.equal(first.find((agent) => agent.id === 'social-ammo')?.title, '社媒弹药手')
  assert.equal(first.find((agent) => agent.id === 'social-ammo')?.status, 'ready')
  assert.equal(first.find((agent) => agent.id === 'monitor'), undefined)
  assert.equal(first.find((agent) => agent.id === 'notes'), undefined)
  assert.equal(first.find((agent) => agent.id === 'payments'), undefined)
  const leftover = upsertDefaultAgents(
    [...first, sampleAgent({ id: 'notes', title: '随手记', templateId: 'notes', moduleIds: ['notes'] })],
    modules,
    clock,
  )
  assert.equal(leftover.find((agent) => agent.id === 'notes'), undefined)
  assert.equal(leftover.filter((agent) => agent.id === 'social-ammo').length, 1)
})

test('雇佣未知模板失败，弹药手单例可再开已有实例', () => {
  const modules: ModulePresence[] = [{ id: 'social-ammo', enabled: true }]
  const unknown = planCreateAgent([], { templateId: 'creator', title: '自媒体运营达人' }, modules, clock)
  assert.equal(unknown.ok, false)
  const hired = planCreateAgent([], { templateId: 'social-ammo', title: '社媒弹药手' }, modules, clock)
  assert.equal(hired.ok, true)
  assert.equal(hired.agent?.templateId, 'social-ammo')
})

test('Thread 短结果钉死上次 listing，无新表不覆盖', () => {
  const threads = [
    {
      id: 'thread:micro',
      title: '选品策略师',
      kind: 'agent' as const,
      agentIds: ['micro-sourcing'],
      createdAt: clock.now(),
      updatedAt: clock.now(),
    },
  ]
  const pinned = applyThreadListing(threads, 'thread:micro', { kind: 'idea', ids: ['low', 'high'] }, clock)
  assert.deepEqual(pinned[0]?.lastListing?.ids, ['low', 'high'])
  const kept = applyThreadListing(pinned, 'thread:micro', undefined, clock)
  assert.deepEqual(kept[0]?.lastListing?.ids, ['low', 'high'])
})

test('单例模板再新建会指回已有实例，不复制账本', () => {
  const agents = [sampleAgent()]
  const result = planCreateAgent(
    agents,
    { templateId: 'social-ammo', title: '另一个弹药手' },
    [{ id: 'social-ammo', enabled: true }],
    clock,
  )
  assert.equal(result.ok, false)
  assert.equal(result.existingId, 'social-ammo')
})

test('推荐列表包含当前全部可见 Agent 和内置模板', () => {
  const agents = [
    sampleAgent(),
    sampleAgent({
      id: 'rumi',
      templateId: 'blank',
      title: 'Rumi',
      kind: 'conversational',
      origin: 'user',
      moduleIds: [],
      singleton: false,
    }),
    sampleAgent({
      id: 'x-push',
      templateId: 'x-push',
      title: 'X 推送通道',
      kind: 'background',
      origin: 'builtin-default',
      moduleIds: ['x-push'],
    }),
    sampleAgent({
      id: 'pet',
      templateId: 'pet',
      title: '台伴',
      kind: 'window',
      origin: 'builtin-default',
      moduleIds: ['pet'],
    }),
  ]
  const recommend = recommendAgents(agents)
  assert.deepEqual(
    recommend.templates.map((template) => template.id),
    ['social-ammo'],
  )
  assert.equal(recommend.templates.some((template) => template.id === 'host'), false)
  assert.equal(recommend.templates.some((template) => template.id === 'blank'), false)
  assert.equal(recommend.templates.some((template) => template.id === 'engineer'), false)
  assert.equal(recommend.templates.some((template) => template.id === 'creator'), false)
  assert.equal(recommend.templates.some((template) => template.id === 'pet'), false)
  assert.equal(recommend.templates.some((template) => template.id === 'harness'), false)
  assert.deepEqual(
    recommend.agents.map((agent) => agent.id).sort(),
    ['rumi', 'social-ammo'],
  )
  const created = planCreateAgent(agents, { templateId: 'pet', title: '小鹿' }, [{ id: 'pet', enabled: true }], clock)
  assert.equal(created.ok, false)
})

test('无模块也会幂等长出默认主理人，不能解雇', () => {
  const first = upsertDefaultAgents([], [], clock)
  const host = first.find((agent) => agent.id === 'host')
  assert.ok(host)
  assert.equal(host?.templateId, 'host')
  assert.equal(canRemoveAgent(host!), false)
  const second = upsertDefaultAgents(first, [], clock)
  assert.equal(second.filter((agent) => agent.templateId === 'host').length, 1)
  assert.equal(second.find((agent) => agent.id === 'host')?.createdAt, host?.createdAt)
  const hired = planCreateAgent(first, { templateId: 'host', title: '另一位主理人' }, [], clock)
  assert.equal(hired.ok, false)
  assert.equal(hired.existingId, 'host')
  const dispatch = planDispatch('做调研', [host!], { implicitAgentId: 'host' })
  assert.equal(dispatch.actions[0]?.kind, 'invoke')
  assert.equal(dispatch.actions[0]?.invoke, 'research-brief')
  const ship = planDispatch('改代码', [host!], { implicitAgentId: 'host' })
  assert.equal(ship.actions[0]?.invoke, 'ship-change')
  const grill = planDispatch('问清楚', [host!], { implicitAgentId: 'host' })
  assert.equal(grill.actions[0]?.invoke, 'grill-change')
})

test('已有成员可以改工具包和计划模式', () => {
  const created = planCreateAgent([], { templateId: 'social-ammo', title: '社媒弹药手' }, [{ id: 'social-ammo', enabled: true }], clock)
  assert.ok(created.agent)
  const next = planConfigureAgent([created.agent], created.agent.id, {
    toolPacks: ['kernel', 'mcp-browser'],
    planMode: true,
  }, clock)
  assert.equal(next.ok, true)
  assert.deepEqual(next.ok ? next.agents[0]?.toolPacks : undefined, ['kernel', 'mcp-browser'])
  assert.equal(next.ok ? next.agents[0]?.planMode : undefined, true)
  const denied = planConfigureAgent([created.agent], 'missing', { toolPacks: ['kernel'], planMode: false }, clock)
  assert.equal(denied.ok, false)
})

test('@标题 能解析到 Agent，系统收件会话始终存在', () => {
  const rumi = sampleAgent({
    id: 'rumi',
    title: 'Rumi',
    templateId: 'blank',
    kind: 'conversational',
    singleton: false,
    moduleIds: [],
  })
  const agents = [sampleAgent(), rumi]
  const parsed = parseMentions('@社媒弹药手 装填弹药 @Rumi', agents)
  assert.deepEqual(parsed.agentIds, ['social-ammo', 'rumi'])
  assert.equal(parsed.rest, '装填弹药')
  const glued = parseMentions('@社媒弹药手装填弹药', agents)
  assert.deepEqual(glued.agentIds, ['social-ammo'])
  assert.equal(glued.rest, '装填弹药')
  const atCursor = mentionQueryAt('看看 @社', 6)
  assert.deepEqual(atCursor, { start: 3, query: '社' })
  assert.equal(filterMentionAgents('社', agents)[0]?.id, 'social-ammo')
  const prefer = filterMentionAgents('', agents, ['rumi', 'social-ammo'])
  assert.deepEqual(
    prefer.map((agent) => agent.id),
    ['rumi', 'social-ammo'],
  )
  const paused = sampleAgent({
    id: 'social-ammo',
    title: '社媒弹药手',
    templateId: 'social-ammo',
    kind: 'dashboard',
    moduleIds: ['social-ammo'],
    status: 'needs-module',
  })
  assert.equal(
    filterMentionAgents('', [rumi, paused]).some((agent) => agent.id === 'social-ammo'),
    false,
  )
  const spans = mentionSpans('@主理人 帮我更新 readme @社媒弹药手', [
    sampleAgent({ id: 'host', templateId: 'host', title: '主理人', moduleIds: [] }),
    paused,
  ])
  assert.deepEqual(
    spans.map((span) => (span.kind === 'text' ? span.text : `@${span.agent.title}:${span.agent.id}`)),
    ['@主理人:host', ' 帮我更新 readme ', '@社媒弹药手:social-ammo'],
  )
  const threads = ensureInboxThread([], clock)
  assert.equal(threads[0]?.id, INBOX_THREAD_ID)
})

test('换一个名字会跳过已经占用的', () => {
  assert.equal(pickAgentName(['Rumi', 'Mina'], 0), '阿宁')
})

test('空白 Agent 不依赖任何模块', () => {
  assert.equal(modulesReady([], [{ id: 'monitor', enabled: false }]), true)
  assert.equal(modulesReady(['monitor'], [{ id: 'monitor', enabled: false }]), false)
})

test('今日无 @：唯一口令唤人，问句不拆待办，其余才拆待办', () => {
  const ammo = sampleAgent()
  const load = planDispatch('装填弹药', [ammo])
  assert.equal(load.actions[0]?.kind, 'invoke')
  assert.equal(load.actions[0]?.invoke, 'load')
  assert.deepEqual(load.agentIds, ['social-ammo'])
  const asked = planDispatch('弹药怎么样', [ammo])
  assert.equal(asked.actions[0]?.kind, 'miss')
  assert.match(inboxMissReply(asked.actions[0]?.text ?? ''), /没有拆成待办/)
  const task = planDispatch('明天下午交周报', [ammo])
  assert.equal(task.actions[0]?.kind, 'decompose')
})

test('未 @ 的普通事项拆成待办，多 @ 先转发；空白 Agent 走对话', () => {
  const none = planDispatch('明天下午交周报', [])
  assert.equal(none.actions[0]?.kind, 'decompose')

  const rumi = sampleAgent({
    id: 'rumi',
    title: 'Rumi',
    templateId: 'blank',
    kind: 'conversational',
    singleton: false,
    moduleIds: [],
    description: '通用助手。用对话把事情说清楚。',
  })
  const many = planDispatch('@社媒弹药手 装填弹药 @Rumi', [sampleAgent(), rumi])
  assert.equal(many.actions[0]?.kind, 'forward')
  assert.ok(many.actions.some((action) => action.kind === 'invoke' && action.invoke === 'load'))
  assert.ok(many.actions.some((action) => action.kind === 'chat' && action.agentId === 'rumi'))

  const implicit = planDispatch('把这段话说清楚', [rumi], { implicitAgentId: 'rumi' })
  assert.equal(implicit.actions[0]?.kind, 'chat')
  assert.deepEqual(implicit.agentIds, ['rumi'])
})

test('项目里问能力没 @ 时查到全部在场成员，不只主成员', () => {
  const host = sampleAgent({
    id: 'host',
    templateId: 'host',
    title: '主理人',
    mark: '主',
    kind: 'conversational',
    moduleIds: [],
    viewId: undefined,
  })
  const ammo = sampleAgent()
  const agents = [host, ammo]
  assert.deepEqual(
    rosterAgentsByIds(['host', 'missing', 'social-ammo'], agents).map((agent) => agent.id),
    ['host', 'social-ammo'],
  )
  const asked = planDispatch('你有什么能力', agents, {
    implicitAgentId: 'host',
    projectAgentIds: ['host', 'social-ammo'],
  })
  assert.deepEqual(asked.agentIds, ['host', 'social-ammo'])
  assert.equal(asked.actions[0]?.kind, 'forward')
  assert.deepEqual(asked.actions[0]?.agentIds, ['host', 'social-ammo'])
  const capability = skillMissReply(ammo, '你有什么能力')
  assert.match(capability, /装填弹药/)
  assert.match(capability, /社媒弹药手/)
  assert.doesNotMatch(capability, /social_load/)

  const work = planDispatch('装填弹药', agents, {
    implicitAgentId: 'social-ammo',
    projectAgentIds: ['host', 'social-ammo'],
  })
  assert.deepEqual(work.agentIds, ['social-ammo'])
  assert.equal(work.actions[0]?.kind, 'invoke')
  assert.equal(work.actions[0]?.agentId, 'social-ammo')
})

test('推荐 Agent 按最近会话排，/ 技能能插入 @刷新', () => {
  const rumi = sampleAgent({
    id: 'rumi',
    title: 'Rumi',
    templateId: 'blank',
    kind: 'conversational',
    singleton: false,
    moduleIds: [],
    updatedAt: '2026-09-10T02:00:00.000Z',
  })
  const ranked = recommendAgents([sampleAgent(), rumi], [
    {
      id: 'thread:rumi',
      title: 'Rumi',
      kind: 'agent',
      agentIds: ['rumi'],
      createdAt: '2026-09-10T03:00:00.000Z',
      updatedAt: '2026-09-10T03:00:00.000Z',
    },
  ])
  assert.equal(ranked.agents[0]?.id, 'rumi')
  const slash = skillQueryAt('/刷', 2)
  assert.deepEqual(slash, { start: 0, query: '刷' })
  const skills = listComposerSkills('装', [sampleAgent(), rumi])
  assert.equal(skills[0]?.insert, '@社媒弹药手 装填弹药')
  const load = listComposerSkills('装填', [
    sampleAgent({
      id: 'social-ammo',
      title: '社媒弹药手',
      templateId: 'social-ammo',
      moduleIds: ['social-ammo'],
      viewId: 'social-ammo',
    }),
  ])
  assert.equal(load[0]?.insert, '@社媒弹药手 装填弹药')
})

test('默认弹药手会把旧的 monitor 面板改到独立弹药 Panel', () => {
  const stale = sampleAgent({
    id: 'social-ammo',
    templateId: 'social-ammo',
    title: '社媒弹药手',
    moduleIds: ['social-ammo'],
    viewId: 'monitor',
  })
  const next = upsertDefaultAgents([stale], [{ id: 'social-ammo', enabled: true }], clock)
  assert.equal(next.find((agent) => agent.id === 'social-ammo')?.viewId, 'social-ammo')
})

test('有 key 时说不清的职业话交给对话（工具目录在人设里），口令仍走 invoke', () => {
  const ammo = sampleAgent()
  const invoked = planDispatch('装填弹药', [ammo], { implicitAgentId: 'social-ammo' })
  assert.equal(invoked.actions[0]?.kind, 'invoke')
  assert.equal(promoteToClassify(invoked.actions, [ammo], { hasKey: true })[0]?.kind, 'invoke')
  assert.equal(promoteToClassify(invoked.actions, [ammo], { hasKey: false })[0]?.kind, 'invoke')

  const recap = planDispatch('帮我写几条文案', [ammo], { implicitAgentId: 'social-ammo' })
  assert.equal(recap.actions[0]?.kind, 'invoke')
  assert.equal(promoteToClassify(recap.actions, [ammo], { hasKey: true })[0]?.kind, 'chat')
  assert.equal(promoteToClassify(recap.actions, [ammo], { hasKey: false })[0]?.kind, 'invoke')

  const host = sampleAgent({
    id: 'host',
    title: '主理人',
    templateId: 'host',
    kind: 'conversational',
    moduleIds: [],
    description: '项目默认主成员。',
  })
  const talk = planDispatch('你好', [host], { implicitAgentId: 'host' })
  assert.equal(talk.actions[0]?.kind, 'chat')
  assert.equal(promoteToClassify(talk.actions, [host], { hasKey: true })[0]?.kind, 'chat')
})

test('赋能后的成员在主对话和项目里会 invoke 这条 Skill', () => {
  const rumi = sampleAgent({
    id: 'rumi',
    title: 'Rumi',
    templateId: 'blank',
    kind: 'conversational',
    singleton: false,
    moduleIds: [],
    skillIds: ['product-design'],
  })
  const implicit = planDispatch('做产品设计建议', [rumi], { implicitAgentId: 'rumi' })
  assert.equal(implicit.actions[0]?.kind, 'invoke')
  assert.equal(implicit.actions[0]?.invoke, 'product-design')
  const mentioned = planDispatch('@Rumi 做产品设计建议', [rumi])
  assert.equal(mentioned.actions[0]?.kind, 'invoke')
  assert.equal(mentioned.actions[0]?.invoke, 'product-design')
  assert.equal(promoteToClassify(implicit.actions, [rumi], { hasKey: true })[0]?.kind, 'chat')
  assert.equal(promoteToClassify(implicit.actions, [rumi], { hasKey: false })[0]?.kind, 'invoke')
  assert.match(agentSystemPrompt(rumi), /产品设计建议/)
  assert.match(agentSystemPrompt(rumi), /不要编造用户没给的调研数字/)
  const chips = occupationSkillChoices(rumi).map((skill) => skill.title)
  assert.equal(chips.includes('产品设计建议'), true)
})

test('花名册按 sortOrder 排，缺省先按最近活动再钉死顺序', () => {
  const rumi = sampleAgent({
    id: 'rumi',
    title: 'Rumi',
    templateId: 'blank',
    kind: 'conversational',
    origin: 'user',
    singleton: false,
    moduleIds: [],
    updatedAt: '2026-09-12T10:00:00.000Z',
  })
  const mina = sampleAgent({
    id: 'mina',
    title: 'Mina',
    templateId: 'blank',
    kind: 'conversational',
    origin: 'user',
    singleton: false,
    moduleIds: [],
    updatedAt: '2026-09-11T10:00:00.000Z',
  })
  const stamped = ensureRosterSortOrder([rumi, mina])
  assert.deepEqual(
    stamped.map((agent) => [agent.id, agent.sortOrder]),
    [
      ['rumi', 0],
      ['mina', 1],
    ],
  )
  const moved = planReorderAgents(stamped, ['mina', 'rumi'])
  assert.equal(moved.ok, true)
  if (moved.ok) {
    assert.deepEqual(
      visibleAgents(moved.agents).map((agent) => agent.id),
      ['mina', 'rumi'],
    )
  }
  const host = sampleAgent({
    id: 'host',
    templateId: 'host',
    title: '主理人',
    kind: 'conversational',
    origin: 'builtin-default',
    moduleIds: [],
    status: 'ready',
    sortOrder: 0,
    updatedAt: '2026-09-11T10:00:00.000Z',
  })
  const ammo = sampleAgent({
    sortOrder: 2,
    updatedAt: '2026-09-11T10:00:00.000Z',
  })
  const woven = planReorderAgents([host, ammo], ['social-ammo', 'host'])
  assert.equal(woven.ok, true)
  if (woven.ok) {
    assert.deepEqual(
      [...woven.agents]
        .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
        .map((agent) => agent.id),
      ['social-ammo', 'host'],
    )
  }
  const renamed = planRenameAgent(stamped, [], 'rumi', '  阿宁  ', clock)
  assert.equal(renamed.ok, true)
  if (renamed.ok) {
    assert.equal(renamed.agents.find((agent) => agent.id === 'rumi')?.title, '阿宁')
  }
  assert.equal(canRemoveAgent(rumi), true)
  assert.equal(canRemoveAgent(sampleAgent()), false)
  const home = {
    id: 'thread:rumi',
    title: 'Rumi',
    kind: 'agent' as const,
    agentIds: ['rumi'],
    createdAt: clock.now(),
    updatedAt: clock.now(),
  }
  const project = {
    id: 'thread:user:poem',
    title: '古诗',
    kind: 'user' as const,
    agentIds: ['rumi', 'mina'],
    workspaceAgentId: 'rumi',
    createdAt: clock.now(),
    updatedAt: clock.now(),
  }
  const removed = planRemoveAgent(
    [rumi, mina],
    [home, project],
    [{ id: 'msg-1', threadId: home.id, role: 'user', text: 'hi', createdAt: clock.now() }],
    'rumi',
  )
  assert.equal(removed.ok, true)
  if (removed.ok) {
    assert.deepEqual(
      removed.agents.map((agent) => agent.id),
      ['mina'],
    )
    assert.equal(
      removed.threads.some((thread) => thread.id === home.id),
      false,
    )
    assert.deepEqual(removed.threads[0]?.agentIds, ['mina'])
    assert.equal(removed.threads[0]?.workspaceAgentId, 'mina')
    assert.equal(removed.messages.length, 0)
  }
})

test('成员回复可单独记下思考过程', () => {
  const message = appendMessage(
    [],
    {
      threadId: 'thread:user:demo',
      role: 'agent',
      agentId: 'monitor',
      text: '态势已刷新。',
      thinking: 'The tool has been executed.',
    },
    clock,
  )
  assert.equal(message.text, '态势已刷新。')
  assert.equal(message.thinking, 'The tool has been executed.')
  assert.equal(
    appendMessage([], { threadId: 'thread:user:demo', role: 'agent', text: '好' }, clock).thinking,
    undefined,
  )
})
