import { computeExposure, type ExposureInput, type ExposureOk } from './exposure'
import type { HedgeOp } from './hedge'
import type { SaleTranche } from './sales'
import { DEFAULT_STEPS, mapSegments, riskDonut, riskLanes, riskList, riskSensitivity } from './exposureView'

const BPS = 2.20462
const P = 60000

const sale = (volume: number, over: Partial<SaleTranche> = {}): SaleTranche => ({
  id: 's' + volume,
  volume,
  volumeUnit: 'sc',
  price: 150,
  priceCurrency: 'BRL',
  dollar: null,
  ...over,
})
const op = (over: Partial<HedgeOp>): HedgeOp => ({
  id: 'h1',
  asset: 'soja',
  kind: 'futuro',
  side: 'vendido',
  qty: 100000,
  strike: 1300,
  premium: 0,
  fxFixed: null,
  maturity: '',
  ...over,
})
const exposure = (over: Partial<ExposureInput> = {}): ExposureOk => {
  const e = computeExposure({
    productionSc: P,
    areaHa: 1000,
    bushelsPerSack: BPS,
    tranches: [],
    hedgeOps: [],
    usdPerSc: 30,
    costsUsdOpen: 0,
    ...over,
  })
  if (!e.ok) throw new Error('not ok')
  return e
}

describe('mapSegments', () => {
  it('one segment per profile, from closed to open, with value at today price and the closed risks', () => {
    const e = exposure({ tranches: [sale(24000)] })
    const segs = mapSegments(e, 150)
    expect(segs.map((s) => s.key)).toEqual(['travado', 'tudo'])
    expect(segs[0]).toMatchObject({
      sc: 24000,
      pct: 0.4,
      brl: 24000 * 150,
      open: [],
      closed: ['cbot', 'basis', 'dolar'],
    })
    expect(segs[1]).toMatchObject({
      sc: 36000,
      pct: 0.6,
      brl: 36000 * 150,
      open: ['basis', 'cbot', 'dolar'],
      closed: [],
    })
    expect(segs[0].text).toMatch(/já travados/)
    expect(segs[1].text).toMatch(/Nada travado/)
  })

  it('the segments always add up to the production', () => {
    const e = exposure({
      tranches: [sale(10000), sale(5000, { priceCurrency: 'USD', price: 28, marketDollar: 5.5 })],
      hedgeOps: [op({ qty: 20000 * BPS })],
    })
    expect(mapSegments(e, 150).reduce((s, x) => s + x.sc, 0)).toBeCloseTo(P, 6)
  })

  it('a future covering the CBOT leaves basis and dollar open', () => {
    const e = exposure({ hedgeOps: [op({ qty: P * BPS })] })
    const segs = mapSegments(e, null)
    expect(segs).toHaveLength(1)
    expect(segs[0]).toMatchObject({ key: 'basis-dolar', open: ['basis', 'dolar'], closed: ['cbot'], brl: null })
  })
})

