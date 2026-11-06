import { useMemo } from 'react'
import type { FarmInputs, Scenario } from '../engine/calc'
import type { CropConfig } from '../engine/crops'
import type { SaleTranche } from '../engine/sales'
import { useResult } from './useResult'
import { useSales } from './useSales'
import { scenarioBasisUsc } from '../state/basis'
import { useStore } from '../state/StoreProvider'

export interface ResultadosBase {
  crop: CropConfig
  /**
   * Today's market: the snapshot CBOT and dollar and the basis in use (the basis of the Lavoura e custos). The centre of the matrix and the base of the ready-made scenarios and of the bridge.
   */
  today: Scenario
  /** The scenario the producer chose (a click in the matrix or in the ready-made scenarios), today's when none. */
  chosen: Scenario
  /** True when the chosen scenario moves CBOT or dollar away from today. */
  custom: boolean
  /** True when the chosen scenario carries a simulated basis (it never changes the one in Lavoura e custos). */
  basisSimulated: boolean
  /** Farm inputs (with the operations spec) and the sales, as the engines read them. */
  inputs: FarmInputs
  tranches: SaleTranche[]
}

/** The shared starting point of the cards of the Resultados financeiros page. */
export function useResultadosBase(): ResultadosBase {
  const { state, snapshot } = useStore()
  const { farmInputs, scenario, crop } = useResult()
  const { tranches } = useSales()
  const cbot = snapshot.cbotUsc[crop.id].value
  const fx = snapshot.fx.value
  // The simulated basis (Resultados) moves the chosen scenario, not "today": the centre of the matrix keeps the basis
  // of Lavoura e custos.
  const basisSimulated = state.overrides.simBasisUsc !== undefined
  const basis = basisSimulated ? scenarioBasisUsc(state) : scenario.basisUsc
  const today = useMemo<Scenario>(() => ({ cbotUsc: cbot, basisUsc: basis, fx }), [cbot, basis, fx])
  const custom = state.overrides.cbotUsc !== undefined || state.overrides.fx !== undefined
  return {
    crop,
    today,
    chosen: scenario,
    custom,
    basisSimulated,
    inputs: farmInputs,
    tranches,
  }
}
