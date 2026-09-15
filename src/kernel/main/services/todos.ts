import { Service, type Context } from '@deepseek-ai/cordis'
import type { AgentInboxInput, AgentInboxResult } from '../../../shared/agent-inbox'
import type { TodoItem } from '../../../shared/todo'
import { ingestAgentTodos } from '../../../main/agent-inbox'
import { setTodoIngest } from '../../../main/todo-ingest'
import { registerTodoIpc } from '../../../main/todo-ipc'
import { loadTodos, listTodos } from '../../../main/todo-store'
import { restoreTodoSchedules, setNotifyClickHandler } from '../../../main/todo-notify'
import { showWorkbench } from '../../../main/workbench-window'

export interface TodoSink {
  id: string
  /** 待办发生变化时被调用，用于镜像到外部任务系统。 */
  onChanged: (todos: TodoItem[]) => void | Promise<void>
}

export interface TodoSource {
  id: string
  /** 从外部任务系统拉取，产出交给 ingest 去重入库。 */
  pull: () => Promise<AgentInboxInput>
}

/**
 * 待办是内核服务，不是模块 —— 它是工作台的语义中心，
 * 首页、搜索、通知、台伴和四个模块的产出都以它为轴（设计文档 §5.1）。
 *
 * 可替换性通过下面的扩展点保留：想接飞书任务 / 滴答清单的人
 * 写一个同步模块挂上来，而不是把内核的待办整个换掉。
 */
export class TodosService extends Service {
  static inject = ['bridge']

  private sinks = new Map<string, TodoSink>()
  private sources = new Map<string, TodoSource>()

  constructor(ctx: Context) {
    super(ctx, 'todos')

    loadTodos()
    setTodoIngest((input) => this.ingest(input))
    registerTodoIpc((channel, listener) => {
      ctx.bridge.handle(channel, listener)
    })
    setNotifyClickHandler((todo) => {
      showWorkbench('todos', todo.id)
    })
    restoreTodoSchedules()
  }

  list(): TodoItem[] {
    return listTodos()
  }

  /**
   * 跨模块写待办的唯一入口，按 dedupeKey 去重。
   * 模块不直接碰 todo store。
   */
  ingest(input: AgentInboxInput): AgentInboxResult {
    const result = ingestAgentTodos(input)
    void this.fanout()
    return result
  }

  /** 工作台 → 外部任务系统。 */
  sink(sink: TodoSink): void {
    this.sinks.set(sink.id, sink)
    this.ctx.effect(() => () => {
      this.sinks.delete(sink.id)
    }, `todos.sink(${sink.id})`)
  }

  /** 外部任务系统 → 工作台。 */
  source(source: TodoSource): void {
    this.sources.set(source.id, source)
    this.ctx.effect(() => () => {
      this.sources.delete(source.id)
    }, `todos.source(${source.id})`)
  }

  /** 把所有已注册的 source 拉一轮，产出经 ingest 去重入库。 */
  async pullAll(): Promise<void> {
    for (const source of this.sources.values()) {
      try {
        this.ingest(await source.pull())
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.ctx.modules?.log(source.id, 'error', `拉取待办失败: ${message}`)
      }
    }
  }

  private async fanout(): Promise<void> {
    if (this.sinks.size === 0) {
      return
    }
    const todos = listTodos()
    for (const sink of this.sinks.values()) {
      try {
        await sink.onChanged(todos)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.ctx.modules?.log(sink.id, 'error', `同步待办失败: ${message}`)
      }
    }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    todos: TodosService
  }
}
