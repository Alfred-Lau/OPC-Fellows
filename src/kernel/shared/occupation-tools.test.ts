import assert from 'node:assert/strict'
import test from 'node:test'
import {
  flagArg,
  occupationInvokeSpec,
  occupationToolForInvoke,
  parseFlagArg,
  parsePinnedArg,
  pinnedArg,
} from './occupation-tools.ts'

test('口令映射到社媒弹药工具', () => {
  assert.equal(occupationToolForInvoke('load'), 'social_load')
  assert.equal(occupationToolForInvoke('publish'), 'social_publish')
  assert.equal(occupationToolForInvoke('metrics'), 'social_metrics')
  assert.equal(occupationInvokeSpec('review')?.reveal?.kind, 'social')
  assert.equal(occupationInvokeSpec('unknown'), undefined)
})

test('钉死 id 和布尔参数走字符串表', () => {
  assert.equal(pinnedArg(['a', 'b']), 'a,b')
  assert.deepEqual(parsePinnedArg('a, b,,c'), ['a', 'b', 'c'])
  assert.deepEqual(parsePinnedArg(''), [])
  assert.equal(flagArg(true), 'true')
  assert.equal(parseFlagArg('true'), true)
  assert.equal(parseFlagArg('no'), false)
})
