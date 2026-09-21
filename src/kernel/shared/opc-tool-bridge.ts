/**
 * dsh 进程里的 defineTool 经本机 Local API 调回 Electron ctx.opcTools。
 * 职业执行仍在主进程；模型看见的是 dsh 原生工具 schema。
 */

import { randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { LOCAL_API_PORT } from '../../main/local-api-port.ts'
import { occupationNativeToolNames } from './occupation-bundles.ts'
import { isWriteTool, type OpcToolEffect, type OpcToolInfo, type OpcToolParameters } from './opc-tools.ts'

export const OPC_TOOL_BRIDGE_URL_ENV = 'OPC_TOOL_BRIDGE_URL'
export const OPC_TOOL_BRIDGE_TOKEN_ENV = 'OPC_TOOL_BRIDGE_TOKEN'

export const OPC_TOOL_BRIDGE_CATALOG_PATH = '/agent/tools'
export const OPC_TOOL_BRIDGE_INVOKE_PATH = '/agent/tools/invoke'
export const OPC_TOOL_BRIDGE_POLICY_PATH = '/agent/tools/policy'
export const OPC_TOOL_BRIDGE_APPROVAL_PATH = '/agent/approval/ask'
export const OPC_TOOL_BRIDGE_FILE = 'kernel/tool-bridge.json'

const SECRET_ENV_KEYS = [
  OPC_TOOL_BRIDGE_TOKEN_ENV,
  'DEEPSEEK_API_KEY',
  'DASHSCOPE_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
] as const

export interface ToolBridgeAuth {
  url: string
  token: string
}

export interface OpcToolBridgeCatalogItem {
  name: string
  description: string
  parameters: OpcToolParameters
}

export interface OpcToolBridgeTurn {
  sessionId: string
  threadId: string
  agentId: string
  cwd: string
  writeAllowed: boolean
  identityDirectory?: string
  allowedTools: readonly string[]
}

export interface OpcToolBridgeInvokeRequest {
  name: string
  args: Record<string, string>
}

export function toolBridgeUrl(port: number = LOCAL_API_PORT): string {
  return `http://127.0.0.1:${String(port)}`
}

export function toolBridgeEnv(input: { token: string; port?: number }): Record<string, string> {
  const token = input.token.trim()
  if (!token) {
    return {}
  }
  return {
    [OPC_TOOL_BRIDGE_URL_ENV]: toolBridgeUrl(input.port),
    [OPC_TOOL_BRIDGE_TOKEN_ENV]: token,
  }
}

/** spawn `dsh plugin add` 这类不调模型的子进程时，不要把长期 secret 传下去。 */
export function scrubSecretEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = { ...env }
  for (const key of SECRET_ENV_KEYS) {
    delete next[key]
  }
  return next
}

export function toolBridgeAuthPath(userData: string): string {
  return join(userData, OPC_TOOL_BRIDGE_FILE)
}

