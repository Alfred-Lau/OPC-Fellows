import { join } from 'node:path'

export interface WorkbenchProfile {
  displayName: string
  avatarPath: string
}

export function profileHasIdentity(profile: WorkbenchProfile): boolean {
  return Boolean(profile.displayName || profile.avatarPath)
}

export function shouldAdoptProfile(current: WorkbenchProfile, candidate: WorkbenchProfile): boolean {
  return !profileHasIdentity(current) && profileHasIdentity(candidate)
}

export function profileLegacyRoots(appData: string, currentUserData: string, names: readonly string[]): string[] {
  const seen = new Set<string>([currentUserData])
  const roots: string[] = []
  for (const name of names) {
    const root = join(appData, name)
    if (seen.has(root)) {
      continue
    }
    seen.add(root)
    roots.push(root)
  }
  return roots
}

export interface WorkbenchProfileView {
  displayName: string
  hostName: string
  label: string
  avatarDataUrl: string
  version: string
  packaged: boolean
}

export function defaultProfile(): WorkbenchProfile {
  return { displayName: '', avatarPath: '' }
}

export function normalizeProfile(raw: unknown): WorkbenchProfile {
  if (!raw || typeof raw !== 'object') {
    return defaultProfile()
  }
  const record = raw as Record<string, unknown>
  return {
    displayName: typeof record.displayName === 'string' ? record.displayName.trim().slice(0, 40) : '',
    avatarPath: typeof record.avatarPath === 'string' ? record.avatarPath : '',
  }
}

export function profileLabel(profile: WorkbenchProfile, hostName: string): string {
  return profile.displayName || hostName
}
