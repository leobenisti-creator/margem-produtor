import { describe, expect, it } from 'vitest'
import { CROPS } from './crops'
import { computeResult, effectiveFx, farmPriceBrl, type FarmInputs, type Scenario } from './calc'
import { DEFAULT_STEPS_PCT, buildMatrix, type MatrixOptions } from './matrix'
import { analyzeTarget } from './targetAnalysis'

const soja = CROPS.soja
const today: Scenario = { cbotUsc: 1241.25, basisUsc: 61.7, fx: 5.4998 }
const cs: FarmInputs = {
  areaHa: 1000,
  yieldScHa: 60.4,
  costPerHaBrl: 5895.52,
  freightBrlPerSc: 27.6762,
  portFeesBrlPerSc: 5.2,
  soldPct: 0,
  soldAvgPriceBrl: 0,
  targetMargin: null,
  marginBase: 'receita',
  costUsd: [],
  fxLockPct: 0,
  fxLockRate: 0,
  costScHa: 0,
}
const opts: MatrixOptions = { stepsPct: DEFAULT_STEPS_PCT, yieldFactor: 1, includeSold: false }

describe('effectiveFx with an unusable market dollar', () => {
  it('is NaN when part of the line follows the market', () => {
    expect(effectiveFx(0.6, 5.2, 0)).toBeNaN()
    expect(effectiveFx(0, 0, Number.NaN)).toBeNaN()
    expect(effectiveFx(0.6, 5.2, -1)).toBeNaN()
  })

  it('a fully bought line still works', () => {
    expect(effectiveFx(1, 5.2, 0)).toBe(5.2)
    expect(effectiveFx(1, 5.2, Number.NaN)).toBe(5.2)
  })

  it('a US$ line not fully bought makes the cost per sack null with fx 0', () => {
    const i = { ...cs, costUsd: [{ usdPerHa: 100, boughtPct: 0.6, boughtRate: 5.2 }] }
    expect(computeResult(soja, { ...today, fx: 0 }, i).costPerSc).toBeNull()
  })
})

describe('rent in sc/ha (costScHa) is converted at each scenario price', () => {
  const rent = { ...cs, costScHa: 8 }

  it('computeResult adds costScHa × farm price to the cost', () => {
    const r = computeResult(soja, today, rent)
    const farm = farmPriceBrl(soja, today, rent)
    expect(r.costPerSc).toBeCloseTo((cs.costPerHaBrl + 8 * farm) / cs.yieldScHa, 9)
    const other = { ...today, cbotUsc: 1100 }
    const r2 = computeResult(soja, other, rent)
    expect(r2.costPerSc).toBeCloseTo((cs.costPerHaBrl + 8 * farmPriceBrl(soja, other, rent)) / cs.yieldScHa, 9)
    expect(r2.costPerSc!).toBeLessThan(r.costPerSc!)
  })

  it('without a usable farm price the cost per sack is null (never a silent 0)', () => {
    expect(computeResult(soja, { ...today, fx: 0 }, rent).costPerSc).toBeNull()
    const negative = computeResult(soja, today, { ...rent, freightBrlPerSc: 10000 })
    expect(negative.farmPriceBrl!).toBeLessThan(0)
    expect(negative.costPerSc).toBeNull()
  })

  it('costScHa = 0 is exactly the old result', () => {
    const { costScHa: _x, ...old } = cs
    const a = computeResult(soja, today, cs)
    const b = computeResult(soja, today, { ...(old as FarmInputs), costScHa: 0 })
    expect(a).toEqual(b)
    expect(a.costPerSc).toBe(cs.costPerHaBrl / cs.yieldScHa)
  })

  it('matrix centre equals computeResult; a higher-price cell has a higher cost per sack', () => {
    const m = buildMatrix(soja, today, rent, opts)
    const r = computeResult(soja, today, rent)
    const c = m.cells[4][4]
    expect(c.marginPerSc).toBeCloseTo(r.marginPerSc!, 9)
    expect(c.marginPct).toBeCloseTo(r.marginPct!, 12)
    const costOf = (row: number, col: number) => m.cells[row][col].priceBrl - m.cells[row][col].marginPerSc!
    expect(costOf(8, 8)).toBeGreaterThan(costOf(0, 0))
    expect(costOf(8, 4)).toBeGreaterThan(costOf(0, 4))
    // without rent the cost per sack is the same in every cell
    const flat = buildMatrix(soja, today, cs, opts)
    const flatCost = (row: number, col: number) => flat.cells[row][col].priceBrl - flat.cells[row][col].marginPerSc!
    expect(flatCost(8, 8)).toBeCloseTo(flatCost(0, 0), 9)
  })

  it('analyzeTarget follows: the price lever reaches the target exactly with rent', () => {
    const i = { ...rent, targetMargin: 0.2 }
    const m = buildMatrix(soja, today, i, opts)
    const a = analyzeTarget(soja, today, i, m)!
    const preco = a.levers.find((l) => l.lever === 'preco')!
    expect(preco.reachable).toBe(true)
    const p0 = computeResult(soja, today, i).farmPriceBrl!
    const atLever = computeResult(soja, today, { ...i, freightBrlPerSc: i.freightBrlPerSc - (preco.value! - p0) })
    expect(atLever.marginPct).toBeCloseTo(0.2, 6)
    const custo = a.levers.find((l) => l.lever === 'custo')!
    expect(custo.reachable).toBe(true)
  })
})

