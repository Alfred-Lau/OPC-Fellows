export type ListingKind = 'idea' | 'ammo' | 'wx' | 'account' | 'note' | 'experiment'

export interface ShortListing {
  kind: ListingKind
  ids: string[]
}

export interface SkillReply {
  text: string
  listing?: ShortListing
}

export function pinByIds<T>(items: readonly T[], ids: readonly string[], idOf: (item: T) => string): T[] {
  return ids.flatMap((id) => {
    const found = items.find((item) => idOf(item) === id)
    return found ? [found] : []
  })
}

export function asSkillReply(text: string, listing?: ShortListing): SkillReply {
  return listing && listing.ids.length > 0 ? { text, listing } : { text }
}

const LISTING_KINDS: readonly ListingKind[] = ['idea', 'ammo', 'wx', 'account', 'note', 'experiment']

export function isShortListing(value: unknown): value is ShortListing {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as ShortListing
  return LISTING_KINDS.includes(record.kind) && Array.isArray(record.ids) && record.ids.every((id) => typeof id === 'string')
}
