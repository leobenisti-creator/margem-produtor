/**
 * The matrix of the Resultados financeiros page: any two of the three drivers (CBOT, dollar, basis) on the axes, nine
 * steps each around today, and a "lens" that says what the numbers are about. Pure: no store, no React.
 *
 * Every cell is the full engine calculation (sales at their own price and dollar, market operations, US$ costs), see
 * `marginParts`. Lenses:
 * - tudo: the margin with everything the producer fixed (the default);
 * - aberto: the part not sold yet: unsold sacks x (farm price - cost per sack) + the operations;
 * - operacoes: only the R$ result of the market operations;
 * - diferenca: what the fixings are worth: margin with everything fixed - margin with nothing fixed.
 */
import { DEFAULT_STEPS_PCT, toneFor, type Tone } from './matrix'
import { basisSummary, effectiveFx, type FarmInputs, type Scenario } from './calc'
import type { CropConfig } from './crops'
import { marginParts, ALL_FIXED, NOTHING_FIXED } from './sensitivity'
import type { SaleTranche } from './sales'

export type MatrixAxis = 'cbot' | 'dolar' | 'basis'
export type Lens = 'tudo' | 'aberto' | 'operacoes' | 'diferenca'

/** Basis steps around today, in R$/sc. */
export const DEFAULT_BASIS_STEPS = [1, 2, 4, 8] as const

export interface ScenarioMatrixInput {
  crop: CropConfig
  /** Today's market (centre of the matrix). */
  scenario: Scenario
  inputs: FarmInputs
  tranches: SaleTranche[]
  rowAxis: MatrixAxis
  colAxis: MatrixAxis
  lens: Lens
  /** Four steps in %, strictly increasing, each in (0, 100): CBOT and dollar. */
  stepsPct?: readonly [number, number, number, number]
  /** A step set of its own for CBOT and/or the dollar (the Resultados page sizes them separately); else `stepsPct`. */
  axisStepsPct?: { cbot?: readonly [number, number, number, number]; dolar?: readonly [number, number, number, number] }
  /** Four steps in R$/sc, strictly increasing and positive: basis. */
  basisSteps?: readonly [number, number, number, number]
}

export interface CellParts {
  soldRevenue: number
  /** Unsold sacks x the farm price of the cell. */
  unsoldRevenue: number
  /** R$ result of the market operations at the cell. */
  hedge: number
  revenue: number
  cost: number
  margin: number
}

export interface MatrixCell {
  scenario: Scenario
  /** Farm price (R$/sc, physical) at the cell; null when it cannot be computed. */
  priceBrl: number | null
  /** What the lens measures, R$ for the whole crop; null when unknown. */
  total: number | null
  /** `total` per sack (of the production; for the lens "aberto", of the sacks not sold yet). */
  perSc: number | null
  perHa: number | null
  /** Margin % in the producer's base; only for the lens "tudo". */
  pct: number | null
  /** Traffic light: margin % against the target for "tudo", the sign of the value for the other lenses. */
  tone: Tone
  /** The pieces of the margin with everything fixed (for the tooltip); null when unknown. */
  parts: CellParts | null
}

export interface ScenarioMatrix {
  rowAxis: MatrixAxis
  colAxis: MatrixAxis
  lens: Lens
  /** Value of each row/column in the unit of its axis: US¢/bu, R$/US$, R$/sc (basis). */
  rowValues: number[]
  colValues: number[]
  /** Move from today: % for CBOT and dollar, R$/sc for the basis. */
  rowDelta: number[]
  colDelta: number[]
  cells: MatrixCell[][]
  /** Today: always the middle of the grid. */
  current: { row: 4; col: 4 }
}

const round4 = (n: number) => Math.round(n * 10000) / 10000

function checkSteps(steps: readonly number[], max: number): void {
  let prev = 0
  for (const s of steps) {
    if (!Number.isFinite(s) || !(s > prev) || !(s < max))
      throw new RangeError('Matrix steps must be finite and increasing')
    prev = s
  }
}

const sym = (steps: readonly [number, number, number, number]): number[] => {
  const [a, b, c, d] = steps
  return [-d, -c, -b, -a, 0, a, b, c, d]
}

/**
 * The producer's BASIS in R$/sc: the farm price minus the CBOT (freight and port fees inside it), the same number the
 * Lavoura e custos card shows. Null when the scenario cannot be computed. This is the basis everywhere in the app.
 */
