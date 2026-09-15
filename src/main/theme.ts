import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  isThemePreference,
  THEME_BACKGROUNDS,
  type ThemePreference,
} from '../shared/theme'

type ThemeState = {
  preference: ThemePreference
  dark: boolean
}

function themeStorePath(): string {
  return join(app.getPath('userData'), 'theme.json')
}

function loadPreference(): ThemePreference {
  const path = themeStorePath()
  if (!existsSync(path)) {
    return 'system'
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { preference?: unknown }
    return isThemePreference(parsed.preference) ? parsed.preference : 'system'
  } catch {
    return 'system'
  }
}

function savePreference(preference: ThemePreference): void {
  const path = themeStorePath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify({ preference }, null, 2)}\n`)
}

export function windowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? THEME_BACKGROUNDS.dark : THEME_BACKGROUNDS.light
}

export function themeState(): ThemeState {
  return {
    preference: nativeTheme.themeSource === 'light' || nativeTheme.themeSource === 'dark'
      ? nativeTheme.themeSource
      : 'system',
    dark: nativeTheme.shouldUseDarkColors,
  }
}

function paintWindows(): void {
  const background = windowBackground()
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.setBackgroundColor(background)
    }
  }
}

function broadcastTheme(): void {
  const state = themeState()
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send('theme:changed', state)
    }
  }
}

export function applyThemePreference(preference: ThemePreference): ThemeState {
  savePreference(preference)
  nativeTheme.themeSource = preference
  paintWindows()
  const state = themeState()
  broadcastTheme()
  return state
}

export function initTheme(): void {
  nativeTheme.themeSource = loadPreference()
  nativeTheme.on('updated', () => {
    paintWindows()
    broadcastTheme()
  })
}

export function registerThemeIpc(): void {
  ipcMain.handle('theme:get', () => themeState())
  ipcMain.handle('theme:set', (_event, preference: unknown) => {
    if (!isThemePreference(preference)) {
      return themeState()
    }
    return applyThemePreference(preference)
  })
}
