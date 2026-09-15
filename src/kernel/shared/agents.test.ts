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
    id: 'monitor',
    templateId: 'monitor',
    title: '项目监控官',
    mark: '监',
    description: '盯态势',
    hue: 3,
    kind: 'dashboard',
    origin: 'builtin-default',
    moduleIds: ['monitor'],
    viewId: 'monitor',
    workspaceName: '项目监控',
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
  assert.equal(templateForModule('micro')?.defaultAgentId, 'micro-sourcing')
  assert.equal(templateForModule('monitor')?.defaultAgentId, 'monitor')
  assert.equal(templateForModule('payments')?.defaultAgentId, 'payments')
  assert.equal(templateForModule('wxhub')?.defaultAgentId, 'wxhub')
  assert.equal(templateForModule('mail')?.defaultAgentId, 'mail')
  assert.equal(templateForModule('growth')?.defaultAgentId, 'growth')
  assert.equal(listedTemplates().some((template) => template.id === 'harness'), false)
  assert.equal(listedTemplates().some((template) => template.id === 'pet'), false)
  assert.equal(listedTemplates().some((template) => template.id === 'host'), false)
})

test('启用的内置模块会幂等长出默认 Agent，停用后变成 needs-module', () => {
  const modules: ModulePresence[] = [
    { id: 'monitor', enabled: true },
    { id: 'payments', enabled: false },
    { id: 'notes', enabled: true },
  ]
  const first = upsertDefaultAgents([], modules, clock)
  assert.equal(first.find((agent) => agent.id === 'host')?.title, '主理人')
  assert.equal(first.find((agent) => agent.id === 'host')?.origin, 'builtin-default')
  assert.deepEqual(first.find((agent) => agent.id === 'host')?.toolPacks, [
    'kernel',
    'workspace',
    'mcp-github',
    'mcp-browser',
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
  assert.equal(first.find((agent) => agent.id === 'monitor')?.status, 'ready')
  assert.equal(first.find((agent) => agent.id === 'payments')?.status, 'needs-module')
  assert.equal(first.find((agent) => agent.id === 'notes')?.title, '随手记')
  const second = upsertDefaultAgents(first, modules, clock)
  assert.equal(second.filter((agent) => agent.id === 'monitor').length, 1)
})

test('雇佣达人拆成账号和弹药手，已在则不再摊平第三份', () => {
  const modules: ModulePresence[] = [
    { id: 'accounts', enabled: true },
    { id: 'social-ammo', enabled: true },
    { id: 'x-push', enabled: true },
  ]
  const hired = planCreateAgent([], { templateId: 'creator', title: '自媒体运营达人' }, modules, clock)
  assert.equal(hired.ok, true)
  assert.equal(hired.agent?.id, 'accounts')
  assert.equal(hired.agent?.templateId, 'accounts')
  assert.deepEqual(hired.agents?.map((agent) => agent.id), ['accounts', 'social-ammo'])
  assert.equal(hired.agents?.some((agent) => agent.templateId === 'creator'), false)
  assert.equal(hired.agents?.[1]?.moduleIds.includes('x-push'), false)

  const again = planCreateAgent(hired.agents ?? [], { templateId: 'creator', title: '自媒体运营达人' }, modules, clock)
  assert.equal(again.ok, true)
  assert.deepEqual(again.agents?.map((agent) => agent.id), ['accounts', 'social-ammo'])
  assert.equal(again.agent?.id, 'accounts')
  assert.equal(again.agents?.[0]?.createdAt, hired.agents?.[0]?.createdAt)
})

test('遗留摊平达人只按账号 Skill 匹配，复盘不能抢词', () => {
  const leftover = sampleAgent({
    id: 'creator-flat',
    templateId: 'creator',
    title: '自媒体运营达人',
    moduleIds: ['accounts', 'social-ammo', 'x-push'],
    viewId: 'accounts',
    singleton: false,
  })
  const review = planDispatch('复盘热帖', [leftover], { implicitAgentId: 'creator-flat' })
  assert.equal(review.actions[0]?.kind, 'miss')
  const create = planDispatch('建档账号', [leftover], { implicitAgentId: 'creator-flat' })
  assert.equal(create.actions[0]?.kind, 'invoke')
  assert.equal(create.actions[0]?.invoke, 'create')
  const skills = listComposerSkills('', [leftover])
  assert.ok(skills.some((skill) => skill.insert === '@自媒体运营达人 建档账号'))
  assert.equal(skills.some((skill) => skill.insert.includes('装填弹药')), false)
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
  const result = planCreateAgent(agents, { templateId: 'monitor', title: '另一个监工' }, [{ id: 'monitor', enabled: true }], clock)
  assert.equal(result.ok, false)
  assert.equal(result.existingId, 'monitor')
})

test('空白和多实例模板可以新建；克隆单例被拒绝', () => {
  const blank = planCreateAgent([], { templateId: 'blank', title: 'Rumi' }, [], clock)
  assert.equal(blank.ok, true)
  assert.equal(blank.agent?.kind, 'conversational')
  assert.equal(blank.agent?.origin, 'user')
  assert.deepEqual(blank.agent?.toolPacks, ['kernel', 'workspace'])
  assert.equal(blank.agent?.planMode, undefined)

  const micro = planCreateAgent([], { templateId: 'micro', title: '第二雷达' }, [{ id: 'micro', enabled: true }], clock)
  assert.equal(micro.ok, true)
  assert.equal(micro.agent?.moduleIds.includes('micro'), true)

  const cloned = planCreateAgent(
    [sampleAgent()],
    { templateId: 'blank', title: '监工副本', cloneFrom: 'monitor' },
    [{ id: 'monitor', enabled: true }],
    clock,
  )
  assert.equal(cloned.ok, false)
  assert.equal(cloned.existingId, 'monitor')
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
  assert.ok(recommend.templates.some((template) => template.id === 'blank'))
  assert.ok(recommend.templates.some((template) => template.id === 'engineer'))
  assert.equal(recommend.templates.some((template) => template.id === 'host'), false)
  assert.ok(recommend.templates.some((template) => template.id === 'creator'))
  assert.equal(recommend.templates.some((template) => template.id === 'pet'), false)
  assert.equal(recommend.templates.some((template) => template.id === 'harness'), false)
  assert.deepEqual(
    recommend.agents.map((agent) => agent.id).sort(),
    ['monitor', 'rumi'],
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

test('工程成员默认打开工作区、GitHub、浏览器和计划模式', () => {
  const created = planCreateAgent([], { templateId: 'engineer', title: '程心' }, [], clock)
  assert.equal(created.ok, true)
  assert.deepEqual(created.agent?.toolPacks, ['kernel', 'workspace', 'mcp-github', 'mcp-browser'])
  assert.equal(created.agent?.planMode, true)
  assert.deepEqual(created.agent?.skillIds, [
    'research-brief',
    'verify-loop',
    'grill-change',
    'ship-change',
    'tdd',
    'code-review',
    'diagnose-bug',
  ])
  const trimmed = planCreateAgent(
    [],
    { templateId: 'engineer', title: '只读程', extraToolPacks: ['kernel'], planMode: false },
    [],
    clock,
  )
  assert.deepEqual(trimmed.agent?.toolPacks, ['kernel'])
  assert.equal(trimmed.agent?.planMode, undefined)
  const dispatch = planDispatch('做调研', [created.agent!], { implicitAgentId: created.agent!.id })
  assert.equal(dispatch.actions[0]?.kind, 'invoke')
  assert.equal(dispatch.actions[0]?.invoke, 'research-brief')
  const ship = planDispatch('改代码', [created.agent!], { implicitAgentId: created.agent!.id })
  assert.equal(ship.actions[0]?.kind, 'invoke')
  assert.equal(ship.actions[0]?.invoke, 'ship-change')
  const tdd = planDispatch('先写测试', [created.agent!], { implicitAgentId: created.agent!.id })
  assert.equal(tdd.actions[0]?.invoke, 'tdd')
  assert.match(agentSystemPrompt(created.agent!, [{ name: 'agent_delegate', description: '子循环', moduleId: 'workspace', parameters: {} }]), /agent_delegate/)
  assert.match(agentSystemPrompt(created.agent!), /先出计划/)
  assert.match(
    agentSystemPrompt(created.agent!, [{ name: 'apply_patch', description: '补丁', moduleId: 'workspace', parameters: {} }]),
    /红绿/,
  )
})

test('已有成员可以改工具包和计划模式', () => {
  const created = planCreateAgent([], { templateId: 'blank', title: 'Rumi' }, [], clock)
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
  const agents = [
    sampleAgent(),
    sampleAgent({
      id: 'rumi',
      title: 'Rumi',
      templateId: 'blank',
      kind: 'conversational',
      singleton: false,
      moduleIds: [],
    }),
  ]
  const parsed = parseMentions('@项目监控官 这个月流量如何 @Rumi', agents)
  assert.deepEqual(parsed.agentIds, ['monitor', 'rumi'])
  assert.equal(parsed.rest, '这个月流量如何')
  const glued = parseMentions('@项目监控官刷新态势', agents)
  assert.deepEqual(glued.agentIds, ['monitor'])
  assert.equal(glued.rest, '刷新态势')
  const atCursor = mentionQueryAt('看看 @项', 6)
  assert.deepEqual(atCursor, { start: 3, query: '项' })
  assert.equal(filterMentionAgents('项', agents)[0]?.id, 'monitor')
  const prefer = filterMentionAgents('', agents, ['rumi', 'monitor'])
  assert.deepEqual(
    prefer.map((agent) => agent.id),
    ['rumi', 'monitor'],
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
    filterMentionAgents('', [...agents, paused]).some((agent) => agent.id === 'social-ammo'),
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
  const monitor = sampleAgent()
  const refresh = planDispatch('刷新态势', [monitor])
  assert.equal(refresh.actions[0]?.kind, 'invoke')
  assert.equal(refresh.actions[0]?.invoke, 'refresh')
  assert.deepEqual(refresh.agentIds, ['monitor'])
  const asked = planDispatch('这个月流量如何', [monitor])
  assert.equal(asked.actions[0]?.kind, 'miss')
  assert.match(inboxMissReply(asked.actions[0]?.text ?? ''), /没有拆成待办/)
  const task = planDispatch('明天下午交周报', [monitor])
  assert.equal(task.actions[0]?.kind, 'decompose')
  const rumi = sampleAgent({
    id: 'rumi',
    title: 'Rumi',
    templateId: 'blank',
    kind: 'conversational',
    singleton: false,
    moduleIds: [],
    skillIds: ['product-design'],
  })
  const advice = planDispatch('做产品设计建议', [rumi])
  assert.equal(advice.actions[0]?.kind, 'invoke')
  assert.equal(advice.actions[0]?.invoke, 'product-design')
  const twins = [
    sampleAgent({
      id: 'micro-a',
      title: '选品甲',
      templateId: 'micro',
      moduleIds: ['micro'],
      viewId: 'micro',
      singleton: false,
    }),
    sampleAgent({
      id: 'micro-b',
      title: '选品乙',
      templateId: 'micro',
      moduleIds: ['micro'],
      viewId: 'micro',
      singleton: false,
    }),
  ]
  const ambiguous = planDispatch('扫描痛点', twins)
  assert.equal(ambiguous.actions[0]?.kind, 'miss')
  assert.deepEqual(ambiguous.actions[0]?.agentIds, ['micro-a', 'micro-b'])
  assert.match(inboxMissReply('扫描痛点', twins, ambiguous.actions[0]?.agentIds), /选品甲/)
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
  const many = planDispatch('@项目监控官 刷新态势 @Rumi', [sampleAgent(), rumi])
  assert.equal(many.actions[0]?.kind, 'forward')
  assert.ok(many.actions.some((action) => action.kind === 'invoke' && action.invoke === 'refresh'))
  assert.ok(many.actions.some((action) => action.kind === 'chat' && action.agentId === 'rumi'))

  const implicit = planDispatch('把这段话说清楚', [rumi], { implicitAgentId: 'rumi' })
  assert.equal(implicit.actions[0]?.kind, 'chat')
  assert.deepEqual(implicit.agentIds, ['rumi'])
})

test('项目里问能力没 @ 时查到全部在场成员，不只主成员', () => {
  const monitor = sampleAgent()
  const micro = sampleAgent({
    id: 'micro-sourcing',
    templateId: 'micro',
    title: '选品策略师',
    mark: '选',
    kind: 'dashboard',
    moduleIds: ['micro'],
    viewId: 'micro',
  })
  const growth = sampleAgent({
    id: 'growth',
    templateId: 'growth',
    title: '增长黑客',
    mark: '增',
    hue: 8,
    kind: 'dashboard',
    moduleIds: ['growth'],
    viewId: 'growth',
  })
  const agents = [monitor, micro, growth]
  assert.deepEqual(
    rosterAgentsByIds(['monitor', 'missing', 'micro-sourcing', 'growth'], agents).map((agent) => agent.id),
    ['monitor', 'micro-sourcing', 'growth'],
  )
  const asked = planDispatch('你有什么能力', agents, {
    implicitAgentId: 'monitor',
    projectAgentIds: ['monitor', 'micro-sourcing', 'growth'],
  })
  assert.deepEqual(asked.agentIds, ['monitor', 'micro-sourcing', 'growth'])
  assert.equal(asked.actions[0]?.kind, 'forward')
  assert.deepEqual(asked.actions[0]?.agentIds, ['monitor', 'micro-sourcing', 'growth'])
  assert.equal(asked.actions.filter((action) => action.kind === 'miss').length, 3)
  const promoted = promoteToClassify(asked.actions, agents, { hasKey: true })
  assert.equal(promoted.filter((action) => action.kind === 'miss').length, 3)
  assert.equal(
    promoted.some((action) => action.kind === 'chat'),
    false,
  )
  const capability = skillMissReply(monitor, '你有什么能力')
  assert.match(capability, /刷新态势/)
  assert.match(capability, /项目监控官/)
  assert.doesNotMatch(capability, /台伴/)
  assert.doesNotMatch(capability, /站点流量/)
  assert.doesNotMatch(capability, /monitor_refresh/)

  const work = planDispatch('刷新态势', agents, {
    implicitAgentId: 'monitor',
    projectAgentIds: ['monitor', 'micro-sourcing', 'growth'],
  })
  assert.deepEqual(work.agentIds, ['monitor'])
  assert.equal(work.actions[0]?.kind, 'invoke')
  assert.equal(work.actions[0]?.agentId, 'monitor')
})

test('空白对话历史转成 LLM turns；随手记记下，Harness 不再当可 @ 的职业', () => {
  const rumi = sampleAgent({
    id: 'rumi',
    title: 'Rumi',
    templateId: 'blank',
    kind: 'conversational',
    singleton: false,
    moduleIds: [],
    description: '陪着把一件事说清楚。',
  })
  const notes = sampleAgent({
    id: 'notes',
    title: '随手记',
    templateId: 'notes',
    kind: 'conversational',
    moduleIds: ['notes'],
  })
  const harness = sampleAgent({
    id: 'harness',
    title: 'DeepSeek 工作台',
    templateId: 'harness',
    kind: 'window',
    moduleIds: ['harness'],
  })
  assert.match(agentSystemPrompt(rumi), /Rumi/)
  assert.match(agentSystemPrompt(rumi), new RegExp(PRODUCT_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.doesNotMatch(agentSystemPrompt(rumi), /台伴/)
  assert.match(agentSystemPrompt(rumi), new RegExp(DEEPSEEK_MODEL_LABEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(agentSystemPrompt(rumi, [], { cwd: '/tmp/申城' }), /\/tmp\/申城/)
  assert.match(agentSystemPrompt(rumi, [], { cwd: '/tmp/申城' }), /dsh-fs/)
  assert.match(
    agentSystemPrompt(notes, [
      {
        name: 'notes_add',
        description: '把一句话记到随手记',
        moduleId: 'notes',
        parameters: { text: { type: 'string', description: '要记下的原文' } },
      },
    ]),
    /notes_add/,
  )
  const note = planDispatch('买牛奶', [notes], { implicitAgentId: 'notes' })
  assert.equal(note.actions[0]?.kind, 'note')
  const mentioned = planDispatch('@DeepSeek 工作台 打开', [harness])
  assert.equal(mentioned.actions[0]?.kind, 'decompose')
  assert.deepEqual(
    chatTurns([
      { id: '1', threadId: 't', role: 'system', text: '已转发', createdAt: clock.now() },
      { id: '2', threadId: 't', role: 'user', text: '你好', createdAt: clock.now() },
      { id: '3', threadId: 't', role: 'agent', text: '在', agentId: 'rumi', createdAt: clock.now() },
    ]),
    [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '在' },
    ],
  )
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
  const skills = listComposerSkills('刷', [sampleAgent(), rumi])
  assert.equal(skills[0]?.insert, '@项目监控官 刷新态势')
  const advice = listComposerSkills('投资', [
    sampleAgent({
      id: 'payments',
      title: '财务顾问',
      templateId: 'payments',
      moduleIds: ['payments'],
      viewId: 'payments',
      skillIds: ['invest-advice'],
    }),
  ])
  assert.equal(advice[0]?.insert, '@财务顾问 做投资建议')
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

test('弹药手装填走 load；随手记找回走短结果', () => {
  const ammo = sampleAgent({
    id: 'social-ammo',
    title: '社媒弹药手',
    templateId: 'social-ammo',
    moduleIds: ['social-ammo'],
    viewId: 'social-ammo',
  })
  const notes = sampleAgent({
    id: 'notes',
    title: '随手记',
    templateId: 'notes',
    kind: 'conversational',
    moduleIds: ['notes'],
    viewId: 'notes',
  })
  const loaded = planDispatch('@社媒弹药手 装填弹药', [ammo])
  assert.equal(loaded.actions[0]?.kind, 'invoke')
  assert.equal(loaded.actions[0]?.invoke, 'load')
  const find = planDispatch('@随手记 找回 牛奶', [notes])
  assert.equal(find.actions[0]?.kind, 'invoke')
  assert.equal(find.actions[0]?.invoke, 'find')
  const recap = planDispatch('复盘热帖', [ammo], { implicitAgentId: 'social-ammo' })
  assert.equal(recap.actions[0]?.invoke, 'review')
})

test('增长黑客主对话开实验、诊断漏斗；今日问句不拆待办', () => {
  const growth = sampleAgent({
    id: 'growth',
    title: '增长黑客',
    templateId: 'growth',
    moduleIds: ['growth'],
    viewId: 'growth',
  })
  const diagnose = planDispatch('增长如何', [growth], { implicitAgentId: 'growth' })
  assert.equal(diagnose.actions[0]?.kind, 'invoke')
  assert.equal(diagnose.actions[0]?.invoke, 'diagnose')
  const opened = planDispatch('开实验 官网 CTA。假设：改按钮。', [growth], { implicitAgentId: 'growth' })
  assert.equal(opened.actions[0]?.invoke, 'experiment')
  const verdict = planDispatch('判实验 第一条 赢了', [growth], { implicitAgentId: 'growth' })
  assert.equal(verdict.actions[0]?.invoke, 'verdict')
  const loop = planDispatch('画增长环', [growth], { implicitAgentId: 'growth' })
  assert.equal(loop.actions[0]?.invoke, 'loop')
  const rank = planDispatch('排渠道 小红书 扩量', [growth], { implicitAgentId: 'growth' })
  assert.equal(rank.actions[0]?.invoke, 'rank')
  const ship = planDispatch('交接弹药', [growth], { implicitAgentId: 'growth' })
  assert.equal(ship.actions[0]?.invoke, 'ship')
  const miss = planDispatch('随便聊聊', [growth], { implicitAgentId: 'growth' })
  assert.equal(miss.actions[0]?.kind, 'miss')
  const choices = occupationSkillChoices(growth).map((skill) => skill.title)
  assert.deepEqual(choices, ['开实验', '判实验', '交接弹药', '画增长环', '排渠道', '诊断漏斗'])
  const inbox = planDispatch('增长如何', [growth])
  assert.equal(inbox.actions[0]?.kind, 'miss')
  assert.match(inboxMissReply(inbox.actions[0]?.text ?? '', [growth]), /没有拆成待办/)
})

test('选品策略师 Thread 里评估今日 idea；今日口令能唤人，问句不拆待办', () => {
  const micro = sampleAgent({
    id: 'micro-sourcing',
    title: '选品策略师',
    templateId: 'micro',
    moduleIds: ['micro'],
    viewId: 'micro',
    singleton: false,
  })
  const implicit = planDispatch('今天的产品 idea 是什么', [micro], { implicitAgentId: 'micro-sourcing' })
  assert.equal(implicit.actions[0]?.kind, 'invoke')
  assert.equal(implicit.actions[0]?.invoke, 'review')

  const mentioned = planDispatch('@选品策略师 今天的产品 idea 是什么', [micro])
  assert.equal(mentioned.actions[0]?.kind, 'invoke')
  assert.equal(mentioned.actions[0]?.invoke, 'review')

  const third = planDispatch('第三条怎么样', [micro], { implicitAgentId: 'micro-sourcing' })
  assert.equal(third.actions[0]?.kind, 'invoke')
  assert.equal(third.actions[0]?.invoke, 'review')

  const handoff = planDispatch('第三条立项', [micro], { implicitAgentId: 'micro-sourcing' })
  assert.equal(handoff.actions[0]?.kind, 'invoke')
  assert.equal(handoff.actions[0]?.invoke, 'handoff')

  const pipeline = planDispatch('盯着第三条', [micro], { implicitAgentId: 'micro-sourcing' })
  assert.equal(pipeline.actions[0]?.invoke, 'pipeline')

  const miss = planDispatch('随便聊聊', [micro], { implicitAgentId: 'micro-sourcing' })
  assert.equal(miss.actions[0]?.kind, 'miss')
  assert.match(skillMissReply(micro), /先点一条/)
  const choices = occupationSkillChoices(micro).map((skill) => skill.title)
  assert.deepEqual(choices, ['扫描痛点', '管线改判', '立项交接', '评估 idea'])

  const inbox = planDispatch('今天的产品 idea 是什么', [micro])
  assert.equal(inbox.actions[0]?.kind, 'miss')
  assert.equal(inbox.actions[0]?.agentId, undefined)
  const phrase = planDispatch('评估 idea', [micro])
  assert.equal(phrase.actions[0]?.kind, 'invoke')
  assert.equal(phrase.actions[0]?.invoke, 'review')
  assert.deepEqual(phrase.agentIds, ['micro-sourcing'])
  const scanInbox = planDispatch('扫一遍', [micro])
  assert.equal(scanInbox.actions[0]?.kind, 'invoke')
  assert.equal(scanInbox.actions[0]?.invoke, 'scan')

  const scan = planDispatch('扫一遍', [micro], { implicitAgentId: 'micro-sourcing' })
  assert.equal(scan.actions[0]?.kind, 'invoke')
  assert.equal(scan.actions[0]?.invoke, 'scan')
})

test('监控读流量不走刷新；微信问今日不焊成 refresh', () => {
  const monitor = sampleAgent()
  const wxhub = sampleAgent({
    id: 'wxhub',
    title: '微信情报官',
    templateId: 'wxhub',
    moduleIds: ['wxhub'],
    viewId: 'wxhub',
  })
  const traffic = planDispatch('这个月流量如何', [monitor], { implicitAgentId: 'monitor' })
  assert.equal(traffic.actions[0]?.kind, 'invoke')
  assert.equal(traffic.actions[0]?.invoke, 'traffic')

  const refresh = planDispatch('刷新态势', [monitor], { implicitAgentId: 'monitor' })
  assert.equal(refresh.actions[0]?.invoke, 'refresh')

  const today = planDispatch('今天要处理什么', [wxhub], { implicitAgentId: 'wxhub' })
  assert.equal(today.actions[0]?.invoke, 'today')

  const wxRefresh = planDispatch('刷新情报', [wxhub], { implicitAgentId: 'wxhub' })
  assert.equal(wxRefresh.actions[0]?.invoke, 'today')

  const finance = sampleAgent({
    id: 'payments',
    title: '财务顾问',
    templateId: 'payments',
    moduleIds: ['payments'],
    viewId: 'payments',
  })
  const read = planDispatch('现在 MRR', [finance], { implicitAgentId: 'payments' })
  assert.equal(read.actions[0]?.invoke, 'read')
})

test('问今天的项目数据要解读，不能 miss 成技能菜单', () => {
  const monitor = sampleAgent()
  const asked = planDispatch('我今天的项目数据如何？', [monitor], { implicitAgentId: 'monitor' })
  assert.equal(asked.actions[0]?.kind, 'invoke')
  assert.equal(asked.actions[0]?.invoke, 'traffic')
  const spoken = planDispatch('我这几个项目流量如何？', [monitor], { implicitAgentId: 'monitor' })
  assert.equal(spoken.actions[0]?.kind, 'invoke')
  assert.equal(spoken.actions[0]?.invoke, 'traffic')
  const ask = planDispatch('这几个项目如何', [monitor], { implicitAgentId: 'monitor' })
  assert.equal(ask.actions[0]?.kind, 'invoke')
  assert.equal(ask.actions[0]?.invoke, 'traffic')
  const family = planDispatch('流量怎么样', [monitor], { implicitAgentId: 'monitor' })
  assert.equal(family.actions[0]?.kind, 'invoke')
  assert.equal(family.actions[0]?.invoke, 'traffic')
  const mentioned = planDispatch('@项目监控官 我今天的项目数据如何？', [monitor])
  assert.equal(mentioned.actions[0]?.kind, 'invoke')
  assert.equal(mentioned.actions[0]?.invoke, 'traffic')
  const health = planDispatch('项目健康', [monitor], { implicitAgentId: 'monitor' })
  assert.equal(health.actions[0]?.invoke, 'health')
  const chat = planDispatch('随便聊聊', [monitor], { implicitAgentId: 'monitor' })
  assert.equal(chat.actions[0]?.kind, 'miss')
  const leftover = planDispatch('线上有没有动静', [monitor], { implicitAgentId: 'monitor' })
  assert.equal(leftover.actions[0]?.kind, 'miss')
  const classified = promoteMissToClassify(leftover.actions, [monitor], { hasKey: true })
  assert.equal(classified[0]?.kind, 'chat')
  const noKey = promoteMissToClassify(leftover.actions, [monitor], { hasKey: false })
  assert.equal(noKey[0]?.kind, 'miss')
  const idle = promoteMissToClassify(chat.actions, [monitor], { hasKey: true })
  assert.equal(idle[0]?.kind, 'chat')
})

test('各职业口语问业务要落到解读 Skill，不能 miss 成菜单', () => {
  const roster = {
    monitor: sampleAgent(),
    micro: sampleAgent({
      id: 'micro-sourcing',
      title: '选品策略师',
      templateId: 'micro',
      moduleIds: ['micro'],
      viewId: 'micro',
      singleton: false,
    }),
    payments: sampleAgent({
      id: 'payments',
      title: '财务顾问',
      templateId: 'payments',
      moduleIds: ['payments'],
      viewId: 'payments',
    }),
    wxhub: sampleAgent({
      id: 'wxhub',
      title: '微信情报官',
      templateId: 'wxhub',
      moduleIds: ['wxhub'],
      viewId: 'wxhub',
    }),
    mail: sampleAgent({
      id: 'mail',
      title: '邮件整理',
      templateId: 'mail',
      moduleIds: ['mail'],
      viewId: 'mail',
    }),
    ammo: sampleAgent({
      id: 'social-ammo',
      title: '社媒弹药手',
      templateId: 'social-ammo',
      moduleIds: ['social-ammo'],
      viewId: 'social-ammo',
    }),
    wxdraft: sampleAgent({
      id: 'wxdraft',
      title: '公众号编辑',
      templateId: 'wxdraft',
      moduleIds: ['wxdraft'],
      viewId: 'wxdraft',
      singleton: false,
    }),
    accounts: sampleAgent({
      id: 'accounts',
      title: '自媒体账号',
      templateId: 'accounts',
      moduleIds: ['accounts'],
      viewId: 'accounts',
    }),
    notes: sampleAgent({
      id: 'notes',
      title: '随手记',
      templateId: 'notes',
      kind: 'conversational',
      moduleIds: ['notes'],
      viewId: 'notes',
    }),
    growth: sampleAgent({
      id: 'growth',
      title: '增长黑客',
      templateId: 'growth',
      moduleIds: ['growth'],
      viewId: 'growth',
    }),
  } as const

  const cases: Array<[keyof typeof roster, string, string, string]> = [
    ['monitor', '我今天的项目数据如何？', 'invoke', 'traffic'],
    ['monitor', '我这几个项目流量如何？', 'invoke', 'traffic'],
    ['monitor', '这几个项目如何', 'invoke', 'traffic'],
    ['monitor', '帮忙盯一下站点', 'invoke', 'traffic'],
    ['monitor', '这些项目中流量最好的是什么', 'invoke', 'traffic'],
    ['monitor', '流量怎么样', 'invoke', 'traffic'],
    ['monitor', '这几个站访问量如何', 'invoke', 'traffic'],
    ['monitor', '仓库还健康吗', 'invoke', 'health'],
    ['micro', '今天有什么值得做的', 'invoke', 'review'],
    ['micro', '今天有什么痛点', 'invoke', 'review'],
    ['micro', '热榜怎么样了', 'invoke', 'review'],
    ['micro', '帮我看看今天的选题', 'invoke', 'review'],
    ['micro', '有什么好做的产品', 'invoke', 'review'],
    ['micro', '哪个 idea 最值得做', 'invoke', 'review'],
    ['payments', '这个月赚了多少', 'invoke', 'read'],
    ['payments', '收入怎么样', 'invoke', 'read'],
    ['payments', '财务情况如何', 'invoke', 'read'],
    ['payments', '本月营收', 'invoke', 'read'],
    ['payments', '账上还有多少', 'invoke', 'read'],
    ['wxhub', '今天有什么要跟进的', 'invoke', 'today'],
    ['wxhub', '微信那边怎么样', 'invoke', 'today'],
    ['wxhub', '今天有哪些商机', 'invoke', 'triage'],
    ['wxhub', '有没有人找我', 'invoke', 'today'],
    ['wxhub', '帮我看看今天的微信', 'invoke', 'today'],
    ['wxhub', '有谁还没回', 'invoke', 'reply'],
    ['wxhub', '最紧急的是哪条', 'invoke', 'today'],
    ['mail', '收件箱里有什么', 'invoke', 'mailbox'],
    ['mail', '有没有新邮件', 'invoke', 'mailbox'],
    ['mail', '查邮件 导师', 'invoke', 'find-mail'],
    ['mail', '接入邮箱', 'invoke', 'mail-access'],
    ['mail', '归档这封', 'invoke', 'sort-mail'],
    ['mail', '写回信', 'invoke', 'mail-reply'],
    ['ammo', '帮我写几条文案', 'invoke', 'load'],
    ['ammo', '有什么可以发的', 'invoke', 'load'],
    ['ammo', '今天发什么', 'invoke', 'load'],
    ['ammo', '弹药准备好了吗', 'invoke', 'load'],
    ['ammo', '哪些帖比较热', 'invoke', 'review'],
    ['ammo', '哪条最热', 'invoke', 'review'],
    ['wxdraft', '上次转稿成功了吗', 'invoke', 'history'],
    ['wxdraft', '草稿写好了吗', 'invoke', 'history'],
    ['wxdraft', '帮我发一篇公众号', 'invoke', 'draft'],
    ['wxdraft', '上次成功了吗', 'invoke', 'history'],
    ['accounts', '小红书今天数据怎么样', 'invoke', 'day-metrics'],
    ['accounts', '账号表现如何', 'invoke', 'day-metrics'],
    ['accounts', '粉丝涨了吗', 'invoke', 'day-metrics'],
    ['accounts', '今天发了什么', 'invoke', 'log'],
    ['notes', '上次那句话在哪', 'invoke', 'find'],
    ['notes', '把这个变成待办', 'invoke', 'promote'],
    ['notes', '帮我记一下明天开会', 'note', ''],
    ['growth', '增长如何', 'invoke', 'diagnose'],
    ['growth', '漏斗怎么样', 'invoke', 'diagnose'],
    ['growth', '开实验 官网 CTA。假设：改按钮。', 'invoke', 'experiment'],
    ['growth', '判实验 第一条 赢了', 'invoke', 'verdict'],
    ['growth', '画增长环 内容环：发帖 → GEO', 'invoke', 'loop'],
    ['growth', '排渠道 小红书 扩量 4分', 'invoke', 'rank'],
    ['growth', '交接弹药', 'invoke', 'ship'],
  ]

  for (const [key, text, kind, invoke] of cases) {
    const agent = roster[key]
    const asked = planDispatch(text, [agent], { implicitAgentId: agent.id })
    assert.equal(asked.actions[0]?.kind, kind, `${agent.title} 「${text}」`)
    if (invoke) {
      assert.equal(asked.actions[0]?.invoke, invoke, `${agent.title} 「${text}」`)
    }
  }

  for (const agent of Object.values(roster)) {
    if (agent.kind !== 'dashboard') {
      continue
    }
    const chat = planDispatch('随便聊聊', [agent], { implicitAgentId: agent.id })
    assert.equal(chat.actions[0]?.kind, 'miss', `${agent.title} 闲聊仍应 miss`)
  }

  const wxdraft = roster.wxdraft
  const identity = planDispatch('你是什么模型', [wxdraft], { implicitAgentId: wxdraft.id })
  assert.equal(identity.actions[0]?.kind, 'miss')
  const classified = promoteToClassify(identity.actions, [wxdraft], { hasKey: true })
  assert.equal(classified[0]?.kind, 'miss')
  const reply = skillMissReply(wxdraft, '你是什么模型')
  assert.match(reply, /公众号编辑/)
  assert.doesNotMatch(reply, /台伴/)
  assert.match(reply, new RegExp(DEEPSEEK_MODEL_LABEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(reply, /复查记录/)
  assert.equal(isSkillMissText(reply), false)
  assert.match(agentSystemPrompt(wxdraft), /红线词筛查/)
  assert.match(agentSystemPrompt(wxdraft), /表意不做任何调整/)
})

test('有 key 时说不清的职业话交给对话（工具目录在人设里），口令仍走 invoke', () => {
  const monitor = sampleAgent()
  const invoked = planDispatch('刷新态势', [monitor], { implicitAgentId: 'monitor' })
  assert.equal(invoked.actions[0]?.kind, 'invoke')
  assert.equal(promoteToClassify(invoked.actions, [monitor], { hasKey: true })[0]?.kind, 'invoke')
  assert.equal(promoteToClassify(invoked.actions, [monitor], { hasKey: false })[0]?.kind, 'invoke')

  const traffic = planDispatch('这个月流量如何', [monitor], { implicitAgentId: 'monitor' })
  assert.equal(traffic.actions[0]?.kind, 'invoke')
  assert.equal(promoteToClassify(traffic.actions, [monitor], { hasKey: true })[0]?.kind, 'chat')
  assert.equal(promoteToClassify(traffic.actions, [monitor], { hasKey: false })[0]?.kind, 'invoke')

  const rumi = sampleAgent({
    id: 'rumi',
    title: 'Rumi',
    templateId: 'blank',
    kind: 'conversational',
    singleton: false,
    moduleIds: [],
    description: '通用助手。',
  })
  const talk = planDispatch('你好', [rumi], { implicitAgentId: 'rumi' })
  assert.equal(talk.actions[0]?.kind, 'chat')
  assert.equal(promoteToClassify(talk.actions, [rumi], { hasKey: true })[0]?.kind, 'chat')

  const notes = sampleAgent({
    id: 'notes',
    title: '随手记',
    templateId: 'notes',
    kind: 'conversational',
    moduleIds: ['notes'],
  })
  const note = planDispatch('买牛奶', [notes], { implicitAgentId: 'notes' })
  assert.equal(note.actions[0]?.kind, 'note')
  assert.equal(promoteToClassify(note.actions, [notes], { hasKey: true })[0]?.kind, 'chat')
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
  const paused = sampleAgent({
    id: 'social-ammo',
    title: '社媒弹药手',
    templateId: 'social-ammo',
    kind: 'dashboard',
    origin: 'builtin-default',
    moduleIds: ['social-ammo'],
    status: 'needs-module',
    sortOrder: 1,
    updatedAt: '2026-09-11T10:00:00.000Z',
  })
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
  const monitor = sampleAgent({
    sortOrder: 2,
    updatedAt: '2026-09-11T10:00:00.000Z',
  })
  const woven = planReorderAgents([host, paused, monitor], ['monitor', 'host'])
  assert.equal(woven.ok, true)
  if (woven.ok) {
    assert.deepEqual(
      [...woven.agents]
        .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
        .map((agent) => agent.id),
      ['monitor', 'social-ammo', 'host'],
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
