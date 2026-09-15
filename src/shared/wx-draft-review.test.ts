import assert from 'node:assert/strict'
import test from 'node:test'
import { markdownToWechatHtml } from './wx-draft-html.ts'
import {
  originalityNotice,
  appendOriginalityNotice,
  formatReviewMessage,
  isCoverMarkdownImage,
  reviewWxDraftMarkdown,
} from './wx-draft-review.ts'

test('封面图按文件名或 alt 识别，正文插图放过', () => {
  assert.equal(isCoverMarkdownImage('封面', '/images/任意.jpg'), true)
  assert.equal(isCoverMarkdownImage('插图', '/images/封面.jpg'), true)
  assert.equal(isCoverMarkdownImage('封面图', 'images/cover.png'), true)
  assert.equal(isCoverMarkdownImage('观测差异vs因果效应对比图', '/images/文中插图1_观测差异vs因果效应.jpg'), false)
})

test('审查去掉文首 YAML、封面图和 AI 指引，留下知识正文', () => {
  const reviewed = reviewWxDraftMarkdown(
    [
      '---',
      'title: 因果推断入门',
      'cover: /images/封面.jpg',
      '---',
      '',
      '![封面](/images/封面.jpg)',
      '',
      '# 观测差异不是因果效应',
      '',
      '> 写作指引：用通俗语言解释，不要把 prompt 写进成品。',
      '',
      '请根据以上笔记扩写成公众号文章，保持学术严谨。',
      '',
      '<!-- AI: 结尾加原创声明 -->',
      '',
      '## 写作指引',
      '',
      '- 面向本科生',
      '- 不要出现公式推导的 prompt',
      '',
      '## 观测差异',
      '',
      '请根据定理 2.1，我们可以得到一致性。',
      '',
      '![观测差异vs因果效应对比图](/images/文中插图1_观测差异vs因果效应.jpg)',
    ].join('\n'),
  )

  assert.match(reviewed.markdown, /观测差异不是因果效应/)
  assert.match(reviewed.markdown, /请根据定理 2\.1，我们可以得到一致性。/)
  assert.match(reviewed.markdown, /文中插图1_观测差异vs因果效应\.jpg/)
  assert.equal(reviewed.markdown.includes('封面.jpg'), false)
  assert.equal(reviewed.markdown.includes('写作指引'), false)
  assert.equal(reviewed.markdown.includes('扩写成公众号'), false)
  assert.equal(reviewed.markdown.includes('title:'), false)
  assert.equal(reviewed.markdown.includes('AI:'), false)
  assert.ok(reviewed.removals.some((item) => item.kind === 'cover'))
  assert.ok(reviewed.removals.some((item) => item.kind === 'guidance'))
  assert.ok(reviewed.removals.some((item) => item.kind === 'frontmatter'))
})

