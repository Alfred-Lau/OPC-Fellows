import { composeDshTurn, dshSessionId } from './dsh-rpc.ts'

/** Local API `/agent/task` 共用中栏那棵 SDK 树；请求里的 profile 字段忽略。 */
export const LOCAL_API_SYSTEM =
  '你是 OPC 工作台的本机任务助手。完成用户交代的任务，只回复结果。'

export function localApiTaskSessionId(jobId: string): string {
  return dshSessionId('local-api', jobId)
}

export function composeLocalApiTask(prompt: string): string {
  return composeDshTurn(LOCAL_API_SYSTEM, prompt)
}

export type AgentTaskJobStatus = 'done' | 'error'

export interface AgentTaskJobResult {
  stdout: string
  stderr: string
  exitCode: number
  status: AgentTaskJobStatus
}

/**
 * 把 SDK 一轮对话收成 Local API 作业的 stdout/stderr。
 * 成功时 stdout 是助手正文（不再是 CLI 日志）。
 */
export function formatAgentTaskJob(input: { text?: string; error?: string }): AgentTaskJobResult {
  if (input.error) {
    return {
      stdout: '',
      stderr: withTrailingNewline(input.error),
      exitCode: 1,
      status: 'error',
    }
  }
  return {
    stdout: withTrailingNewline(input.text ?? ''),
    stderr: '',
    exitCode: 0,
    status: 'done',
  }
}

function withTrailingNewline(text: string): string {
  if (!text) {
    return text
  }
  return text.endsWith('\n') ? text : `${text}\n`
}
