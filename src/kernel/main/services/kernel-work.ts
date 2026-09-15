import { spawnSync } from 'node:child_process'
import { Service, type Context } from '@deepseek-ai/cordis'
import { updateTodo } from '../../../main/todo-store'
import { parseOpcToolCall, formatOpcToolsPrompt, TOOL_ROUND_LIMIT } from '../../shared/opc-tools'
import {
  applyWorkspacePatch,
  globWorkspace,
  grepWorkspace,
  readWorkspaceFile,
  runWorkspaceBash,
  writeWorkspaceFile,
} from '../../shared/workspace-fs'
import { KERNEL_TOOL_PACK, WORKSPACE_TOOL_PACK, type ToolPackId } from '../../shared/tool-packs'

const FETCH_TIMEOUT_MS = 15_000
const FETCH_MAX = 80_000
const DELEGATE_ROUNDS = 6

/**
 * 待办、工作区、网页与 GitHub。挂在 ctx.tools 上，按成员 toolPacks 过滤。
 * opc profile 的 fs/bash 由这里落地（Electron 执行、cwd = 成员工作区），
 * 不把危险工具泄漏进所有 dsh 会话。
 */
export class KernelWorkService extends Service {
  static inject = ['tools', 'todos', 'llm']

  constructor(ctx: Context) {
    super(ctx, 'kernelWork')
    this.registerKernel()
    this.registerWorkspace()
    this.registerMcp()
  }

  private registerKernel(): void {
    const pack: ToolPackId = KERNEL_TOOL_PACK
    this.ctx.tools.register({
      name: 'todos_list',
      description: '列出未完成待办。不要编造不存在的事项。',
      moduleId: pack,
      effect: 'read',
      parameters: {},
      execute: async () => {
        const open = this.ctx.todos.list().filter((item) => !item.done).slice(0, 20)
        if (open.length === 0) {
          return '没有未完成待办。'
        }
        return open.map((item) => `- ${item.title} (${item.id})`).join('\n')
      },
    })
    this.ctx.tools.register({
      name: 'todos_ingest',
      description: '写入一条内核待办。需要标题。',
      moduleId: pack,
      effect: 'write',
      parameters: {
        title: { type: 'string', description: '待办标题', required: true },
        note: { type: 'string', description: '备注', required: false },
      },
      execute: async (args) => {
        const title = (args.title || args.text || '').trim()
        if (!title) {
          return '写入待办需要标题。'
        }
        const agentId = this.ctx.tools.meta()?.agentId || 'kernel'
        const result = this.ctx.todos.ingest({
          agentId,
          source: '成员',
          items: [{ title, note: args.note || undefined, dedupeKey: `chat:${agentId}:${title}` }],
        })
        const created = result.created[0]
        return created ? `已写入待办「${created.title}」。` : '这条待办已经在了。'
      },
    })
    this.ctx.tools.register({
      name: 'todos_done',
      description: '把一条待办标成完成。需要 id。',
      moduleId: pack,
      effect: 'write',
      parameters: { id: { type: 'string', description: '待办 id', required: true } },
      execute: async (args) => {
        const id = args.id?.trim()
        if (!id) {
          return '完成待办需要 id。先 todos_list。'
        }
        const next = updateTodo(id, { done: true })
        return next ? `已完成「${next.title}」。` : '没有这条待办。'
      },
    })
  }

  private registerWorkspace(): void {
    const pack: ToolPackId = WORKSPACE_TOOL_PACK
    this.ctx.tools.register({
      name: 'fs_read',
      description: '读取工作区内一个文件。路径相对工作区根。',
      moduleId: pack,
      effect: 'read',
      parameters: { path: { type: 'string', description: '相对路径', required: true } },
      execute: async (args) => readWorkspaceFile(this.workspaceRoot(), args.path || args.text || ''),
    })
    this.ctx.tools.register({
      name: 'fs_write',
      description: '写入工作区内一个文件。默认覆盖。',
      moduleId: pack,
      effect: 'write',
      parameters: {
        path: { type: 'string', description: '相对路径', required: true },
        content: { type: 'string', description: '文件内容', required: true },
      },
      execute: async (args) => writeWorkspaceFile(this.workspaceRoot(), args.path || '', args.content || args.text || ''),
    })
    this.ctx.tools.register({
      name: 'apply_patch',
      description: '替换工作区文件里的一段原文。old 为空则整文件写入 new。',
      moduleId: pack,
      effect: 'write',
      parameters: {
        path: { type: 'string', description: '相对路径', required: true },
        old: { type: 'string', description: '要替换的原文', required: false },
        new: { type: 'string', description: '替换后的内容', required: true },
      },
      execute: async (args) =>
        applyWorkspacePatch(this.workspaceRoot(), args.path || '', args.old || '', args.new || args.content || ''),
    })
    this.ctx.tools.register({
      name: 'glob',
      description: '按文件名模式列出工作区文件。',
      moduleId: pack,
      effect: 'read',
      parameters: { pattern: { type: 'string', description: '如 **/*.ts 或 package.json', required: false } },
      execute: async (args) => {
        const hits = globWorkspace(this.workspaceRoot(), args.pattern || args.text || '')
        return hits.length > 0 ? hits.join('\n') : '没有匹配的文件。'
      },
    })
    this.ctx.tools.register({
      name: 'grep',
      description: '在工作区文件里搜一段明文。',
      moduleId: pack,
      effect: 'read',
      parameters: {
        query: { type: 'string', description: '关键词', required: true },
        glob: { type: 'string', description: '可选文件名过滤', required: false },
      },
      execute: async (args) => {
        const hits = grepWorkspace(this.workspaceRoot(), args.query || args.text || '', args.glob || '')
        return hits.length > 0 ? hits.join('\n') : '没有命中。'
      },
    })
    this.ctx.tools.register({
      name: 'bash',
      description: '在工作区根执行一条 shell 命令。禁止 rm -rf 和 sudo。',
      moduleId: pack,
      effect: 'write',
      parameters: { command: { type: 'string', description: '命令', required: true } },
      execute: async (args) => runWorkspaceBash(this.workspaceRoot(), args.command || args.text || ''),
    })
    this.ctx.tools.register({
      name: 'agent_delegate',
      description: '把只读调研派给子循环。不能再派子任务，也不能改文件。',
      moduleId: pack,
      effect: 'read',
      parameters: { task: { type: 'string', description: '子任务', required: true } },
      execute: async (args) => this.delegate(args.task || args.text || ''),
    })
  }

