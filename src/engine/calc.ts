import type { CropConfig } from './crops'
import { hedgeBrlAt, hedgeOpProblem, type HedgeSpec } from './hedge'
import { effectiveYieldScHa, normalizeBarter, productionOf } from './production'
import { SACK_TON } from './units'

export interface Scenario {
  cbotUsc: number
  basisUsc: number
  fx: number
}

export interface CostUsdLine {
  usdPerHa: number
  /** Fraction 0..1 of the line already bought at `boughtRate`. */
  boughtPct: number
  boughtRate: number
}

export interface FarmInputs {
  areaHa: number
  yieldScHa: number
  costPerHaBrl: number
  freightBrlPerSc: number
  portFeesBrlPerSc: number
  /** Fraction 0..1. */
  soldPct: number
  soldAvgPriceBrl: number
  /** Fraction 0.., or null when the client set no target (the default). */
  targetMargin: number | null
  marginBase: 'receita' | 'custo'
  /** Costs quoted in US$/ha, partly bought at a fixed rate. */
  costUsd: CostUsdLine[]
  /** Fraction 0..1 of the open volume with the dollar locked. */
  fxLockPct: number
  fxLockRate: number
  /**
   * Cost typed in sacks per hectare (rent): converted at each scenario's own farm price.
   * 0 = none (the neutral value; results are then exactly the same as without it).
   */
  costScHa: number
  /**
   * Sacks of the crop on screen delivered to the reseller (barter). They enter NO calculation: the production is
   * `max(0, area × yield − barterSc)` (see ./production). Absent = 0 (the neutral value).
   */
  barterSc?: number
  /**
   * Market operations (futures/options). Optional: without it (or with no valid operation) every number is the
   * same as before. Its R$ result is added to the revenue per sack; the physical prices do not change.
   */
  hedge?: HedgeSpec
}

export interface MarginResult {
  costPerSc: number | null
  marginPerSc: number | null
  marginPct: number | null
  marginPerHa: number | null
  marginTotal: number | null
  productionSc: number | null
  soldSc: number | null
  exposureSc: number | null
}

export interface ExplainStep {
  label: string
  formula: string
  /** null when the scenario is unusable (missing dollar/CBOT/base). */
  value: number | null
  unit: 'R$/sc' | 'R$/US$' | 'US$/bu' | '%' | 'R$/ha'
}

export interface Result extends MarginResult {
  /** The three price fields are null when cbot/base/fx is missing or fx/cbot <= 0. */
  referencePriceBrl: number | null
  farmPriceBrl: number | null
  minPriceBrl: number | null
  breakEven: { priceBrl: number | null; yieldScHa: number | null }
  blendedPriceBrl: number | null
  blendedMarginPct: number | null
  /** R$ result of the market operations for the whole production at the scenario (0 without hedge). */
  hedgeBrl: number
  /** hedgeBrl ÷ production (R$/sc); null when the production is unknown. */
  hedgePerSc: number | null
  steps: ExplainStep[]
}

/** Returns the number when finite, otherwise null (never NaN/Infinity). */
function fin(n: number): number | null {
  return Number.isFinite(n) ? n : null
}

/** True when there are net sacks per hectare to divide the cost by (gross yield less the barter, per ha). */
function hasYield(i: FarmInputs): boolean {
  const y = effectiveYieldScHa(i)
  return y > 0 && Number.isFinite(y)
}

function costPerSc(i: FarmInputs): number | null {
  return hasYield(i) ? fin(i.costPerHaBrl / effectiveYieldScHa(i)) : null
}

/** Blend of the locked rate and the market dollar: (1 − lock) × fx + lock × lockRate. */
export function effectiveFx(lockPct: number, lockRate: number, fx: number): number {
  // Part follows the market: an unusable market dollar gives NaN (results turn null, never understated).
  if (lockPct !== 1 && !(Number.isFinite(fx) && fx > 0)) return Number.NaN
  const market = lockPct === 1 ? 0 : (1 - lockPct) * fx
  const locked = lockPct === 0 ? 0 : lockPct * lockRate
  return market + locked
}

