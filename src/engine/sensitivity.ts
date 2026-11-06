/**
 * Sensitivity of the margin (R$, whole crop) to the dollar, the basis and the CBOT. Pure: no store, no React.
 *
 * For each driver the margin is computed along a range of moves around today (the other two stay at today's value), twice:
 * - `fixed`: with everything the producer already did (sales at their own price and dollar, exchange operations,
 *   US$ costs already bought);
 * - `unfixed`: as if nothing had been fixed (all sold at the scenario price, no operations, all US$ costs open).
 * The distance between the two lines is what the sales and operations are worth. Each point is the full engine
 * calculation (`computeResult`), not a linear shortcut, so puts, fixed dollars and costs in US$ show up as they are.
 *
 * margin(s) = sold revenue (each tranche at its price; a US$ sale with the dollar open follows the scenario dollar)
 *           + unsold sacks x farm price(s) + R$ result of the operations(s) - production x cost per sack(s)
 */
import { computeResult, effectiveFx, type FarmInputs, type Scenario } from './calc'
import type { CropConfig } from './crops'
import type { ExposureOk } from './exposure'
import type { HedgeOp } from './hedge'
import { productionOf } from './production'
import { trancheBrlAt, trancheProblem, trancheSc, type SaleTranche } from './sales'

export type Driver = 'dolar' | 'basis' | 'cbot'

const finite = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)

/** The half range of each curve, in the unit of the driver: R$/US$, R$/sc, US¢/bu. */
export interface CurveSpans {
  dolar: number
  basis: number
  cbot: number
}
export const DEFAULT_SPANS: CurveSpans = { dolar: 1, basis: 6, cbot: 150 }

/** The small move used for "each R$ 0,10 in the dollar...", in the unit of the driver. */
export const UNIT_MOVE: Record<Driver, number> = { dolar: 0.1, basis: 1, cbot: 10 }

/** Points on each side of today (the curve has 2 x HALF_POINTS + 1 points). */
export const HALF_POINTS = 12

export interface CurvePoint {
  /** Move from today, in the unit of the driver. */
  x: number
  /** Margin (R$) with what is fixed / with nothing fixed; null when it cannot be computed. */
  fixed: number | null
  unfixed: number | null
}

export interface BreakEven {
  /** Move from today (driver unit) at which the margin is zero. */
  x: number
  /** The same move as a fraction of today's level (dollar, CBOT); null for the basis. */
  pct: number | null
  /** The margin is already negative today: this is the move that brings it back to zero. */
  fromNegative: boolean
}

export interface DriverCurve {
  driver: Driver
  /** Today's level in the unit of the driver (dollar R$/US$, CBOT US¢/bu); null for the basis (it is a spread). */
  level: number | null
  span: number
  points: CurvePoint[]
  /** Margin today. */
  today: { fixed: number | null; unfixed: number | null }
  /** Change of the margin (R$) for a move of `UNIT_MOVE[driver]` (central difference around today). */
  perUnit: { fixed: number | null; unfixed: number | null }
  breakEven: { fixed: BreakEven | null; unfixed: BreakEven | null }
  /** What the fixings save if the driver falls by the whole span / what they give up if it rises by it (R$). */
  savedAtDown: number | null
  givenUpAtUp: number | null
}

export interface Curves {
  ok: boolean
  productionSc: number
  curves: DriverCurve[]
  /** Shared vertical range (R$) so the three charts compare fairly; null when nothing could be computed. */
  yDomain: [number, number] | null
}

export interface CurveInput {
  crop: CropConfig
  /** Today's scenario (CBOT, basis in US¢/bu, dollar). */
  scenario: Scenario
  inputs: FarmInputs
  tranches: SaleTranche[]
  spans?: Partial<CurveSpans>
}

/** Which of the three kinds of "fixings" count: the sales, the market operations, the US$ costs already bought. */
export interface Fixings {
  sales: boolean
  ops: boolean
  costs: boolean
}
export const ALL_FIXED: Fixings = { sales: true, ops: true, costs: true }
export const NOTHING_FIXED: Fixings = { sales: false, ops: false, costs: false }

