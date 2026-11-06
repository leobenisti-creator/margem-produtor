import { useMemo } from 'react'
import {
  barrierRisks,
  cbotCoverSplit,
  shortCallCaps,
  touchLossBrl,
  type BarrierRisk,
  type CallCap,
  type CoverSplit,
} from '../engine/barrierRisk'
import { CROPS } from '../engine/crops'
import { useStore } from '../state/StoreProvider'
import { useHedgeSpec } from './useHedgeSpec'

/** Final CBOT prices, as a fraction of today's, used to show how much a touched barrier would cost. */
export const TOUCH_LOSS_STEPS = [0.9, 0.8] as const

export interface TouchLoss {
  /** The CBOT the example ends the crop at (US¢/bu) and its distance from today's price (negative). */
  cbotUsc: number
  pct: number
  /** R$ of the whole position the knock-outs that still cover would take away (<= 0). */
  brl: number
}

export interface BarrierView {
  risks: BarrierRisk[]
  /** Knock-outs that still cover (the ones the notice is about). */
  atRisk: BarrierRisk[]
  caps: CallCap[]
  split: CoverSplit
  cbotToday: number
  /** The first example price at which touching a barrier costs something; null when it never does. */
  loss: TouchLoss | null
}

/**
 * The barrier operations of the crop on screen read as a risk: which covers end if the CBOT touches a barrier, the calls
 * sold that cap the gain, how much of the CBOT cover depends on a barrier and what a touched barrier would cost.
 * null when there is nothing to warn about.
 */
export function useBarrierRisk(): BarrierView | null {
  const { state, snapshot } = useStore()
  const spec = useHedgeSpec()
  const cbotToday = snapshot.cbotUsc[state.crop]?.value
  const fx = snapshot.fx.value
  const bps = CROPS[state.crop].bushelsPerSack
  return useMemo(() => {
    if (!spec || !Number.isFinite(cbotToday) || !(cbotToday > 0)) return null
    const risks = barrierRisks(spec, cbotToday, bps)
    const caps = shortCallCaps(spec, cbotToday, bps)
    if (risks.length === 0 && caps.length === 0) return null
    const atRisk = risks.filter((r) => r.atRisk)
    let loss: TouchLoss | null = null
    if (atRisk.length > 0 && Number.isFinite(fx) && fx > 0) {
      for (const f of TOUCH_LOSS_STEPS) {
        const brl = touchLossBrl(spec, cbotToday * f, fx)
        if (brl < -1) {
          loss = { cbotUsc: cbotToday * f, pct: f - 1, brl }
          break
        }
      }
    }
    return { risks, atRisk, caps, split: cbotCoverSplit(spec, bps), cbotToday, loss }
  }, [spec, cbotToday, fx, bps])
}