export function writeToolBridgeAuth(userData: string, auth: ToolBridgeAuth): void {
  const root = userData.trim()
  const url = auth.url.trim().replace(/\/+$/, '')
  const token = auth.token.trim()
  if (!root || !url || !token) {
    return
  }
  const path = toolBridgeAuthPath(root)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify({ url, token })}\n`)
  chmodSync(path, 0o600)
}

const LOOPBACK_TOOL_BRIDGE_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

/** 工具桥只接受本机。外部 host 返回空串，调用方必须拒绝加载。 */
export function loopbackToolBridgeUrl(raw: string): string {
  const url = raw.trim().replace(/\/+$/, '')
  if (!url) {
    return ''
  }
  try {
    const host = new URL(url).hostname
    if (!LOOPBACK_TOOL_BRIDGE_HOSTS.has(host)) {
      return ''
    }
    return url
  } catch {
    return ''
  }
}

export function readToolBridgeAuth(userData?: string, env: NodeJS.ProcessEnv = process.env): ToolBridgeAuth | null {
  const root = userData?.trim() || env.OPC_USER_DATA?.trim() || ''
  if (root) {
    try {
      const raw = JSON.parse(readFileSync(toolBridgeAuthPath(root), 'utf8')) as unknown
      if (raw && typeof raw === 'object') {
        const row = raw as { url?: unknown; token?: unknown }
        const url = typeof row.url === 'string' ? row.url.trim().replace(/\/+$/, '') : ''
        const token = typeof row.token === 'string' ? row.token.trim() : ''
        if (url) {
          const base = loopbackToolBridgeUrl(url)
          if (!base) {
            return null
          }
          if (token) {
            return { url: base, token }
          }
        }
      }
    } catch {
      // 文件还没写或坏了，再看环境变量。
    }
  }
  const url = loopbackToolBridgeUrl(env[OPC_TOOL_BRIDGE_URL_ENV] ?? '')
  const token = env[OPC_TOOL_BRIDGE_TOKEN_ENV]?.trim() ?? ''
  if (url && token) {
    return { url, token }
  }
  return null
}

export function toBridgeCatalogItem(tool: OpcToolInfo): OpcToolBridgeCatalogItem {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }
}

export function stringifyToolArgs(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  const args: Record<string, string> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string') {
      args[key] = item
    } else if (item == null) {
      args[key] = ''
    } else if (typeof item === 'boolean' || typeof item === 'number') {
      args[key] = String(item)
    }
  }
  return args
}

export function isAllowedBridgeTool(turn: Pick<OpcToolBridgeTurn, 'allowedTools'>, name: string): boolean {
  return turn.allowedTools.includes(name)
}

export type BridgeToolPolicy = 'allow' | 'deny' | 'unknown'

export function denyBridgeToolNames(
  catalogNames: readonly string[],
  allowedTools: readonly string[] | undefined,
): string[] {
  if (!allowedTools) {
    return []
  }
  const allowed = new Set(allowedTools)
  return catalogNames.filter((name) => name.trim() && !allowed.has(name))
}

/** 官方 ctx.tools.restrict 的 deny 名单：只藏本回合不该看见的 OPC 工具，不动 dsh-base。 */
export function restrictToolsIfPossible(
  tools: { restrict?: (filter: unknown) => unknown } | undefined,
  deny: readonly string[],
): (() => void) | undefined {
  if (!tools || typeof tools.restrict !== 'function' || deny.length === 0) {
    return undefined
  }
  try {
    const lift = tools.restrict({ deny: [...deny] })
    return typeof lift === 'function' ? () => lift() : undefined
  } catch {
    return undefined
  }
}

export function bridgeToolPolicy(input: {
  toolName: string
  turn: Pick<OpcToolBridgeTurn, 'allowedTools' | 'writeAllowed'> | null
  inCatalog: boolean
  writeTool: boolean
}): BridgeToolPolicy {
  if (!input.inCatalog) {
    return 'unknown'
  }
  if (!input.turn) {
    return 'unknown'
  }
  if (!isAllowedBridgeTool(input.turn, input.toolName)) {
    return 'deny'
  }
  if (input.writeTool && input.turn.writeAllowed === false) {
    return 'deny'
  }
  return 'allow'
}

export function catalogToolsForTurn<T extends { name: string }>(
  tools: readonly T[],
  turn: Pick<OpcToolBridgeTurn, 'allowedTools'> | null,
): T[] {
  if (!turn) {
    return [...tools]
  }
  return tools.filter((tool) => isAllowedBridgeTool(turn, tool.name))
}

/** 只认精确 sessionId；前缀模糊匹配会在并发回合下套错成员。 */
export function pickToolBridgeTurn(
  turns: ReadonlyMap<string, OpcToolBridgeTurn>,
  sessionId?: string,
): OpcToolBridgeTurn | null {
  const wanted = sessionId?.trim() ?? ''
  if (!wanted) {
    return null
  }
  const exact = turns.get(wanted)
  if (exact) {
    return exact
  }
  const matches = [...turns.values()].filter((turn) => turn.sessionId === wanted)
  return matches.length === 1 ? (matches[0] ?? null) : null
}

export function invokeBodySessionId(body: Record<string, unknown>): string {
  return typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
}

export function sessionIdFromToolExec(exec: unknown): string {
  if (!exec || typeof exec !== 'object') {
    return ''
  }
  const row = exec as Record<string, unknown>
  if (typeof row.sessionId === 'string' && row.sessionId.trim()) {
    return row.sessionId.trim()
  }
  const agent = row.agent
  if (agent && typeof agent === 'object') {
    const record = agent as Record<string, unknown>
    if (typeof record.sessionId === 'string' && record.sessionId.trim()) {
      return record.sessionId.trim()
    }
    if (typeof record.id === 'string' && record.id.trim()) {
      return record.id.trim()
    }
    const session = record.session
    if (session && typeof session === 'object') {
      const id = (session as { id?: unknown }).id
      if (typeof id === 'string' && id.trim()) {
        return id.trim()
      }
    }
  }
  return ''
}

export function defineToolParameters(
  parameters: OpcToolParameters,
): Record<string, { type: 'string'; description?: string; required?: true }> {
  const next: Record<string, { type: 'string'; description?: string; required?: true }> = {}
  for (const [key, spec] of Object.entries(parameters)) {
    const description = spec.description?.trim()
    if (spec.required === false) {
      next[key] = description ? { type: 'string', description } : { type: 'string' }
      continue
    }
    next[key] = description
      ? { type: 'string', description, required: true }
      : { type: 'string', required: true }
  }
  return next
}

export interface OfficialToolRuntime {
  execute?: (exec: {
    callId: string
    name: string
    arguments: unknown
    signal: AbortSignal
  }) => Promise<{
    isError?: boolean
    value?: unknown
    content?: unknown
    error?: unknown
  }>
}

/** 口令快路径：本职工具没有对话回合也可以经 Local API 执行，不开放 fs/bash。 */
export function allowsHostFastPathInvoke(name: string): boolean {
  return occupationNativeToolNames().includes(name)
}

export type HostFastPathCode = 'no_turn' | 'turn_unresolved'

export type HostFastPathInvokeGate =
  | { action: 'use-turn' }
  | { action: 'read'; writeAllowed: false }
  | { action: 'reject'; status: 409; code: HostFastPathCode; error: string }

/**
 * 没有回合时只放行 effect:read 的本职工具，且不得带写权限。
 * 写类工具、目录外工具、非本职工具一律 409，不退化为放行。
 */
export function hostFastPathInvokeGate(input: {
  name: string
  sessionId: string
  turnFound: boolean
  inCatalog: boolean
  effect?: OpcToolEffect
}): HostFastPathInvokeGate {
  if (input.turnFound) {
    return { action: 'use-turn' }
  }
  const occupation = allowsHostFastPathInvoke(input.name)
  const readOnly = occupation && input.inCatalog && !isWriteTool({ name: input.name, effect: input.effect })
  if (readOnly) {
    return { action: 'read', writeAllowed: false }
  }
  const unresolved = Boolean(input.sessionId.trim()) && occupation
  return {
    action: 'reject',
    status: 409,
    code: unresolved ? 'turn_unresolved' : 'no_turn',
    error: unresolved ? '对话回合无法解析，拒绝这次调用。' : '没有进行中的对话回合。',
  }
}

export function officialToolText(result: {
  isError?: boolean
  value?: unknown
  content?: unknown
}): string | undefined {
  if (result.isError) {
    return undefined
  }
  if (typeof result.value === 'string') {
    return result.value
  }
  return textFromContentBlocks(result.content)
}

export async function executeOfficialToolIfPossible(
  tools: OfficialToolRuntime | undefined,
  name: string,
  args: Record<string, string>,
  signal?: AbortSignal,
): Promise<string | undefined> {
  if (!tools || typeof tools.execute !== 'function') {
    return undefined
  }
  try {
    const result = await tools.execute({
      callId: randomUUID(),
      name,
      arguments: args,
      signal: signal ?? AbortSignal.timeout(60_000),
    })
    return officialToolText(result)
  } catch {
    return undefined
  }
}

function textFromContentBlocks(content: unknown): string | undefined {
  if (!Array.isArray(content)) {
    return undefined
  }
  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') {
      continue
    }
    const text = (block as { text?: unknown }).text
    if (typeof text === 'string' && text.trim()) {
      parts.push(text)
    }
  }
  return parts.length > 0 ? parts.join('\n') : undefined
}

export function parseToolBridgeTurn(value: unknown): OpcToolBridgeTurn | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const row = value as Record<string, unknown>
  const sessionId = typeof row.sessionId === 'string' ? row.sessionId.trim() : ''
  const threadId = typeof row.threadId === 'string' ? row.threadId.trim() : ''
  const agentId = typeof row.agentId === 'string' ? row.agentId.trim() : ''
  const cwd = typeof row.cwd === 'string' ? row.cwd.trim() : ''
  if (!sessionId || !threadId || !agentId) {
    return null
  }
  const allowedTools = Array.isArray(row.allowedTools)
    ? row.allowedTools.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : []
  const identityDirectory =
    typeof row.identityDirectory === 'string' && row.identityDirectory.trim()
      ? row.identityDirectory.trim()
      : undefined
  return {
    sessionId,
    threadId,
    agentId,
    cwd,
    writeAllowed: row.writeAllowed !== false,
    ...(identityDirectory ? { identityDirectory } : {}),
    allowedTools,
  }
}
