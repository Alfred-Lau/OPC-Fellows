import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

const MAX_READ = 200_000
const MAX_GREP_HITS = 40
const MAX_GLOB = 80
const BASH_TIMEOUT_MS = 30_000

export function resolveWorkspacePath(root: string, rel: string): string {
  const base = resolve(root)
  const target = resolve(base, rel.trim() || '.')
  const relPath = relative(base, target)
  if (relPath.startsWith('..') || relPath === '..' || (relPath && relPath.split(sep)[0] === '..')) {
    throw new Error('路径超出工作区。')
  }
  if (target !== base && !target.startsWith(`${base}${sep}`)) {
    throw new Error('路径超出工作区。')
  }
  return target
}

export function readWorkspaceFile(root: string, rel: string): string {
  const path = resolveWorkspacePath(root, rel)
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`没有这个文件：${rel || '.'}`)
  }
  const body = readFileSync(path, 'utf8')
  if (body.length > MAX_READ) {
    return `${body.slice(0, MAX_READ)}\n…（截断）`
  }
  return body
}

export function writeWorkspaceFile(root: string, rel: string, content: string): string {
  const path = resolveWorkspacePath(root, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf8')
  return `已写入 ${rel}`
}

export function globWorkspace(root: string, pattern: string): string[] {
  const needle = pattern.trim().toLowerCase()
  const hits: string[] = []
  walk(root, root, 0, (rel, isFile) => {
    if (!isFile) {
      return
    }
    if (!needle || globMatch(rel.toLowerCase(), needle)) {
      hits.push(rel)
    }
  })
  return hits.slice(0, MAX_GLOB)
}

export function grepWorkspace(root: string, query: string, glob = ''): string[] {
  const needle = query.trim()
  if (!needle) {
    throw new Error('grep 需要关键词。')
  }
  const hits: string[] = []
  const filter = glob.trim().toLowerCase()
  walk(root, root, 0, (rel, isFile) => {
    if (!isFile || hits.length >= MAX_GREP_HITS) {
      return
    }
    if (filter && !globMatch(rel.toLowerCase(), filter)) {
      return
    }
    let body = ''
    try {
      body = readFileSync(join(root, rel), 'utf8')
    } catch {
      return
    }
    const lines = body.split('\n')
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index]?.includes(needle)) {
        continue
      }
      hits.push(`${rel}:${String(index + 1)}:${(lines[index] ?? '').trim()}`)
      if (hits.length >= MAX_GREP_HITS) {
        return
      }
    }
  })
  return hits
}

export function applyWorkspacePatch(root: string, rel: string, oldText: string, newText: string): string {
  const current = readWorkspaceFile(root, rel)
  if (!oldText) {
    return writeWorkspaceFile(root, rel, newText)
  }
  if (!current.includes(oldText)) {
    throw new Error(`补丁没对上 ${rel} 里的原文。`)
  }
  return writeWorkspaceFile(root, rel, current.replace(oldText, newText))
}

export function runWorkspaceBash(root: string, command: string): string {
  const trimmed = command.trim()
  if (!trimmed) {
    throw new Error('bash 需要命令。')
  }
  if (/\brm\s+(-rf|--no-preserve-root)/.test(trimmed) || /\bsudo\b/.test(trimmed)) {
    throw new Error('这条命令太危险，工作区终端不跑。')
  }
  const result = spawnSync(process.env.SHELL?.trim() || '/bin/bash', ['-lc', trimmed], {
    cwd: resolve(root),
    encoding: 'utf8',
    timeout: BASH_TIMEOUT_MS,
    maxBuffer: 500_000,
    env: { ...process.env, CI: '1' },
  })
  const stdout = (result.stdout ?? '').trim()
  const stderr = (result.stderr ?? '').trim()
  const code = result.status ?? (result.error ? 1 : 0)
  const parts = [
    stdout,
    stderr ? `stderr:\n${stderr}` : '',
    `exit ${String(code)}`,
  ].filter(Boolean)
  return parts.join('\n\n')
}

function walk(
  root: string,
  dir: string,
  depth: number,
  visit: (rel: string, isFile: boolean) => void,
): void {
  if (depth > 6) {
    return
  }
  let names: string[] = []
  try {
    names = readdirSync(dir)
  } catch {
    return
  }
  for (const name of names) {
    if (name.startsWith('.') || name === 'node_modules' || name === 'dist' || name === 'out') {
      continue
    }
    const path = join(dir, name)
    const rel = relative(root, path)
    try {
      const stat = statSync(path)
      if (stat.isDirectory()) {
        visit(rel, false)
        walk(root, path, depth + 1, visit)
      } else if (stat.isFile()) {
        visit(rel, true)
      }
    } catch {
      // skip
    }
  }
}

function globMatch(rel: string, pattern: string): boolean {
  if (!pattern.includes('*') && !pattern.includes('?')) {
    return rel.includes(pattern) || rel.endsWith(pattern.replace(/^\*\*\//, ''))
  }
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DS::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DS::/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`).test(rel) || new RegExp(escaped).test(rel)
}
