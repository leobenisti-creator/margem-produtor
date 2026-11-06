import { computeExposure, type ExposureInput } from './exposure'
import { hedgeOpBrl, hedgeBrlAt, type HedgeOp } from './hedge'
import type { SaleTranche } from './sales'

const BPS = 2.20462
const P = 60000

const sale = (id: string, volume: number, over: Partial<SaleTranche> = {}): SaleTranche => ({
  id,
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
const base = (over: Partial<ExposureInput> = {}): ExposureInput => ({
  productionSc: P,
  areaHa: 1000,
  bushelsPerSack: BPS,
  tranches: [],
  hedgeOps: [],
  usdPerSc: 30,
  costsUsdOpen: 0,
  ...over,
})
const sumProfiles = (e: ReturnType<typeof computeExposure>) =>
  e.ok ? e.profiles.reduce((s, p) => s + p.sc, 0) : NaN

describe('auditoria: exposição em casos extremos', () => {
  it('vender mais do que a produção: nada em aberto, aviso, perfis somam a produção', () => {
    const e = computeExposure(base({ tranches: [sale('a', 90000)] }))
    if (!e.ok) throw new Error('not ok')
    expect(e.basis.openSc).toBe(0)
    expect(e.cbot.openSc).toBe(0)
    expect(e.notes.join(' ')).toMatch(/mais que a produção/)
    expect(sumProfiles(e)).toBeCloseTo(P, 6)
    expect(e.allClosed).toBe(true)
  })

  it('hedge maior que a produção: sem negativo, marca superproteção, perfis somam a produção', () => {
    const e = computeExposure(base({ hedgeOps: [op({ qty: 10_000_000 })] }))
    if (!e.ok) throw new Error('not ok')
    expect(e.cbot.openSc).toBe(0)
    expect(e.cbot.overHedged).toBe(true)
    expect(e.cbot.coverSc).toBeCloseTo(P, 6)
    expect(e.basis.openSc).toBe(P) // no basis hedge exists
    expect(sumProfiles(e)).toBeCloseTo(P, 6)
    expect(e.notes.join(' ')).toMatch(/mais proteção/)
  })

  it('futuro comprado reduz a cobertura (não vira venda) e nunca dá aberto maior que a produção', () => {
    const e = computeExposure(base({ hedgeOps: [op({ side: 'comprado', qty: 500000 })] }))
    if (!e.ok) throw new Error('not ok')
    // long on top of the physical: exposure above the production, said out loud, and the partition still sums to P
    expect(e.cbot.openSc).toBeGreaterThan(P)
    expect(e.notes.join(' ')).toMatch(/futuro comprado soma exposição/)
    expect(sumProfiles(e)).toBeCloseTo(P, 6)
  })

  it('cobertura parcial do CBOT: 50% das sacas vendidas em futuro', () => {
    const half = (P / 2) * BPS
    const e = computeExposure(base({ hedgeOps: [op({ qty: half })] }))
    if (!e.ok) throw new Error('not ok')
    expect(e.cbot.openSc).toBeCloseTo(P / 2, 4)
    expect(e.cbot.pct).toBeCloseTo(0.5, 6)
    expect(sumProfiles(e)).toBeCloseTo(P, 6)
  })

  it('venda em US$ com dólar em aberto fica exposta ao dólar; com dólar digitado, não', () => {
    const open = computeExposure(base({ tranches: [sale('a', 20000, { priceCurrency: 'USD', price: 28, marketDollar: 5.5 })] }))
    const fixed = computeExposure(base({ tranches: [sale('a', 20000, { priceCurrency: 'USD', price: 28, dollar: 5.4 })] }))
    if (!open.ok || !fixed.ok) throw new Error('not ok')
    expect(open.dollar.openSc).toBe(P) // 40.000 unsold + 20.000 sold with open dollar
    expect(fixed.dollar.openSc).toBe(P - 20000)
    expect(sumProfiles(open)).toBeCloseTo(P, 6)
    expect(sumProfiles(fixed)).toBeCloseTo(P, 6)
  })

  it('venda em US$ sem nenhum dólar (nem de mercado) não entra', () => {
    const e = computeExposure(base({ tranches: [sale('a', 20000, { priceCurrency: 'USD', price: 28 })] }))
    if (!e.ok) throw new Error('not ok')
    expect(e.soldSc).toBe(0)
  })

  it('operação em dólar sem preço por saca: não inventa cobertura e avisa', () => {
    const e = computeExposure(base({ usdPerSc: null, hedgeOps: [op({ asset: 'dolar', qty: 500000, strike: 5.5 })] }))
    if (!e.ok) throw new Error('not ok')
    expect(e.dollar.coverSc).toBe(0)
    expect(e.notes.join(' ')).toMatch(/não puderam ser convertidas/)
  })

  it('custos em US$ abertos viram sacas e o líquido pode ser negativo', () => {
    const e = computeExposure(
      base({
        tranches: [sale('a', 60000)], // all sold in R$ → no revenue exposed to the dollar
        costsUsdOpen: 300000, // US$ 300.000 / 30 US$/sc = 10.000 sc
      }),
    )
    if (!e.ok) throw new Error('not ok')
    expect(e.dollar.openSc).toBe(0)
    expect(e.dollar.costsSc).toBeCloseTo(10000, 6)
    expect(e.dollar.netSc).toBeCloseTo(-10000, 6)
  })

  it('varredura: o perfil sempre soma a produção, nada é NaN/negativo', () => {
    const sold = [0, 1, 20000, 59999, 60000, 100000]
    const qtys = [0, 1000, 100000, 66138.6, 132277, 5_000_000]
    const kinds: Partial<HedgeOp>[] = [
      { kind: 'futuro', side: 'vendido' },
      { kind: 'futuro', side: 'comprado' },
      { kind: 'put', side: 'comprado', premium: 30 },
      { kind: 'call', side: 'vendido', premium: 30 },
      { kind: 'put', side: 'vendido', premium: 30 },
      { kind: 'futuro', side: 'vendido', fxFixed: 5.4 },
      { asset: 'dolar', kind: 'futuro', side: 'vendido', strike: 5.5 },
      { asset: 'dolar', kind: 'put', side: 'comprado', strike: 5.5, premium: 0.1 },
    ]
    for (const s of sold)
      for (const cur of ['BRL', 'USD'] as const)
        for (const q of qtys)
          for (const k of kinds) {
            const tr = s > 0 ? [sale('a', s, cur === 'USD' ? { priceCurrency: 'USD', price: 28, marketDollar: 5.5 } : {})] : []
            const e = computeExposure(base({ tranches: tr, hedgeOps: [op({ qty: q, ...k })], costsUsdOpen: 1000 }))
            if (!e.ok) throw new Error('not ok')
            expect(sumProfiles(e)).toBeCloseTo(P, 4)
            for (const f of [e.basis, e.cbot, e.dollar]) {
              expect(f.openSc).toBeGreaterThanOrEqual(0)
              if (k.side !== 'comprado') expect(f.openSc).toBeLessThanOrEqual(P + 1e-6)
              expect(Number.isFinite(f.pct)).toBe(true)
            }
            for (const p of e.profiles) expect(p.sc).toBeGreaterThan(0)
          }
  })
})

describe('auditoria: resultado das operações (conferido à mão)', () => {
  const spec = (ops: HedgeOp[]) => ({ ops, marketFx: 5.5 })

  it('futuro vendido 100.000 bu a 1300: CBOT cai a 1200 → +US$ 100.000 × dólar do cenário', () => {
    const o = op({})
    expect(hedgeOpBrl(o, spec([o]), 1200, 5)).toBeCloseTo(100000 * 5, 6)
    expect(hedgeOpBrl(o, spec([o]), 1400, 5)).toBeCloseTo(-100000 * 5, 6)
  })

  it('put comprado strike 1300 prêmio 30: CBOT 1200 → (100−30)¢ × 100.000 bu; CBOT 1400 → só o prêmio', () => {
    const o = op({ kind: 'put', side: 'comprado', premium: 30 })
    expect(hedgeOpBrl(o, spec([o]), 1200, 5)).toBeCloseTo(((100 * 100000) / 100) * 5 - ((30 * 100000) / 100) * 5.5, 6)
    expect(hedgeOpBrl(o, spec([o]), 1400, 5)).toBeCloseTo(-((30 * 100000) / 100) * 5.5, 6)
  })

  it('call vendida: recebe o prêmio e paga acima do strike', () => {
    const o = op({ kind: 'call', side: 'vendido', premium: 20 })
    expect(hedgeOpBrl(o, spec([o]), 1200, 5)).toBeCloseTo(((20 * 100000) / 100) * 5.5, 6)
    expect(hedgeOpBrl(o, spec([o]), 1400, 5)).toBeCloseTo(-((100 * 100000) / 100) * 5 + ((20 * 100000) / 100) * 5.5, 6)
  })

  it('dólar: futuro vendido US$ 100.000 a 5,50, dólar a 5,00 → +R$ 50.000', () => {
    const o = op({ asset: 'dolar', qty: 100000, strike: 5.5 })
    expect(hedgeOpBrl(o, spec([o]), 1300, 5)).toBeCloseTo(50000, 6)
  })

  it('dólar fixado na operação de soja: ignora o dólar do cenário', () => {
    const o = op({ fxFixed: 5.4 })
    expect(hedgeOpBrl(o, spec([o]), 1200, 9)).toBeCloseTo(100000 * 5.4, 6)
  })

  it('total = soma; sem operações = 0 exato; operação inválida não entra', () => {
    const a = op({ id: 'a' })
    const b = op({ id: 'b', side: 'comprado' })
    expect(hedgeBrlAt(spec([a, b]), 1200, 5)).toBeCloseTo(0, 6)
    expect(hedgeBrlAt(undefined, 1200, 5)).toBe(0)
    expect(hedgeBrlAt(spec([op({ qty: 0 })]), 1200, 5)).toBe(0)
  })
})