  private registerMcp(): void {
    this.ctx.tools.register({
      name: 'web_fetch',
      description: '抓取一个 http(s) URL 的文本。只读，不上报 cookie。',
      moduleId: 'mcp-browser',
      effect: 'read',
      parameters: { url: { type: 'string', description: 'https URL', required: true } },
      execute: async (args) => fetchUrlText(args.url || args.text || ''),
    })
    this.ctx.tools.register({
      name: 'browser_fetch',
      description: '用本机抓取页面正文，等同只读浏览器。',
      moduleId: 'mcp-browser',
      effect: 'read',
      parameters: { url: { type: 'string', description: 'https URL', required: true } },
      execute: async (args) => fetchUrlText(args.url || args.text || ''),
    })
    this.ctx.tools.register({
      name: 'github_status',
      description: '用本机 gh 看当前仓库或指定仓库的 PR / 检查摘要。需要已登录 gh。',
      moduleId: 'mcp-github',
      effect: 'read',
      parameters: {
        repo: { type: 'string', description: 'owner/name，可空则用当前工作区', required: false },
      },
      execute: async (args) => githubStatus(this.workspaceRoot(), args.repo || ''),
    })
  }

  private workspaceRoot(): string {
    return this.ctx.tools.meta()?.workspaceRoot || process.cwd()
  }

  private async delegate(task: string): Promise<string> {
    const trimmed = task.trim()
    if (!trimmed) {
      return '子任务不能空。'
    }
    if ((this.ctx.tools.meta()?.depth ?? 0) >= 1) {
      return '子任务不能再派子任务。'
    }
    const tools = this.ctx.tools
      .catalog([], ['kernel', 'workspace', 'mcp-browser'])
      .filter((tool) => tool.name !== 'agent_delegate' && tool.effect === 'read')
    const system = [
      '你是只读子循环。完成调研后用中文给出结论和依据。',
      '需要查文件或网页时输出一个 JSON 工具调用。',
      formatOpcToolsPrompt(tools),
    ].join('\n')
    let user = trimmed
    const notes: string[] = []
    for (let round = 0; round < DELEGATE_ROUNDS; round += 1) {
      const raw = await this.ctx.llm.complete({
        system,
        messages: [{ role: 'user', content: user }],
        temperature: 0.2,
        timeoutMs: 45_000,
      })
      const call = parseOpcToolCall(raw)
      if (!call) {
        return raw.trim() || notes.join('\n')
      }
      const allowed = tools.some((tool) => tool.name === call.name)
      let result: string
      try {
        if (!allowed) {
          throw new Error(`子循环不能调用「${call.name}」。`)
        }
        result = (await this.ctx.tools.invoke(call.name, call.args, {
          ...this.ctx.tools.meta(),
          depth: 1,
          writeAllowed: false,
        })).text
      } catch (error) {
        result = error instanceof Error ? error.message : String(error)
      }
      notes.push(`${call.name}: ${result.slice(0, 2000)}`)
      user = `任务：${trimmed}\n\n已完成：\n${notes.join('\n\n')}\n\n继续或给出结论。不要重复已经跑过的工具。`
    }
    return `子循环轮次用尽（${String(DELEGATE_ROUNDS)} / ${String(TOOL_ROUND_LIMIT)}）。\n${notes.join('\n\n')}`
  }
}

async function fetchUrlText(raw: string): Promise<string> {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new Error('需要合法的 http(s) URL。')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('只允许 http(s)。')
  }
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': 'OPC-Agent-Team/0.6 (read-only fetch)' },
  })
  const contentType = response.headers.get('content-type') ?? ''
  const body = await response.text()
  const clipped = body.length > FETCH_MAX ? `${body.slice(0, FETCH_MAX)}\n…（截断）` : body
  if (contentType.includes('html')) {
    return stripHtml(clipped)
  }
  return `HTTP ${String(response.status)}\n${clipped}`
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, FETCH_MAX)
}

function githubStatus(cwd: string, repo: string): string {
  const args = repo.trim()
    ? ['pr', 'list', '--repo', repo.trim(), '--limit', '8']
    : ['pr', 'list', '--limit', '8']
  const result = spawnSync('gh', args, {
    cwd,
    encoding: 'utf8',
    timeout: 20_000,
    env: process.env,
  })
  if (result.error) {
    return '本机没有 gh，或无法启动。装好 GitHub CLI 并 gh auth login 后再试。'
  }
  const stdout = (result.stdout ?? '').trim()
  const stderr = (result.stderr ?? '').trim()
  if (result.status !== 0) {
    return stderr || stdout || 'gh 失败。'
  }
  return stdout || '没有打开的 PR。'
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    kernelWork: KernelWorkService
  }
}
