import {
  EMPTY_HEDGE_OP,
  activeHedge,
  coverOps,
  hedgeBrlAt,
  hedgeOpMoney,
  hedgeOpProblem,
  hedgeRealizedBrl,
  opStatus,
  type HedgeOp,
  type HedgeSpec,
} from './hedge'
import { exactSettle, firstCross, hasDataBetween, settleAt, type DailyPoint, type MarketHistory } from './history'

const op = (p: Partial<HedgeOp>): HedgeOp => ({ id: 'op-1', ...EMPTY_HEDGE_OP, ...p })
const pts = (rows: [string, number][]): DailyPoint[] => rows.map(([date, settle]) => ({ date, settle }))
const spec = (o: HedgeOp | HedgeOp[], today: string, history?: MarketHistory): HedgeSpec => {
  const s = activeHedge(Array.isArray(o) ? o : [o], 5.5, { today, history, crop: 'soja' })
  if (!s) throw new Error('invalid op: ' + hedgeOpProblem(Array.isArray(o) ? o[0] : o))
  return s
}
const money = (o: HedgeOp, s: HedgeSpec, cbot = 1240, fx = 5.4) => hedgeOpMoney(o, s, cbot, fx)

describe('history helpers', () => {
  const s = pts([
    ['2026-03-02', 1250],
    ['2026-03-06', 1260],
    ['2026-03-20', 1200],
  ])
  it('exactSettle / settleAt', () => {
    expect(exactSettle(s, '2026-03-06')).toBe(1260)
    expect(exactSettle(s, '2026-03-07')).toBeNull()
    expect(settleAt(s, '2026-03-09')).toBe(1260) // last one before it, 3 days
    expect(settleAt(s, '2026-03-01')).toBeNull() // nothing before
    expect(settleAt(s, '2026-03-17')).toBeNull() // 11 days without data: not used
    expect(settleAt(undefined, '2026-03-17')).toBeNull()
  })
  it('firstCross: alta needs settle >= price, baixa needs settle <= price; touching counts', () => {
    expect(firstCross(s, '2026-03-01', '2026-03-31', 'baixa', 1260)).toBe('2026-03-02')
    expect(firstCross(s, '2026-03-01', '2026-03-31', 'alta', 1260)).toBe('2026-03-06')
    expect(firstCross(s, '2026-03-01', '2026-03-31', 'baixa', 1200)).toBe('2026-03-20')
    expect(firstCross(s, '2026-03-01', '2026-03-19', 'baixa', 1200)).toBeNull()
    expect(firstCross(s, '2026-03-03', '2026-03-31', 'alta', 1300)).toBeNull()
    expect(hasDataBetween(s, '2026-03-03', '2026-03-05')).toBe(false)
  })
})

describe('future: open, expired, closed', () => {
  const fut = op({ kind: 'futuro', side: 'vendido', qty: 100_000, strike: 1300, maturityDate: '2026-03-31' })
  const hist: MarketHistory = {
    cbotUsc: {
      soja: pts([
        ['2026-02-10', 1280],
        ['2026-03-31', 1200],
      ]),
    },
    fx: pts([
      ['2026-02-10', 5.1],
      ['2026-03-31', 5.0],
    ]),
  }

  it('open (before maturity): settled at the scenario, nothing realized, still protects', () => {
    const s = spec(fut, '2026-03-01', hist)
    // (1300 − 1250) × 100.000 bu ÷ 100 = US$ 50.000 × 5,4
    const m = money(fut, s, 1250, 5.4)
    expect(m.projectedBrl).toBeCloseTo(270_000, 6)
    expect(m.realizedBrl).toBe(0)
    expect(opStatus(fut, s)).toMatchObject({ state: 'aberta', coverQty: 100_000, settled: false })
  })

  it('expired: realized at the settle and the dollar of the maturity day, whatever the scenario; no longer protects', () => {
    const s = spec(fut, '2026-04-10', hist)
    // (1300 − 1200) × 100.000 ÷ 100 = US$ 100.000 × 5,0
    for (const cbot of [900, 1250, 1500]) {
      const m = money(fut, s, cbot, 9)
      expect(m.realizedBrl).toBeCloseTo(500_000, 6)
      expect(m.projectedBrl).toBe(0)
    }
    expect(opStatus(fut, s)).toMatchObject({ state: 'vencida', coverQty: 0, settled: true })
    expect(hedgeBrlAt(s, 700, 7)).toBeCloseTo(500_000, 6)
  })

  it('maturity day itself counts as expired', () => {
    expect(opStatus(fut, spec(fut, '2026-03-31', hist)).state).toBe('vencida')
  })

  it('fixed dollar wins over the dollar of the day', () => {
    const o = { ...fut, fxFixed: 5.2 }
    expect(money(o, spec(o, '2026-04-10', hist)).realizedBrl).toBeCloseTo(520_000, 6)
  })

  it('closed before maturity: realized at the settle of the closing day', () => {
    const o = { ...fut, closedDate: '2026-02-10' }
    const s = spec(o, '2026-03-01', hist)
    // (1300 − 1280) × 1.000 = US$ 20.000 × 5,1
    expect(money(o, s).realizedBrl).toBeCloseTo(102_000, 6)
    expect(opStatus(o, s)).toMatchObject({ state: 'encerrada', coverQty: 0, settled: true })
  })

  it('expired but no history at that date: falls back to the scenario and says so', () => {
    const s = spec(fut, '2026-04-10', { cbotUsc: { soja: [] }, fx: [] })
    const st = opStatus(fut, s)
    expect(st.settled).toBe(false)
    expect(st.notes.join(' ')).toMatch(/Sem histórico/)
    expect(money(fut, s, 1250, 5.4).projectedBrl).toBeCloseTo(270_000, 6)
  })

  it('without a date of today nothing changes (every operation is open)', () => {
    const s = activeHedge([fut], 5.5)!
    expect(opStatus(fut, s).state).toBe('aberta')
    expect(money(fut, s, 1250, 5.4).projectedBrl).toBeCloseTo(270_000, 6)
  })

  it('dollar future expires against the dollar history', () => {
    const o = op({
      asset: 'dolar',
      kind: 'futuro',
      side: 'vendido',
      qty: 1_000_000,
      strike: 5.5,
      maturityDate: '2026-03-31',
    })
    const s = spec(o, '2026-04-10', hist)
    // (5,50 − 5,00) × US$ 1.000.000 = R$ 500.000
    expect(money(o, s).realizedBrl).toBeCloseTo(500_000, 6)
    expect(opStatus(o, s).coverQty).toBe(0)
  })
})

