import type { AgentRecord, ProjectContextFile, ThreadMessage, ThreadRecord } from './agent.ts'
import { HOST_AGENT_ID } from './agent.ts'
import { findHostAgent, isActiveRosterAgent, isRosterAgent, parseMentions } from './agents.ts'
import { composerContextChip, folderLabel } from './project-context-ui.ts'

export interface NewTaskClock {
  now: () => string
}

const defaultClock: NewTaskClock = {
  now: () => new Date().toISOString(),
}

export const NEW_PROJECT_ID = ''

export const NEW_TASK_PLACEHOLDER = '把这次的目标丢进来，材料也可以一起带上…'

export const NEW_PROJECT_EMPTY_HINT = '点「新项目」起一件新的，或点旁边箭头选已有的。'

export const PROJECT_TITLE_MAX = 40

export const PROJECT_DESC_MAX = 140

export interface NewTaskAgentChip {
  id: string
  title: string
  mark: string
  hue: number
  selected: boolean
  lead: boolean
  locked: boolean
}

export interface NewTaskProjectOption {
  id: string
  title: string
  pinned: boolean
}

export interface NewTaskPage {
  headline: string
  headlineBefore: string
  headlineAfter: string
  triggerLabel: string
  isNew: boolean
  projectId: string
  projects: NewTaskProjectOption[]
  placeholder: string
  hostLabel: string
  folderLabel: string
  chipLabel: string
  agents: NewTaskAgentChip[]
  selectedCount: number
  totalCount: number
  showComposer: boolean
  emptyHint: string
  brief: string
  leadId?: string
}

export interface NewTaskPageInput {
  threads: readonly ThreadRecord[]
  agents: readonly AgentRecord[]
  hostName: string
  projectId?: string
  selectedIds?: readonly string[]
  leadId?: string
  folderPath?: string
}

export function isProjectPinned(thread: Pick<ThreadRecord, 'pinnedAt'>): boolean {
  return Boolean(thread.pinnedAt)
}

function projectSortOrder(thread: ThreadRecord): number {
  return typeof thread.sortOrder === 'number' ? thread.sortOrder : Number.POSITIVE_INFINITY
}

export function compareProjects(left: ThreadRecord, right: ThreadRecord): number {
  const leftPin = isProjectPinned(left)
  const rightPin = isProjectPinned(right)
  if (leftPin !== rightPin) {
    return leftPin ? -1 : 1
  }
  const leftOrder = projectSortOrder(left)
  const rightOrder = projectSortOrder(right)
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder
  }
  if (leftPin) {
    return (right.pinnedAt ?? '').localeCompare(left.pinnedAt ?? '') || left.title.localeCompare(right.title, 'zh')
  }
  return right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title, 'zh')
}

export function listProjects(threads: readonly ThreadRecord[]): ThreadRecord[] {
  return threads
    .filter((thread) => thread.kind === 'user')
    .slice()
    .sort(compareProjects)
}

export function nextProjectSortOrder(threads: readonly ThreadRecord[]): number {
  const orders = listProjects(threads)
    .map((thread) => thread.sortOrder)
    .filter((order): order is number => typeof order === 'number')
  if (orders.length === 0) {
    return listProjects(threads).length
  }
  return Math.max(...orders) + 1
}

export function ensureProjectSortOrder(threads: readonly ThreadRecord[]): ThreadRecord[] {
  const listed = listProjects(threads)
  if (listed.length === 0 || listed.every((thread) => typeof thread.sortOrder === 'number')) {
    return [...threads]
  }
  const index = new Map(listed.map((thread, order) => [thread.id, order]))
  return threads.map((thread) => {
    const sortOrder = index.get(thread.id)
    return sortOrder == null ? thread : { ...thread, sortOrder }
  })
}

export function planReorderProjects(
  threads: readonly ThreadRecord[],
  ids: readonly string[],
): PlanProjectMutate {
  const listed = listProjects(threads)
  if (listed.length === 0) {
    return { ok: true, threads: [...threads] }
  }
  const listedIds = new Set(listed.map((thread) => thread.id))
  const ordered = ids.filter((id) => listedIds.has(id))
  for (const thread of listed) {
    if (!ordered.includes(thread.id)) {
      ordered.push(thread.id)
    }
  }
  const index = new Map(ordered.map((id, order) => [id, order]))
  return {
    ok: true,
    threads: threads.map((thread) => {
      const sortOrder = index.get(thread.id)
      return sortOrder == null ? thread : { ...thread, sortOrder }
    }),
  }
}

