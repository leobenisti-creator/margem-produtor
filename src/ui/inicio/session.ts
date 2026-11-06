import { useEffect, useState } from 'react'
import { useReducedMotion } from 'motion/react'

/**
 * DEFAULT: the Início animates ALWAYS (mode 'always'): every entrance plays each time its block comes into view, again and
 * again, on every visit. The rule below ("once per visit") is still there, opt-in, as `localStorage['margem:motion'] = 'once'`.
 *
 * "Every animation plays once per VISIT": the first time it is seen in this browser session, never again until the
 * tab/window is closed (scrolling back, switching tabs, leaving the Início and returning render the final state).
 *
 * The keys already played live in a module-level set, mirrored in sessionStorage under `margem:animacoes-vistas`
 * (a JSON array of strings) so a reload inside the same tab does not replay. It is NOT localStorage and never part of
 * the app state (`margem:v3` is never touched). It is written only when a key is marked as played for the first time
 * (never on render or scroll). Every storage access is wrapped in try/catch; a corrupted value is ignored.
 *
 * Mode (read-only override in `localStorage['margem:motion']`, never written by the app):
 *  - 'always' (default, in production and in development): everything plays every time it enters the view.
 *  - 'once'   (opt-in override): each key plays once per visit and never again.

 *
 * Reduced motion (or no IntersectionObserver): `useFirstTime` is false, nothing animates and nothing is written.
 *
 * Keys are stable strings such as `capa.entrada`, `mercado.cartoes`, `appfaz.lavoura.preview`.
 */
export const PLAYED_KEY = 'margem:animacoes-vistas'
export const MODE_KEY = 'margem:motion'
/** Marks that the landing as a whole has been shown (for components without a key). */
const LANDING_KEY = 'inicio.visto'

export type MotionMode = 'once' | 'always'

export function motionMode(): MotionMode {
  try {
    const v = localStorage.getItem(MODE_KEY)
    if (v === 'once' || v === 'always') return v
  } catch {
    /* storage unavailable: fall through to the default */
  }
  return 'always'
}

let played: Set<string> | null = null
let landingSeen = false

function load(): Set<string> {
  if (played) return played
  played = new Set<string>()
  try {
    const raw = sessionStorage.getItem(PLAYED_KEY)
    const data: unknown = raw ? JSON.parse(raw) : []
    if (Array.isArray(data)) for (const k of data) if (typeof k === 'string') played.add(k)
  } catch {
    /* corrupted or unavailable: start empty */
  }
  return played
}

/** Records that the animation `key` has played (once mode only; writes storage only the first time). */
export function markPlayed(key: string | undefined) {
  if (key === undefined || motionMode() !== 'once') return
  const set = load()
  if (set.has(key)) return
  set.add(key)
  try {
    sessionStorage.setItem(PLAYED_KEY, JSON.stringify([...set]))
  } catch {
    /* quota or privacy mode: it simply replays next time */
  }
}

/** Whether `key` may still play (always true in 'always' mode). */
export function hasNotPlayed(key: string | undefined): boolean {
  if (motionMode() === 'always') return true
  if (key === undefined) return !landingSeen && !load().has(LANDING_KEY)
  return !load().has(key)
}

/** Called by the Início page after its first mount: components without a key become static from now on. */
export function markLandingSeen() {
  landingSeen = true
  markPlayed(LANDING_KEY)
}

/** Forget the in-memory state so the next read reloads storage (tests; sessionStorage itself is not cleared). */
export function resetMotionSession() {
  played = null
  landingSeen = false
}

/** True when the browser may animate at all: motion allowed and IntersectionObserver present. */
export function useCanAnimate(): boolean {
  const reduced = useReducedMotion()
  return !reduced && typeof IntersectionObserver !== 'undefined'
}

/**
 * True only the first time `key` is ever requested on this device (persisted), then false forever. False as well when
 * motion is off (reduced motion: nothing plays, nothing is written). The answer is fixed per mounted component, so a
 * re-render never cuts an animation. By default the key is recorded right after mount; pass `markNow = false` and
 * call `markPlayed(key)` yourself when the animation really starts (e.g. when it enters the view).
 */
export function useFirstTime(key?: string, markNow = true): boolean {
  const can = useCanAnimate()
  const [first] = useState(() => hasNotPlayed(key))
  useEffect(() => {
    if (can && markNow) markPlayed(key)
  }, [can, markNow, key])
  return can && first
}
