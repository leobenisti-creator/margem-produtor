import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import type { Route } from './routes'

/** The producer's colour theme: 'escuro' (black and gold, the default) or 'claro' (white and gold). */
export type Theme = 'claro' | 'escuro'

/** Own localStorage key: never part of the saved scenario (`margem:v3`). */
export const THEME_KEY = 'margem:tema'

/** Value of the `data-theme` attribute on <html> for each choice. */
export const THEME_ATTR: Record<Theme, 'light' | 'dark'> = { claro: 'light', escuro: 'dark' }

/** `<meta name="theme-color">` per theme (browser chrome on phones). */
const META_COLOR: Record<Theme, string> = { claro: '#ffffff', escuro: '#0b0c0d' }

const isTheme = (v: unknown): v is Theme => v === 'claro' || v === 'escuro'

/** Saved choice; any storage failure or unknown value reads as 'escuro'. */
export function getStoredTheme(): Theme {
  try {
    const v = window.localStorage.getItem(THEME_KEY)
    return isTheme(v) ? v : 'escuro'
  } catch {
    return 'escuro'
  }
}

/** Saves the choice; a storage failure (private mode, quota) is ignored: the choice still applies to this visit. */
export function setStoredTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme)
  } catch {
    // The choice just won't survive a reload.
  }
}

/** The Início (landing) is designed with photos and dark veils: it is always dark, whatever the producer chose. */
export function themeForRoute(route: Route, chosen: Theme): Theme {
  return route === 'inicio' ? 'escuro' : chosen
}

let fadeTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Puts the theme on <html> (`data-theme`) and on the browser's theme colour. With `animate`, <html> also carries
 * `.theme-anim` for a moment so the colours cross-fade (index.css; skipped under reduced motion).
 */
export function applyTheme(theme: Theme, animate = false): void {
  const root = document.documentElement
  const attr = THEME_ATTR[theme]
  if (root.getAttribute('data-theme') !== attr) {
    if (animate) {
      root.classList.add('theme-anim')
      clearTimeout(fadeTimer)
      fadeTimer = setTimeout(() => root.classList.remove('theme-anim'), 250)
    }
    root.setAttribute('data-theme', attr)
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLOR[theme])
}

// One shared copy of the choice, so the toggle and the shell stay in step.
let current: Theme | null = null
const listeners = new Set<() => void>()

function read(): Theme {
  if (current === null) current = getStoredTheme()
  return current
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY || e.key === null) {
      current = getStoredTheme()
      cb()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', onStorage)
  }
}

/** Test helper: forget the cached choice so the next read goes to localStorage again. */
export function resetThemeCache(): void {
  current = null
  listeners.forEach((l) => l())
}

/**
 * The saved theme and a setter. `theme` is the producer's CHOICE (what is saved); which theme is on screen also
 * depends on the page (see `useAppliedTheme`).
 */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void } {
  const theme = useSyncExternalStore(subscribe, read, () => 'escuro' as Theme)
  const setTheme = useCallback((t: Theme) => {
    current = t
    setStoredTheme(t)
    listeners.forEach((l) => l())
  }, [])
  const toggle = useCallback(() => setTheme(read() === 'claro' ? 'escuro' : 'claro'), [setTheme])
  return { theme, setTheme, toggle }
}

/**
 * AppShell's side of the theme: puts the theme for this page on <html>. The Início is always dark; every other page
 * shows the saved choice again. Visiting the Início never changes what is saved.
 */
export function useAppliedTheme(route: Route): Theme {
  const { theme } = useTheme()
  const shown = themeForRoute(route, theme)
  const first = useRef(true)
  useLayoutEffect(() => {
    applyTheme(shown, !first.current)
    first.current = false
  }, [shown])
  return shown
}