describe('riskLanes', () => {
  it('nothing done: all three open, nothing closed it', () => {
    const lanes = riskLanes(exposure(), 150)
    expect(lanes.map((l) => l.risk)).toEqual(['dolar', 'basis', 'cbot'])
    for (const l of lanes) {
      expect(l).toMatchObject({ openSc: P, closedSc: 0, openPct: 1, closedPct: 0, closedBy: [] })
      expect(l.openBrl).toBe(P * 150)
    }
  })

  it('a sale in R$ closes the three; an operation adds to the CBOT lane; what closed each one is listed', () => {
    const e = exposure({ tranches: [sale(24000)], hedgeOps: [op({ qty: 20000 * BPS })] })
    const [dolar, basis, cbot] = riskLanes(e, 150)
    expect(dolar.openSc).toBe(36000)
    expect(dolar.closedBy).toEqual([{ label: 'Vendas em R$ ou com dólar fixado', sc: 24000 }])
    expect(basis.openSc).toBe(36000)
    expect(basis.closedBy).toEqual([{ label: 'Vendas', sc: 24000 }])
    expect(cbot.openSc).toBeCloseTo(16000, 6)
    expect(cbot.closedSc).toBeCloseTo(44000, 6)
    expect(cbot.closedBy.map((s) => s.label)).toEqual(['Vendas', 'Operações em bolsa'])
    expect(cbot.closedBy[1].sc).toBeCloseTo(20000, 6)
  })

  it('a sale in US$ with the dollar open does not close the dollar lane', () => {
    const e = exposure({ tranches: [sale(24000, { priceCurrency: 'USD', price: 28, marketDollar: 5.5 })] })
    const [dolar, basis] = riskLanes(e, 150)
    expect(dolar.openSc).toBe(P)
    expect(dolar.closedBy).toEqual([])
    expect(basis.openSc).toBe(36000)
  })

  it('put sacks are open but flagged with the floor; over-protection is flagged', () => {
    const e = exposure({ hedgeOps: [op({ kind: 'put', side: 'comprado', qty: 10000 * BPS, premium: 20 })] })
    expect(riskLanes(e, null)[2].floorSc).toBeCloseTo(10000, 6)
    const over = exposure({ hedgeOps: [op({ qty: 10_000_000 })] })
    expect(riskLanes(over, null)[2]).toMatchObject({ overHedged: true, openSc: 0 })
  })

  it('without a price the money is null', () => {
    expect(riskLanes(exposure(), null).every((l) => l.openBrl === null)).toBe(true)
  })
})

describe('riskSensitivity (hand computed)', () => {
  // dollar 5, reference R$ 100/sc => US$ 20/sc; 60.000 sc all open
  const input = (e: ExposureOk) => ({
    exp: e,
    fx: 5,
    bushelsPerSack: BPS,
    referencePriceBrl: 100,
    steps: DEFAULT_STEPS,
  })

  it('everything open: dollar R$ 0,50 on US$ 1.200.000, basis R$ 2/sc on 60.000 sc, CBOT 50 cents', () => {
    const s = riskSensitivity(input(exposure()))
    expect(s.ok).toBe(true)
    const [dolar, basis, cbot] = s.lines
    // 60.000 sc x US$ 20 = US$ 1.200.000; x 0,50
    expect(dolar.down).toBeCloseTo(-600_000, 6)
    expect(dolar.up).toBeCloseTo(600_000, 6)
    // 60.000 sc x R$ 2
    expect(basis.down).toBeCloseTo(-120_000, 6)
    expect(basis.up).toBeCloseTo(120_000, 6)
    // 50 cents x 2,20462 / 100 x 5 = R$ 5,51155/sc x 60.000
    expect(cbot.down).toBeCloseTo(-330_693, 0)
    expect(cbot.up).toBeCloseTo(330_693, 0)
    expect(s.allDown).toBeCloseTo(-600_000 - 120_000 - 330_693, 0)
    expect(s.allUp).toBeCloseTo(600_000 + 120_000 + 330_693, 0)
  })

  it('open US$ costs are the opposite position: they are netted from the dollar', () => {
    const e = exposure({ costsUsdOpen: 100_000 })
    const dolar = riskSensitivity(input(e)).lines[0]
    // (60.000 x 20 - 100.000) = 1.100.000 x 0,50
    expect(dolar.down).toBeCloseTo(-550_000, 6)
    expect(dolar.up).toBeCloseTo(550_000, 6)
  })

  it('costs bigger than the exposed revenue: a falling dollar is a gain', () => {
    const e = exposure({ tranches: [sale(60000)], costsUsdOpen: 100_000 })
    const dolar = riskSensitivity(input(e)).lines[0]
    // revenue exposure 0, costs US$ 100.000: dollar down 0,50 => +50.000 (cost falls); up => -50.000
    expect(dolar.down).toBeCloseTo(50_000, 6)
    expect(dolar.up).toBeCloseTo(-50_000, 6)
  })

  it('a bought put protects the fall but keeps the rise (CBOT asymmetry)', () => {
    const e = exposure({ hedgeOps: [op({ kind: 'put', side: 'comprado', qty: 10000 * BPS, premium: 20 })] })
    const cbot = riskSensitivity(input(e)).lines[2]
    // 10.000 sc are floored: open 50.000 sc fall; 60.000 sc rise
    expect(cbot.openSc).toBeCloseTo(50_000, 6)
    expect(cbot.floorSc).toBeCloseTo(10_000, 6)
    expect(cbot.down).toBeCloseTo(-5.51155 * 50_000, 0)
    expect(cbot.up).toBeCloseTo(5.51155 * 60_000, 0)
  })

  it('a future that covers the whole CBOT leaves a zero CBOT line; basis and dollar stay', () => {
    const e = exposure({ hedgeOps: [op({ qty: P * BPS })] })
    const [dolar, basis, cbot] = riskSensitivity(input(e)).lines
    expect(cbot.down).toBeCloseTo(0, 6)
    expect(cbot.up).toBeCloseTo(0, 6)
    expect(basis.down).toBeCloseTo(-120_000, 6)
    expect(dolar.down).toBeCloseTo(-600_000, 6)
  })

  it('everything sold: every line is zero', () => {
    const s = riskSensitivity(input(exposure({ tranches: [sale(60000)] })))
    expect(s.allDown).toBeCloseTo(0, 6)
    expect(s.allUp).toBeCloseTo(0, 6)
  })

  it('cannot be computed without a price, a dollar, or with a negative step', () => {
    const e = exposure()
    expect(riskSensitivity({ ...input(e), referencePriceBrl: null }).ok).toBe(false)
    expect(riskSensitivity({ ...input(e), fx: Number.NaN }).ok).toBe(false)
    expect(riskSensitivity({ ...input(e), steps: { ...DEFAULT_STEPS, dolar: -1 } }).ok).toBe(false)
  })

  it('a zero step gives a zero line (the producer can switch a risk off)', () => {
    const s = riskSensitivity({ ...input(exposure()), steps: { dolar: 0, basisBrlSc: 2, cbotUsc: 50 } })
    expect(s.lines[0].down).toBeCloseTo(0, 6)
    expect(s.lines[0].up).toBeCloseTo(0, 6)
  })
})

