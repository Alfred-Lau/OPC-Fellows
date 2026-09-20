/** 把一条气泡正文收成输入框里的引用草稿。 */

export function quoteComposerDraft(input: {
  text: string
  speaker?: string
  existing?: string
}): string {
  const quoted = quoteLines(input.text, input.speaker)
  const rest = input.existing?.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim() ?? ''
  if (!quoted) {
    return rest
  }
  if (!rest) {
    return `${quoted}\n\n`
  }
  return `${quoted}\n\n${rest}`
}

function quoteLines(text: string, speaker?: string): string {
  const body = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  const who = speaker?.trim() ?? ''
  if (!body && !who) {
    return ''
  }
  const lines = body ? body.split('\n') : []
  const quoted = [...(who ? [who] : []), ...lines].map((line) => (line.trim() === '' ? '>' : `> ${line}`))
  return quoted.join('\n')
}