describe('options: premium always counts; barrier decides if it works', () => {
  const base = op({
    kind: 'put',
    side: 'comprado',
    qty: 100_000,
    strike: 1300,
    premium: 30,
    startDate: '2026-01-05',
    maturityDate: '2026-03-31',
  })
  const fx = pts([
    ['2026-01-05', 5.0],
    ['2026-03-31', 5.2],
  ])
  const quiet: MarketHistory = {
    cbotUsc: {
      soja: pts([
        ['2026-01-05', 1320],
        ['2026-02-10', 1180],
        ['2026-03-31', 1200],
      ]),
    },
    fx,
  }
  const touched: MarketHistory = {
    cbotUsc: {
      soja: pts([
        ['2026-01-05', 1320],
        ['2026-02-10', 1140],
        ['2026-03-31', 1200],
      ]),
    },
    fx,
  }
  const PREMIUM = -150_000 // −30 × 100.000 ÷ 100 = −US$ 30.000 × 5,0 (dollar of the start date)
  const PAYOFF = 520_000 //  (1300 − 1200) × 1.000 = US$ 100.000 × 5,2 (dollar of the maturity)

  it('vanilla put, expired: premium (dollar of the start) + payoff (dollar of the maturity)', () => {
    const s = spec(base, '2026-04-10', quiet)
    const m = money(base, s)
    expect(m.realizedBrl).toBeCloseTo(PREMIUM + PAYOFF, 6)
    expect(m.projectedBrl).toBe(0)
  })

  it('vanilla put, still open: the premium is realized, the payoff is at the scenario', () => {
    const s = spec(base, '2026-02-01', quiet)
    const m = money(base, s, 1200, 5.4)
    expect(m.realizedBrl).toBeCloseTo(PREMIUM, 6)
    expect(m.projectedBrl).toBeCloseTo(100_000 * 5.4, 6) // US$ 100.000 × 5,4
  })

  it('knock-out put: barrier (baixa 1150) reached on 10 Feb → dies, only the premium is lost', () => {
    const o = { ...base, barrier: { type: 'ko' as const, price: 1150, dir: 'baixa' as const } }
    const s = spec(o, '2026-04-10', touched)
    expect(opStatus(o, s)).toMatchObject({
      state: 'derrubada',
      barrierHit: true,
      barrierDate: '2026-02-10',
      coverQty: 0,
    })
    const m = money(o, s)
    expect(m.realizedBrl).toBeCloseTo(PREMIUM, 6)
    expect(m.projectedBrl).toBe(0)
  })

  it('knock-out put not reached: works as a vanilla put', () => {
    const o = { ...base, barrier: { type: 'ko' as const, price: 1150, dir: 'baixa' as const } }
    const s = spec(o, '2026-04-10', quiet)
    expect(opStatus(o, s)).toMatchObject({ state: 'vencida', barrierHit: false })
    expect(money(o, s).realizedBrl).toBeCloseTo(PREMIUM + PAYOFF, 6)
  })

  it('knock-in put: reached → works; not reached → never activated, only the premium', () => {
    const o = { ...base, barrier: { type: 'ki' as const, price: 1150, dir: 'baixa' as const } }
    const on = spec(o, '2026-04-10', touched)
    expect(opStatus(o, on).state).toBe('vencida')
    expect(money(o, on).realizedBrl).toBeCloseTo(PREMIUM + PAYOFF, 6)
    const off = spec(o, '2026-04-10', quiet)
    expect(opStatus(o, off)).toMatchObject({ state: 'nao-ativada', coverQty: 0 })
    expect(money(o, off).realizedBrl).toBeCloseTo(PREMIUM, 6)
    expect(money(o, off).projectedBrl).toBe(0)
  })

  it('barrier is watched only from the start date to today (or to the end)', () => {
    const o = { ...base, barrier: { type: 'ko' as const, price: 1150, dir: 'baixa' as const } }
    // touched on 10 Feb, but today is 1 Feb: not reached yet
    expect(opStatus(o, spec(o, '2026-02-01', touched)).barrierHit).toBe(false)
    // touched only after the maturity: does not count
    const late: MarketHistory = {
      cbotUsc: {
        soja: pts([
          ['2026-02-10', 1250],
          ['2026-04-05', 1100],
        ]),
      },
      fx,
    }
    expect(opStatus(o, spec(o, '2026-04-10', late)).barrierHit).toBe(false)
  })

  it('call with barrier alta; no history: barrier counts as not reached and a note says it', () => {
    const o = op({
      kind: 'call',
      side: 'comprado',
      qty: 50_000,
      strike: 1300,
      premium: 20,
      startDate: '2026-01-05',
      maturityDate: '2026-03-31',
      barrier: { type: 'ko', price: 1400, dir: 'alta' },
    })
    const st = opStatus(o, spec(o, '2026-02-01', { cbotUsc: { soja: [] }, fx: [] }))
    expect(st.barrierHit).toBe(false)
    expect(st.notes.join(' ')).toMatch(/barreira não pôde ser conferida/)
  })

  it('validation: barrier needs the start date, only grain options/accumulators, accumulator only knock-out', () => {
    const b = { type: 'ko' as const, price: 1150, dir: 'baixa' as const }
    expect(hedgeOpProblem({ ...base, startDate: undefined, barrier: b })).toMatch(/data da operação/)
    expect(hedgeOpProblem({ ...base, barrier: b })).toBeNull()
    expect(hedgeOpProblem({ ...base, asset: 'dolar', barrier: b })).toMatch(/Barreira só vale/)
    expect(hedgeOpProblem({ ...base, kind: 'futuro', barrier: b })).toMatch(/Barreira só vale/)
    expect(hedgeOpProblem({ ...base, barrier: { ...b, price: 0 } })).toMatch(/preço e o tipo da barreira/)
    expect(hedgeOpProblem({ ...base, maturityDate: '2025-01-01' })).toMatch(/depois da data da operação/)
    expect(hedgeOpProblem({ ...base, closedDate: '2025-01-01' })).toMatch(/encerramento/)
    expect(hedgeOpProblem({ ...base, maturityDate: '2026-02-30' })).toMatch(/Data inválida/)
  })
})

