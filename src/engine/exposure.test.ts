import { computeExposure, type ExposureInput, type ExposureOk } from './exposure'
import { CROPS } from './crops'
import type { HedgeOp } from './hedge'
import type { SaleTranche } from './sales'

const BPS = CROPS.soja.bushelsPerSack
const bu = (sc: number) => sc * BPS

// 100 ha x 100 sc/ha = 10.000 sc; US$ 20/sc at the market dollar.
const base: ExposureInput = {
  productionSc: 10000,
  areaHa: 100,
  bushelsPerSack: BPS,
  tranches: [],
  hedgeOps: [],
  usdPerSc: 20,
  costsUsdOpen: 0,
}

const sale = (p: Partial<SaleTranche>): SaleTranche => ({
  id: 's',
  volume: 4000,
  volumeUnit: 'sc',
  price: 120,
  priceCurrency: 'BRL',
  dollar: null,
  ...p,
})
const op = (p: Partial<HedgeOp>): HedgeOp => ({
  id: 'o',
  asset: 'soja',
  kind: 'futuro',
  side: 'vendido',
  qty: bu(3000),
  strike: 1100,
  premium: 0,
  fxFixed: null,
  maturity: '',
  ...p,
})

function run(p: Partial<ExposureInput>): ExposureOk {
  const r = computeExposure({ ...base, ...p })
  if (!r.ok) throw new Error('expected ok')
  return r
}

