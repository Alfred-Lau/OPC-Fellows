/**
 * 项目工作目录 = dsh initialize 的 cwd。
 * 选了文件夹之后，dsh-fs / 终端 / 工作区文件树 / 会话里写下的文档都落在这里。
 * 权威业务数据仍在 module-data/，不搬进这个目录。
 */

import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { ProjectContextFile, ThreadRecord } from './agent.ts'
import {
  canBindProjectFolder,
  composerContextChip,
  composerContextMenuItems,
  composeWorkspaceSystemHint,
  folderLabel,
} from './project-context-ui.ts'

export type { ProjectContextFile }
export type {
  ComposerContextAction,
  ComposerContextChip,
  ComposerContextMenuItem,
} from './project-context-ui.ts'
export {
  canBindProjectFolder,
  composerContextChip,
  composerContextMenuItems,
  composeWorkspaceSystemHint,
  folderLabel,
}

export type PlanProjectContext =
  | { ok: false; error: string }
  | { ok: true; thread: ThreadRecord }

const ATTACHED_FILE_LIMIT = 12
const ATTACHED_TEXT_LIMIT = 80_000

export function normalizeAbsPath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) {
    return ''
  }
  const resolved = resolve(trimmed)
  if (resolved === sep || /^[A-Za-z]:[\\/]?$/.test(resolved)) {
    return resolved
  }
  return resolved.replace(/[\\/]+$/, '')
}

export function isPathInside(root: string, candidate: string): boolean {
  const base = normalizeAbsPath(root)
  const target = normalizeAbsPath(candidate)
  if (!base || !target) {
    return false
  }
  if (base === target) {
    return true
  }
  const rel = relative(base, target)
  return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel)
}

export function relativeToFolder(root: string, candidate: string): string | null {
  if (!isPathInside(root, candidate)) {
    return null
  }
  const rel = relative(normalizeAbsPath(root), normalizeAbsPath(candidate))
  return rel || '.'
}

export function filterFilesInsideFolder(
  folderPath: string | undefined,
  files: readonly ProjectContextFile[],
): ProjectContextFile[] {
  if (!folderPath) {
    return uniqueFiles(files)
  }
  return uniqueFiles(files.filter((file) => isPathInside(folderPath, file.path)))
}

export function contextFileFromPath(path: string): ProjectContextFile | undefined {
  const normalized = normalizeAbsPath(path)
  if (!normalized) {
    return undefined
  }
  return { path: normalized, name: basename(normalized) }
}

export function commonParentFolder(paths: readonly string[]): string | undefined {
  const dirs = paths.map((path) => dirname(normalizeAbsPath(path))).filter(Boolean)
  if (dirs.length === 0) {
    return undefined
  }
  let parent = dirs[0] ?? ''
  for (const dir of dirs.slice(1)) {
    while (parent && parent !== dirname(parent) && !isPathInside(parent, dir)) {
      parent = dirname(parent)
    }
    if (parent && !isPathInside(parent, dir) && parent !== dir) {
      parent = dirs[0] ?? ''
      break
    }
  }
  if (!parent || parent === sep || /^[A-Za-z]:[\\/]?$/.test(parent)) {
    return dirs[0]
  }
  return parent
}

export function planSetProjectFolder(
  threads: readonly ThreadRecord[],
  threadId: string,
  folderPath: string,
): PlanProjectContext {
  const thread = threads.find((item) => item.id === threadId)
  if (!canBindProjectFolder(thread) || !thread) {
    return { ok: false, error: '今日不是项目。先开一件项目再绑文件夹。' }
  }
  const folder = normalizeAbsPath(folderPath)
  if (!folder) {
    return { ok: false, error: '没有选到文件夹' }
  }
  return {
    ok: true,
    thread: withContext(thread, folder, filterFilesInsideFolder(folder, thread.attachedFiles ?? [])),
  }
}

export function planClearProjectFolder(threads: readonly ThreadRecord[], threadId: string): PlanProjectContext {
  const thread = threads.find((item) => item.id === threadId)
  if (!canBindProjectFolder(thread) || !thread) {
    return { ok: false, error: '今日不是项目。' }
  }
  const next = { ...thread }
  delete next.folderPath
  delete next.attachedFiles
  return { ok: true, thread: next }
}

