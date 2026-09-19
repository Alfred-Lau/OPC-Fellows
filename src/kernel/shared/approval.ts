import { isNativeWriteTool } from './opc-tools.ts'
import { sessionIdFromToolExec } from './opc-tool-bridge.ts'

export type ApprovalDecision = 'allow' | 'reject'
export type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'

export interface ApprovalPrompt {
  id: string
  sessionId: string
  toolName: string
  reason: string
  threadId?: string
  agentId?: string
}

export function parseApprovalDecision(value: unknown): ApprovalDecision | null {
  if (value === 'allow' || value === 'reject') {
    return value
  }
  return null
}

export function approvalOutcomeFromDecision(decision: ApprovalDecision): Extract<ApprovalOutcome, 'allowed-once' | 'rejected'> {
  switch (decision) {
    case 'allow':
      return 'allowed-once'
    case 'reject':
      return 'rejected'
    default: {
      const exhaustive: never = decision
      return exhaustive
    }
  }
}

/** 开口模式已经是写闸：动手直接放行原生写；问/计划直接拒，不再等沙箱审批卡。 */
export function nativeWriteApprovalOutcome(
  toolName: string,
  writeAllowed: boolean | undefined,
): Extract<ApprovalOutcome, 'allowed-once' | 'rejected'> | null {
  if (!isNativeWriteTool(toolName)) {
    return null
  }
  if (writeAllowed === false) {
    return 'rejected'
  }
  if (writeAllowed === true) {
    return 'allowed-once'
  }
  return null
}

export function describeApproval(input: { toolName: string; reason: string }): { title: string; body: string } {
  const reason = input.reason.trim()
  const tool = input.toolName.trim() || '工具'
  if (/escalate sandbox/i.test(reason)) {
    return { title: '需要提权', body: reason }
  }
  return { title: '需要审批', body: reason || `允许「${tool}」继续？` }
}

export function parseApprovalAskBody(
  value: unknown,
): { sessionId: string; toolName: string; reason: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const row = value as Record<string, unknown>
  const sessionId = typeof row.sessionId === 'string' ? row.sessionId.trim() : ''
  const toolName = typeof row.toolName === 'string' ? row.toolName.trim() : ''
  if (!sessionId || !toolName) {
    return null
  }
  const reason = typeof row.reason === 'string' ? row.reason.trim() : ''
  return { sessionId, toolName, reason }
}

export function sessionIdFromApprovalAgent(agent: unknown): string {
  return sessionIdFromToolExec({ agent }) || sessionIdFromToolExec(agent)
}

export class ApprovalGate {
  private readonly pending = new Map<string, (outcome: ApprovalOutcome) => void>()
  private readonly notify: (prompt: ApprovalPrompt) => void

  constructor(notify: (prompt: ApprovalPrompt) => void) {
    this.notify = notify
  }

  ask(prompt: ApprovalPrompt, signal?: AbortSignal): Promise<ApprovalOutcome> {
    if (signal?.aborted) {
      return Promise.resolve('cancelled')
    }
    return new Promise((resolve) => {
      const finish = (outcome: ApprovalOutcome): void => {
        if (!this.pending.delete(prompt.id)) {
          return
        }
        signal?.removeEventListener('abort', onAbort)
        resolve(outcome)
      }
      const onAbort = (): void => {
        finish('cancelled')
      }
      this.pending.set(prompt.id, finish)
      signal?.addEventListener('abort', onAbort, { once: true })
      this.notify(prompt)
    })
  }

  decide(id: string, raw: unknown): boolean {
    const decision = parseApprovalDecision(raw)
    const finish = this.pending.get(id)
    if (!decision || !finish) {
      return false
    }
    finish(approvalOutcomeFromDecision(decision))
    return true
  }
}
