import { app, nativeImage, type NativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export function resolveAppIconPath(): string | undefined {
  const candidates = [
    join(process.cwd(), 'build', 'icon.png'),
    join(__dirname, '../../build/icon.png'),
    join(app.getAppPath(), 'build', 'icon.png'),
  ]
  if (process.resourcesPath) {
    candidates.push(join(process.resourcesPath, 'icon.png'), join(process.resourcesPath, 'icon.icns'))
  }
  return candidates.find((path) => existsSync(path))
}

export function loadAppIcon(): NativeImage | undefined {
  const path = resolveAppIconPath()
  if (!path) {
    return undefined
  }
  const image = nativeImage.createFromPath(path)
  return image.isEmpty() ? undefined : image
}

export function applyDockIcon(): void {
  if (process.platform !== 'darwin' || !app.dock) {
    return
  }
  const icon = loadAppIcon()
  if (icon) {
    app.dock.setIcon(icon)
  }
}
