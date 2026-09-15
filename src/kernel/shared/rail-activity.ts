export type RailActivityKind = 'idle' | 'thinking' | 'working' | 'error'

export interface RailActivityMark {
  agentId: string
  threadId: string
  kind: Exclude<RailActivityKind, 'idle'>
}

const ACTIVITY_RANK: Record<RailActivityKind, number> = {
  idle: 0,
  error: 1,
  thinking: 2,
  working: 3,
}

export function describeRailActivity(kind: RailActivityKind): string {
  switch (kind) {
    case 'idle':
      return ''
    case 'thinking':
      return '正在想'
    case 'working':
      return '正在做'
    case 'error':
      return '没接上'
    default: {
      const exhaustive: never = kind
      return exhaustive
    }
  }
}

export function upsertRailMark(
  marks: readonly RailActivityMark[],
  next: RailActivityMark,
): RailActivityMark[] {
  return [...marks.filter((mark) => mark.agentId !== next.agentId), next]
}

export function removeRailMark(marks: readonly RailActivityMark[], agentId: string): RailActivityMark[] {
  return marks.filter((mark) => mark.agentId !== agentId)
}

export function isRailBusy(marks: readonly RailActivityMark[]): boolean {
  return marks.some((mark) => mark.kind === 'thinking' || mark.kind === 'working')
}

export function strongestRailActivity(kinds: readonly RailActivityKind[]): RailActivityKind {
  let best: RailActivityKind = 'idle'
  for (const kind of kinds) {
    if (ACTIVITY_RANK[kind] > ACTIVITY_RANK[best]) {
      best = kind
    }
  }
  return best
}

export function agentRailActivity(
  agentId: string,
  marks: readonly RailActivityMark[],
): RailActivityKind {
  return marks.find((mark) => mark.agentId === agentId)?.kind ?? 'idle'
}

export function projectRailActivity(
  thread: { id: string },
  marks: readonly RailActivityMark[],
): RailActivityKind {
  return strongestRailActivity(
    marks.filter((mark) => mark.threadId === thread.id).map((mark) => mark.kind),
  )
}
