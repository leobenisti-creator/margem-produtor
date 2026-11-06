/** Small DOM helpers for the tour (all safe in jsdom and with blocked/absent browser APIs). */

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

export function prefersReducedMotion(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** The tour target, or null when it is missing or hidden (a different cost mode, a removed field). */
export function findAnchor(name: string): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${name}"]`)
  if (!el || !el.isConnected) return null
  if (el.closest('[hidden], [aria-hidden="true"]')) return null
  return el
}

/** The target itself when it is focusable (the "Próximo" link), else its first focusable descendant. */
export function firstFocusable(target: HTMLElement): HTMLElement | null {
  if (target.matches(FOCUSABLE)) return target
  return target.querySelector<HTMLElement>(FOCUSABLE)
}

/** Height of the fixed bottom navigation when it is showing (phones), else 0. */
export function bottomInset(): number {
  const nav = document.querySelector<HTMLElement>('nav[aria-label="Navegação inferior"]')
  if (!nav) return 0
  return nav.offsetHeight > 0 ? nav.offsetHeight : 0
}

/** Brings the target into view, centred (or from the top when it is taller than the viewport). Smooth only without reduced motion. */
export function scrollTargetIntoView(el: HTMLElement) {
  if (typeof el.scrollIntoView !== 'function') return
  const tall = el.getBoundingClientRect().height > window.innerHeight * 0.6
  el.scrollIntoView({ block: tall ? 'start' : 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}