/** The inputs with only the chosen fixings: no operations, every US$ cost open at the market dollar, no dollar lock. */
function withFixings(i: FarmInputs, fix: Fixings): FarmInputs {
  const { hedge, ...rest } = i
  return {
    ...rest,
    ...(fix.ops && hedge !== undefined && { hedge }),
    soldPct: 0,
    soldAvgPriceBrl: 0,
    ...(!fix.sales && { fxLockPct: 0, fxLockRate: 0 }),
    ...(!fix.costs && { costUsd: i.costUsd.map((l) => ({ ...l, boughtPct: 0, boughtRate: 0 })) }),
  }
}

/** The pieces of the margin at a scenario (R$, whole crop). */
export interface MarginParts {
  productionSc: number
  soldSc: number
  unsoldSc: number
  /** Revenue of the sales already made, each at its own price (and dollar). */
  soldRevenue: number
  /** Farm price (R$/sc) of the scenario for what is not sold yet. */
  farmPrice: number
  /** Production cost per sack at the scenario (US$ costs follow the dollar except the part already bought). */
  costPerSc: number
  /** R$ result of the market operations at the scenario (realized + projected); 0 when ops are not counted. */
  hedge: number
  /** soldRevenue + unsold sacks x farm price + hedge. */
  revenue: number
  /** Production x cost per sack. */
  cost: number
  margin: number
}

/** The margin pieces at a scenario with the chosen fixings; null when something needed is missing. */
export function marginParts(
  crop: CropConfig,
  s: Scenario,
  inputs: FarmInputs,
  tranches: SaleTranche[],
  fix: Fixings,
): MarginParts | null {
  const i = withFixings(inputs, fix)
  const r = computeResult(crop, s, i)
  const P = productionOf(i)
  if (!(P > 0) || !finite(r.farmPriceBrl) || !finite(r.costPerSc)) return null
  const valid = fix.sales ? tranches.filter((t) => trancheProblem(t) === null) : []
  const totalSc = valid.reduce((n, t) => n + trancheSc(t, crop.bushelsPerSack), 0)
  const scale = totalSc > P ? P / totalSc : 1
  let soldRevenue = 0
  for (const t of valid) {
    const price = trancheBrlAt(t, s.fx)
    if (price === null) return null
    soldRevenue += scale * trancheSc(t, crop.bushelsPerSack) * price
  }
  const soldSc = Math.min(totalSc, P)
  const hedge = fix.ops ? r.hedgeBrl : 0
  const revenue = soldRevenue + (P - soldSc) * r.farmPriceBrl + hedge
  const cost = P * r.costPerSc
  const margin = revenue - cost
  if (![soldRevenue, revenue, cost, margin].every(Number.isFinite)) return null
  return {
    productionSc: P,
    soldSc,
    unsoldSc: P - soldSc,
    soldRevenue,
    farmPrice: r.farmPriceBrl,
    costPerSc: r.costPerSc,
    hedge,
    revenue,
    cost,
    margin,
  }
}

/** Margin (R$, whole crop) at a scenario: with everything the producer fixed, or with nothing fixed. */
export function marginAt(
  crop: CropConfig,
  s: Scenario,
  inputs: FarmInputs,
  tranches: SaleTranche[],
  fixed: boolean,
): number | null {
  return marginParts(crop, s, inputs, tranches, fixed ? ALL_FIXED : NOTHING_FIXED)?.margin ?? null
}

/** The scenario after moving a driver by `x` (driver unit). The basis moves in R$/sc, converted to US¢/bu. */
function moved(crop: CropConfig, s: Scenario, driver: Driver, x: number, inputs: FarmInputs): Scenario | null {
  if (driver === 'dolar') return s.fx + x > 0 ? { ...s, fx: s.fx + x } : null
  if (driver === 'cbot') return s.cbotUsc + x > 0 ? { ...s, cbotUsc: s.cbotUsc + x } : null
  // R$/sc per US¢/bu at the dollar the farm price really uses (effective when part of it is locked).
  const eff = effectiveFx(inputs.fxLockPct, inputs.fxLockRate, s.fx)
  const brlPerCent = (crop.bushelsPerSack / 100) * (Number.isFinite(eff) && eff > 0 ? eff : s.fx)
  return brlPerCent > 0 ? { ...s, basisUsc: s.basisUsc + x / brlPerCent } : null
}

