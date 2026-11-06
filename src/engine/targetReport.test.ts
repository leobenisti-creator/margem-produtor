import { describe, expect, it } from 'vitest'
import type { FarmInputs, Scenario } from './calc'
import { CROPS } from './crops'
import { EMPTY_HEDGE_OP, activeHedge, type HedgeOp } from './hedge'
import type { SaleTranche } from './sales'
import { buildScenarioMatrix, stepsFromSize } from './scenarioMatrix'
import { ALL_FIXED, marginParts } from './sensitivity'
import { applyAxis, farmBasisBrlSc } from './scenarioMatrix'
import { BASIS_SHOCK, buildTargetReport } from './targetReport'

const crop = CROPS.soja
const today: Scenario = { cbotUsc: 1240, basisUsc: 60, fx: 5.5 }
const base: FarmInputs = {
  areaHa: 1000,
  yieldScHa: 60,
  costPerHaBrl: 4200,
  freightBrlPerSc: 8,
  portFeesBrlPerSc: 3,
  soldPct: 0,
  soldAvgPriceBrl: 0,
  targetMargin: 0.15,
  marginBase: 'receita',
  costUsd: [],
  fxLockPct: 0,
  fxLockRate: 0,
  costScHa: 0,
}
const steps = { cbotPct: 2.5, fxPct: 2.5 }
const report = (i: FarmInputs, tr: SaleTranche[] = [], s: Scenario = today) =>
  buildTargetReport(crop, s, today, i, tr, steps)!
const pctAt = (s: Scenario, i: FarmInputs, tr: SaleTranche[] = []) => {
  const p = marginParts(crop, s, i, tr, ALL_FIXED)!
  return p.margin / (i.marginBase === 'custo' ? p.cost : p.revenue)
}
const sale = (p: Partial<SaleTranche>): SaleTranche => ({
  id: 's1',
  volume: 20000,
  volumeUnit: 'sc',
  price: 130,
  priceCurrency: 'BRL',
  dollar: null,
  ...p,
})

describe('buildTargetReport: nothing to analyse', () => {
  it('is null without a target, and with no production', () => {
    expect(buildTargetReport(crop, today, today, { ...base, targetMargin: null }, [], steps)).toBeNull()
    expect(buildTargetReport(crop, today, today, { ...base, areaHa: 0 }, [], steps)).toBeNull()
  })
})

describe('verdict', () => {
  it('is the margin of the hero (marginParts with everything fixed), against the target in p.p.', () => {
    const r = report(base)
    const p = marginParts(crop, today, base, [], ALL_FIXED)!
    expect(r.verdict.marginTotal).toBeCloseTo(p.margin, 6)
    expect(r.verdict.marginPct).toBeCloseTo(p.margin / p.revenue, 12)
    expect(r.verdict.gapPp).toBeCloseTo(Math.abs(p.margin / p.revenue - 0.15) * 100, 9)
    expect(r.verdict.status).toBe(p.margin / p.revenue > 0.15 ? 'acima' : 'abaixo')
    expect(r.verdict.productionSc).toBe(60000)
  })

  it('the slack is the margin minus what the target asks for, in R$ and per sack, in either margin base', () => {
    for (const marginBase of ['receita', 'custo'] as const) {
      const i = { ...base, marginBase }
      const r = report(i)
      const p = marginParts(crop, today, i, [], ALL_FIXED)!
      const b = marginBase === 'custo' ? p.cost : p.revenue
      expect(r.verdict.targetTotal).toBeCloseTo(0.15 * b, 6)
      expect(r.verdict.slackTotal).toBeCloseTo(p.margin - 0.15 * b, 6)
      expect(r.verdict.slackPerSc).toBeCloseTo(r.verdict.slackTotal / 60000, 9)
      expect(r.base).toBe(marginBase)
    }
  })

  it('below / above / on the target', () => {
    expect(report({ ...base, targetMargin: 0.9 }).verdict.status).toBe('abaixo')
    expect(report({ ...base, targetMargin: 0.01 }).verdict.status).toBe('acima')
    const exact = pctAt(today, base)
    expect(report({ ...base, targetMargin: exact }).verdict.status).toBe('na-meta')
  })

  it('the shown scenario is used (not always today)', () => {
    const lower = { ...today, cbotUsc: 1000 }
    expect(report(base, [], lower).verdict.marginPct).toBeCloseTo(pctAt(lower, base), 12)
  })
})

