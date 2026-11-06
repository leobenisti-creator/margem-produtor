import { describe, expect, it } from 'vitest'
import { blendedPriceBrl, computeResult, inputsAt, type FarmInputs, type Scenario } from './calc'
import { CROPS } from './crops'
import { EMPTY_HEDGE_OP, type HedgeOp, type HedgeSpec } from './hedge'
import { DEFAULT_STEPS_PCT, buildMatrix, matrixToCsv, type MatrixOptions, type MatrixView } from './matrix'

const crop = CROPS.soja
const scenario: Scenario = { cbotUsc: 1200, basisUsc: 60, fx: 5.5 }
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
const variants: FarmInputs[] = [
  base,
  { ...base, marginBase: 'custo', targetMargin: null },
  { ...base, soldPct: 0.4, soldAvgPriceBrl: 120 },
  { ...base, costUsd: [{ usdPerHa: 300, boughtPct: 0.5, boughtRate: 5 }], fxLockPct: 0.3, fxLockRate: 5.2 },
  { ...base, costScHa: 4, costPerHaBrl: 3000 },
  { ...base, areaHa: 0 },
  { ...base, yieldScHa: 0 },
]
const opts: MatrixOptions = { stepsPct: DEFAULT_STEPS_PCT, yieldFactor: 1, includeSold: false }
const views: MatrixView[] = ['preco', 'margemHa', 'margemTotal', 'margemPct']

const op = (p: Partial<HedgeOp>): HedgeOp => ({ id: 'op-1', ...EMPTY_HEDGE_OP, ...p })
const soldFuture = op({ qty: 100000, strike: 1200 }) // soja futuro vendido, 100.000 bu a 1200
const spec = (...ops: HedgeOp[]): HedgeSpec => ({ ops, marketFx: scenario.fx })
const withHedge = (i: FarmInputs, ...ops: HedgeOp[]): FarmInputs => ({ ...i, hedge: spec(...ops) })

describe('regression: no hedge (or only invalid ops) gives identical numbers', () => {
  const nothing: HedgeSpec[] = [{ ops: [], marketFx: 5.5 }, { ops: [op({ id: 'bad' })], marketFx: 5.5 }]
  for (const [k, v] of variants.entries()) {
    for (const h of nothing) {
      it(`variant ${k}, ${h.ops.length} ops: computeResult, matrix, csv`, () => {
        const hedged = { ...v, hedge: h }
        expect(computeResult(crop, scenario, hedged)).toEqual(computeResult(crop, scenario, v))
        for (const includeSold of [false, true]) {
          const o = { ...opts, includeSold }
          const a = buildMatrix(crop, scenario, hedged, o)
          const b = buildMatrix(crop, scenario, v, o)
          expect(a).toEqual(b)
          for (const view of views) expect(matrixToCsv(a, view)).toBe(matrixToCsv(b, view))
        }
        const r = computeResult(crop, scenario, hedged)
        expect(r.hedgeBrl).toBe(0)
        expect(r.steps.some((s) => s.label === 'Resultado das operações')).toBe(false)
      })
    }
  }

  it('cells carry hedgeBrl 0 and Result.hedgePerSc is 0 (known production) or null', () => {
    expect(buildMatrix(crop, scenario, base, opts).cells.flat().every((c) => c.hedgeBrl === 0)).toBe(true)
    expect(computeResult(crop, scenario, base).hedgePerSc).toBe(0)
    expect(computeResult(crop, scenario, { ...base, areaHa: 0 }).hedgePerSc).toBeNull()
  })
})

