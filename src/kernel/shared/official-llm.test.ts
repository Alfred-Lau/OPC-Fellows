import assert from 'node:assert/strict'
import test from 'node:test'
import {
  collectOfficialLlmText,
  completeViaOfficialLlm,
  officialLlmSystem,
} from './official-llm.ts'

test('官方 llm 文本只拼 text-delta，错误流丢弃', () => {
  assert.equal(
    collectOfficialLlmText([
      { type: 'text-delta', text: '已' },
      { type: 'text-delta', text: '拆好' },
      { type: 'finish', reason: 'stop' },
    ]),
    '已拆好',
  )
  assert.equal(collectOfficialLlmText([{ type: 'finish', reason: 'error' }]), undefined)
  assert.equal(officialLlmSystem('拆成待办', true), '拆成待办\n只输出 JSON，不要 Markdown。')
  assert.equal(officialLlmSystem('只输出 JSON 数组', true), '只输出 JSON 数组')
})

test('completeViaOfficialLlm 能吃 stream，失败退回 undefined', async () => {
  const text = await completeViaOfficialLlm(
    {
      async *stream() {
        yield { type: 'text-delta', text: '{"ok":true}' }
        yield { type: 'finish', reason: 'stop' }
      },
    },
    {
      provider: 'deepseek-official',
      model: 'deepseek-chat',
      system: '只输出 JSON',
      messages: [{ role: 'user', content: '拆' }],
    },
  )
  assert.equal(text, '{"ok":true}')
  assert.equal(await completeViaOfficialLlm(undefined, {
    provider: 'deepseek-official',
    model: 'deepseek-chat',
    system: 'x',
    messages: [{ role: 'user', content: 'y' }],
  }), undefined)
})