test('prompt 代码块与封面标题行去掉，普通代码块保留', () => {
  const reviewed = reviewWxDraftMarkdown(
    [
      '# 回归笔记',
      '',
      '## 封面',
      '',
      '![cover](./images/cover.png)',
      '',
      '```prompt',
      '你是公众号编辑，按提纲扩写。',
      '```',
      '',
      '```ts',
      'const beta = 1',
      '```',
      '',
      '残差平方和最小。',
    ].join('\n'),
  )
  assert.match(reviewed.markdown, /回归笔记/)
  assert.match(reviewed.markdown, /const beta = 1/)
  assert.match(reviewed.markdown, /残差平方和最小/)
  assert.equal(reviewed.markdown.includes('你是公众号编辑'), false)
  assert.equal(reviewed.markdown.includes('cover.png'), false)
  assert.equal(/^## 封面$/m.test(reviewed.markdown), false)
})

test('策划模块整段去掉：排版风格、封面图方案、备选标题、内容验真', () => {
  const reviewed = reviewWxDraftMarkdown(
    [
      '排版风格：知识卡片风（科普 / 方法论向）',
      '适用账号：示例号的科研小课',
      '全文约26000字，手机端阅读约8分钟',
      '',
      '## 封面图方案',
      '',
      '封面风格：知识科普感，深色背景 + 公路俯视元素 + 对比冲突',
      '',
      '**方案 A（主选-问题冲突型，已生成）**：见 images/公众号封面_冷暖分岔.jpg（2.35:1）。封面文案：「多修一条车道，路反更堵？」',
      '',
      '**方案 B（概念型）**：平行时空分岔构图。',
      '',
      '公众号头图比例建议 2.35:1（封面小图 1:1 可从方案 A 中心裁切）。',
      '',
      '## 备选标题（5个，覆盖不同传播方向）',
      '',
      '1. 多修一条车道，为什么路反更堵？一个例子讲透因果识别（问题切入型，推荐主用）',
      '2. 拓宽车道能治堵吗？计量经济学给了一个反直觉的答案（反常识型）',
      '',
      '## 内容验真',
      '',
      '1. 案例与数据：文中拥堵指数（30/40/80）、日均车流量，均来自用户提供的口播讲稿，非真实城市交通统计。',
      '2. 专业概念：DID 与断点回归只作教学脚手架。',
      '',
      '---',
      '',
      '# 观测差异不是因果效应',
      '',
      '拓宽车道之后，拥堵反而更严重。这不是段子，是识别问题。',
    ].join('\n'),
  )

  assert.match(reviewed.markdown, /观测差异不是因果效应/)
  assert.match(reviewed.markdown, /拓宽车道之后，拥堵反而更严重/)
  assert.equal(reviewed.markdown.includes('排版风格'), false)
  assert.equal(reviewed.markdown.includes('适用账号'), false)
  assert.equal(reviewed.markdown.includes('26000'), false)
  assert.equal(reviewed.markdown.includes('封面图方案'), false)
  assert.equal(reviewed.markdown.includes('公众号封面_冷暖分岔'), false)
  assert.equal(reviewed.markdown.includes('备选标题'), false)
  assert.equal(reviewed.markdown.includes('推荐主用'), false)
  assert.equal(reviewed.markdown.includes('内容验真'), false)
  assert.equal(reviewed.markdown.includes('口播讲稿'), false)
  assert.ok(reviewed.removals.some((item) => item.kind === 'guidance'))
  const { html } = markdownToWechatHtml(reviewed.markdown)
  assert.equal(html.includes('封面图方案'), false)
  assert.equal(html.includes('备选标题'), false)
  assert.equal(html.includes('内容验真'), false)
  assert.match(html, /拓宽车道之后/)
})

test('没有 # 的加粗策划标题也会整段去掉', () => {
  const reviewed = reviewWxDraftMarkdown(
    ['**封面图方案**', '', '封面风格：知识科普感', '', '# 正文标题', '', '这是知识正文。'].join('\n'),
  )
  assert.match(reviewed.markdown, /正文标题/)
  assert.match(reviewed.markdown, /这是知识正文/)
  assert.equal(reviewed.markdown.includes('封面图方案'), false)
  assert.equal(reviewed.markdown.includes('封面风格'), false)
})

test('学术「请根据定理」不是 AI 指引', () => {
  const reviewed = reviewWxDraftMarkdown('请根据定理 3.1 可知估计量一致。\n')
  assert.equal(reviewed.markdown, '请根据定理 3.1 可知估计量一致。')
  assert.equal(reviewed.removals.length, 0)
  assert.equal(formatReviewMessage(reviewed), '正文无需剔除')
})

test('formatReviewMessage 汇总剔除项', () => {
  const reviewed = reviewWxDraftMarkdown('---\ntitle: a\n---\n\n![封面](/images/封面.jpg)\n\n你是公众号编辑，按提纲写。\n\n正文\n')
  assert.match(formatReviewMessage(reviewed), /封面图/)
  assert.match(formatReviewMessage(reviewed), /AI 指引/)
  assert.match(formatReviewMessage(reviewed), /文首元数据/)
})

test('转 HTML 前审查后，封面不再进正文图，插图仍在', () => {
  const reviewed = reviewWxDraftMarkdown(
    '![封面](/images/封面.jpg)\n\n正文段\n\n![观测](/images/文中插图1_观测差异vs因果效应.jpg)\n',
  )
  const { html, images } = markdownToWechatHtml(reviewed.markdown)
  assert.deepEqual(images, [{ token: 'wximg1', src: '/images/文中插图1_观测差异vs因果效应.jpg' }])
  assert.equal(html.includes('封面'), false)
  assert.match(html, /正文段/)
})

test('原创声明只追加一次，空正文不加，可用作者名', () => {
  const notice = originalityNotice('示例号')
  const once = appendOriginalityNotice('# 标题\n\n一段知识。', '示例号')
  assert.match(once, new RegExp(`\\*${notice}\\*`))
  assert.equal(appendOriginalityNotice(once, '示例号'), once)
  assert.equal(appendOriginalityNotice('   '), '')
  assert.match(appendOriginalityNotice('# 标题\n\n一段知识。'), /本账号/)
})
