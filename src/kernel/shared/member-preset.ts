import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const MEMBER_PRESET_DIR = 'kernel/presets'
export const MEMBER_CONTEXT_DIR = 'kernel/contexts'

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

export function memberContextPath(userData: string, sessionId: string): string {
  return join(userData, MEMBER_CONTEXT_DIR, memberPresetFileName(sessionId))
}

export function writeMemberContext(userData: string, sessionId: string, text: string): void {
  const body = text.trim()
  if (!userData.trim() || !sessionId.trim()) {
    return
  }
  const path = memberContextPath(userData, sessionId)
  const next = body ? (body.endsWith('\n') ? body : `${body}\n`) : ''
  try {
    if (readFileSync(path, 'utf8') === next) {
      chmodSync(path, 0o600)
      return
    }
  } catch {
    if (!next) {
      return
    }
  }
  mkdirSync(join(userData, MEMBER_CONTEXT_DIR), { recursive: true, mode: 0o700 })
  writeFileSync(path, next, { mode: 0o600 })
  chmodSync(path, 0o600)
}

export function readMemberContext(userData: string, sessionId: string): string {
  if (!userData.trim() || !sessionId.trim()) {
    return ''
  }
  try {
    return readFileSync(memberContextPath(userData, sessionId), 'utf8').trim()
  } catch {
    return ''
  }
}
