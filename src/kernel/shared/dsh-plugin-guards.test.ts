import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * dsh 侧插件（packages 下各职业包的 dsh-plugin.js）的安全修复单测。
 * 之前只对着源码文本断言，这里改成直接调导出的纯函数，回归才拦得住。
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')

interface PreToolDecision {
  kind: string
  reason?: string
}

interface PluginModule {
  name: string
  loopbackToolBridgeBase: (raw: unknown) => string
  readToolBridgeAuth: () => { base: string; token: string } | null
  toPreToolDecision?: (decision: unknown, reason?: unknown) => PreToolDecision | null
  preExecuteDecision?: (decision: unknown, reason: unknown, next: () => unknown) => unknown
  apply: (ctx: unknown) => Promise<void>
}

const PLUGIN_IDS = ['opc-kernel', 'occupation-social-ammo', 'occupation-kernel-work'] as const

const loaded = new Map<string, PluginModule>()

async function plugin(id: (typeof PLUGIN_IDS)[number]): Promise<PluginModule> {
  const cached = loaded.get(id)
  if (cached) {
    return cached
  }
  const href = pathToFileURL(join(repoRoot, 'packages', id, 'dsh-plugin.js')).href
  const mod = (await import(href)) as PluginModule
  loaded.set(id, mod)
  return mod
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
    return
  }
  process.env[key] = value
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

test('插件侧工具桥只接受本机回环地址', async () => {
  const cases: ReadonlyArray<readonly [unknown, string]> = [
    ['http://127.0.0.1:18755', 'http://127.0.0.1:18755'],
    ['  http://localhost:18755/  ', 'http://localhost:18755'],
    ['http://127.0.0.1:18755///', 'http://127.0.0.1:18755'],
    // 非本机一律返回空串（falsy = 调用方必须拒绝加载整个工具桥）
    ['http://evil.example.com', ''],
    ['https://evil.example.com/agent/tools', ''],
    ['http://127.0.0.1.evil.example.com:18755', ''],
    ['http://10.0.0.7:18755', ''],
    ['file:///etc/passwd', ''],
    ['', ''],
    ['   ', ''],
    ['not-a-url', ''],
    [null, ''],
    [undefined, ''],
    [42, ''],
  ]
  for (const id of PLUGIN_IDS) {
    const mod = await plugin(id)
    for (const [raw, want] of cases) {
      const got = mod.loopbackToolBridgeBase(raw)
      assert.equal(got, want, `${id}: loopbackToolBridgeBase(${String(raw)})`)
      assert.equal(Boolean(got), Boolean(want), `${id}: ${String(raw)} 的真假值`)
    }
  }
})

test('插件读凭据：外部 host 一律 null，且不退回环境变量', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'opc-plugin-bridge-'))
  const saved = {
    userData: process.env.OPC_USER_DATA,
    url: process.env.OPC_TOOL_BRIDGE_URL,
    token: process.env.OPC_TOOL_BRIDGE_TOKEN,
  }
  try {
    mkdirSync(join(dir, 'kernel'), { recursive: true })
    const authFile = join(dir, 'kernel', 'tool-bridge.json')
    for (const id of PLUGIN_IDS) {
      const mod = await plugin(id)

      delete process.env.OPC_USER_DATA
      process.env.OPC_TOOL_BRIDGE_URL = 'http://evil.example.com'
      process.env.OPC_TOOL_BRIDGE_TOKEN = 'env-token'
      assert.equal(mod.readToolBridgeAuth(), null, `${id}: 环境变量里的外部 host 必须拒绝`)

      process.env.OPC_TOOL_BRIDGE_URL = 'http://127.0.0.1:18755'
      assert.deepEqual(
        mod.readToolBridgeAuth(),
        { base: 'http://127.0.0.1:18755', token: 'env-token' },
        `${id}: 环境变量里的回环地址照常`,
      )

      writeFileSync(authFile, `${JSON.stringify({ url: 'http://evil.example.com', token: 'stolen' })}\n`)
      process.env.OPC_USER_DATA = dir
      process.env.OPC_TOOL_BRIDGE_URL = 'http://127.0.0.1:18755'
      assert.equal(
        mod.readToolBridgeAuth(),
        null,
        `${id}: 凭据文件里的外部 host 必须拒绝，不许退回环境变量`,
      )

      writeFileSync(authFile, `${JSON.stringify({ url: 'http://localhost:18755/', token: 'file-token' })}\n`)
      assert.deepEqual(
        mod.readToolBridgeAuth(),
        { base: 'http://localhost:18755', token: 'file-token' },
        `${id}: 凭据文件里的回环地址照常`,
      )
    }
  } finally {
    restoreEnv('OPC_USER_DATA', saved.userData)
    restoreEnv('OPC_TOOL_BRIDGE_URL', saved.url)
    restoreEnv('OPC_TOOL_BRIDGE_TOKEN', saved.token)
    rmSync(dir, { recursive: true, force: true })
  }
})

