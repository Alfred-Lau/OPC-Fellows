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

function agent(overrides: Partial<AgentRecord> = {}): AgentRecord {
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

const roster = {
  ammo: agent(),
  host: agent({
    id: 'host',
    title: '主理人',
    templateId: 'host',
    kind: 'conversational',
    moduleIds: [],
    viewId: undefined,
    description: '项目默认主成员。',
  }),
} as const

function promoted(member: AgentRecord, text: string, hasKey: boolean) {
  const dispatched = planDispatch(text, [member], { implicitAgentId: member.id })
  return {
    raw: dispatched.actions[0],
    next: promoteToClassify(dispatched.actions, [member], { hasKey })[0],
  }
}

test('金句：有 key 时读句进 Agent Loop，零歧义写口令仍走 bridge', () => {
  const cases: Array<[keyof typeof roster, string, 'invoke' | 'chat']> = [
    ['ammo', '装填弹药', 'invoke'],
    ['ammo', '帮我写几条文案', 'chat'],
    ['ammo', '哪些帖比较热', 'chat'],
    ['host', '你好', 'chat'],
  ]
  for (const [key, text, kind] of cases) {
    const member = roster[key]
    const { next } = promoted(member, text, true)
    assert.equal(next?.kind, kind, `${member.title} 「${text}」有 key`)
  }
})

test('金句：无 key 时读句仍走 Trigger 兜底 invoke；今日口令唤人、问句不拆待办', () => {
  const { next } = promoted(roster.ammo, '帮我写几条文案', false)
  assert.equal(next?.kind, 'invoke')
  assert.equal(next?.invoke, 'load')
  const inboxAsk = planDispatch('弹药怎么样', [roster.ammo])
  assert.equal(inboxAsk.actions[0]?.kind, 'miss')
  const inboxPhrase = planDispatch('装填弹药', [roster.ammo])
  assert.equal(inboxPhrase.actions[0]?.kind, 'invoke')
  assert.equal(inboxPhrase.actions[0]?.invoke, 'load')
  const inboxTask = planDispatch('明天下午交周报', [roster.ammo])
  assert.equal(inboxTask.actions[0]?.kind, 'decompose')
})

test('职业 Skill 合同写进人设；miss 会列出能力而不是空菜单', () => {
  const skills = occupationSkills(roster.ammo)
  const load = skills.find((skill) => skill.id === 'load')
  const review = skills.find((skill) => skill.id === 'review')
  assert.equal(load?.artifact, 'Ammo')
  assert.equal(review?.phrase, '复盘热帖')
  assert.match(load?.missing ?? '', /工作情况/)
  const prompt = agentSystemPrompt(roster.ammo, [
    {
      name: 'social_load',
      description: '装填六平台弹药',
      moduleId: 'social-ammo',
      parameters: {},
    },
  ])
  assert.match(prompt, /本职 Skill/)
  assert.match(prompt, /social_load/)
  assert.match(prompt, /不要编数据/)
  const miss = skillMissReply(roster.ammo, '线上有没有动静')
  assert.match(miss, /装填弹药/)
  assert.match(miss, /复盘热帖/)
  assert.match(miss, /不会编/)
})
