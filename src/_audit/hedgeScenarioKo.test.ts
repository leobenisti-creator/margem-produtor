import { EMPTY_HEDGE_OP, activeHedge, hedgeOpMoney, type HedgeOp } from '../engine/hedge'
import type { DailyPoint } from '../engine/history'

const pts = (rows: [string, number][]): DailyPoint[] => rows.map(([date, settle]) => ({ date, settle }))

describe('accumulator knocked out only in the scenario keeps its guaranteed fixings', () => {
  const o: HedgeOp = {
    id: 'a',
    ...EMPTY_HEDGE_OP,
    kind: 'accumulator',
    side: 'vendido',
    qty: 5000,
    strike: 1300,
    startDate: '2026-03-02',
    maturityDate: '2026-03-30', // Mondays: 2, 9, 16, 23, 30 Mar
    barrier: { type: 'ko', price: 1245, dir: 'baixa' },
    accum: { frequency: 'semanal', guaranteed: 3 },
  }
  const history = {
    cbotUsc: { soja: pts([['2026-03-02', 1250], ['2026-03-09', 1280]]) },
    fx: pts([['2026-03-02', 5], ['2026-03-09', 5]]),
  }
  const spec = activeHedge([o], 5.4, { today: '2026-03-10', history, crop: 'soja' })!

  it('scenario below the barrier: the 3rd fixing (guaranteed) still settles at the scenario, the 4th and 5th die', () => {
    const m = hedgeOpMoney(o, spec, 1200, 5.4)
    // 1 fixing x 5000 bu x (1300 - 1200) US cents / 100 x 5.4 = 27,000
    expect(m.projectedBrl).toBeCloseTo(27_000, 6)
    // realized: Mar 2 (1300-1250) and Mar 9 (1300-1280): 5000 x 70 / 100 x 5.0 = 17,500
    expect(m.realizedBrl).toBeCloseTo(17_500, 6)
  })

  it('scenario above the barrier: the 3 fixings still to come all count', () => {
    const m = hedgeOpMoney(o, spec, 1400, 5.4)
    expect(m.projectedBrl).toBeCloseTo(3 * 5000 * ((1300 - 1400) / 100) * 5.4, 6)
  })
})
