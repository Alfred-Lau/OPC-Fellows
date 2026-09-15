// 写入微信正文前的审查：去掉封面图、YAML 元数据和 AI 指引，不改知识正文。
// 官方「原创」标无法经 draft/add 设置；文末声明只是正文里的原创说明。

import { isCoverFileName } from './wx-draft-images.ts'

export type WxDraftReviewKind = 'cover' | 'guidance' | 'frontmatter'

export interface WxDraftReviewRemoval {
  kind: WxDraftReviewKind
  excerpt: string
}

export interface WxDraftReview {
  markdown: string
  removals: WxDraftReviewRemoval[]
}

export function originalityNotice(brand: string): string {
  const name = brand.trim() || '本账号'
  return `本文为「${name}」原创，转载请注明出处。`
}

export function appendOriginalityNotice(markdown: string, brand = ''): string {
  const body = markdown.trim()
  if (!body) {
    return body
  }
  const notice = originalityNotice(brand)
  if (body.includes(notice) || /本文为「[^」]+」原创[\s\S]{0,12}转载请注明/.test(body)) {
    return body
  }
  return `${body}\n\n*${notice}*`
}

const IMAGE_RE = /!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g
/** 成稿前的策划 / 指引标题；后面允许带「（5个，覆盖不同传播方向）」这类说明。 */
const GUIDANCE_HEADING =
  /^(#{1,6})\s*(写作指引|写作提示|AI\s*指引|AI指引|AI提示|AI 提示|配图提示|封面提示|封面图方案|封面方案|头图方案|备选标题|标题方案|内容验真|内容核验|事实核验|传播方向|排版风格|适用账号|发布建议|生成说明|提示词|系统提示|Prompt)(?:\s*[（(][^）)]*[）)])?\s*$/i
const COVER_HEADING = /^(#{1,6})\s*(封面图?|Cover)\s*$/i
const EDITORIAL_META_LINE =
  /^(?:排版风格|适用账号|适用栏目|账号定位|封面风格|封面文案|封面比例)[:：]|全文约\s*\d[\d,，]*\s*字|手机端阅读约|阅读约\s*\d+\s*分钟|^方案\s*[A-Z甲乙丙][（(:：]|^公众号头图比例/

function decodeSrc(src: string): string {
  try {
    return decodeURIComponent(src.trim())
  } catch {
    return src.trim()
  }
}

function fileNameOf(src: string): string {
  const path = decodeSrc(src).split(/[?#]/)[0] ?? ''
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] ?? ''
}

export function isCoverMarkdownImage(alt: string, src: string): boolean {
  if (isCoverFileName(fileNameOf(src))) {
    return true
  }
  return /^(封面|封面图|cover)$/i.test(alt.trim())
}

function clipExcerpt(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length > 48 ? `${collapsed.slice(0, 48)}…` : collapsed
}

function addRemoval(removals: WxDraftReviewRemoval[], kind: WxDraftReviewKind, excerpt: string): void {
  const text = clipExcerpt(excerpt)
  if (!text) {
    return
  }
  if (removals.some((item) => item.kind === kind && item.excerpt === text)) {
    return
  }
  removals.push({ kind, excerpt: text })
}

function stripFrontmatter(src: string, removals: WxDraftReviewRemoval[]): string {
  const text = src.replace(/^\uFEFF/, '')
  if (!text.startsWith('---')) {
    return text
  }
  const lines = text.split(/\r?\n/)
  if (lines[0].trim() !== '---') {
    return text
  }
  const limit = Math.min(lines.length, 41)
  for (let i = 1; i < limit; i++) {
    if (lines[i].trim() === '---') {
      addRemoval(removals, 'frontmatter', lines.slice(1, i).join('\n') || 'YAML')
      return lines.slice(i + 1).join('\n')
    }
  }
  return text
}

function stripHtmlComments(src: string, removals: WxDraftReviewRemoval[]): string {
  return src.replace(/<!--[\s\S]*?-->/g, (block) => {
    addRemoval(removals, 'guidance', block)
    return ''
  })
}

function isFence(line: string): boolean {
  return line.trimStart().startsWith('```')
}

function fenceLang(line: string): string {
  return line.trim().slice(3).trim().split(/\s+/)[0]?.toLowerCase() ?? ''
}

function isGuidanceFence(line: string): boolean {
  const lang = fenceLang(line)
  return lang === 'prompt' || lang === 'ai' || lang === 'system'
}

function headingLevel(line: string): number {
  const matched = /^(#{1,6})\s+/.exec(line)
  return matched ? matched[1].length : 0
}

function isGuidanceHeading(line: string): boolean {
  return guidanceHeadingLevel(line) > 0
}

/** 带 # 的策划标题，或加粗/裸标题（Notion 导出常丢掉 #）。不含单独的「封面」。 */
function guidanceHeadingLevel(line: string): number {
  const trimmed = line.trim()
  if (GUIDANCE_HEADING.test(trimmed)) {
    return headingLevel(trimmed)
  }
  const plain = unwrapMetaLine(trimmed)
  if (
    /^(写作指引|写作提示|AI\s*指引|AI指引|AI提示|AI 提示|配图提示|封面提示|封面图方案|封面方案|头图方案|备选标题|标题方案|内容验真|内容核验|事实核验|传播方向|排版风格|适用账号|发布建议|生成说明|提示词|系统提示|Prompt)(?:\s*[（(][^）)]*[）)])?$/i.test(
      plain,
    )
  ) {
    return 2
  }
  return 0
}

function isCoverHeading(line: string): boolean {
  return COVER_HEADING.test(line.trim())
}

function isHr(line: string): boolean {
  return /^---+$/.test(line.trim())
}

function unwrapMetaLine(line: string): string {
  return line
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*\d+\.\s+/, '')
    .replace(/^\*+|\*+$/g, '')
    .trim()
}

function isEditorialMetaLine(line: string): boolean {
  const text = unwrapMetaLine(line)
  return text.length > 0 && EDITORIAL_META_LINE.test(text)
}

function isGuidanceParagraph(text: string): boolean {
  const line = text.trim()
  if (!line) {
    return false
  }
  const rows = line.split('\n').map((item) => item.trim()).filter((item) => item.length > 0)
  if (rows.length > 0 && rows.every((item) => isEditorialMetaLine(item))) {
    return true
  }
  if (isEditorialMetaLine(rows[0] ?? line)) {
    return true
  }
  if (/^(?:请根据|请基于|请按照)(?:以上|下述|下面|如下|上文|这些|本笔记|这篇).{0,80}(?:写|扩写|整理|生成|改写)/.test(line)) {
    return true
  }
  if (/^请(?:将|把).{0,40}(?:整理为|写成|改写成|扩写成).{0,20}(?:公众号|文章|草稿)/.test(line)) {
    return true
  }
  if (/^(?:你是|作为).{0,30}(?:公众号)?(?:编辑|助手|作者)/.test(line)) {
    return true
  }
  if (/^不要(?:把|将)?.{0,24}(?:指引|prompt|提示词|AI).{0,20}(?:写进|出现在)/i.test(line)) {
    return true
  }
  if (/^(?:输出要求|写作要求)[:：]/.test(line)) {
    return true
  }
  return false
}

function isGuidanceQuote(line: string): boolean {
  if (!line.startsWith('>')) {
    return false
  }
  const text = line.replace(/^>+\s?/, '')
  return (
    /^(写作指引|写作提示|配图提示|封面提示|AI\s*指引|Prompt|提示词|排版风格|适用账号)/i.test(text) ||
    isEditorialMetaLine(text) ||
    isGuidanceParagraph(text)
  )
}

function stripCoverImagesInLine(line: string, removals: WxDraftReviewRemoval[]): string {
  const imageRe = new RegExp(IMAGE_RE.source, 'g')
  return line.replace(imageRe, (full, alt: string, src: string) => {
    if (isCoverMarkdownImage(alt, src)) {
      addRemoval(removals, 'cover', full)
      return ''
    }
    return full
  })
}

function collectParagraph(lines: string[], start: number): { text: string; next: number } {
  const parts: string[] = []
  let i = start
  while (i < lines.length && lines[i].trim() !== '') {
    if (isFence(lines[i]) || headingLevel(lines[i]) > 0 || lines[i].startsWith('>')) {
      break
    }
    parts.push(lines[i])
    i += 1
  }
  return { text: parts.join('\n'), next: i }
}

function collapseBlankLines(text: string): string {
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function reviewWxDraftMarkdown(markdown: string): WxDraftReview {
  const removals: WxDraftReviewRemoval[] = []
  let src = stripFrontmatter(markdown, removals)
  src = stripHtmlComments(src, removals)
  const lines = src.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (isFence(line)) {
      if (isGuidanceFence(line)) {
        const block: string[] = [line]
        i += 1
        while (i < lines.length && !isFence(lines[i])) {
          block.push(lines[i])
          i += 1
        }
        if (i < lines.length) {
          block.push(lines[i])
          i += 1
        }
        addRemoval(removals, 'guidance', block.join('\n'))
        continue
      }
      out.push(line)
      i += 1
      while (i < lines.length && !isFence(lines[i])) {
        out.push(lines[i])
        i += 1
      }
      if (i < lines.length) {
        out.push(lines[i])
        i += 1
      }
      continue
    }

    if (isGuidanceHeading(line) || isCoverHeading(line)) {
      const level = isCoverHeading(line) ? headingLevel(line) || 2 : guidanceHeadingLevel(line)
      const kind: WxDraftReviewKind = isCoverHeading(line) ? 'cover' : 'guidance'
      const block: string[] = [line]
      i += 1
      if (kind === 'guidance') {
        while (i < lines.length) {
          if (isHr(lines[i])) {
            block.push(lines[i])
            i += 1
            break
          }
          const nextLevel = headingLevel(lines[i])
          if (nextLevel > 0 && nextLevel <= level) {
            break
          }
          if (isFence(lines[i]) && !isGuidanceFence(lines[i])) {
            break
          }
          block.push(lines[i])
          i += 1
        }
      }
      addRemoval(removals, kind, block.join('\n'))
      continue
    }

    if (isGuidanceQuote(line)) {
      const block: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) {
        block.push(lines[i])
        i += 1
      }
      addRemoval(removals, 'guidance', block.join('\n'))
      continue
    }

    if (line.trim() !== '' && headingLevel(line) === 0 && !line.startsWith('>')) {
      const para = collectParagraph(lines, i)
      if (isGuidanceParagraph(para.text)) {
        addRemoval(removals, 'guidance', para.text)
        i = para.next
        continue
      }
    }

    const cleaned = stripCoverImagesInLine(line, removals)
    if (cleaned.trim() === '' && line.trim() !== '') {
      i += 1
      continue
    }
    out.push(cleaned)
    i += 1
  }

  return {
    markdown: collapseBlankLines(out.join('\n')),
    removals,
  }
}

export function formatReviewMessage(review: WxDraftReview): string {
  if (review.removals.length === 0) {
    return '正文无需剔除'
  }
  const counts = { cover: 0, guidance: 0, frontmatter: 0 }
  for (const item of review.removals) {
    counts[item.kind] += 1
  }
  const parts: string[] = []
  if (counts.cover) {
    parts.push(`封面图 ${String(counts.cover)} 处`)
  }
  if (counts.guidance) {
    parts.push(`AI 指引 ${String(counts.guidance)} 处`)
  }
  if (counts.frontmatter) {
    parts.push(`文首元数据 ${String(counts.frontmatter)} 处`)
  }
  return `去掉${parts.join('、')}`
}
