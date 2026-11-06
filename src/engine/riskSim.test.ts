import { computeResult, type FarmInputs, type Scenario } from './calc'
import { CROPS } from './crops'
import { activeHedge, type HedgeOp } from './hedge'
import type { SaleTranche } from './sales'
import { marginAt } from './sensitivity'
import { farmBasisBrlSc } from './scenarioMatrix'
import {
  RISK_DRIVERS,
  basisBreakdown,
  biggestLoss,
  cardDelta,
  cbotInReais,
  dollarSides,
  levelAt,
  moveForLevel,
  partsAt,
  riskCurve,
  scenarioAt,
  simulate,
  zeroPoint,
  type RiskCtx,
  type RiskDriver,
} from './riskSim'

const crop = CROPS.soja
const BPS = crop.bushelsPerSack
const base: Scenario = { cbotUsc: 1241.25, basisUsc: -56.5, fx: 5.4998 }

const plain: FarmInputs = {
  areaHa: 1000,
  yieldScHa: 60,
  costPerHaBrl: 4573.8,
  freightBrlPerSc: 26,
  portFeesBrlPerSc: 8.56,
  soldPct: 0,
  soldAvgPriceBrl: 0,
  targetMargin: null,
  marginBase: 'receita',
  costUsd: [{ usdPerHa: 353.69, boughtPct: 0.3, boughtRate: 5.2 }],
  fxLockPct: 0,
  fxLockRate: 0,
  costScHa: 0,
}
const brlSale = (volume: number, price = 130): SaleTranche => ({
  id: 'b' + volume,
  volume,
  volumeUnit: 'sc',
  price,
  priceCurrency: 'BRL',
  dollar: null,
})
const usdSale = (volume: number, price: number, dollar: number | null): SaleTranche => ({
  id: 'u' + volume,
  volume,
  volumeUnit: 'sc',
  price,
  priceCurrency: 'USD',
  dollar,
})
const putOp: HedgeOp = {
  id: 'p',
  asset: 'soja',
  kind: 'put',
  side: 'comprado',
  qty: 20000 * BPS,
  strike: 1200,
  premium: 20,
  fxFixed: null,
  maturity: '',
}
const fxFuture: HedgeOp = {
  id: 'f',
  asset: 'dolar',
  kind: 'futuro',
  side: 'vendido',
  qty: 500_000,
  strike: 5.6,
  premium: 0,
  fxFixed: null,
  maturity: '',
}

const ctxOf = (over: Partial<RiskCtx> = {}): RiskCtx => ({ crop, base, inputs: plain, tranches: [], ...over })
const full = (): RiskCtx =>
  ctxOf({
    inputs: { ...plain, fxLockPct: 0.25, fxLockRate: 5.3, hedge: activeHedge([putOp, fxFuture], base.fx) },
    tranches: [brlSale(18120), usdSale(8000, 24, 5.5), usdSale(5000, 24, null)],
  })

const CTXS: Record<string, () => RiskCtx> = {
  'nothing fixed': () => ctxOf(),
  'sales only': () => ctxOf({ tranches: [brlSale(18120)] }),
  'everything fixed': full,
}
const MOVES: Record<RiskDriver, number[]> = {
  dolar: [-99, -50, -25, -1, 0, 0.5, 10, 100],
  cbot: [-99, -50, -25, -1, 0, 0.5, 10, 100],
  basis: [-20, -15, -1, 0, 0.5, 7, 20],
}

