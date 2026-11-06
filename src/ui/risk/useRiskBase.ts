import { useMemo } from 'react'
import type { Scenario } from '../../engine/calc'
import { CROPS } from '../../engine/crops'
import type { RiskCtx } from '../../engine/riskSim'
import { scenarioBasisUsc } from '../../state/basis'
import { useStore } from '../../state/StoreProvider'
import { useHedgeSpec } from '../useHedgeSpec'
import { useSales } from '../useSales'

/**
 * TODAY's position for the "Seu risco" tab, never the scenario chosen in the matrix: the snapshot CBOT and dollar (the
 * matrix writes its choice to `state.overrides`, which is not read here) and the basis of "Lavoura e custos", with the
 * farm inputs and sales as stored (no Comercialização "what if" either).
 *
 * The single place to adjust: `todayBasisUsc` is the only line that depends on how the matrix simulation of the basis
 * is stored. Today `overrides.basisUsc` is shared between that simulation and the premium typed in Lavoura e custos;
 * once the simulation has its own field, this must read the Lavoura premium only (`scenarioBasisUsc` already is that).
 */
export function useRiskBase(): RiskCtx {
  const { state, snapshot } = useStore()
  const hedge = useHedgeSpec()
  const { tranches } = useSales()
  const crop = CROPS[state.crop]
  const cbotUsc = snapshot.cbotUsc[crop.id].value
  const fx = snapshot.fx.value
  const todayBasisUsc = scenarioBasisUsc(state)
  const base = useMemo<Scenario>(() => ({ cbotUsc, basisUsc: todayBasisUsc, fx }), [cbotUsc, todayBasisUsc, fx])
  const inputs = useMemo(() => ({ ...state.inputs, ...(hedge !== undefined && { hedge }) }), [state.inputs, hedge])
  return useMemo(() => ({ crop, base, inputs, tranches }), [crop, base, inputs, tranches])
}
