import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const MEMBER_PRESET_DIR = 'kernel/presets'

export function memberPresetFileName(sessionId: string): string {
  const id = sessionId.trim().replace(/[^a-zA-Z0-9:_-]/g, '_')
  return `${id || 'session'}.md`
}

export function memberPresetPath(userData: string, sessionId: string): string {
  return join(userData, MEMBER_PRESET_DIR, memberPresetFileName(sessionId))
}

export function writeMemberPreset(userData: string, sessionId: string, text: string): void {
  const body = text.trim()
  if (!userData.trim() || !sessionId.trim() || !body) {
    return
  }
  const path = memberPresetPath(userData, sessionId)
  const next = body.endsWith('\n') ? body : `${body}\n`
  try {
    if (readFileSync(path, 'utf8') === next) {
      return
    }
  } catch {
    // 还没有这份 preset。
  }
  mkdirSync(join(userData, MEMBER_PRESET_DIR), { recursive: true })
  writeFileSync(path, next)
}

export function readMemberPreset(userData: string, sessionId: string): string {
  if (!userData.trim() || !sessionId.trim()) {
    return ''
  }
  try {
    return readFileSync(memberPresetPath(userData, sessionId), 'utf8').trim()
  } catch {
    return ''
  }
}
