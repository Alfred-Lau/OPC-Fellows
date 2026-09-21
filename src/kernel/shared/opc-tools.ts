/**
 * OPC 职业工具的目录与调用协议。
 * 主路径是 dsh `defineTool` + Local API；JSON 点名只作一轮退路。
 */

const NATIVE_WRITE_TOOLS = new Set(['edit', 'write', 'bash', 'shell', 'apply_patch', 'fs_write'])


import type { ShortListing } from '../../shared/listing.ts'

export const TOOL_ROUND_LIMIT = 24

export interface OpcToolParameter {
  type: 'string'
  description?: string
  required?: boolean
}

export type OpcToolParameters = Record<string, OpcToolParameter>

export type OpcToolEffect = 'read' | 'write'

export interface OpcToolInfo {
  name: string
  description: string
  moduleId: string
  parameters: OpcToolParameters
  effect?: OpcToolEffect
}

export type OpcToolExecuteResult = string | { text: string; listing?: ShortListing }

export interface OpcToolDefinition extends OpcToolInfo {
  execute: (args: Record<string, string>) => Promise<OpcToolExecuteResult>
}

export function toolResultText(result: OpcToolExecuteResult): string {
  return typeof result === 'string' ? result : result.text
}

export function toolResultListing(result: OpcToolExecuteResult): ShortListing | undefined {
  return typeof result === 'string' ? undefined : result.listing
}

export function isWriteTool(tool: Pick<OpcToolInfo, 'effect' | 'name'>): boolean {
  return tool.effect !== 'read' || isNativeWriteTool(tool.name)
}

export function isNativeWriteTool(name: string): boolean {
  const tool = name.trim().toLowerCase()
  return NATIVE_WRITE_TOOLS.has(tool) || /^(edit|write|bash|shell)_/.test(tool)
}

export interface OpcToolCall {
  name: string
  args: Record<string, string>
}

export type OpcToolProtocol = 'native' | 'json'

export function formatOpcToolsPrompt(
  tools: readonly OpcToolInfo[],
  protocol: OpcToolProtocol = 'json',
): string {
  if (tools.length === 0) {
    return ''
  }
  const lines =
    protocol === 'native'
      ? [
          '工作台工具已挂在 dsh ctx.tools，schema 由 defineTool 提供。需要查数或动手时直接调用，不要编造 JSON 点名。',
          '工具列表：',
        ]
      : [
          '你可以调用工作台工具。需要动手或查数时，只输出一个 JSON 对象，不要 Markdown：',
          '{"tool":"工具名","args":{"参数":"值"}}',
          '一次只调一个工具；根据结果再决定下一步。不需要工具时直接用中文回答用户。',
          '工具列表：',
        ]
  for (const tool of tools) {
    const params = Object.entries(tool.parameters)
      .map(([key, spec]) => `${key}${spec.required === false ? '?' : ''}: ${spec.description ?? spec.type}`)
      .join(', ')
    lines.push(`- ${tool.name}（${tool.description}）${params ? ` 参数：${params}` : ' 无参数，args 用 {}'}`)
  }
  return lines.join('\n')
}

export function parseOpcToolCall(text: string): OpcToolCall | null {
  const json = extractJsonObject(text)
  if (!json) {
    return null
  }
  const name = typeof json.tool === 'string' ? json.tool.trim() : ''
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    return null
  }
  const rawArgs = json.args
  const args: Record<string, string> = {}
  if (rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)) {
    for (const [key, value] of Object.entries(rawArgs)) {
      if (typeof value === 'string') {
        args[key] = value
      } else if (value == null) {
        args[key] = ''
      } else {
        args[key] = String(value)
      }
    }
  }
  return { name, args }
}

/** IPC / 口令桥把任意参数收成字符串表，交给 ctx.tools.invoke。 */
export function asToolArgs(value: unknown): Record<string, string> {
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

function extractJsonObject(text: string): Record<string, unknown> | null {
  const stripped = text.replace(/```json|```/g, '').trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start < 0 || end <= start) {
    return null
  }
  try {
    const value = JSON.parse(stripped.slice(start, end + 1)) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null
    }
    return value as Record<string, unknown>
  } catch {
    return null
  }
}
