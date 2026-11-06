/**
 * The full "Análise da meta" of the Resultados page: everything that can be said about the margin target for the scenario
 * the producer is looking at. Pure: no store, no React.
 *
 * It reads the margin exactly as the hero and the matrix do (`marginParts` with everything the producer fixed: sales at
 * their own price and dollar, market operations, US$ costs), so the numbers here never disagree with the DRE. The margin
 * % is the one of the producer's base (receita or custo); the target is compared in percentage points (p.p.).
 */
import { computeResult, inputsAtPrice, type FarmInputs, type Scenario } from './calc'
import type { CropConfig } from './crops'
import { toneFor, type Tone } from './matrix'
import { productionOf } from './production'
import { soldSummary, trancheBrlAt, trancheProblem, trancheSc, type SaleTranche } from './sales'
import { applyAxis, buildScenarioMatrix, farmBasisBrlSc, stepsFromSize, type MatrixCell } from './scenarioMatrix'
import { ALL_FIXED, marginParts, type MarginParts } from './sensitivity'
import { scaleCost, solveLever, type LeverResult } from './targetAnalysis'

/** Size of one step of the matrix grid (the Resultados settings): % of CBOT, % of dollar. */
export interface GridSteps {
  cbotPct: number
  fxPct: number
}

export type TargetStatus = 'abaixo' | 'acima' | 'na-meta'
export type StressStatus = 'meta' | 'perto' | 'longe' | 'prejuizo' | 'indefinido'

export interface Verdict {
  /** Margin % in the producer's base; null while it cannot be computed. */
  marginPct: number | null
  /** Distance to the target in p.p. (>= 0); null when the margin is unknown. */
  gapPp: number | null
  status: TargetStatus
  productionSc: number
  /** Margin, the margin the target asks for and the difference (all R$, whole crop). */
  marginTotal: number
  targetTotal: number
  slackTotal: number
  /** The same per sack of the production. */
  marginPerSc: number
  targetPerSc: number
  slackPerSc: number
  /** Revenue and cost of the crop (R$). */
  revenue: number
  cost: number
}

export interface PriceView {
  /** Farm price of the scenario (R$/sc), what the sacks not sold yet are worth. */
  farmPrice: number | null
  /** Average price over the whole crop that gives the target / a zero margin (the app's definitions). */
  minPrice: number | null
  breakEvenPrice: number | null
  /** Price the sacks NOT sold yet need for the whole-crop margin to reach the target (sales and operations kept); null when none is unsold or it cannot be reached. */
  unsoldNeeded: number | null
  unsoldSc: number
}

/** The factors that move the margin, alone: the three market drivers and the cost. */
export type ReportLever = 'basis' | 'cbot' | 'dolar' | 'custo'

/** A value of a factor that puts the margin on a goal, alone. */
export interface LeverPoint {
  reachable: boolean
  /** In the factor's unit: R$/sc (basis), US¢/bu, R$/US$, R$/ha. */
  value: number | null
  /** value - today's value, in the same unit. */
  delta: number | null
  /** Variation in % of today's value; null for the basis (a spread, it can be negative: its move is `delta`). */
  deltaPct: number | null
  /** The size of the move relative to today's farm price or value, in % (always set when reachable): what the ranking uses. */
  rel: number | null
}

export interface LeverRow {
  lever: ReportLever
  /** Today's value of the factor, in its own unit. */
  current: number | null
  /** What takes the margin to the target, alone / to zero, alone. */
  toTarget: LeverPoint
  toZero: LeverPoint
}

/** Size of the basis move used by the sensitivity and the stress rows, in R$/sc. */
export const BASIS_SHOCK = 5
/** Smaller basis move of the combined stress rows, in R$/sc. */
export const BASIS_SHOCK_COMBO = 3

export interface SensitivityRow {
  id: 'cbot' | 'dolar' | 'basis' | 'custo'
  label: string
  /** The factor 10% lower / 10% higher (the basis R$ 5/sc lower / higher): margin %, change in p.p. and in R$/sc of the production. */
  down: { marginPct: number | null; deltaPp: number | null; deltaPerSc: number | null }
  up: { marginPct: number | null; deltaPp: number | null; deltaPerSc: number | null }
  /** |down| + |up| in p.p. (what the sort uses); 0 when unknown. */
  swingPp: number
}

