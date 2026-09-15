import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_AUTHOR,
  absorbWorkflowMessage,
  applyWxDraftMeta,
  buildWorkflowParameters,
  clipChars,
  emptyInput,
  explainWeixinAuthError,
  extractFinalOutput,
  fallbackDraftMeta,
  isWorkflowEndTitle,
  maskSecret,
  parseSseBlock,
  parseWxDraftAiMeta,
  pickString,
  splitSseBlocks,
} from './wx-draft.ts'

test('splitSseBlocks 切出完整块并保留末尾不完整片段', () => {
  const buffer = 'event: Message\ndata: {"a":1}\n\nevent: Done\ndata: {"b":2}\n\npartial'
  const { blocks, rest } = splitSseBlocks(buffer)
  assert.equal(blocks.length, 2)
  assert.ok(blocks[0].includes('"a":1'))
  assert.ok(blocks[1].includes('"b":2'))
  assert.equal(rest, 'partial')
})

test('splitSseBlocks 兼容 CRLF 与开头残留拼接', () => {
  const first = splitSseBlocks('event: Message\r\ndata: {"a":1}')
  assert.deepEqual(first.blocks, [])
  assert.equal(first.rest, 'event: Message\r\ndata: {"a":1}')
  const merged = splitSseBlocks(`${first.rest}\r\n\r\nevent: Done\r\ndata: {}\r\n\r\n`)
  assert.equal(merged.blocks.length, 2)
  assert.equal(merged.rest, '')
})

test('parseSseBlock 解析 event/id/data，data 为 JSON', () => {
  const event = parseSseBlock('id: 1\nevent: Message\ndata: {"content":"hi"}')
  assert.ok(event)
  assert.equal(event.id, '1')
  assert.equal(event.event, 'Message')
  assert.deepEqual(event.data, { content: 'hi' })
})

test('parseSseBlock 在 data 非 JSON 时回退为字符串', () => {
  const event = parseSseBlock('event: PING\ndata: ping')
  assert.ok(event)
  assert.equal(event.event, 'PING')
  assert.equal(event.data, 'ping')
})

test('parseSseBlock 忽略空块', () => {
  assert.equal(parseSseBlock('   '), null)
  assert.equal(parseSseBlock(''), null)
})

test('extractFinalOutput 仅在结束汇总包时返回对象', () => {
  const finalNode = { node_is_finish: true, node_title: '', content: '{"draft_media_id":"m1"}' }
  assert.deepEqual(extractFinalOutput(finalNode), { draft_media_id: 'm1' })

  // 普通中间节点：有 node_title，不应识别为最终结果
  const midNode = { node_is_finish: false, node_title: '获取token', content: '{}' }
  assert.equal(extractFinalOutput(midNode), null)
  const finishedMid = { node_is_finish: true, node_title: '获取token', content: '{"token":"x"}' }
  assert.equal(extractFinalOutput(finishedMid), null)

  // content 不是合法 JSON 时回退为 raw_output
  const broken = { node_is_finish: true, node_title: '', content: 'not-json' }
  assert.deepEqual(extractFinalOutput(broken), { raw_output: 'not-json' })

  assert.equal(extractFinalOutput(null), null)
  assert.equal(extractFinalOutput('string'), null)
})

test('isWorkflowEndTitle 认空标题、End、结束', () => {
  assert.equal(isWorkflowEndTitle(''), true)
  assert.equal(isWorkflowEndTitle('End'), true)
  assert.equal(isWorkflowEndTitle('结束'), true)
  assert.equal(isWorkflowEndTitle('获取token'), false)
})

test('用户复现：End 节点已有 media_id 时不得被空汇总包盖掉', () => {
  const events = [
    {
      node_is_finish: false,
      node_title: 'End',
      content:
        '{"cover_media_id":"rJsdehmlaJZLWHgoU321cV8YMKcj0uLuQcRvbU3InSESuiNZ0QQ470C_k4z9voAT","draft_media_id":"rJsdehmlaJZLWHgoU321cV8YMKcj0uLuDraftId"}',
    },
    { node_is_finish: true, node_title: '', content: '{"cover_media_id":"","draft_media_id":""}' },
  ]
  let output: Record<string, unknown> | null = null
  for (const data of events) {
    output = absorbWorkflowMessage(output, data)
  }
  assert.equal(pickString(output, 'draft_media_id'), 'rJsdehmlaJZLWHgoU321cV8YMKcj0uLuDraftId')
  assert.equal(
    pickString(output, 'cover_media_id'),
    'rJsdehmlaJZLWHgoU321cV8YMKcj0uLuQcRvbU3InSESuiNZ0QQ470C_k4z9voAT',
  )
})

test('absorbWorkflowMessage 也收 content 已是对象的 End 节点', () => {
  const output = absorbWorkflowMessage(null, {
    node_is_finish: true,
    node_title: 'End',
    content: { cover_media_id: 'C', draft_media_id: 'D' },
  })
  assert.equal(pickString(output, 'draft_media_id'), 'D')
  assert.equal(pickString(output, 'cover_media_id'), 'C')
})

test('用户复现：40164 IP 白名单会让云端取 token 失败并得到空 media_id', () => {
  const hint = explainWeixinAuthError(40164, 'invalid ip 183.247.8.247, not in whitelist')
  assert.match(hint, /IP 白名单/)
  assert.match(hint, /扣子/)
  assert.equal(explainWeixinAuthError(40013).includes('AppID'), true)
  assert.match(
    explainWeixinAuthError(0, '封面图片尺寸不合法 hint: [ngG_pa068066-0]'),
    /封面图裁剪不合规/,
  )
})