describe('hedged matrix', () => {
  const production = base.areaHa * base.yieldScHa
  const plain = buildMatrix(crop, scenario, base, opts)
  const hedged = buildMatrix(crop, scenario, withHedge(base, soldFuture), opts)

  it('physical prices and break-even do not move; hedgeBrl is the sold future at the row CBOT', () => {
    hedged.cells.forEach((row, r) =>
      row.forEach((c, k) => {
        expect(c.priceBrl).toBe(plain.cells[r][k].priceBrl)
        // 100.000 bu × (1200 − S) ¢ ÷ 100 × scenario dollar of the column
        expect(c.hedgeBrl).toBeCloseTo(((1200 - c.cbotUsc) * 100000 * c.fx) / 100, 6)
      }),
    )
    expect(hedged.cells[4][4].hedgeBrl).toBeCloseTo(0, 9) // today's CBOT = strike
  })

  it('where CBOT falls the sold future is positive and the margin rises by exactly hedgeBrl ÷ production', () => {
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 9; k++) {
        const c = hedged.cells[r][k]
        const p = plain.cells[r][k]
        expect(c.hedgeBrl).toBeGreaterThan(0)
        expect(c.marginPerSc as number).toBeCloseTo((p.marginPerSc as number) + c.hedgeBrl / production, 9)
        expect(c.marginPerHa as number).toBeCloseTo((p.marginPerHa as number) + (c.hedgeBrl / production) * base.yieldScHa, 6)
        expect(c.marginTotal as number).toBeCloseTo((p.marginTotal as number) + c.hedgeBrl, 4)
      }
    }
    for (let r = 5; r < 9; r++) expect(hedged.cells[r][4].hedgeBrl).toBeLessThan(0)
  })

  it('marginPct: receita uses the effective price as denominator, custo keeps the cost', () => {
    const cost = base.costPerHaBrl / base.yieldScHa
    const c = hedged.cells[0][4]
    const eff = c.priceBrl + c.hedgeBrl / production
    expect(c.marginPct as number).toBeCloseTo((eff - cost) / eff, 9)
    const hc = buildMatrix(crop, scenario, withHedge({ ...base, marginBase: 'custo' }, soldFuture), opts)
    const d = hc.cells[0][4]
    expect(d.marginPct as number).toBeCloseTo((d.priceBrl + d.hedgeBrl / production - cost) / cost, 9)
  })

  it('the yield factor scales the production used to spread the hedge', () => {
    const m = buildMatrix(crop, scenario, withHedge(base, soldFuture), { ...opts, yieldFactor: 1.1 })
    const m0 = buildMatrix(crop, scenario, base, { ...opts, yieldFactor: 1.1 })
    const c = m.cells[0][4]
    expect(c.marginTotal as number).toBeCloseTo((m0.cells[0][4].marginTotal as number) + c.hedgeBrl, 4)
    expect((c.marginPerSc as number) - (m0.cells[0][4].marginPerSc as number)).toBeCloseTo(c.hedgeBrl / (production * 1.1), 9)
  })

  it('dollar operations move with the column dollar (CBOT-independent)', () => {
    const d = op({ asset: 'dolar', qty: 1e6, strike: 5.5 })
    const m = buildMatrix(crop, scenario, withHedge(base, d), opts)
    expect(m.cells[0][0].hedgeBrl).toBeCloseTo((5.5 - m.fxCols[0]) * 1e6, 6)
    expect(m.cells[8][0].hedgeBrl).toBeCloseTo(m.cells[0][0].hedgeBrl, 9)
  })

  it('blend (includeSold): the hedge is added on top of the blended price', () => {
    const i = { ...base, soldPct: 0.4, soldAvgPriceBrl: 120 }
    const o = { ...opts, includeSold: true }
    const m = buildMatrix(crop, scenario, withHedge(i, soldFuture), o)
    const m0 = buildMatrix(crop, scenario, i, o)
    const c = m.cells[1][3]
    const ci = inputsAt(i, c.fx)
    const blend = blendedPriceBrl(c.priceBrl, ci)
    const cost = i.costPerHaBrl / i.yieldScHa
    const eff = blend + c.hedgeBrl / production
    expect(c.marginPerSc as number).toBeCloseTo(eff - cost, 9)
    expect(c.marginPct as number).toBeCloseTo((eff - cost) / eff, 9)
    expect((c.marginPerSc as number) - (m0.cells[1][3].marginPerSc as number)).toBeCloseTo(c.hedgeBrl / production, 9)
  })
})

describe('computeResult with a hedge', () => {
  it('adds the result per sack to the margin, keeps the physical prices, appends one step', () => {
    const s = { ...scenario, cbotUsc: 1100 }
    const plain = computeResult(crop, s, base)
    const r = computeResult(crop, s, withHedge(base, soldFuture))
    const production = base.areaHa * base.yieldScHa
    expect(r.hedgeBrl).toBeCloseTo((100 * 100000 * s.fx) / 100, 6)
    expect(r.hedgePerSc as number).toBeCloseTo(r.hedgeBrl / production, 12)
    expect(r.farmPriceBrl).toBe(plain.farmPriceBrl)
    expect(r.minPriceBrl).toBe(plain.minPriceBrl)
    expect(r.breakEven).toEqual(plain.breakEven)
    expect(r.marginPerSc as number).toBeCloseTo((plain.marginPerSc as number) + (r.hedgePerSc as number), 9)
    expect(r.marginTotal as number).toBeCloseTo((plain.marginTotal as number) + r.hedgeBrl, 4)
    const labels = r.steps.map((x) => x.label)
    expect(labels.filter((l) => l === 'Resultado das operações')).toHaveLength(1)
    expect(labels.indexOf('Resultado das operações')).toBeLessThan(labels.indexOf('Custo por saca'))
    expect(r.steps.find((x) => x.label === 'Resultado das operações')?.unit).toBe('R$/sc')
  })

  it('matrix centre cell agrees with computeResult', () => {
    const i = withHedge(base, op({ qty: 100000, strike: 1300 }))
    const r = computeResult(crop, scenario, i)
    const c = buildMatrix(crop, scenario, i, opts).cells[4][4]
    expect(c.hedgeBrl).toBeCloseTo(r.hedgeBrl, 6)
    expect(c.marginPerSc as number).toBeCloseTo(r.marginPerSc as number, 9)
    expect(c.marginPct as number).toBeCloseTo(r.marginPct as number, 9)
  })

  it('without production the hedge cannot be spread: hedgePerSc null, margin unchanged', () => {
    const i = withHedge({ ...base, areaHa: 0 }, soldFuture)
    const r = computeResult(crop, scenario, i)
    expect(r.hedgePerSc).toBeNull()
    expect(r.marginPerSc).toEqual(computeResult(crop, scenario, { ...base, areaHa: 0 }).marginPerSc)
  })
})
