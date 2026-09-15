import assert from 'node:assert/strict'
import test from 'node:test'
import { isOverContentLimit, markdownToWechatHtml } from './wx-draft-html.ts'

test('标题层级与样式：h1–h4 分档，h5/h6 合并为 h5', () => {
  const { html } = markdownToWechatHtml(
    ['# 一级', '## 二级', '### 三级', '#### 四级', '##### 五级', '###### 六级'].join('\n'),
  )
  assert.match(html, /<h1 style="font-size:20px;font-weight:bold;margin:18px 0 10px;color:#2f2f2f;">一级<\/h1>/)
  assert.match(html, /<h2 style="font-size:18px;font-weight:bold;margin:18px 0 10px;color:#2f2f2f;">二级<\/h2>/)
  assert.match(html, /<h3 style="font-size:17px;font-weight:bold;margin:18px 0 10px;color:#2f2f2f;">三级<\/h3>/)
  assert.match(html, /<h4 style="font-size:16px;font-weight:bold;margin:18px 0 10px;color:#2f2f2f;">四级<\/h4>/)
  assert.match(html, /<h5 style="font-size:15px;font-weight:bold;margin:18px 0 10px;color:#2f2f2f;">五级<\/h5>/)
  assert.match(html, /<h5 style="font-size:15px;font-weight:bold;margin:18px 0 10px;color:#2f2f2f;">六级<\/h5>/)
  assert.equal(html.includes('<h6'), false)
  assert.match(html, /^<section>/)
  assert.match(html, /<\/section>$/)
})

test('段落：相邻非空行合并为一个 p，空行拆段', () => {
  const { html } = markdownToWechatHtml('第一行\n第二行\n\n下一段')
  assert.match(
    html,
    /<p style="font-size:15px;line-height:1.75;letter-spacing:0.5px;color:#3f3f3f;margin:8px 0;">第一行 第二行<\/p>/,
  )
  assert.match(
    html,
    /<p style="font-size:15px;line-height:1.75;letter-spacing:0.5px;color:#3f3f3f;margin:8px 0;">下一段<\/p>/,
  )
})

test('行内：粗体、斜体、行内代码、链接', () => {
  const { html } = markdownToWechatHtml('这是 **粗** 和 *斜* 以及 `code` 与 [锚](https://example.com/)')
  assert.match(html, /<strong>粗<\/strong>/)
  assert.match(html, /<em>斜<\/em>/)
  assert.match(
    html,
    /<code style="background:#f2f2f2;border-radius:3px;padding:1px 4px;font-size:13px;color:#c7254e;font-family:Menlo,monospace;">code<\/code>/,
  )
  assert.match(
    html,
    /<a href="https:\/\/example.com\/" style="color:#576b95;text-decoration:none;">锚<\/a>/,
  )
})

test('代码块转义：<script> 等 HTML 被转义，语言标注丢弃', () => {
  const { html } = markdownToWechatHtml('```ts\n<script>alert(1)</script>\n```')
  assert.equal(html.includes('<script>'), false)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.equal(html.includes('ts\n'), false)
  assert.match(html, /<pre style="background:#f6f8fa;border-radius:6px;padding:12px;overflow-x:auto;font-size:13px;line-height:1.6;">/)
  assert.match(html, /<code style="font-family:Menlo,monospace;color:#24292e;background:transparent;">/)
})

test('引用：blockquote 样式，内部用 br 而不是 p', () => {
  const { html } = markdownToWechatHtml('> 第一句\n> 第二句')
  assert.match(
    html,
    /<blockquote style="border-left:3px solid #d8d8d8;padding:4px 12px;color:#888;margin:10px 0;font-size:14px;">第一句<br>第二句<\/blockquote>/,
  )
  assert.equal(/<blockquote[^>]*>[\s\S]*<p/.test(html), false)
})

test('列表：无序 ul 与有序 ol 及 li 样式', () => {
  const ul = markdownToWechatHtml('- 甲\n- 乙').html
  assert.match(ul, /<ul style="margin:8px 0;padding-left:20px;">/)
  assert.match(ul, /<li style="font-size:15px;line-height:1.75;color:#3f3f3f;">甲<\/li>/)
  assert.match(ul, /<li style="font-size:15px;line-height:1.75;color:#3f3f3f;">乙<\/li>/)
  const ol = markdownToWechatHtml('1. 一\n2. 二').html
  assert.match(ol, /<ol style="margin:8px 0;padding-left:20px;">/)
  assert.match(ol, /<li style="font-size:15px;line-height:1.75;color:#3f3f3f;">一<\/li>/)
})