/** BRL cost per ha at a given market dollar, including the US$ lines. */
export function costPerHaAt(i: FarmInputs, fx: number): number {
  return i.costUsd.reduce(
    (sum, l) => sum + l.usdPerHa * effectiveFx(l.boughtPct, l.boughtRate, fx),
    i.costPerHaBrl,
  )
}

/** Same inputs with the US$ lines folded into `costPerHaBrl` (the sc/ha rent stays in `costScHa`). */
export function inputsAt(i: FarmInputs, fx: number): FarmInputs {
  return { ...i, costPerHaBrl: costPerHaAt(i, fx), costUsd: [] }
}

/**
 * R$/ha of the sc/ha rent at a farm price: 0 without rent (exact neutral case); NaN when there is
 * rent but the price is unusable (≤ 0 or not finite), so the cost per sack becomes null.
 */
export function rentBrlHa(costScHa: number, farmPrice: number): number {
  if (costScHa === 0) return 0
  return Number.isFinite(farmPrice) && farmPrice > 0 ? costScHa * farmPrice : Number.NaN
}

/** Inputs fully in R$/ha at a dollar and a farm price: US$ lines and the sc/ha rent folded in. */
export function inputsAtPrice(i: FarmInputs, fx: number, farmPrice: number): FarmInputs {
  const folded = inputsAt(i, fx)
  if (i.costScHa === 0) return folded
  return { ...folded, costPerHaBrl: folded.costPerHaBrl + rentBrlHa(i.costScHa, farmPrice), costScHa: 0 }
}

export function referencePriceBrl(crop: CropConfig, s: Scenario): number {
  return (s.cbotUsc / 100 + s.basisUsc / 100) * crop.bushelsPerSack * s.fx
}

/** FOB in US$/sc: (CBOT + basis) in US¢/bu ÷ 100 × bushels per sack. Independent of the dollar. */
export function fobUsdPerSc(crop: CropConfig, s: Pick<Scenario, 'cbotUsc' | 'basisUsc'>): number {
  return ((s.cbotUsc + s.basisUsc) / 100) * crop.bushelsPerSack
}

/** Port fees in R$/t (the stored R$/sc ÷ SACK_TON), the unit they are usually quoted in. */
export function portFeesBrlPerTon(i: Pick<FarmInputs, 'portFeesBrlPerSc'>): number {
  return i.portFeesBrlPerSc / SACK_TON
}

export function farmPriceBrl(crop: CropConfig, s: Scenario, i: FarmInputs): number {
  const fx = effectiveFx(i.fxLockPct, i.fxLockRate, s.fx)
  return (
    referencePriceBrl(crop, { ...s, fx }) - i.freightBrlPerSc - i.portFeesBrlPerSc
  )
}

/**
 * The producer's basis: the farm price minus the CBOT price, both in R$/sc at the same (effective) dollar.
 * It is the premium of the praça less freight and port fees. `uscPerBu` is the same amount in US¢/bu.
 * Null when the scenario is unusable (no dollar/CBOT).
 */
export function basisSummary(
  crop: CropConfig,
  s: Scenario,
  i: FarmInputs,
): { brlPerSc: number; uscPerBu: number } | null {
  if (!usableScenario(s)) return null
  const fx = effectiveFx(i.fxLockPct, i.fxLockRate, s.fx)
  if (!(Number.isFinite(fx) && fx > 0)) return null
  const farm = farmPriceBrl(crop, s, i)
  const cbotBrl = (s.cbotUsc / 100) * crop.bushelsPerSack * fx
  const brlPerSc = fin(farm - cbotBrl)
  if (brlPerSc === null) return null
  const uscPerBu = fin((brlPerSc / (crop.bushelsPerSack * fx)) * 100)
  return uscPerBu === null ? null : { brlPerSc, uscPerBu }
}

/**
 * Hedge at a settle price and dollar for the inputs' production: R$ for the whole position and per sack.
 * `active` is false without a valid operation (nothing may be added to the price then: same code path as before).
 */
export function hedgeAt(
  i: FarmInputs,
  cbotUsc: number,
  fx: number,
): { active: boolean; brl: number; perSc: number | null } {
  const production = productionOf(i)
  const known = Number.isFinite(production) && production > 0
  const spec = i.hedge
  if (!spec || !spec.ops.some((o) => hedgeOpProblem(o) === null)) return { active: false, brl: 0, perSc: known ? 0 : null }
  const brl = hedgeBrlAt(spec, cbotUsc, fx)
  return { active: true, brl, perSc: known ? fin(brl / production) : null }
}