export function newTaskHeadline(projectTitle: string | undefined, isNew: boolean): string {
  return !isNew && projectTitle ? `在「${projectTitle}」里继续？` : '发起新项目？'
}

export function listNewTaskAgents(agents: readonly AgentRecord[]): AgentRecord[] {
  return agents.filter((agent) => isActiveRosterAgent(agent))
}

export function pickLeadId(selectedIds: readonly string[], preferred?: string): string | undefined {
  if (preferred && selectedIds.includes(preferred)) {
    return preferred
  }
  return selectedIds[0]
}

export function withHostAgent(agentIds: readonly string[], hostId: string = HOST_AGENT_ID): string[] {
  const ids = [...new Set(agentIds.filter((id) => id.length > 0))]
  if (!hostId) {
    return ids
  }
  return [hostId, ...ids.filter((id) => id !== hostId)]
}

export function hostAgentIdOf(agents: readonly AgentRecord[]): string | undefined {
  return findHostAgent(agents)?.id
}

export function ensureHostOnUserProjects(
  threads: readonly ThreadRecord[],
  hostId: string = HOST_AGENT_ID,
): ThreadRecord[] {
  return threads.map((thread) => {
    if (thread.kind !== 'user') {
      return thread
    }
    const agentIds = withHostAgent(thread.agentIds, hostId)
    const workspaceAgentId =
      thread.workspaceAgentId && agentIds.includes(thread.workspaceAgentId)
        ? thread.workspaceAgentId
        : hostId
    if (
      agentIds.length === thread.agentIds.length &&
      agentIds.every((id, index) => id === thread.agentIds[index]) &&
      workspaceAgentId === thread.workspaceAgentId
    ) {
      return thread
    }
    return { ...thread, agentIds, workspaceAgentId }
  })
}

export function defaultProjectAgentSelection(agents: readonly AgentRecord[]): {
  selectedIds: string[]
  leadId: string | undefined
} {
  const hostId = hostAgentIdOf(agents) ?? HOST_AGENT_ID
  return { selectedIds: [hostId], leadId: hostId }
}

export function describeNewTaskPage(input: NewTaskPageInput): NewTaskPage {
  const projects = listProjects(input.threads).map((thread) => ({
    id: thread.id,
    title: thread.title,
    pinned: isProjectPinned(thread),
  }))
  const isNew = !input.projectId
  const current = !isNew ? listProjects(input.threads).find((thread) => thread.id === input.projectId) : undefined
  const hostId = hostAgentIdOf(input.agents)
  const selected = new Set(input.selectedIds ?? current?.agentIds ?? [])
  if (hostId) {
    selected.add(hostId)
  }
  const leadId = pickLeadId([...selected], input.leadId ?? current?.workspaceAgentId ?? hostId)
  const folderPath = input.folderPath ?? current?.folderPath
  const chip = composerContextChip({ folderPath, hostName: input.hostName })
  const chips = listNewTaskAgents(input.agents).map((agent) => ({
    id: agent.id,
    title: agent.title,
    mark: agent.mark,
    hue: agent.hue,
    selected: selected.has(agent.id),
    lead: agent.id === leadId,
    locked: Boolean(hostId && agent.id === hostId),
  }))
  return {
    headline: newTaskHeadline(current?.title, isNew),
    headlineBefore: isNew ? '发起' : '在',
    headlineAfter: isNew ? '？' : '里继续？',
    triggerLabel: isNew ? '新项目' : (current?.title ?? '新项目'),
    isNew,
    projectId: current?.id ?? NEW_PROJECT_ID,
    projects,
    placeholder: NEW_TASK_PLACEHOLDER,
    hostLabel: input.hostName,
    folderLabel: folderLabel(folderPath),
    chipLabel: chip.label,
    agents: chips,
    selectedCount: chips.filter((item) => item.selected).length,
    totalCount: chips.length,
    showComposer: !isNew,
    emptyHint: isNew ? NEW_PROJECT_EMPTY_HINT : '',
    brief: current?.description?.trim() ?? '',
    ...(leadId ? { leadId } : {}),
  }
}

