import { getProjectTag } from '../../shared/tags'

export const ALL_TAG = '全部'

export function collectTags(items: Array<{ tags?: string[] }>): string[] {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const item of items) {
    for (const tag of item.tags ?? []) {
      if (seen.has(tag)) {
        continue
      }
      seen.add(tag)
      tags.push(tag)
    }
  }
  return tags.sort((left, right) => {
    if (left === getProjectTag()) {
      return -1
    }
    if (right === getProjectTag()) {
      return 1
    }
    return left.localeCompare(right, 'zh-CN')
  })
}

export function renderTagFilter(
  root: HTMLElement,
  tags: string[],
  current: string,
  onChange: (tag: string) => void,
): void {
  root.replaceChildren()
  if (tags.length === 0) {
    return
  }
  for (const tag of [ALL_TAG, ...tags]) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'tag-chip'
    button.classList.toggle('is-current', tag === current)
    button.textContent = tag
    button.addEventListener('click', () => {
      onChange(tag)
    })
    root.append(button)
  }
}

export function tagChips(tags: string[]): HTMLSpanElement {
  const wrap = document.createElement('span')
  wrap.className = 'tag-chips'
  for (const tag of tags) {
    const chip = document.createElement('span')
    chip.className = 'tag-chip is-static'
    chip.textContent = tag
    wrap.append(chip)
  }
  return wrap
}
