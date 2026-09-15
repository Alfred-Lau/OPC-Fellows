import assert from 'node:assert/strict'
import test from 'node:test'
import {
  decodeRfc2047,
  defaultMailLabel,
  formatMailWeekLabel,
  groupMailByWeek,
  lookupMailQuery,
  mailSenderEmail,
  mergeMailMessages,
  normalizeWatchedSender,
  parseImapFetchBlocks,
  parseImapSearchIds,
  parseMailHeaders,
  parseMailTriage,
  pinWatchedMail,
  quoteImapString,
  searchMailMessages,
  type MailMessage,
} from './mail.ts'

function sample(partial: Partial<MailMessage>): MailMessage {
  return {
    id: 'm1',
    accountId: 'acc',
    provider: 'gmail',
    uid: '1',
    messageId: '<a@x>',
    from: 'Ada <ada@example.com>',
    to: 'me@example.com',
    subject: '开学邮件怎么写',
    date: '2026-09-15T00:00:00.000Z',
    snippet: '导师邮件',
    unread: true,
    triage: 'open',
    ...partial,
  }
}

test('专用密码提示按提供商区分', () => {
  assert.equal(defaultMailLabel('gmail', 'me@gmail.com'), 'Gmail · me@gmail.com')
  assert.equal(defaultMailLabel('local'), '本机邮箱')
})

test('RFC 2047 标题能解开', () => {
  assert.equal(decodeRfc2047('=?UTF-8?B?5a2m5Lmg5oCB5bqm?='), '学习态度')
  assert.equal(decodeRfc2047('plain'), 'plain')
})

test('邮件头折叠行与字段解析', () => {
  const headers = parseMailHeaders('From: Ada\r\n <ada@x.com>\r\nSubject: Hi\r\n\r\n')
  assert.match(headers.from ?? '', /Ada/)
  assert.equal(headers.subject, 'Hi')
})

test('IMAP 字符串转义引号', () => {
  assert.equal(quoteImapString('a"b\\c'), '"a\\"b\\\\c"')
})

test('分流词只认邮件处置，不改表意', () => {
  assert.equal(parseMailTriage('归档第三条'), 'archive')
  assert.equal(parseMailTriage('跟进这封'), 'follow')
  assert.equal(parseMailTriage('忽略广告'), 'ignore')
  assert.equal(parseMailTriage('随便看看'), undefined)
})

test('查信问句抽出关键词', () => {
  assert.equal(lookupMailQuery('查邮件 导师'), '导师')
})

test('合并时保留已有分流', () => {
  const prev = [sample({ triage: 'follow', snippet: '旧' })]
  const next = mergeMailMessages(prev, [sample({ snippet: '新摘录', unread: false })])
  assert.equal(next[0]?.triage, 'follow')
  assert.equal(next[0]?.snippet, '新摘录')
})

test('IMAP SEARCH / FETCH 只取序号和信头', () => {
  assert.deepEqual(parseImapSearchIds('* SEARCH 1 2 9\r\n'), [1, 2, 9])
  const fetched = parseImapFetchBlocks(
    '* 9 FETCH (FLAGS (\\Seen) BODY[HEADER.FIELDS (FROM SUBJECT)] {32}\r\nFrom: Ada\r\nSubject: Hi\r\n\r\n)\r\n',
  )
  assert.equal(fetched[0]?.headers.from, 'Ada')
  assert.equal(fetched[0]?.headers.subject, 'Hi')
})

test('搜索命中发件人和主题', () => {
  const hits = searchMailMessages([sample({})], 'Ada')
  assert.equal(hits.length, 1)
  assert.deepEqual(searchMailMessages([sample({})], '不存在'), [])
})

test('发件人地址从尖括号里抽出，关注名单按邮箱归一', () => {
  assert.equal(mailSenderEmail('Ada <ada@x.com>'), 'ada@x.com')
  assert.equal(normalizeWatchedSender('Ada <Ada@X.com>'), 'ada@x.com')
  const now = new Date('2026-09-15T12:00:00')
  const pinned = pinWatchedMail(
    [
      sample({ id: 'm1', from: 'Ada <ada@x.com>', date: '2026-09-15T10:00:00.000Z' }),
      sample({ id: 'm2', from: '财务 <bill@x.com>', date: '2026-09-08T10:00:00.000Z' }),
    ],
    ['ada@x.com'],
  )
  assert.deepEqual(pinned.watched.map((item) => item.id), ['m1'])
  assert.deepEqual(pinned.rest.map((item) => item.id), ['m2'])
  assert.match(formatMailWeekLabel('2026-09-14', now), /本周/)
  const weeks = groupMailByWeek([...pinned.watched, ...pinned.rest], now)
  assert.equal(weeks[0]?.label.includes('本周'), true)
  assert.equal(weeks[1]?.messages[0]?.id, 'm2')
})