describe('accumulator (sold): fixings done are realized, the rest follows the scenario', () => {
  // Mondays 2, 9, 16, 23, 30 March 2026; 5.000 bu per fixing at 1300
  const acc = op({
    kind: 'accumulator',
    floorLevel: 1000,
    side: 'vendido',
    qty: 5000,
    strike: 1300,
    startDate: '2026-03-02',
    maturityDate: '2026-03-30',
    accum: { frequency: 'semanal' },
  })
  const hist: MarketHistory = {
    cbotUsc: {
      soja: pts([
        ['2026-03-02', 1250],
        ['2026-03-09', 1280],
        ['2026-03-16', 1320],
        ['2026-03-17', 1240],
      ]),
    },
    fx: pts([
      ['2026-03-02', 5.0],
      ['2026-03-09', 5.0],
      ['2026-03-16', 5.0],
      ['2026-03-17', 5.0],
    ]),
  }

  it('three of five fixings done: realized = Σ (strike − settle) × bu × dollar of the day; two left at the scenario', () => {
    const s = spec(acc, '2026-03-18', hist)
    const st = opStatus(acc, s)
    expect(st).toMatchObject({ state: 'aberta', fixingsTotal: 5, fixingsDone: 3, fixingsLeft: 2, coverQty: 10_000 })
    const m = money(acc, s, 1240, 5.4)
    // (50 + 20 − 20)¢ × 5.000 bu ÷ 100 = US$ 2.500 × 5,0 = 12.500
    expect(m.realizedBrl).toBeCloseTo(12_500, 6)
    // 2 × 5.000 bu × 60¢ ÷ 100 = US$ 6.000 × 5,4
    expect(m.projectedBrl).toBeCloseTo(32_400, 6)
    expect(hedgeBrlAt(s, 1240, 5.4)).toBeCloseTo(44_900, 6)
    expect(hedgeRealizedBrl(s, 1240, 5.4)).toBeCloseTo(12_500, 6)
  })

  it('a fixing above the strike is just the sale at the strike: payoff is (strike − settle), nothing else', () => {
    // 16 Mar settled at 1320: the fixing result is −20¢ × 5.000 ÷ 100 × 5,0 = −R$ 5.000, inside the 12.500 above
    const s = spec(acc, '2026-03-16', hist)
    expect(opStatus(acc, s).fixingsDone).toBe(3) // 16 Mar has its settle: it is done
  })

  it('the fixing of today only counts when today has its settle', () => {
    const noToday: MarketHistory = {
      ...hist,
      cbotUsc: {
        soja: pts([
          ['2026-03-02', 1250],
          ['2026-03-09', 1280],
        ]),
      },
    }
    expect(opStatus(acc, spec(acc, '2026-03-16', noToday)).fixingsDone).toBe(2)
  })

  it('typed number of fixings done overrides the count from the dates', () => {
    const o = { ...acc, accum: { frequency: 'semanal' as const, fixingsDone: 1 } }
    const s = spec(o, '2026-03-18', hist)
    expect(opStatus(o, s)).toMatchObject({ fixingsDone: 1, fixingsLeft: 4, coverQty: 20_000 })
    expect(money(o, s, 1240, 5.4).realizedBrl).toBeCloseTo(12_500, 6) // 2 Mar: 50¢ × 5.000 ÷ 100 × 5,0
    // 4 × 5.000 bu × 60¢ ÷ 100 = US$ 12.000 × 5,4
    expect(money(o, s, 1240, 5.4).projectedBrl).toBeCloseTo(64_800, 6)
  })

  it('knock-out: the fixings from the knock-out day on are cancelled (that day does not count) and it stops protecting', () => {
    const o = { ...acc, barrier: { type: 'ko' as const, price: 1245, dir: 'baixa' as const } }
    // 17 Mar 1240 <= 1245 → barrier reached on 17 Mar; fixings before it: 2, 9, 16 Mar
    const s = spec(o, '2026-03-20', hist)
    expect(opStatus(o, s)).toMatchObject({
      state: 'derrubada',
      barrierDate: '2026-03-17',
      fixingsTotal: 3,
      fixingsDone: 3,
      fixingsLeft: 0,
      coverQty: 0,
    })
    const m = money(o, s, 1000, 6)
    expect(m.realizedBrl).toBeCloseTo(12_500, 6)
    expect(m.projectedBrl).toBe(0)
  })

  it('knock-out reached ON a fixing date: that fixing does not count', () => {
    const o = { ...acc, barrier: { type: 'ko' as const, price: 1320, dir: 'alta' as const } }
    // 16 Mar settle 1320 >= 1320 → knock-out on the 16th; fixings of 2 and 9 Mar only
    const s = spec(o, '2026-03-18', hist)
    expect(opStatus(o, s)).toMatchObject({
      state: 'derrubada',
      barrierDate: '2026-03-16',
      fixingsTotal: 2,
      fixingsDone: 2,
    })
    // (50 + 20)¢ × 5.000 ÷ 100 = US$ 3.500 × 5,0
    expect(money(o, s).realizedBrl).toBeCloseTo(17_500, 6)
  })

  it('all fixings done: expired, realized, no longer protects; fixed dollar wins', () => {
    const h2: MarketHistory = {
      cbotUsc: {
        soja: pts([
          ['2026-03-02', 1250],
          ['2026-03-09', 1280],
          ['2026-03-16', 1320],
          ['2026-03-23', 1300],
          ['2026-03-30', 1290],
        ]),
      },
      fx: hist.fx,
    }
    const o = { ...acc, fxFixed: 5.5 }
    const s = spec(o, '2026-04-10', h2)
    expect(opStatus(o, s)).toMatchObject({ state: 'vencida', fixingsLeft: 0, coverQty: 0, settled: true })
    // (50 + 20 − 20 + 0 + 10)¢ = 60¢ × 5.000 ÷ 100 = US$ 3.000 × 5,5
    expect(money(o, s).realizedBrl).toBeCloseTo(16_500, 6)
    expect(money(o, s).projectedBrl).toBe(0)
  })

  it('done fixings without history are valued at the scenario and noted', () => {
    const s = spec(acc, '2026-03-18', { cbotUsc: { soja: [] }, fx: [] })
    const st = opStatus(acc, s)
    expect(st.notes.join(' ')).toMatch(/3 fixing\(s\)/)
    // 3 done (no price) + 2 left, all at the scenario: 5 × 5.000 × 60¢ ÷ 100 = US$ 15.000 × 5,4
    const m = money(acc, s, 1240, 5.4)
    expect(m.realizedBrl).toBe(0)
    expect(m.projectedBrl).toBeCloseTo(81_000, 6)
  })

  it('validation: sold only, soybeans/corn only, dates and frequency required, knock-out only', () => {
    expect(hedgeOpProblem(acc)).toBeNull()
    expect(hedgeOpProblem({ ...acc, side: 'comprado' })).toMatch(/sempre vendido/)
    expect(hedgeOpProblem({ ...acc, asset: 'dolar' })).toMatch(/soja ou milho/)
    expect(hedgeOpProblem({ ...acc, maturityDate: undefined })).toMatch(/data da operação e o vencimento/)
    expect(hedgeOpProblem({ ...acc, accum: undefined })).toMatch(/frequência/)
    expect(hedgeOpProblem({ ...acc, barrier: { type: 'ki', price: 1100, dir: 'baixa' } })).toMatch(
      /só tem barreira de knock-out/,
    )
  })
})