export interface GridView {
  total: number
  green: number
  amber: number
  red: number
  unknown: number
  /** Margin % range over the grid. */
  minPct: number | null
  maxPct: number | null
  /**
   * Below the target: the green cell closest to today. On or above: the closest cell that is not green (what takes you
   * out of the target). Distance = |CBOT %| + |dollar %|; a tie goes to the bigger margin for the green, the smaller for
   * the other. Null when there is none.
   */
  nearest: { kind: 'bate' | 'sai'; cbotUsc: number; fx: number; cbotPct: number; fxPct: number; marginPct: number | null } | null
}

export interface StressRow {
  id: 'cbot-10' | 'dolar-10' | 'basis-5' | 'custo+10' | 'combo' | 'favoravel'
  label: string
  marginPct: number | null
  /** Margin per sack (R$) at the stress; null when unknown. */
  marginPerSc: number | null
  status: StressStatus
}

export interface SaleView {
  id: string
  sc: number
  /** R$/sc at the scenario dollar. */
  priceBrl: number
  /** priceBrl - the price that gives the target over the whole crop; null without that price. */
  vsMinBrl: number | null
}

export interface SalesView {
  soldSc: number
  soldPct: number
  avgPriceBrl: number | null
  /** The sales, the biggest first. */
  tranches: SaleView[]
  /** Sacks sold at or above the minimum price / below it. */
  aboveMinSc: number
  belowMinSc: number
}

export interface HedgeView {
  brl: number
  perSc: number
  /** Margin % if the market operations were not there (same scenario), and its distance to the target in p.p. */
  pctWithout: number | null
  gapWithoutPp: number | null
}

export interface TargetReport {
  target: number
  base: 'receita' | 'custo'
  verdict: Verdict
  prices: PriceView
  levers: LeverRow[]
  sensitivity: SensitivityRow[]
  grid: GridView | null
  stress: StressRow[]
  sales: SalesView | null
  hedge: HedgeView | null
}

const r4 = (n: number) => Math.round(n * 10000) / 10000
const fin = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)

const baseOf = (p: MarginParts, i: FarmInputs) => (i.marginBase === 'custo' ? p.cost : p.revenue)

/** Margin % (producer's base) of a scenario with everything fixed; null when it cannot be computed. */
function marginPctAt(crop: CropConfig, s: Scenario, i: FarmInputs, tranches: SaleTranche[]): number | null {
  const p = marginParts(crop, s, i, tranches, ALL_FIXED)
  if (p === null) return null
  const b = baseOf(p, i)
  return b > 0 ? p.margin / b : null
}

function stressStatus(pct: number | null, target: number): StressStatus {
  if (pct === null || !Number.isFinite(pct)) return 'indefinido'
  if (pct < 0) return 'prejuizo'
  const tone = toneFor(pct, target)
  return tone === 2 ? 'meta' : tone === 1 ? 'perto' : 'longe'
}

/**
 * The whole analysis of the target for `scenario` (the one on screen). `today` is the market the grid is centred on.
 * Null without a target, with no production or when the scenario cannot be computed.
 */
