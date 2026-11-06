/**
 * "Seu risco": what moves the margin of TODAY's position, driver by driver. Pure: no store, no React.
 *
 * It builds on the real engines (`marginParts` / `marginAt` of sensitivity.ts, `computeResult`, `effectiveFx`,
 * `farmBasisBrlSc`): every number is the full calculation at a scenario, never a linear shortcut, once with everything
 * the producer fixed ("com suas travas") and once as if nothing were fixed ("sem nada travado").
 *
 * Moves: the dollar and the CBOT move in % of today's level (multiplicative); the basis moves in R$/sc (additive, on the
 * producer's basis = farm price - CBOT). A basis move of x R$/sc is turned into US¢/bu with the dollar the farm price of
 * each calculation really uses (the effective one with a dollar lock, the market one without it), so the farm basis
 * changes by exactly x in both lines.
 */
import { computeResult, effectiveFx, type FarmInputs, type Scenario } from './calc'
import type { CropConfig } from './crops'
import { effectiveYieldScHa } from './production'
import { basisBrlPerCent, farmBasisBrlSc } from './scenarioMatrix'
import { ALL_FIXED, NOTHING_FIXED, marginParts, type MarginParts } from './sensitivity'
import type { SaleTranche } from './sales'

export type RiskDriver = 'dolar' | 'cbot' | 'basis'
export const RISK_DRIVERS: readonly RiskDriver[] = ['dolar', 'cbot', 'basis']

/** Today's position as the engines read it. */
export interface RiskCtx {
  crop: CropConfig
  /** Today's market: snapshot CBOT and dollar, and the producer's basis (US¢/bu). */
  base: Scenario
  inputs: FarmInputs
  tranches: SaleTranche[]
}

/** Slider limits per driver: % of today's level (dollar, CBOT) or R$/sc (basis). */
export const SIM_RANGE: Record<RiskDriver, { min: number; max: number; step: number }> = {
  dolar: { min: -100, max: 100, step: 0.5 },
  cbot: { min: -100, max: 100, step: 0.5 },
  basis: { min: -20, max: 20, step: 0.5 },
}

/** Half range of the chart around today: % (dollar, CBOT) or R$/sc (basis). */
export const CHART_HALF: Record<RiskDriver, number> = { dolar: 25, cbot: 25, basis: 15 }
export const CHART_POINTS = 41

const finite = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)

/** Inputs as one of the two calculations reads them (the dollar lock only counts when the fixings count). */
function modeInputs(inputs: FarmInputs, fixed: boolean): FarmInputs {
  return fixed ? inputs : { ...inputs, fxLockPct: 0, fxLockRate: 0 }
}

/** The dollar the farm price uses today (effective with a lock), the market one when it cannot be computed. */
export function effectiveFxToday(ctx: RiskCtx): number {
  const eff = effectiveFx(ctx.inputs.fxLockPct, ctx.inputs.fxLockRate, ctx.base.fx)
  return finite(eff) && eff > 0 ? eff : ctx.base.fx
}

/** The scenario after moving `driver` by `move` (see the header); null when it leaves the valid domain. */
export function scenarioAt(ctx: RiskCtx, driver: RiskDriver, move: number, fixed = true): Scenario | null {
  if (!finite(move)) return null
  const b = ctx.base
  if (driver === 'dolar') {
    const fx = b.fx * (1 + move / 100)
    return fx > 0 ? { ...b, fx } : null
  }
  if (driver === 'cbot') {
    const cbotUsc = b.cbotUsc * (1 + move / 100)
    return cbotUsc > 0 ? { ...b, cbotUsc } : null
  }
  const perCent = basisBrlPerCent(ctx.crop, b, modeInputs(ctx.inputs, fixed))
  return perCent > 0 ? { ...b, basisUsc: b.basisUsc + move / perCent } : null
}