export function marginFromPrice(priceBrl: number, i: FarmInputs): MarginResult {
  const cost = costPerSc(i)
  if (cost === null) {
    return {
      costPerSc: null,
      marginPerSc: null,
      marginPct: null,
      marginPerHa: null,
      marginTotal: null,
      productionSc: null,
      soldSc: null,
      exposureSc: null,
    }
  }
  const marginPerSc = fin(priceBrl - cost)
  const denominator = i.marginBase === 'receita' ? priceBrl : cost
  const marginPct =
    marginPerSc === null || !(denominator > 0) ? null : fin(marginPerSc / denominator)
  const marginPerHa = marginPerSc === null ? null : fin(marginPerSc * effectiveYieldScHa(i))
  const hasArea = i.areaHa > 0 && Number.isFinite(i.areaHa)
  const productionSc = hasArea ? fin(productionOf(i)) : null
  const soldSc = productionSc === null ? null : fin(productionSc * i.soldPct)
  return {
    costPerSc: cost,
    marginPerSc,
    marginPct,
    marginPerHa,
    marginTotal: hasArea && marginPerHa !== null ? fin(marginPerHa * i.areaHa) : null,
    productionSc,
    soldSc,
    exposureSc: productionSc === null || soldSc === null ? null : fin(productionSc - soldSc),
  }
}

/** Null means no target set, unreachable ("inatingível") or no yield. */
export function minPriceForTarget(i: FarmInputs): number | null {
  const target = i.targetMargin
  if (target === null) return null
  const cost = costPerSc(i)
  if (cost === null) return null
  if (i.marginBase === 'receita') {
    if (!(target < 1)) return null
    return fin(cost / (1 - target))
  }
  return fin(cost * (1 + target))
}

export function breakEven(
  priceBrl: number,
  i: FarmInputs,
): { priceBrl: number | null; yieldScHa: number | null } {
  return {
    priceBrl: costPerSc(i),
    // Net sacks per ha that pay the cost, plus the barter sacks per ha: the (gross) productivity that breaks even.
    yieldScHa:
      hasYield(i) && priceBrl > 0
        ? fin(i.costPerHaBrl / priceBrl + (i.areaHa > 0 ? normalizeBarter(i.barterSc) / i.areaHa : 0))
        : null,
  }
}

/**
 * Exact minimum price and break-even price with a rent typed in sc/ha (R), whose R$ value moves
 * with the price itself. Cfix = cost per ha without the rent, y = yield, t = target:
 * break-even = Cfix / (y − R); revenue base P = Cfix / (y(1 − t) − R);
 * cost base P = (1 + t) × Cfix / (y − R(1 + t)). Null when the denominator is ≤ 0 or not finite.
 */
function rentPrices(fixed: FarmInputs): { minPrice: number | null; breakEven: number | null } {
  const cfix = fixed.costPerHaBrl
  const y = effectiveYieldScHa(fixed)
  const rent = fixed.costScHa
  if (!hasYield(fixed) || !Number.isFinite(cfix) || !Number.isFinite(rent)) {
    return { minPrice: null, breakEven: null }
  }
  const solve = (num: number, den: number): number | null =>
    Number.isFinite(den) && den > 0 ? fin(num / den) : null
  const t = fixed.targetMargin
  let minPrice: number | null = null
  if (t !== null && Number.isFinite(t)) {
    minPrice =
      fixed.marginBase === 'receita'
        ? t < 1
          ? solve(cfix, y * (1 - t) - rent)
          : null
        : solve((1 + t) * cfix, y - rent * (1 + t))
  }
  return { minPrice, breakEven: solve(cfix, y - rent) }
}

export function blendedPriceBrl(todayPriceBrl: number, i: FarmInputs): number {
  return i.soldPct * i.soldAvgPriceBrl + (1 - i.soldPct) * todayPriceBrl
}

function usableScenario(s: Scenario): boolean {
  return (
    Number.isFinite(s.cbotUsc) &&
    s.cbotUsc > 0 &&
    Number.isFinite(s.basisUsc) &&
    Number.isFinite(s.fx) &&
    s.fx > 0
  )
}

