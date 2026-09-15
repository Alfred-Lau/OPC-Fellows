import assert from 'node:assert/strict'
import test from 'node:test'
import {
  describeLlmKeyStatus,
  maskDeepSeekApiKey,
  resolveLlmApiKey,
} from './deepseek.ts'

test('解析顺序：环境变量优先于设置页，设置页优先于 Harness 遗留', () => {
  assert.deepEqual(resolveLlmApiKey({ env: ' sk-env ', stored: 'sk-stored', legacy: 'sk-legacy' }), {
    key: 'sk-env',
    source: 'env',
  })
  assert.deepEqual(resolveLlmApiKey({ stored: 'sk-stored', legacy: 'sk-legacy' }), {
    key: 'sk-stored',
    source: 'stored',
  })
  assert.deepEqual(resolveLlmApiKey({ legacy: 'sk-legacy' }), {
    key: 'sk-legacy',
    source: 'legacy',
  })
  assert.deepEqual(resolveLlmApiKey({}), { key: null, source: 'none' })
})

test('DeepSeek key 打码只露尾号', () => {
  assert.equal(maskDeepSeekApiKey('sk-abcdefghijklmnop'), 'sk-…mnop')
  assert.equal(maskDeepSeekApiKey('plain-key-1234'), '…1234')
  assert.equal(maskDeepSeekApiKey('  '), '')
  assert.equal(maskDeepSeekApiKey(null), '')
})

test('设置页按来源说明 key 状态', () => {
  assert.equal(
    describeLlmKeyStatus({ hasApiKey: true, keyPreview: 'sk-…mnop', keySource: 'stored' }),
    '已配置 sk-…mnop（本机加密存储）',
  )
  assert.equal(
    describeLlmKeyStatus({ hasApiKey: true, keyPreview: 'sk-…env1', keySource: 'env' }),
    '已配置 sk-…env1（来自环境变量 DEEPSEEK_API_KEY）',
  )
  assert.equal(
    describeLlmKeyStatus({ hasApiKey: true, keyPreview: 'sk-…dsh1', keySource: 'legacy' }),
    '已配置 sk-…dsh1（来自 DeepSeek Harness 遗留配置，建议改存到这里）',
  )
  assert.equal(
    describeLlmKeyStatus({ hasApiKey: false, keyPreview: '', keySource: 'none' }),
    '未配置。到 platform.deepseek.com 复制一把 API Key。',
  )
})
