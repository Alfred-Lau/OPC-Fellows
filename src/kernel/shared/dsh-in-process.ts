/**
 * 进程内对话：能 in-process 时走 `ctx.agents.create` / `resume` / `followup` / `whenIdle`。
 * asar 自建树没有工厂，仍由 DshRuntimeService spawn opc。
 */

import { randomUUID } from 'node:crypto'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { DshPromptContentBlock } from './dsh-attachment.ts'
import {
  defineToolParameters,
  readToolBridgeAuth,
  restrictToolsIfPossible,
  sessionIdFromToolExec,
  stringifyToolArgs,
} from './opc-tool-bridge.ts'
import type { OpcToolParameters } from './opc-tools.ts'
import { isDshSessionExistsError, type DshPromptResult, type DshTurnCollector } from './dsh-rpc.ts'

export interface DshUserMessage {
  id: string
  role: 'user'
  content: Array<{ type: 'text'; text: string }>
  source: { kind: 'user' }
}

export interface DshAgentOptions {
  provider: string
  model: string
}

export interface DshLiveAgent {
  id: string
  followup(message: DshUserMessage): void
  whenIdle(): Promise<void>
  options?: { provider?: string; model?: string }
}

export interface DshAgentHandle {
  agent: DshLiveAgent
  dispose(): Promise<void>
}

export interface DshAgentFactory {
  create(options: {
    sessionId: string
    meta?: { cwd?: string }
    agentOptions?: DshAgentOptions
  }): Promise<DshAgentHandle>
  resume(options: { resumeSessionId: string; agentOptions?: DshAgentOptions }): Promise<DshAgentHandle>
  get?(id: string): DshLiveAgent | undefined
}

export interface DshInProcessContext {
  get(name: string): unknown
  on(event: string, listener: (...args: unknown[]) => void): () => unknown
}

export function dshTreeHasAgentFactory(ctx: { get(name: string): unknown }): boolean {
  const agents = ctx.get('agents') as Partial<DshAgentFactory> | undefined
  return typeof agents?.create === 'function' && typeof agents?.resume === 'function'
}

export function contentBlocksToUserMessage(blocks: readonly DshPromptContentBlock[]): DshUserMessage {
  const content = blocks.flatMap((block) => {
    switch (block.type) {
      case 'text':
        return block.text.trim() ? [{ type: 'text' as const, text: block.text }] : []
      case 'image':
        return []
      default: {
        const exhaustive: never = block
        return exhaustive
      }
    }
  })
  if (content.length === 0) {
    throw new Error('没有可发送的对话内容。')
  }
  return {
    id: randomUUID(),
    role: 'user',
    content,
    source: { kind: 'user' },
  }
}

export async function promptDshInProcess(input: {
  ctx: DshInProcessContext
  sessionId: string
  cwd: string
  blocks: readonly DshPromptContentBlock[]
  collector: DshTurnCollector
  timeoutMs: number
  handles: Map<string, DshAgentHandle>
  agentOptions: DshAgentOptions
  restrictDeny?: readonly string[]
}): Promise<DshPromptResult> {
  const agents = input.ctx.get('agents') as DshAgentFactory | undefined
  if (typeof agents?.create !== 'function' || typeof agents.resume !== 'function') {
    throw new Error('这棵树没有 dsh agent 工厂。')
  }
  const off = input.ctx.on('session/event', (...args: unknown[]) => {
    const session = args[0]
    const event = args[1]
    const id = sessionIdOf(session)
    if (id && id !== input.sessionId) {
      return
    }
    const record = asRecord(event)
    if (record) {
      input.collector.pushEvent(record)
    }
  })
  try {
    const handle = await obtainHandle(agents, input.sessionId, input.cwd, input.handles, input.agentOptions)
    const liftRestrict = restrictToolsIfPossible(
      input.ctx.get('tools') as { restrict?: (filter: unknown) => unknown },
      input.restrictDeny ?? [],
    )
    try {
      handle.agent.followup(contentBlocksToUserMessage(input.blocks))
      await withTimeout(handle.agent.whenIdle(), input.timeoutMs, '回合结束')
    } finally {
      liftRestrict?.()
    }
    if (input.collector.failure) {
      throw new Error(input.collector.failure)
    }
    const reply = input.collector.result()
    if (!reply.text) {
      throw new Error('模型没有返回内容。')
    }
    return reply
  } finally {
    off()
  }
}

