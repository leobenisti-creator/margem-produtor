import { describe, expect, it } from 'vitest'
import {
  barrierRisks,
  cbotCoverSplit,
  nearestBarrier,
  shortCallCaps,
  touchEffectBrl,
  touchLossBrl,
  touchedHedgeDeltaBrl,
} from './barrierRisk'
import {
  EMPTY_HEDGE_OP,
  activeHedge,
  hedgeOpMoney,
  hedgeBrlAt,
  hedgeOpProblem,
  opStatus,
  type HedgeOp,
  type HedgeSpec,
} from './hedge'
import type { DailyPoint, MarketHistory } from './history'

const BPS = 60 / 27.2155 // bushels per 60 kg sack of soybeans

const op = (p: Partial<HedgeOp>): HedgeOp => ({ id: 'op-1', ...EMPTY_HEDGE_OP, ...p })
const pts = (rows: [string, number][]): DailyPoint[] => rows.map(([date, settle]) => ({ date, settle }))
const specOf = (ops: HedgeOp[], today = '2026-11-06', history?: MarketHistory): HedgeSpec => {
  const s = activeHedge(ops, 5.5, { today, history, crop: 'soja' })
  if (!s) throw new Error('invalid op: ' + hedgeOpProblem(ops[0]))
  return s
}

// 100.000 bu of put bought at 1150, premium 25, knock-out if the CBOT reaches 1320 (barrier above the market).
const koPut = op({
  id: 'put-ko',
  kind: 'put',
  side: 'comprado',
  qty: 100_000,
  strike: 1150,
  premium: 25,
  startDate: '2026-10-20',
  maturityDate: '2027-07-15',
  barrier: { type: 'ko', price: 1320, dir: 'alta' },
})
const plainPut = op({ ...koPut, id: 'put', barrier: undefined })
const future = op({ id: 'fut', kind: 'futuro', side: 'vendido', qty: 150_000, strike: 1180, maturityDate: '2027-07-15' })
const accumulator = (extra: Partial<HedgeOp> = {}) =>
  op({
    id: 'acc',
    kind: 'accumulator',
    side: 'vendido',
    qty: 5000,
    strike: 1300,
    startDate: '2026-11-02',
    maturityDate: '2026-12-28',
    accum: { frequency: 'semanal', guaranteed: 3 },
    barrier: { type: 'ko', price: 1400, dir: 'alta' },
    ...extra,
  })

describe('hedgeOpMoney touch override', () => {
  it('without the argument nothing changes: the barrier is read from the scenario price', () => {
    const s = specOf([koPut])
    // premium paid is the same in both; the put alive at 1000 pays 150¢, dead at 1320+ pays nothing
    const below = hedgeOpMoney(koPut, s, 1000, 5.5)
    const above = hedgeOpMoney(koPut, s, 1320, 5.5)
    expect(below.projectedBrl).toBeGreaterThan(0)
    expect(above.projectedBrl).toBe(0)
  })
  it("'touched' kills a knock-out even at a price below the barrier; 'untouched' keeps it alive above it", () => {
    const s = specOf([koPut])
    expect(hedgeOpMoney(koPut, s, 1000, 5.5, 'touched').projectedBrl).toBe(0)
    expect(hedgeOpMoney(koPut, s, 1400, 5.5, 'untouched').projectedBrl).toBe(0) // above the strike it pays 0 anyway
    const alive = hedgeOpMoney(koPut, s, 1000, 5.5, 'untouched')
    expect(alive.projectedBrl).toBeCloseTo(((150 * 100_000) / 100) * 5.5, 6)
  })
  it('the premium is paid whatever the path', () => {
    const s = specOf([koPut])
    const a = hedgeOpMoney(koPut, s, 1000, 5.5, 'touched')
    const b = hedgeOpMoney(koPut, s, 1000, 5.5, 'untouched')
    expect(a.premiumBrl).toBeCloseTo(-((25 * 100_000) / 100) * 5.5, 6)
    expect(a.premiumBrl).toBe(b.premiumBrl)
    expect(a.realizedBrl).toBe(b.realizedBrl)
  })
})

