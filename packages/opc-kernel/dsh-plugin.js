import { defineTool } from '@deepseek-ai/dsh-tools'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const name = 'opc-kernel'
export const inject = ['tools', 'systemPrompt']

/**
 * 把 Electron ctx.tools 的目录挂上 dsh。执行仍走 Local API，这边不碰 BrowserWindow。
 * 成员人设从 OPC_USER_DATA/kernel/presets/<session>.md 读进 systemPrompt，不塞进用户话。
 */
export async function apply(ctx) {
  ctx.systemPrompt.section({
    name: 'opc:member-preset',
    order: 0,
    text: (context) => readPreset(sessionIdOfAgent(context?.agent)),
  })
  ctx.on('tools/pre-execute', (call, next) => answerToolPolicy(call, next))
  ctx.on('approval/request', (request) => answerApproval(request))
  const auth = readToolBridgeAuth()
  if (!auth) {
    return
  }
  const base = auth.base
  const token = auth.token
  const tools = await loadCatalog(base, token)
  const occupationOwned = new Set(['social_load', 'social_publish', 'social_metrics', 'social_recap'])
  for (const tool of tools) {
    const toolName = typeof tool.name === 'string' ? tool.name.trim() : ''
    if (!toolName || occupationOwned.has(toolName)) {
      continue
    }
    ctx.tools.register(
      defineTool({
        name: toolName,
        description: typeof tool.description === 'string' && tool.description.trim() ? tool.description : toolName,
        parameters: parametersOf(tool.parameters),
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: String(value ?? '') }],
        },
        async execute(args, exec) {
          return invokeTool(base, token, toolName, args, exec?.signal, sessionIdOf(exec))
        },
      }),
    )
  }
}

apply.inject = inject

export default { name, inject, apply }

async function loadCatalog(base, token) {
  try {
    const response = await fetch(`${base}/agent/tools`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      return []
    }
    const payload = await response.json()
    return Array.isArray(payload?.tools) ? payload.tools : []
  } catch {
    return []
  }
}

async function answerApproval(request) {
  const auth = readToolBridgeAuth()
  if (!auth) {
    return 'unavailable'
  }
  const sessionId = sessionIdOfApproval(request)
  const toolName = typeof request?.toolName === 'string' ? request.toolName.trim() : ''
  if (!toolName || !sessionId) {
    return 'unavailable'
  }
  try {
    return await askApproval(auth.base, auth.token, request)
  } catch {
    if (request?.signal?.aborted) {
      return 'cancelled'
    }
    return 'unavailable'
  }
}

function readToolBridgeAuth() {
  const userData = process.env.OPC_USER_DATA?.trim()
  if (userData) {
    try {
      const raw = JSON.parse(readFileSync(join(userData, 'kernel', 'tool-bridge.json'), 'utf8'))
      const url = typeof raw?.url === 'string' ? raw.url.trim().replace(/\/+$/, '') : ''
      const token = typeof raw?.token === 'string' ? raw.token.trim() : ''
      if (url && token) {
        return { base: url, token }
      }
    } catch {
      // 再看环境变量。
    }
  }
  const base = process.env.OPC_TOOL_BRIDGE_URL?.trim().replace(/\/+$/, '')
  const token = process.env.OPC_TOOL_BRIDGE_TOKEN?.trim()
  if (base && token) {
    return { base, token }
  }
  return null
}

async function answerToolPolicy(call, next) {
  const auth = readToolBridgeAuth()
  if (!auth) {
    return next()
  }
  const toolName = typeof call?.name === 'string' ? call.name.trim() : typeof call?.toolName === 'string' ? call.toolName.trim() : ''
  const sessionId = sessionIdOf(call)
  if (!toolName) {
    return next()
  }
  try {
    const response = await fetch(`${auth.base}/agent/tools/policy`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: toolName, sessionId }),
      signal: call?.signal,
    })
    const payload = await response.json().catch(() => ({}))
    const decision = payload?.decision
    if (decision === 'deny' || decision === 'allow' || decision === 'ask') {
      return decision
    }
  } catch {
    // 政策服务不可用时交给后面的官方管道，不要误杀 fs / bash。
  }
  return next()
}

