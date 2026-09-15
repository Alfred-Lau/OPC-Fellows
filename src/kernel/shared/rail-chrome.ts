import { compareRosterAgents, isActiveRosterAgent } from './agents.ts'
import type { AgentRecord, ThreadRecord } from './agent.ts'
import { isProjectPinned, listProjects } from './new-task.ts'

export const RAIL_DRAG_THRESHOLD = 8

export type RailList = 'pinned' | 'project' | 'agent'

export function listPinnedProjects(threads: readonly ThreadRecord[]): ThreadRecord[] {
  return listProjects(threads).filter((thread) => isProjectPinned(thread))
}

export function listUnpinnedProjects(threads: readonly ThreadRecord[]): ThreadRecord[] {
  return listProjects(threads).filter((thread) => !isProjectPinned(thread))
}

export function moveRailIds(ids: string[], fromId: string, toId: string, before: boolean): string[] {
  const next = ids.filter((id) => id !== fromId)
  let insert = next.indexOf(toId)
  if (insert < 0) {
    return ids
  }
  if (!before) {
    insert += 1
  }
  next.splice(insert, 0, fromId)
  return next
}

export function insertBeforeIdFromY(
  items: readonly { id: string; top: number; height: number }[],
  y: number,
): string | undefined {
  for (const item of items) {
    if (y < item.top + item.height / 2) {
      return item.id
    }
  }
  return undefined
}

export function idsAtPlaceholder(childIds: readonly (string | 'placeholder')[], fromId: string): string[] {
  const next: string[] = []
  for (const id of childIds) {
    if (id === 'placeholder') {
      next.push(fromId)
      continue
    }
    if (id !== fromId) {
      next.push(id)
    }
  }
  if (!next.includes(fromId)) {
    next.push(fromId)
  }
  return next
}

function byRailSortOrder<T extends { sortOrder?: number }>(left: T, right: T): number {
  const leftOrder = typeof left.sortOrder === 'number' ? left.sortOrder : Number.POSITIVE_INFINITY
  const rightOrder = typeof right.sortOrder === 'number' ? right.sortOrder : Number.POSITIVE_INFINITY
  return leftOrder - rightOrder
}

export function applyAgentSortOrder<T extends { id: string; sortOrder?: number }>(
  agents: readonly T[],
  ids: readonly string[],
): T[] {
  const index = new Map(ids.map((id, order) => [id, order]))
  return agents
    .map((agent) => {
      const sortOrder = index.get(agent.id)
      return sortOrder == null ? agent : { ...agent, sortOrder }
    })
    .sort(byRailSortOrder)
}

export function listedAgentRailIds(
  agents: readonly Pick<AgentRecord, 'id' | 'sortOrder' | 'status'>[],
): string[] {
  return [...agents]
    .filter((agent) => agent.status !== 'needs-module')
    .sort(byRailSortOrder)
    .map((agent) => agent.id)
}

export function sortAgentsForRail<T extends AgentRecord>(agents: readonly T[]): T[] {
  return agents.filter((agent) => isActiveRosterAgent(agent)).sort(compareRosterAgents)
}

export function mergeProjectRailIds(pinnedIds: readonly string[], projectIds: readonly string[]): string[] {
  return [...pinnedIds, ...projectIds]
}
