/**
 * 引用文件进这一轮 prompt：路径指针 + 图片走 SDK image 块。
 * 通用文件不把正文拼进用户话；SDK 0.1.5 没有 encoded file，由 dsh-fs 按 cwd 读。
 */

import { extname } from 'node:path'
import type { ProjectContextFile } from './agent.ts'
import { isPathInside, normalizeAbsPath, relativeToFolder } from './project-context.ts'

export type SdkImageMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

export type DshPromptContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: SdkImageMime }

export interface AttachmentCite {
  path: string
  name: string
  shown: string
  imageMime?: SdkImageMime
  omitted?: string
}

const IMAGE_MIME_BY_EXT: Record<string, SdkImageMime> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

export function attachmentImageMime(path: string): SdkImageMime | undefined {
  return IMAGE_MIME_BY_EXT[extname(path.trim()).toLowerCase()]
}

export function citeAttachments(
  folderPath: string | undefined,
  files: readonly ProjectContextFile[],
): AttachmentCite[] {
  const folder = folderPath?.trim() ? normalizeAbsPath(folderPath) : undefined
  const cites: AttachmentCite[] = []
  for (const file of files) {
    const path = normalizeAbsPath(file.path)
    if (!path) {
      continue
    }
    const name = file.name.trim() || path
    const rel = folder ? relativeToFolder(folder, path) : null
    const shown = rel && rel !== '.' ? rel : path
    if (folder && !isPathInside(folder, path)) {
      cites.push({ path, name, shown, omitted: '不在项目文件夹里' })
      continue
    }
    const imageMime = attachmentImageMime(path)
    cites.push({
      path,
      name,
      shown,
      ...(imageMime ? { imageMime } : {}),
    })
  }
  return cites
}

export function composeAttachmentCiteText(cites: readonly AttachmentCite[]): string {
  if (cites.length === 0) {
    return ''
  }
  const lines = ['用户引用了这些文件。路径相对当前工作目录，用 dsh-fs 读取正文，不要凭记忆编造。']
  for (const cite of cites) {
    lines.push(cite.omitted ? `- ${cite.shown}（${cite.omitted}）` : `- ${cite.shown}`)
  }
  return lines.join('\n')
}

export function composeDshPromptContentBlocks(input: {
  text: string
  cites?: readonly AttachmentCite[]
  images?: readonly { data: string; mimeType: SdkImageMime }[]
}): DshPromptContentBlock[] {
  const blocks: DshPromptContentBlock[] = []
  const citeText = composeAttachmentCiteText(input.cites ?? [])
  if (citeText) {
    blocks.push({ type: 'text', text: citeText })
  }
  for (const image of input.images ?? []) {
    blocks.push({ type: 'image', data: image.data, mimeType: image.mimeType })
  }
  const text = input.text.trim()
  if (text) {
    blocks.push({ type: 'text', text })
  }
  return blocks
}
