export const OPC_PROJECT_TAG = 'OPC项目'

/** 待办上的默认项目标签，设置里可改。 */
let projectTag = OPC_PROJECT_TAG

export function getProjectTag(): string {
  return projectTag
}

export function setProjectTag(value: string): void {
  projectTag = normalizeTag(value) || OPC_PROJECT_TAG
}

export function normalizeTag(value: string): string {
  return value.trim().replace(/^#/, '').replace(/\s+/g, '')
}

export function normalizeTags(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return []
  }
  const seen = new Set<string>()
  const tags: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') {
      continue
    }
    const tag = normalizeTag(value)
    if (!tag || seen.has(tag)) {
      continue
    }
    seen.add(tag)
    tags.push(tag)
  }
  return tags
}

export function mergeTags(...groups: Array<readonly string[] | undefined>): string[] {
  return normalizeTags(groups.flatMap((group) => group ?? []))
}

export function extractTagsFromTitle(title: string): { title: string; tags: string[] } {
  const tags: string[] = []
  const cleaned = title
    .replace(/#([^\s#]+)/g, (_match, tag: string) => {
      tags.push(tag)
      return ' '
    })
    .replace(/\s+/g, ' ')
    .trim()
  return {
    title: cleaned || title.trim(),
    tags: normalizeTags(tags),
  }
}
