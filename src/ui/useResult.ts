import { useCallback, useMemo } from 'react'
import { computeResult, type CostUsdLine, type FarmInputs, type Result, type Scenario } from '../engine/calc'
import { CROPS, type CropConfig } from '../engine/crops'
import { brlToUsd, usdToBrl } from '../engine/units'
import { useStore } from '../state/StoreProvider'
import { useHedgeSpec } from './useHedgeSpec'
import { useWhatIf } from './whatIf'

export interface UseResult {
  result: Result
  /**
   * Engine inputs: `costPerHaBrl` is the fixed R$ part; US$ costs are in `costUsd` and the rent
   * typed in sc/ha in `costScHa` (the engine values both per scenario/cell).
   */
  farmInputs: FarmInputs
  /** US$ cost lines (US$/ha, never converted here); folded by the engine at the scenario dollar. */
  usdLines: CostUsdLine[]
  /** sc/ha of the arrendamento typed in sacks (0 when not used). */
  arrendamentoScHa: number
  /** True when a rent in sc/ha cannot be valued (no usable farm price): the cost per sack is then null. */
  scHaUnconverted: boolean
  scenario: Scenario
  crop: CropConfig
  currency: 'BRL' | 'USD'
  fx: number
  areaUnit: 'scHa' | 'tHa'
  /** BRL to the display currency, using the scenario dollar. */
  toDisplay: (brl: number | null) => number | null
  /** Display currency to BRL (what gets stored); null when the dollar is unusable in US$ mode. */
  fromDisplayMoney: (v: number) => number | null
  /** US$ mode with a missing/invalid dollar: money inputs cannot be converted and are disabled. */
  usdBlocked: boolean
}

/** The only place that turns store state into engine inputs. */
export function useResult(): UseResult {
  const { state, scenario: storeScenario } = useStore()
  const crop = CROPS[state.crop]
  // Comercialização's temporary "what if" (yield, freight, port fees, premium) overlays the stored values.
  const { values: sim } = useWhatIf()
  // The store keeps the fixed R$ part, the US$ lines and the sc/ha rent; the engine values them.
  const hedge = useHedgeSpec()
  const farmInputs: FarmInputs = useMemo(
    () => ({
      ...state.inputs,
      ...(hedge !== undefined && { hedge }),
      ...(sim.yieldScHa !== undefined && { yieldScHa: sim.yieldScHa }),
      ...(sim.freightBrlPerSc !== undefined && { freightBrlPerSc: sim.freightBrlPerSc }),
      ...(sim.portFeesBrlPerSc !== undefined && { portFeesBrlPerSc: sim.portFeesBrlPerSc }),
    }),
    [state.inputs, hedge, sim.yieldScHa, sim.freightBrlPerSc, sim.portFeesBrlPerSc],
  )
  const scenario: Scenario = useMemo(
    () => (sim.premiumUsc === undefined ? storeScenario : { ...storeScenario, basisUsc: sim.premiumUsc }),
    [storeScenario, sim.premiumUsc],
  )
  const result = useMemo(() => computeResult(crop, scenario, farmInputs), [crop, scenario, farmInputs])
  const arrendamentoScHa = farmInputs.costScHa
  const farmPrice = result.farmPriceBrl
  const scHaUnconverted = arrendamentoScHa > 0 && !(farmPrice !== null && farmPrice > 0)
  const { currency, areaUnit } = state
  const fx = scenario.fx

  const toDisplay = useCallback(
    (brl: number | null) => {
      if (brl === null || !Number.isFinite(brl)) return null
      if (currency === 'USD') return Number.isFinite(fx) && fx > 0 ? brlToUsd(brl, fx) : null
      return brl
    },
    [currency, fx],
  )
  const usdBlocked = currency === 'USD' && !(Number.isFinite(fx) && fx > 0)
  const fromDisplayMoney = useCallback(
    (v: number) => {
      if (currency === 'BRL') return v
      return Number.isFinite(fx) && fx > 0 ? usdToBrl(v, fx) : null
    },
    [currency, fx],
  )

  return {
    result,
    farmInputs,
    usdLines: farmInputs.costUsd,
    arrendamentoScHa,
    scHaUnconverted,
    scenario,
    crop,
    currency,
    fx,
    areaUnit,
    toDisplay,
    fromDisplayMoney,
    usdBlocked,
  }
}