describe('coverOps: what the exposure sees', () => {
  it('drops expired, closed, knocked-out and not-active operations; accumulator becomes a future for the fixings left', () => {
    const hist: MarketHistory = {
      cbotUsc: {
        soja: pts([
          ['2026-02-10', 1140],
          ['2026-03-02', 1250],
          ['2026-03-09', 1280],
          ['2026-03-16', 1320],
        ]),
      },
      fx: pts([['2026-03-02', 5.0]]),
    }
    const put = { kind: 'put' as const, side: 'comprado' as const, qty: 50_000, strike: 1300, premium: 10 }
    const open = op({ id: 'a', kind: 'futuro', qty: 50_000, strike: 1300, maturityDate: '2026-12-31' })
    const expired = op({ id: 'b', kind: 'futuro', qty: 50_000, strike: 1300, maturityDate: '2026-03-01' })
    const closed = op({ id: 'c', kind: 'futuro', qty: 50_000, strike: 1300, closedDate: '2026-03-02' })
    const knocked = op({
      id: 'd',
      ...put,
      startDate: '2026-01-05',
      maturityDate: '2026-12-31',
      barrier: { type: 'ko', price: 1150, dir: 'baixa' },
    })
    const idle = op({
      id: 'e',
      ...put,
      startDate: '2026-03-01',
      maturityDate: '2026-12-31',
      barrier: { type: 'ki', price: 1100, dir: 'baixa' },
    })
    const alive = op({
      id: 'f',
      ...put,
      startDate: '2026-03-01',
      maturityDate: '2026-12-31',
      barrier: { type: 'ko', price: 1100, dir: 'baixa' },
    })
    const acc = op({
      id: 'g',
      kind: 'accumulator',
      floorLevel: 1000,
      qty: 5000,
      strike: 1300,
      startDate: '2026-03-02',
      maturityDate: '2026-03-30',
      accum: { frequency: 'semanal' },
    })
    const ops = [open, expired, closed, knocked, idle, alive, acc]
    const s = spec(ops, '2026-03-18', hist)
    const out = coverOps(ops, s)
    expect(out.map((o) => o.id)).toEqual(['a', 'f', 'g'])
    expect(out.find((o) => o.id === 'f')).toMatchObject({ kind: 'put' })
    expect(out.find((o) => o.id === 'f')).not.toHaveProperty('barrier')
    expect(out.find((o) => o.id === 'g')).toMatchObject({ kind: 'futuro', side: 'vendido', qty: 10_000, premium: 0 })
  })

  it('without a spec it is the list of valid operations', () => {
    const ok = op({ id: 'a', qty: 5000, strike: 1300 })
    expect(coverOps([ok, op({ id: 'bad' })], undefined).map((o) => o.id)).toEqual(['a'])
  })
})