test('表格结构：首行作表头，分隔行丢弃', () => {
  const { html } = markdownToWechatHtml('| 列A | 列B |\n| --- | --- |\n| 1 | 2 |')
  assert.match(html, /<table style="border-collapse:collapse;width:100%;margin:10px 0;font-size:14px;">/)
  assert.match(html, /<thead><tr><th style="border:1px solid #ddd;padding:6px 8px;background:#f5f5f5;">列A<\/th>/)
  assert.match(html, /<th style="border:1px solid #ddd;padding:6px 8px;background:#f5f5f5;">列B<\/th>/)
  assert.match(html, /<td style="border:1px solid #ddd;padding:6px 8px;">1<\/td>/)
  assert.match(html, /<td style="border:1px solid #ddd;padding:6px 8px;">2<\/td>/)
  assert.equal(html.includes('---'), false)
})

test('本地配图 src 原样收集，供主进程解析 /images/ 路径', () => {
  const md = '![观测差异vs因果效应对比图](/images/文中插图1_观测差异vs因果效应.jpg)'
  const { html, images } = markdownToWechatHtml(md)
  assert.deepEqual(images, [{ token: 'wximg1', src: '/images/文中插图1_观测差异vs因果效应.jpg' }])
  assert.match(html, /src="__WXIMG_wximg1__"/)
  assert.equal(html.includes('/images/'), false)
})

test('图片收集：同 src 去重复用 token，占位符按出现顺序', () => {
  const md = '![一](https://a.example/x.png "忽略标题")\n\n正文\n\n![二](https://b.example/y.png)\n\n![再一](https://a.example/x.png)'
  const { html, images } = markdownToWechatHtml(md)
  assert.deepEqual(images, [
    { token: 'wximg1', src: 'https://a.example/x.png' },
    { token: 'wximg2', src: 'https://b.example/y.png' },
  ])
  const first = html.indexOf('__WXIMG_wximg1__')
  const second = html.indexOf('__WXIMG_wximg2__')
  const third = html.lastIndexOf('__WXIMG_wximg1__')
  assert.ok(first >= 0 && second > first && third > second)
  assert.match(html, /<img src="__WXIMG_wximg1__" alt="一" style="max-width:100%;border-radius:4px;margin:10px 0;">/)
  assert.match(html, /<img src="__WXIMG_wximg2__" alt="二" style="max-width:100%;border-radius:4px;margin:10px 0;">/)
  assert.equal(html.includes('忽略标题'), false)
  assert.equal(html.includes('https://a.example/x.png'), false)
})

test('块级与行内公式：计数、输出源码、不成对美元不当公式', () => {
  const md = ['行内 $E=mc^2$ 与 $a+b$', '', '$$', '\\sum x', '$$', '', '价格 $100 不是公式'].join('\n')
  const { html, mathCount } = markdownToWechatHtml(md)
  assert.equal(mathCount, 3)
  assert.match(
    html,
    /<code style="background:#f2f2f2;border-radius:3px;padding:1px 4px;font-size:13px;color:#c7254e;font-family:Menlo,monospace;">\$E=mc\^2\$<\/code>/,
  )
  assert.match(
    html,
    /<div style="background:#f7f7f7;border-radius:6px;padding:10px 12px;margin:10px 0;font-size:14px;text-align:center;overflow-x:auto;"><code style="font-family:Menlo,monospace;color:#333;">\$\\sum x\$<\/code><\/div>/,
  )
  assert.match(html, /价格 \$100 不是公式/)
})

test('HTML 特殊字符 <>& 在正文中转义', () => {
  const { html } = markdownToWechatHtml('比较 a < b & c > "d"')
  assert.match(html, /比较 a &lt; b &amp; c &gt; &quot;d&quot;/)
  assert.equal(html.includes('< b'), false)
})

test('isOverContentLimit：20000 字符为边界（不含），20001 超限', () => {
  assert.equal(isOverContentLimit('a'.repeat(20000)), false)
  assert.equal(isOverContentLimit('a'.repeat(20001)), true)
  assert.equal(isOverContentLimit(''), false)
})

test('水平线独立行输出 hr', () => {
  const { html } = markdownToWechatHtml('上\n\n---\n\n下')
  assert.match(html, /<hr style="border:none;border-top:1px solid #e5e5e5;margin:16px 0;">/)
})
