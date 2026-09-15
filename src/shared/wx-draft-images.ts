// 公众号正文本地配图：识别、按文档/文件夹解析、回写 src。
// 不上传、不发明 URL；微信 mmbiz 地址只能来自 uploadimg 的返回值。

import { readdirSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type LocalImageResolveContext = {
  markdownPath?: string
  assetRoots?: string[]
  assetFiles?: string[]
}

export type ResolvedImageRef =
  | { kind: 'remote'; path: string }
  | { kind: 'local'; path: string }

export type ResolvedBodyImage = {
  token: string
  src: string
  originalSrc: string
}

export type PathProbe = (path: string) => boolean
export type DirList = (dir: string) => string[]

const COVER_HINT = '请在与正文 .md 同级的 images/ 下放 封面.jpg、封面.png 或 cover.jpg。封面要手工做，不会自动生成。'
const COVER_EXACT_NAMES = [
  '封面.jpg',
  '封面.jpeg',
  '封面.png',
  '封面图.jpg',
  '封面图.jpeg',
  '封面图.png',
  'cover.jpg',
  'cover.jpeg',
  'cover.png',
] as const
const COVER_NAME_RE = /^(.+)\.(jpe?g|png)$/i

const COMMON_IMAGE_DIRS = ['images', 'img', 'assets'] as const

export function defaultIsFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

export function defaultListNames(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function coverStem(name: string): string | undefined {
  const matched = COVER_NAME_RE.exec(name.trim())
  return matched?.[1]?.toLowerCase()
}

/** 只认文件名是封面 / 封面图 / cover，避免把正文插图当封面。 */
export function isCoverFileName(name: string): boolean {
  const stem = coverStem(name)
  return stem === '封面' || stem === '封面图' || stem === 'cover' || Boolean(stem?.startsWith('封面') || stem?.startsWith('cover'))
}

function coverNameRank(name: string): number {
  const stem = coverStem(name) ?? ''
  if (stem === '封面') {
    return 0
  }
  if (stem === '封面图') {
    return 1
  }
  if (stem === 'cover') {
    return 2
  }
  if (stem.startsWith('封面')) {
    return 3
  }
  if (stem.startsWith('cover')) {
    return 4
  }
  return 9
}

function pickBestCover(found: string[]): string | undefined {
  found.sort((left, right) => {
    const rank = coverNameRank(basename(left)) - coverNameRank(basename(right))
    return rank !== 0 ? rank : left.localeCompare(right, 'zh')
  })
  return found[0]
}

/** 从正文目录的 images/（以及用户选的配图夹）里找手工封面。 */
export function findLocalCover(
  ctx: LocalImageResolveContext,
  isFile: PathProbe = defaultIsFile,
  listNames: DirList = defaultListNames,
): string | undefined {
  const found: string[] = []
  const seen = new Set<string>()
  const add = (path: string): void => {
    if (!path || seen.has(path) || !isFile(path)) {
      return
    }
    seen.add(path)
    found.push(path)
  }
  for (const root of buildImageSearchRoots(ctx)) {
    for (const name of COVER_EXACT_NAMES) {
      add(resolve(root, name))
    }
    for (const name of listNames(root)) {
      if (isCoverFileName(name)) {
        add(resolve(root, name))
      }
    }
  }
  return pickBestCover(found)
}

export function missingCoverMessage(): string {
  return `images 文件夹里没有封面图。${COVER_HINT}`
}

export function isRemoteImageSrc(src: string): boolean {
  return /^https?:\/\//i.test(src.trim())
}

export function isLocalImageSrc(src: string): boolean {
  const value = src.trim()
  if (!value || isRemoteImageSrc(value) || value.startsWith('data:')) {
    return false
  }
  return true
}

export function decodeImageSrc(src: string): string {
  const value = src.trim()
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const path of paths) {
    const value = path.trim()
    if (!value || seen.has(value)) {
      continue
    }
    seen.add(value)
    out.push(value)
  }
  return out
}

function addRoot(out: string[], root?: string): void {
  const value = root?.trim()
  if (value) {
    out.push(value)
  }
}

function addCommonChildren(out: string[], root: string): void {
  for (const name of COMMON_IMAGE_DIRS) {
    out.push(resolve(root, name))
  }
}

/** 正文 .md 目录、常见 images/ 子目录、用户选中的配图文件夹。 */
export function buildImageSearchRoots(ctx: LocalImageResolveContext): string[] {
  const roots: string[] = []
  const markdownPath = ctx.markdownPath?.trim()
  if (markdownPath) {
    const dir = dirname(markdownPath)
    addRoot(roots, dir)
    addCommonChildren(roots, dir)
    const parent = dirname(dir)
    if (parent && parent !== dir) {
      addCommonChildren(roots, parent)
    }
  }
  for (const root of ctx.assetRoots ?? []) {
    addRoot(roots, root)
    addCommonChildren(roots, root)
  }
  for (const file of ctx.assetFiles ?? []) {
    addRoot(roots, dirname(file))
  }
  return uniquePaths(roots)
}

/** `/images/foo.jpg` 这类站点根路径不能交给 path.resolve，否则会丢掉文档目录。 */
export function asSearchRelativePath(src: string): string | null {
  if (/^[a-zA-Z]:[\\/]/.test(src) || src.startsWith('\\\\')) {
    return null
  }
  const normalized = src.replace(/\\/g, '/')
  if (normalized.startsWith('/')) {
    const relative = normalized.replace(/^\/+/, '')
    return relative || null
  }
  return src.replace(/^\.\/+/, '') || src
}

export function localImageCandidates(src: string, roots: string[]): string[] {
  const decoded = decodeImageSrc(src)
  const out: string[] = []
  const add = (path: string): void => {
    if (path && !out.includes(path)) {
      out.push(path)
    }
  }

  if (decoded.startsWith('file://')) {
    add(fileURLToPath(decoded))
    return out
  }

  if (isAbsolute(decoded)) {
    add(decoded)
  }

  const relative = asSearchRelativePath(decoded)
  const fileName = relative ? basename(relative) : basename(decoded)
  for (const root of roots) {
    if (relative) {
      add(resolve(root, relative))
    }
    if (fileName) {
      add(resolve(root, fileName))
    }
  }
  return out
}

export function missingLocalImageMessage(src: string, ctx: LocalImageResolveContext): string {
  const name = basename(decodeImageSrc(src)) || src
  const hasAnchor = Boolean(ctx.markdownPath?.trim()) || Boolean(ctx.assetRoots?.length) || Boolean(ctx.assetFiles?.length)
  if (!hasAnchor) {
    return `找不到本地图片「${src}」（文件名 ${name}）。请先读取本地 .md（会按文档目录解析 images/），或选择/拖入配图文件夹。`
  }
  return `找不到本地图片「${src}」（文件名 ${name}）。已在正文目录与配图文件夹中查找，请确认文件存在后重试。`
}

function matchDroppedFile(
  src: string,
  ctx: LocalImageResolveContext,
  isFile: PathProbe,
): string | null {
  const decoded = decodeImageSrc(src)
  const relative = asSearchRelativePath(decoded) ?? decoded
  const want = basename(relative)
  if (!want) {
    return null
  }
  for (const file of ctx.assetFiles ?? []) {
    if (basename(file) === want && isFile(file)) {
      return file
    }
  }
  return null
}

export function resolveBodyImageSrc(
  src: string,
  ctx: LocalImageResolveContext,
  isFile: PathProbe = defaultIsFile,
): ResolvedImageRef {
  const trimmed = src.trim()
  if (!trimmed) {
    throw new Error('图片地址为空')
  }
  if (isRemoteImageSrc(trimmed)) {
    return { kind: 'remote', path: trimmed }
  }
  if (trimmed.startsWith('data:')) {
    throw new Error('不支持 data URI 图片，请改用本地文件或 http(s) 地址')
  }

  const dropped = matchDroppedFile(trimmed, ctx, isFile)
  if (dropped) {
    return { kind: 'local', path: dropped }
  }

  const roots = buildImageSearchRoots(ctx)
  for (const candidate of localImageCandidates(trimmed, roots)) {
    if (isFile(candidate)) {
      return { kind: 'local', path: candidate }
    }
  }
  throw new Error(missingLocalImageMessage(trimmed, ctx))
}

export function resolveAllBodyImages(
  images: Array<{ token: string; src: string }>,
  ctx: LocalImageResolveContext,
  isFile: PathProbe = defaultIsFile,
): ResolvedBodyImage[] {
  return images.map((image) => {
    const resolved = resolveBodyImageSrc(image.src, ctx, isFile)
    switch (resolved.kind) {
      case 'remote':
      case 'local':
        return { token: image.token, src: resolved.path, originalSrc: image.src }
      default: {
        const _exhaustive: never = resolved
        return _exhaustive
      }
    }
  })
}

export function applyResolvedImageSrcs(
  images: Array<{ token: string; src: string }>,
  replacements: ReadonlyMap<string, string>,
): Array<{ token: string; src: string }> {
  return images.map((image) => ({
    token: image.token,
    src: replacements.get(image.src) ?? image.src,
  }))
}

/** 把 Markdown 里的 `](old)` / `](old "title")` 换成上传结果或已解析的本地绝对路径。 */
export function rewriteMarkdownImageSrcs(markdown: string, replacements: ReadonlyMap<string, string>): string {
  let next = markdown
  for (const [from, to] of replacements) {
    if (!from || from === to) {
      continue
    }
    next = next.split(`](${from})`).join(`](${to})`)
    next = next.split(`](${from} `).join(`](${to} `)
  }
  return next
}
