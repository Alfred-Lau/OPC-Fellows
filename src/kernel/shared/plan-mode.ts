export type PlanStatus = 'draft' | 'approved'

export interface ThreadPlan {
  status: PlanStatus
  text: string
}

export function isExecutePlanPhrase(text: string): boolean {
  return /^(按计划执行|执行计划|开始执行|批准计划)([。.!！]|$)/.test(text.trim()) || /按计划执行|执行这份计划/.test(text)
}

export function isPlanOnlyAsk(text: string): boolean {
  return /^(先)?(做个)?计划$/.test(text.trim()) || /进入计划模式|只要计划不要动手/.test(text)
}

export function planOnlySystemPrompt(): string {
  return [
    '现在是计划模式：只输出可执行的 Markdown 计划（步骤、将调用的工具、风险）。',
    '不要调用会改文件、入账、转稿、发帖、跑破坏性命令的写工具。',
    '用户说「按计划执行」之后才动手。',
  ].join('')
}

export function planSavedReply(plan: string): string {
  return `${plan.trim()}\n\n---\n计划已记下。确认后回复「按计划执行」。`
}
