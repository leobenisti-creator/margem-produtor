import { soldAvgPriceAt, soldSummary, trancheBrlAt, type SaleTranche } from './sales'

const t = (p: Partial<SaleTranche> & { id: string }): SaleTranche => ({
  volume: 0,
  volumeUnit: 'sc',
  price: 0,
  priceCurrency: 'BRL',
  dollar: null,
  ...p,
})

/*
 * By hand:
 *   a: 600 t = 600 / 0,06 = 10.000 sc a R$ 120,00          → R$ 1.200.000,00
 *   b: 5.000 sc a US$ 27,36 × 5,40 = R$ 147,744/sc          → R$   738.720,00
 *   c: 2.000 sc a R$ 130,00                                  → R$   260.000,00
 *   d: US$ 30,00 sem dólar → inválida (fica de fora)
 *   vendido = 17.000 sc; total = R$ 2.198.720,00; média = 2.198.720 / 17.000 = R$ 129,336470588…/sc
 *   produção 60.000 sc → 17.000 / 60.000 = 28,333…%
 */
const MIX: SaleTranche[] = [
  t({ id: 'a', volume: 600, volumeUnit: 't', price: 120 }),
  t({ id: 'b', volume: 5000, price: 27.36, priceCurrency: 'USD', dollar: 5.4 }),
  t({ id: 'c', volume: 2000, price: 130 }),
  t({ id: 'd', volume: 1000, price: 30, priceCurrency: 'USD', dollar: null }),
]

describe('soldSummary', () => {
  it('600 t = 10.000 sc', () => {
    const s = soldSummary([t({ id: 'a', volume: 600, volumeUnit: 't', price: 100 })], 100000)
    expect(s.soldSc).toBeCloseTo(10000, 9)
  })

  it('US$ 27,36 × dólar 5,40 = R$ 147,744/sc', () => {
    const s = soldSummary([t({ id: 'b', volume: 10, price: 27.36, priceCurrency: 'USD', dollar: 5.4 })], 1000)
    expect(s.avgPriceBrl).toBeCloseTo(147.744, 9)
  })

  it('mixes t/sc and R$/US$ into a volume-weighted average over the valid tranches', () => {
    const s = soldSummary(MIX, 60000)
    expect(s.soldSc).toBeCloseTo(17000, 9)
    expect(s.avgPriceBrl).toBeCloseTo(2198720 / 17000, 9)
    expect(s.avgPriceBrl).toBeCloseTo(129.33647058823529, 9)
    expect(s.soldPct).toBeCloseTo(17000 / 60000, 12)
    expect(s.overProduction).toBe(false)
    expect(s.validTranches.map((v) => v.id)).toEqual(['a', 'b', 'c'])
  })

  it('a US$ tranche without a dollar is invalid, excluded and reported in Portuguese', () => {
    const s = soldSummary(MIX, 60000)
    expect(s.invalid).toHaveLength(1)
    expect(s.invalid[0].id).toBe('d')
    expect(s.invalid[0].reason).toMatch(/dólar/i)
  })

  it('reports zero/negative/non-finite volume and price', () => {
    const s = soldSummary(
      [
        t({ id: 'v0', volume: 0, price: 100 }),
        t({ id: 'vneg', volume: -1, price: 100 }),
        t({ id: 'vnan', volume: Number.NaN, price: 100 }),
        t({ id: 'p0', volume: 10, price: 0 }),
        t({ id: 'pinf', volume: 10, price: Number.POSITIVE_INFINITY }),
        t({ id: 'fx0', volume: 10, price: 20, priceCurrency: 'USD', dollar: 0 }),
      ],
      1000,
    )
    expect(s.invalid.map((i) => i.id)).toEqual(['v0', 'vneg', 'vnan', 'p0', 'pinf', 'fx0'])
    for (const i of s.invalid) expect(i.reason.length).toBeGreaterThan(0)
    expect(s.invalid[0].reason).toMatch(/volume/i)
    expect(s.invalid[3].reason).toMatch(/preço/i)
    expect(s.soldSc).toBe(0)
    expect(s.soldPct).toBe(0)
    expect(s.avgPriceBrl).toBeNull()
    expect(s.validTranches).toEqual([])
  })

  it('a BRL tranche ignores its dollar', () => {
    const s = soldSummary([t({ id: 'x', volume: 10, price: 100, dollar: 5 })], 1000)
    expect(s.avgPriceBrl).toBe(100)
    expect(s.invalid).toEqual([])
  })

  it('sum above the production is a warning and soldPct is capped at 1', () => {
    const s = soldSummary(MIX, 12000)
    expect(s.overProduction).toBe(true)
    expect(s.soldPct).toBe(1)
    expect(s.soldSc).toBeCloseTo(17000, 9)
    expect(s.avgPriceBrl).toBeCloseTo(2198720 / 17000, 9)
  })

  it('production 0 or null gives soldPct 0 without NaN/Infinity; the average is still computed', () => {
    for (const prod of [0, null]) {
      const s = soldSummary(MIX, prod)
      expect(s.soldPct).toBe(0)
      expect(Number.isFinite(s.soldSc)).toBe(true)
      expect(s.avgPriceBrl).toBeCloseTo(2198720 / 17000, 9)
    }
    expect(soldSummary(MIX, null).overProduction).toBe(false)
    // no production yet (default start): no over-production warning either
    expect(soldSummary(MIX, 0).overProduction).toBe(false)
  })

  it('no tranches: nothing sold, no average', () => {
    expect(soldSummary([], 1000)).toEqual({
      validTranches: [],
      soldSc: 0,
      soldPct: 0,
      avgPriceBrl: null,
      overProduction: false,
      invalid: [],
    })
  })
})

