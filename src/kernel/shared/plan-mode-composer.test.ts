import assert from 'node:assert/strict'
import test from 'node:test'
import {
  defaultComposerMode,
  offersComposerModes,
  resolveComposerTurn,
} from './plan-mode.ts'

test('只有工作区写工具或 planMode 的成员才显示开口三档', () => {
  assert.equal(offersComposerModes({ planMode: true }), true)
  assert.equal(offersComposerModes({ toolPacks: ['workspace'] }), true)
  assert.equal(offersComposerModes({ toolPacks: ['kernel'] }), false)
})

test('问和计划不允许写；按计划执行切到动手', () => {
  assert.equal(defaultComposerMode({ planMode: true }), 'plan')
  assert.equal(resolveComposerTurn({ userText: '看看现状？', requested: 'ask' }).writeAllowed, false)
  assert.equal(resolveComposerTurn({ userText: '先做个计划', agent: { planMode: true } }).mode, 'plan')
  assert.equal(resolveComposerTurn({ userText: '按计划执行' }).mode, 'agent')
  assert.equal(resolveComposerTurn({ userText: '按计划执行' }).writeAllowed, true)
})
