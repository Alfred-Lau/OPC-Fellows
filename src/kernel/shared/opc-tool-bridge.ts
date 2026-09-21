/**
 * dsh 进程里的 defineTool 经本机 Local API 调回 Electron ctx.opcTools。
 * 职业执行仍在主进程；模型看见的是 dsh 原生工具 schema。
 */

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { LOCAL_API_PORT } from '../../main/local-api-port.ts'
import type { OpcToolInfo, OpcToolParameters } from './opc-tools.ts'

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

export function readToolBridgeAuth(userData?: string, env: NodeJS.ProcessEnv = process.env): ToolBridgeAuth | null {
  const root = userData?.trim() || env.OPC_USER_DATA?.trim() || ''
  if (root) {
    try {
      const raw = JSON.parse(readFileSync(toolBridgeAuthPath(root), 'utf8')) as unknown
      if (raw && typeof raw === 'object') {
        const row = raw as { url?: unknown; token?: unknown }
        const url = typeof row.url === 'string' ? row.url.trim().replace(/\/+$/, '') : ''
        const token = typeof row.token === 'string' ? row.token.trim() : ''
        if (url && token) {
          return { url, token }
        }
      }
    } catch {
      // 文件还没写或坏了，再看环境变量。
    }
  }
  const url = env[OPC_TOOL_BRIDGE_URL_ENV]?.trim().replace(/\/+$/, '') ?? ''
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
