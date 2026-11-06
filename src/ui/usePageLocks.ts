import { lockReason, pageLocked } from '../state/gates'
import { useJourneyState } from './useJourneyState'

export interface PageLocks {
  /** Whether a page is locked right now (always false while developing; see `gatesEnabled`). */
  isLocked: (route: string) => boolean
  /** Short reason ("Falta: área, produtividade"). */
  reason: string
  /** What is still missing, in pt-BR. */
  missing: string[]
}

/** The locks of Comercialização and Resultados (both open once the farm and the cost per hectare are filled). */
export function usePageLocks(): PageLocks {
  const journey = useJourneyState()
  return { isLocked: (route) => pageLocked(route, journey), reason: lockReason(journey), missing: journey.missing }
}