describe('levers: each value really lands on the target / on zero', () => {
  const apply = (lever: string, v: number, s: Scenario, i: FarmInputs): [Scenario, FarmInputs] => {
    if (lever === 'cbot') return [{ ...s, cbotUsc: v }, i]
    if (lever === 'dolar') return [{ ...s, fx: v }, i]
    return [s, i]
  }
  for (const target of [0.3, 0.45]) {
    it(`CBOT and dollar alone reach the ${target * 100}% target`, () => {
      const i = { ...base, targetMargin: target }
      const r = report(i)
      for (const row of r.levers.filter((l) => ['cbot', 'dolar'].includes(l.lever))) {
        if (!row.toTarget.reachable) continue
        const [s, ii] = apply(row.lever, row.toTarget.value as number, today, i)
        expect(pctAt(s, ii)).toBeCloseTo(target, 6)
      }
    })
  }
  it('the basis lever lands on the target: the scenario with that basis (sales kept) has exactly that margin', () => {
    const i = { ...base, targetMargin: 0.3 }
    const tr = [sale({})]
    const r = report(i, tr)
    const row = r.levers.find((l) => l.lever === 'basis')!
    expect(row.toTarget.reachable).toBe(true)
    const basis0 = farmBasisBrlSc(crop, today, i) as number
    expect(row.current).toBeCloseTo(basis0, 9)
    // the basis moves by `delta` R$/sc: the scenario built by the matrix engine itself
    const moved = applyAxis(crop, today, 'basis', row.toTarget.delta as number, i)
    expect(pctAt(moved, i, tr)).toBeCloseTo(0.3, 6)
    expect((row.toTarget.value as number) - basis0).toBeCloseTo(row.toTarget.delta as number, 9)
    expect(row.toTarget.deltaPct).toBeNull()
  })
  it('the zero levers land on a zero margin', () => {
    const r = report(base)
    for (const row of r.levers.filter((l) => l.lever === 'cbot' || l.lever === 'dolar')) {
      if (!row.toZero.reachable) continue
      const [s, ii] = apply(row.lever, row.toZero.value as number, today, base)
      expect(pctAt(s, ii)).toBeCloseTo(0, 6)
    }
  })
  it('has the three market drivers and the cost (no productivity), each with its current value', () => {
    const r = report(base)
    expect(r.levers.map((l) => l.lever)).toEqual(['basis', 'cbot', 'dolar', 'custo'])
    expect(r.levers.find((l) => l.lever === 'cbot')!.current).toBe(1240)
    expect(r.levers.find((l) => l.lever === 'dolar')!.current).toBe(5.5)
    expect(r.levers.find((l) => l.lever === 'basis')!.current).toBeCloseTo(farmBasisBrlSc(crop, today, base) as number, 9)
  })
})

describe('prices', () => {
  it('farm price, the minimum price for the target and the break-even', () => {
    const r = report(base)
    expect(r.prices.farmPrice).toBeGreaterThan(0)
    expect(r.prices.minPrice).toBeGreaterThan(r.prices.breakEvenPrice as number)
    expect(r.prices.unsoldSc).toBe(60000)
  })
  it('with sales, the unsold sacks need a different price than the whole crop', () => {
    const r = report({ ...base, targetMargin: 0.3 }, [sale({ volume: 30000, price: 100 })])
    expect(r.prices.unsoldSc).toBe(30000)
    expect(r.prices.unsoldNeeded).not.toBeNull()
    expect(r.prices.unsoldNeeded as number).toBeGreaterThan(r.prices.minPrice as number)
  })
  it('everything sold: no price of the unsold sacks', () => {
    const r = report({ ...base, targetMargin: 0.3 }, [sale({ volume: 60000, price: 130 })])
    expect(r.prices.unsoldSc).toBe(0)
    expect(r.prices.unsoldNeeded).toBeNull()
  })
})

describe('sensitivity of ±10%', () => {
  it('CBOT, dollar and basis hurt when they fall, cost hurts when it rises; sorted by the size of the swing', () => {
    const r = report(base)
    const by = Object.fromEntries(r.sensitivity.map((s) => [s.id, s]))
    expect(by.cbot.down.deltaPp as number).toBeLessThan(0)
    expect(by.cbot.up.deltaPp as number).toBeGreaterThan(0)
    expect(by.dolar.down.deltaPp as number).toBeLessThan(0)
    expect(by.basis.down.deltaPp as number).toBeLessThan(0)
    expect(by.basis.up.deltaPp as number).toBeGreaterThan(0)
    expect(by.produtividade).toBeUndefined()
    expect(by.custo.up.deltaPp as number).toBeLessThan(0)
    expect(by.custo.down.deltaPp as number).toBeGreaterThan(0)
    const sw = r.sensitivity.map((s) => s.swingPp)
    expect([...sw].sort((a, z) => z - a)).toEqual(sw)
  })
  it('the p.p. are exact: margin % of the moved scenario minus the margin % of the scenario', () => {
    const r = report(base)
    const cbot = r.sensitivity.find((s) => s.id === 'cbot')!
    expect(cbot.down.deltaPp).toBeCloseTo((pctAt({ ...today, cbotUsc: 1240 * 0.9 }, base) - pctAt(today, base)) * 100, 9)
  })
})

