// Theme helper: system / light / dark, persisted in localStorage, applied as `.dark` on <html>.
// index.html contains an inline copy of `applyTheme` that runs before first paint (keep the
// storage key in sync).
import { useSyncExternalStore } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'cc-viewer:theme'

const listeners = new Set<() => void>()
const darkQuery = (): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    // storage unavailable (private mode, file://, ...)
  }
  return 'system'
}

let preference: ThemePreference = readPreference()

export function resolveTheme(pref: ThemePreference = preference): ResolvedTheme {
  if (pref === 'system') return darkQuery()?.matches ? 'dark' : 'light'
  return pref
}

export function applyTheme(pref: ThemePreference = preference): void {
  const resolved = resolveTheme(pref)
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
}

export function getThemePreference(): ThemePreference {
  return preference
}

export function setThemePreference(pref: ThemePreference): void {
  preference = pref
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref)
  } catch {
    // ignore
  }
  applyTheme(pref)
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

let initialised = false
/** Call once at startup: applies the theme and follows OS changes while on "system". */
export function initTheme(): void {
  applyTheme()
  if (initialised) return
  initialised = true
  darkQuery()?.addEventListener('change', () => {
    if (preference === 'system') {
      applyTheme()
      listeners.forEach((l) => l())
    }
  })
}

/** React hook: current preference, resolved theme, and a setter. */
export function useTheme(): {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (pref: ThemePreference) => void
} {
  const pref = useSyncExternalStore(subscribe, getThemePreference, () => 'system' as const)
  const resolved = useSyncExternalStore(
    subscribe,
    () => resolveTheme(pref),
    () => 'light' as const,
  )
  return { preference: pref, resolved, setPreference: setThemePreference }
}
