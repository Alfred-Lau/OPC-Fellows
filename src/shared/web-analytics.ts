export interface WebAnalyticsFlags {
  id?: string
  enabledAt?: number
  disabledAt?: number
  canceledAt?: number
  hasData?: boolean
}

export function isWebAnalyticsEnabled(flags?: WebAnalyticsFlags | null): boolean {
  if (!flags) {
    return false
  }
  if (isTurnedOff(flags.disabledAt, flags.enabledAt) || isTurnedOff(flags.canceledAt, flags.enabledAt)) {
    return false
  }
  return flags.hasData === true || typeof flags.enabledAt === 'number'
}

function isTurnedOff(stoppedAt: number | undefined, enabledAt: number | undefined): boolean {
  return typeof stoppedAt === 'number' && (!enabledAt || stoppedAt >= enabledAt)
}