test('toPreToolDecision 返回官方对象，未知决策必须是 null 而不是裸字符串', async () => {
  const mod = await plugin('opc-kernel')
  const toPreToolDecision = mod.toPreToolDecision
  assert.equal(typeof toPreToolDecision, 'function')
  if (!toPreToolDecision) {
    assert.fail('opc-kernel 应导出 toPreToolDecision')
  }

  assert.deepEqual(toPreToolDecision('allow'), { kind: 'allow' })
  assert.deepEqual(toPreToolDecision('allow', '忽略这个 reason'), { kind: 'allow' })
  assert.deepEqual(toPreToolDecision('deny', ' 越权了 '), { kind: 'deny', reason: '越权了' })
  assert.deepEqual(toPreToolDecision('deny', ''), { kind: 'deny', reason: 'OPC 拒绝这次工具调用。' })
  assert.deepEqual(toPreToolDecision('deny', '   '), { kind: 'deny', reason: 'OPC 拒绝这次工具调用。' })
  assert.deepEqual(toPreToolDecision('deny'), { kind: 'deny', reason: 'OPC 拒绝这次工具调用。' })
  assert.deepEqual(toPreToolDecision('deny', null), { kind: 'deny', reason: 'OPC 拒绝这次工具调用。' })
  assert.deepEqual(toPreToolDecision('ask', '要确认'), { kind: 'ask', reason: '要确认' })
  assert.deepEqual(toPreToolDecision('ask'), { kind: 'ask' })
  assert.deepEqual(toPreToolDecision('ask', '  '), { kind: 'ask' })

  for (const bad of ['unknown', '', ' ', 'ALLOW', 'Allow', 0, 1, null, undefined, {}, [], ['allow'], true]) {
    const mapped = toPreToolDecision(bad)
    assert.equal(mapped, null, `未知决策 ${JSON.stringify(bad) ?? String(bad)} 必须返回 null`)
    assert.notEqual(typeof mapped, 'string', '未知决策不能返回裸字符串')
  }
})

test('preExecuteDecision：未知决策交给 next()，已知决策不返回裸字符串', async () => {
  const mod = await plugin('opc-kernel')
  const preExecuteDecision = mod.preExecuteDecision
  assert.equal(typeof preExecuteDecision, 'function')
  if (!preExecuteDecision) {
    assert.fail('opc-kernel 应导出 preExecuteDecision')
  }

  let nextCalls = 0
  const next = () => {
    nextCalls += 1
    throw new Error('已知决策不该走 next()')
  }

  assert.deepEqual(preExecuteDecision('allow', '可以', next), { kind: 'allow' })
  assert.deepEqual(preExecuteDecision('deny', '不行', next), { kind: 'deny', reason: '不行' })
  assert.deepEqual(preExecuteDecision('ask', '要确认', next), { kind: 'ask', reason: '要确认' })
  assert.equal(nextCalls, 0)

  const fallback = { kind: 'native-pipeline' }
  let fallbackCalls = 0
  const fallbackNext = () => {
    fallbackCalls += 1
    return fallback
  }
  for (const bad of ['unknown', '', undefined, null, 0, {}, []]) {
    assert.equal(
      preExecuteDecision(bad, '', fallbackNext),
      fallback,
      `未知决策 ${String(bad)} 必须原样交给 next()`,
    )
  }
  assert.equal(fallbackCalls, 7)
})

