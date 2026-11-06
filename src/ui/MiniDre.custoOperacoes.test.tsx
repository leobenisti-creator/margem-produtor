import { act, screen, within } from '@testing-library/react'
import type { Action } from '../state/types'
import { renderWithStore } from '../test/storeHarness'
import { MiniDre } from './MiniDre'
import { ResultsUnitProvider, useResultsUnit } from './resultsUnit'

vi.setConfig({ testTimeout: 20000 })
beforeEach(() => localStorage.clear())

/** "R$ 1.234,56" / "−R$ ..." to a number. */
function num(text: string | null): number {
  const t = (text ?? '')
    .replace(/[^\d,−-]/g, '')
    .replace(',', '.')
    .replace('−', '-')
  return Number(t)
}

// 1.000 ha x 60 sc/ha = 60.000 sc; the seed market: CBOT 1.241,25 US¢/bu, dollar 5,4998
const FARM: Action[] = [
  { type: 'setInput', key: 'areaHa', value: 1000 },
  { type: 'setInput', key: 'yieldScHa', value: 60 },
]
const FX = 5.4998
const CBOT = 1241.25
const LUCRO = /Lucro\/prejuízo das operações financeiras/
const CUSTO = /Custo das operações financeiras/
const RECEBIDOS = /Prêmios recebidos nas operações financeiras/

const op = (partial: object): Action => ({ type: 'addHedgeOp', partial })
const dre = () => screen.getByTestId('mini-dre')
const val = (id: string) => num(within(dre()).getByTestId(id).textContent)