export function computeResult(crop: CropConfig, s: Scenario, i: FarmInputs): Result {
  const ok = usableScenario(s)
  const locked = i.fxLockPct > 0
  const effFx = effectiveFx(i.fxLockPct, i.fxLockRate, s.fx)
  const reference = ok ? fin(referencePriceBrl(crop, s)) : null
  const farm = reference === null ? null : fin(farmPriceBrl(crop, s, i))
  // The sc/ha rent is valued at this scenario's own farm price.
  const ci = inputsAtPrice(i, s.fx, farm ?? Number.NaN)
  // NaN here only flows into marginFromPrice/breakEven, which turn it into nulls.
  const hedge = ok ? hedgeAt(ci, s.cbotUsc, s.fx) : { active: false, brl: 0, perSc: null as number | null }
  const add = hedge.active && hedge.perSc !== null ? hedge.perSc : null
  const margin = marginFromPrice(add === null ? (farm ?? Number.NaN) : (farm ?? Number.NaN) + add, ci)
  const blended = farm === null ? null : fin(blendedPriceBrl(farm, ci))
  const blendedEff = blended === null || add === null ? blended : fin(blended + add)
  const be = breakEven(farm ?? Number.NaN, ci)
  // With rent in sc/ha the R$ cost moves with the price: use the closed forms (exact).
  // Without rent (costScHa = 0) the old path is kept untouched.
  const exact = i.costScHa === 0 ? null : rentPrices(inputsAt(i, s.fx))
  if (exact !== null) be.priceBrl = exact.breakEven
  // With a lock the reference is shown at the effective dollar, so the chain adds up.
  const referenceShown = ok && locked ? fin(referencePriceBrl(crop, { ...s, fx: effFx })) : reference
  const baseBu = ok ? fin((s.cbotUsc + s.basisUsc) / 100) : null

  const steps: ExplainStep[] = [
    {
      label: 'Prêmio + CBOT',
      formula: '(CBOT + prêmio) ÷ 100',
      value: baseBu,
      unit: 'US$/bu',
    },
    {
      label: 'Preço de referência',
      formula: `(CBOT + prêmio) ÷ 100 × ${crop.bushelsPerSack} × dólar`,
      value: referenceShown,
      unit: 'R$/sc',
    },
    ...(locked && ok
      ? [
          {
            label: 'Dólar efetivo',
            formula: '(1 − trava) × dólar + trava × dólar travado',
            value: fin(effFx),
            unit: 'R$/US$' as const,
          },
        ]
      : []),
    {
      label: 'Menos frete',
      formula: 'frete R$/sc',
      value: fin(-i.freightBrlPerSc),
      unit: 'R$/sc',
    },
    {
      label: 'Menos taxas de porto',
      formula: 'taxas R$/sc',
      value: fin(-i.portFeesBrlPerSc),
      unit: 'R$/sc',
    },
    {
      label: 'Preço na fazenda',
      formula: 'referência − frete − taxas',
      value: farm,
      unit: 'R$/sc',
    },
  ]
  if (add !== null) {
    steps.push({
      label: 'Resultado das operações',
      formula: 'resultado das operações ÷ produção',
      value: add,
      unit: 'R$/sc',
    })
  }
  if (margin.costPerSc !== null) {
    steps.push({
      label: 'Custo por saca',
      formula: 'custo/ha ÷ produtividade',
      value: margin.costPerSc,
      unit: 'R$/sc',
    })
  }
  if (margin.marginPerSc !== null) {
    steps.push({
      label: 'Margem por saca',
      formula: add === null ? 'preço na fazenda − custo/sc' : 'preço na fazenda + operações − custo/sc',
      value: margin.marginPerSc,
      unit: 'R$/sc',
    })
  }

  return {
    ...margin,
    referencePriceBrl: reference,
    farmPriceBrl: farm,
    minPriceBrl: exact === null ? minPriceForTarget(ci) : exact.minPrice,
    breakEven: be,
    blendedPriceBrl: blended,
    blendedMarginPct: blendedEff === null ? null : marginFromPrice(blendedEff, ci).marginPct,
    hedgeBrl: hedge.brl,
    hedgePerSc: hedge.perSc,
    steps,
  }
}
