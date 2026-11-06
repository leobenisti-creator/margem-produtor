import type { CropConfig } from './crops'
import { computeResult, inputsAtPrice, type FarmInputs, type Scenario } from './calc'
import { okCount, toneFor, type Matrix } from './matrix'

export type Lever = 'preco' | 'cbot' | 'dolar' | 'produtividade' | 'custo'

export interface LeverResult {
  lever: Lever
  /** Value that, alone, puts the margin on the target, in the lever's natural unit:
   *  R$/sc, US¢/bu, R$/US$, sc/ha, R$/ha. Null when unreachable. */
  value: number | null
  /** Variation from today's value, in %. Null when unreachable. */
  deltaPct: number | null
  reachable: boolean
}

export interface StressRow {
  id: 'cbot-10' | 'dolar-10' | 'prod-10' | 'custo+10' | 'combo'
  label: string
  marginPct: number | null
  status: 'meta' | 'perto' | 'longe' | 'prejuizo' | 'indefinido'
}

export interface TargetAnalysis {
  status: 'abaixo' | 'acima' | 'na-meta'
  /** Distance to the target in p.p. (always ≥ 0); null when today's margin is unknown. */
  gapPp: number | null
  levers: LeverResult[]
  cellsOk: number
  cellsTotal: 81
  /**
   * Green cell closest to today: smallest |cbot%| + |dólar%|; on a tie, the larger margin
   * wins, then the smaller |dólar%|.
   */
  nearest: { row: number; col: number } | null
  stress: StressRow[]
}

/** Search bounds: today's value ± 80%. */
const BOUND = 0.8
const MAX_ITER = 200

/** Rounded to a hundredth of a p.p., like the matrix traffic light. */
function r4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/**
 * Margin % in the client's base for a modified scenario/inputs.
 * A non-positive farm price on the revenue base is treated as −∞ (total loss), so the
 * margin stays monotone across the bracket instead of flipping sign at price 0.
 */
function marginOf(crop: CropConfig, s: Scenario, i: FarmInputs): number | null {
  const r = computeResult(crop, s, i)
  if (r.farmPriceBrl !== null && r.farmPriceBrl <= 0 && i.marginBase === 'receita') {
    return Number.NEGATIVE_INFINITY
  }
  return r.marginPct
}

/**
 * Bisection on `margin(x) = target` within [x0 × 0.2, x0 × 1.8].
 * The margin is monotone in each lever (increasing or decreasing); no sign change in the
 * bracket means the target is not reachable with this lever alone.
 */
export function solveLever(
  lever: Lever,
  x0: number | null,
  target: number,
  margin: (x: number) => number | null,
): LeverResult {
  const none: LeverResult = { lever, value: null, deltaPct: null, reachable: false }
  if (x0 === null || !Number.isFinite(x0) || !(x0 > 0) || !Number.isFinite(target)) return none
  const h = (x: number): number | null => {
    const m = margin(x)
    return m === null || Number.isNaN(m) ? null : m - target
  }
  let lo = x0 * (1 - BOUND)
  let hi = x0 * (1 + BOUND)
  const hLo = h(lo)
  const hHi = h(hi)
  if (hLo === null || hHi === null) return none
  if (hLo === 0) return done(lever, lo, x0)
  if (hHi === 0) return done(lever, hi, x0)
  if (Math.sign(hLo) === Math.sign(hHi)) return none
  const loNeg = hLo < 0
  for (let k = 0; k < MAX_ITER; k++) {
    const mid = (lo + hi) / 2
    const hm = h(mid)
    if (hm === null) return none
    if (hm === 0 || hi - lo <= 1e-12 * Math.max(1, Math.abs(mid))) return done(lever, mid, x0)
    if (hm < 0 === loNeg) lo = mid
    else hi = mid
  }
  return done(lever, (lo + hi) / 2, x0)
}

function done(lever: Lever, value: number, x0: number): LeverResult {
  const deltaPct = (value / x0 - 1) * 100
  if (!Number.isFinite(value) || !Number.isFinite(deltaPct)) {
    return { lever, value: null, deltaPct: null, reachable: false }
  }
  return { lever, value, deltaPct, reachable: true }
}

function stressStatus(marginPct: number | null, target: number): StressRow['status'] {
  if (marginPct === null || !Number.isFinite(marginPct)) return 'indefinido'
  if (marginPct < 0) return 'prejuizo'
  const tone = toneFor(marginPct, target)
  if (tone === 2) return 'meta'
  if (tone === 1) return 'perto'
  return 'longe'
}

/** Scales every cost line (BRL and US$) by `f`. */
export function scaleCost(i: FarmInputs, f: number): FarmInputs {
  return {
    ...i,
    costPerHaBrl: i.costPerHaBrl * f,
    costUsd: i.costUsd.map((l) => ({ ...l, usdPerHa: l.usdPerHa * f })),
    costScHa: i.costScHa * f,
  }
}

