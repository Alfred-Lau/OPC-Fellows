import { spawnSync } from 'node:child_process'
import { Service, type Context } from '@deepseek-ai/cordis'
import { updateTodo } from '../../../main/todo-store'
import { scrubSecretEnv } from '../../shared/opc-tool-bridge'
import { KERNEL_TOOL_PACK, type ToolPackId } from '../../shared/tool-packs'

/**
 * 待办与本机 GitHub。工作区 fs/bash/web_fetch 交给 dsh-base，避免和官方工具撞名。
 * Panel 写文件仍走 workspace-fs，不面对模型。
 */
export class KernelWorkService extends Service {
  static inject = ['opcTools', 'todos']

  constructor(ctx: Context) {
    super(ctx, 'kernelWork')
    this.registerKernel()
    this.registerMcp()
  }

  private registerKernel(): void {
    const pack: ToolPackId = KERNEL_TOOL_PACK
    this.ctx.opcTools.register({
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
    this.ctx.opcTools.register({
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
        const agentId = this.ctx.opcTools.meta()?.agentId || 'kernel'
        const result = this.ctx.todos.ingest({
          agentId,
          source: '成员',
          items: [{ title, note: args.note || undefined, dedupeKey: `chat:${agentId}:${title}` }],
        })
        const created = result.created[0]
        return created ? `已写入待办「${created.title}」。` : '这条待办已经在了。'
      },
    })
    this.ctx.opcTools.register({
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

  private registerMcp(): void {
    this.ctx.opcTools.register({
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
    return this.ctx.opcTools.meta()?.workspaceRoot || process.cwd()
  }
}

function githubStatus(cwd: string, repo: string): string {
  const args = repo.trim()
    ? ['pr', 'list', '--repo', repo.trim(), '--limit', '8']
    : ['pr', 'list', '--limit', '8']
  const result = spawnSync('gh', args, {
    cwd,
    encoding: 'utf8',
    timeout: 20_000,
    env: scrubSecretEnv(process.env),
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