export async function ensureInProcessOccupationTools(
  ctx: { get(name: string): unknown },
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const tools = ctx.get('tools') as { register?: (tool: unknown) => void } | undefined
  if (typeof tools?.register !== 'function') {
    return
  }
  const auth = readToolBridgeAuth(env.OPC_USER_DATA, env)
  if (!auth) {
    return
  }
  const base = auth.url
  const token = auth.token
  const catalog = await loadCatalog(base, token)
  for (const tool of catalog) {
    const toolName = typeof tool.name === 'string' ? tool.name.trim() : ''
    if (!toolName) {
      continue
    }
    try {
      tools.register(
        defineTool({
          name: toolName,
          description:
            typeof tool.description === 'string' && tool.description.trim() ? tool.description : toolName,
          parameters: defineToolParameters(parametersOf(tool.parameters)),
          output: {
            schema: { type: 'string' },
            render: (_args: unknown, value: unknown) => [{ type: 'text', text: String(value ?? '') }],
          },
          async execute(args: unknown, exec: unknown) {
            const signal = exec && typeof exec === 'object' ? (exec as { signal?: AbortSignal }).signal : undefined
            return invokeTool(base, token, toolName, args, sessionIdFromToolExec(exec), signal)
          },
        }),
      )
    } catch {
      // 启动时 opc-kernel 已挂过同名工具，或 Local API 目录重复。
    }
  }
}

async function obtainHandle(
  agents: DshAgentFactory,
  sessionId: string,
  cwd: string,
  handles: Map<string, DshAgentHandle>,
  agentOptions: DshAgentOptions,
): Promise<DshAgentHandle> {
  const retained = handles.get(sessionId)
  if (retained && existingLive(retained.agent) && hasAgentRoute(retained.agent)) {
    return retained
  }
  if (retained) {
    handles.delete(sessionId)
    await retained.dispose().catch(() => undefined)
  }
  const live = agents.get?.(sessionId)
  if (existingLive(live) && hasAgentRoute(live)) {
    const handle = { agent: live, dispose: async () => undefined }
    handles.set(sessionId, handle)
    return handle
  }
  try {
    const handle = await agents.create({ sessionId, meta: { cwd }, agentOptions })
    handles.set(sessionId, handle)
    return handle
  } catch (error) {
    if (!isDshSessionExistsError(error)) {
      try {
        const handle = await agents.resume({ resumeSessionId: sessionId, agentOptions })
        handles.set(sessionId, handle)
        return handle
      } catch {
        throw error
      }
    }
    const handle = await agents.resume({ resumeSessionId: sessionId, agentOptions })
    handles.set(sessionId, handle)
    return handle
  }
}

function hasAgentRoute(agent: DshLiveAgent): boolean {
  return Boolean(agent.options?.provider?.trim() && agent.options?.model?.trim())
}

function existingLive(agent: DshLiveAgent | undefined): agent is DshLiveAgent {
  return typeof agent?.followup === 'function' && typeof agent.whenIdle === 'function'
}

function sessionIdOf(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return ''
  }
  const id = (value as { id?: unknown }).id
  return typeof id === 'string' ? id : ''
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  return value as Record<string, unknown>
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`等待 Harness ${label}超时。`))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

async function loadCatalog(base: string, token: string): Promise<Array<Record<string, unknown>>> {
  try {
    const response = await fetch(`${base}/agent/tools`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      return []
    }
    const payload = (await response.json()) as { tools?: unknown }
    return Array.isArray(payload?.tools)
      ? payload.tools.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      : []
  } catch {
    return []
  }
}

function parametersOf(raw: unknown): OpcToolParameters {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const next: OpcToolParameters = {}
  for (const [key, spec] of Object.entries(raw as Record<string, unknown>)) {
    const row = spec && typeof spec === 'object' ? (spec as { description?: unknown; required?: unknown }) : {}
    next[key] = {
      type: 'string',
      ...(typeof row.description === 'string' && row.description.trim() ? { description: row.description } : {}),
      ...(row.required === false ? { required: false } : {}),
    }
  }
  return next
}

async function invokeTool(
  base: string,
  token: string,
  name: string,
  args: unknown,
  sessionId: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(`${base}/agent/tools/invoke`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      args: stringifyToolArgs(args),
      ...(sessionId ? { sessionId } : {}),
    }),
    signal,
  })
  const payload = (await response.json().catch(() => ({}))) as { error?: unknown; text?: unknown }
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : `工具「${name}」失败。`)
  }
  return typeof payload.text === 'string' ? payload.text : ''
}