describe('closing before the maturity: price or premium of the closing trade', () => {
  const hist: MarketHistory = {
    cbotUsc: {
      soja: pts([
        ['2026-01-05', 1320],
        ['2026-02-10', 1140],
        ['2026-03-31', 1200],
      ]),
    },
    fx: pts([
      ['2026-01-05', 5.0],
      ['2026-02-10', 5.1],
      ['2026-03-31', 5.2],
    ]),
  }
  const fut = op({
    kind: 'futuro',
    side: 'vendido',
    qty: 100_000,
    strike: 1300,
    maturityDate: '2026-03-31',
    closedDate: '2026-02-10',
  })
  const put = op({
    kind: 'put',
    side: 'comprado',
    qty: 100_000,
    strike: 1300,
    premium: 30,
    startDate: '2026-01-05',
    maturityDate: '2026-03-31',
    closedDate: '2026-02-10',
  })

  it('future: the typed closing price wins over the history', () => {
    const o = { ...fut, closePrice: 1270 }
    const s = spec(o, '2026-03-01', hist)
    // (1300 - 1270) = 30 cents x 100.000 bu / 100 = US$ 30.000 x 5,1 (dollar of the closing day)
    expect(money(o, s).realizedBrl).toBeCloseTo(153_000, 6)
    expect(money(o, s).projectedBrl).toBe(0)
    expect(opStatus(o, s)).toMatchObject({ state: 'encerrada', coverQty: 0, settled: true })
  })

  it('future closed at a loss (closing price above the sale price) is a loss', () => {
    const o = { ...fut, closePrice: 1350 }
    // (1300 - 1350) = -50 cents x 1.000 = -US$ 50.000 x 5,1
    expect(money(o, spec(o, '2026-03-01', hist)).realizedBrl).toBeCloseTo(-255_000, 6)
  })

  it('future closed without a price: the settle of the closing day from the history', () => {
    // (1300 - 1140) = 160 cents x 1.000 = US$ 160.000 x 5,1
    expect(money(fut, spec(fut, '2026-03-01', hist)).realizedBrl).toBeCloseTo(816_000, 6)
  })

  it('long put sold before the expiry: premium paid, premium received at the sale, no exercise', () => {
    const o = { ...put, closePrice: 55 }
    const s = spec(o, '2026-03-01', hist)
    // paid -30 x 1.000 = -US$ 30.000 x 5,0 = -150.000; sold +55 x 1.000 = US$ 55.000 x 5,1 = 280.500
    const m = money(o, s)
    expect(m.realizedBrl).toBeCloseTo(130_500, 6)
    expect(m.projectedBrl).toBe(0)
    expect(opStatus(o, s)).toMatchObject({ state: 'encerrada', coverQty: 0, settled: true })
  })

  it('short call bought back before the expiry: premium received, premium paid at the buy back', () => {
    const call = op({
      kind: 'call',
      side: 'vendido',
      qty: 100_000,
      strike: 1300,
      premium: 20,
      startDate: '2026-01-05',
      maturityDate: '2026-03-31',
      closedDate: '2026-02-10',
      closePrice: 35,
    })
    // received +20 x 1.000 = US$ 20.000 x 5,0 = 100.000; paid -35 x 1.000 = -US$ 35.000 x 5,1 = -178.500
    expect(money(call, spec(call, '2026-03-01', hist)).realizedBrl).toBeCloseTo(-78_500, 6)
  })

  it('dollar option closed early: premiums in R$ per US$, no dollar conversion', () => {
    const d = op({
      asset: 'dolar',
      kind: 'put',
      side: 'comprado',
      qty: 1_000_000,
      strike: 5.5,
      premium: 0.1,
      maturityDate: '2026-12-31',
      closedDate: '2026-02-10',
      closePrice: 0.25,
    })
    // paid -0,10 x 1.000.000 = -100.000; sold +0,25 x 1.000.000 = +250.000
    expect(money(d, spec(d, '2026-03-01', hist)).realizedBrl).toBeCloseTo(150_000, 6)
  })

  it('option closed without the closing premium: intrinsic value of the day and a note asking for the premium', () => {
    const s = spec(put, '2026-03-01', hist)
    // premium -150.000; intrinsic (1300 - 1140) = 160 x 1.000 = US$ 160.000 x 5,1 = 816.000
    expect(money(put, s).realizedBrl).toBeCloseTo(666_000, 6)
    expect(opStatus(put, s).notes.join(' ')).toMatch(/Informe o prêmio de encerramento/)
  })

  it('a closing date on or after the maturity is ignored (the maturity rules) and says so', () => {
    const o = { ...fut, closedDate: '2026-04-01', closePrice: 1000 }
    const s = spec(o, '2026-04-10', hist)
    // expired at the settle of the maturity (1200, dollar 5,2), not the typed closing price
    expect(money(o, s).realizedBrl).toBeCloseTo(520_000, 6)
    expect(opStatus(o, s).state).toBe('vencida')
    expect(opStatus(o, s).notes.join(' ')).toMatch(/não é antes do vencimento/)
  })

  it('brokerage and fees (R$) are always paid once', () => {
    const o = { ...fut, closedDate: undefined, costBrl: 1_200 }
    const s = spec(o, '2026-03-01', hist)
    const m = money(o, s, 1250, 5.4)
    expect(m.realizedBrl).toBe(-1_200)
    expect(m.projectedBrl).toBeCloseTo(270_000, 6)
    // also for an option that dies
    const dead = {
      ...put,
      closedDate: undefined,
      costBrl: 500,
      barrier: { type: 'ko' as const, price: 1150, dir: 'baixa' as const },
    }
    expect(money(dead, spec(dead, '2026-04-10', hist)).realizedBrl).toBeCloseTo(-150_000 - 500, 6)
  })
})