async function askApproval(base, token, request) {
  const sessionId = sessionIdOfApproval(request)
  const toolName = typeof request?.toolName === 'string' ? request.toolName.trim() : ''
  if (!sessionId || !toolName) {
    return 'unavailable'
  }
  const reason = typeof request?.reason === 'string' ? request.reason : ''
  const response = await fetch(`${base}/agent/approval/ask`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sessionId, toolName, reason }),
    signal: request?.signal,
  })
  const payload = await response.json().catch(() => ({}))
  const outcome = payload?.outcome
  if (outcome === 'allowed-once' || outcome === 'rejected' || outcome === 'cancelled' || outcome === 'unavailable') {
    return outcome
  }
  return 'unavailable'
}

async function invokeTool(base, token, name, args, signal, sessionId) {
  const response = await fetch(`${base}/agent/tools/invoke`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, args: stringifyArgs(args), ...(sessionId ? { sessionId } : {}) }),
    signal,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : `工具「${name}」失败。`)
  }
  return typeof payload.text === 'string' ? payload.text : ''
}

function parametersOf(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const next = {}
  for (const [key, spec] of Object.entries(raw)) {
    const row = spec && typeof spec === 'object' ? spec : {}
    const parameter = { type: 'string' }
    if (typeof row.description === 'string' && row.description.trim()) {
      parameter.description = row.description
    }
    if (row.required !== false) {
      parameter.required = true
    }
    next[key] = parameter
  }
  return next
}

function sessionIdOf(exec) {
  if (!exec || typeof exec !== 'object') {
    return ''
  }
  if (typeof exec.sessionId === 'string' && exec.sessionId.trim()) {
    return exec.sessionId.trim()
  }
  const agent = exec.agent
  if (agent && typeof agent === 'object') {
    if (typeof agent.sessionId === 'string' && agent.sessionId.trim()) {
      return agent.sessionId.trim()
    }
    if (typeof agent.id === 'string' && agent.id.trim()) {
      return agent.id.trim()
    }
    const session = agent.session
    if (session && typeof session === 'object' && typeof session.id === 'string' && session.id.trim()) {
      return session.id.trim()
    }
  }
  return ''
}

function stringifyArgs(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  const args = {}
  for (const [key, item] of Object.entries(value)) {
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

function sessionIdOfApproval(request) {
  const agent = request?.agent
  if (agent && typeof agent === 'object') {
    const session = agent.session
    if (session && typeof session === 'object') {
      if (typeof session.id === 'string' && session.id.trim()) {
        return session.id.trim()
      }
      const header = session.header
      if (header && typeof header === 'object' && typeof header.id === 'string' && header.id.trim()) {
        return header.id.trim()
      }
    }
  }
  return sessionIdOfAgent(agent)
}

function sessionIdOfAgent(agent) {
  if (!agent || typeof agent !== 'object') {
    return ''
  }
  if (typeof agent.id === 'string' && agent.id.trim()) {
    return agent.id.trim()
  }
  const session = agent.session
  if (session && typeof session === 'object' && typeof session.id === 'string') {
    return session.id.trim()
  }
  return ''
}

function presetFileName(sessionId) {
  const id = sessionId.replace(/[^a-zA-Z0-9:_-]/g, '_')
  return `${id || 'session'}.md`
}

function readPreset(sessionId) {
  const root = process.env.OPC_USER_DATA?.trim()
  if (!root || !sessionId) {
    return ''
  }
  try {
    return readFileSync(join(root, 'kernel', 'presets', presetFileName(sessionId)), 'utf8').trim()
  } catch {
    return ''
  }
}
