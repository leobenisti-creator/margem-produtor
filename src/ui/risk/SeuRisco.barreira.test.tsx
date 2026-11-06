import { fireEvent, screen, within } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { mockMatchMedia } from '../../test/helpers'
import { renderWithStore } from '../../test/storeHarness'
import type { Action } from '../../state/types'
import { SeuRisco } from './SeuRisco'

expect.extend(toHaveNoViolations)
vi.setConfig({ testTimeout: 30000 })

beforeEach(() => {
  localStorage.clear()
  mockMatchMedia(true)
})

const FARM: Action[] = [
  { type: 'setInput', key: 'areaHa', value: 1000 },
  { type: 'setInput', key: 'yieldScHa', value: 60 },
]
const put = (barrier: object | null): Action => ({
  type: 'addHedgeOp',
  partial: {
    asset: 'soja',
    kind: 'put',
    side: 'comprado',
    qty: 100_000,
    strike: 1150,
    premium: 25,
    startDate: '2026-10-20',
    maturityDate: '2027-07-15',
    barrier,
  } as never,
})
const KO = { type: 'ko', price: 1320, dir: 'alta' }
const soldCall: Action = {
  type: 'addHedgeOp',
  partial: { asset: 'soja', kind: 'call', side: 'vendido', qty: 50_000, strike: 1350, premium: 20, maturityDate: '2027-07-15' },
}

const openCbot = async (actions: Action[]) => {
  await renderWithStore(<SeuRisco />, actions)
  fireEvent.click(await screen.findByTestId('risk-card-cbot'))
}

describe('SeuRisco: barriers on the CBOT', () => {
  it('with a knock-out put: the block appears and the chart stays the normal one (no barrier line)', async () => {
    await openCbot([...FARM, put(KO)])
    const block = await screen.findByTestId('risk-bloco-barreira')
    expect(block).toHaveTextContent('Put: protege abaixo de 1.150 US¢/bu')
    expect(block).toHaveTextContent('até a CBOT subir a 1.320 US¢/bu')
    expect(screen.getByTestId('risk-chart')).toBeInTheDocument()
    expect(screen.queryByTestId('risk-marcador')).toBeNull()
    expect(screen.queryByTestId('risk-line-pior')).toBeNull()
    expect(screen.getByTestId('risk-chart').textContent).not.toMatch(/KO|Call vendida/)
  })

  it('the coverage table: firm, only until the barrier, and what is uncovered before and after the touch', async () => {
    await openCbot([...FARM, put(KO)])
    await screen.findByTestId('risk-bloco-barreira')
    // 60.000 sc, nothing sold: the put covers 45.359 sc, all of it depends on the barrier
    expect(screen.getByTestId('risk-cob-firme')).toHaveTextContent('0 sc')
    expect(screen.getByTestId('risk-cob-barreira')).toHaveTextContent('45.359 sc')
    const open = screen.getByTestId('risk-cob-aberto')
    expect(open).toHaveTextContent('14.641 sc') // 60.000 − 45.359 today
    expect(open).toHaveTextContent('60.000 sc') // nothing covered after the touch
  })

  it('the margin table shows what touching costs at lower final prices, per sack', async () => {
    await openCbot([...FARM, put(KO)])
    const table = await screen.findByTestId('risk-barreira-tabela')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.length).toBeGreaterThan(0)
    // at 20% below today (993 US¢/bu) the put would pay (1150 − 993) × 100.000 bu: a real loss when touched
    const last = rows[rows.length - 1]
    expect(last).toHaveTextContent('−20,0%')
    expect(within(last).getAllByRole('cell')[2]).toHaveTextContent(/^−R\$ [\d.,]+\/sc$/)
  })

  it('a plain put (no barrier) has no block', async () => {
    await openCbot([...FARM, put(null)])
    await screen.findByTestId('risk-chart')
    expect(screen.queryByTestId('risk-bloco-barreira')).toBeNull()
  })

  it('a call sold is listed as a limit to the gain in the block, not drawn on the chart', async () => {
    await openCbot([...FARM, soldCall])
    const block = await screen.findByTestId('risk-bloco-barreira')
    expect(block).toHaveTextContent('Limite de ganho')
    expect(block).toHaveTextContent('acima de 1.350 US¢/bu a alta não aumenta o seu ganho')
    expect(screen.queryByTestId('risk-marcador')).toBeNull()
  })

  it('the dollar and the basis cards show none of it', async () => {
    await renderWithStore(<SeuRisco />, [...FARM, put(KO)])
    fireEvent.click(await screen.findByTestId('risk-card-dolar'))
    expect(screen.queryByTestId('risk-bloco-barreira')).toBeNull()
    expect(screen.queryByTestId('risk-marcador')).toBeNull()
    fireEvent.click(screen.getByTestId('risk-card-basis'))
    expect(screen.queryByTestId('risk-bloco-barreira')).toBeNull()
  })

  it('has no accessibility violations with a knock-out put and a call sold', async () => {
    const { container } = await renderWithStore(<SeuRisco />, [...FARM, put(KO), soldCall])
    fireEvent.click(await screen.findByTestId('risk-card-cbot'))
    await screen.findByTestId('risk-bloco-barreira')
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })
})
