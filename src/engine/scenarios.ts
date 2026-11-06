/**
 * Ready-made scenarios (today, pessimistic, optimistic, stress, break-even, target) and the margin bridge (what the
 * sales, the market operations and the US$ costs already bought are worth). Pure: no store, no React.
 */
import type { FarmInputs, Scenario } from './calc'
import type { CropConfig } from './crops'
import { hedgeRealizedBrl } from './hedge'
import { applyAxes } from './scenarioMatrix'
import { marginParts, ALL_FIXED, NOTHING_FIXED, type Fixings, type MarginParts } from './sensitivity'
import type { SaleTranche } from './sales'

export type ReadyId = 'hoje' | 'pessimista' | 'otimista' | 'estresse' | 'equilibrio' | 'meta'

export interface ReadyScenario {
  id: ReadyId
  label: string
  scenario: Scenario
  /** Margin with everything fixed (R$, whole crop); null when it cannot be computed. */
  total: number | null
  perSc: number | null
  /** Margin % in the producer's base. */
  pct: number | null
  /** Farm price (R$/sc) at the scenario. */
  priceBrl: number | null
  /** What the scenario is, in words ("CBOT −5%, dólar −5%, basis −R$ 1/sc"), or why it does not exist. */
  note: string
}

export interface ReadyInput {
  crop: CropConfig
  scenario: Scenario
  inputs: FarmInputs
  tranches: SaleTranche[]
}

/** The moves of the pessimistic, optimistic and stress scenarios: % of CBOT and dollar, R$/sc of basis. */
export const SCENARIO_MOVES = {
  pessimista: { pct: -5, basis: -1 },
  otimista: { pct: 5, basis: 1 },
  estresse: { pct: -10, basis: -2 },
} as const

const finite = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)

