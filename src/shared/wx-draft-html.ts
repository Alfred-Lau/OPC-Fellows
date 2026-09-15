// Markdown → 微信公众号正文 HTML 子集（纯函数，零依赖）。
// 不做下载、不碰文件系统；正文图 src 换成 __WXIMG_<token>__ 占位，由主进程上传后回填。
// 正文若已含 `__WXIMG_` 字面量，与占位符冲突的概率可忽略，不做额外转义。

export interface MdToHtmlResult {
  html: string
  images: Array<{ token: string; src: string }>
  mathCount: number
}

const P_STYLE =
  'font-size:15px;line-height:1.75;letter-spacing:0.5px;color:#3f3f3f;margin:8px 0;'
const H_STYLES: Record<number, string> = {
  1: 'font-size:20px;font-weight:bold;margin:18px 0 10px;color:#2f2f2f;',
  2: 'font-size:18px;font-weight:bold;margin:18px 0 10px;color:#2f2f2f;',
  3: 'font-size:17px;font-weight:bold;margin:18px 0 10px;color:#2f2f2f;',
  4: 'font-size:16px;font-weight:bold;margin:18px 0 10px;color:#2f2f2f;',
  5: 'font-size:15px;font-weight:bold;margin:18px 0 10px;color:#2f2f2f;',
}
const BQ_STYLE =
  'border-left:3px solid #d8d8d8;padding:4px 12px;color:#888;margin:10px 0;font-size:14px;'
const LIST_STYLE = 'margin:8px 0;padding-left:20px;'
const LI_STYLE = 'font-size:15px;line-height:1.75;color:#3f3f3f;'
const CODE_STYLE =
  'background:#f2f2f2;border-radius:3px;padding:1px 4px;font-size:13px;color:#c7254e;font-family:Menlo,monospace;'
const PRE_STYLE =
  'background:#f6f8fa;border-radius:6px;padding:12px;overflow-x:auto;font-size:13px;line-height:1.6;'
const PRE_CODE_STYLE = 'font-family:Menlo,monospace;color:#24292e;background:transparent;'
const A_STYLE = 'color:#576b95;text-decoration:none;'
const TABLE_STYLE = 'border-collapse:collapse;width:100%;margin:10px 0;font-size:14px;'
const TH_STYLE = 'border:1px solid #ddd;padding:6px 8px;background:#f5f5f5;'
const TD_STYLE = 'border:1px solid #ddd;padding:6px 8px;'
const IMG_STYLE = 'max-width:100%;border-radius:4px;margin:10px 0;'
const HR_STYLE = 'border:none;border-top:1px solid #e5e5e5;margin:16px 0;'
const MATH_DIV_STYLE =
  'background:#f7f7f7;border-radius:6px;padding:10px 12px;margin:10px 0;font-size:14px;text-align:center;overflow-x:auto;'
const MATH_CODE_STYLE = 'font-family:Menlo,monospace;color:#333;'

const CONTENT_LIMIT = 20_000

interface RenderCtx {
  seq: number
  srcToToken: Map<string, string>
  images: Array<{ token: string; src: string }>
  mathCount: number
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isFence(line: string): boolean {
  return line.startsWith('```')
}

function isBlockMathLine(line: string): boolean {
  return line.trim().startsWith('$$')
}

function isHeading(line: string): boolean {
  return /^#{1,6}\s+/.test(line)
}

function isHr(line: string): boolean {
  return /^---+$/.test(line.trim())
}

function isTableLine(line: string): boolean {
  return line.trim().startsWith('|')
}

function isQuote(line: string): boolean {
  return line.startsWith('>')
}

function isUl(line: string): boolean {
  return line.startsWith('- ')
}

function isOl(line: string): boolean {
  return /^\d+\. /.test(line)
}

function isBlockStart(line: string): boolean {
  return (
    isFence(line) ||
    isBlockMathLine(line) ||
    isHeading(line) ||
    isHr(line) ||
    isTableLine(line) ||
    isQuote(line) ||
    isUl(line) ||
    isOl(line)
  )
}

function countUnescapedDollars(line: string): number {
  let count = 0
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '$' && line[i - 1] !== '\\') {
      count += 1
    }
  }
  return count
}

function nextUnescapedDollar(text: string, from: number, lineEnd: number): number {
  for (let i = from; i < lineEnd; i++) {
    if (text[i] === '$' && text[i - 1] !== '\\') {
      return i
    }
  }
  return -1
}

function matchInlineMath(text: string, pos: number): { body: string; end: number } | null {
  if (text[pos] !== '$' || text[pos - 1] === '\\') {
    return null
  }
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1
  const nl = text.indexOf('\n', pos)
  const lineEnd = nl === -1 ? text.length : nl
  const line = text.slice(lineStart, lineEnd)
  // 同一行不成对（奇数个未转义 $）时全部当普通文本，避免误伤 $100。
  if (countUnescapedDollars(line) % 2 !== 0) {
    return null
  }
  const close = nextUnescapedDollar(text, pos + 1, lineEnd)
  if (close < 0) {
    return null
  }
  const body = text.slice(pos + 1, close)
  if (!body || body !== body.trim()) {
    return null
  }
  return { body, end: close + 1 }
}