describe('grid', () => {
  it('counts add up to 81 and match the matrix cells, with the same traffic light', () => {
    const i = { ...base, targetMargin: 0.3 }
    const g = report(i).grid!
    expect(g.green + g.amber + g.red + g.unknown).toBe(81)
    const m = buildScenarioMatrix({
      crop,
      scenario: today,
      inputs: i,
      tranches: [],
      rowAxis: 'cbot',
      colAxis: 'dolar',
      lens: 'tudo',
      axisStepsPct: { cbot: stepsFromSize(2.5), dolar: stepsFromSize(2.5) },
    })
    const count = (t: number) => m.cells.flat().filter((c) => c.tone === t).length
    expect(g.green).toBe(count(2))
    expect(g.amber).toBe(count(1))
    expect(g.red).toBe(count(0))
  })
  it('below the target the nearest cell is the closest GREEN one; above it is the closest one that is not green', () => {
    const below = report({ ...base, targetMargin: 0.4 }).grid!
    if (below.nearest) {
      expect(below.nearest.kind).toBe('bate')
      expect(below.nearest.marginPct as number).toBeGreaterThanOrEqual(0.4 - 1e-9)
    }
    const above = report({ ...base, targetMargin: 0.3 }).grid!
    if (above.nearest) {
      expect(above.nearest.kind).toBe('sai')
      expect(above.nearest.marginPct as number).toBeLessThan(0.3)
    }
  })
  it('min and max are the extremes of the cells', () => {
    const g = report(base).grid!
    expect(g.minPct as number).toBeLessThan(g.maxPct as number)
  })
})

describe('stress', () => {
  it('six rows with the margin of each shock and its status against the target', () => {
    const i = { ...base, targetMargin: 0.3 }
    const r = report(i)
    expect(r.stress.map((s) => s.id)).toEqual(['cbot-10', 'dolar-10', 'basis-5', 'custo+10', 'combo', 'favoravel'])
    expect(r.stress[2].marginPct).toBeCloseTo(pctAt(applyAxis(crop, today, 'basis', -BASIS_SHOCK, i), i), 12)
    expect(r.stress[0].marginPct).toBeCloseTo(pctAt({ ...today, cbotUsc: 1240 * 0.9 }, i), 12)
    expect(r.stress[5].marginPct as number).toBeGreaterThan(r.stress[4].marginPct as number)
    for (const s of r.stress) expect(['meta', 'perto', 'longe', 'prejuizo', 'indefinido']).toContain(s.status)
  })
  it('a margin below zero is "prejuizo"', () => {
    const r = report({ ...base, costPerHaBrl: 12000 })
    expect(r.stress.some((s) => s.status === 'prejuizo')).toBe(true)
  })
})

describe('sales and market operations', () => {
  it('no sales and no operations: neither block', () => {
    const r = report(base)
    expect(r.sales).toBeNull()
    expect(r.hedge).toBeNull()
  })
  it('each sale against the minimum price, and the sacks above/below it', () => {
    const r = report({ ...base, targetMargin: 0.3 }, [
      sale({ id: 'a', volume: 20000, price: 150 }),
      sale({ id: 'b', volume: 10000, price: 90 }),
    ])
    const s = r.sales!
    expect(s.soldSc).toBe(30000)
    expect(s.avgPriceBrl).toBeCloseTo((20000 * 150 + 10000 * 90) / 30000, 9)
    expect(s.tranches.map((t) => t.id)).toEqual(['a', 'b'])
    expect(s.aboveMinSc + s.belowMinSc).toBe(30000)
    expect(s.tranches[0].vsMinBrl).toBeCloseTo(150 - (r.prices.minPrice as number), 9)
  })
  it('a US$ sale is valued at its own dollar, or at the scenario dollar when open', () => {
    const fixed = report(base, [sale({ priceCurrency: 'USD', price: 25, dollar: 5 })]).sales!
    expect(fixed.tranches[0].priceBrl).toBeCloseTo(125, 9)
    const open = report(base, [sale({ priceCurrency: 'USD', price: 25, dollar: null, marketDollar: 5.5 })]).sales!
    expect(open.tranches[0].priceBrl).toBeCloseTo(25 * 5.5, 9)
  })
  it('market operations: their R$ and the margin without them', () => {
    const fut: HedgeOp = {
      id: 'f',
      ...EMPTY_HEDGE_OP,
      kind: 'futuro',
      side: 'vendido',
      qty: 150_000,
      strike: 1300,
      maturityDate: '2027-07-15',
    }
    const hedge = activeHedge([fut], 5.5, { today: '2026-11-06', crop: 'soja' })!
    const i = { ...base, hedge }
    const r = report(i)
    const p = marginParts(crop, today, i, [], ALL_FIXED)!
    expect(r.hedge!.brl).toBeCloseTo(p.hedge, 6)
    expect(r.hedge!.perSc).toBeCloseTo(p.hedge / 60000, 9)
    expect(r.hedge!.pctWithout as number).toBeCloseTo((p.margin - p.hedge) / (p.revenue - p.hedge), 12)
    expect(r.hedge!.gapWithoutPp as number).toBeCloseTo(((p.margin - p.hedge) / (p.revenue - p.hedge) - 0.15) * 100, 9)
  })
})
