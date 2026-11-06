import { initialState, reducer } from '../state/reducer'
import { saveState } from '../state/persist'
import type { Action, AppState } from '../state/types'
import type { MarketSnapshot } from '../data/types'

/** matchMedia stub: every query reports `matches` (false = mobile layout, true = desktop). */
export function mockMatchMedia(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

export function removeMatchMedia() {
  // jsdom ships without matchMedia; make that explicit regardless of earlier stubs.
  ;(window as unknown as { matchMedia?: unknown }).matchMedia = undefined
}

/**
 * The numeric fixture of the tests written before the app started empty: 1000 ha, 60.4 sc/ha, R$ 6.383,44/ha
 * split in the eight groups, freight R$ 27,6762/sc, at a typed FOB base of 61,7 US¢/bu ("Outro"). Every value is
 * typed through the reducer's own actions, exactly as a producer would; the app itself starts at zero.
 */
export const LEGACY_EXAMPLE: Action[] = [
  { type: 'setInput', key: 'areaHa', value: 1000 },
  { type: 'setInput', key: 'yieldScHa', value: 60.4 },
  { type: 'setInput', key: 'freightBrlPerSc', value: 27.6762 },
  { type: 'setCategory', id: 'sementes', value: 475.34 },
  { type: 'setCategory', id: 'fertilizantes', value: 2150.85 },
  { type: 'setCategory', id: 'defensivos', value: 1089.84 },
  { type: 'setCategory', id: 'operacoes', value: 839.26 },
  { type: 'setCategory', id: 'maoDeObra', value: 407.37 },
  { type: 'setCategory', id: 'arrendamento', value: 487.92 },
  { type: 'setCategory', id: 'financeiro', value: 458.63 },
  { type: 'setCategory', id: 'outros', value: 474.23 },
  { type: 'setInput', key: 'costPerHaBrl', value: 6383.44 },
  { type: 'setFob', fobId: 'outro' },
  // The fixture's base is the old snapshot base, whatever the FOB table says today (Paranaguá 3,5 since 04/11).
  { type: 'setCustomBasis', value: 61.7 },
]

/** `initialState` with the LEGACY_EXAMPLE values typed (see LEGACY_EXAMPLE). */
export function legacyState(snapshot?: MarketSnapshot): AppState {
  return LEGACY_EXAMPLE.reduce(reducer, initialState(snapshot))
}

/** Persists a state (tourSeen true by default) so the app boots straight into it. */
export function seedState(actions: Action[] = [], tourSeen = true): AppState {
  const s = { ...actions.reduce(reducer, initialState()), tourSeen }
  saveState(s)
  return s
}