export function farmBasisBrlSc(crop: CropConfig, s: Scenario, inputs: FarmInputs): number | null {
  return basisSummary(crop, s, inputs)?.brlPerSc ?? null
}

/** The PORT PREMIUM of the scenario in R$/sc (the US¢/bu premium over CBOT converted at the dollar): not the basis. */
export function basisBrlSc(crop: CropConfig, s: Scenario): number {
  return (s.basisUsc / 100) * crop.bushelsPerSack * s.fx
}

/** The scenario with a driver moved to the axis point `delta` (% for CBOT/dollar, R$/sc for the basis). */
/**
 * R$/sc that one US¢/bu of basis is worth at today's scenario: bushels per sack x the dollar the farm price is really
 * computed with (the effective one when part of the dollar is locked; otherwise the farm basis would move by less than
 * the amount typed on the axis).
 */
export function basisBrlPerCent(crop: CropConfig, s: Scenario, inputs?: FarmInputs): number {
  const eff = inputs ? effectiveFx(inputs.fxLockPct, inputs.fxLockRate, s.fx) : s.fx
  const fx = Number.isFinite(eff) && eff > 0 ? eff : s.fx
  return (crop.bushelsPerSack / 100) * fx
}

export function applyAxis(
  crop: CropConfig,
  base: Scenario,
  axis: MatrixAxis,
  delta: number,
  inputs?: FarmInputs,
): Scenario {
  if (axis === 'cbot')
    return { ...base, cbotUsc: delta === 0 ? base.cbotUsc : round4(base.cbotUsc * (1 + delta / 100)) }
  if (axis === 'dolar') return { ...base, fx: delta === 0 ? base.fx : round4(base.fx * (1 + delta / 100)) }
  // The basis is a spread in US¢/bu: a move in R$/sc is converted at today's (effective) dollar.
  return { ...base, basisUsc: base.basisUsc + delta / basisBrlPerCent(crop, base, inputs) }
}

/**
 * Moves several drivers at once, every move measured from `base` (so the order does not matter: a basis move in R$/sc
 * is always converted at today's dollar, not at a dollar that another axis already moved).
 */
export function applyAxes(
  crop: CropConfig,
  base: Scenario,
  moves: Array<[MatrixAxis, number]>,
  inputs?: FarmInputs,
): Scenario {
  const out = { ...base }
  for (const [axis, delta] of moves) {
    const one = applyAxis(crop, base, axis, delta, inputs)
    if (axis === 'cbot') out.cbotUsc = one.cbotUsc
    else if (axis === 'dolar') out.fx = one.fx
    else out.basisUsc = one.basisUsc
  }
  return out
}

function axisValues(i: ScenarioMatrixInput, axis: MatrixAxis, pct: number[], brl: number[]) {
  const b = i.scenario
  if (axis === 'basis') {
    // The basis is the farm price minus the CBOT; the axis moves it by R$/sc (see `applyAxis`).
    const level = farmBasisBrlSc(i.crop, b, i.inputs) ?? 0
    return { values: brl.map((d) => (d === 0 ? level : round4(level + d))), delta: brl }
  }
  const base = axis === 'cbot' ? b.cbotUsc : b.fx
  if (!Number.isFinite(base) || !(base > 0)) throw new RangeError('Base value must be positive')
  return { values: pct.map((p) => (p === 0 ? base : round4(base * (1 + p / 100)))), delta: pct }
}

/**
 * One scenario worked out like a cell of the matrix (the same code builds the grid and the "scenario shown" line, so
 * the two can never disagree). Null fields when the scenario cannot be computed.
 */
export function evaluateScenario(
  crop: CropConfig,
  s: Scenario,
  inputs: FarmInputs,
  tranches: SaleTranche[],
  lens: Lens = 'tudo',
): MatrixCell {
  const f = marginParts(crop, s, inputs, tranches, ALL_FIXED)
  if (f === null) {
    return { scenario: s, priceBrl: null, total: null, perSc: null, perHa: null, pct: null, tone: null, parts: null }
  }
  let total: number | null
  let per: number
  if (lens === 'tudo') {
    total = f.margin
    per = f.productionSc
  } else if (lens === 'aberto') {
    total = f.unsoldSc * (f.farmPrice - f.costPerSc) + f.hedge
    per = f.unsoldSc
  } else if (lens === 'operacoes') {
    total = f.hedge
    per = f.productionSc
  } else {
    const u = marginParts(crop, s, inputs, tranches, NOTHING_FIXED)
    total = u === null ? null : f.margin - u.margin
    per = f.productionSc
  }
  const perSc = total === null || !(per > 0) ? null : total / per
  const perHa = total === null || !(inputs.areaHa > 0) ? null : total / inputs.areaHa
  const base = inputs.marginBase === 'custo' ? f.cost : f.revenue
  const pctValue = lens === 'tudo' && base > 0 ? f.margin / base : null
  const tone: Tone = total === null ? null : lens === 'tudo' ? toneFor(pctValue, inputs.targetMargin) : total < 0 ? 0 : 2
  return {
    scenario: s,
    priceBrl: f.farmPrice,
    total,
    perSc,
    perHa,
    pct: pctValue,
    tone,
    parts: {
      soldRevenue: f.soldRevenue,
      unsoldRevenue: f.unsoldSc * f.farmPrice,
      hedge: f.hedge,
      revenue: f.revenue,
      cost: f.cost,
      margin: f.margin,
    },
  }
}

