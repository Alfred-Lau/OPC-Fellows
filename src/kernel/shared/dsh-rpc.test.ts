import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assistantPayload,
  assistantPlainText,
  composeDshTurn,
  composeToolFollowUp,
  dshSessionId,
  DshTurnCollector,
  dshRuntimeSessionId,
  encodeJsonRpcRequest,
  isDshSessionExistsError,
  JsonRpcLineBuffer,
  parseJsonRpcLine,
  splitAssistantPayload,
} from './dsh-rpc.ts'

test('session id 只留协议能吃的字符', () => {
  assert.equal(dshSessionId('thread:rumi', 'rumi'), 'opc:thread:rumi:rumi')
  assert.equal(dshSessionId('thread/a b', 'x y'), 'opc:thread_a_b:x_y')
  assert.equal(dshRuntimeSessionId('opc:thread:notes:notes', 'boot1'), 'opc:thread:notes:notes:boot1')
  assert.equal(dshRuntimeSessionId('opc:thread:notes:notes', '  '), 'opc:thread:notes:notes')
  assert.equal(isDshSessionExistsError(new Error('session "opc:thread:notes:notes" already exists')), true)
  assert.equal(isDshSessionExistsError(new Error('模型没有返回内容。')), false)
})

test('每轮把人设和用户话拼成一条 prompt', () => {
  assert.equal(composeDshTurn('你是随手记。', '买牛奶'), '你是随手记。\n\n---\n\n买牛奶')
})

test('工具回灌仍带着用户原话，思考块不进正文', () => {
  const follow = composeToolFollowUp('你是演示助手。', '你有什么能力', 'demo_refresh', '今日浏览 0')
  assert.match(follow, /你有什么能力/)
  assert.match(follow, /demo_refresh/)
  assert.match(follow, /今日浏览 0/)
  assert.equal(
    assistantPlainText({
      type: 'assistant/message',
      data: {
        content: [
          { type: 'thinking', text: 'The tool has been executed.' },
          { type: 'text', text: '态势已刷新。' },
        ],
      },
    }),
    '态势已刷新。',
  )
  assert.equal(
    assistantPayload({
      type: 'assistant/message',
      data: {
        content: [
          { type: 'thinking', text: 'The tool has been executed.' },
          { type: 'text', text: '态势已刷新。' },
        ],
      },
    }).thinking,
    'The tool has been executed.',
  )
})

test('思考标签和段首英文推理从正文里拆出来', () => {
  assert.deepEqual(splitAssistantPayload('<think>先核对工具结果</think>\n今日浏览 0。'), {
    text: '今日浏览 0。',
    thinking: '先核对工具结果',
  })
  const peeled = splitAssistantPayload(
    [
      'The tool has been executed. I will now answer the user original question.',
      '',
      '站点流量：今日浏览 0。',
    ].join('\n'),
  )
  assert.equal(peeled.text, '站点流量：今日浏览 0。')
  assert.match(peeled.thinking, /The tool has been executed/)
  assert.equal(splitAssistantPayload('Hello, this is an English-only answer.').thinking, '')
  assert.equal(
    assistantPayload({
      type: 'assistant/message',
      data: {
        message: {
          role: 'assistant',
          reasoning_content: 'Need to refresh first.',
          content: [{ type: 'text', text: '态势已刷新。' }],
        },
      },
    }).thinking,
    'Need to refresh first.',
  )
})

test('JSON-RPC 一行一帧；坏行丢掉', () => {
  assert.equal(encodeJsonRpcRequest(1, 'initialize', { cwd: '/tmp' }), '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"cwd":"/tmp"}}\n')
  assert.equal(parseJsonRpcLine('not json'), null)
  assert.equal(parseJsonRpcLine(''), null)
  const frame = parseJsonRpcLine('{"jsonrpc":"2.0","id":1,"result":{"ok":true}}')
  assert.deepEqual(frame, { jsonrpc: '2.0', id: 1, result: { ok: true } })
})