describe('touchEffectBrl / touchLossBrl', () => {
  it('a knock-out put: touching costs the whole payoff the put would have had at the final price', () => {
    const s = specOf([koPut])
    // final CBOT 1000: the put would pay 150¢ × 100.000 bu ÷ 100 = US$ 150.000 × 5,5
    expect(touchEffectBrl(koPut, s, 1000, 5.5)).toBeCloseTo(-150_000 * 5.5, 6)
    // final CBOT above the strike: the put would pay nothing, so nothing is lost
    expect(touchEffectBrl(koPut, s, 1250, 5.5)).toBeCloseTo(0, 9)
    expect(touchLossBrl(s, 1000, 5.5)).toBeCloseTo(-150_000 * 5.5, 6)
  })
  it('operations without a barrier have no effect; a plain future neither', () => {
    const s = specOf([plainPut, future])
    expect(touchEffectBrl(plainPut, s, 1000, 5.5)).toBe(0)
    expect(touchEffectBrl(future, s, 1000, 5.5)).toBe(0)
    expect(touchLossBrl(s, 1000, 5.5)).toBe(0)
  })
  it('a knock-out that already happened (history) is not a risk any more', () => {
    const hist: MarketHistory = { cbotUsc: { soja: pts([['2026-10-20', 1240], ['2026-11-02', 1325], ['2026-11-05', 1241]]) } }
    const s = specOf([koPut], '2026-11-06', hist)
    expect(touchLossBrl(s, 1000, 5.5)).toBe(0)
  })
  it('accumulator: the guaranteed fixings survive a knock-out, the others are lost', () => {
    const acc = accumulator()
    const s = specOf([acc], '2026-11-06')
    const fx = 5.5
    // 8 weekly fixings (2 Nov to 28 Dec), the one of today's week is done or not by the dates; the loss is what the
    // fixings not guaranteed would have settled at 1000: (1300 − 1000)¢ × 5.000 bu ÷ 100 × 5,5 each
    const loss = touchEffectBrl(acc, s, 1000, fx)
    const perFixing = ((1300 - 1000) * 5000) / 100 * fx
    expect(loss).toBeLessThan(0)
    expect(Math.abs(loss) % perFixing).toBeCloseTo(0, 4) // a whole number of fixings
  })
})

describe('barrierRisks', () => {
  it('describes the live knock-out put: distance, sacks and the risk flag', () => {
    const s = specOf([koPut])
    const [r] = barrierRisks(s, 1241.25, BPS)
    expect(r).toMatchObject({
      id: 'put-ko',
      kind: 'put',
      type: 'ko',
      dir: 'alta',
      barrierUsc: 1320,
      strikeUsc: 1150,
      state: 'aberta',
      covers: true,
      atRisk: true,
      beyondToday: false,
    })
    expect(r.sc).toBeCloseTo(100_000 / BPS, 6)
    expect(r.distanceUsc).toBeCloseTo(1320 - 1241.25, 9)
    expect(r.distancePct).toBeCloseTo(1320 / 1241.25 - 1, 12)
  })
  it('flags a today price already beyond the barrier with no record of the touch', () => {
    const s = specOf([koPut])
    const [r] = barrierRisks(s, 1330, BPS)
    expect(r.beyondToday).toBe(true)
  })
  it('a knock-out that happened in the history: derrubada, no sacks, not at risk, date kept', () => {
    const hist: MarketHistory = { cbotUsc: { soja: pts([['2026-10-20', 1240], ['2026-11-02', 1325], ['2026-11-05', 1241]]) } }
    const s = specOf([koPut], '2026-11-06', hist)
    const [r] = barrierRisks(s, 1241, BPS)
    expect(r).toMatchObject({ state: 'derrubada', sc: 0, atRisk: false, hitDate: '2026-11-02', beyondToday: false })
  })
  it('ignores operations without a barrier, the dollar, and invalid operations', () => {
    const s = specOf([plainPut, future])
    expect(barrierRisks(s, 1241, BPS)).toEqual([])
    expect(barrierRisks(specOf([koPut]), Number.NaN, BPS)).toEqual([])
    expect(barrierRisks(specOf([koPut]), 1241, 0)).toEqual([])
  })
  it('ranks by the closest barrier and nearestBarrier takes the closest one that still covers', () => {
    const far = op({ ...koPut, id: 'far', barrier: { type: 'ko', price: 1500, dir: 'alta' } })
    const near = op({ ...koPut, id: 'near', barrier: { type: 'ko', price: 1280, dir: 'alta' } })
    const risks = barrierRisks(specOf([far, koPut, near]), 1241, BPS)
    expect(risks.map((r) => r.id)).toEqual(['near', 'put-ko', 'far'])
    expect(nearestBarrier(risks)?.id).toBe('near')
    expect(nearestBarrier([])).toBeNull()
  })
  it('a knock-in not yet active is listed but covers nothing and is not at risk', () => {
    const ki = op({ ...koPut, id: 'ki', barrier: { type: 'ki', price: 1100, dir: 'baixa' } })
    const [r] = barrierRisks(specOf([ki]), 1241, BPS)
    expect(r).toMatchObject({ type: 'ki', state: 'nao-ativada', sc: 0, atRisk: false })
  })
  it('a call bought or a put sold with a knock-out does not cover and is never at risk', () => {
    const call = op({ ...koPut, id: 'call', kind: 'call', strike: 1300 })
    const sold = op({ ...koPut, id: 'sold', side: 'vendido' })
    const out = barrierRisks(specOf([call, sold]), 1241, BPS)
    expect(out.every((r) => !r.covers && !r.atRisk && r.sc === 0)).toBe(true)
  })
  it('baixa barrier: distance is negative and the touch is below the price', () => {
    const low = op({ ...koPut, id: 'low', barrier: { type: 'ko', price: 1100, dir: 'baixa' } })
    const [r] = barrierRisks(specOf([low]), 1241, BPS)
    expect(r.distanceUsc).toBeCloseTo(1100 - 1241, 9)
    expect(r.distancePct).toBeLessThan(0)
    expect(r.beyondToday).toBe(false)
  })
})

