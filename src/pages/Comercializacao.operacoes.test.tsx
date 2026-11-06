import { screen, within } from '@testing-library/react'
import type { MarketHistory } from '../engine/history'
import type { Action } from '../state/types'
import { renderWithStore } from '../test/storeHarness'
import { MiniDre } from '../ui/MiniDre'
import { Comercializacao } from './Comercializacao'

vi.setConfig({ testTimeout: 30000 })

beforeEach(() => localStorage.clear())

/** "R$ 1.234,56" / "−R$ ..." / "R$ −1,2" to a number. */
function num(text: string | null): number {
  const t = (text ?? '')
    .replace(/[^\d,−-]/g, '')
    .replace(',', '.')
    .replace('−', '-')
  return Number(t)
}

// 1.000 ha × 60 sc/ha = 60.000 sc
const FARM: Action[] = [
  { type: 'setInput', key: 'areaHa', value: 1000 },
  { type: 'setInput', key: 'yieldScHa', value: 60 },
]

const HIST: MarketHistory = {
  cbotUsc: {
    soja: [
      { date: '2026-01-05', settle: 1320 },
      { date: '2026-02-10', settle: 1140 },
      { date: '2026-03-02', settle: 1250 },
      { date: '2026-03-09', settle: 1280 },
      { date: '2026-03-16', settle: 1320 },
      { date: '2026-03-31', settle: 1200 },
    ],
  },
  fx: [
    { date: '2026-01-05', settle: 5 },
    { date: '2026-03-02', settle: 5 },
    { date: '2026-03-09', settle: 5 },
    { date: '2026-03-16', settle: 5 },
    { date: '2026-03-31', settle: 5.2 },
  ],
}

const EXPIRED_FUTURE: Action = {
  type: 'addHedgeOp',
  partial: { kind: 'futuro', side: 'vendido', qty: 100_000, strike: 1300, maturityDate: '2026-03-31' },
}
const ACCUMULATOR: Action = {
  type: 'addHedgeOp',
  partial: {
    kind: 'accumulator',
    floorLevel: 1000,
    qty: 5000,
    strike: 1300,
    startDate: '2026-03-02',
    maturityDate: '2026-03-30',
    accum: { frequency: 'semanal' },
  },
}

describe('margem: o resultado realizado das operações entra na conta', () => {
  it('future expired: the DRE carries the realized result (settle and dollar of the maturity day), whatever the scenario', async () => {
    await renderWithStore(<MiniDre />, [...FARM, EXPIRED_FUTURE], { history: HIST, today: '2026-04-10' })
    const dre = screen.getByTestId('mini-dre')
    expect(within(dre).getByText(/Lucro\/prejuízo das operações financeiras/)).toBeInTheDocument()
    // (1300 − 1200)¢ × 100.000 bu ÷ 100 = US$ 100.000 × 5,2 = R$ 520.000 ÷ 60.000 sc
    const perSc = num(within(dre).getAllByTestId('dre-hedge-op')[0].textContent)
    expect(perSc).toBeCloseTo(520_000 / 60_000, 1)
  })

  it('the same future before its maturity is not realized: it follows the scenario (different number)', async () => {
    await renderWithStore(<MiniDre />, [...FARM, EXPIRED_FUTURE], { history: HIST, today: '2026-03-01' })
    const perSc = num(within(screen.getByTestId('mini-dre')).getAllByTestId('dre-hedge-op')[0].textContent)
    // today's CBOT (seed) is far from 1200: the result is not the realized 8,67/sc
    expect(Math.abs(perSc - 520_000 / 60_000)).toBeGreaterThan(0.5)
  })

  it('knock-out put that fell: only the premium is left, as the cost of the operation (R$ 150.000 ÷ 60.000 sc)', async () => {
    await renderWithStore(
      <MiniDre />,
      [
        ...FARM,
        {
          type: 'addHedgeOp',
          partial: {
            kind: 'put',
            side: 'comprado',
            qty: 100_000,
            strike: 1300,
            premium: 30,
            startDate: '2026-01-05',
            maturityDate: '2026-03-31',
            barrier: { type: 'ko', price: 1150, dir: 'baixa' },
          },
        },
      ],
      { history: HIST, today: '2026-04-10' },
    )
    // the option died: there is no profit line (zero), only the premium, as a cost of R$ 150.000 / 60.000 sc per sack
    const dre = screen.getByTestId('mini-dre')
    expect(within(dre).queryByText(/Lucro\/prejuízo das operações financeiras/)).toBeNull()
    const cost = num(within(dre).getByTestId('dre-hedge-cost').textContent)
    expect(cost).toBeCloseTo(150_000 / 60_000, 1)
  })

  it('accumulator: fixings done (realized at the day) plus the ones left at the scenario', async () => {
    await renderWithStore(<MiniDre />, [...FARM, ACCUMULATOR], { history: HIST, today: '2026-03-18' })
    const perSc = num(within(screen.getByTestId('mini-dre')).getAllByTestId('dre-hedge-op')[0].textContent)
    // realized R$ 12.500 + 2 fixings × 5.000 bu at the scenario (seed CBOT / dollar); the sign and size come from both parts
    expect(Number.isFinite(perSc)).toBe(true)
    expect(perSc * 60_000).toBeGreaterThan(12_500 - 1) // the scenario part is a gain: the seed CBOT is below 1300
  })
})