export function planAttachProjectFiles(
  threads: readonly ThreadRecord[],
  threadId: string,
  paths: readonly string[],
): PlanProjectContext {
  const thread = threads.find((item) => item.id === threadId)
  if (!canBindProjectFolder(thread) || !thread) {
    return { ok: false, error: '今日不是项目。先开一件项目再引用文件。' }
  }
  const incoming = paths.map(contextFileFromPath).filter((file): file is ProjectContextFile => Boolean(file))
  if (incoming.length === 0) {
    return { ok: false, error: '没有选到文件' }
  }
  const folder = thread.folderPath || commonParentFolder(incoming.map((file) => file.path))
  if (!folder) {
    return { ok: false, error: '没有选到文件' }
  }
  const incomingInside = filterFilesInsideFolder(folder, incoming)
  if (incomingInside.length === 0) {
    return { ok: false, error: '这些文件不在当前项目文件夹里' }
  }
  const merged = filterFilesInsideFolder(folder, [...(thread.attachedFiles ?? []), ...incomingInside]).slice(
    0,
    ATTACHED_FILE_LIMIT,
  )
  return { ok: true, thread: withContext(thread, folder, merged) }
}

export function planDetachProjectFile(
  threads: readonly ThreadRecord[],
  threadId: string,
  path: string,
): PlanProjectContext {
  const thread = threads.find((item) => item.id === threadId)
  if (!canBindProjectFolder(thread) || !thread) {
    return { ok: false, error: '今日不是项目。' }
  }
  const target = normalizeAbsPath(path)
  const files = (thread.attachedFiles ?? []).filter((file) => file.path !== target)
  return { ok: true, thread: withContext(thread, thread.folderPath, files) }
}

export function resolveProjectCwd(input: {
  folderPath?: string
  agentWorkspace?: string
  fallback: string
}): string {
  if (input.folderPath) {
    return normalizeAbsPath(input.folderPath)
  }
  if (input.agentWorkspace) {
    return normalizeAbsPath(input.agentWorkspace)
  }
  return normalizeAbsPath(input.fallback)
}

export function shouldRestartDsh(bootCwd: string, nextCwd: string): boolean {
  if (!bootCwd.trim()) {
    return false
  }
  return normalizeAbsPath(bootCwd) !== normalizeAbsPath(nextCwd)
}

export function shouldWriteWorkspaceDocument(cwd: string, userData: string): boolean {
  const root = normalizeAbsPath(cwd)
  const data = normalizeAbsPath(userData)
  return Boolean(root && data && root !== data)
}

export interface AttachedFileContent {
  path: string
  name: string
  text?: string
  omitted?: string
}

export function composeAttachedFilesPrompt(
  folderPath: string | undefined,
  files: readonly AttachedFileContent[],
): string {
  if (files.length === 0) {
    return ''
  }
  const lines = ['用户引用了这些文件，回答时以它们为准：']
  for (const file of files) {
    const rel = folderPath ? relativeToFolder(folderPath, file.path) : null
    const shown = rel && rel !== '.' ? rel : file.path
    const body = (file.text ?? '').slice(0, ATTACHED_TEXT_LIMIT)
    if (body) {
      const mark = file.omitted ? `（${file.omitted}）` : ''
      lines.push(`- ${shown}${mark}\n\`\`\`\n${body}\n\`\`\``)
      continue
    }
    if (file.omitted) {
      lines.push(`- ${shown}（${file.omitted}）`)
    }
  }
  return lines.join('\n')
}

export function noteDocumentFileName(createdAt: string, id: string): string {
  const stamp = createdAt.replace(/[:.]/g, '-').replace(/Z$/, '')
  const short = id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'note'
  return `${stamp}-${short}.md`
}

export function noteDocumentBody(text: string, createdAt: string): string {
  return `---\ncreatedAt: ${createdAt}\n---\n\n${text.trim()}\n`
}

function withContext(
  thread: ThreadRecord,
  folderPath: string | undefined,
  files: readonly ProjectContextFile[],
): ThreadRecord {
  const next = { ...thread }
  if (folderPath) {
    next.folderPath = normalizeAbsPath(folderPath)
  } else {
    delete next.folderPath
  }
  if (files.length > 0) {
    next.attachedFiles = [...files]
  } else {
    delete next.attachedFiles
  }
  return next
}

function uniqueFiles(files: readonly ProjectContextFile[]): ProjectContextFile[] {
  const seen = new Set<string>()
  const next: ProjectContextFile[] = []
  for (const file of files) {
    const path = normalizeAbsPath(file.path)
    if (!path || seen.has(path)) {
      continue
    }
    seen.add(path)
    next.push({ path, name: file.name || basename(path) })
  }
  return next
}

export function replaceThread(threads: readonly ThreadRecord[], thread: ThreadRecord): ThreadRecord[] {
  return threads.map((item) => (item.id === thread.id ? thread : item))
}