/** The margin pieces (R$, whole crop) at a move, with or without the fixings; null when not computable. */
export function partsAt(ctx: RiskCtx, driver: RiskDriver, move: number, fixed: boolean): MarginParts | null {
  const s = scenarioAt(ctx, driver, move, fixed)
  if (s === null) return null
  return marginParts(ctx.crop, s, ctx.inputs, ctx.tranches, fixed ? ALL_FIXED : NOTHING_FIXED)
}

/** Driver level at a move: dollar R$/US$, CBOT US¢/bu, basis R$/sc (the producer's, with his locks). */
export function levelAt(ctx: RiskCtx, driver: RiskDriver, move: number): number | null {
  if (!finite(move)) return null
  if (driver === 'dolar') return ctx.base.fx * (1 + move / 100)
  if (driver === 'cbot') return ctx.base.cbotUsc * (1 + move / 100)
  const today = farmBasisBrlSc(ctx.crop, ctx.base, ctx.inputs)
  return today === null ? null : today + move
}

/** The move that takes the driver from today to `level` (inverse of `levelAt`); null when today's level is unknown. */
export function moveForLevel(ctx: RiskCtx, driver: RiskDriver, level: number): number | null {
  if (driver === 'basis') {
    const today = levelAt(ctx, 'basis', 0)
    return today === null ? null : level - today
  }
  const today = driver === 'dolar' ? ctx.base.fx : ctx.base.cbotUsc
  return today > 0 ? (level / today - 1) * 100 : null
}

export interface SideAt {
  today: MarginParts
  at: MarginParts
  /** Change of the margin (R$, whole crop) from today to the move. */
  delta: number
}

export interface SimResult {
  driver: RiskDriver
  move: number
  level: number | null
  withLocks: SideAt
  noLocks: SideAt
  /** What the fixings are worth at this move: change with them minus change without them (positive = protects). */
  lockValue: number
}

function side(ctx: RiskCtx, driver: RiskDriver, move: number, fixed: boolean): SideAt | null {
  const today = partsAt(ctx, driver, 0, fixed)
  const at = partsAt(ctx, driver, move, fixed)
  if (today === null || at === null) return null
  return { today, at, delta: at.margin - today.margin }
}

/** The simulation of one driver at a move: both lines, today and at the move; null when not computable. */
export function simulate(ctx: RiskCtx, driver: RiskDriver, move: number): SimResult | null {
  const w = side(ctx, driver, move, true)
  const n = side(ctx, driver, move, false)
  if (w === null || n === null) return null
  return { driver, move, level: levelAt(ctx, driver, move), withLocks: w, noLocks: n, lockValue: w.delta - n.delta }
}

/** Margin share of the crop: the margin over the revenue or over the cost, as the producer chose; null without a base. */
export function marginPct(p: MarginParts, base: FarmInputs['marginBase']): number | null {
  const d = base === 'custo' ? p.cost : p.revenue
  return d > 0 ? p.margin / d : null
}

export interface CurvePt {
  move: number
  level: number | null
  /** Margin in R$ per sack (null when not computable). */
  withLocks: number | null
  noLocks: number | null
}

/** The chart data: margin per sack over `n` evenly spaced moves of +-`half` around today. */
export function riskCurve(ctx: RiskCtx, driver: RiskDriver, half = CHART_HALF[driver], n = CHART_POINTS): CurvePt[] {
  const out: CurvePt[] = []
  for (let i = 0; i < n; i++) {
    const move = -half + (2 * half * i) / (n - 1)
    const w = partsAt(ctx, driver, move, true)
    const u = partsAt(ctx, driver, move, false)
    out.push({
      move,
      level: levelAt(ctx, driver, move),
      withLocks: w === null ? null : w.margin / w.productionSc,
      noLocks: u === null ? null : u.margin / u.productionSc,
    })
  }
  return out
}

export interface ZeroPoint {
  /** The move (% or R$/sc) at which the margin is zero, the nearest one to today. */
  move: number
  level: number
  /** The margin is already negative today: this is the move that brings it back to zero. */
  fromNegative: boolean
  /** The distance from today, always positive (% for dollar/CBOT, R$/sc for the basis). */
  slack: number
}

