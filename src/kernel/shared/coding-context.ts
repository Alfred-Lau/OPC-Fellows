/**
 * 开工前塞进主理人人设的仓库简报。只在主进程读盘，渲染进程不要 import。
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const BRIEF_DOCS = ['CONTEXT.md', 'AGENTS.md', 'CLAUDE.md', 'CODING_STANDARDS.md', 'CONTRIBUTING.md'] as const
const SKIP_DIR = new Set(['.git', 'node_modules', 'dist', 'out', 'coverage', '.pnpm-store'])
const DOC_LIMIT = 900
const BRIEF_LIMIT = 2400

export function composeRepoBrief(cwd: string): string {
  const root = cwd.trim()
  if (!root || !existsSync(root)) {
    return ''
  }
  const parts: string[] = []
  const top = listTopNames(root)
  if (top.length > 0) {
    parts.push(`顶层：${top.join('、')}`)
  }
  const scripts = readPackageScripts(root)
  if (scripts) {
    parts.push(scripts)
  }
  for (const name of BRIEF_DOCS) {
    const excerpt = readDocExcerpt(join(root, name), DOC_LIMIT)
    if (excerpt) {
      parts.push(`《${name}》\n${excerpt}`)
    }
  }
  if (parts.length === 0) {
    return ''
  }
  const body = parts.join('\n\n')
  const clipped = body.length > BRIEF_LIMIT ? `${body.slice(0, BRIEF_LIMIT)}\n…（简报截断）` : body
  return `仓库简报。开工先读这些，不要编脚本名或目录：\n${clipped}`
}

function listTopNames(root: string): string[] {
  try {
    return readdirSync(root)
      .filter((name) => !SKIP_DIR.has(name) && !name.startsWith('.'))
      .slice(0, 24)
  } catch {
    return []
  }
}

function readPackageScripts(root: string): string | undefined {
  const path = join(root, 'package.json')
  if (!existsSync(path) || !statSync(path).isFile()) {
    return undefined
  }
  try {
    const pkg = JSON.parse(readFileSync(path, 'utf8')) as {
      packageManager?: unknown
      scripts?: unknown
    }
    const names = pkg.scripts && typeof pkg.scripts === 'object' && pkg.scripts
      ? Object.keys(pkg.scripts).filter((name) => /test|lint|typecheck|check|build/i.test(name))
      : []
    const manager = typeof pkg.packageManager === 'string' ? pkg.packageManager.split('@')[0] : ''
    const bits = [
      manager ? `包管理：${manager}` : '',
      names.length > 0 ? `脚本：${names.join('、')}` : '',
    ].filter(Boolean)
    return bits.length > 0 ? bits.join('。') : undefined
  } catch {
    return undefined
  }
}

function readDocExcerpt(path: string, limit: number): string | undefined {
  if (!existsSync(path) || !statSync(path).isFile()) {
    return undefined
  }
  try {
    const body = readFileSync(path, 'utf8').trim()
    if (!body) {
      return undefined
    }
    return body.length > limit ? `${body.slice(0, limit)}…` : body
  } catch {
    return undefined
  }
}