describe('riskList', () => {
  it('joins the names in pt-BR', () => {
    expect(riskList([])).toBe('')
    expect(riskList(['basis'])).toBe('basis')
    expect(riskList(['basis', 'dolar'])).toBe('basis e dólar')
    expect(riskList(['cbot', 'basis', 'dolar'])).toBe('CBOT, basis e dólar')
  })
})

describe('riskDonut (what closed each risk)', () => {
  const sumSc = (e: ExposureOk, r: 'dolar' | 'basis' | 'cbot') => riskDonut(e, r, 150).reduce((s, x) => s + x.sc, 0)

  it('nothing done: one open slice with the whole crop, for the three risks', () => {
    const e = exposure()
    for (const r of ['dolar', 'basis', 'cbot'] as const) {
      const d = riskDonut(e, r, 150)
      expect(d).toHaveLength(1)
      expect(d[0]).toMatchObject({ key: 'aberto', sc: P, pct: 1, tone: 'open', brl: P * 150 })
    }
  })

  it('sales and operations: each slice is what closed the risk; they add up to the production', () => {
    const e = exposure({ tranches: [sale(24000)], hedgeOps: [op({ qty: 20000 * BPS })] })
    const cbot = riskDonut(e, 'cbot', 150)
    expect(cbot.map((s) => s.key)).toEqual(['vendas', 'operacoes', 'aberto'])
    expect(cbot[0].sc).toBe(24000)
    expect(cbot[1].sc).toBeCloseTo(20000, 6)
    expect(cbot[2].sc).toBeCloseTo(16000, 6)
    expect(sumSc(e, 'cbot')).toBeCloseTo(P, 6)
    // basis has no hedge: only sold and open
    expect(riskDonut(e, 'basis', 150).map((s) => [s.key, s.sc])).toEqual([
      ['vendas', 24000],
      ['aberto', 36000],
    ])
    expect(sumSc(e, 'basis')).toBeCloseTo(P, 6)
  })

  it('a put is its own slice (protected from the fall, upside kept)', () => {
    const e = exposure({ hedgeOps: [op({ kind: 'put', side: 'comprado', qty: 10000 * BPS, premium: 20 })] })
    const cbot = riskDonut(e, 'cbot', 150)
    expect(cbot.map((s) => s.key)).toEqual(['put', 'aberto'])
    expect(cbot[0]).toMatchObject({ tone: 'put' })
    expect(cbot[0].sc).toBeCloseTo(10000, 6)
    expect(sumSc(e, 'cbot')).toBeCloseTo(P, 6)
  })

  it('dollar: only R$ or fixed-dollar sales close it; a US$ sale with open dollar stays open', () => {
    const e = exposure({
      tranches: [sale(10000), sale(20000, { priceCurrency: 'USD', price: 28, marketDollar: 5.5 })],
    })
    const d = riskDonut(e, 'dolar', 150)
    expect(d.map((s) => [s.key, s.sc])).toEqual([
      ['vendas', 10000],
      ['aberto', 50000],
    ])
    expect(sumSc(e, 'dolar')).toBeCloseTo(P, 6)
  })

  it('dollar: open US$ costs offset part of the open revenue (the natural opposite position)', () => {
    // US$ 300.000 of open costs / US$ 30 per sack = 10.000 sc
    const e = exposure({ costsUsdOpen: 300_000 })
    const d = riskDonut(e, 'dolar', 150)
    expect(d.map((s) => s.key)).toEqual(['compensado', 'aberto'])
    expect(d[0].sc).toBeCloseTo(10000, 6)
    expect(d[1]).toMatchObject({ label: 'Exposto de fato' })
    expect(d[1].sc).toBeCloseTo(50000, 6)
    expect(sumSc(e, 'dolar')).toBeCloseTo(P, 6)
  })

  it('costs bigger than the open revenue: the offset is capped at what is open', () => {
    const e = exposure({ tranches: [sale(50000)], costsUsdOpen: 3_000_000 }) // 100.000 sc of costs, 10.000 sc open
    const d = riskDonut(e, 'dolar', null)
    expect(d.map((s) => s.key)).toEqual(['vendas', 'compensado'])
    expect(d[1].sc).toBeCloseTo(10000, 6)
    expect(d.every((s) => s.brl === null)).toBe(true)
  })

  it('over-protection and a bought future never make a slice negative or the total pass the production', () => {
    for (const hedge of [op({ qty: 10_000_000 }), op({ side: 'comprado', qty: 500000 })]) {
      const e = exposure({ hedgeOps: [hedge], tranches: [sale(10000)] })
      for (const r of ['dolar', 'basis', 'cbot'] as const) {
        const d = riskDonut(e, r, 150)
        expect(d.every((s) => s.sc > 0)).toBe(true)
        expect(sumSc(e, r)).toBeCloseTo(P, 6)
      }
    }
  })

  it('every combination keeps the slices adding up to the production (sweep)', () => {
    for (const sold of [0, 1, 20000, 60000]) {
      for (const qty of [0, 1000, 100000, 300000, 5_000_000]) {
        for (const kind of ['futuro', 'put'] as const) {
          const e = exposure({
            tranches: sold > 0 ? [sale(sold)] : [],
            hedgeOps: qty > 0 ? [op({ qty, kind, side: kind === 'put' ? 'comprado' : 'vendido', premium: 10 })] : [],
            costsUsdOpen: 5_000,
          })
          for (const r of ['dolar', 'basis', 'cbot'] as const) {
            expect(sumSc(e, r)).toBeCloseTo(P, 4)
          }
        }
      }
    }
  })
})
