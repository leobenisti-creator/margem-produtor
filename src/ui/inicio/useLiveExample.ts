import { useMemo } from 'react'
import { CROPS } from '../../engine/crops'
import { computeResult, type FarmInputs, type Result, type Scenario } from '../../engine/calc'
import { buildMatrix, DEFAULT_STEPS_PCT, toneFor, type Matrix, type Tone } from '../../engine/matrix'
import { analyzeTarget, type TargetAnalysis } from '../../engine/targetAnalysis'
import type { MarketSnapshot, Quote } from '../../data/types'
import { initialState, reducer } from '../../state/reducer'
import { fobBasisUsc } from '../../state/basis'
import { useStore } from '../../state/StoreProvider'
import { latestAsOf } from '../Ticker'
import { EXAMPLE_ADUBACAO_BRL_HA, EXAMPLE_COST_BY_GROUP, EXAMPLE_FARM } from './exampleFarm'

/** Ponto FOB of the example (spec §9): its (provisional) base. The farm itself is the illustrative one in exampleFarm.ts. */
export const EXAMPLE_FOB_ID = 'sorriso'
export const EXAMPLE_LABEL = 'Soja · Sorriso (MT)'
/** FOB Sorriso base for soja (US¢/bu), the base of the example scenario. */
const EXAMPLE_BASIS_USC = fobBasisUsc({ crop: 'soja', fobId: EXAMPLE_FOB_ID, customBasisUsc: null })
/** Neutral line shown instead of numbers when the dollar or the CBOT is unusable. */
export const MARKET_UNAVAILABLE = 'Dólar ou CBOT indisponível: não dá para calcular os cenários agora.'
const CROP = CROPS.soja

export interface MetaCard {
  /** Target in whole percent (multiple of 5). */
  targetPct: number
  analysis: TargetAnalysis | null
}

export interface LiveExample {
  regionLabel: string
  marginPerSc: number | null
  farmPrice: number | null
  costPerSc: number | null
  /** Latest closing date among CBOT and dólar (ISO). */
  asOf: string
  /** True when any shown quote is not live (closing or manual). */
  stale: boolean
  marginPct: number | null
  inputs: FarmInputs
  scenario: Scenario
  result: Result
  /** Null when the market dollar or the CBOT is unusable (≤ 0 or not a number). */
  matrix: Matrix | null
  /** Adubação items of the illustrative example farm (R$/ha). */
  adubacao: { corretivos: number | null; macro: number | null; micro: number | null; total: number | null }
  why: {
    /** R$/sc the margin gains with the dollar R$ 0,25 higher. */
    fxUpMarginPerSc: number | null
    /** R$/sc the cost per sack falls with 3 sc/ha more. */
    yieldUpCostDropPerSc: number | null
    /** Adubação share of the cost per ha (fraction). */
    adubacaoShare: number | null
  }
  meta: { below: MetaCard; above: MetaCard }
}

const fin = (n: number | null | undefined): number | null =>
  typeof n === 'number' && Number.isFinite(n) ? n : null

const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b)

/**
 * Target for the "abaixo da meta" card = next multiple of 5 p.p. at or above margin + 3 p.p.;
 * "acima da meta" card = previous multiple of 5 p.p. at or below margin − 3 p.p.; both ≥ 5%.
 */
export function metaTargets(marginPct: number): { below: number; above: number } {
  const mp = marginPct * 100
  const eps = 1e-9
  const below = Math.max(5, Math.ceil((mp + 3) / 5 - eps) * 5)
  const above = Math.max(5, Math.floor((mp - 3) / 5 + eps) * 5)
  return { below, above }
}

function exampleInputs(snapshot: MarketSnapshot): FarmInputs {
  // The store's own defaults (port fees, margin base) via the pure reducer, on top of the illustrative farm.
  let s = initialState(snapshot)
  s = reducer(s, { type: 'setCrop', crop: 'soja' })
  s = reducer(s, { type: 'setFob', fobId: EXAMPLE_FOB_ID })
  return {
    ...s.inputs,
    areaHa: EXAMPLE_FARM.areaHa,
    yieldScHa: EXAMPLE_FARM.yieldScHa,
    costPerHaBrl: EXAMPLE_FARM.costPerHaBrl,
    freightBrlPerSc: EXAMPLE_FARM.freightBrlPerSc,
    targetMargin: null,
  }
}

