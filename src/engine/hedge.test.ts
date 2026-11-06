import { describe, expect, it } from 'vitest'
import {
  EMPTY_HEDGE_OP,
  activeHedge,
  hedgeBrlAt,
  hedgeBreakdown,
  type HedgeKind,
  type HedgeOp,
  type HedgeSide,
  type HedgeSpec,
} from './hedge'

const op = (p: Partial<HedgeOp>): HedgeOp => ({ id: 'op-1', ...EMPTY_HEDGE_OP, ...p })

describe('hedge payoff: soja (strike 1200 US¢/bu, 10.000 bu, prêmio 30, dólar de mercado 5)', () => {
  const spec = (o: HedgeOp): HedgeSpec => ({ ops: [o], marketFx: 5 })
  // [kind, side, settle, expected R$] at a scenario dollar of 6: payoff × 100 US$ per ¢ × 6 + premium × 100 × 5
  const table: [HedgeKind, HedgeSide, number, number][] = [
    ['futuro', 'vendido', 1100, 60000],
    ['futuro', 'vendido', 1300, -60000],
    ['futuro', 'comprado', 1100, -60000],
    ['futuro', 'comprado', 1300, 60000],
    ['put', 'comprado', 1100, 45000], // 100 × 600 − 30 × 500
    ['put', 'comprado', 1300, -15000],
    ['put', 'vendido', 1100, -45000],
    ['put', 'vendido', 1300, 15000],
    ['call', 'comprado', 1100, -15000],
    ['call', 'comprado', 1300, 45000], // 100 × 600 − 30 × 500
    ['call', 'vendido', 1100, 15000],
    ['call', 'vendido', 1300, -45000],
  ]
  it.each(table)('%s %s at %i', (kind, side, settle, expected) => {
    const o = op({ asset: 'soja', kind, side, qty: 10000, strike: 1200, premium: kind === 'futuro' ? 0 : 30 })
    expect(hedgeBrlAt(spec(o), settle, 6)).toBeCloseTo(expected, 6)
    expect(hedgeBreakdown(spec(o), settle, 6)).toEqual([
      {
        id: 'op-1',
        label: expect.stringContaining('Soja'),
        brl: expect.closeTo(expected, 6),
        // the cost of the operation is its premium (30 cents x 10.000 bu / 100 x market dollar 5 = R$ 15.000), the rest is its result
        premiumBrl: expect.closeTo(kind === 'futuro' ? 0 : side === 'comprado' ? -15_000 : 15_000, 6),
        resultBrl: expect.closeTo(expected - (kind === 'futuro' ? 0 : side === 'comprado' ? -15_000 : 15_000), 6),
        state: 'aberta',
      },
    ])
  })

  it('premium is converted at the market dollar (constant), not at the column dollar', () => {
    const o = op({ kind: 'call', side: 'comprado', qty: 10000, strike: 1200, premium: 30 })
    // out of the money: only the premium (−30 × 100 US$ = −3000 US$) at the market dollar 5
    for (const fx of [4.5, 5, 6.5]) expect(hedgeBrlAt(spec(o), 1100, fx)).toBeCloseTo(-15000, 6)
  })

  it('a fixed dollar makes the soy result independent of the scenario dollar (payoff and premium)', () => {
    const o = op({ kind: 'put', side: 'comprado', qty: 10000, strike: 1200, premium: 30, fxFixed: 5.2 })
    const at = (fx: number) => hedgeBrlAt(spec(o), 1100, fx)
    expect(at(4)).toBeCloseTo((100 * 100 - 30 * 100) * 5.2, 6)
    expect(at(7)).toBeCloseTo(at(4), 9)
  })

  it('a future follows the scenario dollar when it is open', () => {
    const o = op({ kind: 'futuro', side: 'vendido', qty: 10000, strike: 1200 })
    expect(hedgeBrlAt(spec(o), 1100, 4)).toBeCloseTo(40000, 6)
    expect(hedgeBrlAt(spec(o), 1100, 6)).toBeCloseTo(60000, 6)
  })
})

describe('hedge payoff: dólar (strike 5,5 R$/US$, US$ 100.000, prêmio 0,2)', () => {
  const spec = (o: HedgeOp): HedgeSpec => ({ ops: [o], marketFx: 5.4 })
  const table: [HedgeKind, HedgeSide, number, number][] = [
    ['futuro', 'vendido', 5, 50000],
    ['futuro', 'vendido', 6, -50000],
    ['futuro', 'comprado', 5, -50000],
    ['futuro', 'comprado', 6, 50000],
    ['put', 'comprado', 5, 30000], // 0,5 × 1e5 − 0,2 × 1e5
    ['put', 'comprado', 6, -20000],
    ['put', 'vendido', 5, -30000],
    ['put', 'vendido', 6, 20000],
    ['call', 'comprado', 5, -20000],
    ['call', 'comprado', 6, 30000],
    ['call', 'vendido', 5, 20000],
    ['call', 'vendido', 6, -30000],
  ]
  it.each(table)('%s %s with the dollar at %d', (kind, side, fx, expected) => {
    const o = op({ asset: 'dolar', kind, side, qty: 1e5, strike: 5.5, premium: kind === 'futuro' ? 0 : 0.2 })
    // the CBOT price is irrelevant to a dollar operation
    expect(hedgeBrlAt(spec(o), 1000, fx)).toBeCloseTo(expected, 6)
    expect(hedgeBrlAt(spec(o), 1500, fx)).toBeCloseTo(expected, 6)
  })
})

describe('hedge helpers', () => {
  it('an invalid operation contributes 0 and is left out of the breakdown', () => {
    const bad = op({ id: 'bad', qty: 0, strike: 1200 })
    const good = op({ id: 'good', qty: 10000, strike: 1200 })
    const spec: HedgeSpec = { ops: [bad, good], marketFx: 5 }
    expect(hedgeBrlAt(spec, 1100, 5)).toBeCloseTo(50000, 6)
    expect(hedgeBreakdown(spec, 1100, 5).map((l) => l.id)).toEqual(['good'])
    expect(hedgeBrlAt({ ops: [bad], marketFx: 5 }, 1100, 5)).toBe(0)
    expect(hedgeBrlAt(undefined, 1100, 5)).toBe(0)
  })

  it('breakdown label: asset · kind side · maturity', () => {
    const o = op({ qty: 10000, strike: 1200, maturity: 'jul/27' })
    expect(hedgeBreakdown({ ops: [o], marketFx: 5 }, 1200, 5)[0].label).toBe('Soja · futuro vendido · jul/27')
    expect(
      hedgeBreakdown({ ops: [{ ...o, asset: 'dolar', strike: 5, maturity: '' }], marketFx: 5 }, 1200, 5)[0].label,
    ).toBe('Dólar · futuro vendido')
  })

  it('activeHedge: undefined without valid ops or without a usable market dollar', () => {
    const good = op({ qty: 1, strike: 1 })
    const bad = op({ id: 'b' })
    expect(activeHedge([], 5)).toBeUndefined()
    expect(activeHedge([bad], 5)).toBeUndefined()
    expect(activeHedge([good], 0)).toBeUndefined()
    expect(activeHedge([good], Number.NaN)).toBeUndefined()
    expect(activeHedge([good, bad], 5)).toEqual({ ops: [good], marketFx: 5 })
  })
})
