import { useMemo } from 'react'
import { journeyOf, type Journey } from '../state/journey'
import { useStore } from '../state/StoreProvider'

/** How far the visitor is in the app (see `journeyOf`); read-only. */
export function useJourneyState(): Journey {
  const { state } = useStore()
  return useMemo(() => journeyOf(state), [state])
}