/** Size of one step -> the four increasing steps of the grid (1x, 2x, 3x, 4x), free of float noise. */
export function stepsFromSize(size: number): [number, number, number, number] {
  const k = (n: number) => Math.round(size * n * 1e6) / 1e6
  return [k(1), k(2), k(3), k(4)]
}

/**
 * The scenario the grid is built around: today's market, except the driver held still (the one that is not on an axis),
 * which keeps the value the producer chose for it.
 */
export function matrixBaseScenario(today: Scenario, chosen: Scenario, held: MatrixAxis): Scenario {
  return {
    cbotUsc: held === 'cbot' ? chosen.cbotUsc : today.cbotUsc,
    fx: held === 'dolar' ? chosen.fx : today.fx,
    basisUsc: held === 'basis' ? chosen.basisUsc : today.basisUsc,
  }
}

/** The driver that is on neither axis. */
export function heldAxis(rowAxis: MatrixAxis, colAxis: MatrixAxis): MatrixAxis {
  const all: MatrixAxis[] = ['cbot', 'dolar', 'basis']
  return all.find((a) => a !== rowAxis && a !== colAxis) ?? 'basis'
}

/**
 * The port premium (US¢/bu) that makes the producer's basis (farm price - CBOT, R$/sc) equal `targetBrlSc` in the
 * scenario `s`: the farm basis is linear in the premium (slope `basisBrlPerCent`), so the answer is exact. Null when
 * the basis of `s` cannot be computed.
 */
export function premiumForFarmBasis(
  crop: CropConfig,
  s: Scenario,
  inputs: FarmInputs,
  targetBrlSc: number,
): number | null {
  const now = farmBasisBrlSc(crop, s, inputs)
  const slope = basisBrlPerCent(crop, s, inputs)
  if (now === null || !Number.isFinite(targetBrlSc) || !(slope > 0)) return null
  const out = s.basisUsc + (targetBrlSc - now) / slope
  return Number.isFinite(out) ? out : null
}

export function buildScenarioMatrix(i: ScenarioMatrixInput): ScenarioMatrix {
  if (i.rowAxis === i.colAxis) throw new RangeError('The two axes must be different')
  const stepsPct = i.stepsPct ?? DEFAULT_STEPS_PCT
  const basisSteps = i.basisSteps ?? DEFAULT_BASIS_STEPS
  checkSteps(stepsPct, 100)
  checkSteps(basisSteps, 1e9)
  const pctOf = (axis: MatrixAxis) => {
    const own = axis === 'cbot' ? i.axisStepsPct?.cbot : axis === 'dolar' ? i.axisStepsPct?.dolar : undefined
    if (own) checkSteps(own, 100)
    return sym(own ?? stepsPct)
  }
  const brl = sym(basisSteps)
  const rows = axisValues(i, i.rowAxis, pctOf(i.rowAxis), brl)
  const cols = axisValues(i, i.colAxis, pctOf(i.colAxis), brl)
  const cells = rows.delta.map((rd) =>
    cols.delta.map((cd): MatrixCell => {
      const s = applyAxes(
        i.crop,
        i.scenario,
        [
          [i.rowAxis, rd],
          [i.colAxis, cd],
        ],
        i.inputs,
      )
      return evaluateScenario(i.crop, s, i.inputs, i.tranches, i.lens)
    }),
  )

  return {
    rowAxis: i.rowAxis,
    colAxis: i.colAxis,
    lens: i.lens,
    rowValues: rows.values,
    colValues: cols.values,
    rowDelta: rows.delta,
    colDelta: cols.delta,
    cells,
    current: { row: 4, col: 4 },
  }
}
