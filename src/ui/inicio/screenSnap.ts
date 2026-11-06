import { useEffect } from 'react'

/**
 * Screen-by-screen scrolling of the Início. Not CSS scroll-snap (its `proximity` only helps near a screen and its
 * `mandatory` picks the nearest one, so the page "stays in the middle"): when the scroll comes to rest, if the NEXT (or the
 * PREVIOUS) screen shows at least a fifth of the window, the page glides to it; if less, it glides back. Scrolling
 * down and up work the same way.
 *
 * A screen taller than the window is left alone while you read it: the rule only acts when the line between two screens is
 * in view. Pure decision in `snapTarget` (tested); the hook only listens to the scroll and moves the window.
 */

/** The share of the window a neighbouring screen must show for the page to move to it. */
export const SNAP_THRESHOLD = 0.2
/**
 * A screen up to this many window heights tall counts as "one screen" (its top rests at the top of the window, the last
 * few lines may sit just below the edge). Taller ones are read in place. Needed because the screens are a little taller
 * than the window (padding, cards), and a page that rests in the middle of such a screen is the very thing to avoid.
 */
export const FIT_TOLERANCE = 1.2
/** Windows narrower than this scroll freely (the screens are taller than the window there). */
export const SNAP_MIN_WIDTH = 640

export interface SnapSection {
  /** Absolute document position of the top and of the bottom of the screen, px. */
  top: number
  bottom: number
}

/**
 * Where the window should rest (document y of its top) after scrolling stopped at `y`, or null to leave it. `dir` is the
 * way the last scroll went. A screen that fits the window rests with its top at the top of the window; one taller than the
 * window rests with its top (coming from above) or its bottom (coming from below) at the window edge.
 */
export function snapTarget(
  sections: readonly SnapSection[],
  y: number,
  vh: number,
  dir: 'down' | 'up',
  threshold: number = SNAP_THRESHOLD,
): number | null {
  const fits = (s: SnapSection) => s.bottom - s.top <= vh * FIT_TOLERANCE
  for (let i = 0; i < sections.length - 1; i++) {
    const cur = sections[i]
    const next = sections[i + 1]
    const line = next.top
    // Only when the line between the two screens is inside the window.
    if (!(line > y && line < y + vh)) continue
    const nextShown = y + vh - line
    const curShown = line - y
    if (dir === 'down') {
      if (nextShown >= vh * threshold) return next.top
      // Not enough of the next screen: back to the one we came from when it fits the window; a tall one stays put.
      return fits(cur) ? cur.top : null
    }
    if (curShown >= vh * threshold) return fits(cur) ? cur.top : cur.bottom - vh
    // Less than a fifth of the one above: back to the top of the one we came from (also when it is a long screen).
    return next.top
  }
  return null
}

function readSections(ids: readonly string[]): SnapSection[] {
  const out: SnapSection[] = []
  for (const id of ids) {
    const el = document.getElementById(id)
    if (!el) continue
    const r = el.getBoundingClientRect()
    out.push({ top: r.top + window.scrollY, bottom: r.bottom + window.scrollY })
  }
  return out
}

/**
 * Moves the window screen by screen (see the header). Off for reduced motion and on narrow windows; follows both. The
 * scroll is smooth; a second scroll that starts while it glides simply wins (the browser cancels the glide).
 */
export function useScreenSnap(ids: readonly string[]) {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.scrollTo !== 'function') return
    const mql = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
    const wide = () => window.innerWidth >= SNAP_MIN_WIDTH
    const allowed = () => wide() && !(mql?.matches ?? false)

    let timer: ReturnType<typeof setTimeout> | undefined
    let busyTimer: ReturnType<typeof setTimeout> | undefined
    let busy = false
    let settledY = window.scrollY

    const release = () => {
      busy = false
      settledY = window.scrollY
    }

    const settle = () => {
      if (busy) {
        release()
        return
      }
      if (!allowed() || document.hidden) {
        settledY = window.scrollY
        return
      }
      const y = window.scrollY
      const dir = y >= settledY ? 'down' : 'up'
      const target = snapTarget(readSections(ids), y, window.innerHeight, dir)
      settledY = y
      if (target === null || Math.abs(target - y) < 2) return
      busy = true
      window.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
      // If the window cannot move there (the browser clamps it), no scroll event ends the glide: release anyway.
      clearTimeout(busyTimer)
      busyTimer = setTimeout(release, 900)
    }

    const onScroll = () => {
      clearTimeout(timer)
      timer = setTimeout(settle, busy ? 140 : 80)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      clearTimeout(timer)
      clearTimeout(busyTimer)
    }
  }, [ids])
}
