/**
 * 职业 Skill 口令 → ctx.tools 名。口令桥只负责亮 Panel，执行走同一套工具。
 */

export interface OccupationInvokeSpec {
  invoke: string
  tool: string
  reveal?: OccupationReveal
}

export type OccupationReveal =
  | { kind: 'monitor'; group: 'overview' | 'projects' | 'perf' }
  | { kind: 'micro'; board: 'today' | 'pipeline' }
  | { kind: 'payments'; group: 'overview' | 'transactions' | 'expenses' | 'payouts' }
  | { kind: 'wxhub'; group: 'today' | 'inbox' | 'lookup' | 'settings' }
  | { kind: 'mail'; group: 'inbox' | 'lookup' | 'settings' }
  | { kind: 'social' }
  | { kind: 'wxdraft' }
  | { kind: 'accounts' }
  | { kind: 'notes'; query: string }
  | { kind: 'growth'; group: 'experiments' | 'loops' | 'channels' }

export const OCCUPATION_INVOKES: readonly OccupationInvokeSpec[] = [
  { invoke: 'refresh', tool: 'monitor_refresh', reveal: { kind: 'monitor', group: 'overview' } },
  { invoke: 'traffic', tool: 'monitor_read', reveal: { kind: 'monitor', group: 'overview' } },
  { invoke: 'health', tool: 'monitor_health', reveal: { kind: 'monitor', group: 'projects' } },
  { invoke: 'pages', tool: 'monitor_pages', reveal: { kind: 'monitor', group: 'overview' } },
  { invoke: 'speed', tool: 'monitor_speed', reveal: { kind: 'monitor', group: 'perf' } },
  { invoke: 'scan', tool: 'micro_scan', reveal: { kind: 'micro', board: 'today' } },
  { invoke: 'review', tool: 'micro_review', reveal: { kind: 'micro', board: 'today' } },
  { invoke: 'pipeline', tool: 'micro_pipeline', reveal: { kind: 'micro', board: 'pipeline' } },
  { invoke: 'handoff', tool: 'micro_handoff', reveal: { kind: 'micro', board: 'today' } },
  { invoke: 'sync', tool: 'payments_sync', reveal: { kind: 'payments', group: 'overview' } },
  { invoke: 'read', tool: 'payments_read', reveal: { kind: 'payments', group: 'overview' } },
  { invoke: 'manual', tool: 'payments_manual', reveal: { kind: 'payments', group: 'transactions' } },
  { invoke: 'expense', tool: 'payments_expense', reveal: { kind: 'payments', group: 'expenses' } },
  { invoke: 'export', tool: 'payments_export', reveal: { kind: 'payments', group: 'overview' } },
  { invoke: 'today', tool: 'wxhub_today', reveal: { kind: 'wxhub', group: 'today' } },
  { invoke: 'reply', tool: 'wxhub_inbox', reveal: { kind: 'wxhub', group: 'inbox' } },
  { invoke: 'triage', tool: 'wxhub_triage', reveal: { kind: 'wxhub', group: 'inbox' } },
  { invoke: 'lookup', tool: 'wxhub_lookup', reveal: { kind: 'wxhub', group: 'lookup' } },
  { invoke: 'access', tool: 'wxhub_access', reveal: { kind: 'wxhub', group: 'settings' } },
  { invoke: 'mailbox', tool: 'mail_inbox', reveal: { kind: 'mail', group: 'inbox' } },
  { invoke: 'sort-mail', tool: 'mail_triage', reveal: { kind: 'mail', group: 'inbox' } },
  { invoke: 'find-mail', tool: 'mail_lookup', reveal: { kind: 'mail', group: 'lookup' } },
  { invoke: 'mail-reply', tool: 'mail_draft', reveal: { kind: 'mail', group: 'inbox' } },
  { invoke: 'mail-access', tool: 'mail_access', reveal: { kind: 'mail', group: 'settings' } },
  { invoke: 'load', tool: 'social_load', reveal: { kind: 'social' } },
  { invoke: 'publish', tool: 'social_publish', reveal: { kind: 'social' } },
  { invoke: 'metrics', tool: 'social_metrics', reveal: { kind: 'social' } },
  { invoke: 'day-metrics', tool: 'accounts_metrics', reveal: { kind: 'accounts' } },
  { invoke: 'draft', tool: 'wxdraft_ingest', reveal: { kind: 'wxdraft' } },
  { invoke: 'meta', tool: 'wxdraft_meta', reveal: { kind: 'wxdraft' } },
  { invoke: 'history', tool: 'wxdraft_history', reveal: { kind: 'wxdraft' } },
  { invoke: 'create', tool: 'accounts_create', reveal: { kind: 'accounts' } },
  { invoke: 'log', tool: 'accounts_log', reveal: { kind: 'accounts' } },
  { invoke: 'material', tool: 'accounts_material', reveal: { kind: 'accounts' } },
  { invoke: 'find', tool: 'notes_find', reveal: { kind: 'notes', query: '' } },
  { invoke: 'promote', tool: 'notes_promote', reveal: { kind: 'notes', query: '' } },
  { invoke: 'diagnose', tool: 'growth_diagnose', reveal: { kind: 'growth', group: 'experiments' } },
  { invoke: 'experiment', tool: 'growth_experiment', reveal: { kind: 'growth', group: 'experiments' } },
  { invoke: 'verdict', tool: 'growth_verdict', reveal: { kind: 'growth', group: 'experiments' } },
  { invoke: 'loop', tool: 'growth_loop', reveal: { kind: 'growth', group: 'loops' } },
  { invoke: 'rank', tool: 'growth_rank', reveal: { kind: 'growth', group: 'channels' } },
  { invoke: 'ship', tool: 'growth_ship', reveal: { kind: 'growth', group: 'experiments' } },
]

const BY_INVOKE = new Map(OCCUPATION_INVOKES.map((row) => [row.invoke, row]))

export function occupationInvokeSpec(invoke: string): OccupationInvokeSpec | undefined {
  return BY_INVOKE.get(invoke)
}

export function occupationToolForInvoke(invoke: string): string | undefined {
  return BY_INVOKE.get(invoke)?.tool
}

export function pinnedArg(ids?: readonly string[]): string {
  return ids && ids.length > 0 ? ids.join(',') : ''
}

export function parsePinnedArg(value: string | undefined): string[] {
  if (!value?.trim()) {
    return []
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function flagArg(value: boolean): string {
  return value ? 'true' : 'false'
}

export function parseFlagArg(value: string | undefined): boolean {
  return value === 'true' || value === '1' || value === 'yes'
}