/** True when the dollar and the CBOT can build a matrix (both finite and > 0). */
export function marketUsable(s: Scenario): boolean {
  return Number.isFinite(s.fx) && s.fx > 0 && Number.isFinite(s.cbotUsc) && s.cbotUsc > 0
}

/** The example matrix, or null when the market is unusable (never throws). */
function safeMatrix(scenario: Scenario, inputs: FarmInputs): Matrix | null {
  if (!marketUsable(scenario)) return null
  try {
    return buildMatrix(CROP, scenario, inputs, { stepsPct: DEFAULT_STEPS_PCT, yieldFactor: 1, includeSold: true })
  } catch {
    return null
  }
}

function metaCard(scenario: Scenario, inputs: FarmInputs, targetPct: number): MetaCard {
  const i = { ...inputs, targetMargin: targetPct / 100 }
  const m = safeMatrix(scenario, i)
  if (m === null) return { targetPct, analysis: null }
  try {
    return { targetPct, analysis: analyzeTarget(CROP, scenario, i, m) }
  } catch {
    return { targetPct, analysis: null }
  }
}

/** Pure: the Início example computed by the engine from a market snapshot. */
export function buildLiveExample(snapshot: MarketSnapshot): LiveExample {
  const cbot = snapshot.cbotUsc.soja
  const fx = snapshot.fx
  const shown: Quote[] = [cbot, fx]
  const scenario: Scenario = {
    cbotUsc: cbot.value,
    basisUsc: EXAMPLE_BASIS_USC,
    fx: fx.value,
  }
  const inputs = exampleInputs(snapshot)
  const result = computeResult(CROP, scenario, inputs)
  const matrix = safeMatrix(scenario, inputs)

  const fxUp = computeResult(CROP, { ...scenario, fx: scenario.fx + 0.25 }, inputs)
  const yieldUp = computeResult(CROP, scenario, { ...inputs, yieldScHa: inputs.yieldScHa + 3 })
  const adub = fin(EXAMPLE_COST_BY_GROUP.fertilizantes)

  const m = fin(result.marginPct)
  const targets = metaTargets(m ?? 0)

  return {
    regionLabel: EXAMPLE_LABEL,
    marginPerSc: fin(result.marginPerSc),
    farmPrice: fin(result.farmPriceBrl),
    costPerSc: fin(result.costPerSc),
    asOf: latestAsOf(shown) || cbot.asOf,
    stale: shown.some((q) => q.kind !== 'ao_vivo'),
    marginPct: m,
    inputs,
    scenario,
    result,
    matrix,
    adubacao: {
      corretivos: fin(EXAMPLE_ADUBACAO_BRL_HA.corretivos),
      macro: fin(EXAMPLE_ADUBACAO_BRL_HA.macro),
      micro: fin(EXAMPLE_ADUBACAO_BRL_HA.micro),
      total: adub,
    },
    why: {
      fxUpMarginPerSc: diff(fin(fxUp.marginPerSc), fin(result.marginPerSc)),
      yieldUpCostDropPerSc: diff(fin(result.costPerSc), fin(yieldUp.costPerSc)),
      adubacaoShare: adub !== null && inputs.costPerHaBrl > 0 ? adub / inputs.costPerHaBrl : null,
    },
    meta: {
      below: metaCard(scenario, inputs, targets.below),
      above: metaCard(scenario, inputs, targets.above),
    },
  }
}

/** Margin of the example at another dollar / CBOT (in memory only; same engine and inputs as the example). */
export function exampleMarginAt(
  ex: LiveExample,
  fx: number,
  cbotUsc: number,
): { marginPerSc: number | null; marginPct: number | null; farmPrice: number | null; tone: Tone } {
  const r = computeResult(CROP, { ...ex.scenario, fx, cbotUsc }, ex.inputs)
  const marginPct = fin(r.marginPct)
  return {
    marginPerSc: fin(r.marginPerSc),
    marginPct,
    farmPrice: fin(r.farmPriceBrl),
    tone: toneFor(marginPct, ex.inputs.targetMargin),
  }
}

/** The Início example ("Soja · Sorriso (MT)") recomputed whenever the store snapshot changes. */
export function useLiveExample(): LiveExample {
  const { snapshot } = useStore()
  return useMemo(() => buildLiveExample(snapshot), [snapshot])
}