describe('cbotCoverSplit', () => {
  it('a future and a plain put are firm; the knock-out put is the part that depends on the barrier', () => {
    const s = specOf([future, plainPut, koPut])
    const c = cbotCoverSplit(s, BPS)
    expect(c.firmSc).toBeCloseTo((150_000 + 100_000) / BPS, 6)
    expect(c.barrierSc).toBeCloseTo(100_000 / BPS, 6)
    expect(c.totalSc).toBeCloseTo(c.firmSc + c.barrierSc, 9)
    expect(c.barrierShare).toBeCloseTo(c.barrierSc / c.totalSc, 12)
  })
  it('without barrier operations the share is 0; without any cover everything is 0', () => {
    const c = cbotCoverSplit(specOf([future, plainPut]), BPS)
    expect(c.barrierSc).toBe(0)
    expect(c.barrierShare).toBe(0)
    expect(cbotCoverSplit(specOf([koPut]), 0)).toEqual({ firmSc: 0, barrierSc: 0, totalSc: 0, barrierShare: 0 })
  })
  it('a knocked-out put gives no cover at all (history), and a bought future subtracts', () => {
    const hist: MarketHistory = { cbotUsc: { soja: pts([['2026-10-20', 1240], ['2026-11-02', 1325], ['2026-11-05', 1241]]) } }
    expect(cbotCoverSplit(specOf([koPut], '2026-11-06', hist), BPS).totalSc).toBe(0)
    const bought = op({ id: 'bought', kind: 'futuro', side: 'comprado', qty: 50_000, strike: 1200, maturityDate: '2027-07-15' })
    const c = cbotCoverSplit(specOf([future, bought]), BPS)
    expect(c.firmSc).toBeCloseTo(100_000 / BPS, 6)
  })
  it('accumulator: the guaranteed fixings still to come are firm, the rest depends on the knock-out', () => {
    const acc = accumulator()
    const s = specOf([acc], '2026-11-06')
    const c = cbotCoverSplit(s, BPS)
    // 3 guaranteed fixings, one already done (Monday 2 Nov, before today): 2 guaranteed still to come
    expect(opStatus(acc, s).fixingsDone).toBe(1)
    expect(c.firmSc).toBeCloseTo((2 * 5000) / BPS, 6)
    expect(c.totalSc).toBeGreaterThan(c.firmSc)
    expect(c.barrierSc).toBeCloseTo(c.totalSc - c.firmSc, 9)
  })
})