describe('accumulator: closed early, guaranteed fixings, overrides', () => {
  const acc = op({
    kind: 'accumulator',
    floorLevel: 1000,
    side: 'vendido',
    qty: 5000,
    strike: 1300,
    startDate: '2026-03-02',
    maturityDate: '2026-03-30',
    accum: { frequency: 'semanal' },
  })
  const hist: MarketHistory = {
    cbotUsc: {
      soja: pts([
        ['2026-03-02', 1250],
        ['2026-03-09', 1280],
        ['2026-03-16', 1320],
        ['2026-03-17', 1240],
      ]),
    },
    fx: pts([
      ['2026-03-02', 5.0],
      ['2026-03-09', 5.0],
      ['2026-03-16', 5.0],
      ['2026-03-17', 5.0],
    ]),
  }

  it('closed early: the fixings up to the closing are realized, the later ones are cancelled, the unwinding value counts', () => {
    const o = { ...acc, closedDate: '2026-03-18', closeValueUsd: -2_000 }
    const s = spec(o, '2026-03-20', hist)
    expect(opStatus(o, s)).toMatchObject({
      state: 'encerrada',
      fixingsTotal: 3,
      fixingsDone: 3,
      fixingsLeft: 0,
      coverQty: 0,
    })
    const m = money(o, s, 1000, 9)
    // 12.500 from the three fixings and -US$ 2.000 x 5,0 (dollar of the closing day) = 2.500
    expect(m.realizedBrl).toBeCloseTo(2_500, 6)
    expect(m.projectedBrl).toBe(0)
  })

  it('guaranteed fixings count even after the knock-out', () => {
    const o = {
      ...acc,
      barrier: { type: 'ko' as const, price: 1245, dir: 'baixa' as const },
      accum: { frequency: 'semanal' as const, guaranteed: 4 },
    }
    const s = spec(o, '2026-03-18', hist)
    // knock-out on 17 Mar; fixings 2, 9, 16 Mar done; the 4th (23 Mar) is guaranteed and still to come
    const st = opStatus(o, s)
    expect(st).toMatchObject({
      barrierDate: '2026-03-17',
      fixingsTotal: 4,
      fixingsDone: 3,
      fixingsLeft: 1,
      coverQty: 5000,
    })
    expect(st.state).toBe('aberta')
    expect(st.notes.join(' ')).toMatch(/garantidos/)
  })

  it('after a knock-out the typed number of fixings done is ignored (it cannot drop fixings)', () => {
    const o = {
      ...acc,
      barrier: { type: 'ko' as const, price: 1245, dir: 'baixa' as const },
      accum: { frequency: 'semanal' as const, fixingsDone: 1 },
    }
    const st = opStatus(o, spec(o, '2026-03-20', hist))
    expect(st).toMatchObject({ state: 'derrubada', fixingsTotal: 3, fixingsDone: 3, fixingsLeft: 0 })
  })

  it('the barrier date typed by the producer wins over the history (and works without history)', () => {
    const o = op({
      kind: 'put',
      side: 'comprado',
      qty: 100_000,
      strike: 1300,
      premium: 30,
      startDate: '2026-01-05',
      maturityDate: '2026-12-31',
      barrier: { type: 'ko', price: 1150, dir: 'baixa' },
      barrierHitDate: '2026-02-01',
    })
    const none: MarketHistory = { cbotUsc: { soja: [] }, fx: [] }
    const st = opStatus(o, spec(o, '2026-03-01', none))
    expect(st).toMatchObject({ state: 'derrubada', barrierHit: true, barrierDate: '2026-02-01', coverQty: 0 })
    expect(st.notes).toEqual([])
    // a date in the future is not a hit yet
    const later = { ...o, barrierHitDate: '2026-06-01' }
    expect(opStatus(later, spec(later, '2026-03-01', none)).barrierHit).toBe(false)
  })
})

describe('edge cases from the independent review', () => {
  it('on the maturity day itself only that day settle counts (an older one is not used as realized)', () => {
    const fut = op({ kind: 'futuro', side: 'vendido', qty: 100_000, strike: 1300, maturityDate: '2026-03-31' })
    const lag: MarketHistory = {
      cbotUsc: { soja: pts([['2026-03-30', 1200]]) },
      fx: pts([['2026-03-30', 5.0]]),
    }
    const s = spec(fut, '2026-03-31', lag)
    expect(opStatus(fut, s).settled).toBe(false)
    expect(opStatus(fut, s).notes.join(' ')).toMatch(/Sem histórico/)
    // the next day, with the settle of the 31st, it is realized
    const full: MarketHistory = {
      ...lag,
      cbotUsc: {
        soja: pts([
          ['2026-03-30', 1200],
          ['2026-03-31', 1210],
        ]),
      },
    }
    expect(opStatus(fut, spec(fut, '2026-04-01', full)).settled).toBe(true)
  })

  it('a knock-in without a date of today stays open (no today means everything is open)', () => {
    const ki = op({
      kind: 'put',
      side: 'comprado',
      qty: 100_000,
      strike: 1300,
      premium: 30,
      startDate: '2026-01-05',
      maturityDate: '2026-03-31',
      barrier: { type: 'ki', price: 1150, dir: 'baixa' },
    })
    const s = activeHedge([ki], 5.5)!
    expect(opStatus(ki, s)).toMatchObject({ state: 'aberta', coverQty: 100_000 })
  })

  it('a bad zero settle in the history does not knock anything out', () => {
    const o = op({
      kind: 'put',
      side: 'comprado',
      qty: 100_000,
      strike: 1300,
      premium: 30,
      startDate: '2026-01-05',
      maturityDate: '2026-12-31',
      barrier: { type: 'ko', price: 1150, dir: 'baixa' },
    })
    const bad: MarketHistory = {
      cbotUsc: {
        soja: pts([
          ['2026-02-01', 0],
          ['2026-02-02', 1250],
        ]),
      },
      fx: [],
    }
    expect(opStatus(o, spec(o, '2026-03-01', bad)).barrierHit).toBe(false)
  })
})

