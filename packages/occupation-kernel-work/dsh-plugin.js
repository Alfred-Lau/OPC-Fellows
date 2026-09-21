import { defineTool } from '@deepseek-ai/dsh-tools'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const name = 'occupation-kernel-work'
export const inject = ['tools']

const TOOLS = [
  {
    name: 'todos_list',
    description: '列出未完成待办。不要编造不存在的事项。',
    parameters: {},
  },
  {
    name: 'todos_ingest',
    description: '写入一条内核待办。需要标题。',
    parameters: {
      title: { type: 'string', description: '待办标题' },
      note: { type: 'string', description: '备注', required: false },
      text: { type: 'string', description: '用户原话，可含标题', required: false },
    },
  },
  {
    name: 'todos_done',
    description: '把一条待办标成完成。需要 id。',
    parameters: {
      id: { type: 'string', description: '待办 id' },
    },
  },
  {
    name: 'github_status',
    description: '用本机 gh 看当前仓库或指定仓库的 PR / 检查摘要。需要已登录 gh。',
    parameters: {
      repo: { type: 'string', description: 'owner/name，可空则用当前工作区', required: false },
    },
  },
]

/**
 * 内核待办与本机 GitHub。schema 给模型看；执行 POST Local API，不碰 Electron。
 */
export async function apply(ctx) {
  const auth = readToolBridgeAuth()
  if (!auth) {
    return
  }
  for (const tool of TOOLS) {
    ctx.tools.register(
      defineTool({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: String(value ?? '') }],
        },
        async execute(args, exec) {
          return invokeTool(auth.base, auth.token, tool.name, args, exec?.signal, sessionIdOf(exec))
        },
      }),
    )
  }
}

apply.inject = inject

export default { name, inject, apply }

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
