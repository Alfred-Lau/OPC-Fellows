// 写入草稿前的正文校对：只去未格式化标记、套用红线词/错别字短替换，不改表意。

export type WxDraftBodyEditKind = 'redline' | 'typo'

export interface WxDraftBodyEdit {
  kind: WxDraftBodyEditKind
  from: string
  to: string
  reason?: string
}

export interface WxDraftBodyRevision {
  markdown: string
  orphanMarks: number
  applied: WxDraftBodyEdit[]
}

const FROM_MAX = 16
const TO_MAX = 24

export function stripOrphanMarkdown(markdown: string): { markdown: string; orphanMarks: number } {
  const lines = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const out: string[] = []
  let orphanMarks = 0
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (isFence(line) || isBlockMathOpen(line)) {
      const closer = isFence(line) ? isFence : isBlockMathOpen
      out.push(line)
      i += 1
      while (i < lines.length && !closer(lines[i])) {
        out.push(lines[i])
        i += 1
      }
      if (i < lines.length) {
        out.push(lines[i])
        i += 1
      }
      continue
    }

    const stripped = stripLineOrphans(line)
    orphanMarks += stripped.removed
    out.push(stripped.line)
    i += 1
  }

  return { markdown: out.join('\n'), orphanMarks }
}

export function parseWxDraftBodyEdits(content: string): WxDraftBodyEdit[] {
  const json = content.replace(/```json|```/g, '').trim()
  const start = json.indexOf('{')
  const end = json.lastIndexOf('}')
  if (start < 0 || end < 0) {
    return []
  }
  try {
    const raw = JSON.parse(json.slice(start, end + 1)) as Record<string, unknown>
    return [
      ...readEdits(raw.redlines, 'redline'),
      ...readEdits(raw.typos, 'typo'),
    ]
  } catch {
    return []
  }
}

export function applyWxDraftBodyEdits(
  markdown: string,
  edits: readonly WxDraftBodyEdit[],
): { markdown: string; applied: WxDraftBodyEdit[] } {
  const applied: WxDraftBodyEdit[] = []
  let next = markdown
  const sorted = [...edits].sort((left, right) => [...right.from].length - [...left.from].length)
  for (const edit of sorted) {
    if (!isSafeEdit(edit) || !next.includes(edit.from)) {
      continue
    }
    next = next.split(edit.from).join(edit.to)
    applied.push(edit)
  }
  return { markdown: next, applied }
}

export function reviseWxDraftBodyLocal(markdown: string, edits: readonly WxDraftBodyEdit[] = []): WxDraftBodyRevision {
  const stripped = stripOrphanMarkdown(markdown)
  const patched = applyWxDraftBodyEdits(stripped.markdown, edits)
  return {
    markdown: patched.markdown,
    orphanMarks: stripped.orphanMarks,
    applied: patched.applied,
  }
}

export function formatBodyRevisionMessage(revision: WxDraftBodyRevision): string {
  const redlines = revision.applied.filter((item) => item.kind === 'redline').length
  const typos = revision.applied.filter((item) => item.kind === 'typo').length
  const parts: string[] = []
  if (revision.orphanMarks) {
    parts.push(`未格式化标记 ${String(revision.orphanMarks)} 处`)
  }
  if (redlines) {
    parts.push(`红线词 ${String(redlines)} 处`)
  }
  if (typos) {
    parts.push(`错别字 ${String(typos)} 处`)
  }
  if (parts.length === 0) {
    return '正文未改表意，无需校对'
  }
  return `校对正文：${parts.join('、')}。未改表意`
}

function readEdits(value: unknown, kind: WxDraftBodyEditKind): WxDraftBodyEdit[] {
  if (!Array.isArray(value)) {
    return []
  }
  const edits: WxDraftBodyEdit[] = []
  for (const row of value) {
    if (!row || typeof row !== 'object') {
      continue
    }
    const record = row as Record<string, unknown>
    const from = typeof record.from === 'string' ? record.from : ''
    const to = typeof record.to === 'string' ? record.to : ''
    const reason = typeof record.reason === 'string' ? record.reason.trim() : ''
    const edit: WxDraftBodyEdit = { kind, from, to }
    if (reason) {
      edit.reason = reason
    }
    if (isSafeEdit(edit)) {
      edits.push(edit)
    }
  }
  return edits
}

