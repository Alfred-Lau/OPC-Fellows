import { basename, extname, join } from 'node:path'
import { hasIdentityDirectory, type AgentRecord } from './agent.ts'
import { normalizeAbsPath } from './project-context.ts'

/** Electron userData 根目录不是身份目录；职业产物不能写进 Application Support。 */
export function isAppUserDataRoot(path: string, userData: string): boolean {
  const target = normalizeAbsPath(path)
  const data = normalizeAbsPath(userData)
  return Boolean(target && data && target === data)
}

export { hasIdentityDirectory }

/** 主对话里的身份目录默认落在家目录下的 OPC-Fellows/agents/{标题}。 */
export const IDENTITY_DIRECTORY_SEGMENTS = ['OPC-Fellows', 'agents'] as const

export function identityDirectoryRoot(home: string): string {
  return join(normalizeAbsPath(home), ...IDENTITY_DIRECTORY_SEGMENTS)
}

export function identityDirectorySlug(title: string): string {
  const trimmed = title.trim().toLowerCase()
  const slug = trimmed
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
  return slug || 'agent'
}

export function defaultIdentityDirectory(
  home: string,
  title: string,
  taken: readonly string[] = [],
): string {
  const root = identityDirectoryRoot(home)
  const slug = identityDirectorySlug(title)
  const occupied = new Set(taken.map((path) => normalizeAbsPath(path)).filter(Boolean))
  let candidate = join(root, slug)
  if (!occupied.has(normalizeAbsPath(candidate))) {
    return candidate
  }
  let index = 2
  while (occupied.has(normalizeAbsPath(join(root, `${slug}-${index}`)))) {
    index += 1
  }
  return join(root, `${slug}-${index}`)
}

export function resolveIdentityDirectory(
  home: string,
  title: string,
  taken: readonly string[] = [],
  requested?: string,
): string {
  const picked = requested?.trim()
  if (picked) {
    return normalizeAbsPath(picked)
  }
  return defaultIdentityDirectory(home, title, taken)
}

export function takenIdentityDirectories(agents: readonly Pick<AgentRecord, 'workspacePath'>[]): string[] {
  return agents
    .map((agent) => agent.workspacePath)
    .filter((path): path is string => Boolean(path?.trim()))
    .map((path) => normalizeAbsPath(path))
}

export function fillMissingIdentityDirectories(
  agents: readonly AgentRecord[],
  home: string,
  occupied: readonly string[] = [],
  userData?: string,
): AgentRecord[] {
  const taken = [...occupied.map((path) => normalizeAbsPath(path)).filter(Boolean)]
  return agents.map((agent) => {
    if (!hasIdentityDirectory(agent)) {
      return agent
    }
    const current = agent.workspacePath?.trim()
    if (current && !(userData && isAppUserDataRoot(current, userData))) {
      return agent
    }
    const path = defaultIdentityDirectory(home, agent.title, taken)
    taken.push(normalizeAbsPath(path))
    return { ...agent, workspacePath: path }
  })
}

export function legacyIdentityDirectory(userData: string, agentId: string): string {
  return join(normalizeAbsPath(userData), 'workspaces', identityDirectorySlug(agentId))
}

/**
 * 成员身份目录：已绑路径优先；旧 userData/workspaces 目录还在就不迁；
 * userData 根目录不算身份目录，回退到 ~/OPC-Fellows/agents/{标题}。
 * 窗身份没有身份目录。
 */
export function resolveAgentWorkspacePath(input: {
  kind: AgentRecord['kind']
  workspacePath?: string
  title: string
  agentId: string
  home: string
  userData: string
  taken?: readonly string[]
  legacyExists?: boolean
}): string | undefined {
  if (!hasIdentityDirectory(input)) {
    return undefined
  }
  const picked = input.workspacePath?.trim()
  if (picked && !isAppUserDataRoot(picked, input.userData)) {
    return normalizeAbsPath(picked)
  }
  if (input.legacyExists) {
    return legacyIdentityDirectory(input.userData, input.agentId)
  }
  return defaultIdentityDirectory(input.home, input.title, input.taken ?? [])
}

export function nextAvailableFile(dir: string, fileName: string, exists: (path: string) => boolean): string {
  const root = normalizeAbsPath(dir)
  const ext = extname(fileName)
  const stem = basename(fileName, ext) || 'file'
  let candidate = join(root, `${stem}${ext}`)
  let index = 2
  while (exists(candidate)) {
    candidate = join(root, `${stem}-${index}${ext}`)
    index += 1
  }
  return candidate
}