describe('bushels and the market dollar', () => {
  it('a tranche in bushels is divided by the bushels per sack of the crop', () => {
    const tr = [t({ id: 'a', volume: 2204.62, volumeUnit: 'bu', price: 100 })]
    expect(soldSummary(tr, 10000, 2.20462).soldSc).toBeCloseTo(1000, 9)
    expect(soldSummary(tr, 10000, 2.36218).soldSc).toBeCloseTo(2204.62 / 2.36218, 9) // milho
  })

  it('a US$ sale without its own dollar uses the market dollar saved with it', () => {
    const usd = t({ id: 'u', volume: 100, price: 20, priceCurrency: 'USD', marketDollar: 5.5 })
    const s = soldSummary([usd], 1000)
    expect(s.invalid).toEqual([])
    expect(s.avgPriceBrl).toBeCloseTo(110, 9)
    // its own dollar wins over the saved market one
    expect(soldSummary([{ ...usd, dollar: 5 }], 1000).avgPriceBrl).toBeCloseTo(100, 9)
  })

  it('a US$ sale with neither dollar is still incomplete', () => {
    const s = soldSummary([t({ id: 'u', volume: 100, price: 20, priceCurrency: 'USD' })], 1000)
    expect(s.validTranches).toHaveLength(0)
    expect(s.invalid[0].reason).toMatch(/informe o dólar/)
  })
})

describe('trancheBrlAt / soldAvgPriceAt: a US$ sale with the dollar open follows the dollar of the scenario', () => {
  const brl: SaleTranche = { id: 'a', volume: 20000, volumeUnit: 'sc', price: 130, priceCurrency: 'BRL', dollar: null }
  const typed: SaleTranche = {
    id: 'b',
    volume: 10000,
    volumeUnit: 'sc',
    price: 25.5,
    priceCurrency: 'USD',
    dollar: 5.2,
  }
  const open: SaleTranche = {
    id: 'c',
    volume: 5000,
    volumeUnit: 'sc',
    price: 26,
    priceCurrency: 'USD',
    dollar: null,
    marketDollar: 5.0,
  }

  it('R$ and a typed dollar are fixed; an open dollar uses the scenario dollar, not the one saved with the sale', () => {
    expect(trancheBrlAt(brl, 5.5)).toBe(130)
    expect(trancheBrlAt(typed, 5.5)).toBeCloseTo(25.5 * 5.2, 9)
    expect(trancheBrlAt(open, 5.5)).toBeCloseTo(26 * 5.5, 9)
    expect(trancheBrlAt(open, 6)).toBeCloseTo(26 * 6, 9)
  })

  it('no price, or no dollar at all, gives null', () => {
    expect(trancheBrlAt({ ...brl, price: 0 }, 5.5)).toBeNull()
    expect(trancheBrlAt({ ...open, marketDollar: null }, 5.5)).toBeNull()
    expect(trancheBrlAt(open, Number.NaN)).toBeNull()
  })

  it('the weighted average changes with the scenario dollar only through the open-dollar tranche (audit case)', () => {
    const at55 = soldAvgPriceAt([brl, typed, open], 5.5, 2.20462)!
    // (20.000 x 130 + 10.000 x 25,5 x 5,2 + 5.000 x 26 x 5,5) / 35.000
    expect(at55).toBeCloseTo((2_600_000 + 1_326_000 + 715_000) / 35_000, 9)
    const at50 = soldAvgPriceAt([brl, typed, open], 5.0, 2.20462)!
    expect(at55 - at50).toBeCloseTo((5000 * 26 * 0.5) / 35_000, 9)
  })

  it('invalid tranches are ignored; none gives null; tonnes and bushels are converted to sacks', () => {
    expect(soldAvgPriceAt([], 5.5, 2.20462)).toBeNull()
    expect(soldAvgPriceAt([{ ...brl, volume: 0 }], 5.5, 2.20462)).toBeNull()
    const t: SaleTranche = { ...brl, volume: 60, volumeUnit: 't', price: 100 }
    expect(soldAvgPriceAt([t, { ...brl, volume: 1000, price: 200 }], 5.5, 2.20462)).toBeCloseTo(
      (1000 * 100 + 1000 * 200) / 2000,
      9,
    )
  })
})
