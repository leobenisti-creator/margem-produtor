import type { FarmInputs, Scenario } from './calc'
import { CROPS } from './crops'
import { computeExposure } from './exposure'
import { activeHedge, coverOps, type HedgeOp } from './hedge'
import type { SaleTranche } from './sales'
import { buildCurves, dollarProfile, marginAt, UNIT_MOVE, type CurveInput } from './sensitivity'

const crop = CROPS.soja
const BPS = crop.bushelsPerSack
const P = 60000

// 10 US$/bu x 2,20462 bu/sc x R$ 5 = R$ 110,231/sc at the farm gate (no freight, no fees); cost R$ 100/sc
const scenario: Scenario = { cbotUsc: 1000, basisUsc: 0, fx: 5 }
const inputs: FarmInputs = {
  areaHa: 1000,
  yieldScHa: 60,
  costPerHaBrl: 6000,
  freightBrlPerSc: 0,
  portFeesBrlPerSc: 0,
  soldPct: 0,
  soldAvgPriceBrl: 0,
  targetMargin: null,
  marginBase: 'receita',
  costUsd: [],
  fxLockPct: 0,
  fxLockRate: 0,
  costScHa: 0,
}
const REF = 10 * BPS * 5 // 110,231
const sale = (volume: number, over: Partial<SaleTranche> = {}): SaleTranche => ({
  id: 's' + volume,
  volume,
  volumeUnit: 'sc',
  price: 120,
  priceCurrency: 'BRL',
  dollar: null,
  ...over,
})
const input = (over: Partial<CurveInput> = {}): CurveInput => ({ crop, scenario, inputs, tranches: [], ...over })
const curve = (c: ReturnType<typeof buildCurves>, d: 'dolar' | 'basis' | 'cbot') =>
  c.curves.find((x) => x.driver === d)!

describe('marginAt', () => {
  it('nothing fixed: production x (farm price - cost per sack)', () => {
    // 60.000 x (110,231 - 100)
    expect(marginAt(crop, scenario, inputs, [], true)).toBeCloseTo(P * (REF - 100), 4)
    expect(marginAt(crop, scenario, inputs, [], false)).toBeCloseTo(P * (REF - 100), 4)
  })

  it('a sale in R$ is revenue at its own price; the rest at the farm price', () => {
    // 30.000 x 120 + 30.000 x 110,231 - 6.000.000
    expect(marginAt(crop, scenario, inputs, [sale(30000)], true)).toBeCloseTo(30000 * 120 + 30000 * REF - 6_000_000, 4)
    // the "nothing fixed" line ignores the sale
    expect(marginAt(crop, scenario, inputs, [sale(30000)], false)).toBeCloseTo(P * (REF - 100), 4)
  })

  it('a US$ sale with the dollar open follows the scenario dollar; with a typed dollar it does not', () => {
    const open = sale(30000, { price: 28, priceCurrency: 'USD', marketDollar: 5 })
    const typed = sale(30000, { price: 28, priceCurrency: 'USD', dollar: 5 })
    const at6 = { ...scenario, fx: 6 }
    const ref6 = 10 * BPS * 6
    expect(marginAt(crop, at6, inputs, [open], true)).toBeCloseTo(30000 * 28 * 6 + 30000 * ref6 - 6_000_000, 3)
    expect(marginAt(crop, at6, inputs, [typed], true)).toBeCloseTo(30000 * 28 * 5 + 30000 * ref6 - 6_000_000, 3)
  })

  it('sales above the production are cut to it; an invalid sale is ignored', () => {
    expect(marginAt(crop, scenario, inputs, [sale(90000)], true)).toBeCloseTo(P * 120 - 6_000_000, 4)
    expect(marginAt(crop, scenario, inputs, [sale(0)], true)).toBeCloseTo(P * (REF - 100), 4)
  })

  it('without production it is null', () => {
    expect(marginAt(crop, scenario, { ...inputs, areaHa: 0 }, [], true)).toBeNull()
  })

  it('US$ costs: the fixed line keeps the bought part, the unfixed one has all of it open', () => {
    const withCosts: FarmInputs = {
      ...inputs,
      costPerHaBrl: 5000,
      costUsd: [{ usdPerHa: 200, boughtPct: 1, boughtRate: 5 }], // R$ 1.000/ha fixed at 5
    }
    const at6 = { ...scenario, fx: 6 }
    const ref6 = 10 * BPS * 6
    // fixed: cost stays 5.000 + 200 x 5 = 6.000/ha; unfixed: 5.000 + 200 x 6 = 6.200/ha
    expect(marginAt(crop, at6, withCosts, [], true)).toBeCloseTo(P * ref6 - 1000 * 6000, 3)
    expect(marginAt(crop, at6, withCosts, [], false)).toBeCloseTo(P * ref6 - 1000 * 6200, 3)
  })
})

