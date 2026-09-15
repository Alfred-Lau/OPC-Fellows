import assert from 'node:assert/strict'
import test from 'node:test'
import { markdownFence, markdownTable, renderChatMarkdown } from './chat-markdown.ts'

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

test('危险链接和 HTML 不会原样进气泡', () => {
  const html = renderChatMarkdown('点 [x](javascript:alert(1)) 和 <script>alert(1)</script>')
  assert.equal(html.includes('javascript:'), false)
  assert.equal(html.includes('<script>'), false)
  assert.match(html, /&lt;script&gt;/)
})
