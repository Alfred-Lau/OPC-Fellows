import { BrowserWindow, screen, app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { resolveAppIconPath } from './app-icon'
import { PRODUCT_NAME } from '../shared/brand'
import { petWindowStacking, type PetAlert, type PetWindowMode } from '../shared/pet'

const IDLE = { width: 198, height: 272 }
const ALERT = { width: 460, height: 500 }

let pet: BrowserWindow | null = null
let idleBounds = { x: 0, y: 0, ...IDLE }
let alerting = false

export function getPetWindow(): BrowserWindow | null {
  return pet && !pet.isDestroyed() ? pet : null
}

/** 模块被停用时收走小鹿，否则窗口会孤零零留在桌面上。 */
export function closePetWindow(): void {
  const existing = getPetWindow()
  pet = null
  alerting = false
  existing?.destroy()
}

export function showPetWindow(): BrowserWindow {
  const existing = getPetWindow()
  if (existing) {
    existing.showInactive()
    return existing
  }

  idleBounds = idlePosition()
  const stacking = petWindowStacking('idle')
  const window = new BrowserWindow({
    ...idleBounds,
    show: false,
    frame: false,
    transparent: true,
    movable: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: stacking.alwaysOnTop,
    acceptFirstMouse: true,
    title: `${PRODUCT_NAME} 台伴`,
    icon: resolveAppIconPath(),
    webPreferences: {
      preload: resolvePreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  applyPetStacking(window, 'idle')
  window.setIgnoreMouseEvents(false)

  window.on('ready-to-show', () => {
    window.showInactive()
  })

  window.on('moved', () => {
    rememberPetIdle()
  })

  window.on('closed', () => {
    if (pet === window) {
      pet = null
    }
  })

  void loadPet(window)
  pet = window
  return window
}

export function alertPet(alert: PetAlert): void {
  const window = showPetWindow()
  alerting = true
  const area = screen.getPrimaryDisplay().workArea
  window.setBounds({
    x: area.x + Math.round(area.width / 2) - ALERT.width / 2,
    y: area.y + Math.round(area.height / 2) - ALERT.height / 2,
    ...ALERT,
  })
  applyPetStacking(window, 'alert')
  app.dock?.bounce('critical')
  window.webContents.send('pet:alert', alert)
}

export function dismissPet(): void {
  const window = getPetWindow()
  if (!window) {
    return
  }
  alerting = false
  idleBounds = { ...idleBounds, ...IDLE }
  window.setBounds(idleBounds)
  applyPetStacking(window, 'idle')
  window.showInactive()
  window.webContents.send('pet:idle')
}

export function isPetAlerting(): boolean {
  return alerting
}

export function rememberPetIdle(): void {
  const window = getPetWindow()
  if (!window || alerting) {
    return
  }
  const [x, y] = window.getPosition()
  idleBounds = { x, y, ...IDLE }
}

function applyPetStacking(window: BrowserWindow, mode: PetWindowMode): void {
  const stacking = petWindowStacking(mode)
  window.setAlwaysOnTop(stacking.alwaysOnTop)
  window.setVisibleOnAllWorkspaces(stacking.visibleOnAllWorkspaces, {
    visibleOnFullScreen: stacking.visibleOnFullScreen,
  })
  if (stacking.raise) {
    window.show()
    window.focus()
    window.moveTop()
  }
}

function idlePosition(): { x: number; y: number; width: number; height: number } {
  const area = screen.getPrimaryDisplay().workArea
  return {
    x: area.x + area.width - IDLE.width - 28,
    y: area.y + area.height - IDLE.height - 24,
    ...IDLE,
  }
}

function loadPet(window: BrowserWindow): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    url.pathname = '/pet.html'
    void window.loadURL(url.href)
    return
  }
  void window.loadFile(join(__dirname, '../renderer/pet.html'))
}

function resolvePreload(): string {
  const mjs = join(__dirname, '../preload/index.mjs')
  const js = join(__dirname, '../preload/index.js')
  return existsSync(mjs) ? mjs : js
}