describe('riskSim: the simulation is the engine calculation', () => {
  for (const [name, mk] of Object.entries(CTXS)) {
    for (const d of RISK_DRIVERS) {
      it(`${name}, ${d}: equals marginAt at the same scenario, with and without the fixings, no NaN`, () => {
        const ctx = mk()
        for (const mv of MOVES[d]) {
          const sim = simulate(ctx, d, mv)
          expect(sim).not.toBeNull()
          const sF = scenarioAt(ctx, d, mv, true)!
          const sU = scenarioAt(ctx, d, mv, false)!
          expect(sim!.withLocks.at.margin).toBeCloseTo(marginAt(crop, sF, ctx.inputs, ctx.tranches, true)!, 6)
          expect(sim!.noLocks.at.margin).toBeCloseTo(marginAt(crop, sU, ctx.inputs, ctx.tranches, false)!, 6)
          expect(sim!.withLocks.today.margin).toBeCloseTo(marginAt(crop, base, ctx.inputs, ctx.tranches, true)!, 6)
          expect(sim!.lockValue).toBeCloseTo(sim!.withLocks.delta - sim!.noLocks.delta, 6)
          for (const v of [sim!.withLocks.delta, sim!.noLocks.delta, sim!.lockValue, sim!.level!]) {
            expect(Number.isFinite(v)).toBe(true)
          }
          const p = sim!.withLocks.at
          expect(p.revenue - p.cost).toBeCloseTo(p.margin, 6)
        }
      })
    }
  }

  it('nothing fixed: the two lines are the same and the lock is worth nothing... except the bought US$ costs', () => {
    const ctx = ctxOf({ inputs: { ...plain, costUsd: [{ usdPerHa: 353.69, boughtPct: 0, boughtRate: 0 }] } })
    for (const d of RISK_DRIVERS) {
      const s = simulate(ctx, d, -10)!
      expect(s.lockValue).toBeCloseTo(0, 6)
    }
  })

  it('today equals computeResult when nothing is sold (margin per sack x production)', () => {
    const ctx = ctxOf()
    const r = computeResult(crop, base, plain)
    const t = partsAt(ctx, 'dolar', 0, true)!
    expect(t.margin).toBeCloseTo(r.marginTotal!, 4)
    expect(t.farmPrice).toBeCloseTo(r.farmPriceBrl!, 8)
  })

  it('a dollar lock does not break the basis move: the farm basis changes by exactly the typed R$/sc in both lines', () => {
    const ctx = full()
    for (const fixed of [true, false]) {
      const inputs = fixed ? ctx.inputs : { ...ctx.inputs, fxLockPct: 0, fxLockRate: 0 }
      const s0 = scenarioAt(ctx, 'basis', 0, fixed)!
      const s1 = scenarioAt(ctx, 'basis', 3.7, fixed)!
      expect(farmBasisBrlSc(crop, s1, inputs)! - farmBasisBrlSc(crop, s0, inputs)!).toBeCloseTo(3.7, 9)
    }
  })

  it('invalid levels give null, never NaN', () => {
    const ctx = ctxOf()
    expect(simulate(ctx, 'dolar', -100)).toBeNull()
    expect(simulate(ctx, 'cbot', -100)).toBeNull()
    expect(simulate(ctx, 'dolar', Number.NaN)).toBeNull()
    expect(partsAt(ctxOf({ inputs: { ...plain, yieldScHa: 0 } }), 'dolar', 0, true)).toBeNull()
  })

  it('levels and their inverse', () => {
    const ctx = ctxOf()
    expect(levelAt(ctx, 'dolar', 10)).toBeCloseTo(base.fx * 1.1, 9)
    expect(levelAt(ctx, 'cbot', -50)).toBeCloseTo(base.cbotUsc / 2, 9)
    expect(levelAt(ctx, 'basis', 0)).toBeCloseTo(farmBasisBrlSc(crop, base, plain)!, 9)
    for (const d of RISK_DRIVERS) expect(moveForLevel(ctx, d, levelAt(ctx, d, 7)!)).toBeCloseTo(7, 9)
  })
})

