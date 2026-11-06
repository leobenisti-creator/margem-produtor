import { useMemo } from 'react'
import { soldSummary, type SaleTranche, type SoldSummary } from '../engine/sales'
import { CROPS } from '../engine/crops'
import { grossProductionOf, normalizeBarter } from '../engine/production'
import { salesProductionSc } from '../state/sales'
import { useStore } from '../state/StoreProvider'

export interface UseSales {
  tranches: SaleTranche[]
  /** Production the tranches are measured against: the NET one, area × yield less the barter (null when unusable). */
  productionSc: number | null
  /** Sacks of the crop on screen delivered to the reseller (0 = no barter). */
  barterSc: number
  /** Area × yield before the barter (null when unusable); the "de Y sc" of the texts. */
  grossProductionSc: number | null
  /** Sum, weighted R$/sc, invalid tranches (with their pt-BR reason) and the over-production warning. */
  summary: SoldSummary
}

/** Shown instead of the % sold (and of the over-production warning) while there is no production. */
export const NO_PRODUCTION_TEXT = 'Informe área e produtividade para calcular o % vendido.'

/** Shown instead of it when the barter takes the whole crop (net production 0). */
export const BARTER_TAKES_ALL_TEXT =
  'As sacas do barter cobrem toda a produção: reduza o barter ou informe mais área/produtividade para calcular o % vendido.'

/** True while area × yield gives no production to measure the tranches against. */
export function lacksProduction(productionSc: number | null): boolean {
  return productionSc === null || !(productionSc > 0)
}

/** Sales tranches of the store with their summary for the current production. */
export function useSales(): UseSales {
  const { state } = useStore()
  const tranches = state.sales
  const productionSc = salesProductionSc(state)
  const barterSc = normalizeBarter(state.inputs.barterSc)
  const gross = grossProductionOf(state.inputs)
  const grossProductionSc = Number.isFinite(gross) && gross > 0 ? gross : null
  const bushelsPerSack = CROPS[state.crop].bushelsPerSack
  const summary = useMemo(
    () => soldSummary(tranches, productionSc, bushelsPerSack),
    [tranches, productionSc, bushelsPerSack],
  )
  return { tranches, productionSc, barterSc, grossProductionSc, summary }
}