const SCAN: Record<RiskDriver, { lo: number; hi: number; step: number }> = {
  dolar: { lo: -99, hi: 200, step: 1 },
  cbot: { lo: -99, hi: 200, step: 1 },
  basis: { lo: -60, hi: 60, step: 0.5 },
}

/**
 * The move nearest to today at which the margin is zero (exact: sign change found on a scan, then bisection on the real
 * engine). Null when the margin has no zero in the scanned range (about -99%..+200%, basis +-R$ 60/sc).
 */
export function zeroPoint(ctx: RiskCtx, driver: RiskDriver, fixed: boolean): ZeroPoint | null {
  const m = (x: number) => partsAt(ctx, driver, x, fixed)?.margin ?? null
  const m0 = m(0)
  if (m0 === null) return null
  const finish = (move: number): ZeroPoint | null => {
    const level = levelAt(ctx, driver, move)
    return level === null ? null : { move, level, fromNegative: m0 < 0, slack: Math.abs(move) }
  }
  if (m0 === 0) return finish(0)
  const { lo, hi, step } = SCAN[driver]
  let best: { a: number; b: number } | null = null
  // Walk outwards from today in both directions; the first sign change on each side is a candidate.
  for (const dir of [1, -1] as const) {
    let prev = 0
    let prevM: number = m0
    for (let x = step; ; x += step) {
      const cur = dir * x
      if (cur < lo || cur > hi) break
      const v = m(cur)
      if (v === null) break
      if ((prevM > 0 && v <= 0) || (prevM < 0 && v >= 0)) {
        if (best === null || Math.abs(prev) < Math.abs(best.a)) best = { a: prev, b: cur }
        break
      }
      prev = cur
      prevM = v
    }
  }
  if (best === null) return null
  let { a, b } = best
  let ma = m(a) as number
  for (let i = 0; i < 80; i++) {
    const mid = (a + b) / 2
    const mm = m(mid)
    if (mm === null) break
    if ((ma > 0) === (mm > 0)) {
      a = mid
      ma = mm
    } else b = mid
  }
  return finish((a + b) / 2)
}

/** The small bad move behind each selector card: -1% (dollar, CBOT) or -R$ 1,00/sc (basis). */
export const CARD_MOVE = -1

/** Change of the margin (R$, whole crop, with the producer's fixings) for the card's move; null when not computable. */
export function cardDelta(ctx: RiskCtx, driver: RiskDriver): number | null {
  return simulate(ctx, driver, CARD_MOVE)?.withLocks.delta ?? null
}

/** The driver of the biggest loss on the cards (the first one on a tie); null when none can be computed. */
export function biggestLoss(ctx: RiskCtx): RiskDriver | null {
  let best: RiskDriver | null = null
  let bestV = Infinity
  for (const d of RISK_DRIVERS) {
    const v = cardDelta(ctx, d)
    if (v !== null && v < bestV) {
      best = d
      bestV = v
    }
  }
  return best
}

// ───────────────────────────────── driver-specific blocks ─────────────────────────────────

export interface DollarSides {
  /** Total cost of the crop per hectare today (R$), null when the cost is not computable. */
  costBrlHa: number | null
  /** Share (0..1) of the cost that is in US$ (at today's dollar); null without a cost. */
  usdShare: number | null
  hasUsdCost: boolean
  /** US$ of the crop's cost lines: all, already bought, still open (whole crop). */
  usdTotal: number
  usdBought: number
  usdOpen: number
  /** Fraction of the US$ cost already bought. */
  boughtPct: number
  /** Average dollar of the part already bought; null when nothing is bought. */
  boughtAvgRate: number | null
  /** Effect on the crop (R$, with the producer's fixings) of +R$ 0,10 in the dollar. */
  plus: { move: number; revenue: number; cost: number; margin: number } | null
}

export const DOLLAR_STEP = 0.1

