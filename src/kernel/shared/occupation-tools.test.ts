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

test('口令映射到 ctx.tools，覆盖读写职业 Skill', () => {
  assert.equal(occupationToolForInvoke('refresh'), 'monitor_refresh')
  assert.equal(occupationToolForInvoke('speed'), 'monitor_speed')
  assert.equal(occupationInvokeSpec('speed')?.reveal?.group, 'perf')
  assert.equal(occupationToolForInvoke('export'), 'payments_export')
  assert.equal(occupationToolForInvoke('draft'), 'wxdraft_ingest')
  assert.equal(occupationToolForInvoke('promote'), 'notes_promote')
  assert.equal(occupationToolForInvoke('mailbox'), 'mail_inbox')
  assert.equal(occupationInvokeSpec('sort-mail')?.reveal?.kind, 'mail')
  assert.equal(occupationInvokeSpec('unknown'), undefined)
  assert.equal(occupationInvokeSpec('health')?.reveal?.kind, 'monitor')
})

test('钉死 id 和布尔参数走字符串表', () => {
  assert.equal(pinnedArg(['a', 'b']), 'a,b')
  assert.deepEqual(parsePinnedArg('a, b,,c'), ['a', 'b', 'c'])
  assert.deepEqual(parsePinnedArg(''), [])
  assert.equal(flagArg(true), 'true')
  assert.equal(parseFlagArg('true'), true)
  assert.equal(parseFlagArg('no'), false)
})
