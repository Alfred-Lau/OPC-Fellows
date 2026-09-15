import assert from 'node:assert/strict'
import test from 'node:test'
import { asToolArgs, formatOpcToolsPrompt, parseOpcToolCall } from './opc-tools.ts'

const notes = {
  name: 'notes_add',
  description: '把一句话记到随手记',
  moduleId: 'notes',
  parameters: { text: { type: 'string' as const, description: '要记下的原文', required: true } },
}

test('没有工具时不拼协议段', () => {
  assert.equal(formatOpcToolsPrompt([]), '')
})

test('工具目录告诉模型用 JSON 点名', () => {
  const prompt = formatOpcToolsPrompt([
    notes,
    {
      name: 'monitor_refresh',
      description: '刷新项目监控态势',
      moduleId: 'monitor',
      parameters: {},
    },
  ])
  assert.match(prompt, /notes_add/)
  assert.match(prompt, /monitor_refresh/)
  assert.match(prompt, /"tool"/)
  assert.match(prompt, /无参数/)
  assert.match(prompt, /一次只调一个工具/)
})

test('从助手回复里抽出工具调用；围栏和多余文字都能吃', () => {
  assert.deepEqual(parseOpcToolCall('{"tool":"notes_add","args":{"text":"买牛奶"}}'), {
    name: 'notes_add',
    args: { text: '买牛奶' },
  })
  assert.deepEqual(
    parseOpcToolCall('好的\n```json\n{"tool":"monitor_refresh","args":{}}\n```\n'),
    { name: 'monitor_refresh', args: {} },
  )
  assert.equal(parseOpcToolCall('已记到随手记：买牛奶'), null)
  assert.equal(parseOpcToolCall('{"foo":1}'), null)
  assert.equal(parseOpcToolCall('{"tool":"Notes Add"}'), null)
})

test('IPC 参数收成字符串表', () => {
  assert.deepEqual(asToolArgs({ text: 'hi', has_ammo: true, n: 2, skip: null }), {
    text: 'hi',
    has_ammo: 'true',
    n: '2',
    skip: '',
  })
  assert.deepEqual(asToolArgs(null), {})
})
