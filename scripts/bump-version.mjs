import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const VERSIONED_PACKAGES = ['package.json', 'packages/opc-kernel/package.json']
const RELEASE_DOCS = ['README.md', 'README.zh-CN.md']

/** @param {string} version */
export function bumpPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) {
    throw new Error(`不支持的版本号（需要 x.y.z）: ${version}`)
  }
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`
}

/**
 * 只改当前发版链接，不动历史版本说明（例如「从 v0.7.3 升级」）。
 * @param {string} text
 * @param {string} previous
 * @param {string} next
 */
export function replaceCurrentReleaseRefs(text, previous, next) {
  return text
    .replaceAll(`/releases/tag/v${previous}`, `/releases/tag/v${next}`)
    .replaceAll(`/releases/download/v${previous}/`, `/releases/download/v${next}/`)
    .replaceAll(`OPC-Fellows-${previous}-`, `OPC-Fellows-${next}-`)
    .replaceAll(`[v${previous}]`, `[v${next}]`)
}

/** @param {string} filePath */
function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

/**
 * @param {string} filePath
 * @param {string} next
 */
function writePackageVersion(filePath, next) {
  const pkg = readJson(filePath)
  pkg.version = next
  writeFileSync(filePath, `${JSON.stringify(pkg, null, 2)}\n`)
}

/**
 * 把工作区 package 的 patch（小版本第三位）+1，并同步 README 下载链接。
 * @param {string} [root]
 */
export function bumpWorkspaceVersion(root = workspaceRoot) {
  const rootPkgPath = join(root, VERSIONED_PACKAGES[0])
  const previous = readJson(rootPkgPath).version
  if (typeof previous !== 'string') {
    throw new Error(`${VERSIONED_PACKAGES[0]} 缺少 version`)
  }
  const next = bumpPatch(previous)

  for (const relative of VERSIONED_PACKAGES) {
    const filePath = join(root, relative)
    const current = readJson(filePath).version
    if (current !== previous) {
      throw new Error(`${relative} 版本 ${current} 与根包 ${previous} 不一致`)
    }
    writePackageVersion(filePath, next)
  }

  for (const relative of RELEASE_DOCS) {
    const filePath = join(root, relative)
    const before = readFileSync(filePath, 'utf8')
    writeFileSync(filePath, replaceCurrentReleaseRefs(before, previous, next))
  }

  return { previous, next }
}

function writeGithubOutput(previous, next) {
  const output = process.env.GITHUB_OUTPUT
  if (!output) {
    return
  }
  appendFileSync(output, `previous=${previous}\nversion=${next}\n`)
}

const isMain =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isMain) {
  const { previous, next } = bumpWorkspaceVersion()
  console.log(`${previous} -> ${next}`)
  writeGithubOutput(previous, next)
}
