import { useMemo } from 'react'
import { buildTargetReport, type TargetReport } from '../../engine/targetReport'
import { useStore } from '../../state/StoreProvider'
import { fmtCompactMoney, fmtSignedMoney } from '../fmtExtra'
import { useResult } from '../useResult'
import { useResultadosBase } from '../useResultadosBase'
import type { Money } from './targetText'

/**
 * The target analysis of the scenario on screen (the one the hero and the DRE show: today's market unless the producer
 * picked another cell), with the grid centred on today's market and sized as the Resultados matrix. Null without a
 * target or while the numbers cannot be computed.
 */
export function useTargetReport(): { report: TargetReport | null; money: Money; custom: boolean } {
  const { state } = useStore()
  const { crop, today, chosen, custom, basisSimulated, inputs, tranches } = useResultadosBase()
  const { currency, toDisplay } = useResult()
  const { cbotPct, fxPct } = state.matrix.resultSteps
  const report = useMemo(() => {
    try {
      return buildTargetReport(crop, chosen, today, inputs, tranches, { cbotPct, fxPct })
    } catch {
      return null
    }
  }, [crop, chosen, today, inputs, tranches, cbotPct, fxPct])

  const money = useMemo<Money>(() => {
    const brl = (n: number | null, digits = 2) => fmtSignedMoney(toDisplay(n), currency, digits)
    return {
      brl,
      signed: (n, digits = 2) => {
        const v = toDisplay(n)
        return v !== null && v > 0 ? `+${fmtSignedMoney(v, currency, digits)}` : fmtSignedMoney(v, currency, digits)
      },
      compact: (n) => fmtCompactMoney(toDisplay(n), currency),
    }
  }, [toDisplay, currency])
  return { report, money, custom: custom || basisSimulated }
}
