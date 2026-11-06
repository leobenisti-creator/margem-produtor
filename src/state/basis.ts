import { DEFAULT_FOB_ID, OUTRO_FOB_ID, findFob } from '../data/fobPoints'
import type { AppState } from './types'

type FobFields = Pick<AppState, 'crop' | 'fobId' | 'customBasisUsc'>

/**
 * Base (US¢/bu) of the chosen FOB point, without the own-price override: the typed base for
 * "Outro", the point's (provisional) base otherwise. `snapshot.basisUsc` is not used here.
 */
export function fobBasisUsc(s: FobFields): number {
  if (s.fobId === OUTRO_FOB_ID && s.customBasisUsc !== null) return s.customBasisUsc
  const point = s.fobId === OUTRO_FOB_ID ? findFob(DEFAULT_FOB_ID) : findFob(s.fobId)
  return point?.baseUsc[s.crop] ?? Number.NaN
}

/** Scenario base = own-price override (if any) ?? typed base ("Outro") ?? FOB point base. */
export function scenarioBasisUsc(s: FobFields & Pick<AppState, 'overrides'>): number {
  return s.overrides.basisUsc ?? fobBasisUsc(s)
}