describe('exposição: só o que ainda protege', () => {
  it('an expired future no longer protects: the CBOT is open again and the card says nothing is open', async () => {
    await renderWithStore(<Comercializacao />, [...FARM, EXPIRED_FUTURE], { history: HIST, today: '2026-04-10' })
    expect(screen.getByTestId('exp-cbot')).toHaveTextContent('60.000 sc em aberto')
    expect(screen.getByTestId('com-completo')).toHaveTextContent('100%') // nothing protects any more: all open
  })

  it('the same future before the maturity protects', async () => {
    await renderWithStore(<Comercializacao />, [...FARM, EXPIRED_FUTURE], { history: HIST, today: '2026-03-01' })
    // 100.000 bu ÷ 2,20462 = 45.359 sc covered
    expect(screen.getByTestId('exp-cbot')).toHaveTextContent('14.641 sc em aberto')
  })

  it('accumulator: only the fixings still to come protect (2 × 5.000 bu = 4.536 sc)', async () => {
    await renderWithStore(<Comercializacao />, [...FARM, ACCUMULATOR], { history: HIST, today: '2026-03-18' })
    // 2 fixings left x 5.000 bu = 4.536 sc of CBOT cover; nothing is closed (the dollar and the basis are open)
    expect(screen.getByTestId('com-completo')).toHaveTextContent('55.464 sc')
    expect(screen.getByTestId('exp-cbot')).toHaveTextContent('55.464 sc em aberto')
  })

  it('accumulator knocked out: stops protecting', async () => {
    await renderWithStore(
      <Comercializacao />,
      [
        ...FARM,
        {
          ...ACCUMULATOR,
          partial: { ...ACCUMULATOR.partial, barrier: { type: 'ko', price: 1260, dir: 'baixa' } },
        } as Action,
      ],
      {
        history: {
          ...HIST,
          cbotUsc: {
            soja: [
              { date: '2026-03-02', settle: 1250 },
              { date: '2026-03-09', settle: 1280 },
              { date: '2026-03-17', settle: 1240 },
            ],
          },
        },
        today: '2026-03-20',
      },
    )
    expect(screen.getByTestId('exp-cbot')).toHaveTextContent('60.000 sc em aberto')
  })

  it('knock-out put that fell does not protect; one that is alive does', async () => {
    const put = (barrierPrice: number): Action => ({
      type: 'addHedgeOp',
      partial: {
        kind: 'put',
        side: 'comprado',
        qty: 100_000,
        strike: 1300,
        premium: 30,
        startDate: '2026-01-05',
        maturityDate: '2026-12-31',
        barrier: { type: 'ko', price: barrierPrice, dir: 'baixa' },
      },
    })
    const dead = await renderWithStore(<Comercializacao />, [...FARM, put(1150)], {
      history: HIST,
      today: '2026-04-10',
    })
    expect(screen.getByTestId('exp-cbot')).toHaveTextContent('60.000 sc em aberto')
    dead.unmount()
    await renderWithStore(<Comercializacao />, [...FARM, put(1100)], { history: HIST, today: '2026-04-10' })
    expect(screen.getByTestId('exp-cbot')).toHaveTextContent('14.641 sc em aberto')
  })

  it('no NaN or Infinity anywhere with history and operations of every kind', async () => {
    await renderWithStore(<Comercializacao />, [...FARM, EXPIRED_FUTURE, ACCUMULATOR], {
      history: HIST,
      today: '2026-03-18',
    })
    expect(document.body.textContent).not.toMatch(/NaN|Infinity|undefined/)
  })
})
