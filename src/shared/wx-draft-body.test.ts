import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyWxDraftBodyEdits,
  formatBodyRevisionMessage,
  parseWxDraftBodyEdits,
  reviseWxDraftBodyLocal,
  stripOrphanMarkdown,
} from './wx-draft-body.ts'

test('成对加粗、标题、链接、围栏原样保留', () => {
  const src = [
    '# 开学第一件大事',
    '',
    '先给结论：能让导师对你增加好感的，就三个词——**学习态度、学习能力、科研能力**。',
    '',
    '![观测](/images/文中插图1.jpg)',
    '',
    '```ts',
    'const x = **not-bold**',
    '```',
  ].join('\n')
  const stripped = stripOrphanMarkdown(src)
  assert.equal(stripped.markdown, src)
  assert.equal(stripped.orphanMarks, 0)
})

test('去掉不成对的标记、行首无空格的 #、以及转不成格式的 _ ~~', () => {
  const stripped = stripOrphanMarkdown(
    [
      '#开学第一件大事',
      '',
      '这是一段 **未闭合加粗',
      '',
      '还有 _学习能力_ 和 ~~口头强调~~。',
      '',
      '价格是 $100，不要动。',
    ].join('\n'),
  )
  assert.equal(stripped.markdown.includes('#开学'), false)
  assert.match(stripped.markdown, /开学第一件大事/)
  assert.equal(stripped.markdown.includes('**'), false)
  assert.match(stripped.markdown, /这是一段 未闭合加粗/)
  assert.match(stripped.markdown, /还有 学习能力 和 口头强调。/)
  assert.match(stripped.markdown, /\$100/)
  assert.ok(stripped.orphanMarks > 0)
})

test('只套用短替换；段落改写和超长 from 丢掉', () => {
  const src = '没有特别拿得出手的成绩，还有救嘛？必须有。'
  const applied = applyWxDraftBodyEdits(src, [
    { kind: 'typo', from: '还有救嘛', to: '还有救吗' },
    { kind: 'typo', from: '没有特别拿得出手的成绩，还有救嘛？必须有。整句重写应被丢掉', to: '成绩一般也能证明自己。' },
    { kind: 'redline', from: '保证录取', to: '增加录取机会' },
  ])
  assert.equal(applied.markdown, '没有特别拿得出手的成绩，还有救吗？必须有。')
  assert.equal(applied.applied.length, 1)
  assert.equal(applied.applied[0]?.from, '还有救嘛')
})

test('解析模型 JSON：只收 redlines / typos', () => {
  const edits = parseWxDraftBodyEdits(
    [
      '```json',
      '{',
      '  "redlines": [{"from":"保证录取","to":"争取录取","reason":"效果承诺"}],',
      '  "typos": [{"from":"还有道么","to":"还有招么"}],',
      '  "rewrite": "整段重写会被丢掉"',
      '}',
      '```',
    ].join('\n'),
  )
  assert.deepEqual(
    edits.map((item) => item.from),
    ['保证录取', '还有道么'],
  )
})

test('本地校对先去标记再套短替换，进度文案不谈润色', () => {
  const revised = reviseWxDraftBodyLocal('#开学\n\n还有救嘛？', [{ kind: 'typo', from: '还有救嘛', to: '还有救吗' }])
  assert.equal(revised.markdown, '开学\n\n还有救吗？')
  assert.match(formatBodyRevisionMessage(revised), /未格式化标记/)
  assert.match(formatBodyRevisionMessage(revised), /错别字/)
  assert.match(formatBodyRevisionMessage(revised), /未改表意/)
  assert.equal(formatBodyRevisionMessage({ markdown: '原文', orphanMarks: 0, applied: [] }), '正文未改表意，无需校对')
})
