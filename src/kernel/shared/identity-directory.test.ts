import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import test from 'node:test'
import type { AgentRecord } from './agent.ts'
import {
  defaultIdentityDirectory,
  fillMissingIdentityDirectories,
  hasIdentityDirectory,
  identityDirectoryRoot,
  identityDirectorySlug,
  isAppUserDataRoot,
  legacyIdentityDirectory,
  nextAvailableFile,
  resolveAgentWorkspacePath,
  resolveIdentityDirectory,
  takenIdentityDirectories,
} from './identity-directory.ts'

const clock = '2026-09-16T06:00:00.000Z'

function agent(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: 'rumi',
    templateId: 'blank',
    title: 'Rumi',
    mark: 'R',
    description: '',
    hue: 4,
    kind: 'conversational',
    origin: 'user',
    moduleIds: [],
    workspaceName: '工作台',
    singleton: false,
    status: 'ready',
    createdAt: clock,
    updatedAt: clock,
    ...overrides,
  }
}

test('默认身份目录用公开产品名 OPC-Fellows/agents', () => {
  assert.equal(identityDirectorySlug('随手记'), '随手记')
  assert.equal(identityDirectorySlug('Hello World'), 'hello-world')
  assert.equal(identityDirectoryRoot('/tmp/home'), resolve('/tmp/home/OPC-Fellows/agents'))
  assert.equal(defaultIdentityDirectory('/tmp/home', '随手记'), resolve('/tmp/home/OPC-Fellows/agents/随手记'))
  assert.equal(
    defaultIdentityDirectory('/tmp/home', '随手记', ['/tmp/home/OPC-Fellows/agents/随手记']),
    resolve('/tmp/home/OPC-Fellows/agents/随手记-2'),
  )
})

test('表单另选的路径优先生效，不跟默认 slug', () => {
  assert.equal(
    resolveIdentityDirectory('/tmp/home', '随手记', [], '/tmp/opc-fellows/agents/notes'),
    resolve('/tmp/opc-fellows/agents/notes'),
  )
})

test('窗身份没有身份目录；对话和仪表成员才有', () => {
  assert.equal(hasIdentityDirectory(agent()), true)
  assert.equal(hasIdentityDirectory(agent({ kind: 'dashboard' })), true)
  assert.equal(hasIdentityDirectory(agent({ kind: 'window' })), false)
  assert.equal(hasIdentityDirectory(agent({ kind: 'background' })), false)
})

test('绑在 Electron userData 根目录上的不算身份目录', () => {
  assert.equal(isAppUserDataRoot('/tmp/userData', '/tmp/userData'), true)
  assert.equal(isAppUserDataRoot('/tmp/userData/workspaces/notes', '/tmp/userData'), false)
  assert.equal(
    resolveAgentWorkspacePath({
      kind: 'dashboard',
      workspacePath: '/tmp/userData',
      title: '随手记',
      agentId: 'notes',
      home: '/tmp/home',
      userData: '/tmp/userData',
    }),
    resolve('/tmp/home/OPC-Fellows/agents/随手记'),
  )
})

test('已有 workspacePath 的成员不会被改绑', () => {
  const existing = agent({
    id: 'host',
    title: '主理人',
    workspacePath: '/tmp/userData/workspaces/host',
  })
  const fresh = agent({ id: 'notes', title: '随手记' })
  const next = fillMissingIdentityDirectories([existing, fresh], '/tmp/home', takenIdentityDirectories([existing]))
  assert.equal(next[0]?.workspacePath, resolve('/tmp/userData/workspaces/host'))
  assert.equal(next[1]?.workspacePath, resolve('/tmp/home/OPC-Fellows/agents/随手记'))
})

test('旧成员回落仍是 userData/workspaces，不自动搬家', () => {
  assert.equal(legacyIdentityDirectory('/tmp/userData', 'host'), resolve('/tmp/userData/workspaces/host'))
  assert.equal(
    resolveAgentWorkspacePath({
      kind: 'conversational',
      title: '主理人',
      agentId: 'host',
      home: '/tmp/home',
      userData: '/tmp/userData',
      legacyExists: true,
    }),
    resolve('/tmp/userData/workspaces/host'),
  )
  assert.equal(
    resolveAgentWorkspacePath({
      kind: 'window',
      title: '台伴',
      agentId: 'companion',
      home: '/tmp/home',
      userData: '/tmp/userData',
    }),
    undefined,
  )
})

test('生成文件撞名时加后缀，不覆盖', () => {
  const exists = new Set([join('/tmp/opc-fellows/agents/notes', 'note.md')])
  assert.equal(
    nextAvailableFile('/tmp/opc-fellows/agents/notes', 'note.md', (path) => exists.has(path)),
    join('/tmp/opc-fellows/agents/notes', 'note-2.md'),
  )
})
