import { Service, type Context } from '@deepseek-ai/cordis'
import type { ShortListing, SkillReply } from '../../../shared/listing'
import type { ToolEvent } from '../../shared/tool-events'
import type { ToolPackId } from '../../shared/tool-packs'
import {
  isWriteTool,
  toolResultListing,
  toolResultText,
  type OpcToolDefinition,
} from '../../shared/opc-tools'

export type { OpcToolDefinition, OpcToolInfo, OpcToolParameters } from '../../shared/opc-tools'

export interface ToolInvokeMeta {
  threadId?: string
  agentId?: string
  depth?: number
  workspaceRoot?: string
  identityDirectory?: string
  writeAllowed?: boolean
}

export interface ToolInvokeResult extends SkillReply {
  text: string
  listing?: ShortListing
}

/**
 * 职业模块和内核工具包往这里挂工具。执行仍在 Electron 主进程。
 * dsh 树上的 defineTool 经 Local API 调回这里；JSON 协议仍是 spawn 退路。
 */
export class ToolsService extends Service {
  private readonly tools = new Map<string, OpcToolDefinition>()
  private current: ToolInvokeMeta | undefined

  constructor(ctx: Context) {
    super(ctx, 'opcTools')
  }

  register(tool: OpcToolDefinition): void {
    this.tools.set(tool.name, tool)
    this.ctx.effect(() => () => {
      this.tools.delete(tool.name)
    }, `tools.register(${tool.name})`)
  }

  catalog(moduleIds?: readonly string[], packs?: readonly ToolPackId[]): OpcToolDefinition[] {
    if (moduleIds === undefined && packs === undefined) {
      return [...this.tools.values()]
    }
    const allowed = new Set([...(moduleIds ?? []), ...(packs ?? [])])
    return [...this.tools.values()].filter((tool) => allowed.has(tool.moduleId))
  }

  meta(): ToolInvokeMeta | undefined {
    return this.current
  }

  async invoke(
    name: string,
    args: Record<string, string>,
    meta: ToolInvokeMeta = {},
  ): Promise<ToolInvokeResult> {
    const tool = this.tools.get(name)
    if (!tool) {
      throw new Error(`没有「${name}」这个工具。`)
    }
    if (meta.writeAllowed === false && isWriteTool(tool)) {
      throw new Error(`计划模式不能调用写工具「${name}」。先让用户回复「按计划执行」。`)
    }
    const previous = this.current
    this.current = { ...previous, ...meta, depth: (meta.depth ?? previous?.depth ?? 0) }
    this.emitEvent({
      threadId: this.current.threadId,
      agentId: this.current.agentId,
      name,
      status: 'running',
    })
    try {
      const raw = await tool.execute(args)
      const text = toolResultText(raw)
      const listing = toolResultListing(raw)
      this.emitEvent({
        threadId: this.current.threadId,
        agentId: this.current.agentId,
        name,
        status: 'ok',
        detail: text.slice(0, 180),
      })
      return listing ? { text, listing } : { text }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.emitEvent({
        threadId: this.current.threadId,
        agentId: this.current.agentId,
        name,
        status: 'error',
        detail: message,
      })
      throw error
    } finally {
      this.current = previous
    }
  }

  private emitEvent(event: ToolEvent): void {
    this.ctx.bridge?.send('agents:tool', event)
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    opcTools: ToolsService
  }
}
