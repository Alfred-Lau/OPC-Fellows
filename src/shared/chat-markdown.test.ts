import assert from 'node:assert/strict'
import test from 'node:test'
import {
  chatCodeStat,
  markdownFence,
  markdownTable,
  parseChatCodeMeta,
  renderChatMarkdown,
  shouldCollapseChatCode,
} from './chat-markdown.ts'

test('表格、代码和图片会变成对应标签', () => {
  const table = markdownTable(['#', 'Idea'], [['1', '切片']])
  const html = renderChatMarkdown(
    [
      '今日热榜 **2** 条：',
      '',
      table,
      '',
      markdownFence('const n = 1', 'ts'),
      '',
      '看 [示例](https://example.com/) 和 ![封面](https://example.com/cover.png)',
    ].join('\n'),
  )
  assert.match(html, /<table>/)
  assert.match(html, /data-row="1"/)
  assert.match(html, /class="is-pick"/)
  assert.match(html, /<th>Idea<\/th>/)
  assert.match(html, /<td>切片<\/td>/)
  assert.match(html, /<strong>2<\/strong>/)
  assert.match(html, /<pre><code class="lang-ts">const n = 1<\/code><\/pre>/)
  assert.match(html, /<a href="https:\/\/example\.com\/"/)
  assert.match(html, /<img src="https:\/\/example\.com\/cover\.png" alt="封面">/)
})

test('改文件的代码块收成卡片，默认只露几行', () => {
  assert.deepEqual(parseChatCodeMeta('20:22:src/kernel/shared/approval.test.ts'), {
    lang: 'ts',
    fileName: 'approval.test.ts',
    startLine: 20,
  })
  assert.deepEqual(parseChatCodeMeta('ts approval.test.ts'), {
    lang: 'ts',
    fileName: 'approval.test.ts',
  })
  assert.equal(chatCodeStat(['+a', '+b', '-c']), '+2 -1')
  assert.equal(shouldCollapseChatCode({ lang: 'ts', fileName: 'approval.test.ts' }, ['a']), true)
  const html = renderChatMarkdown(
    [
      '```20:22:src/kernel/shared/approval.test.ts',
      "  test('动手放行原生写工具', () => {",
      "    assert.equal(nativeWriteApprovalOutcome('write', false), 'rejected')",
      "    assert.equal(nativeWriteApprovalOutcome('edit', false), 'rejected')",
      '  })',
      "  assert.equal(nativeWriteApprovalOutcome('write', true), 'allowed-once')",
      '```',
    ].join('\n'),
  )
  assert.match(html, /class="chat-code"/)
  assert.match(html, /class="chat-code-name">approval\.test\.ts</)
  assert.match(html, /class="chat-code-lang">TS</)
  assert.match(html, /展开全部 5 行/)
})

test('危险链接和 HTML 不会原样进气泡', () => {
  const html = renderChatMarkdown('点 [x](javascript:alert(1)) 和 <script>alert(1)</script>')
  assert.equal(html.includes('javascript:'), false)
  assert.equal(html.includes('<script>'), false)
  assert.match(html, /&lt;script&gt;/)
})
