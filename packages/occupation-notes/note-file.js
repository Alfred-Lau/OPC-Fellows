import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** 随手记 JSON。Electron 与 dsh occupation 插件共用，不 import electron。 */
export const NOTES_FILENAME = 'notes.json'

/** 工作台把 userData 传给 opc 子进程，插件按这个路径落盘。 */
export const OPC_USER_DATA_ENV = 'OPC_USER_DATA'

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function notesPathFromEnv(env = process.env) {
  const root = env[OPC_USER_DATA_ENV]?.trim()
  if (!root) {
    throw new Error('未设置 OPC_USER_DATA，随手记无法落盘。')
  }
  return join(root, NOTES_FILENAME)
}

/**
 * @param {string} path
 * @returns {{ id: string, text: string, createdAt: string }[]}
 */
export function loadNotes(path) {
  if (!existsSync(path)) {
    return []
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return Array.isArray(parsed) ? parsed.filter(isNoteItem) : []
  } catch {
    return []
  }
}

/**
 * @param {string} path
 * @param {string} text
 * @returns {{ id: string, text: string, createdAt: string } | null}
 */
export function addNote(path, text) {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }
  const item = {
    id: crypto.randomUUID(),
    text: trimmed,
    createdAt: new Date().toISOString(),
  }
  persist(path, [item, ...loadNotes(path)])
  return item
}

/**
 * @param {string} path
 * @param {string} id
 * @returns {boolean}
 */
export function removeNote(path, id) {
  const current = loadNotes(path)
  const next = current.filter((item) => item.id !== id)
  if (next.length === current.length) {
    return false
  }
  persist(path, next)
  return true
}

/**
 * 项目工作目录里的文档副本。JSON 仍是随手记 Artifact；md 是 Workspace File。
 * @param {string} folder
 * @param {string} text
 * @param {string} createdAt
 * @param {string} id
 * @returns {string | null}
 */
export function writeNoteDocument(folder, text, createdAt, id) {
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

/**
 * @param {string} path
 * @param {{ id: string, text: string, createdAt: string }[]} items
 */
function persist(path, items) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(items, null, 2)}\n`)
}

/**
 * @param {unknown} value
 * @returns {value is { id: string, text: string, createdAt: string }}
 */
function isNoteItem(value) {
  if (!value || typeof value !== 'object') {
    return false
  }
  const item = /** @type {{ id?: unknown, text?: unknown, createdAt?: unknown }} */ (value)
  return typeof item.id === 'string' && typeof item.text === 'string' && typeof item.createdAt === 'string'
}
