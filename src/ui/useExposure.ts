import { computeExposure, type Exposure } from '../engine/exposure'
import { CROPS } from '../engine/crops'
import { coverOps, opsForCrop } from '../engine/hedge'
import { useStore } from '../state/StoreProvider'
import { costCurrencyMix } from './costBreakdown'
import { useCoverSpec } from './useHedgeSpec'
import { useResult } from './useResult'
import { useSales } from './useSales'

/** The exposure of the whole crop (basis, CBOT, dollar) from the store: sales, market operations and open US$ costs. */
export function useExposure(): { exp: Exposure; hasProduction: boolean } {
  const { state } = useStore()
  const hedgeSpec = useCoverSpec()
  const { result, farmInputs, fx } = useResult()
  const { tranches, productionSc } = useSales()
  const areaHa = farmInputs.areaHa
  const hasProduction = productionSc !== null && productionSc > 0
  const farmPrice = result.farmPriceBrl
  const usdPerSc = farmPrice !== null && farmPrice > 0 && Number.isFinite(fx) && fx > 0 ? farmPrice / fx : null
  // The dollar of the costs only floats in "Por categoria"; on the single "Total" the cost is frozen in R$.
  const floats = state.costMode === 'categorias'
  const costsUsdOpen = floats ? costCurrencyMix(state, fx, farmPrice).usdOpenUsdHa * (areaHa > 0 ? areaHa : 0) : 0
  const exp: Exposure = hasProduction
    ? computeExposure({
        productionSc,
        areaHa,
        bushelsPerSack: CROPS[state.crop].bushelsPerSack,
        tranches,
        // Only what still protects: expired, closed, knocked-out and not-yet-active operations are out.
        hedgeOps: coverOps(opsForCrop(state.hedgeOps, state.crop), hedgeSpec),
        usdPerSc,
        costsUsdOpen,
      })
    : { ok: false }
  return { exp, hasProduction }
}
