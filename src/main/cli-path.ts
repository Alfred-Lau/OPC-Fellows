import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

const READY = 'OWNWORKBUDDY_PATH_READY'

export function extraBinDirs(home = homedir()): string[] {
  const dirs = [
    join(home, 'Library/pnpm'),
    join(home, '.local/share/pnpm'),
    join(home, '.local/bin'),
    join(home, '.bun/bin'),
    join(home, '.volta/bin'),
    join(home, '.cargo/bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ]
  const nvm = join(home, '.nvm/versions/node')
  if (existsSync(nvm)) {
    try {
      for (const name of readdirSync(nvm).sort().reverse()) {
        dirs.push(join(nvm, name, 'bin'))
      }
    } catch {
      /* ignore */
    }
  }
  return dirs.filter((dir) => existsSync(dir))
}

export function mergeDesktopPath(existing = '', home = homedir()): string {
  const seen = new Set<string>()
  const merged: string[] = []
  for (const dir of [
    ...extraBinDirs(home),
    ...existing.split(delimiter),
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ]) {
    if (!dir || seen.has(dir)) {
      continue
    }
    seen.add(dir)
    merged.push(dir)
  }
  return merged.join(delimiter)
}

export function ensureDesktopPath(): string {
  if (process.env[READY] === '1' && process.env.PATH) {
    return process.env.PATH
  }
  process.env.PATH = mergeDesktopPath(process.env.PATH)
  process.env[READY] = '1'
  return process.env.PATH
}

export function resolveBinary(name: string, fallbacks: string[] = []): string | null {
  const override = process.env[`OWNWORKBUDDY_${name.toUpperCase()}`]
  if (override && existsSync(override)) {
    return override
  }

  const path = ensureDesktopPath()
  try {
    const found = execFileSync('which', [name], {
      encoding: 'utf8',
      env: { ...process.env, PATH: path },
    }).trim()
    if (found && existsSync(found)) {
      return found
    }
  } catch {
    // GUI launches often have a thin PATH; fall through to known locations.
  }

  for (const candidate of [...fallbacks, ...extraBinDirs().map((dir) => join(dir, name))]) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return null
}
