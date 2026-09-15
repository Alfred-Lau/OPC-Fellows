import type { ThemePreference } from '../../shared/theme'

type ThemeState = {
  preference: ThemePreference
  dark: boolean
}

function applyTheme(state: ThemeState): void {
  document.documentElement.dataset.theme = state.dark ? 'dark' : 'light'
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-theme-pref]')) {
    button.classList.toggle('is-current', button.dataset.themePref === state.preference)
  }
}

function resolveDark(preference: ThemePreference): boolean {
  if (preference === 'dark') {
    return true
  }
  if (preference === 'light') {
    return false
  }
  return matchMedia('(prefers-color-scheme: dark)').matches
}

export function activateTheme(): void {
  const applyLocal = (preference: ThemePreference): void => {
    applyTheme({ preference, dark: resolveDark(preference) })
  }

  applyLocal('system')

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-theme-pref]')) {
    button.addEventListener('click', () => {
      const preference = button.dataset.themePref
      if (preference !== 'system' && preference !== 'dark' && preference !== 'light') {
        return
      }
      if (window.ownworkbuddy?.theme) {
        void window.ownworkbuddy.theme.set(preference)
        return
      }
      applyLocal(preference)
    })
  }

  if (!window.ownworkbuddy?.theme) {
    return
  }
  void window.ownworkbuddy.theme.get().then(applyTheme)
  window.ownworkbuddy.theme.onChanged(applyTheme)
}
