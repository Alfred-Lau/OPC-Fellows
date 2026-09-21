import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  allowsHostFastPathInvoke,
  bridgeToolPolicy,
  catalogToolsForTurn,
  denyBridgeToolNames,
  executeOfficialToolIfPossible,
  hostFastPathInvokeGate,
  isAllowedBridgeTool,
  loopbackToolBridgeUrl,
  officialToolText,
  pickToolBridgeTurn,
  readToolBridgeAuth,
  restrictToolsIfPossible,
  scrubSecretEnv,
  toolBridgeEnv,
  writeToolBridgeAuth,
  type HostFastPathInvokeGate,
  type OpcToolBridgeTurn,
} from './opc-tool-bridge.ts'

const turn: OpcToolBridgeTurn = {
  sessionId: 'opc:thread:social-ammo:social-ammo',
  threadId: 'thread:social-ammo',
  agentId: 'social-ammo',
  cwd: '/tmp/opc-fellows/agents/social-ammo',
  writeAllowed: false,
  allowedTools: ['social_load', 'todos_list'],
}

test('工具桥环境变量带 token 才写出', () => {
  assert.deepEqual(toolBridgeEnv({ token: '', port: 18755 }), {})
  const env = toolBridgeEnv({ token: 'abc', port: 18755 })
  assert.equal(env.OPC_TOOL_BRIDGE_URL, 'http://127.0.0.1:18755')
  assert.equal(env.OPC_TOOL_BRIDGE_TOKEN, 'abc')
})

test('回合按 allowedTools 裁 catalog', () => {
  assert.equal(isAllowedBridgeTool(turn, 'social_load'), true)
  assert.equal(isAllowedBridgeTool(turn, 'unknown_tool'), false)
  assert.deepEqual(
    catalogToolsForTurn([{ name: 'social_load' }, { name: 'unknown_tool' }], turn).map((item) => item.name),
    ['social_load'],
  )
})

test('按 session id 找回合', () => {
  const turns = new Map<string, OpcToolBridgeTurn>([[turn.sessionId, turn]])
  assert.equal(pickToolBridgeTurn(turns, turn.sessionId)?.agentId, 'social-ammo')
  assert.equal(pickToolBridgeTurn(turns, 'missing'), null)
  assert.equal(pickToolBridgeTurn(turns, 'opc:thread'), null)
  assert.equal(pickToolBridgeTurn(turns), null)
  const aliased = new Map<string, OpcToolBridgeTurn>([
    [turn.sessionId, turn],
    [`${turn.sessionId}:boot1`, turn],
  ])
  assert.equal(pickToolBridgeTurn(aliased, `${turn.sessionId}:boot1`)?.agentId, 'social-ammo')
})

test('子进程环境要刮掉 token 和 API key', () => {
  const next = scrubSecretEnv({
    PATH: '/usr/bin',
    DEEPSEEK_API_KEY: 'sk-secret',
    OPC_TOOL_BRIDGE_TOKEN: 'bridge',
  })
  assert.equal(next.PATH, '/usr/bin')
  assert.equal(next.DEEPSEEK_API_KEY, undefined)
  assert.equal(next.OPC_TOOL_BRIDGE_TOKEN, undefined)
})

test('政策：目录外交给官方管道，越权和计划模式拒写', () => {
  assert.equal(
    bridgeToolPolicy({ toolName: 'read', turn, inCatalog: false, writeTool: false }),
    'unknown',
  )
  assert.equal(
    bridgeToolPolicy({ toolName: 'unknown_tool', turn, inCatalog: true, writeTool: false }),
    'deny',
  )
  assert.equal(
    bridgeToolPolicy({ toolName: 'social_load', turn, inCatalog: true, writeTool: true }),
    'deny',
  )
  assert.equal(
    bridgeToolPolicy({
      toolName: 'social_load',
      turn: { ...turn, writeAllowed: true },
      inCatalog: true,
      writeTool: true,
    }),
    'allow',
  )
  assert.deepEqual(denyBridgeToolNames(['social_load', 'todos_list', 'notes_add'], turn.allowedTools), [
    'notes_add',
  ])
  const restricted: string[][] = []
  const lift = restrictToolsIfPossible(
    {
      restrict: (filter: unknown) => {
        restricted.push((filter as { deny: string[] }).deny)
        return () => undefined
      },
    },
    ['notes_add'],
  )
  assert.deepEqual(restricted, [['notes_add']])
  assert.equal(typeof lift, 'function')
})