test('opc-kernel 政策桥：deny/allow 返回对象，未知决策与非 OPC 工具放行给官方管道', async () => {
  const mod = await plugin('opc-kernel')
  const originalFetch = globalThis.fetch
  const handlers = new Map<string, (call: unknown, next: () => unknown) => unknown>()
  const registered: unknown[] = []
  const ctx = {
    systemPrompt: { section: () => undefined, context: () => undefined },
    tools: { register: (tool: unknown) => registered.push(tool) },
    on: (event: string, handler: (call: unknown, next: () => unknown) => unknown) => {
      handlers.set(event, handler)
    },
  }
  const saved = {
    userData: process.env.OPC_USER_DATA,
    url: process.env.OPC_TOOL_BRIDGE_URL,
    token: process.env.OPC_TOOL_BRIDGE_TOKEN,
  }
  const seen: string[] = []
  let payload: unknown = { decision: 'allow', reason: '' }
  let fetchThrows = false

  try {
    delete process.env.OPC_USER_DATA
    process.env.OPC_TOOL_BRIDGE_URL = 'http://127.0.0.1:18755'
    process.env.OPC_TOOL_BRIDGE_TOKEN = 'test-token'
    globalThis.fetch = (async (input: unknown) => {
      const url = String(input)
      seen.push(url)
      if (fetchThrows) {
        throw new Error('policy service down')
      }
      if (url.endsWith('/agent/tools')) {
        return jsonResponse({ tools: [] })
      }
      if (url.endsWith('/agent/tools/policy')) {
        return jsonResponse(payload)
      }
      throw new Error(`unexpected fetch ${url}`)
    }) as typeof globalThis.fetch

    await mod.apply(ctx)

    const handler = handlers.get('tools/pre-execute')
    assert.equal(typeof handler, 'function')
    if (!handler) {
      assert.fail('opc-kernel 应挂 tools/pre-execute')
    }

    let nextCalls = 0
    const next = () => {
      nextCalls += 1
      return { kind: 'official-pipeline' }
    }

    assert.deepEqual(await handler({ name: 'social_load', sessionId: 'opc:thread:social-ammo' }, next), {
      kind: 'allow',
    })
    assert.equal(nextCalls, 0)

    payload = { decision: 'deny', reason: '越权改文件' }
    assert.deepEqual(await handler({ name: 'bash', sessionId: 'opc:thread:social-ammo' }, next), {
      kind: 'deny',
      reason: '越权改文件',
    })
    assert.equal(nextCalls, 0)

    payload = { decision: 'ask', reason: '要用户确认' }
    assert.deepEqual(await handler({ name: 'social_publish', sessionId: 'opc:thread:social-ammo' }, next), {
      kind: 'ask',
      reason: '要用户确认',
    })
    assert.equal(nextCalls, 0)

    // 政策服务返回的决策不认识：交给官方管道，不能返回裸字符串。
    payload = { decision: 'not-a-decision' }
    assert.deepEqual(await handler({ name: 'bash', sessionId: 'opc:thread:social-ammo' }, next), {
      kind: 'official-pipeline',
    })
    assert.equal(nextCalls, 1)

    payload = {}
    assert.deepEqual(await handler({ name: 'read', sessionId: 'opc:thread:social-ammo' }, next), {
      kind: 'official-pipeline',
    })
    assert.equal(nextCalls, 2)

    // 政策服务不可用也不能误杀 fs / bash。
    fetchThrows = true
    assert.deepEqual(await handler({ name: 'read', sessionId: 'opc:thread:social-ammo' }, next), {
      kind: 'official-pipeline',
    })
    assert.equal(nextCalls, 3)

    // 没名字的调用同样交给官方管道。
    fetchThrows = false
    payload = { decision: 'deny' }
    assert.deepEqual(await handler({ name: '', sessionId: 'opc:thread:social-ammo' }, next), {
      kind: 'official-pipeline',
    })
    assert.equal(nextCalls, 4)

    assert.ok(seen.some((url) => url.endsWith('/agent/tools')))
    assert.ok(seen.some((url) => url.endsWith('/agent/tools/policy')))
    assert.equal(registered.length, 0)
  } finally {
    globalThis.fetch = originalFetch
    restoreEnv('OPC_USER_DATA', saved.userData)
    restoreEnv('OPC_TOOL_BRIDGE_URL', saved.url)
    restoreEnv('OPC_TOOL_BRIDGE_TOKEN', saved.token)
  }
})