describe('shortCallCaps', () => {
  const soldCall = op({
    id: 'call-s',
    kind: 'call',
    side: 'vendido',
    qty: 50_000,
    strike: 1350,
    premium: 20,
    maturityDate: '2027-07-15',
  })
  it('lists the open calls sold with the strike, the sacks and the distance; nothing about the cover', () => {
    const [c] = shortCallCaps(specOf([soldCall]), 1241, BPS)
    expect(c).toMatchObject({ id: 'call-s', strikeUsc: 1350 })
    expect(c.sc).toBeCloseTo(50_000 / BPS, 6)
    expect(c.distanceUsc).toBeCloseTo(1350 - 1241, 9)
    expect(c.distancePct).toBeCloseTo(1350 / 1241 - 1, 12)
    expect(c.barrier).toBeUndefined()
    expect(cbotCoverSplit(specOf([soldCall]), BPS).totalSc).toBe(0)
  })
  it('keeps the knock-out barrier of the call sold (the cap ends if it is touched)', () => {
    const ko = op({ ...soldCall, id: 'call-ko', startDate: '2026-10-20', barrier: { type: 'ko', price: 1500, dir: 'alta' } })
    const [c] = shortCallCaps(specOf([ko]), 1241, BPS)
    expect(c.barrier).toEqual({ type: 'ko', price: 1500, dir: 'alta' })
  })
  it('a knocked-out call sold, a call bought, a put and a knock-in not active are not caps', () => {
    const hist: MarketHistory = { cbotUsc: { soja: pts([['2026-10-20', 1240], ['2026-11-02', 1505], ['2026-11-05', 1241]]) } }
    const ko = op({ ...soldCall, id: 'k', startDate: '2026-10-20', barrier: { type: 'ko', price: 1500, dir: 'alta' } })
    expect(shortCallCaps(specOf([ko], '2026-11-06', hist), 1241, BPS)).toEqual([])
    const bought = op({ ...soldCall, id: 'b', side: 'comprado' })
    expect(shortCallCaps(specOf([bought, plainPut]), 1241, BPS)).toEqual([])
    const ki = op({ ...soldCall, id: 'ki', startDate: '2026-10-20', barrier: { type: 'ki', price: 1400, dir: 'alta' } })
    expect(shortCallCaps(specOf([ki]), 1241, BPS)).toEqual([])
    expect(shortCallCaps(specOf([soldCall]), 0, BPS)).toEqual([])
  })
  it('ranks by the closest strike', () => {
    const far = op({ ...soldCall, id: 'far', strike: 1500 })
    expect(shortCallCaps(specOf([far, soldCall]), 1241, BPS).map((c) => c.id)).toEqual(['call-s', 'far'])
  })
})

describe('touchedHedgeDeltaBrl: the margin if a knock-out is touched ("Seu risco")', () => {
  // The same operations with the barrier moved to a price any scenario is beyond: the engine itself kills them.
  const forced = (o: HedgeOp): HedgeOp => (o.barrier ? { ...o, barrier: { ...o.barrier, price: 0.0001 } } : o)
  const ops = [future, koPut, plainPut, accumulator()]
  for (const cbot of [900, 1000, 1150, 1241, 1300, 1319, 1320, 1400, 1500]) {
    it(`hedge as read + delta = the hedge with every knock-out forced dead, CBOT ${cbot}`, () => {
      const s = specOf(ops)
      const dead = specOf(ops.map(forced))
      const asRead = hedgeBrlAt(s, cbot, 5.5)
      const worst = hedgeBrlAt(dead, cbot, 5.5)
      expect(asRead + touchedHedgeDeltaBrl(s, cbot, 5.5)).toBeCloseTo(worst, 6)
    })
  }
  it('is 0 without a live knock-out, and 0 above the barrier (already read as touched)', () => {
    expect(touchedHedgeDeltaBrl(specOf([future, plainPut]), 1000, 5.5)).toBe(0)
    expect(touchedHedgeDeltaBrl(specOf([koPut]), 1400, 5.5)).toBe(0)
    expect(touchedHedgeDeltaBrl(specOf([koPut]), 1000, 5.5)).toBeLessThan(0)
  })
})