describe('buildCurves (hand computed)', () => {
  it('nothing fixed: both lines are the same and the three curves are straight lines through today', () => {
    const c = buildCurves(input())
    expect(c.ok).toBe(true)
    expect(c.productionSc).toBe(P)
    for (const cv of c.curves) {
      expect(cv.points).toHaveLength(25)
      expect(cv.today.fixed).toBeCloseTo(P * (REF - 100), 3)
      expect(cv.today.unfixed).toBeCloseTo(cv.today.fixed as number, 6)
      for (const p of cv.points) expect(p.fixed).toBeCloseTo(p.unfixed as number, 6)
    }
  })

  it('slopes per unit move: R$ 0,10 of dollar, R$ 1/sc of basis, 10 cents of CBOT', () => {
    const c = buildCurves(input())
    // 60.000 sc x 22,0462 US$/sc... reference / dollar x 0,10
    expect(curve(c, 'dolar').perUnit.unfixed).toBeCloseTo(P * (REF / 5) * UNIT_MOVE.dolar, 3)
    expect(curve(c, 'dolar').perUnit.unfixed).toBeCloseTo(132_277.2, 1)
    expect(curve(c, 'basis').perUnit.unfixed).toBeCloseTo(60_000, 3)
    // 10 cents x 2,20462 / 100 x 5 = R$ 1,10231/sc x 60.000
    expect(curve(c, 'cbot').perUnit.unfixed).toBeCloseTo(66_138.6, 1)
  })

  it('break-even without fixing: dollar where the farm price equals the cost (R$ 4,53597)', () => {
    const be = curve(buildCurves(input()), 'dolar').breakEven.unfixed!
    // 100 / (10 x 2,20462) = 4,535975
    expect(be.x).toBeCloseTo(100 / (10 * BPS) - 5, 4)
    expect(be.pct).toBeCloseTo((100 / (10 * BPS) - 5) / 5, 4)
    expect(be.fromNegative).toBe(false)
    // basis: the margin per sack is R$ 10,231, so it zeroes 10,231 R$/sc below (outside +-6, inside +-12)
    expect(curve(buildCurves(input()), 'basis').breakEven.unfixed!.x).toBeCloseTo(-(REF - 100), 3)
    // CBOT: 100 / (2,20462 x 5 / 100) cents = 907,2... -> move of -92,8 cents
    const cb = curve(buildCurves(input()), 'cbot').breakEven.unfixed!
    expect(cb.x).toBeCloseTo(100 / ((BPS / 100) * 5) - 1000, 3)
  })

  it('a sale in R$ makes the line flatter and moves the break-even further away', () => {
    const c = buildCurves(input({ tranches: [sale(30000)] }))
    const d = curve(c, 'dolar')
    // half of the crop is fixed in R$: half of the slope
    expect(d.perUnit.fixed).toBeCloseTo(0.5 * (d.perUnit.unfixed as number), 3)
    // zero when 3.600.000 + 30.000 x farm = 6.000.000 -> farm R$ 80 -> dollar 80 / 22,0462 = 3,6288
    expect(d.breakEven.fixed!.x).toBeCloseTo(80 / (10 * BPS) - 5, 4)
    expect(d.breakEven.fixed!.x).toBeLessThan(d.breakEven.unfixed!.x)
    // at the left end (dollar -R$ 1 = R$ 4,00) the 30.000 sc sold at R$ 120 are worth 120 - 88,1848 more than at the farm price
    expect(d.savedAtDown).toBeCloseTo(30000 * (120 - 10 * BPS * 4), 0)
    // at the right end (R$ 6,00) it gives up the gain of those sacks: farm 132,2772 - 120
    expect(d.givenUpAtUp).toBeCloseTo(30000 * (10 * BPS * 6 - 120), 0)
  })

  it('a US$ sale with the dollar open makes the dollar curve STEEPER than nothing fixed', () => {
    const c = buildCurves(input({ tranches: [sale(30000, { price: 28, priceCurrency: 'USD', marketDollar: 5 })] }))
    // 30.000 sc x US$ 28 + 30.000 sc x 22,0462 US$ of reference = 840.000 + 661.386 per R$ 1 -> x 0,10
    expect(curve(c, 'dolar').perUnit.fixed).toBeCloseTo((840_000 + 30000 * (REF / 5)) * 0.1, 1)
    expect(curve(c, 'dolar').perUnit.fixed as number).toBeGreaterThan(curve(c, 'dolar').perUnit.unfixed as number)
    // price and basis are closed on those 30.000 sc: half of the basis slope
    expect(curve(c, 'basis').perUnit.fixed).toBeCloseTo(30_000, 3)
  })

  it('a dollar future sold reduces the dollar slope by its notional and leaves basis and CBOT alone', () => {
    const o: HedgeOp = {
      id: 'h',
      asset: 'dolar',
      kind: 'futuro',
      side: 'vendido',
      qty: 1_000_000,
      strike: 5,
      premium: 0,
      fxFixed: null,
      maturity: '',
    }
    const hedge = activeHedge([o], 5)
    const c = buildCurves(input({ inputs: { ...inputs, hedge } }))
    // slope per R$ 1: 1.322.772 - 1.000.000 (the future gains when the dollar falls)
    expect(curve(c, 'dolar').perUnit.fixed).toBeCloseTo((P * (REF / 5) - 1_000_000) * 0.1, 1)
    expect(curve(c, 'basis').perUnit.fixed).toBeCloseTo(60_000, 3)
    expect(curve(c, 'cbot').perUnit.fixed).toBeCloseTo(66_138.6, 1)
  })

  it('a soybean future sold covering all the CBOT: the CBOT curve is flat with it and steep without it', () => {
    const o: HedgeOp = {
      id: 'h',
      asset: 'soja',
      kind: 'futuro',
      side: 'vendido',
      qty: P * BPS,
      strike: 1000,
      premium: 0,
      fxFixed: null,
      maturity: '',
    }
    const c = buildCurves(input({ inputs: { ...inputs, hedge: activeHedge([o], 5) } }))
    const cbot = curve(c, 'cbot')
    // the loss on the physical is paid by the future (the dollar of the scenario is the same here)
    expect(cbot.perUnit.fixed as number).toBeCloseTo(0, 3)
    expect(cbot.perUnit.unfixed).toBeCloseTo(66_138.6, 1)
    // flat line: no break-even to find
    expect(cbot.breakEven.fixed).toBeNull()
  })

  it('a bought put keeps the rise and cuts the fall (the fixed line is not a straight line)', () => {
    const o: HedgeOp = {
      id: 'h',
      asset: 'soja',
      kind: 'put',
      side: 'comprado',
      qty: P * BPS,
      strike: 1000,
      premium: 0,
      fxFixed: null,
      maturity: '',
    }
    const cbot = curve(buildCurves(input({ inputs: { ...inputs, hedge: activeHedge([o], 5) } })), 'cbot')
    const down = cbot.points[0]
    const up = cbot.points[cbot.points.length - 1]
    const today = cbot.today.fixed as number
    expect(down.fixed as number).toBeCloseTo(today, 3) // -150 cents: the put pays all of it
    // +150 cents: the upside is kept (150 cents x R$ 1,10231/sc x 60.000 sc = R$ 992.079 more than today)
    expect(up.fixed as number).toBeCloseTo(today + 992_079, -2)
    expect(cbot.savedAtDown as number).toBeGreaterThan(0)
  })

  it('margin already negative: the break-even says the move that brings it back to zero', () => {
    const c = buildCurves(input({ inputs: { ...inputs, costPerHaBrl: 8000 } })) // cost R$ 133,33/sc > farm price
    const be = curve(c, 'dolar').breakEven.unfixed!
    expect(be.fromNegative).toBe(true)
    expect(be.x).toBeGreaterThan(0)
  })

  it('one shared vertical range that holds every point', () => {
    const c = buildCurves(input({ tranches: [sale(30000)] }))
    const [lo, hi] = c.yDomain!
    for (const cv of c.curves) {
      for (const p of cv.points) {
        for (const v of [p.fixed, p.unfixed]) if (v !== null) expect(v >= lo - 1e-6 && v <= hi + 1e-6).toBe(true)
      }
    }
  })

  it('without production it is not ok; a dollar that would go to zero gives empty points, never NaN', () => {
    expect(buildCurves(input({ inputs: { ...inputs, areaHa: 0 } })).ok).toBe(false)
    const low = buildCurves(input({ scenario: { ...scenario, fx: 0.5 } }))
    expect(JSON.stringify(low)).not.toMatch(/NaN|Infinity/)
    expect(curve(low, 'dolar').points.some((p) => p.fixed === null)).toBe(true)
  })

  it('custom spans change the range of the points', () => {
    const c = buildCurves(input({ spans: { dolar: 0.5 } }))
    expect(curve(c, 'dolar').points[0].x).toBeCloseTo(-0.5, 9)
    expect(curve(c, 'basis').points[0].x).toBeCloseTo(-6, 9)
  })
})

