import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { DEEPSEEK_MODEL, DEEPSEEK_MODEL_LABEL } from './deepseek.ts'
import {
  DEFAULT_DEEPSEEK_URL,
  DEEPSEEK_PROVIDER,
  dshSdkCall,
  llmCompletionsUrl,
  llmOverlayYaml,
  openaiCompatOverlayYaml,
  resolveLlmRuntime,
} from './llm-overlay.ts'

const repoRoot = join(import.meta.dirname, '../..')

test('官方 DeepSeek 默认不写 overlay；自定义网关才叠 llm-deepseek', () => {
  const official = resolveLlmRuntime({ apiKey: 'sk-stored', keySource: 'stored' })
  assert.equal(official.provider, DEEPSEEK_PROVIDER)
  assert.equal(official.model, DEEPSEEK_MODEL)
  assert.equal(official.modelLabel, DEEPSEEK_MODEL_LABEL)
  assert.equal(official.apiUrl, DEFAULT_DEEPSEEK_URL)
  assert.equal(llmOverlayYaml(official), null)
  assert.deepEqual(dshSdkCall(official), { provider: DEEPSEEK_PROVIDER, model: DEEPSEEK_MODEL })
  assert.equal(llmCompletionsUrl(official.apiUrl), `${DEFAULT_DEEPSEEK_URL}/chat/completions`)
  assert.equal(
    llmCompletionsUrl('https://llm.example.com/v1/chat/completions'),
    'https://llm.example.com/v1/chat/completions',
  )

  const custom = resolveLlmRuntime({
    apiKey: 'sk-custom',
    env: {
      DEEPSEEK_API_URL: 'https://llm.example.com/v1/',
      DEEPSEEK_MODEL: 'custom-flash',
    },
  })
  assert.equal(custom.apiUrl, 'https://llm.example.com/v1')
  assert.equal(custom.model, 'custom-flash')
  const yaml = llmOverlayYaml(custom)
  assert.ok(yaml)
  assert.match(yaml, /id: llm-deepseek/)
  assert.match(yaml, /apiKeyEnv: DEEPSEEK_API_KEY/)
  assert.match(yaml, /llm\.example\.com\/v1/)
  assert.match(yaml, /custom-flash/)
  assert.match(yaml, /provider: deepseek-official/)
  assert.doesNotMatch(yaml, /dashscope/)
  assert.doesNotMatch(yaml, /skylark/)
  assert.deepEqual(dshSdkCall(custom), { provider: DEEPSEEK_PROVIDER, model: 'custom-flash' })
})

test('overlay YAML 是数组，接到 llm-deepseek 不另开提供方', () => {
  const yaml = openaiCompatOverlayYaml({
    apiUrl: 'https://llm.example.com/v1',
    model: 'custom-flash',
    modelLabel: 'custom-flash',
  })
  assert.match(yaml, /id: agent-default-model/)
  assert.doesNotMatch(yaml, /id: llm-pi-ai/)
})

test('boot / spawn 叠 overlay，写闸统一 workspace-write', () => {
  const boot = readFileSync(join(repoRoot, 'src/kernel/main/boot.ts'), 'utf8')
  const desktop = readFileSync(join(repoRoot, 'src/kernel/shared/dsh-desktop-profile.ts'), 'utf8')
  const runtime = readFileSync(join(repoRoot, 'src/kernel/main/services/dsh-runtime.ts'), 'utf8')
  assert.match(desktop, /parseDesktopOverlayYaml/)
  assert.match(desktop, /overlayYaml/)
  assert.match(boot, /overlayYaml/)
  assert.match(boot, /llmOverlayYaml/)
  assert.match(boot, /DSH_PERMISSION_MODE = 'workspace-write'/)
  assert.match(runtime, /dshSdkCall\(resolveActiveLlm\(\)\)/)
  assert.match(runtime, /DSH_PERMISSION_MODE:\s*'workspace-write'/)
  assert.match(runtime, /--patch/)
  assert.doesNotMatch(runtime, /danger-full-access/)
  assert.doesNotMatch(boot, /dashscope/)
})