test('拆帧时半行留在缓冲区', () => {
  const buffer = new JsonRpcLineBuffer()
  assert.deepEqual(buffer.push('{"jsonrpc":"2.0","id":1'), [])
  const frames = buffer.push(',"result":{}}\n{"jsonrpc":"2.0","method":"session.status"')
  assert.equal(frames.length, 1)
  assert.equal(frames[0]?.id, 1)
  const rest = buffer.push(',"params":{"sessionId":"s","status":"idle"}}\n')
  assert.equal(rest[0]?.method, 'session.status')
})

test('从 assistant/message 抽出正文，turn/end 结束一轮', () => {
  assert.equal(
    assistantPlainText({
      type: 'assistant/message',
      data: { content: [{ type: 'text', text: '你好' }] },
    }),
    '你好',
  )
  assert.equal(
    assistantPlainText({
      type: 'assistant/message',
      data: {
        turn: 0,
        step: 0,
        message: { role: 'assistant', content: [{ type: 'text', text: '记好了' }] },
        stream: [],
      },
    }),
    '记好了',
  )
  const collector = new DshTurnCollector('main')
  collector.push({
    method: 'session.event',
    params: {
      sessionId: 'other',
      event: { type: 'assistant/message', data: { content: [{ type: 'text', text: '别的会话' }] } },
    },
  })
  assert.equal(collector.assistant, '')
  collector.push({
    method: 'session.event',
    params: {
      sessionId: 'main',
      event: {
        type: 'assistant/message',
        data: {
          message: { role: 'assistant', content: [{ type: 'text', text: '在' }] },
        },
      },
    },
  })
  assert.equal(collector.assistant, '在')
  assert.equal(collector.thinking, '')
  assert.equal(collector.finished, false)
  collector.push({
    method: 'session.event',
    params: { sessionId: 'main', event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } },
  })
  assert.equal(collector.finished, true)
  assert.equal(collector.reply(), '在')
})

test('新建 session 的初始 idle 不算回合结束，见过 running 之后才算', () => {
  const collector = new DshTurnCollector('s1')
  collector.push({
    method: 'session.status',
    params: { sessionId: 's1', status: 'idle' },
  })
  assert.equal(collector.finished, false)
  collector.push({
    method: 'session.status',
    params: { sessionId: 's1', status: 'running' },
  })
  assert.equal(collector.finished, false)
  collector.push({
    method: 'session.status',
    params: { sessionId: 's1', status: 'idle' },
  })
  assert.equal(collector.finished, true)
})

test('助手没正文时用 tool/result，turn/end 报错要露出来', () => {
  const collector = new DshTurnCollector('s1')
  collector.push({
    method: 'session.event',
    params: {
      sessionId: 's1',
      event: {
        type: 'tool/result',
        data: { message: { role: 'user', content: [{ type: 'text', text: '已记到随手记：买牛奶' }] } },
      },
    },
  })
  assert.equal(collector.reply(), '已记到随手记：买牛奶')
  collector.push({
    method: 'session.event',
    params: {
      sessionId: 's1',
      event: { type: 'turn/end', data: { reason: { kind: 'error', error: { message: 'DeepSeek 429' } } } },
    },
  })
  assert.equal(collector.finished, true)
  assert.equal(collector.failure, 'DeepSeek 429')
})

test('先收到思考再收到正文时，思考单独留下', () => {
  const collector = new DshTurnCollector('s1')
  collector.push({
    method: 'session.event',
    params: {
      sessionId: 's1',
      event: { type: 'assistant/thinking', data: { text: 'The tool has been executed. Checking the dashboard.' } },
    },
  })
  collector.push({
    method: 'session.event',
    params: {
      sessionId: 's1',
      event: {
        type: 'assistant/message',
        data: { message: { role: 'assistant', content: [{ type: 'text', text: '态势已刷新。' }] } },
      },
    },
  })
  assert.equal(collector.assistant, '态势已刷新。')
  assert.match(collector.thinking, /The tool has been executed/)
  assert.deepEqual(collector.result(), {
    text: '态势已刷新。',
    thinking: 'The tool has been executed. Checking the dashboard.',
  })
})
