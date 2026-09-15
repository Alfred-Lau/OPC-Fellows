export const TOOL_WIDTH_MIN = 320
export const TOOL_WIDTH_DEFAULT = 480
export const CHAT_PANE_MIN = 280

export function parseToolWidth(raw: string | null): number | undefined {
  if (raw == null) {
    return undefined
  }
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

export function clampToolWidth(width: number, studioWidth = 960): number {
  if (!Number.isFinite(width)) {
    return TOOL_WIDTH_DEFAULT
  }
  const max = Math.max(TOOL_WIDTH_MIN, Math.floor(studioWidth - CHAT_PANE_MIN))
  return Math.min(Math.max(TOOL_WIDTH_MIN, Math.round(width)), max)
}

export function defaultToolWidth(studioWidth = 960): number {
  return clampToolWidth(Math.round(studioWidth * 0.48), studioWidth)
}
