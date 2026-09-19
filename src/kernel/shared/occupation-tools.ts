/**
 * 职业 Skill 口令 → ctx.tools 名。口令桥只负责亮 Panel，执行走同一套工具。
 */

export interface OccupationInvokeSpec {
  invoke: string
  tool: string
  reveal?: OccupationReveal
}

export type OccupationReveal = { kind: 'social' }

export const OCCUPATION_INVOKES: readonly OccupationInvokeSpec[] = [
  { invoke: 'load', tool: 'social_load', reveal: { kind: 'social' } },
  { invoke: 'publish', tool: 'social_publish', reveal: { kind: 'social' } },
  { invoke: 'metrics', tool: 'social_metrics', reveal: { kind: 'social' } },
  { invoke: 'review', tool: 'social_recap', reveal: { kind: 'social' } },
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
