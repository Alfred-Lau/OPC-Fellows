import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  catalogToolsForTurn,
  isAllowedBridgeTool,
  pickToolBridgeTurn,
  readToolBridgeAuth,
  scrubSecretEnv,
  toolBridgeEnv,
  writeToolBridgeAuth,
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
