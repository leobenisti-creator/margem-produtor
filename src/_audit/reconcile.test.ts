/**
 * Engineering audit (independent hand-computed cases). Every expected number below was worked out by hand from the
 * definitions, not by calling the engine. Constants: soy 2.20462 bu/sc, corn 2.36218 bu/sc, sack = 0.06 t.
 */
import { computeResult, basisSummary, type FarmInputs, type Scenario } from '../engine/calc'
import { CROPS } from '../engine/crops'
import { activeHedge, hedgeBreakdown, hedgeBrlAt, type HedgeOp } from '../engine/hedge'
import type { SaleTranche } from '../engine/sales'
import { soldSummary, trancheSc } from '../engine/sales'
import { applyAxes, buildScenarioMatrix, farmBasisBrlSc, type Lens } from '../engine/scenarioMatrix'
import { marginParts, ALL_FIXED, NOTHING_FIXED } from '../engine/sensitivity'
import { marginBridge } from '../engine/scenarios'

const soy = CROPS.soja
const corn = CROPS.milho

const S: Scenario = { cbotUsc: 1300, basisUsc: -50, fx: 5 }
const base: FarmInputs = {
  areaHa: 1000,
  yieldScHa: 60,
  costPerHaBrl: 5000,
  freightBrlPerSc: 10,
  portFeesBrlPerSc: 5,
  soldPct: 0,
  soldAvgPriceBrl: 0,
  targetMargin: null,
  marginBase: 'receita',
  costUsd: [],
  fxLockPct: 0,
  fxLockRate: 0,
  costScHa: 0,
}
const fut: HedgeOp = {
  id: 'f',
  asset: 'soja',
  kind: 'futuro',
  side: 'vendido',
  qty: 500_000, // bushels
  strike: 1400,
  premium: 0,
  fxFixed: null,
  maturity: '',
}
const brlSale = (id: string, volume: number, price: number): SaleTranche => ({
  id,
  volume,
  volumeUnit: 'sc',
  price,
  priceCurrency: 'BRL',
  dollar: null,
})