function nearestOk(m: Matrix): { row: number; col: number } | null {
  let best: { row: number; col: number; d: number; mg: number; fx: number } | null = null
  for (let r = 0; r < m.cells.length; r++) {
    for (let c = 0; c < m.cells[r].length; c++) {
      const cell = m.cells[r][c]
      if (cell.tone !== 2) continue
      const fx = Math.abs(m.fxPct[c])
      const d = Math.abs(m.cbotPct[r]) + fx
      const mg = cell.marginPct ?? Number.NEGATIVE_INFINITY
      const better =
        best === null ||
        d < best.d ||
        (d === best.d && (mg > best.mg || (mg === best.mg && fx < best.fx)))
      if (better) best = { row: r, col: c, d, mg, fx }
    }
  }
  return best === null ? null : { row: best.row, col: best.col }
}

/**
 * What, alone, takes the margin to the client's target (or out of it), how many matrix
 * scenarios meet it, the nearest one to today, and a stress table. Null without a target.
 * Margins are always in the client's `marginBase`.
 */
export function analyzeTarget(
  crop: CropConfig,
  scenario: Scenario,
  i: FarmInputs,
  matrix: Matrix,
): TargetAnalysis | null {
  const target = i.targetMargin
  if (target === null) return null

  const today = computeResult(crop, scenario, i)
  const m0 = today.marginPct
  const known = m0 !== null && Number.isFinite(m0)
  const d = known ? r4(m0 - target) : null
  const status: TargetAnalysis['status'] =
    d === null || d < 0 ? 'abaixo' : d > 0 ? 'acima' : 'na-meta'
  const gapPp = known && Number.isFinite(target) ? Math.abs(m0 - target) * 100 : null

  const p0 = today.farmPriceBrl
  const fxOk = Number.isFinite(scenario.fx) && scenario.fx > 0
  // Total BRL cost per ha at today's dollar and farm price (US$ lines and sc/ha rent folded in);
  // the cost lever keeps the scenario, so the rent value does not move with it.
  const folded = fxOk ? inputsAtPrice(i, scenario.fx, p0 ?? Number.NaN) : null
  const cost0 = folded !== null && Number.isFinite(folded.costPerHaBrl) ? folded.costPerHaBrl : null

  const levers: LeverResult[] = [
    // Farm price moved by shifting the freight: same scenario, price = P exactly.
    solveLever('preco', p0, target, (p) =>
      marginOf(crop, scenario, {
        ...i,
        freightBrlPerSc: i.freightBrlPerSc - (p - (p0 as number)),
      }),
    ),
    solveLever('cbot', scenario.cbotUsc, target, (x) =>
      marginOf(crop, { ...scenario, cbotUsc: x }, i),
    ),
    solveLever('dolar', scenario.fx, target, (x) => marginOf(crop, { ...scenario, fx: x }, i)),
    solveLever('produtividade', i.yieldScHa, target, (y) =>
      marginOf(crop, scenario, { ...i, yieldScHa: y }),
    ),
    solveLever('custo', cost0, target, (c) =>
      folded === null ? null : marginOf(crop, scenario, { ...folded, costPerHaBrl: c }),
    ),
  ]

  const stressDefs: { id: StressRow['id']; label: string; s: Scenario; i: FarmInputs }[] = [
    {
      id: 'cbot-10',
      label: 'CBOT −10%',
      s: { ...scenario, cbotUsc: scenario.cbotUsc * 0.9 },
      i,
    },
    { id: 'dolar-10', label: 'Dólar −10%', s: { ...scenario, fx: scenario.fx * 0.9 }, i },
    {
      id: 'prod-10',
      label: 'Produtividade −10%',
      s: scenario,
      i: { ...i, yieldScHa: i.yieldScHa * 0.9 },
    },
    { id: 'custo+10', label: 'Custo +10%', s: scenario, i: scaleCost(i, 1.1) },
    {
      id: 'combo',
      label: 'CBOT −10% + dólar −5% + produtividade −5%',
      s: { ...scenario, cbotUsc: scenario.cbotUsc * 0.9, fx: scenario.fx * 0.95 },
      i: { ...i, yieldScHa: i.yieldScHa * 0.95 },
    },
  ]
  const stress: StressRow[] = stressDefs.map((def) => {
    const raw = marginOf(crop, def.s, def.i)
    const marginPct = raw !== null && Number.isFinite(raw) ? raw : null
    return { id: def.id, label: def.label, marginPct, status: stressStatus(marginPct, target) }
  })

  return {
    status,
    gapPp,
    levers,
    cellsOk: okCount(matrix, target),
    cellsTotal: 81,
    nearest: nearestOk(matrix),
    stress,
  }
}
