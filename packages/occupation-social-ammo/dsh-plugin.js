import { defineTool } from '@deepseek-ai/dsh-tools'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const name = 'occupation-social-ammo'
export const inject = ['tools']

const TOOLS = [
  {
    name: 'social_load',
    description: '按产品目录装填六平台弹药。目录为空就请用户先登记站点。',
    parameters: {
      text: { type: 'string', description: '用户原话', required: false },
    },
  },
  {
    name: 'social_recap',
    description: '复盘有评论的已发稿。没有带评论的已发稿，不拿未发草稿充数。',
    parameters: {
      text: { type: 'string', description: '用户原话', required: false },
    },
  },
  {
    name: 'social_publish',
    description: '记下已发链接。不代发。缺链接就问。',
    parameters: {
      url: { type: 'string', description: '已发链接' },
      which: { type: 'string', description: '第几条弹药，例如第一条', required: false },
      pinned: { type: 'string', description: '弹药 id', required: false },
      text: { type: 'string', description: '用户原话，可含链接和第几条', required: false },
    },
  },
  {
    name: 'social_metrics',
    description: '记下一条已发弹药的浏览、赞评转发收藏。没有数字就不写 0 充数。',
    parameters: {
      views: { type: 'string', description: '浏览 / 曝光', required: false },
      likes: { type: 'string', description: '赞', required: false },
      comments: { type: 'string', description: '评论', required: false },
      shares: { type: 'string', description: '转发', required: false },
      saves: { type: 'string', description: '收藏', required: false },
      which: { type: 'string', description: '第几条已发弹药', required: false },
      pinned: { type: 'string', description: '弹药 id', required: false },
      text: { type: 'string', description: '用户原话，可含数字和第几条', required: false },
    },
  },
]

/**
 * 弹药手本职工具。schema 给模型看；执行 POST Local API，不碰 Electron。
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

const LOOPBACK_TOOL_BRIDGE_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

export function loopbackToolBridgeBase(raw) {
  const url = typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : ''
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

export function readToolBridgeAuth() {
  const userData = process.env.OPC_USER_DATA?.trim()
  if (userData) {
    try {
      const raw = JSON.parse(readFileSync(join(userData, 'kernel', 'tool-bridge.json'), 'utf8'))
      const url = typeof raw?.url === 'string' ? raw.url.trim().replace(/\/+$/, '') : ''
      const token = typeof raw?.token === 'string' ? raw.token.trim() : ''
      if (url) {
        const base = loopbackToolBridgeBase(url)
        if (!base) {
          return null
        }
        if (token) {
          return { base, token }
        }
      }
    } catch {
      // 再看环境变量。
    }
  }
  const base = loopbackToolBridgeBase(process.env.OPC_TOOL_BRIDGE_URL)
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
