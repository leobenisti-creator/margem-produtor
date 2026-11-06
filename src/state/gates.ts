import type { Journey } from './journey'

/**
 * The switch for every lock of the journey (the Comercialização and Resultados locks, their padlocks in the menus, the empty state and the greyed
 * buttons all go through here). Off while developing (`npm run dev`), on in the production build, so whoever is building
 * the site is never blocked. `localStorage['margem:gates']` overrides the default: 'on' shows the locked experience,
 * 'off' removes the locks (e.g. in a preview build).
 */
export const GATES_KEY = 'margem:gates'

export function gatesEnabled(): boolean {
  try {
    const v = window.localStorage.getItem(GATES_KEY)
    if (v === 'on') return true
    if (v === 'off') return false
  } catch {
    // storage blocked: fall back to the default
  }
  return !import.meta.env.DEV
}

/** The pages that stay closed until the producer fills the farm and the cost per hectare. */
export const GATED_ROUTES = ['comercializacao', 'resultados'] as const
export type GatedRoute = (typeof GATED_ROUTES)[number]

/**
 * Comercialização and Resultados need the farm (area, productivity) and the cost per hectare filled by the producer.
 * Início and Lavoura e custos are never locked. Always unlocked while the gates are off.
 */
export function pageLocked(route: string, journey: Pick<Journey, 'hasFarm' | 'hasCosts'>): boolean {
  if (!(GATED_ROUTES as readonly string[]).includes(route)) return false
  return gatesEnabled() && !(journey.hasFarm && journey.hasCosts)
}

/** Kept for older callers: Resultados lock. */
export function resultsLocked(journey: Pick<Journey, 'hasFarm' | 'hasCosts'>): boolean {
  return pageLocked('resultados', journey)
}

/** Short reason written next to a locked Resultados ("Falta: área, produtividade"). */
export function lockReason(journey: Pick<Journey, 'missing'>): string {
  return journey.missing.length > 0 ? `Falta: ${journey.missing.join(', ')}` : 'Preencha Lavoura e custos primeiro'
}