const pctText = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n)}%`
const brlText = (n: number) => `${n > 0 ? '+' : '−'}R$ ${Math.abs(n).toLocaleString('pt-BR')}/sc`

function evaluate(i: ReadyInput, s: Scenario): Omit<ReadyScenario, 'id' | 'label' | 'scenario' | 'note'> {
  const f = marginParts(i.crop, s, i.inputs, i.tranches, ALL_FIXED)
  if (f === null) return { total: null, perSc: null, pct: null, priceBrl: null }
  const base = i.inputs.marginBase === 'custo' ? f.cost : f.revenue
  return {
    total: f.margin,
    perSc: f.productionSc > 0 ? f.margin / f.productionSc : null,
    pct: base > 0 ? f.margin / base : null,
    priceBrl: f.farmPrice,
  }
}

/**
 * The CBOT (US¢/bu, other drivers at today's value) nearest to today at which `g` crosses zero; null when it does not
 * cross between 25% and 250% of today's CBOT. Scan + bisection.
 */
function solveCbot(i: ReadyInput, g: (s: Scenario) => number | null): number | null {
  const c0 = i.scenario.cbotUsc
  if (!(c0 > 0)) return null
  const at = (c: number) => g({ ...i.scenario, cbotUsc: c })
  const steps = 200
  const lo = c0 * 0.25
  const hi = c0 * 2.5
  let best: [number, number] | null = null
  let prevC = lo
  let prevV = at(lo)
  for (let k = 1; k <= steps; k++) {
    const c = lo + ((hi - lo) * k) / steps
    const v = at(c)
    if (prevV !== null && v !== null && ((prevV <= 0 && v >= 0) || (prevV >= 0 && v <= 0))) {
      const mid = (prevC + c) / 2
      if (best === null || Math.abs(mid - c0) < Math.abs((best[0] + best[1]) / 2 - c0)) best = [prevC, c]
    }
    prevC = c
    prevV = v
  }
  if (best === null) return null
  let [a, b] = best
  let va = at(a) as number
  for (let k = 0; k < 60; k++) {
    const m = (a + b) / 2
    const vm = at(m)
    if (vm === null) break
    if ((va <= 0 && vm <= 0) || (va >= 0 && vm >= 0)) {
      a = m
      va = vm
    } else b = m
  }
  return (a + b) / 2
}

/** Today, pessimistic, optimistic, stress, break-even CBOT and (when a target is set) the CBOT that gives the target. */
export function readyScenarios(i: ReadyInput): ReadyScenario[] {
  const moved = (pct: number, basis: number): Scenario =>
    applyAxes(
      i.crop,
      i.scenario,
      [
        ['cbot', pct],
        ['dolar', pct],
        ['basis', basis],
      ],
      i.inputs,
    )
  const make = (id: ReadyId, label: string, scenario: Scenario, note: string): ReadyScenario => ({
    id,
    label,
    scenario,
    note,
    ...evaluate(i, scenario),
  })
  const move = (m: { pct: number; basis: number }) =>
    `CBOT ${pctText(m.pct)}, dólar ${pctText(m.pct)}, basis ${brlText(m.basis)}`
  const out: ReadyScenario[] = [
    make('hoje', 'Hoje', i.scenario, 'o mercado de hoje'),
    make(
      'pessimista',
      'Pessimista',
      moved(SCENARIO_MOVES.pessimista.pct, SCENARIO_MOVES.pessimista.basis),
      move(SCENARIO_MOVES.pessimista),
    ),
    make(
      'otimista',
      'Otimista',
      moved(SCENARIO_MOVES.otimista.pct, SCENARIO_MOVES.otimista.basis),
      move(SCENARIO_MOVES.otimista),
    ),
    make(
      'estresse',
      'Estresse',
      moved(SCENARIO_MOVES.estresse.pct, SCENARIO_MOVES.estresse.basis),
      move(SCENARIO_MOVES.estresse),
    ),
  ]
  const margin = (s: Scenario) => marginParts(i.crop, s, i.inputs, i.tranches, ALL_FIXED)?.margin ?? null
  const be = solveCbot(i, margin)
  out.push(
    be === null
      ? {
          id: 'equilibrio',
          label: 'Equilíbrio',
          scenario: i.scenario,
          total: null,
          perSc: null,
          pct: null,
          priceBrl: null,
          note: 'a margem não zera com o CBOT entre 25% e 250% de hoje',
        }
      : make(
          'equilibrio',
          'Equilíbrio',
          { ...i.scenario, cbotUsc: be },
          `CBOT em ${be.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} US¢/bu: a margem zera`,
        ),
  )
  const target = i.inputs.targetMargin
  if (target !== null) {
    const base = i.inputs.marginBase === 'custo' ? 'cost' : 'revenue'
    const gap = (s: Scenario) => {
      const f = marginParts(i.crop, s, i.inputs, i.tranches, ALL_FIXED)
      if (f === null) return null
      const b = f[base]
      return b > 0 ? f.margin / b - target : null
    }
    const c = solveCbot(i, gap)
    out.push(
      c === null
        ? {
            id: 'meta',
            label: 'Meta',
            scenario: i.scenario,
            total: null,
            perSc: null,
            pct: null,
            priceBrl: null,
            note: 'a meta não é atingida com o CBOT entre 25% e 250% de hoje',
          }
        : make(
            'meta',
            'Meta',
            { ...i.scenario, cbotUsc: c },
            `CBOT em ${c.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} US¢/bu: margem na sua meta`,
          ),
    )
  }
  return out
}

export interface BridgeStep {
  key: 'sem' | 'vendas' | 'operacoes' | 'custos' | 'final'
  label: string
  /** The margin (for the two totals) or the change it brings (for the others), R$ for the whole crop. */
  value: number
  kind: 'total' | 'delta'
  /** Operations only: the part already realized and the part still at the scenario. */
  detail?: { realized: number; projected: number }
}

/**
 * The margin bridge at a scenario: margin with nothing fixed, + what the sales already made add, + the market operations,
 * + the US$ costs already bought = margin with everything fixed. The three effects add up exactly to the difference.
 */
export function marginBridge(i: ReadyInput, scenario: Scenario = i.scenario): BridgeStep[] | null {
  const at = (fix: Fixings): MarginParts | null => marginParts(i.crop, scenario, i.inputs, i.tranches, fix)
  const m0 = at(NOTHING_FIXED)
  const m1 = at({ sales: true, ops: false, costs: false })
  const m2 = at({ sales: true, ops: true, costs: false })
  const m3 = at(ALL_FIXED)
  if (m0 === null || m1 === null || m2 === null || m3 === null) return null
  const realized = hedgeRealizedBrl(i.inputs.hedge, scenario.cbotUsc, scenario.fx)
  const ops = m2.margin - m1.margin
  return [
    { key: 'sem', label: 'Sem nada fixado', value: m0.margin, kind: 'total' },
    { key: 'vendas', label: 'Vendas já feitas', value: m1.margin - m0.margin, kind: 'delta' },
    {
      key: 'operacoes',
      label: 'Operações financeiras',
      value: ops,
      kind: 'delta',
      detail: finite(realized) ? { realized, projected: ops - realized } : { realized: 0, projected: ops },
    },
    { key: 'custos', label: 'Custos em dólar já comprados', value: m3.margin - m2.margin, kind: 'delta' },
    { key: 'final', label: 'Margem com o que você fixou', value: m3.margin, kind: 'total' },
  ]
}