export function dollarSides(ctx: RiskCtx): DollarSides {
  const i = ctx.inputs
  const area = i.areaHa
  const fx = ctx.base.fx
  const r = computeResult(ctx.crop, ctx.base, i)
  const costBrlHa = r.costPerSc !== null && effectiveYieldScHa(i) > 0 ? r.costPerSc * effectiveYieldScHa(i) : null
  let usdHa = 0
  let boughtHa = 0
  let boughtBrlHa = 0
  let usdBrlHa = 0
  for (const l of i.costUsd) {
    usdHa += l.usdPerHa
    boughtHa += l.usdPerHa * l.boughtPct
    boughtBrlHa += l.usdPerHa * l.boughtPct * l.boughtRate
    const e = effectiveFx(l.boughtPct, l.boughtRate, fx)
    if (finite(e)) usdBrlHa += l.usdPerHa * e
  }
  const parts0 = partsAt(ctx, 'dolar', 0, true)
  const s1: Scenario = { ...ctx.base, fx: fx + DOLLAR_STEP }
  const parts1 = parts0 === null ? null : marginParts(ctx.crop, s1, i, ctx.tranches, ALL_FIXED)
  return {
    costBrlHa,
    usdShare: costBrlHa !== null && costBrlHa > 0 ? usdBrlHa / costBrlHa : null,
    hasUsdCost: usdHa > 0,
    usdTotal: usdHa * area,
    usdBought: boughtHa * area,
    usdOpen: (usdHa - boughtHa) * area,
    boughtPct: usdHa > 0 ? boughtHa / usdHa : 0,
    boughtAvgRate: boughtHa > 0 ? boughtBrlHa / boughtHa : null,
    plus:
      parts0 === null || parts1 === null
        ? null
        : {
            move: DOLLAR_STEP,
            revenue: parts1.revenue - parts0.revenue,
            cost: parts1.cost - parts0.cost,
            margin: parts1.margin - parts0.margin,
          },
  }
}

export const CBOT_STEPS: readonly number[] = [10, 25, 50, 100]

export interface CbotRow {
  usc: number
  /** R$/sc that `usc` US¢/bu are worth in the farm price (at the dollar the farm price uses). */
  brlPerSc: number
  /** The same on the still-unsold sacks (R$, whole crop). */
  onUnsold: number
}

export interface CbotInReais {
  /** The dollar the conversion uses (effective with a lock). */
  fx: number
  unsoldSc: number
  rows: CbotRow[]
}

export function cbotInReais(ctx: RiskCtx): CbotInReais | null {
  const p = partsAt(ctx, 'cbot', 0, true)
  if (p === null) return null
  const perCent = basisBrlPerCent(ctx.crop, ctx.base, ctx.inputs)
  return {
    fx: effectiveFxToday(ctx),
    unsoldSc: p.unsoldSc,
    rows: CBOT_STEPS.map((usc) => ({ usc, brlPerSc: usc * perCent, onUnsold: usc * perCent * p.unsoldSc })),
  }
}

export interface BasisBreakdown {
  /** Port premium in US¢/bu and in R$/sc (at the dollar the farm price uses). */
  premiumUsc: number
  premiumBrlSc: number
  freight: number
  portFees: number
  /** Farm price - CBOT, R$/sc: premiumBrlSc - freight - portFees. */
  basis: number
  unsoldSc: number
}

export function basisBreakdown(ctx: RiskCtx): BasisBreakdown | null {
  const basis = farmBasisBrlSc(ctx.crop, ctx.base, ctx.inputs)
  const p = partsAt(ctx, 'basis', 0, true)
  if (basis === null || p === null) return null
  return {
    premiumUsc: ctx.base.basisUsc,
    premiumBrlSc: (ctx.base.basisUsc / 100) * ctx.crop.bushelsPerSack * effectiveFxToday(ctx),
    freight: ctx.inputs.freightBrlPerSc,
    portFees: ctx.inputs.portFeesBrlPerSc,
    basis,
    unsoldSc: p.unsoldSc,
  }
}