test('用户复现：End 节点空 media_id 应被识别为最终输出并判定未创建草稿', () => {
  const endNode = {
    node_is_finish: true,
    node_title: 'End',
    content: '{"cover_media_id":"","draft_media_id":""}',
  }
  const output = extractFinalOutput(endNode)
  assert.deepEqual(output, { cover_media_id: '', draft_media_id: '' })
  assert.equal(pickString(output, 'draft_media_id'), '')
  assert.equal(Boolean(pickString(output, 'draft_media_id')), false)
})

test('buildWorkflowParameters 完整映射为 snake_case', () => {
  const params = buildWorkflowParameters({
    markdownContent: '# 标题',
    title: '文章标题',
    author: '作者',
    digest: '摘要',
    coverImageUrl: 'https://x/c.png',
    contentSourceUrl: 'https://x/p',
    needOpenComment: 1,
    onlyFansCanComment: 0,
    declareOriginal: 1,
    appid: 'wx123',
    secret: 'sec',
  })
  assert.equal(params.markdown_content, '# 标题')
  assert.equal(params.cover_image_url, 'https://x/c.png')
  assert.equal(params.need_open_comment, 1)
  assert.equal(params.appid, 'wx123')
})

test('pickString 安全取字段', () => {
  assert.equal(pickString({ a: 'x' }, 'a'), 'x')
  assert.equal(pickString({ a: 1 }, 'a'), '')
  assert.equal(pickString(null, 'a'), '')
})

test('maskSecret 脱敏', () => {
  assert.equal(maskSecret('pat_abcdefgh1234'), 'pat_…1234')
  assert.equal(maskSecret('short'), '****')
  assert.equal(maskSecret(''), '')
})

test('emptyInput 预填作者与 appid', () => {
  const input = emptyInput('我', 'wx')
  assert.equal(input.author, '我')
  assert.equal(input.appid, 'wx')
  assert.equal(input.needOpenComment, 0)
  assert.equal(input.declareOriginal, 1)
  assert.equal(input.markdownContent, '')
  assert.equal(emptyInput().author, DEFAULT_AUTHOR)
})

test('parseWxDraftAiMeta 抽出标题摘要和配图提示', () => {
  const meta = parseWxDraftAiMeta('```json\n{"title":"计量入门","digest":"讲回归","coverPrompt":"warm lamp"}\n```')
  assert.ok(meta)
  assert.equal(meta.title, '计量入门')
  assert.equal(meta.digest, '讲回归')
  assert.equal(meta.coverPrompt, 'warm lamp')
  assert.equal(parseWxDraftAiMeta('not json'), null)
  assert.equal(parseWxDraftAiMeta('{"digest":"无标题"}'), null)
})

test('fallbackDraftMeta 用一级标题和首段兜底', () => {
  const meta = fallbackDraftMeta('# 伍德里奇笔记\n\n这是正文第一段，讲最小二乘。\n')
  assert.equal(meta.title, '伍德里奇笔记')
  assert.match(meta.digest, /最小二乘/)
})

test('applyWxDraftMeta 作者用表单值，标题摘要空才用 AI，封面不生成', () => {
  const meta = {
    title: 'AI标题',
    digest: 'AI摘要',
    coverPrompt: 'paper lamp',
  }
  const filled = applyWxDraftMeta(emptyInput('别人'), meta)
  assert.equal(filled.author, '别人')
  assert.equal(filled.title, 'AI标题')
  assert.equal(filled.digest, 'AI摘要')
  assert.equal(filled.coverImageUrl, '')
  const kept = applyWxDraftMeta(
    { ...emptyInput('别人'), title: '手写标题', digest: '手写摘要', coverImageUrl: '/notes/images/封面.jpg' },
    meta,
  )
  assert.equal(kept.title, '手写标题')
  assert.equal(kept.digest, '手写摘要')
  assert.equal(kept.coverImageUrl, '/notes/images/封面.jpg')
  assert.equal(kept.author, '别人')
  assert.equal(applyWxDraftMeta(emptyInput(''), meta).author, '')
})

test('clipChars 按码点截断', () => {
  assert.equal(clipChars('abcdef', 3), 'abc')
})

test('极端分包：逐 7 字节累积后仍能还原完整事件流', () => {
  const stream =
    'event: Message\ndata: {"node_title":"t","node_is_finish":false,"content":"a"}\n\n' +
    'event: Message\ndata: {"node_is_finish":true,"node_title":"","content":"{\\"draft_media_id\\":\\"D\\"}"}\n\n' +
    'event: Done\ndata: {"debug_url":"u"}\n\n'
  let buffer = ''
  const finals: Record<string, unknown>[] = []
  const dones: unknown[] = []
  for (let i = 0; i < stream.length; i += 7) {
    buffer += stream.slice(i, i + 7)
    const split = splitSseBlocks(buffer)
    buffer = split.rest
    for (const block of split.blocks) {
      const event = parseSseBlock(block)
      if (!event) {
        continue
      }
      if (event.event === 'Message') {
        const final = extractFinalOutput(event.data)
        if (final) {
          finals.push(final)
        }
      }
      if (event.event === 'Done') {
        dones.push(event.data)
      }
    }
  }
  assert.equal(finals.length, 1)
  assert.deepEqual(finals[0], { draft_media_id: 'D' })
  assert.equal(dones.length, 1)
  assert.equal(buffer, '')
})