describe('computeExposure', () => {
  it('nothing sold and no operations: everything open', () => {
    const r = run({})
    expect(r.allOpen).toBe(true)
    expect(r.anyExposed).toBe(true)
    for (const f of [r.basis, r.cbot, r.dollar]) {
      expect(f.openSc).toBe(10000)
      expect(f.pct).toBe(1)
      expect(f.scPerHa).toBe(100)
      expect(f.exposed).toBe(true)
    }
    expect(r.notes).toEqual([])
  })

  it('no production gives ok false', () => {
    expect(computeExposure({ ...base, productionSc: 0 })).toEqual({ ok: false })
    expect(computeExposure({ ...base, productionSc: Number.NaN })).toEqual({ ok: false })
  })

  it('a R$ sale closes basis, CBOT and dollar for its sacks', () => {
    const r = run({ tranches: [sale({ volume: 4000 })] })
    expect(r.soldSc).toBe(4000)
    expect(r.allOpen).toBe(false)
    expect(r.basis.openSc).toBe(6000)
    expect(r.cbot.openSc).toBe(6000)
    expect(r.dollar.openSc).toBe(6000)
    expect(r.basis.pct).toBeCloseTo(0.6, 10)
    expect(r.basis.scPerHa).toBe(60)
  })

  it('a US$ sale with a typed dollar closes all three', () => {
    const r = run({ tranches: [sale({ priceCurrency: 'USD', price: 22, dollar: 5.5 })] })
    expect([r.basis.openSc, r.cbot.openSc, r.dollar.openSc]).toEqual([6000, 6000, 6000])
  })

  it('a US$ sale with the dollar left open (market dollar saved) keeps only the dollar exposed', () => {
    const r = run({ tranches: [sale({ priceCurrency: 'USD', price: 22, dollar: null, marketDollar: 5.5 })] })
    expect(r.basis.openSc).toBe(6000)
    expect(r.cbot.openSc).toBe(6000)
    expect(r.dollar.openSc).toBe(10000)
  })

  it('a bushel/ton tranche is converted to sacks', () => {
    const r = run({ tranches: [sale({ volume: 60, volumeUnit: 't' })] })
    expect(r.soldSc).toBeCloseTo(1000, 6)
    expect(run({ tranches: [sale({ volume: bu(500), volumeUnit: 'bu' })] }).soldSc).toBeCloseTo(500, 6)
  })

  it('soy future sold covers CBOT only', () => {
    const r = run({ hedgeOps: [op({})] })
    expect(r.cbot.openSc).toBeCloseTo(7000, 6)
    expect(r.cbot.coverSc).toBeCloseTo(3000, 6)
    expect(r.cbot.floorSc).toBe(0)
    expect(r.basis.openSc).toBe(10000)
    expect(r.dollar.openSc).toBe(10000)
    expect(r.allOpen).toBe(false)
  })

  it('soy future sold with fxFixed also covers the dollar', () => {
    const r = run({ hedgeOps: [op({ fxFixed: 5.4 })] })
    expect(r.cbot.openSc).toBeCloseTo(7000, 6)
    expect(r.dollar.openSc).toBeCloseTo(7000, 6)
    expect(r.basis.openSc).toBe(10000)
  })

  it('dollar future sold converts the notional via US$/sc', () => {
    const r = run({ hedgeOps: [op({ asset: 'dolar', qty: 60000, strike: 5.5 })] })
    expect(r.dollar.openSc).toBeCloseTo(7000, 6) // 60.000 / 20 = 3.000 sc
    expect(r.cbot.openSc).toBe(10000)
  })

  it('soy put bought covers CBOT and is tracked as floor; dollar put bought likewise', () => {
    const r = run({
      hedgeOps: [
        op({ kind: 'put', side: 'comprado', premium: 30, qty: bu(2000), fxFixed: 5.4 }),
        op({ id: 'p2', asset: 'dolar', kind: 'put', side: 'comprado', qty: 20000, strike: 5.4 }),
      ],
    })
    expect(r.cbot.openSc).toBeCloseTo(8000, 6)
    expect(r.cbot.floorSc).toBeCloseTo(2000, 6)
    expect(r.dollar.openSc).toBeCloseTo(10000 - 2000 - 1000, 6)
    expect(r.dollar.floorSc).toBeCloseTo(3000, 6)
  })

  it('calls and puts sold do not cover', () => {
    const r = run({
      hedgeOps: [
        op({ kind: 'call', side: 'comprado', premium: 20 }),
        op({ id: 'b', kind: 'call', side: 'vendido', premium: 20 }),
        op({ id: 'c', kind: 'put', side: 'vendido', premium: 20 }),
        op({ id: 'd', asset: 'dolar', kind: 'put', side: 'vendido', qty: 50000, strike: 5.5, premium: 0.1 }),
      ],
    })
    expect(r.cbot.openSc).toBe(10000)
    expect(r.dollar.openSc).toBe(10000)
    expect(r.otherOps).toBe(4)
    expect(r.notes.join(' ')).toMatch(/4 operações não protegem/)
    expect(r.allOpen).toBe(false)
  })

  it('futures bought subtract cover', () => {
    const r = run({
      hedgeOps: [op({}), op({ id: 'b', side: 'comprado', qty: bu(1000), fxFixed: 5.4 })],
    })
    expect(r.cbot.openSc).toBeCloseTo(8000, 6)
    expect(r.dollar.openSc).toBeCloseTo(11000, 6) // bought with fxFixed: -1.000 sc of dollar cover
    const d = run({ hedgeOps: [op({ asset: 'dolar', side: 'comprado', qty: 20000, strike: 5.5 })] })
    expect(d.dollar.openSc).toBeCloseTo(11000, 6)
  })

  it('over-hedge: clamps at 0, flags and notes', () => {
    const r = run({ tranches: [sale({ volume: 8000 })], hedgeOps: [op({})] })
    expect(r.cbot.openSc).toBe(0)
    expect(r.cbot.overHedged).toBe(true)
    expect(r.cbot.coverSc).toBeCloseTo(2000, 6)
    expect(r.cbot.exposed).toBe(false)
    expect(r.notes.some((n) => n.includes('mais proteção do que produção em aberto'))).toBe(true)
    expect(r.basis.overHedged).toBe(false)
  })

  it('sold more than the production: notes it and clamps', () => {
    const r = run({ tranches: [sale({ volume: 12000 })] })
    expect(r.basis.openSc).toBe(0)
    expect(r.allClosed).toBe(true)
    expect(r.notes).toContain('As vendas somam mais que a produção estimada.')
  })

  it('open US$ costs: net negative (short dollar) and positive', () => {
    // 60.000 US$ / 20 = 3.000 sc of cost
    const short = run({ costsUsdOpen: 60000, tranches: [sale({ volume: 9000 })] })
    expect(short.dollar.openSc).toBe(1000)
    expect(short.dollar.costsUsd).toBe(60000)
    expect(short.dollar.costsSc).toBe(3000)
    expect(short.dollar.netSc).toBe(-2000)
    expect(short.dollar.netPct).toBeCloseTo(-0.2, 10)
    expect(short.dollar.netScPerHa).toBe(-20)
    const long = run({ costsUsdOpen: 60000 })
    expect(long.dollar.openSc).toBe(10000) // gross untouched
    expect(long.dollar.netSc).toBe(7000)
    expect(long.dollar.netPct).toBeCloseTo(0.7, 10)
  })

  it('usdPerSc null: dollar notional ignored with a note, costs not convertible', () => {
    const r = run({
      usdPerSc: null,
      costsUsdOpen: 1000,
      hedgeOps: [op({ asset: 'dolar', qty: 60000, strike: 5.5 })],
    })
    expect(r.dollar.openSc).toBe(10000)
    expect(r.dollar.costsSc).toBeNull()
    expect(r.dollar.netSc).toBeNull()
    expect(r.dollar.netPct).toBeNull()
    expect(r.notes.length).toBe(2)
    // no open costs: nothing to convert
    expect(run({ usdPerSc: null }).dollar.netSc).toBe(10000)
  })

  it('invalid tranches and operations are ignored', () => {
    const r = run({
      tranches: [sale({ volume: 0 }), sale({ id: 'x', priceCurrency: 'USD', dollar: null, marketDollar: null })],
      hedgeOps: [op({ qty: 0 }), op({ id: 'y', strike: 0 })],
    })
    expect(r.soldSc).toBe(0)
    expect(r.allOpen).toBe(true)
    expect(r.cbot.openSc).toBe(10000)
  })

  it('exposed only above 0,5% of the production', () => {
    expect(run({ tranches: [sale({ volume: 9950 })] }).basis.exposed).toBe(false) // 50 sc = 0,5% exactly
    expect(run({ tranches: [sale({ volume: 9940 })] }).basis.exposed).toBe(true)
  })

  it('area unknown: scPerHa null', () => {
    expect(run({ areaHa: 0 }).basis.scPerHa).toBeNull()
  })

  describe('profiles', () => {
    const prof = (r: ExposureOk) => Object.fromEntries(r.profiles.map((x) => [x.key, x.sc]))
    const total = (r: ExposureOk) => r.profiles.reduce((a, x) => a + x.sc, 0)

    it('nothing sold: all in the fully open profile', () => {
      const r = run({})
      expect(r.profiles).toHaveLength(1)
      expect(r.profiles[0]).toMatchObject({ key: 'tudo', sc: 10000, pct: 1, open: ['basis', 'cbot', 'dolar'] })
    })

    it('BRL sale plus soy future sold without fxFixed: CBOT covered only', () => {
      const r = run({ tranches: [sale({ volume: 4000 })], hedgeOps: [op({})] })
      const p = prof(r)
      expect(p.travado).toBe(4000)
      expect(p['basis-dolar']).toBeCloseTo(3000, 6)
      expect(p.tudo).toBeCloseTo(3000, 6)
      expect(total(r)).toBeCloseTo(10000, 6)
    })

    it('CBOT and dollar covers overlap on the same sacks', () => {
      const r = run({ tranches: [sale({ volume: 4000 })], hedgeOps: [op({ fxFixed: 5.4 })] })
      const p = prof(r)
      expect(p.basis).toBeCloseTo(3000, 6)
      expect(p.tudo).toBeCloseTo(3000, 6)
      expect(p['basis-dolar']).toBeUndefined()
    })

    it('US$ sale with open dollar plus dollar future: only-dollar-covered and open-dollar sold sacks', () => {
      const r = run({
        tranches: [sale({ priceCurrency: 'USD', price: 22, dollar: null, marketDollar: 5.5 })],
        hedgeOps: [op({ asset: 'dolar', qty: 60000, strike: 5.5 })],
      })
      const p = prof(r)
      expect(p.dolar).toBe(4000)
      expect(p['basis-cbot']).toBeCloseTo(3000, 6)
      expect(p.tudo).toBeCloseTo(3000, 6)
      expect(p.travado).toBeUndefined()
      expect(r.profiles.map((x) => x.key)).toEqual(['dolar', 'basis-cbot', 'tudo'])
    })

    it('dollar cover left after the unsold sacks closes the open-dollar sold ones', () => {
      const r = run({
        tranches: [sale({ volume: 8000, priceCurrency: 'USD', price: 22, dollar: null, marketDollar: 5.5 })],
        hedgeOps: [op({ asset: 'dolar', qty: 100000, strike: 5.5 })],
      })
      const p = prof(r)
      expect(p['basis-cbot']).toBeCloseTo(2000, 6)
      expect(p.dolar).toBeCloseTo(5000, 6)
      expect(p.travado).toBeCloseTo(3000, 6)
      expect(total(r)).toBeCloseTo(10000, 6)
    })

    it('over-hedge and sold > production stay clamped and consistent', () => {
      const over = run({ tranches: [sale({ volume: 8000 })], hedgeOps: [op({})] })
      expect(prof(over).travado).toBe(8000)
      expect(prof(over)['basis-dolar']).toBeCloseTo(2000, 6)
      expect(total(over)).toBeCloseTo(10000, 6)
      const sold = run({
        tranches: [
          sale({ volume: 12000 }),
          sale({ id: 'u', volume: 6000, priceCurrency: 'USD', price: 22, dollar: null, marketDollar: 5.5 }),
        ],
      })
      expect(total(sold)).toBeCloseTo(10000, 6)
      expect(prof(sold).tudo).toBeUndefined()
    })

    it('sums to the production in several scenarios; bought futures count as no cover', () => {
      const cases: Partial<ExposureInput>[] = [
        {},
        { hedgeOps: [op({}), op({ id: 'b', side: 'comprado', qty: bu(9000), fxFixed: 5.4 })] },
        { tranches: [sale({ volume: 2500 })], hedgeOps: [op({ qty: bu(20000), fxFixed: 5.4 })] },
        { tranches: [sale({ volume: 3000, priceCurrency: 'USD', price: 22, dollar: 5.3 })] },
        { usdPerSc: null, hedgeOps: [op({ asset: 'dolar', qty: 1000, strike: 5 })] },
      ]
      for (const c of cases) {
        const r = run(c)
        expect(total(r)).toBeCloseTo(10000, 6)
        expect(r.profiles.reduce((a, x) => a + x.pct, 0)).toBeCloseTo(1, 9)
      }
    })
  })
})
