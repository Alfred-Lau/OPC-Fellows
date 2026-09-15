import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentRecord } from './agent.ts'
import {
  agentSystemPrompt,
  occupationSkills,
  planDispatch,
  promoteToClassify,
  skillMissReply,
} from './agents.ts'

const clock = { now: () => '2026-09-10T01:00:00.000Z' }

function agent(overrides: Partial<AgentRecord>): AgentRecord {
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

const roster = {
  monitor: agent({}),
  micro: agent({
    id: 'micro-sourcing',
    title: '选品策略师',
    templateId: 'micro',
    moduleIds: ['micro'],
    viewId: 'micro',
    singleton: false,
  }),
  payments: agent({
    id: 'payments',
    title: '财务顾问',
    templateId: 'payments',
    moduleIds: ['payments'],
    viewId: 'payments',
  }),
  growth: agent({
    id: 'growth',
    title: '增长黑客',
    templateId: 'growth',
    moduleIds: ['growth'],
    viewId: 'growth',
  }),
  ammo: agent({
    id: 'social-ammo',
    title: '社媒弹药手',
    templateId: 'social-ammo',
    moduleIds: ['social-ammo'],
    viewId: 'social-ammo',
  }),
  rumi: agent({
    id: 'rumi',
    title: 'Rumi',
    templateId: 'blank',
    kind: 'conversational',
    singleton: false,
    moduleIds: [],
    skillIds: ['product-design'],
    description: '通用助手。',
  }),
} as const

function promoted(member: AgentRecord, text: string, hasKey: boolean) {
  const dispatched = planDispatch(text, [member], { implicitAgentId: member.id })
  return {
    raw: dispatched.actions[0],
    next: promoteToClassify(dispatched.actions, [member], { hasKey })[0],
  }
}

test('金句：有 key 时读句和模糊写句进 Agent Loop，零歧义写口令仍走 bridge', () => {
  const cases: Array<[keyof typeof roster, string, 'invoke' | 'chat' | 'decompose']> = [
    ['monitor', '刷新态势', 'invoke'],
    ['monitor', '这个月流量如何', 'chat'],
    ['monitor', '仓库还健康吗', 'chat'],
    ['monitor', '这些项目中流量最好的是什么', 'chat'],
    ['micro', '扫描痛点', 'invoke'],
    ['micro', '扫一遍', 'invoke'],
    ['micro', '今天的产品 idea 是什么', 'chat'],
    ['micro', '盯着第三条', 'invoke'],
    ['payments', '同步心跳', 'invoke'],
    ['payments', '现在 MRR', 'chat'],
    ['payments', '这个月赚了多少', 'chat'],
    ['growth', '开实验 官网 CTA。假设：改按钮。', 'invoke'],
    ['growth', '增长如何', 'chat'],
    ['ammo', '装填弹药', 'invoke'],
    ['ammo', '帮我写几条文案', 'chat'],
    ['ammo', '哪些帖比较热', 'chat'],
    ['rumi', '做产品设计建议', 'chat'],
  ]
  for (const [key, text, kind] of cases) {
    const member = roster[key]
    const { next } = promoted(member, text, true)
    assert.equal(next?.kind, kind, `${member.title} 「${text}」有 key`)
  }
})

test('金句：无 key 时读句仍走 Trigger 兜底 invoke；今日口令唤人、问句不拆待办', () => {
  const { next } = promoted(roster.monitor, '这个月流量如何', false)
  assert.equal(next?.kind, 'invoke')
  assert.equal(next?.invoke, 'traffic')
  const inboxAsk = planDispatch('今天的产品 idea 是什么', [roster.micro])
  assert.equal(inboxAsk.actions[0]?.kind, 'miss')
  const inboxPhrase = planDispatch('评估 idea', [roster.micro])
  assert.equal(inboxPhrase.actions[0]?.kind, 'invoke')
  assert.equal(inboxPhrase.actions[0]?.invoke, 'review')
  const inboxTask = planDispatch('明天下午交周报', [roster.micro])
  assert.equal(inboxTask.actions[0]?.kind, 'decompose')
})

test('职业 Skill 合同写进人设；miss 会列出能力而不是空菜单', () => {
  const skills = occupationSkills(roster.monitor)
  const refresh = skills.find((skill) => skill.id === 'refresh')
  const traffic = skills.find((skill) => skill.id === 'traffic')
  const speed = skills.find((skill) => skill.id === 'speed')
  assert.equal(refresh?.artifact, 'Snapshot')
  assert.equal(speed?.phrase, '解读性能')
  assert.match(traffic?.missing ?? '', /刷新态势/)
  const prompt = agentSystemPrompt(roster.monitor, [
    {
      name: 'monitor_read',
      description: '解读已有态势',
      moduleId: 'monitor',
      parameters: {},
    },
  ])
  assert.match(prompt, /本职 Skill/)
  assert.match(prompt, /monitor_read/)
  assert.match(prompt, /不要编数据/)
  const miss = skillMissReply(roster.micro, '线上有没有动静')
  assert.match(miss, /评估 idea/)
  assert.match(miss, /扫描痛点/)
  assert.match(miss, /不会编/)
})