export function clickProjectAgent(
  selectedIds: readonly string[],
  leadId: string | undefined,
  id: string,
  lockedIds: readonly string[] = [HOST_AGENT_ID],
): { selectedIds: string[]; leadId: string | undefined } {
  const locked = [...new Set(lockedIds.filter((item) => item.length > 0))]
  const ensureLocked = (ids: readonly string[]): string[] => {
    const next = [...new Set(ids.filter((item) => item.length > 0))]
    for (const lockedId of locked) {
      if (!next.includes(lockedId)) {
        next.unshift(lockedId)
      }
    }
    return next
  }
  const current = ensureLocked(selectedIds)
  const currentLead = pickLeadId(current, leadId)
  if (!current.includes(id)) {
    const selected = ensureLocked([...current, id])
    return { selectedIds: selected, leadId: pickLeadId(selected, currentLead) }
  }
  if (currentLead !== id) {
    return { selectedIds: current, leadId: id }
  }
  if (locked.includes(id)) {
    return { selectedIds: current, leadId: id }
  }
  const selected = ensureLocked(current.filter((item) => item !== id))
  return { selectedIds: selected, leadId: pickLeadId(selected) }
}

export function titleFromTaskText(text: string): string {
  const line = text.split('\n').map((item) => item.trim()).find((item) => item.length > 0)
  if (!line) {
    return '新项目'
  }
  return line.length > 24 ? `${line.slice(0, 24)}…` : line
}

export function normalizeProjectTitle(title: string): string {
  const line = title.split('\n').map((item) => item.trim()).find((item) => item.length > 0) ?? ''
  return line.length > PROJECT_TITLE_MAX ? line.slice(0, PROJECT_TITLE_MAX) : line
}

export function normalizeProjectDescription(text: string): string {
  const value = text.trim()
  return value.length > PROJECT_DESC_MAX ? value.slice(0, PROJECT_DESC_MAX) : value
}

export type PlanProjectCreate =
  | { ok: false; error: string }
  | { ok: true; thread: ThreadRecord }

export function planProjectCreate(input: {
  title: string
  description?: string
  agentIds: readonly string[]
  workspaceAgentId?: string
  folderPath?: string
  attachedFiles?: readonly ProjectContextFile[]
  clock?: NewTaskClock
}): PlanProjectCreate {
  const title = normalizeProjectTitle(input.title)
  if (!title) {
    return { ok: false, error: '先给项目起个标题' }
  }
  const agentIds = withHostAgent(input.agentIds)
  const leadId = pickLeadId(agentIds, input.workspaceAgentId)
  if (!leadId) {
    return { ok: false, error: '先选至少一个成员加入项目' }
  }
  const description = normalizeProjectDescription(input.description ?? '')
  const folderPath = input.folderPath?.trim() ?? ''
  const clock = input.clock ?? defaultClock
  const now = clock.now()
  return {
    ok: true,
    thread: {
      id: `thread:user:${now}`,
      title,
      kind: 'user',
      agentIds,
      workspaceAgentId: leadId,
      ...(description ? { description } : {}),
      ...(folderPath ? { folderPath } : {}),
      ...(input.attachedFiles && input.attachedFiles.length > 0 ? { attachedFiles: [...input.attachedFiles] } : {}),
      createdAt: now,
      updatedAt: now,
    },
  }
}

export type PlanProjectSubmit =
  | { ok: false; error: string }
  | { ok: true; mode: 'create'; thread: ThreadRecord }
  | {
      ok: true
      mode: 'continue'
      threadId: string
      agentIds: string[]
      workspaceAgentId: string
      folderPath?: string
      attachedFiles?: ProjectContextFile[]
    }

export function planProjectSubmit(input: {
  text: string
  agentIds: readonly string[]
  workspaceAgentId?: string
  projectId?: string
  folderPath?: string
  attachedFiles?: readonly ProjectContextFile[]
  clock?: NewTaskClock
}): PlanProjectSubmit {
  const agentIds = withHostAgent(input.agentIds)
  const leadId = pickLeadId(agentIds, input.workspaceAgentId)
  if (!leadId) {
    return { ok: false, error: '先选至少一个成员加入项目' }
  }
  if (input.projectId) {
    return {
      ok: true,
      mode: 'continue',
      threadId: input.projectId,
      agentIds,
      workspaceAgentId: leadId,
      ...(input.folderPath ? { folderPath: input.folderPath } : {}),
      ...(input.attachedFiles && input.attachedFiles.length > 0 ? { attachedFiles: [...input.attachedFiles] } : {}),
    }
  }
  const clock = input.clock ?? defaultClock
  const now = clock.now()
  const folderPath = input.folderPath?.trim() ?? ''
  return {
    ok: true,
    mode: 'create',
    thread: {
      id: `thread:user:${now}`,
      title: titleFromTaskText(input.text),
      kind: 'user',
      agentIds,
      workspaceAgentId: leadId,
      ...(folderPath ? { folderPath } : {}),
      ...(input.attachedFiles && input.attachedFiles.length > 0 ? { attachedFiles: [...input.attachedFiles] } : {}),
      createdAt: now,
      updatedAt: now,
    },
  }
}

