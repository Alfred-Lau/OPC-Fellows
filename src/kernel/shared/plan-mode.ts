import { isIdentityAsk, isInboxQuestion } from '../../shared/intent-route.ts'
import { skipsPlanGate } from './coding-skills.ts'
import { WORKSPACE_TOOL_PACK, type ToolPackId } from './tool-packs.ts'

export type PlanStatus = 'draft' | 'approved'

export type ComposerMode = 'ask' | 'plan' | 'agent'

export interface ThreadPlan {
  status: PlanStatus
  text: string
  agentId?: string
}

export interface ChatTurnOptions {
  mode?: ComposerMode
}

export interface ComposerTurnInput {
  requested?: ComposerMode
  stored?: ComposerMode
  userText: string
  agent?: { planMode?: boolean; templateId?: string }
}

export interface ComposerTurn {
  mode: ComposerMode
  writeAllowed: boolean
  savePlan: boolean
  injectPlan: boolean
}

const COMPOSER_MODES = ['ask', 'plan', 'agent'] as const

export function parseComposerMode(value: unknown): ComposerMode | undefined {
  return typeof value === 'string' && COMPOSER_MODES.includes(value as ComposerMode)
    ? (value as ComposerMode)
    : undefined
}

export function parseChatTurnOptions(value: unknown): ChatTurnOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  const row = value as Record<string, unknown>
  const mode = parseComposerMode(row.mode)
  return mode ? { mode } : {}
}

export function isExecutePlanPhrase(text: string): boolean {
  return /^(按计划执行|执行计划|开始执行|批准计划)([。.!！]|$)/.test(text.trim()) || /按计划执行|执行这份计划/.test(text)
}

export function isPlanOnlyAsk(text: string): boolean {
  return /^(先)?(做个)?计划$/.test(text.trim()) || /进入计划模式|只要计划不要动手/.test(text)
}

export function isReadOnlyAsk(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || isPlanOnlyAsk(trimmed) || isExecutePlanPhrase(trimmed)) {
    return false
  }
  if (isIdentityAsk(trimmed) || isInboxQuestion(trimmed)) {
    return true
  }
  return /[？?]$/.test(trimmed)
}

export function offersComposerModes(agent?: {
  planMode?: boolean
  toolPacks?: readonly ToolPackId[]
}): boolean {
  if (!agent) {
    return false
  }
  return Boolean(agent.planMode) || (agent.toolPacks ?? []).includes(WORKSPACE_TOOL_PACK)
}

export function defaultComposerMode(agent?: { planMode?: boolean }): ComposerMode {
  return agent?.planMode ? 'plan' : 'agent'
}

export function composerModeOf(
  stored: ComposerMode | undefined,
  agent?: { planMode?: boolean },
): ComposerMode {
  return stored ?? defaultComposerMode(agent)
}

export function resolveComposerTurn(input: ComposerTurnInput): ComposerTurn {
  const text = input.userText
  if (isExecutePlanPhrase(text)) {
    return { mode: 'agent', writeAllowed: true, savePlan: false, injectPlan: true }
  }
  const picked =
    input.requested ??
    (isPlanOnlyAsk(text) ? 'plan' : undefined) ??
    input.stored ??
    defaultComposerMode(input.agent)
  if (picked !== 'agent' && skipsPlanGate(text) && !isPlanOnlyAsk(text)) {
    return { mode: 'agent', writeAllowed: true, savePlan: false, injectPlan: false }
  }
  switch (picked) {
    case 'ask':
      return { mode: 'ask', writeAllowed: false, savePlan: false, injectPlan: false }
    case 'plan':
      return {
        mode: 'plan',
        writeAllowed: false,
        savePlan: !isReadOnlyAsk(text),
        injectPlan: false,
      }
    case 'agent':
      return { mode: 'agent', writeAllowed: true, savePlan: false, injectPlan: false }
    default: {
      const exhaustive: never = picked
      return exhaustive
    }
  }
}

export function askOnlySystemPrompt(): string {
  return '现在是问模式：只用读工具回答。不要改文件、不要跑会改状态的命令、不要输出等人批准的实现计划。'
}

export function planOnlySystemPrompt(): string {
  return [
    '现在是计划模式：先用读工具摸清现状，再输出可执行的 Markdown 计划（步骤、将调用的工具、风险、涉及文件）。',
    '不要调用 edit、write、bash、shell 或会改文件、入账、转稿、发帖、跑破坏性命令的写工具。',
    '操作者点「按计划执行」或切到动手之后才动手。',
    '写工具被拒时告诉操作者切动手或点「按计划执行」。',
  ].join('')
}

export function buildPlanSystemPrompt(plan: string): string {
  return [
    '按下面这份已确认的计划动手。现状和计划不符时说明并做最小必要修正，不要再等人批准一份新计划。',
    '',
    '## 计划',
    plan.trim(),
  ].join('\n')
}

export function composerModePrompt(turn: ComposerTurn, planText = ''): string {
  switch (turn.mode) {
    case 'ask':
      return askOnlySystemPrompt()
    case 'plan':
      return planOnlySystemPrompt()
    case 'agent':
      return turn.injectPlan && planText.trim() ? buildPlanSystemPrompt(planText) : ''
    default: {
      const exhaustive: never = turn.mode
      return exhaustive
    }
  }
}

export function planSavedReply(plan: string): string {
  return `${plan.trim()}\n\n---\n计划已记下。可改步骤，然后点「按计划执行」或切到动手。`
}

export function threadPlanOf(
  thread: { plan?: ThreadPlan; plans?: Partial<Record<string, ThreadPlan>>; workspaceAgentId?: string; agentIds?: readonly string[] } | undefined,
  agentId: string,
): ThreadPlan | undefined {
  if (!thread) {
    return undefined
  }
  const keyed = thread.plans?.[agentId]
  if (keyed) {
    return keyed
  }
  if (thread.plans && Object.keys(thread.plans).length > 0) {
    return undefined
  }
  if (thread.plan && (!thread.plan.agentId || thread.plan.agentId === agentId)) {
    return thread.plan
  }
  return undefined
}

export function storedComposerModeOf(
  thread: { composerMode?: ComposerMode; composerModes?: Partial<Record<string, ComposerMode>> } | undefined,
  agentId?: string,
): ComposerMode | undefined {
  const current = parseComposerMode(thread?.composerMode)
  if (current) {
    return current
  }
  if (agentId) {
    return parseComposerMode(thread?.composerModes?.[agentId])
  }
  return undefined
}