function marginMoved(i: CurveInput, driver: Driver, x: number, fixed: boolean): number | null {
  const s = moved(i.crop, i.scenario, driver, x, i.inputs)
  return s === null ? null : marginAt(i.crop, s, i.inputs, i.tranches, fixed)
}

/** The move (driver unit) nearest to today at which the margin is zero, searching +-2 spans; null if there is none. */
function findBreakEven(
  i: CurveInput,
  driver: Driver,
  span: number,
  fixed: boolean,
  level: number | null,
): BreakEven | null {
  const steps = 8 * HALF_POINTS
  const dx = (4 * span) / steps
  const xs: number[] = []
  const ms: (number | null)[] = []
  for (let k = -steps / 2; k <= steps / 2; k++) {
    const x = k * dx
    xs.push(x)
    ms.push(marginMoved(i, driver, x, fixed))
  }
  const mid = steps / 2
  const m0 = ms[mid]
  if (m0 === null) return null
  let best: number | null = null
  for (let k = 0; k < xs.length - 1; k++) {
    const a = ms[k]
    const b = ms[k + 1]
    if (a === null || b === null || (a > 0 && b > 0) || (a < 0 && b < 0)) continue
    const x = a === b ? xs[k] : xs[k] + ((0 - a) / (b - a)) * (xs[k + 1] - xs[k])
    if (best === null || Math.abs(x) < Math.abs(best)) best = x
  }
  if (best === null) return null
  return { x: best, pct: level !== null && level > 0 ? best / level : null, fromNegative: m0 < 0 }
}

function driverCurve(i: CurveInput, driver: Driver, span: number): DriverCurve {
  const level = driver === 'dolar' ? i.scenario.fx : driver === 'cbot' ? i.scenario.cbotUsc : null
  const points: CurvePoint[] = []
  for (let k = -HALF_POINTS; k <= HALF_POINTS; k++) {
    const x = (k * span) / HALF_POINTS
    points.push({ x, fixed: marginMoved(i, driver, x, true), unfixed: marginMoved(i, driver, x, false) })
  }
  const u = UNIT_MOVE[driver]
  const diff = (fixed: boolean) => {
    const up = marginMoved(i, driver, u, fixed)
    const down = marginMoved(i, driver, -u, fixed)
    return up === null || down === null ? null : (up - down) / 2
  }
  const at = (x: number) => points.find((p) => Math.abs(p.x - x) < 1e-9)
  const lo = points[0]
  const hi = points[points.length - 1]
  const mid = at(0)
  return {
    driver,
    level,
    span,
    points,
    today: { fixed: mid?.fixed ?? null, unfixed: mid?.unfixed ?? null },
    perUnit: { fixed: diff(true), unfixed: diff(false) },
    breakEven: {
      fixed: findBreakEven(i, driver, span, true, level),
      unfixed: findBreakEven(i, driver, span, false, level),
    },
    savedAtDown: lo.fixed !== null && lo.unfixed !== null ? lo.fixed - lo.unfixed : null,
    givenUpAtUp: hi.fixed !== null && hi.unfixed !== null ? hi.unfixed - hi.fixed : null,
  }
}

/** The three curves (dollar, basis, CBOT) with a shared vertical range. */
export function buildCurves(i: CurveInput): Curves {
  const P = productionOf(i.inputs)
  if (!(P > 0)) return { ok: false, productionSc: 0, curves: [], yDomain: null }
  const spans = { ...DEFAULT_SPANS, ...i.spans }
  const curves = (['dolar', 'basis', 'cbot'] as const).map((d) => driverCurve(i, d, spans[d]))
  const values = curves.flatMap((c) => c.points.flatMap((p) => [p.fixed, p.unfixed])).filter(finite)
  const ok = values.length > 0
  return {
    ok,
    productionSc: P,
    curves,
    yDomain: ok ? [Math.min(...values), Math.max(...values)] : null,
  }
}

