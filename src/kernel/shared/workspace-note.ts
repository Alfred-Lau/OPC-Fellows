import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** 把一段文字写进项目工作区 `notes/`，给主理人会话落盘用。 */
export function writeWorkspaceDocument(folder: string, text: string, createdAt: string, id: string): string | null {
  const trimmed = text.trim()
  const root = folder.trim()
  if (!trimmed || !root) {
    return null
  }
  const stamp = createdAt.replace(/[:.]/g, '-').replace(/Z$/, '')
  const short = id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'note'
  const dir = join(root, 'notes')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${stamp}-${short}.md`)
  writeFileSync(path, `---\ncreatedAt: ${createdAt}\n---\n\n${trimmed}\n`)
  return path
}
