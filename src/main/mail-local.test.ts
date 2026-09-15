import assert from 'node:assert/strict'
import test from 'node:test'
import { describeOsascriptError, normalizeLocalDate, parseLocalInboxTsv } from './mail-local.ts'

test('本机邮件 TSV 按列拆出发件人和主题', () => {
  const rows = parseLocalInboxTsv(
    ['<a@x>\tAda <ada@x.com>\t开学邮件\tMonday, September 15, 2026 at 8:00:00 AM\tfalse', '\t\t\t\t'].join('\n'),
    'local-1',
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.from, 'Ada <ada@x.com>')
  assert.equal(rows[0]?.subject, '开学邮件')
  assert.equal(rows[0]?.unread, true)
  assert.equal(rows[0]?.provider, 'local')
})

test('本机邮件错误不把整段 osascript 命令甩给用户', () => {
  assert.match(
    describeOsascriptError({
      message: 'Command failed: osascript -e tell application "Mail" set rd to read status',
      stderr: '/tmp/x:279:281: script error: 预期是表达式，却找到“rd”。 (-2741)',
    }),
    /更新应用/,
  )
  assert.match(describeOsascriptError({ stderr: 'Not authorized to send Apple events (-1743)' }), /自动化/)
  assert.match(describeOsascriptError({ message: 'Command failed: osascript', code: 'ETIMEDOUT' }), /超时/)
})

test('本机邮件中文日期能收成 ISO', () => {
  assert.equal(normalizeLocalDate('2026-09-15T20:44:02').startsWith('2026-09-15T'), true)
  assert.equal(normalizeLocalDate('2026年9月15日 星期二 20:44:02').startsWith('2026-09-15T'), true)
})