// ───────────────────────────────────── weighted dollar ─────────────────────────────────────

export interface DollarProfile {
  productionSc: number
  /** Sold in R$: the dollar does not matter for these sacks. */
  brlSc: number
  /** US$ revenue with the dollar already fixed (US$ sales with a typed dollar and operations that fix the dollar). */
  fixedSc: number
  /** US$ revenue still at the market dollar. */
  openSc: number
  /** Dollar (R$/US$) weighted by the US$ fixed; null when nothing is fixed. */
  avgFixedRate: number | null
  /** The whole US$ revenue at one dollar: fixed part at its rate, open part at the market. */
  effectiveRate: number | null
  marketFx: number
}

export interface DollarProfileInput {
  exp: ExposureOk
  tranches: SaleTranche[]
  /** Operations that still protect (`coverOps`). */
  coverOps: HedgeOp[]
  bushelsPerSack: number
  /** Farm-gate US$/sc of today; null when unusable (operations then cannot be weighed). */
  usdPerSc: number | null
  marketFx: number
}

/**
 * How the US$ revenue of the crop is fixed and at which dollar, weighted by the US$ amounts: sold in R$ (outside), US$
 * sales with a typed dollar (at their rate), dollar futures (at their price) and soybean operations that fixed the
 * dollar (at that dollar), and what is still open at the market dollar.
 */
export function dollarProfile(i: DollarProfileInput): DollarProfile {
  const P = i.exp.productionSc
  const valid = i.tranches.filter((t) => trancheProblem(t) === null)
  const scaleSales = i.exp.soldSc > P ? P / i.exp.soldSc : 1
  let brlSc = 0
  let salesSc = 0
  let fixedUsd = 0
  let fixedBrl = 0
  for (const t of valid) {
    const sc = scaleSales * trancheSc(t, i.bushelsPerSack)
    if (t.priceCurrency === 'BRL') brlSc += sc
    else if (finite(t.dollar) && t.dollar > 0) {
      salesSc += sc
      fixedUsd += sc * t.price
      fixedBrl += sc * t.price * t.dollar
    }
  }
  // Operations: only the ones that fix the dollar (a put is a floor, not a fixed rate).
  let opsSc = 0
  const room = Math.max(0, P - brlSc - salesSc)
  if (i.usdPerSc !== null && i.usdPerSc > 0) {
    const parts: { sc: number; usd: number; rate: number }[] = []
    for (const o of i.coverOps) {
      if (o.kind !== 'futuro' || o.side !== 'vendido') continue
      if (o.asset === 'dolar') parts.push({ sc: o.qty / i.usdPerSc, usd: o.qty, rate: o.strike })
      else if (finite(o.fxFixed) && o.fxFixed > 0) {
        const sc = o.qty / i.bushelsPerSack
        parts.push({ sc, usd: sc * i.usdPerSc, rate: o.fxFixed })
      }
    }
    const total = parts.reduce((n, p) => n + p.sc, 0)
    const k = total > room && total > 0 ? room / total : 1
    for (const p of parts) {
      opsSc += p.sc * k
      fixedUsd += p.usd * k
      fixedBrl += p.usd * k * p.rate
    }
  }
  const fixedSc = salesSc + opsSc
  const openSc = Math.max(0, P - brlSc - fixedSc)
  const avgFixedRate = fixedUsd > 0 ? fixedBrl / fixedUsd : null
  const openUsd = i.usdPerSc !== null ? openSc * i.usdPerSc : 0
  const effectiveRate = fixedUsd + openUsd > 0 ? (fixedBrl + openUsd * i.marketFx) / (fixedUsd + openUsd) : null
  return { productionSc: P, brlSc, fixedSc, openSc, avgFixedRate, effectiveRate, marketFx: i.marketFx }
}
