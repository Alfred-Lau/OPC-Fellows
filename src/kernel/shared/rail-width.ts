export const RAIL_WIDTH_MIN = 168
export const RAIL_WIDTH_MAX = 420
export const RAIL_WIDTH_DEFAULT = 240
export const RAIL_WIDTH_COLLAPSED = 56

export function parseRailWidth(raw: string | null): number | undefined {
  if (raw == null) {
    return undefined
  }
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

export function clampRailWidth(width: number, viewportWidth = 1280): number {
  if (!Number.isFinite(width)) {
    return RAIL_WIDTH_DEFAULT
  }
  const cap = Math.min(RAIL_WIDTH_MAX, Math.floor(viewportWidth * 0.45))
  return Math.min(Math.max(RAIL_WIDTH_MIN, Math.round(width)), cap)
}
