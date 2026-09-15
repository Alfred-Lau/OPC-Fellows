/** 会话气泡用的 Markdown → 安全 HTML。零依赖，只产出白名单标签。 */

export function markdownTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  if (headers.length === 0) {
    return ''
  }
  const head = `| ${headers.map(escapeCell).join(' | ')} |`
  const rule = `| ${headers.map(() => '---').join(' | ')} |`
  const body = rows.map((row) => `| ${headers.map((_, index) => escapeCell(row[index] ?? '')).join(' | ')} |`)
  return [head, rule, ...body].join('\n')
}

export function markdownFence(body: string, lang = ''): string {
  const safe = body.replace(/```/g, '`\u200b``')
  return `\`\`\`${lang}\n${safe}\n\`\`\``
}

export function renderChatMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const blocks: string[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (line.trim() === '') {
      index += 1
      continue
    }
    if (line.startsWith('```')) {
      const parsed = parseFence(lines, index)
      blocks.push(parsed.html)
      index = parsed.next
      continue
    }
    if (/^#{1,6}\s+/.test(line)) {
      const level = Math.min(line.match(/^#{1,6}/)?.[0].length ?? 1, 4)
      const title = line.replace(/^#{1,6}\s+/, '')
      blocks.push(`<h${level}>${renderInline(title)}</h${level}>`)
      index += 1
      continue
    }
    if (/^---+$/.test(line.trim())) {
      blocks.push('<hr>')
      index += 1
      continue
    }
    if (line.trim().startsWith('|')) {
      const parsed = parseTable(lines, index)
      blocks.push(parsed.html)
      index = parsed.next
      continue
    }
    if (line.startsWith('>')) {
      const parsed = parseQuote(lines, index)
      blocks.push(parsed.html)
      index = parsed.next
      continue
    }
    if (line.startsWith('- ')) {
      const parsed = parseList(lines, index, 'ul', /^- /)
      blocks.push(parsed.html)
      index = parsed.next
      continue
    }
    if (/^\d+\. /.test(line)) {
      const parsed = parseList(lines, index, 'ol', /^\d+\. /)
      blocks.push(parsed.html)
      index = parsed.next
      continue
    }
    const para: string[] = [line]
    index += 1
    while (index < lines.length) {
      const next = lines[index] ?? ''
      if (next.trim() === '' || isBlockStart(next)) {
        break
      }
      para.push(next)
      index += 1
    }
    blocks.push(`<p>${renderInline(para.join('\n'))}</p>`)
  }
  return blocks.join('')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function isBlockStart(line: string): boolean {
  return (
    line.startsWith('```') ||
    /^#{1,6}\s+/.test(line) ||
    /^---+$/.test(line.trim()) ||
    line.trim().startsWith('|') ||
    line.startsWith('>') ||
    line.startsWith('- ') ||
    /^\d+\. /.test(line)
  )
}

function safeHref(raw: string): string | undefined {
  try {
    const url = new URL(raw)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.href
    }
  } catch {
    return undefined
  }
  return undefined
}

function renderInline(text: string): string {
  let index = 0
  const out: string[] = []
  while (index < text.length) {
    if (text[index] === '\\' && index + 1 < text.length) {
      out.push(escapeHtml(text[index + 1] ?? ''))
      index += 2
      continue
    }
    if (text[index] === '`') {
      const end = text.indexOf('`', index + 1)
      if (end > index) {
        out.push(`<code>${escapeHtml(text.slice(index + 1, end))}</code>`)
        index = end + 1
        continue
      }
    }
    const image = /^!\[([^\]]*)\]\(\s*([^)\s]+)\s*\)/.exec(text.slice(index))
    if (image) {
      const href = safeHref(image[2] ?? '')
      const alt = escapeHtml(image[1] ?? '')
      out.push(href ? `<img src="${escapeHtml(href)}" alt="${alt}">` : alt || '图片')
      index += image[0].length
      continue
    }
    const link = /^\[([^\]]*)\]\(\s*([^)]+?)\s*\)/.exec(text.slice(index))
    if (link) {
      const href = safeHref(link[2] ?? '')
      const label = renderInline(link[1] ?? '')
      out.push(href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${label}</a>` : label)
      index += link[0].length
      continue
    }
    if (text.startsWith('**', index)) {
      const end = text.indexOf('**', index + 2)
      if (end > index + 2) {
        out.push(`<strong>${renderInline(text.slice(index + 2, end))}</strong>`)
        index = end + 2
        continue
      }
    }
    if (text[index] === '*' && text[index + 1] !== '*') {
      const end = text.indexOf('*', index + 1)
      if (end > index + 1) {
        out.push(`<em>${renderInline(text.slice(index + 1, end))}</em>`)
        index = end + 1
        continue
      }
    }
    let next = index + 1
    while (next < text.length) {
      const ch = text[next]
      if (ch === '\\' || ch === '`' || ch === '[' || ch === '*' || (ch === '!' && text[next + 1] === '[')) {
        break
      }
      next += 1
    }
    out.push(escapeHtml(text.slice(index, next)))
    index = next
  }
  return out.join('')
}

function parseFence(lines: string[], start: number): { html: string; next: number } {
  const lang = (lines[start] ?? '').slice(3).trim()
  const inner: string[] = []
  let index = start + 1
  while (index < lines.length && !(lines[index] ?? '').startsWith('```')) {
    inner.push(lines[index] ?? '')
    index += 1
  }
  if (index < lines.length) {
    index += 1
  }
  const cls = lang ? ` class="lang-${escapeHtml(lang)}"` : ''
  return {
    html: `<pre><code${cls}>${escapeHtml(inner.join('\n'))}</code></pre>`,
    next: index,
  }
}

function parseQuote(lines: string[], start: number): { html: string; next: number } {
  const parts: string[] = []
  let index = start
  while (index < lines.length && (lines[index] ?? '').startsWith('>')) {
    parts.push(renderInline((lines[index] ?? '').replace(/^>+\s?/, '')))
    index += 1
  }
  return { html: `<blockquote>${parts.join('<br>')}</blockquote>`, next: index }
}

function parseList(lines: string[], start: number, tag: 'ul' | 'ol', itemRe: RegExp): { html: string; next: number } {
  const items: string[] = []
  let index = start
  while (index < lines.length && itemRe.test(lines[index] ?? '')) {
    items.push(`<li>${renderInline((lines[index] ?? '').replace(itemRe, ''))}</li>`)
    index += 1
  }
  return { html: `<${tag}>${items.join('')}</${tag}>`, next: index }
}

function splitRow(line: string): string[] {
  let raw = line.trim()
  if (raw.startsWith('|')) {
    raw = raw.slice(1)
  }
  if (raw.endsWith('|')) {
    raw = raw.slice(0, -1)
  }
  return raw.split('|').map((cell) => cell.trim().replace(/\\\|/g, '|'))
}

function isRule(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function parseTable(lines: string[], start: number): { html: string; next: number } {
  const rows: string[][] = []
  let index = start
  while (index < lines.length && (lines[index] ?? '').trim().startsWith('|')) {
    rows.push(splitRow(lines[index] ?? ''))
    index += 1
  }
  const header = rows[0] ?? []
  let body = rows.slice(1)
  if (body[0] && isRule(body[0])) {
    body = body.slice(1)
  }
  const head = `<thead><tr>${header.map((cell) => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead>`
  const numbered = (header[0] ?? '').replace(/\s/g, '') === '#'
  const bodyHtml =
    body.length > 0
      ? `<tbody>${body
          .map((row) => {
            const indexCell = (row[0] ?? '').trim()
            const rowNum = numbered && /^\d+$/.test(indexCell) ? indexCell : ''
            const attrs = rowNum ? ` data-row="${escapeHtml(rowNum)}" class="is-pick"` : ''
            return `<tr${attrs}>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`
          })
          .join('')}</tbody>`
      : ''
  return { html: `<table>${head}${bodyHtml}</table>`, next: index }
}
