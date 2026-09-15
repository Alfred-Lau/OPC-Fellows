/** `/解读流量` 或芯片原句：回该 Skill 的现成表，不再二次裁剪。 */
export function isExactSkillPhrase(text: string, phrase: string): boolean {
  const needle = normalizeAsk(phrase)
  if (!needle) {
    return false
  }
  return normalizeAsk(text) === needle
}

/** 口令本身，或口令后面还带参数：「开实验 官网 CTA」。 */
export function startsWithSkillPhrase(text: string, phrase: string): boolean {
  const needle = normalizeAsk(phrase)
  if (!needle) {
    return false
  }
  const body = normalizeAsk(text)
  return body === needle || body.startsWith(needle)
}

/** 已经落到某条读 Skill 之后，问「最好 / 哪条」要从同一份数据点名。 */
export function isPickBestAsk(text: string): boolean {
  return /最好|最多|第一|哪[个条]|谁最|最热|最值得|最痛|最紧急/.test(text.trim())
}

export function shouldPickFromData(text: string, phrase: string): boolean {
  return !isExactSkillPhrase(text, phrase) && isPickBestAsk(text)
}

export function withNamedFirst(text: string, phrase: string, headline: string | null, body: string): string {
  if (!headline || !shouldPickFromData(text, phrase)) {
    return body
  }
  return [headline, '', body].join('\n')
}

function normalizeAsk(text: string): string {
  return text
    .trim()
    .replace(/^[/＠@]/, '')
    .replace(/[。！？!?]/g, '')
    .replace(/\s+/g, '')
}