describe('accumulator: premium and floor level', () => {
  const acc = op({
    kind: 'accumulator',
    floorLevel: 1000,
    side: 'vendido',
    qty: 5000,
    strike: 1300,
    startDate: '2026-03-02',
    maturityDate: '2026-03-30',
    accum: { frequency: 'semanal' },
  })
  const hist: MarketHistory = {
    cbotUsc: { soja: pts([['2026-03-02', 1250]]) },
    fx: pts([
      ['2026-03-02', 5.0],
      ['2026-03-17', 5.0],
    ]),
  }

  it('the premium is per bushel over ALL the fixings of the contract, paid up front (dollar of the start date)', () => {
    // 5 fixings x 5.000 bu = 25.000 bu x 20 cents / 100 = US$ 5.000 x 5,0 = R$ 25.000 paid
    const o = { ...acc, premium: 20 }
    const s = spec(o, '2026-03-02', hist) // today = the first fixing day (settle 1250 exists): 1 fixing done
    const m = money(o, s, 1300, 5.0)
    // fixing 1: (1300 - 1250) = 50 cents x 5.000 / 100 = US$ 2.500 x 5,0 = 12.500; premium -25.000
    expect(m.realizedBrl).toBeCloseTo(12_500 - 25_000, 6)
  })

  it('a received premium is a gain; no premium changes nothing', () => {
    const got = { ...acc, premium: 20, premiumDir: 'recebido' as const }
    expect(money(got, spec(got, '2026-03-01', hist), 1300, 5.0).realizedBrl).toBeCloseTo(25_000, 6)
    expect(money(acc, spec(acc, '2026-03-01', hist), 1300, 5.0).realizedBrl).toBe(0)
  })

  it('the premium counts the planned fixings even after a knock-out', () => {
    const ko = {
      ...acc,
      premium: 20,
      barrier: { type: 'ko' as const, price: 1260, dir: 'baixa' as const },
    }
    // knock-out on the first fixing day (1250 <= 1260): no fixing counts, the premium of the 5 planned stays
    const s = spec(ko, '2026-03-10', hist)
    expect(opStatus(ko, s)).toMatchObject({ state: 'derrubada', fixingsTotal: 0 })
    expect(money(ko, s).realizedBrl).toBeCloseTo(-25_000, 6)
  })

  it('floor/ceiling (producer): above the floor each fixing sells at the enhancement level, at or below it at the floor', () => {
    // Enhancement level 1300, floor level 1200, 5.000 bu per fixing
    const fc = { ...acc, floorLevel: 1200 }
    const h: MarketHistory = {
      cbotUsc: {
        soja: pts([
          ['2026-03-02', 1250], // above the floor: sells at 1300 -> +50 cents
          ['2026-03-09', 1100], // below the floor: sells at 1200 -> +100 cents (a plain accumulator would give +200)
          ['2026-03-16', 1200], // exactly at the floor: sells at 1200 -> 0 (plain: +100)
        ]),
      },
      fx: pts([
        ['2026-03-02', 5.0],
        ['2026-03-09', 5.0],
        ['2026-03-16', 5.0],
      ]),
    }
    const s2 = spec(fc, '2026-03-18', h)
    // (50 + 100 + 0) cents x 5.000 bu / 100 = US$ 7.500 x 5,0 = R$ 37.500
    expect(money(fc, s2, 1240, 5.4).realizedBrl).toBeCloseTo(37_500, 6)
    const plain = { ...fc, floorLevel: undefined, barrier: { type: 'ko' as const, price: 900, dir: 'baixa' as const } }
    // the same fixings without a floor (knock-out variant, barrier never touched): 50 + 200 + 100 = 350 cents -> R$ 87.500
    expect(money(plain, spec(plain, '2026-03-18', h), 1240, 5.4).realizedBrl).toBeCloseTo(87_500, 6)
  })

  it('floor/ceiling: the fixings still to come use the same rule at the scenario price', () => {
    const fc = { ...acc, floorLevel: 1200 }
    const s2 = spec(fc, '2026-03-01', hist) // nothing done yet: 5 fixings to come
    // scenario 1250 (> floor): 5 x 5.000 bu x 50 cents / 100 = US$ 12.500 x 5,0 = R$ 62.500
    expect(money(fc, s2, 1250, 5.0).projectedBrl).toBeCloseTo(62_500, 6)
    // scenario 1100 (< floor): sells at 1200: 100 cents -> US$ 25.000 x 5,0 = R$ 125.000
    expect(money(fc, s2, 1100, 5.0).projectedBrl).toBeCloseTo(125_000, 6)
    // scenario 1400 (> enhancement level): sells at 1300 anyway: -100 cents -> -R$ 125.000 (no leverage)
    expect(money(fc, s2, 1400, 5.0).projectedBrl).toBeCloseTo(-125_000, 6)
  })

  it('floor/ceiling is defined by its floor: required, and below the enhancement level; the knock-out version does not need it', () => {
    const noFloor = { ...acc, floorLevel: undefined }
    expect(hedgeOpProblem(noFloor)).toMatch(/nível piso/)
    expect(hedgeOpProblem({ ...acc, floorLevel: 1300 })).toMatch(/abaixo do nível de melhoria/)
    expect(hedgeOpProblem({ ...acc, floorLevel: 1400 })).toMatch(/abaixo do nível de melhoria/)
    expect(hedgeOpProblem({ ...acc, floorLevel: 1200 })).toBeNull()
    const ko = { ...noFloor, barrier: { type: 'ko' as const, price: 1100, dir: 'baixa' as const } }
    expect(hedgeOpProblem(ko)).toBeNull()
  })
})

