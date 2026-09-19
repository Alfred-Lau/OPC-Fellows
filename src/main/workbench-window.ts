import { app, BrowserWindow, screen, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { resolveAppIconPath } from './app-icon'
import { windowBackground } from './theme'
import { PRODUCT_NAME } from '../shared/brand'
import type { WorkbenchView } from '../shared/features'

let workbench: BrowserWindow | null = null
let allowClose = false

app.on('before-quit', () => {
  allowClose = true
})

export function getWorkbenchWindow(): BrowserWindow | null {
  return workbench && !workbench.isDestroyed() ? workbench : null
}

export function showWorkbench(view: WorkbenchView = 'home', highlightId?: string): BrowserWindow {
  const existing = getWorkbenchWindow()
  if (existing) {
    existing.show()
    existing.focus()
    existing.webContents.send('workbench:navigate', view)
    if (view === 'todos') {
      existing.webContents.send('todos:focus-input')
      if (highlightId) {
        existing.webContents.send('todos:highlight', highlightId)
      }
    }
    return existing
  }

  const area = screen.getPrimaryDisplay().workArea
  const width = Math.min(1440, Math.max(1100, Math.round(area.width * 0.86)))
  const height = Math.min(920, Math.max(680, Math.round(area.height * 0.84)))
  const window = new BrowserWindow({
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    width,
    height,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    movable: true,
    title: PRODUCT_NAME,
    icon: resolveAppIconPath(),
    backgroundColor: windowBackground(),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 14 },
    webPreferences: {
      preload: resolvePreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      webviewTag: true,
    },
  })

  window.on('ready-to-show', () => {
    window.show()
    window.focus()
    window.webContents.send('workbench:navigate', view)
    if (view === 'todos') {
      window.webContents.send('todos:focus-input')
      if (highlightId) {
        window.webContents.send('todos:highlight', highlightId)
      }
    }
  })

  // 站点域名之类的外链交给系统浏览器，不在工作台里新开窗口。
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  window.on('close', (event) => {
    if (!allowClose && process.platform === 'darwin') {
      event.preventDefault()
      window.hide()
    }
  })

  window.on('closed', () => {
    if (workbench === window) {
      workbench = null
    }
  })

  void loadHome(window)
  workbench = window
  return window
}

function loadHome(window: BrowserWindow): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
    return
  }
  void window.loadFile(join(__dirname, '../renderer/index.html'))
}

function resolvePreload(): string {
  const mjs = join(__dirname, '../preload/index.mjs')
  const js = join(__dirname, '../preload/index.js')
  return existsSync(mjs) ? mjs : js
}