describe('calc by hand', () => {
  it('soy: reference, farm price, cost, margin', () => {
    // (1300-50)/100 = 12.5 US$/bu x 2.20462 = 27.55775 US$/sc x 5 = 137.78875 R$/sc
    // farm = 137.78875 - 10 - 5 = 122.78875 ; cost = 5000/60 = 83.33333 ; margin = 39.455417
    const r = computeResult(soy, S, base)
    expect(r.referencePriceBrl).toBeCloseTo(137.78875, 5)
    expect(r.farmPriceBrl).toBeCloseTo(122.78875, 5)
    expect(r.costPerSc).toBeCloseTo(83.333333, 5)
    expect(r.marginPerSc).toBeCloseTo(39.455417, 5)
    expect(r.marginPct).toBeCloseTo(39.455417 / 122.78875, 6) // receita base
    expect(r.marginPerHa).toBeCloseTo(39.455417 * 60, 4)
    expect(r.marginTotal).toBeCloseTo(122.78875 * 60000 - 5_000_000, 6) // 2,367,325
    expect(r.productionSc).toBe(60000)
  })

  it('corn uses 2.36218 bu/sc', () => {
    // 12.5 x 2.36218 x 5 = 147.63625 ; farm = 132.63625
    expect(computeResult(corn, S, base).farmPriceBrl).toBeCloseTo(132.63625, 5)
  })

  it('cost base: margin % over cost; minimum price = cost x (1+t)', () => {
    const r = computeResult(soy, S, { ...base, marginBase: 'custo', targetMargin: 0.2 })
    expect(r.marginPct).toBeCloseTo(39.455417 / 83.333333, 6)
    expect(r.minPriceBrl).toBeCloseTo(100, 5) // 83.3333 x 1.2
  })

  it('revenue base: minimum price = cost / (1 - t)', () => {
    const r = computeResult(soy, S, { ...base, targetMargin: 0.2 })
    expect(r.minPriceBrl).toBeCloseTo(83.333333 / 0.8, 5)
  })

  it('US$ cost: half bought at 4.8, rest at the market 5 -> effective 4.9', () => {
    // 100 US$/ha x 4.9 = 490 R$/ha ; total 5490 ; cost/sc 91.5
    const r = computeResult(soy, S, { ...base, costUsd: [{ usdPerHa: 100, boughtPct: 0.5, boughtRate: 4.8 }] })
    expect(r.costPerSc).toBeCloseTo(91.5, 6)
  })

  it('dollar lock: 40% locked at 4.5 -> effective 4.8 on the farm price', () => {
    // ref @4.8 = 12.5 x 2.20462 x 4.8 = 132.2772 ; farm = 117.2772
    const i = { ...base, fxLockPct: 0.4, fxLockRate: 4.5 }
    expect(computeResult(soy, S, i).farmPriceBrl).toBeCloseTo(117.2772, 4)
  })

  it('rent in sc/ha is valued at the scenario farm price', () => {
    // 2 sc/ha x 122.78875 = 245.5775 R$/ha ; cost/ha 5245.5775 ; /60 = 87.42629
    const r = computeResult(soy, S, { ...base, costScHa: 2 })
    expect(r.costPerSc).toBeCloseTo(87.42629, 4)
    // break-even price P: Cfix/(y - R) = 5000/58
    expect(r.breakEven.priceBrl).toBeCloseTo(5000 / 58, 6)
    // at that price the margin must be exactly zero
    const P0 = 5000 / 58
    expect(P0 * 60 - (5000 + 2 * P0)).toBeCloseTo(0, 9)
  })

  it('basis summary = farm price - CBOT in R$/sc (no lock)', () => {
    // CBOT in R$: 13 x 2.20462 x 5 = 143.3003 ; farm 122.78875 ; basis = -20.51155 R$/sc
    const b = basisSummary(soy, S, base)!
    expect(b.brlPerSc).toBeCloseTo(122.78875 - 143.3003, 4)
    expect(b.uscPerBu).toBeCloseTo((b.brlPerSc / (soy.bushelsPerSack * 5)) * 100, 6)
  })
})

describe('sales units', () => {
  it('t, bu, sc', () => {
    expect(trancheSc({ ...brlSale('a', 6, 100), volumeUnit: 't' }, soy.bushelsPerSack)).toBeCloseTo(100, 9) // 6 t / 0.06
    expect(trancheSc({ ...brlSale('a', 220.462, 100), volumeUnit: 'bu' }, soy.bushelsPerSack)).toBeCloseTo(100, 6)
    expect(trancheSc({ ...brlSale('a', 236.218, 100), volumeUnit: 'bu' }, corn.bushelsPerSack)).toBeCloseTo(100, 6)
  })
  it('weighted average with a US$ sale at its own dollar', () => {
    const t1 = brlSale('a', 10000, 120)
    const t2: SaleTranche = { id: 'b', volume: 20000, volumeUnit: 'sc', price: 24, priceCurrency: 'USD', dollar: 5.5 }
    const s = soldSummary([t1, t2], 60000)
    expect(s.soldSc).toBe(30000)
    expect(s.soldPct).toBeCloseTo(0.5, 12)
    expect(s.avgPriceBrl).toBeCloseTo((10000 * 120 + 20000 * 132) / 30000, 9)
  })
})