describe('audit fixes: premium of an accumulator closed early, scenario beyond the barrier', () => {
  it('E2: an accumulator closed early still pays the premium of the WHOLE contract (13 fixings), not only of the 3 done', () => {
    const acc = op({
      kind: 'accumulator',
      side: 'vendido',
      qty: 5000,
      strike: 1300,
      floorLevel: 1100,
      premium: 10,
      startDate: '2026-10-05',
      maturityDate: '2026-12-28',
      closedDate: '2026-10-19',
      closeValueUsd: -2000,
      accum: { frequency: 'semanal' },
    })
    const h: MarketHistory = {
      cbotUsc: {
        soja: pts([
          ['2026-10-05', 1200],
          ['2026-10-12', 1150],
          ['2026-10-19', 1100],
        ]),
      },
      fx: pts([
        ['2026-10-05', 5.0],
        ['2026-10-12', 5.1],
        ['2026-10-19', 5.2],
      ]),
    }
    const s = spec(acc, '2026-10-20', h)
    expect(opStatus(acc, s)).toMatchObject({ state: 'encerrada', fixingsTotal: 3, fixingsDone: 3, fixingsLeft: 0 })
    const m = money(acc, s, 1000, 9)
    // fixings: 1200 > floor 1100 -> 1300-1200 = 100c x 50 x 5,0 = 25.000; 1150 -> 150c x 50 x 5,1 = 38.250; 1100 = floor -> 0
    // premium: -10c x 5.000 bu x 13 fixings / 100 = US$ 6.500 x 5,0 = -32.500 ; closing: -2.000 x 5,2 = -10.400
    expect(m.realizedBrl).toBeCloseTo(63_250 - 32_500 - 10_400, 6)
    expect(m.realizedBrl).toBeCloseTo(20_350, 6)
    expect(m.projectedBrl).toBe(0)
  })

  const ko = (over: Partial<HedgeOp> = {}) =>
    op({
      kind: 'accumulator',
      side: 'vendido',
      qty: 5000,
      strike: 1300,
      startDate: '2026-03-02',
      maturityDate: '2026-03-30',
      accum: { frequency: 'semanal' },
      barrier: { type: 'ko', price: 1100, dir: 'baixa' },
      ...over,
    })
  const none: MarketHistory = { cbotUsc: { soja: [] }, fx: [] }

  it('R1: knock-out accumulator: a scenario at or below the barrier kills the fixings still to come', () => {
    const o = ko()
    const s = spec(o, '2026-03-01', none) // 5 fixings still to come
    // scenario 1200 (above the barrier): 5 x 100c x 5.000 / 100 x 5,0 = R$ 125.000
    expect(money(o, s, 1200, 5.0).projectedBrl).toBeCloseTo(125_000, 6)
    // scenario 1050 and exactly 1100 (touching counts): the structure is dead, nothing more is accumulated
    expect(money(o, s, 1050, 5.0).projectedBrl).toBe(0)
    expect(money(o, s, 1100, 5.0).projectedBrl).toBe(0)
    // 1101 is still alive
    expect(money(o, s, 1101, 5.0).projectedBrl).toBeGreaterThan(0)
  })

  it('R1: the fixings that already happened are never killed by the scenario', () => {
    const o = ko()
    const h: MarketHistory = {
      cbotUsc: { soja: pts([['2026-03-02', 1250]]) },
      fx: pts([['2026-03-02', 5.0]]),
    }
    const s = spec(o, '2026-03-03', h) // the first fixing is done at 1250
    // realized: 50c x 5.000 / 100 x 5,0 = 12.500, whatever the scenario
    expect(money(o, s, 900, 5.0).realizedBrl).toBeCloseTo(12_500, 6)
    expect(money(o, s, 900, 5.0).projectedBrl).toBe(0)
    expect(money(o, s, 1200, 5.0).projectedBrl).toBeCloseTo(4 * 100 * 50 * 5, 6)
  })

  const put = (barrier: HedgeOp['barrier']) =>
    op({
      kind: 'put',
      side: 'comprado',
      qty: 100_000,
      strike: 1300,
      premium: 30,
      startDate: '2026-01-05',
      maturityDate: '2026-12-31',
      barrier,
    })

  it('R1: a knock-out put in a scenario beyond the barrier pays nothing (only the premium stays); a knock-in comes alive', () => {
    const koPut = put({ type: 'ko', price: 1150, dir: 'baixa' })
    const s1 = spec(koPut, '2026-03-01', none)
    // scenario 1200 (above 1150): intrinsic 100c x 100.000 / 100 = US$ 100.000 x 5,0 = 500.000
    expect(money(koPut, s1, 1200, 5.0).projectedBrl).toBeCloseTo(500_000, 6)
    // scenario 1100 (below 1150): the barrier was touched on the way: dead
    expect(money(koPut, s1, 1100, 5.0).projectedBrl).toBe(0)
    // premium: -30c x 100.000 bu / 100 = -US$ 30.000 at the market dollar 5,5 (no history for the start date)
    expect(money(koPut, s1, 1100, 5.0).realizedBrl).toBeCloseTo(-165_000, 6)
    const kiPut = put({ type: 'ki', price: 1150, dir: 'baixa' })
    const s2 = spec(kiPut, '2026-03-01', none)
    // not touched in the scenario: not active, nothing; touched: it works as a plain put (200c -> US$ 200.000 x 5,0)
    expect(money(kiPut, s2, 1200, 5.0).projectedBrl).toBe(0)
    expect(money(kiPut, s2, 1100, 5.0).projectedBrl).toBeCloseTo(1_000_000, 6)
  })

  it('R1: a knock-in option that already expired never comes alive in a scenario', () => {
    const kiPut = { ...put({ type: 'ki', price: 1150, dir: 'baixa' }), maturityDate: '2026-02-27' }
    const s = spec(kiPut, '2026-03-05', none)
    expect(money(kiPut, s, 1000, 5.0).projectedBrl).toBe(0)
  })

  it('R1: an alta barrier works the other way round (up-and-out)', () => {
    const upOut = put({ type: 'ko', price: 1400, dir: 'alta' })
    const s = spec({ ...upOut, kind: 'call', strike: 1300 }, '2026-03-01', none)
    const call = { ...upOut, kind: 'call' as const, strike: 1300 }
    expect(money(call, s, 1350, 5.0).projectedBrl).toBeCloseTo(50 * 1000 * 5, 6) // 50c x 100.000 / 100 x 5,0
    expect(money(call, s, 1400, 5.0).projectedBrl).toBe(0)
    expect(money(call, s, 1500, 5.0).projectedBrl).toBe(0)
  })
})