function isSafeEdit(edit: WxDraftBodyEdit): boolean {
  if (!edit.from || edit.from === edit.to) {
    return false
  }
  if (edit.from.includes('\n') || edit.to.includes('\n') || !edit.to) {
    return false
  }
  if (/[。！]/.test(edit.from)) {
    return false
  }
  const fromLen = [...edit.from].length
  const toLen = [...edit.to].length
  if (fromLen > FROM_MAX || toLen > TO_MAX) {
    return false
  }
  const maxTo = Math.max(fromLen + 8, Math.ceil(fromLen * 1.8))
  return toLen <= maxTo
}

function isFence(line: string): boolean {
  return line.trimStart().startsWith('```')
}

function isBlockMathOpen(line: string): boolean {
  return line.trim().startsWith('$$')
}

function stripLineOrphans(line: string): { line: string; removed: number } {
  if (/^#{1,6}(?!\s|#|$)/.test(line)) {
    const hashes = /^(#{1,6})/.exec(line)?.[1].length ?? 0
    return { line: line.slice(hashes), removed: hashes }
  }
  return stripInlineOrphans(line)
}

function stripInlineOrphans(text: string): { line: string; removed: number } {
  let i = 0
  let removed = 0
  const out: string[] = []
  const n = text.length

  while (i < n) {
    if (text[i] === '\\' && i + 1 < n) {
      out.push(text.slice(i, i + 2))
      i += 2
      continue
    }

    const image = matchWrapped(text, i, /^!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/)
    if (image) {
      out.push(image.text)
      i = image.end
      continue
    }

    const link = matchWrapped(text, i, /^\[([^\]]*)\]\(\s*([^)]+?)\s*\)/)
    if (link) {
      out.push(link.text)
      i = link.end
      continue
    }

    if (text.startsWith('~~', i)) {
      const end = text.indexOf('~~', i + 2)
      if (end > i + 2) {
        out.push(text.slice(i + 2, end))
        removed += 1
        i = end + 2
        continue
      }
      i += 2
      removed += 1
      continue
    }

    if (text.startsWith('__', i)) {
      const end = text.indexOf('__', i + 2)
      if (end > i + 2) {
        out.push(text.slice(i + 2, end))
        removed += 1
        i = end + 2
        continue
      }
      i += 2
      removed += 1
      continue
    }

    if (text.startsWith('**', i)) {
      const end = text.indexOf('**', i + 2)
      if (end > i + 2) {
        out.push(text.slice(i, end + 2))
        i = end + 2
        continue
      }
      i += 2
      removed += 1
      continue
    }

    if (text[i] === '_' && canOpenUnderscore(text, i)) {
      const end = findClosingUnderscore(text, i + 1)
      if (end > i + 1) {
        out.push(text.slice(i + 1, end))
        removed += 1
        i = end + 1
        continue
      }
      i += 1
      removed += 1
      continue
    }

    if (text[i] === '*' && text[i + 1] !== '*') {
      const end = findClosingStar(text, i + 1)
      if (end > i + 1) {
        out.push(text.slice(i, end + 1))
        i = end + 1
        continue
      }
      i += 1
      removed += 1
      continue
    }

    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1)
      if (end > i) {
        out.push(text.slice(i, end + 1))
        i = end + 1
        continue
      }
      i += 1
      removed += 1
      continue
    }

    out.push(text[i])
    i += 1
  }

  return { line: out.join(''), removed }
}

function matchWrapped(text: string, pos: number, pattern: RegExp): { text: string; end: number } | null {
  const matched = pattern.exec(text.slice(pos))
  if (!matched) {
    return null
  }
  return { text: matched[0], end: pos + matched[0].length }
}

function findClosingStar(text: string, from: number): number {
  let i = from
  while (i < text.length) {
    if (text[i] === '*' && text[i + 1] !== '*') {
      return i
    }
    i += 1
  }
  return -1
}

function canOpenUnderscore(text: string, pos: number): boolean {
  const prev = text[pos - 1] ?? ''
  const next = text[pos + 1] ?? ''
  if (!next || next === '_' || next === ' ') {
    return false
  }
  return !isWordChar(prev)
}

function findClosingUnderscore(text: string, from: number): number {
  let i = from
  while (i < text.length) {
    if (text[i] === '_' && text[i + 1] !== '_') {
      const prev = text[i - 1] ?? ''
      const next = text[i + 1] ?? ''
      if (isWordChar(prev) && !isWordChar(next)) {
        return i
      }
    }
    i += 1
  }
  return -1
}

function isWordChar(ch: string): boolean {
  return /[0-9A-Za-z\u3400-\u9fff]/.test(ch)
}