describe('hedge by hand', () => {
  const spec = (ops: HedgeOp[]) => activeHedge(ops, 5)!
  it('sold future: (strike - settle) x bu / 100 x fx', () => {
    // (1400-1200) = 200 US cents/bu x 500000 bu = 1,000,000 cents = 10,000 US$ x 5 = 50,000 R$ ... wait: 200*500000/100 = 1,000,000 US$
    expect(hedgeBrlAt(spec([fut]), 1200, 5)).toBeCloseTo(((1400 - 1200) * 500_000) / 100 * 5, 6)
    expect(hedgeBrlAt(spec([fut]), 1500, 5)).toBeCloseTo(-2_500_000, 6)
  })
  it('bought put: pays premium, payoff max(K-S,0)', () => {
    const put: HedgeOp = { ...fut, id: 'p', kind: 'put', side: 'comprado', strike: 1300, premium: 20 }
    // S=1200: (100 - 20) = 80 cents x 500000 / 100 = 400,000 US$ x 5 = 2,000,000
    expect(hedgeBrlAt(spec([put]), 1200, 5)).toBeCloseTo(2_000_000, 4)
    // S=1500: only the premium: -20 x 500000 / 100 x 5 = -500,000
    expect(hedgeBrlAt(spec([put]), 1500, 5)).toBeCloseTo(-500_000, 4)
  })
  it('sold call: receives premium, pays when S > K', () => {
    const call: HedgeOp = { ...fut, id: 'c', kind: 'call', side: 'vendido', strike: 1400, premium: 30 }
    // S=1500: +30 - 100 = -70 cents x 500000 / 100 x 5 = -1,750,000
    expect(hedgeBrlAt(spec([call]), 1500, 5)).toBeCloseTo(-1_750_000, 4)
  })
  it('dollar future sold: (strike - fx) x US$ notional is already in R$', () => {
    const d: HedgeOp = { ...fut, id: 'd', asset: 'dolar', qty: 100_000, strike: 5.5 }
    expect(hedgeBrlAt(spec([d]), 1300, 5)).toBeCloseTo(50_000, 6) // (5.5-5) x 100000
  })
  it('fixed dollar of a soy op converts at that dollar, not the scenario one', () => {
    const f2 = { ...fut, fxFixed: 4 }
    expect(hedgeBrlAt(spec([f2]), 1200, 6)).toBeCloseTo(((1400 - 1200) * 500_000) / 100 * 4, 6)
  })
})