function matchImage(text: string, pos: number): { alt: string; src: string; end: number } | null {
  if (text[pos] !== '!' || text[pos + 1] !== '[') {
    return null
  }
  const matched = /^!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/.exec(text.slice(pos))
  if (!matched) {
    return null
  }
  return { alt: matched[1], src: matched[2], end: pos + matched[0].length }
}

function matchLink(text: string, pos: number): { label: string; href: string; end: number } | null {
  if (text[pos] !== '[') {
    return null
  }
  const matched = /^\[([^\]]*)\]\(\s*([^)]+?)\s*\)/.exec(text.slice(pos))
  if (!matched) {
    return null
  }
  return { label: matched[1], href: matched[2], end: pos + matched[0].length }
}

function emitImage(alt: string, src: string, ctx: RenderCtx): string {
  let token = ctx.srcToToken.get(src)
  if (!token) {
    ctx.seq += 1
    token = `wximg${String(ctx.seq)}`
    ctx.srcToToken.set(src, token)
    ctx.images.push({ token, src })
  }
  return `<img src="__WXIMG_${token}__" alt="${escapeHtml(alt)}" style="${IMG_STYLE}">`
}

/** LaTeX v1 文本近似，不做图片渲染；后续可换成 svg / MathJax 扩展点。 */
function emitBlockMath(source: string): string {
  return `<div style="${MATH_DIV_STYLE}"><code style="${MATH_CODE_STYLE}">$${escapeHtml(source)}$</code></div>`
}

function findBoldClose(text: string, from: number): number {
  const end = text.indexOf('**', from)
  return end >= from ? end : -1
}

function findItalicClose(text: string, from: number): number {
  let i = from
  while (i < text.length) {
    if (text[i] === '*' && text[i + 1] !== '*') {
      return i
    }
    i += 1
  }
  return -1
}

function renderInline(text: string, ctx: RenderCtx): string {
  let i = 0
  const out: string[] = []
  const n = text.length

  while (i < n) {
    const ch = text[i]

    if (ch === '\\' && i + 1 < n) {
      out.push(escapeHtml(text[i + 1]))
      i += 2
      continue
    }

    if (ch === '`') {
      const end = text.indexOf('`', i + 1)
      if (end > i) {
        out.push(`<code style="${CODE_STYLE}">${escapeHtml(text.slice(i + 1, end))}</code>`)
        i = end + 1
        continue
      }
    }

    const image = matchImage(text, i)
    if (image) {
      out.push(emitImage(image.alt, image.src, ctx))
      i = image.end
      continue
    }

    const link = matchLink(text, i)
    if (link) {
      const inner = renderInline(link.label, ctx)
      out.push(`<a href="${escapeHtml(link.href)}" style="${A_STYLE}">${inner}</a>`)
      i = link.end
      continue
    }

    if (text.startsWith('**', i)) {
      const end = findBoldClose(text, i + 2)
      if (end > i + 2) {
        out.push(`<strong>${renderInline(text.slice(i + 2, end), ctx)}</strong>`)
        i = end + 2
        continue
      }
    }

    if (ch === '*' && text[i + 1] !== '*') {
      const end = findItalicClose(text, i + 1)
      if (end > i + 1) {
        out.push(`<em>${renderInline(text.slice(i + 1, end), ctx)}</em>`)
        i = end + 1
        continue
      }
    }

    const math = matchInlineMath(text, i)
    if (math) {
      ctx.mathCount += 1
      out.push(`<code style="${CODE_STYLE}">$${escapeHtml(math.body)}$</code>`)
      i = math.end
      continue
    }

    let j = i + 1
    while (j < n) {
      const next = text[j]
      if (
        next === '\\' ||
        next === '`' ||
        next === '[' ||
        next === '*' ||
        next === '$' ||
        (next === '!' && text[j + 1] === '[')
      ) {
        break
      }
      j += 1
    }
    out.push(escapeHtml(text.slice(i, j)))
    i = j
  }

  return out.join('')
}

function parseFence(lines: string[], start: number): { html: string; next: number } {
  const inner: string[] = []
  let i = start + 1
  while (i < lines.length && !isFence(lines[i])) {
    inner.push(lines[i])
    i += 1
  }
  if (i < lines.length) {
    i += 1
  }
  const content = escapeHtml(inner.join('\n'))
  return {
    html: `<pre style="${PRE_STYLE}"><code style="${PRE_CODE_STYLE}">${content}</code></pre>`,
    next: i,
  }
}

function parseBlockMath(lines: string[], start: number): { html: string; next: number } {
  const trimmed = lines[start].trim()
  const oneLine = /^\$\$([\s\S]+)\$\$$/.exec(trimmed)
  if (oneLine && trimmed !== '$$') {
    return { html: emitBlockMath(oneLine[1].trim()), next: start + 1 }
  }
  const inner: string[] = []
  let i = start + 1
  if (trimmed.length > 2) {
    inner.push(trimmed.slice(2))
  }
  while (i < lines.length) {
    const t = lines[i].trim()
    if (t === '$$') {
      i += 1
      break
    }
    if (t.endsWith('$$')) {
      inner.push(t.slice(0, -2))
      i += 1
      break
    }
    inner.push(lines[i])
    i += 1
  }
  return { html: emitBlockMath(inner.join('\n').trim()), next: i }
}

