import { useMemo } from 'react'
import { todayIso } from '../engine/calendar'
import { activeHedge, opsForCrop, type HedgeSpec } from '../engine/hedge'
import { useStore } from '../state/StoreProvider'

/**
 * The market operations of the crop on screen as the engine reads them: the valid ones, today's market dollar, the date
 * of today and the price history (to know what expired, what was knocked out and what already settled).
 * undefined when there is no valid operation.
 */
export function useHedgeSpec(): HedgeSpec | undefined {
  const { state, snapshot } = useStore()
  const today = snapshot.today ?? todayIso()
  const marketFx = snapshot.fx.value
  const history = snapshot.history
  return useMemo(
    () => activeHedge(opsForCrop(state.hedgeOps, state.crop), marketFx, { today, history, crop: state.crop }),
    [state.hedgeOps, state.crop, marketFx, today, history],
  )
}

/**
 * Same operations, but to tell what still protects (status only, no money): it does not need a usable market dollar,
 * so an expired or knocked-out operation never counts as protection because the dollar is missing.
 */
export function useCoverSpec(): HedgeSpec | undefined {
  const { state, snapshot } = useStore()
  const today = snapshot.today ?? todayIso()
  const fx = snapshot.fx.value
  const marketFx = Number.isFinite(fx) && fx > 0 ? fx : 1
  const history = snapshot.history
  return useMemo(
    () => activeHedge(opsForCrop(state.hedgeOps, state.crop), marketFx, { today, history, crop: state.crop }),
    [state.hedgeOps, state.crop, marketFx, today, history],
  )
}