describe('reconciliation: computeResult = marginParts = matrix = bridge = hedgeBreakdown', () => {
  const h = activeHedge([fut], 5)!
  const inputs: FarmInputs = { ...base, hedge: h, targetMargin: 0.15 }
  const tranches = [brlSale('a', 15000, 125)]

  it('no sales, no hedge: marginParts(ALL) == computeResult.marginTotal', () => {
    const r = computeResult(soy, S, base)
    const p = marginParts(soy, S, base, [], ALL_FIXED)!
    expect(p.margin).toBeCloseTo(r.marginTotal!, 4)
    expect(p.revenue).toBeCloseTo(60000 * r.farmPriceBrl!, 4)
    expect(p.cost).toBeCloseTo(5_000_000, 4)
  })

  it('with hedge: marginTotal includes hedge and equals marginParts', () => {
    const r = computeResult(soy, S, inputs)
    const p = marginParts(soy, S, inputs, [], ALL_FIXED)!
    expect(r.hedgeBrl).toBeCloseTo(((1400 - 1300) * 500_000) / 100 * 5, 6) // 2,500,000
    expect(p.margin).toBeCloseTo(r.marginTotal!, 4)
    expect(p.hedge).toBeCloseTo(r.hedgeBrl, 6)
    const lines = hedgeBreakdown(h, S.cbotUsc, S.fx)
    expect(lines.reduce((n, l) => n + l.brl, 0)).toBeCloseTo(r.hedgeBrl, 6)
  })

  it('with sales: revenue = sold x price + unsold x farm + hedge', () => {
    const p = marginParts(soy, S, inputs, tranches, ALL_FIXED)!
    const farm = 122.78875
    expect(p.soldSc).toBe(15000)
    expect(p.soldRevenue).toBeCloseTo(15000 * 125, 6)
    expect(p.revenue).toBeCloseTo(15000 * 125 + 45000 * farm + 2_500_000, 3)
    expect(p.margin).toBeCloseTo(p.revenue - 5_000_000, 3)
  })

  it('bridge steps add up to the final margin', () => {
    const b = marginBridge({ crop: soy, scenario: S, inputs, tranches })!
    const deltas = b.slice(1, 4).reduce((n, s) => n + s.value, 0)
    expect(b[0].value + deltas).toBeCloseTo(b[4].value, 4)
    const m0 = marginParts(soy, S, inputs, tranches, NOTHING_FIXED)!
    expect(b[0].value).toBeCloseTo(m0.margin, 4)
    const op = b[2]
    expect(op.detail!.realized + op.detail!.projected).toBeCloseTo(op.value, 6)
  })

  const lenses: Lens[] = ['tudo', 'aberto', 'operacoes', 'diferenca']
  it.each(lenses)('matrix lens %s centre cell reconciles with marginParts', (lens) => {
    const m = buildScenarioMatrix({ crop: soy, scenario: S, inputs, tranches, rowAxis: 'cbot', colAxis: 'dolar', lens })
    const c = m.cells[4][4]
    const f = marginParts(soy, S, inputs, tranches, ALL_FIXED)!
    const u = marginParts(soy, S, inputs, tranches, NOTHING_FIXED)!
    const expected =
      lens === 'tudo'
        ? f.margin
        : lens === 'aberto'
          ? f.unsoldSc * (f.farmPrice - f.costPerSc) + f.hedge
          : lens === 'operacoes'
            ? f.hedge
            : f.margin - u.margin
    expect(c.total).toBeCloseTo(expected, 4)
    expect(c.parts!.margin).toBeCloseTo(f.margin, 4)
    expect(c.parts!.soldRevenue + c.parts!.unsoldRevenue + c.parts!.hedge).toBeCloseTo(c.parts!.revenue, 4)
    expect(c.parts!.revenue - c.parts!.cost).toBeCloseTo(c.parts!.margin, 4)
  })

  it('cell farm prices follow the CBOT and dollar axes exactly', () => {
    const m = buildScenarioMatrix({ crop: soy, scenario: S, inputs: base, tranches: [], rowAxis: 'cbot', colAxis: 'dolar', lens: 'tudo' })
    // row 5 = +2.5% CBOT (1332.5), col 4 = today's dollar
    expect(m.cells[5][4].priceBrl).toBeCloseTo(((1332.5 - 50) / 100) * soy.bushelsPerSack * 5 - 15, 6)
    // col 5 = +2.5% dollar (5.125)
    expect(m.cells[4][5].priceBrl).toBeCloseTo(12.5 * soy.bushelsPerSack * 5.125 - 15, 6)
  })
})

describe('basis axis = farm price - CBOT in R$/sc, also with the dollar locked', () => {
  const cases: [string, FarmInputs][] = [
    ['no lock', base],
    ['40 pct locked at 4.5', { ...base, fxLockPct: 0.4, fxLockRate: 4.5 }],
    ['100 pct locked at 4.2', { ...base, fxLockPct: 1, fxLockRate: 4.2 }],
  ]
  it.each(cases)('%s: +R$ 2/sc on the axis moves the real farm basis by exactly R$ 2', (_n, inp) => {
    const b0 = farmBasisBrlSc(soy, S, inp)!
    const s1 = applyAxes(soy, S, [['basis', 2]], inp)
    const b1 = farmBasisBrlSc(soy, s1, inp)!
    expect(b1 - b0).toBeCloseTo(2, 9)
    const m = buildScenarioMatrix({
      crop: soy,
      scenario: S,
      inputs: inp,
      tranches: [],
      rowAxis: 'basis',
      colAxis: 'cbot',
      lens: 'tudo',
      basisSteps: [2, 4, 6, 8],
    })
    expect(m.cells[5][4].priceBrl! - m.cells[4][4].priceBrl!).toBeCloseTo(2, 9)
  })
})