export type PlanProjectMutate =
  | { ok: false; error: string }
  | { ok: true; threads: ThreadRecord[] }

export function planPinProject(
  threads: readonly ThreadRecord[],
  threadId: string,
  pinned: boolean,
  clock: NewTaskClock = defaultClock,
): PlanProjectMutate {
  const thread = threads.find((item) => item.id === threadId)
  if (!thread || thread.kind !== 'user') {
    return { ok: false, error: '没有这个项目' }
  }
  const pinnedAt = pinned ? clock.now() : undefined
  const others = listProjects(threads).filter((item) => item.id !== threadId && isProjectPinned(item))
  const pinnedOrders = others
    .map((item) => item.sortOrder)
    .filter((order): order is number => typeof order === 'number')
  return {
    ok: true,
    threads: threads.map((item) => {
      if (item.id !== threadId) {
        return item
      }
      const next = { ...item }
      if (pinnedAt) {
        next.pinnedAt = pinnedAt
        next.sortOrder = pinnedOrders.length > 0 ? Math.min(...pinnedOrders) - 1 : (item.sortOrder ?? 0)
      } else {
        delete next.pinnedAt
      }
      return next
    }),
  }
}

export function planRenameProject(
  threads: readonly ThreadRecord[],
  threadId: string,
  title: string,
): PlanProjectMutate {
  const thread = threads.find((item) => item.id === threadId)
  if (!thread || thread.kind !== 'user') {
    return { ok: false, error: '没有这个项目' }
  }
  const nextTitle = normalizeProjectTitle(title)
  if (!nextTitle) {
    return { ok: false, error: '先给项目起个标题' }
  }
  return {
    ok: true,
    threads: threads.map((item) => (item.id === threadId ? { ...item, title: nextTitle } : item)),
  }
}

export type PlanDeleteProject =
  | { ok: false; error: string }
  | { ok: true; threads: ThreadRecord[]; messages: ThreadMessage[] }

export function planDeleteProject(
  threads: readonly ThreadRecord[],
  messages: readonly ThreadMessage[],
  threadId: string,
): PlanDeleteProject {
  const thread = threads.find((item) => item.id === threadId)
  if (!thread || thread.kind !== 'user') {
    return { ok: false, error: '没有这个项目' }
  }
  return {
    ok: true,
    threads: threads.filter((item) => item.id !== threadId),
    messages: messages.filter((item) => item.threadId !== threadId),
  }
}

/** 发起新项目时不带上一段会话；今日空收件箱也不出空列表。 */
export function shouldShowThreadFeed(view: string, messageCount: number): boolean {
  if (
    view === 'task' ||
    view === 'schedule' ||
    view === 'tasks' ||
    view === 'extensions' ||
    view === 'prefs'
  ) {
    return false
  }
  return !(view === 'home' && messageCount === 0)
}

/** 今日简报只在收件箱且没有会话时出现；新项目/日程把它藏掉。 */
export function shouldHideHomeBoard(
  view: string,
  threadId: string,
  inboxId: string,
  messageCount: number,
): boolean {
  return (
    view === 'task' ||
    view === 'schedule' ||
    view === 'tasks' ||
    threadId !== inboxId ||
    messageCount > 0
  )
}

export function homeThreadForeignTitles(
  thread: Pick<ThreadRecord, 'kind' | 'agentIds'>,
  text: string,
  agents: readonly AgentRecord[],
): string[] {
  if (thread.kind !== 'agent') {
    return []
  }
  const own = new Set(thread.agentIds)
  const parsed = parseMentions(text, agents.filter((agent) => isRosterAgent(agent)))
  const titles: string[] = []
  const seen = new Set<string>()
  for (const id of parsed.agentIds) {
    if (own.has(id) || seen.has(id)) {
      continue
    }
    seen.add(id)
    const title = agents.find((agent) => agent.id === id)?.title
    if (title) {
      titles.push(title)
    }
  }
  return titles
}