describe('dollarProfile (weighted dollar of the crop)', () => {
  const exposure = (tranches: SaleTranche[], ops: HedgeOp[], usdPerSc: number | null = 30) => {
    const e = computeExposure({
      productionSc: P,
      areaHa: 1000,
      bushelsPerSack: BPS,
      tranches,
      hedgeOps: ops,
      usdPerSc,
      costsUsdOpen: 0,
    })
    if (!e.ok) throw new Error('not ok')
    return e
  }
  const profile = (tranches: SaleTranche[], ops: HedgeOp[], usdPerSc: number | null = 30) => {
    const e = exposure(tranches, ops, usdPerSc)
    return dollarProfile({ exp: e, tranches, coverOps: ops, bushelsPerSack: BPS, usdPerSc, marketFx: 5.5 })
  }
  const usdSale = (volume: number, price: number, dollar: number): SaleTranche =>
    sale(volume, { price, priceCurrency: 'USD', dollar })

  it('nothing fixed: all open at the market dollar', () => {
    const p = profile([], [])
    expect(p).toMatchObject({ brlSc: 0, fixedSc: 0, openSc: P, avgFixedRate: null })
    expect(p.effectiveRate).toBeCloseTo(5.5, 9)
  })

  it('R$ sales are outside; US$ sales with a typed dollar are weighted by their US$ amount', () => {
    // 10.000 sc x US$ 28 at 5,00 and 10.000 sc x US$ 30 at 5,40: (280.000 x 5 + 300.000 x 5,4) / 580.000
    const p = profile([sale(20000), usdSale(10000, 28, 5), usdSale(10000, 30, 5.4)], [])
    expect(p.brlSc).toBe(20000)
    expect(p.fixedSc).toBe(20000)
    expect(p.openSc).toBe(20000)
    expect(p.avgFixedRate).toBeCloseTo((280_000 * 5 + 300_000 * 5.4) / 580_000, 9)
    // effective: fixed US$ 580.000 + open 20.000 sc x US$ 30 = 600.000 at 5,5
    const eff = (280_000 * 5 + 300_000 * 5.4 + 600_000 * 5.5) / 1_180_000
    expect(p.effectiveRate).toBeCloseTo(eff, 9)
  })

  it('a US$ sale with the dollar open is not fixed', () => {
    const open = sale(10000, { price: 28, priceCurrency: 'USD', marketDollar: 5.5 })
    const p = profile([open], [])
    expect(p.fixedSc).toBe(0)
    expect(p.openSc).toBe(P)
  })

  it('a dollar future sold fixes the dollar at its price for the sacks its notional covers', () => {
    const o: HedgeOp = {
      id: 'h',
      asset: 'dolar',
      kind: 'futuro',
      side: 'vendido',
      qty: 600_000,
      strike: 5.2,
      premium: 0,
      fxFixed: null,
      maturity: '',
    }
    // US$ 600.000 / US$ 30 per sack = 20.000 sc at 5,20
    const p = profile([], [o])
    expect(p.fixedSc).toBeCloseTo(20000, 6)
    expect(p.avgFixedRate).toBeCloseTo(5.2, 9)
    expect(p.openSc).toBeCloseTo(40000, 6)
  })

  it('a soybean operation with the dollar fixed counts at that dollar; a put (floor) does not fix a rate', () => {
    const fut: HedgeOp = {
      id: 'a',
      asset: 'soja',
      kind: 'futuro',
      side: 'vendido',
      qty: 10000 * BPS,
      strike: 1300,
      premium: 0,
      fxFixed: 5.3,
      maturity: '',
    }
    const put: HedgeOp = { ...fut, id: 'b', kind: 'put', side: 'comprado', premium: 20 }
    const p = profile([], [fut, put])
    expect(p.fixedSc).toBeCloseTo(10000, 6)
    expect(p.avgFixedRate).toBeCloseTo(5.3, 9)
  })

  it('operations beyond the room left are scaled down; sales above the production are scaled too', () => {
    const o: HedgeOp = {
      id: 'h',
      asset: 'dolar',
      kind: 'futuro',
      side: 'vendido',
      qty: 100_000_000,
      strike: 5,
      premium: 0,
      fxFixed: null,
      maturity: '',
    }
    const p = profile([usdSale(30000, 28, 5.4)], [o])
    expect(p.fixedSc).toBeCloseTo(P, 6)
    expect(p.openSc).toBe(0)
    expect(p.brlSc + p.fixedSc).toBeLessThanOrEqual(P + 1e-6)
    // no US$ price per sack: the operation cannot be weighed, only the sale counts
    const noPrice = profile([usdSale(30000, 28, 5.4)], [o], null)
    expect(noPrice.fixedSc).toBeCloseTo(30000, 6)
    expect(noPrice.avgFixedRate).toBeCloseTo(5.4, 9)
    expect(JSON.stringify(noPrice)).not.toMatch(/NaN|Infinity/)
  })

  it('cover operations come from coverOps: an expired one is not counted', () => {
    const o: HedgeOp = {
      id: 'h',
      asset: 'dolar',
      kind: 'futuro',
      side: 'vendido',
      qty: 600_000,
      strike: 5.2,
      premium: 0,
      fxFixed: null,
      maturity: '',
      maturityDate: '2026-01-31',
    }
    const spec = activeHedge([o], 5.5, { today: '2026-03-01', history: { fx: [{ date: '2026-01-31', settle: 5.1 }] } })
    expect(coverOps([o], spec)).toEqual([])
  })
})
