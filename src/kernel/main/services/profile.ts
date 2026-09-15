import { copyFileSync, existsSync, unlinkSync } from 'node:fs'
import { hostname } from 'node:os'
import { extname, join } from 'node:path'
import { app, dialog, nativeImage } from 'electron'
import { Service, type Context } from '@deepseek-ai/cordis'
import { LEGACY_PRODUCT_NAMES, LEGACY_USER_DATA_NAME, PRODUCT_NAME } from '../../../shared/brand'
import {
  defaultProfile,
  normalizeProfile,
  profileHasIdentity,
  profileLabel,
  profileLegacyRoots,
  shouldAdoptProfile,
  type WorkbenchProfile,
  type WorkbenchProfileView,
} from '../../shared/profile'
import { readJson, writeJson } from './storage'

const AVATAR_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

export class ProfileService extends Service {
  static inject = ['bridge']

  private data: WorkbenchProfile = defaultProfile()

  constructor(ctx: Context) {
    super(ctx, 'profile')
    this.data = this.load()

    ctx.bridge.handle('profile:get', () => this.view())
    ctx.bridge.handle('profile:save', (_event, raw: unknown) => this.saveName(raw))
    ctx.bridge.handle('profile:pick-avatar', () => this.pickAvatar())
    ctx.bridge.handle('profile:clear-avatar', () => this.clearAvatar())
  }

  view(): WorkbenchProfileView {
    const hostName = hostname()
    return {
      displayName: this.data.displayName,
      hostName,
      label: profileLabel(this.data, hostName),
      avatarDataUrl: this.avatarDataUrl(),
      version: app.getVersion(),
      packaged: app.isPackaged,
    }
  }

  saveName(raw: unknown): WorkbenchProfileView {
    const displayName =
      raw && typeof raw === 'object' && typeof (raw as { displayName?: unknown }).displayName === 'string'
        ? (raw as { displayName: string }).displayName
        : this.data.displayName
    this.data = normalizeProfile({ ...this.data, displayName })
    this.persist()
    return this.view()
  }

  async pickAvatar(): Promise<WorkbenchProfileView | null> {
    const options: Electron.OpenDialogOptions = {
      title: '选择头像',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    }
    const picked = await dialog.showOpenDialog(options)
    const source = picked.filePaths[0]
    if (picked.canceled || !source) {
      return null
    }
    const ext = extname(source).toLowerCase()
    if (!AVATAR_EXTS.has(ext)) {
      return this.view()
    }
    const dest = join(app.getPath('userData'), `profile-avatar${ext}`)
    copyFileSync(source, dest)
    if (this.data.avatarPath && this.data.avatarPath !== dest && existsSync(this.data.avatarPath)) {
      unlinkSync(this.data.avatarPath)
    }
    this.data = normalizeProfile({ ...this.data, avatarPath: dest })
    this.persist()
    return this.view()
  }

  private relocateAvatar(profile: WorkbenchProfile): WorkbenchProfile {
    if (!profile.avatarPath || !existsSync(profile.avatarPath)) {
      return profile.avatarPath ? { ...profile, avatarPath: '' } : profile
    }
    const ext = extname(profile.avatarPath).toLowerCase()
    if (!AVATAR_EXTS.has(ext)) {
      return { ...profile, avatarPath: '' }
    }
    const dest = join(app.getPath('userData'), `profile-avatar${ext}`)
    if (profile.avatarPath === dest) {
      return profile
    }
    copyFileSync(profile.avatarPath, dest)
    return { ...profile, avatarPath: dest }
  }

  /** 展示名改过之后 userData 会跟着搬家；当前目录没有档案就去旧目录认领。 */
  private load(): WorkbenchProfile {
    const stored = normalizeProfile(readJson(this.path(), null))
    const current = this.relocateAvatar(stored)
    if (profileHasIdentity(current)) {
      return this.commitIfMoved(stored, current)
    }
    const roots = profileLegacyRoots(app.getPath('appData'), app.getPath('userData'), [
      LEGACY_USER_DATA_NAME,
      ...LEGACY_PRODUCT_NAMES,
      PRODUCT_NAME,
    ])
    for (const root of roots) {
      const candidate = this.relocateAvatar(normalizeProfile(readJson(join(root, 'profile.json'), null)))
      if (shouldAdoptProfile(current, candidate)) {
        return this.commitIfMoved(stored, candidate)
      }
    }
    return current
  }

  private commitIfMoved(before: WorkbenchProfile, next: WorkbenchProfile): WorkbenchProfile {
    if (before.displayName === next.displayName && before.avatarPath === next.avatarPath) {
      return next
    }
    this.data = next
    this.persist()
    return next
  }

  clearAvatar(): WorkbenchProfileView {
    if (this.data.avatarPath && existsSync(this.data.avatarPath)) {
      unlinkSync(this.data.avatarPath)
    }
    this.data = normalizeProfile({ ...this.data, avatarPath: '' })
    this.persist()
    return this.view()
  }

  private avatarDataUrl(): string {
    if (!this.data.avatarPath || !existsSync(this.data.avatarPath)) {
      return ''
    }
    const image = nativeImage.createFromPath(this.data.avatarPath)
    if (image.isEmpty()) {
      return ''
    }
    return image.resize({ width: 256, height: 256 }).toDataURL()
  }

  private persist(): void {
    writeJson(this.path(), this.data)
  }

  private path(): string {
    return join(app.getPath('userData'), 'profile.json')
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    profile: ProfileService
  }
}