describe('riskSim: break-even', () => {
  for (const [name, mk] of Object.entries(CTXS)) {
    for (const d of RISK_DRIVERS) {
      for (const fixed of [true, false]) {
        it(`${name}, ${d}, ${fixed ? 'with' : 'without'} locks: margin is zero at the returned move`, () => {
          const ctx = mk()
          const z = zeroPoint(ctx, d, fixed)
          if (z === null) return // no zero in range is a legal answer
          const m = partsAt(ctx, d, z.move, fixed)!.margin
          expect(Math.abs(m)).toBeLessThan(1) // R$ 1 on a crop of millions
          expect(z.slack).toBeCloseTo(Math.abs(z.move), 12)
          expect(z.level).toBeCloseTo(levelAt(ctx, d, z.move)!, 9)
          expect(z.fromNegative).toBe(partsAt(ctx, d, 0, fixed)!.margin < 0)
        })
      }
    }
  }

  it('is the nearest zero to today and handles a margin that is already negative', () => {
    // yield 45: the margin is negative today; the dollar must rise to bring it back
    const ctx = ctxOf({ inputs: { ...plain, yieldScHa: 45 } })
    expect(partsAt(ctx, 'cbot', 0, true)!.margin).toBeLessThan(0)
    const z = zeroPoint(ctx, 'cbot', true)!
    expect(z.fromNegative).toBe(true)
    expect(z.move).toBeGreaterThan(0)
  })

  it('no zero in range: null', () => {
    const rich = ctxOf({ inputs: { ...plain, costPerHaBrl: 100, costUsd: [] } })
    expect(zeroPoint(rich, 'basis', true)).toBeNull()
  })

  it('basis zero moves by exactly the margin per sack with nothing sold and no US$ cost', () => {
    const ctx = ctxOf({ inputs: { ...plain, costUsd: [] } })
    const m0 = partsAt(ctx, 'basis', 0, true)!
    const z = zeroPoint(ctx, 'basis', true)!
    expect(z.move).toBeCloseTo(-m0.margin / m0.productionSc, 6)
  })
})

describe('riskSim: cards and curve', () => {
  it('card values are the margin change for -1% / -R$ 1,00/sc with the locks', () => {
    const ctx = full()
    const m0 = marginAt(crop, base, ctx.inputs, ctx.tranches, true)!
    const down = (s: Scenario) => marginAt(crop, s, ctx.inputs, ctx.tranches, true)! - m0
    expect(cardDelta(ctx, 'dolar')).toBeCloseTo(down({ ...base, fx: base.fx * 0.99 }), 6)
    expect(cardDelta(ctx, 'cbot')).toBeCloseTo(down({ ...base, cbotUsc: base.cbotUsc * 0.99 }), 6)
    expect(cardDelta(ctx, 'basis')).toBeCloseTo(down(scenarioAt(ctx, 'basis', -1, true)!), 6)
  })

  it('nothing sold: the basis card is -R$ 1 x the production; the biggest loss is picked', () => {
    const ctx = ctxOf({ inputs: { ...plain, costUsd: [] } })
    expect(cardDelta(ctx, 'basis')).toBeCloseTo(-60000, 4)
    const vals = RISK_DRIVERS.map((d) => cardDelta(ctx, d)!)
    expect(biggestLoss(ctx)).toBe(RISK_DRIVERS[vals.indexOf(Math.min(...vals))])
  })

  it('no production: nothing is computable and there is no biggest loss', () => {
    const ctx = ctxOf({ inputs: { ...plain, areaHa: 0 } })
    expect(cardDelta(ctx, 'dolar')).toBeNull()
    expect(biggestLoss(ctx)).toBeNull()
  })

  it('the curve has 41 points, today in the middle, and equals the engine margin per sack', () => {
    const ctx = full()
    for (const d of RISK_DRIVERS) {
      const c = riskCurve(ctx, d)
      expect(c).toHaveLength(41)
      expect(c[20].move).toBeCloseTo(0, 9)
      const t = partsAt(ctx, d, 0, true)!
      expect(c[20].withLocks!).toBeCloseTo(t.margin / t.productionSc, 8)
      const end = partsAt(ctx, d, c[40].move, false)!
      expect(c[40].noLocks!).toBeCloseTo(end.margin / end.productionSc, 8)
      for (const p of c) expect(Number.isFinite(p.withLocks!) && Number.isFinite(p.noLocks!)).toBe(true)
    }
    expect(riskCurve(ctx, 'basis')[0].move).toBeCloseTo(-15, 9)
    expect(riskCurve(ctx, 'dolar')[40].move).toBeCloseTo(25, 9)
  })
})