describe('minimum price and break-even with rent in sc/ha are exact (closed forms)', () => {
  const rent: FarmInputs = { ...cs, costPerHaBrl: 5000, yieldScHa: 60, costScHa: 10 }

  it('hand case: Cfix 5000/ha, y 60, R 10, target 20% on revenue', () => {
    const r = computeResult(soja, today, { ...rent, targetMargin: 0.2, marginBase: 'receita' })
    expect(r.minPriceBrl!).toBeCloseTo(5000 / (60 * 0.8 - 10), 6)
    expect(r.minPriceBrl!).toBeCloseTo(131.58, 2)
    expect(r.breakEven.priceBrl!).toBeCloseTo(100, 9)
  })

  it('cost base: (1 + t) × Cfix / (y − R(1 + t))', () => {
    const r = computeResult(soja, today, { ...rent, targetMargin: 0.2, marginBase: 'custo' })
    expect(r.minPriceBrl!).toBeCloseTo((1.2 * 5000) / (60 - 10 * 1.2), 6)
  })

  it.each(['receita', 'custo'] as const)('minPriceBrl equals the price lever (%s base)', (marginBase) => {
    const i = { ...cs, costScHa: 8, targetMargin: 0.2, marginBase }
    const m = buildMatrix(soja, today, i, opts)
    const preco = analyzeTarget(soja, today, i, m)!.levers.find((l) => l.lever === 'preco')!
    const r = computeResult(soja, today, i)
    expect(preco.reachable).toBe(true)
    expect(Math.abs(r.minPriceBrl! - preco.value!)).toBeLessThan(0.01)
  })

  it('at the break-even price the margin is zero', () => {
    const r = computeResult(soja, today, { ...rent, targetMargin: 0.2 })
    const p0 = r.farmPriceBrl!
    const be = r.breakEven.priceBrl!
    const at = computeResult(soja, today, { ...rent, freightBrlPerSc: rent.freightBrlPerSc - (be - p0) })
    expect(at.marginPerSc!).toBeCloseTo(0, 6)
  })

  it('null when the yield does not cover the rent (y ≤ R)', () => {
    for (const y of [10, 8]) {
      const r = computeResult(soja, today, { ...rent, yieldScHa: y, targetMargin: 0.2 })
      expect(r.minPriceBrl).toBeNull()
      expect(r.breakEven.priceBrl).toBeNull()
    }
    // revenue base: y(1 − t) ≤ R also unreachable
    const r = computeResult(soja, today, { ...rent, yieldScHa: 12, targetMargin: 0.2, marginBase: 'receita' })
    expect(r.minPriceBrl).toBeNull()
  })
})
