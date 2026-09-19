import assert from 'node:assert/strict'
import test from 'node:test'
import { asToolArgs, formatOpcToolsPrompt, parseOpcToolCall } from './opc-tools.ts'

const social = {
  name: 'social_load',
  description: '按产品目录装填六平台弹药',
  moduleId: 'social-ammo',
  parameters: { text: { type: 'string' as const, description: '用户原话', required: false } },
}

test('没有工具时不拼协议段', () => {
  assert.equal(formatOpcToolsPrompt([]), '')
})

test('工具目录告诉模型用 JSON 点名', () => {
  const prompt = formatOpcToolsPrompt([
    social,
    {
      name: 'todos_list',
      description: '列出待办',
      moduleId: 'todos',
      parameters: {},
    },
  ])
  assert.match(prompt, /social_load/)
  assert.match(prompt, /todos_list/)
  assert.match(prompt, /"tool"/)
  assert.match(prompt, /无参数/)
  assert.match(prompt, /一次只调一个工具/)
})

test('从助手回复里抽出工具调用；围栏和多余文字都能吃', () => {
  assert.deepEqual(parseOpcToolCall('{"tool":"social_load","args":{"text":"装填弹药"}}'), {
    name: 'social_load',
    args: { text: '装填弹药' },
  })
  assert.deepEqual(
    parseOpcToolCall('好的\n```json\n{"tool":"todos_list","args":{}}\n```\n'),
    { name: 'todos_list', args: {} },
  )
  assert.equal(parseOpcToolCall('已装填弹药'), null)
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
