import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentRecord } from './agent.ts'
import {
  agentHasSkill,
  holdersOfSkill,
  listWorkbenchSkills,
  matchAssignedWorkbenchSkill,
  planAssignSkill,
  planRevokeSkill,
  workbenchComposerSkills,
  workbenchInvokeId,
} from './workbench-skills.ts'

const clock = { now: () => '2026-09-10T01:00:00.000Z' }

function financeAgent(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: 'payments',
    templateId: 'payments',
    title: '财务顾问',
    mark: '收',
    description: '看账',
    hue: 1,
    kind: 'dashboard',
    origin: 'builtin-default',
    moduleIds: ['payments'],
    viewId: 'payments',
    workspaceName: '收款',
    singleton: true,
    status: 'ready',
    createdAt: clock.now(),
    updatedAt: clock.now(),
    ...overrides,
  }
}

test('技能页先收建议 Skill，产品设计组复用选品的评估和扫描', () => {
  const titles = listWorkbenchSkills().map((skill) => skill.title)
  assert.deepEqual(titles, [
    '投资建议',
    'OPC 建议',
    '网站建议',
    '合作设计优化',
    '产品设计建议',
    '评估 idea',
    '扫描痛点',
    '调研综合',
    '验证闭环',
    '问清楚',
    '改代码',
    '先写测试',
    '审查改动',
    '排查',
  ])
  const product = listWorkbenchSkills().filter((skill) => skill.group === '产品设计')
  assert.equal(product.some((skill) => skill.occupationId === 'review'), true)
  assert.equal(product.some((skill) => skill.occupationId === 'scan'), true)
  const kernel = listWorkbenchSkills().filter((skill) => skill.group === '执行')
  assert.deepEqual(
    kernel.map((skill) => skill.id),
    ['research-brief', 'verify-loop', 'grill-change', 'ship-change', 'tdd', 'code-review', 'diagnose-bug'],
  )
})

test('赋能写进成员 skillIds，撤下后清掉；/ 只插入已赋能的人', () => {
  const finance = financeAgent()
  const assigned = planAssignSkill([finance], 'payments', 'invest-advice', clock)
  assert.equal(assigned.ok, true)
  const holder = assigned.agents?.[0]
  assert.ok(holder)
  assert.equal(agentHasSkill(holder, 'invest-advice'), true)
  assert.equal(holdersOfSkill(assigned.agents ?? [], 'invest-advice')[0]?.id, 'payments')
  const composer = workbenchComposerSkills(assigned.agents ?? [])
  assert.equal(composer.some((skill) => skill.insert === '@财务顾问 做投资建议'), true)
  assert.equal(workbenchComposerSkills([finance]).length, 0)
  const revoked = planRevokeSkill(assigned.agents ?? [], 'payments', 'invest-advice', clock)
  assert.equal(revoked.agents?.[0]?.skillIds, undefined)
})

test('赋能后按口令命中；有职业 SOP 时 invoke 走原来的 id', () => {
  const finance = financeAgent({ skillIds: ['invest-advice'] })
  assert.equal(matchAssignedWorkbenchSkill(finance, '帮我做投资建议')?.id, 'invest-advice')
  const review = listWorkbenchSkills().find((skill) => skill.id === 'review-idea')
  assert.ok(review)
  assert.equal(workbenchInvokeId(review, true), 'review')
  assert.equal(workbenchInvokeId(review, false), 'review-idea')
})