describe('riskSim: driver-specific numbers', () => {
  it('dollar: shares, bought average, and the +R$ 0,10 effect adds up (revenue - cost = margin)', () => {
    const ctx = full()
    const d = dollarSides(ctx)
    expect(d.hasUsdCost).toBe(true)
    expect(d.usdTotal).toBeCloseTo(353.69 * 1000, 6)
    expect(d.usdBought).toBeCloseTo(353.69 * 1000 * 0.3, 6)
    expect(d.usdOpen).toBeCloseTo(353.69 * 1000 * 0.7, 6)
    expect(d.boughtAvgRate).toBeCloseTo(5.2, 9)
    expect(d.boughtPct).toBeCloseTo(0.3, 9)
    const usdBrlHa = 353.69 * (0.3 * 5.2 + 0.7 * base.fx)
    expect(d.usdShare).toBeCloseTo(usdBrlHa / (4573.8 + usdBrlHa), 9)
    expect(d.plus!.revenue - d.plus!.cost).toBeCloseTo(d.plus!.margin, 6)
    // cost per sack rises only with the open US$ part: 353,69 x 0,7 x 0,10 per ha over 60 sc/ha, on 60.000 sc
    expect(d.plus!.cost).toBeCloseTo(353.69 * 0.7 * 0.1 * 1000, 4)
    const m0 = marginAt(crop, base, ctx.inputs, ctx.tranches, true)!
    const m1 = marginAt(crop, { ...base, fx: base.fx + 0.1 }, ctx.inputs, ctx.tranches, true)!
    expect(d.plus!.margin).toBeCloseTo(m1 - m0, 6)
  })

  it('dollar: no US$ cost lines', () => {
    const d = dollarSides(ctxOf({ inputs: { ...plain, costUsd: [] } }))
    expect(d.hasUsdCost).toBe(false)
    expect(d.usdShare).toBe(0)
    expect(d.boughtAvgRate).toBeNull()
  })

  it('CBOT: US¢ -> R$/sc at the dollar of the farm price and on the unsold sacks; matches the engine move', () => {
    const ctx = ctxOf({ tranches: [brlSale(18120)] })
    const c = cbotInReais(ctx)!
    expect(c.unsoldSc).toBeCloseTo(60000 - 18120, 6)
    expect(c.rows.map((r) => r.usc)).toEqual([10, 25, 50, 100])
    expect(c.rows[0].brlPerSc).toBeCloseTo(10 * (BPS / 100) * base.fx, 9)
    // the engine: +10 US¢ on the CBOT (not a %), nothing else fixed
    const m0 = marginAt(crop, base, ctx.inputs, ctx.tranches, true)!
    const m1 = marginAt(crop, { ...base, cbotUsc: base.cbotUsc + 10 }, ctx.inputs, ctx.tranches, true)!
    expect(c.rows[0].onUnsold).toBeCloseTo(m1 - m0, 4)
  })

  it('CBOT with a dollar lock uses the effective dollar', () => {
    const ctx = ctxOf({ inputs: { ...plain, fxLockPct: 0.5, fxLockRate: 5 } })
    expect(cbotInReais(ctx)!.fx).toBeCloseTo(0.5 * base.fx + 0.5 * 5, 9)
  })

  it('basis: premium - freight - port fees = the farm basis; R$ 1/sc is worth the unsold sacks', () => {
    for (const ctx of [ctxOf({ tranches: [brlSale(18120)] }), full()]) {
      const b = basisBreakdown(ctx)!
      expect(b.premiumBrlSc - b.freight - b.portFees).toBeCloseTo(b.basis, 9)
      expect(b.basis).toBeCloseTo(farmBasisBrlSc(crop, base, ctx.inputs)!, 9)
    }
    const ctx = ctxOf({ tranches: [brlSale(18120)] })
    const b = basisBreakdown(ctx)!
    expect(b.unsoldSc).toBeCloseTo(41880, 6)
    const m0 = marginAt(crop, base, ctx.inputs, ctx.tranches, true)!
    const m1 = marginAt(crop, scenarioAt(ctx, 'basis', 1, true)!, ctx.inputs, ctx.tranches, true)!
    expect(m1 - m0).toBeCloseTo(b.unsoldSc, 4)
  })
})
