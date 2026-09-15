/**
 * 海框展示层。渲染进程会 import 这里，不能碰 Node 内建 path：
 * Vite 会把这些模块抽空，启动时一画新项目页就整页绑不上点击。
 */

import type { ProjectContextFile, ThreadRecord } from './agent.ts'

export type ComposerContextAction = 'pick-folder' | 'pick-files' | 'cite-skill' | 'clear-folder' | 'detach-file'

export interface ComposerContextChip {
  kind: 'folder' | 'host'
  label: string
  title: string
}

export interface ComposerContextMenuItem {
  id: string
  action: ComposerContextAction
  title: string
  hint: string
  path?: string
}

export function displayPathLabel(path: string | undefined): string {
  const trimmed = (path ?? '').trim().replace(/[\\/]+$/, '')
  if (!trimmed) {
    return ''
  }
  const parts = trimmed.split(/[\\/]/)
  return parts[parts.length - 1] || trimmed
}

export function folderLabel(path: string | undefined): string {
  return displayPathLabel(path)
}

export function composerContextChip(input: {
  folderPath?: string
  hostName: string
}): ComposerContextChip {
  const folder = folderLabel(input.folderPath)
  if (folder) {
    return { kind: 'folder', label: folder, title: (input.folderPath ?? '').trim() }
  }
  const host = input.hostName.trim() || '本机'
  return { kind: 'host', label: host, title: '还没选项目文件夹，读写会落在成员默认工作区' }
}

export function composerContextMenuItems(input: {
  allowWorkspace: boolean
  folderPath?: string
  files?: readonly ProjectContextFile[]
}): ComposerContextMenuItem[] {
  const folder = folderLabel(input.folderPath)
  const items: ComposerContextMenuItem[] = [
    {
      id: 'pick-folder',
      action: 'pick-folder',
      title: folder ? '更换文件夹' : '选择文件夹',
      hint: input.allowWorkspace
        ? folder
          ? `当前：${folder}。之后读写代码和文档都在这里。`
          : '绑到本机目录。dsh 的 cwd / dsh-fs 都相对它。'
        : '今日不是项目。先开一件项目再绑文件夹。',
    },
    {
      id: 'pick-files',
      action: 'pick-files',
      title: '选择文件',
      hint: input.allowWorkspace
        ? '引用进这一轮对话。有文件夹时只收目录里的文件。'
        : '今日不是项目。先开一件项目再引用文件。',
    },
    {
      id: 'cite-skill',
      action: 'cite-skill',
      title: '引用技能',
      hint: '插入 /，从职业 Skill 和赋能建议里挑一条',
    },
  ]
  if (input.allowWorkspace && folder) {
    items.push({
      id: 'clear-folder',
      action: 'clear-folder',
      title: '清除文件夹',
      hint: '回到成员默认工作区，已引用且不在该目录里的文件会拿掉',
    })
  }
  for (const file of input.files ?? []) {
    items.push({
      id: `detach:${file.path}`,
      action: 'detach-file',
      title: `拿掉 ${file.name}`,
      hint: file.path,
      path: file.path,
    })
  }
  return items
}

export function canBindProjectFolder(thread: Pick<ThreadRecord, 'kind'> | undefined): boolean {
  return thread?.kind === 'user' || thread?.kind === 'agent'
}

export function composeWorkspaceSystemHint(cwd: string): string {
  const folder = cwd.trim()
  if (!folder) {
    return ''
  }
  return `当前项目工作目录是 ${folder}。读写代码、文档、终端命令都必须落在这个目录里，不要写到目录外面。这就是 dsh initialize 的 cwd，dsh-fs 相对它工作。`
}

export function contextFileFromPath(path: string): ProjectContextFile | undefined {
  const trimmed = path.trim().replace(/[\\/]+$/, '')
  if (!trimmed) {
    return undefined
  }
  return { path: trimmed, name: displayPathLabel(trimmed) }
}
