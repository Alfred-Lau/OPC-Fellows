export const THEME_PREFERENCES = ['system', 'dark', 'light'] as const

export type ThemePreference = (typeof THEME_PREFERENCES)[number]

export const THEME_BACKGROUNDS = {
  dark: '#181818',
  light: '#fcfcfc',
} as const

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'dark' || value === 'light'
}