test('口令快路径走官方 execute，失败再退回 opcTools', async () => {
  assert.equal(allowsHostFastPathInvoke('social_load'), true)
  assert.equal(allowsHostFastPathInvoke('bash'), false)
  assert.equal(
    officialToolText({
      isError: false,
      value: '已装填',
    }),
    '已装填',
  )
  assert.equal(officialToolText({ isError: true, value: 'x' }), undefined)
  assert.equal(
    officialToolText({
      isError: false,
      content: [{ type: 'text', text: '记下了' }],
    }),
    '记下了',
  )
  const executed: unknown[] = []
  const text = await executeOfficialToolIfPossible(
    {
      execute: async (exec) => {
        executed.push(exec.name)
        return { isError: false, value: `ok:${exec.name}` }
      },
    },
    'social_load',
    { text: '装填弹药' },
  )
  assert.deepEqual(executed, ['social_load'])
  assert.equal(text, 'ok:social_load')
  assert.equal(await executeOfficialToolIfPossible(undefined, 'social_load', {}), undefined)
  assert.equal(
    await executeOfficialToolIfPossible(
      {
        execute: async () => ({ isError: true }),
      },
      'social_load',
      {},
    ),
    undefined,
  )
})

test('工具桥凭据写 0600 文件，不依赖环境变量', () => {
  const dir = mkdtempSync(join(tmpdir(), 'opc-bridge-'))
  try {
    writeToolBridgeAuth(dir, { url: 'http://127.0.0.1:18755/', token: 'abc' })
    const auth = readToolBridgeAuth(dir, {})
    assert.deepEqual(auth, { url: 'http://127.0.0.1:18755', token: 'abc' })
    assert.match(readFileSync(join(dir, 'kernel', 'tool-bridge.json'), 'utf8'), /"token":"abc"/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

/** 拒绝分支的收窄助手：不是 reject 就直接判失败。 */
function rejectGateOf(gate: HostFastPathInvokeGate): { status: number; code: string; error: string } {
  if (gate.action !== 'reject') {
    assert.fail(`应当 409 拒绝，实际 ${gate.action}`)
  }
  return gate
}

test('工具桥只接受本机回环地址', () => {
  assert.equal(loopbackToolBridgeUrl('http://127.0.0.1:18755'), 'http://127.0.0.1:18755')
  assert.equal(loopbackToolBridgeUrl('  http://localhost:18755/  '), 'http://localhost:18755')
  assert.equal(loopbackToolBridgeUrl('http://127.0.0.1:18755///'), 'http://127.0.0.1:18755')
  for (const raw of [
    'http://evil.example.com',
    'https://evil.example.com/agent/tools',
    'http://127.0.0.1.evil.example.com:18755',
    'http://192.168.1.9:18755',
    'file:///etc/passwd',
    '',
    '   ',
    'not-a-url',
  ]) {
    assert.equal(loopbackToolBridgeUrl(raw), '', `「${raw}」不是本机，必须拒绝`)
  }
})

test('凭据里的外部 host fail-closed，不退回环境变量', () => {
  const dir = mkdtempSync(join(tmpdir(), 'opc-bridge-hostile-'))
  try {
    writeToolBridgeAuth(dir, { url: 'http://evil.example.com', token: 'stolen' })
    assert.equal(
      readToolBridgeAuth(dir, {
        OPC_TOOL_BRIDGE_URL: 'http://127.0.0.1:18755',
        OPC_TOOL_BRIDGE_TOKEN: 'env-token',
      }),
      null,
    )
    assert.equal(
      readToolBridgeAuth(undefined, {
        OPC_TOOL_BRIDGE_URL: 'http://evil.example.com',
        OPC_TOOL_BRIDGE_TOKEN: 'env-token',
      }),
      null,
    )
    writeToolBridgeAuth(dir, { url: 'http://127.0.0.1:18755/', token: 'abc' })
    assert.deepEqual(readToolBridgeAuth(dir, { OPC_TOOL_BRIDGE_URL: 'http://evil.example.com' }), {
      url: 'http://127.0.0.1:18755',
      token: 'abc',
    })
    assert.deepEqual(
      readToolBridgeAuth(undefined, {
        OPC_TOOL_BRIDGE_URL: 'http://localhost:18755',
        OPC_TOOL_BRIDGE_TOKEN: 't',
      }),
      { url: 'http://localhost:18755', token: 't' },
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('没有回合的快路径门：写类与目录外一律 409，只读本职才放行', () => {
  assert.deepEqual(
    hostFastPathInvokeGate({
      name: 'todos_list',
      sessionId: '',
      turnFound: false,
      inCatalog: true,
      effect: 'read',
    }),
    { action: 'read', writeAllowed: false },
  )
  assert.deepEqual(
    hostFastPathInvokeGate({
      name: 'todos_list',
      sessionId: 'opc:thread:kernel-work',
      turnFound: false,
      inCatalog: true,
      effect: 'read',
    }),
    { action: 'read', writeAllowed: false },
  )

  const ingest = rejectGateOf(
    hostFastPathInvokeGate({
      name: 'todos_ingest',
      sessionId: '',
      turnFound: false,
      inCatalog: true,
      effect: 'write',
    }),
  )
  assert.equal(ingest.status, 409)
  assert.equal(ingest.code, 'no_turn')

  const publish = rejectGateOf(
    hostFastPathInvokeGate({
      name: 'social_publish',
      sessionId: '',
      turnFound: false,
      inCatalog: true,
      effect: 'write',
    }),
  )
  assert.equal(publish.status, 409)
  assert.equal(publish.code, 'no_turn')

  // 目录里没声明 effect 的工具按写类处理，不给快路径。
  assert.equal(
    rejectGateOf(hostFastPathInvokeGate({ name: 'social_recap', sessionId: '', turnFound: false, inCatalog: true }))
      .code,
    'no_turn',
  )
  // 目录外（inCatalog:false）即使 effect 是 read 也不放行。
  assert.equal(
    rejectGateOf(
      hostFastPathInvokeGate({
        name: 'todos_list',
        sessionId: '',
        turnFound: false,
        inCatalog: false,
        effect: 'read',
      }),
    ).code,
    'no_turn',
  )
  // 非本职工具（fs / bash）本来就不在快路径。
  assert.equal(
    rejectGateOf(
      hostFastPathInvokeGate({ name: 'bash', sessionId: '', turnFound: false, inCatalog: true, effect: 'read' }),
    ).code,
    'no_turn',
  )

  // 带 sessionId 但回合解析不到：仍是 409，只是 code 换成 turn_unresolved。
  const unresolved = rejectGateOf(
    hostFastPathInvokeGate({
      name: 'social_publish',
      sessionId: 'opc:thread:social-ammo',
      turnFound: false,
      inCatalog: true,
      effect: 'write',
    }),
  )
  assert.equal(unresolved.status, 409)
  assert.equal(unresolved.code, 'turn_unresolved')

  // 有回合就回到统一路径，快路径不插手。
  assert.deepEqual(
    hostFastPathInvokeGate({
      name: 'social_publish',
      sessionId: 'opc:thread:social-ammo',
      turnFound: true,
      inCatalog: true,
      effect: 'write',
    }),
    { action: 'use-turn' },
  )
})
