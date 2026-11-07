#!/usr/bin/env node
/**
 * Guard the public trunk: operator product sites, personal paths, and
 * identifying fixtures stay out of docs and samples. Install identity
 * aliases in brand.ts are allowed and are not matched here.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const self = relative(root, fileURLToPath(import.meta.url))

const skipDirs = new Set([
  '.git',
  'node_modules',
  'dist',
  'out',
  'resources',
  'build',
])

const skipFiles = new Set(['pnpm-lock.yaml', self])

const needles = [
  ['solokit', '.run'].join(''),
  ['pen.', 'bitou.', 'tech'].join(''),
  ['@', 'solokit', '/'].join(''),
  String.fromCodePoint(0x6986, 0x5173),
  ['/Users/', 'yu'].join(''),
  [String.fromCodePoint(0x5988, 0x5988, 0x548c), 'Jimmy'].join(''),
  String.fromCodePoint(0x786c, 0x6838, 0x8001),
  String.fromCodePoint(0x7533, 0x57ce),
]

function walk(dir, hits) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    const rel = relative(root, full)
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) {
        walk(full, hits)
      }
      continue
    }
    if (!entry.isFile() || skipFiles.has(rel) || skipFiles.has(entry.name)) {
      continue
    }
    if (/\.(png|icns|ico|jpg|jpeg|webp|gif|woff2?|ttf|eot)$/i.test(entry.name)) {
      continue
    }
    let text
    try {
      text = readFileSync(full, 'utf8')
    } catch {
      continue
    }
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      if (needles.some((needle) => line.includes(needle))) {
        hits.push(`${rel}:${String(i + 1)}:${line.trim()}`)
      }
    }
  }
}

const hits = []
walk(root, hits)

if (hits.length === 0) {
  process.exit(0)
}

console.error('Open-source sanitization failed. Public trunk still contains operator identity:')
for (const line of hits) {
  console.error(`  ${line}`)
}
process.exit(1)
