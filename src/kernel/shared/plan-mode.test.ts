import assert from 'node:assert/strict'
import test from 'node:test'
import { isExecutePlanPhrase, isPlanOnlyAsk, planOnlySystemPrompt, planSavedReply } from './plan-mode.ts'

test('计划口令与批准口令能对上', () => {
  assert.equal(isExecutePlanPhrase('按计划执行'), true)
  assert.equal(isExecutePlanPhrase('执行这份计划吧'), true)
  assert.equal(isExecutePlanPhrase('先看看再说'), false)
  assert.equal(isPlanOnlyAsk('先做个计划'), true)
  assert.equal(isPlanOnlyAsk('只要计划不要动手'), true)
  assert.match(planOnlySystemPrompt(), /按计划执行/)
  assert.match(planSavedReply('1. 读 README'), /按计划执行/)
})