function parseQuote(lines: string[], start: number, ctx: RenderCtx): { html: string; next: number } {
  const parts: string[] = []
  let i = start
  while (i < lines.length && isQuote(lines[i])) {
    const text = lines[i].replace(/^>+\s?/, '')
    parts.push(renderInline(text, ctx))
    i += 1
  }
  return {
    html: `<blockquote style="${BQ_STYLE}">${parts.join('<br>')}</blockquote>`,
    next: i,
  }
}

function parseList(
  lines: string[],
  start: number,
  ctx: RenderCtx,
  tag: 'ul' | 'ol',
  itemRe: RegExp,
): { html: string; next: number } {
  const items: string[] = []
  let i = start
  while (i < lines.length && itemRe.test(lines[i])) {
    const text = lines[i].replace(itemRe, '')
    items.push(`<li style="${LI_STYLE}">${renderInline(text, ctx)}</li>`)
    i += 1
  }
  return {
    html: `<${tag} style="${LIST_STYLE}">${items.join('')}</${tag}>`,
    next: i,
  }
}

function splitTableRow(line: string): string[] {
  let raw = line.trim()
  if (raw.startsWith('|')) {
    raw = raw.slice(1)
  }
  if (raw.endsWith('|')) {
    raw = raw.slice(0, -1)
  }
  return raw.split('|').map((cell) => cell.trim())
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function parseTable(lines: string[], start: number, ctx: RenderCtx): { html: string; next: number } {
  const rows: string[][] = []
  let i = start
  while (i < lines.length && isTableLine(lines[i])) {
    rows.push(splitTableRow(lines[i]))
    i += 1
  }
  const header = rows[0] ?? []
  let body = rows.slice(1)
  if (body[0] && isSeparatorRow(body[0])) {
    body = body.slice(1)
  }
  const th = header
    .map((cell) => `<th style="${TH_STYLE}">${renderInline(cell, ctx)}</th>`)
    .join('')
  const bodyRows = body
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td style="${TD_STYLE}">${renderInline(cell, ctx)}</td>`).join('')}</tr>`,
    )
    .join('')
  const thead = `<thead><tr>${th}</tr></thead>`
  const tbody = body.length > 0 ? `<tbody>${bodyRows}</tbody>` : ''
  return {
    html: `<table style="${TABLE_STYLE}">${thead}${tbody}</table>`,
    next: i,
  }
}

export function markdownToWechatHtml(markdown: string): MdToHtmlResult {
  const ctx: RenderCtx = { seq: 0, srcToToken: new Map(), images: [], mathCount: 0 }
  const lines = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const blocks: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i += 1
      continue
    }

    if (isFence(line)) {
      const parsed = parseFence(lines, i)
      blocks.push(parsed.html)
      i = parsed.next
      continue
    }

    if (isBlockMathLine(line)) {
      const parsed = parseBlockMath(lines, i)
      blocks.push(parsed.html)
      ctx.mathCount += 1
      i = parsed.next
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      const rawLevel = heading[1].length
      const level = rawLevel >= 5 ? 5 : rawLevel
      const title = heading[2].replace(/\s+#+\s*$/, '')
      blocks.push(`<h${level} style="${H_STYLES[level]}">${renderInline(title, ctx)}</h${level}>`)
      i += 1
      continue
    }

    if (isHr(line)) {
      blocks.push(`<hr style="${HR_STYLE}">`)
      i += 1
      continue
    }

    if (isTableLine(line)) {
      const parsed = parseTable(lines, i, ctx)
      blocks.push(parsed.html)
      i = parsed.next
      continue
    }

    if (isQuote(line)) {
      const parsed = parseQuote(lines, i, ctx)
      blocks.push(parsed.html)
      i = parsed.next
      continue
    }

    if (isUl(line)) {
      const parsed = parseList(lines, i, ctx, 'ul', /^- /)
      blocks.push(parsed.html)
      i = parsed.next
      continue
    }

    if (isOl(line)) {
      const parsed = parseList(lines, i, ctx, 'ol', /^\d+\. /)
      blocks.push(parsed.html)
      i = parsed.next
      continue
    }

    const para: string[] = []
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) {
      para.push(lines[i])
      i += 1
    }
    // 连续换行合并为一个段落；行内公式仍按原行配对（join 前已是单行片段）。
    blocks.push(`<p style="${P_STYLE}">${renderInline(para.join(' '), ctx)}</p>`)
  }

  return {
    html: `<section>${blocks.join('')}</section>`,
    images: ctx.images,
    mathCount: ctx.mathCount,
  }
}

export function isOverContentLimit(html: string): boolean {
  return html.length > CONTENT_LIMIT
}