describe('DRE: lucro/prejuízo e custo das operações financeiras', () => {
  it('without operations neither line exists, nor the memo', async () => {
    await renderWithStore(<MiniDre />, FARM)
    expect(within(dre()).queryByText(LUCRO)).toBeNull()
    expect(within(dre()).queryByText(CUSTO)).toBeNull()
    expect(within(dre()).queryByText(RECEBIDOS)).toBeNull()
    expect(screen.queryByTestId('dre-sem-operacoes')).toBeNull()
  })

  it('a future has a result but no cost: only the profit/loss line shows', async () => {
    await renderWithStore(<MiniDre />, [...FARM, op({ qty: 100_000, strike: 1300 })])
    expect(within(dre()).getByText(LUCRO)).toBeInTheDocument()
    expect(within(dre()).queryByText(CUSTO)).toBeNull()
    // (1300 - 1241,25) = 58,75 cents x 100.000 bu / 100 = US$ 58.750 x 5,4998 / 60.000 sc = R$ 5,3852 per sack
    expect(num(within(dre()).getAllByTestId('dre-hedge-op')[0].textContent)).toBeCloseTo((58.75 * 1000 * FX) / 60000, 1)
  })

  it('a result of exactly zero does not show (nothing to say)', async () => {
    await renderWithStore(<MiniDre />, [...FARM, op({ qty: 100_000, strike: CBOT })])
    expect(within(dre()).queryByText(LUCRO)).toBeNull()
    expect(screen.queryByTestId('dre-sem-operacoes')).toBeNull()
  })

  it('a bought put: the premium paid is a COST line (in the costs) and the payoff is the profit line (in the revenue)', async () => {
    await renderWithStore(<MiniDre />, [
      ...FARM,
      op({ kind: 'put', side: 'comprado', qty: 100_000, strike: 1300, premium: 30 }),
    ])
    expect(within(dre()).getByText(CUSTO)).toBeInTheDocument()
    expect(within(dre()).getByText(LUCRO)).toBeInTheDocument()
    // premium 30 cents x 100.000 bu / 100 = US$ 30.000 x 5,4998 / 60.000 sc = R$ 2,7499 per sack
    expect(val('dre-hedge-cost')).toBeCloseTo((30 * 1000 * FX) / 60000, 1)
    expect(within(dre()).getByTestId('dre-hedge-cost')).toHaveTextContent('R$')
    // payoff 58,75 cents -> R$ 5,3852 per sack, WITHOUT the premium inside it
    expect(val('dre-hedge-op')).toBeCloseTo((58.75 * 1000 * FX) / 60000, 1)
  })

  it('a sold call: the premium RECEIVED has its own wording and reduces the costs', async () => {
    const base = await renderWithStore(<MiniDre />, FARM)
    const costsBase = val('dre-costs')
    base.unmount()
    await renderWithStore(<MiniDre />, [
      ...FARM,
      op({ kind: 'call', side: 'vendido', qty: 100_000, strike: 1500, premium: 20 }),
    ])
    expect(within(dre()).getByText(RECEBIDOS)).toBeInTheDocument()
    expect(within(dre()).queryByText(CUSTO)).toBeNull()
    // 20 cents x 100.000 bu / 100 = US$ 20.000 x 5,4998 / 60.000 sc = R$ 1,8333 per sack received
    expect(val('dre-hedge-cost')).toBeCloseTo((20 * 1000 * FX) / 60000, 1)
    // the costs go DOWN by that amount
    expect(val('dre-costs')).toBeCloseTo(costsBase - (20 * 1000 * FX) / 60000, 1)
  })

  it('brokerage and fees are a cost even when there is no premium', async () => {
    await renderWithStore(<MiniDre />, [...FARM, op({ qty: 100_000, strike: 1300, costBrl: 6000 })])
    expect(within(dre()).getByText(CUSTO)).toBeInTheDocument()
    expect(val('dre-hedge-cost')).toBeCloseTo(6000 / 60000, 2) // R$ 0,10 per sack
  })

  it('the totals still add up: revenue - costs = result, and the lines move revenue and costs', async () => {
    const base = await renderWithStore(<MiniDre />, FARM)
    const rev0 = val('dre-revenue')
    const cost0 = val('dre-costs')
    const res0 = val('dre-result')
    base.unmount()
    await renderWithStore(<MiniDre />, [
      ...FARM,
      op({ kind: 'put', side: 'comprado', qty: 100_000, strike: 1300, premium: 30 }),
    ])
    const profit = val('dre-hedge-op')
    const cost = val('dre-hedge-cost')
    expect(val('dre-revenue') - rev0).toBeCloseTo(profit, 1)
    expect(val('dre-costs') - cost0).toBeCloseTo(cost, 1)
    expect(val('dre-revenue') - val('dre-costs')).toBeCloseTo(val('dre-result'), 1)
    expect(val('dre-result') - res0).toBeCloseTo(profit - cost, 1)
  })

  it('the memo says what the result would be without the operations (equals the DRE without them)', async () => {
    const base = await renderWithStore(<MiniDre />, FARM)
    const res0 = val('dre-result')
    base.unmount()
    await renderWithStore(<MiniDre />, [
      ...FARM,
      op({ kind: 'put', side: 'comprado', qty: 100_000, strike: 1300, premium: 30 }),
    ])
    const memo = screen.getByTestId('dre-sem-operacoes')
    expect(memo).toHaveTextContent('sem as operações financeiras')
    // the amount in the memo is the result per sack of the farm without operations
    const m = num(memo.textContent?.split('·')[1] ?? null)
    expect(m).toBeCloseTo(res0, 1)
  })

  it('an accumulator premium (paid, on the whole contract) is in the cost line; one per operation underneath', async () => {
    await renderWithStore(<MiniDre />, [
      ...FARM,
      op({
        kind: 'accumulator',
        qty: 5000,
        strike: 1300,
        floorLevel: 1000,
        premium: 10,
        startDate: '2026-03-02',
        maturityDate: '2026-03-30',
        accum: { frequency: 'semanal' },
      }),
      op({ kind: 'put', side: 'comprado', qty: 100_000, strike: 1300, premium: 30 }),
    ])
    expect(within(dre()).getByText(CUSTO)).toBeInTheDocument()
    const parts = within(dre()).getAllByTestId('dre-hedge-cost')
    expect(parts).toHaveLength(2)
    // accumulator: 10 cents x 5.000 bu x 5 fixings / 100 = US$ 2.500 x 5,4998 / 60.000 = R$ 0,2292; put: R$ 2,7499
    expect(num(parts[0].textContent)).toBeCloseTo((10 * 5000 * 5 * 0.01 * FX) / 60000, 1)
    expect(num(parts[1].textContent)).toBeCloseTo((30 * 1000 * FX) / 60000, 1)
  })

  it('no NaN anywhere, and per hectare also works with the new lines', async () => {
    let setUnit: ReturnType<typeof useResultsUnit>['setUnit'] = () => {}
    function Probe() {
      setUnit = useResultsUnit().setUnit
      return null
    }
    await renderWithStore(
      <ResultsUnitProvider>
        <Probe />
        <MiniDre />
      </ResultsUnitProvider>,
      [...FARM, op({ kind: 'put', side: 'comprado', qty: 100_000, strike: 1300, premium: 30, costBrl: 500 })],
    )
    act(() => setUnit('ha'))
    expect(within(dre()).getByText(CUSTO)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/NaN|Infinity|undefined/)
  })
})