export function buildTargetReport(
  crop: CropConfig,
  scenario: Scenario,
  today: Scenario,
  inputs: FarmInputs,
  tranches: SaleTranche[],
  steps: GridSteps,
): TargetReport | null {
  const target = inputs.targetMargin
  if (target === null || !Number.isFinite(target)) return null
  const parts = marginParts(crop, scenario, inputs, tranches, ALL_FIXED)
  if (parts === null) return null
  const P = parts.productionSc
  const base = baseOf(parts, inputs)
  const marginPct = base > 0 ? parts.margin / base : null

  // ── verdict ──
  const d = marginPct === null ? null : r4(marginPct - target)
  const status: TargetStatus = d === null || d < 0 ? 'abaixo' : d > 0 ? 'acima' : 'na-meta'
  const targetTotal = target * base
  const verdict: Verdict = {
    marginPct,
    gapPp: marginPct === null ? null : Math.abs(marginPct - target) * 100,
    status,
    productionSc: P,
    marginTotal: parts.margin,
    targetTotal,
    slackTotal: parts.margin - targetTotal,
    marginPerSc: parts.margin / P,
    targetPerSc: targetTotal / P,
    slackPerSc: (parts.margin - targetTotal) / P,
    revenue: parts.revenue,
    cost: parts.cost,
  }

  // ── levers (alone, to the target and to zero) ──
  const p0 = parts.farmPrice
  const folded = Number.isFinite(scenario.fx) && scenario.fx > 0 ? inputsAtPrice(inputs, scenario.fx, p0) : null
  const cost0 = folded !== null && Number.isFinite(folded.costPerHaBrl) ? folded.costPerHaBrl : null
  const basis0 = farmBasisBrlSc(crop, scenario, inputs)
  const point = (x: LeverResult, current: number | null): LeverPoint =>
    x.reachable && x.value !== null && current !== null
      ? { reachable: true, value: x.value, delta: x.value - current, deltaPct: x.deltaPct, rel: x.deltaPct }
      : { reachable: false, value: null, delta: null, deltaPct: null, rel: null }
  // The basis is the farm price minus the CBOT, so moving it by x R$/sc moves the farm price by exactly x: the same solve
  // as the price of the sacks not sold yet, read as a basis.
  const priceLever = (t: number) =>
    solveLever('preco', p0, t, (p) =>
      marginPctAt(crop, scenario, { ...inputs, freightBrlPerSc: inputs.freightBrlPerSc - (p - p0) }, tranches),
    )
  const basisPoint = (x: LeverResult): LeverPoint => {
    if (!x.reachable || x.value === null || basis0 === null) return { reachable: false, value: null, delta: null, deltaPct: null, rel: null }
    const delta = x.value - p0
    return { reachable: true, value: basis0 + delta, delta, deltaPct: null, rel: x.deltaPct }
  }
  const solveAll = (t: number): LeverPoint[] => [
    basisPoint(priceLever(t)),
    point(
      solveLever('cbot', scenario.cbotUsc, t, (x) => marginPctAt(crop, { ...scenario, cbotUsc: x }, inputs, tranches)),
      scenario.cbotUsc,
    ),
    point(
      solveLever('dolar', scenario.fx, t, (x) => marginPctAt(crop, { ...scenario, fx: x }, inputs, tranches)),
      scenario.fx,
    ),
    point(
      solveLever('custo', cost0, t, (c) =>
        folded === null ? null : marginPctAt(crop, scenario, { ...folded, costPerHaBrl: c }, tranches),
      ),
      cost0,
    ),
  ]
  const toTarget = solveAll(target)
  const toZero = solveAll(0)
  const current: Record<ReportLever, number | null> = {
    basis: basis0,
    cbot: scenario.cbotUsc,
    dolar: scenario.fx,
    custo: cost0,
  }
  const names: ReportLever[] = ['basis', 'cbot', 'dolar', 'custo']
  const levers: LeverRow[] = names.map((lever, k) => ({
    lever,
    current: current[lever],
    toTarget: toTarget[k],
    toZero: toZero[k],
  }))

  // ── prices ──
  const plain = computeResult(crop, scenario, inputs)
  const unsold = Math.max(0, P - parts.soldSc)
  const unsoldLever = priceLever(target)
  const prices: PriceView = {
    farmPrice: p0,
    minPrice: plain.minPriceBrl,
    breakEvenPrice: plain.breakEven.priceBrl,
    unsoldNeeded: unsold > 0 && unsoldLever.reachable ? unsoldLever.value : null,
    unsoldSc: unsold,
  }

  // ── sensitivity of ±10% ──
  const m0 = parts.margin
  const at = (s: Scenario, i: FarmInputs) => {
    const p = marginParts(crop, s, i, tranches, ALL_FIXED)
    if (p === null) return { marginPct: null, deltaPp: null, deltaPerSc: null }
    const b = baseOf(p, i)
    const pct = b > 0 ? p.margin / b : null
    return {
      marginPct: pct,
      deltaPp: pct === null || marginPct === null ? null : (pct - marginPct) * 100,
      deltaPerSc: p.productionSc > 0 ? (p.margin - m0) / p.productionSc : null,
    }
  }
  const factors: { id: SensitivityRow['id']; label: string; down: [Scenario, FarmInputs]; up: [Scenario, FarmInputs] }[] = [
    {
      id: 'cbot',
      label: 'CBOT',
      down: [{ ...scenario, cbotUsc: scenario.cbotUsc * 0.9 }, inputs],
      up: [{ ...scenario, cbotUsc: scenario.cbotUsc * 1.1 }, inputs],
    },
    {
      id: 'dolar',
      label: 'Dólar',
      down: [{ ...scenario, fx: scenario.fx * 0.9 }, inputs],
      up: [{ ...scenario, fx: scenario.fx * 1.1 }, inputs],
    },
    {
      id: 'basis',
      label: `Basis (R$ ${BASIS_SHOCK}/sc)`,
      down: [applyAxis(crop, scenario, 'basis', -BASIS_SHOCK, inputs), inputs],
      up: [applyAxis(crop, scenario, 'basis', BASIS_SHOCK, inputs), inputs],
    },
    {
      id: 'custo',
      label: 'Custo',
      down: [scenario, scaleCost(inputs, 0.9)],
      up: [scenario, scaleCost(inputs, 1.1)],
    },
  ]
  const sensitivity: SensitivityRow[] = factors
    .map((f) => {
      const down = at(...f.down)
      const up = at(...f.up)
      return { id: f.id, label: f.label, down, up, swingPp: Math.abs(down.deltaPp ?? 0) + Math.abs(up.deltaPp ?? 0) }
    })
    .sort((a, z) => z.swingPp - a.swingPp)

  // ── the 9×9 grid CBOT × dollar around today ──
  let grid: GridView | null = null
  try {
    const m = buildScenarioMatrix({
      crop,
      scenario: today,
      inputs,
      tranches,
      rowAxis: 'cbot',
      colAxis: 'dolar',
      lens: 'tudo',
      axisStepsPct: { cbot: stepsFromSize(steps.cbotPct), dolar: stepsFromSize(steps.fxPct) },
    })
    const counts = { green: 0, amber: 0, red: 0, unknown: 0 }
    let minPct: number | null = null
    let maxPct: number | null = null
    let best: { cell: MatrixCell; d: number; mg: number; row: number; col: number } | null = null
    const wantGreen = status === 'abaixo'
    for (let r = 0; r < m.cells.length; r++) {
      for (let c = 0; c < m.cells[r].length; c++) {
        const cell = m.cells[r][c]
        const tone: Tone = cell.tone
        if (tone === 2) counts.green++
        else if (tone === 1) counts.amber++
        else if (tone === 0) counts.red++
        else counts.unknown++
        if (fin(cell.pct)) {
          minPct = minPct === null ? cell.pct : Math.min(minPct, cell.pct)
          maxPct = maxPct === null ? cell.pct : Math.max(maxPct, cell.pct)
        }
        if (tone === null || (wantGreen ? tone !== 2 : tone === 2) || (r === 4 && c === 4)) continue
        const dist = Math.abs(m.rowDelta[r]) + Math.abs(m.colDelta[c])
        const mg = cell.pct ?? Number.NEGATIVE_INFINITY
        const better =
          best === null || dist < best.d || (dist === best.d && (wantGreen ? mg > best.mg : mg < best.mg))
        if (better) best = { cell, d: dist, mg, row: r, col: c }
      }
    }
    grid = {
      total: 81,
      ...counts,
      minPct,
      maxPct,
      nearest:
        best === null
          ? null
          : {
              kind: wantGreen ? 'bate' : 'sai',
              cbotUsc: best.cell.scenario.cbotUsc,
              fx: best.cell.scenario.fx,
              cbotPct: m.rowDelta[best.row],
              fxPct: m.colDelta[best.col],
              marginPct: best.cell.pct,
            },
    }
  } catch {
    grid = null
  }

  // ── stress ──
  const stressDefs: { id: StressRow['id']; label: string; s: Scenario; i: FarmInputs }[] = [
    { id: 'cbot-10', label: 'CBOT −10%', s: { ...scenario, cbotUsc: scenario.cbotUsc * 0.9 }, i: inputs },
    { id: 'dolar-10', label: 'Dólar −10%', s: { ...scenario, fx: scenario.fx * 0.9 }, i: inputs },
    {
      id: 'basis-5',
      label: `Basis −R$ ${BASIS_SHOCK}/sc`,
      s: applyAxis(crop, scenario, 'basis', -BASIS_SHOCK, inputs),
      i: inputs,
    },
    { id: 'custo+10', label: 'Custo +10%', s: scenario, i: scaleCost(inputs, 1.1) },
    {
      id: 'combo',
      label: `CBOT −10% + dólar −5% + basis −R$ ${BASIS_SHOCK_COMBO}/sc`,
      s: applyAxis(
        crop,
        { ...scenario, cbotUsc: scenario.cbotUsc * 0.9, fx: scenario.fx * 0.95 },
        'basis',
        -BASIS_SHOCK_COMBO,
        inputs,
      ),
      i: inputs,
    },
    {
      id: 'favoravel',
      label: `CBOT +10% + dólar +5% + basis +R$ ${BASIS_SHOCK_COMBO}/sc`,
      s: applyAxis(
        crop,
        { ...scenario, cbotUsc: scenario.cbotUsc * 1.1, fx: scenario.fx * 1.05 },
        'basis',
        BASIS_SHOCK_COMBO,
        inputs,
      ),
      i: inputs,
    },
  ]
  const stress: StressRow[] = stressDefs.map((def) => {
    const p = marginParts(crop, def.s, def.i, tranches, ALL_FIXED)
    const b = p === null ? 0 : baseOf(p, def.i)
    const pct = p === null || !(b > 0) ? null : p.margin / b
    return {
      id: def.id,
      label: def.label,
      marginPct: pct,
      marginPerSc: p === null || !(p.productionSc > 0) ? null : p.margin / p.productionSc,
      status: stressStatus(pct, target),
    }
  })

  // ── sales ──
  let sales: SalesView | null = null
  const valid = tranches.filter((t) => trancheProblem(t) === null)
  if (valid.length > 0) {
    const summary = soldSummary(tranches, productionOf(inputs), crop.bushelsPerSack)
    const views: SaleView[] = []
    for (const t of valid) {
      const priceBrl = trancheBrlAt(t, scenario.fx)
      if (priceBrl === null) continue
      views.push({
        id: t.id,
        sc: trancheSc(t, crop.bushelsPerSack),
        priceBrl,
        vsMinBrl: prices.minPrice === null ? null : priceBrl - prices.minPrice,
      })
    }
    views.sort((a, z) => z.sc - a.sc)
    sales = {
      soldSc: summary.soldSc,
      soldPct: summary.soldPct,
      avgPriceBrl: summary.avgPriceBrl,
      tranches: views,
      aboveMinSc: views.filter((v) => v.vsMinBrl !== null && v.vsMinBrl >= 0).reduce((n, v) => n + v.sc, 0),
      belowMinSc: views.filter((v) => v.vsMinBrl !== null && v.vsMinBrl < 0).reduce((n, v) => n + v.sc, 0),
    }
  }

  // ── market operations ──
  let hedge: HedgeView | null = null
  if (Math.abs(parts.hedge) > 0.5) {
    const baseWithout = inputs.marginBase === 'custo' ? parts.cost : parts.revenue - parts.hedge
    const pctWithout = baseWithout > 0 ? (parts.margin - parts.hedge) / baseWithout : null
    hedge = {
      brl: parts.hedge,
      perSc: parts.hedge / P,
      pctWithout,
      gapWithoutPp: pctWithout === null ? null : (pctWithout - target) * 100,
    }
  }

  return {
    target,
    base: inputs.marginBase === 'custo' ? 'custo' : 'receita',
    verdict,
    prices,
    levers,
    sensitivity,
    grid,
    stress,
    sales,
    hedge,
  }
}
