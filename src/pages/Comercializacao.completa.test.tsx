import { screen, within } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { mockMatchMedia } from '../test/helpers'
import { readState, renderWithStore } from '../test/storeHarness'
import type { Action } from '../state/types'
import { Comercializacao } from './Comercializacao'

expect.extend(toHaveNoViolations)
vi.setConfig({ testTimeout: 20000 })

beforeEach(() => {
  localStorage.clear()
  mockMatchMedia(true)
})

// 1.000 ha × 60 sc/ha = 60.000 sc
const FARM: Action[] = [
  { type: 'setInput', key: 'areaHa', value: 1000 },
  { type: 'setInput', key: 'yieldScHa', value: 60 },
]
const SALE: Action = {
  type: 'addSale',
  partial: { volume: 15000, volumeUnit: 'sc', price: 150, priceCurrency: 'BRL' },
}
// 100.000 bu sold future (≈ 3.667 sc) — keep it big enough to see: 1.000.000 bu ≈ 36.667 sc
const FUTURE: Action = {
  type: 'addHedgeOp',
  partial: { asset: 'soja', kind: 'futuro', side: 'vendido', qty: 1_000_000, strike: 1300, maturity: 'jul/27' },
}

const render = (actions: Action[] = []) => renderWithStore(<Comercializacao />, [...FARM, ...actions])

describe('Comercialização: a página inteira', () => {
  it('lists the blocks in the order the producer reads them: summary, vendas, operações em bolsa, mapa da safra, detalhes da exposição', async () => {
    await render()
    const ids = [
      'comercializacao-kpis',
      'card-vendas',
      'card-operacoes',
      'card-mapa',
      'card-exposicao',
    ]
    const els = ids.map((id) => screen.getByTestId(id))
    for (let i = 0; i < els.length - 1; i++) {
      expect(els[i].compareDocumentPosition(els[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(screen.getByRole('heading', { name: /Operações em bolsa/ })).toBeInTheDocument()
  })

  it('nothing registered: everything is open', async () => {
    await render()
    for (const id of ['com-dolar', 'com-completo', 'com-basis']) {
      expect(screen.getByTestId(id)).toHaveTextContent('100%')
      expect(screen.getByTestId(id)).toHaveTextContent('60.000 sc')
    }
    expect(screen.getByTestId('com-fechado')).toHaveTextContent('0%')
    expect(screen.getByTestId('com-fechado')).toHaveTextContent('0 sc')
    expect(screen.getByTestId('exp-summary')).toHaveTextContent('exposto a: basis, CBOT e dólar')
  })

  it('a sale: the sold share, the open sacks and the exposure that follows', async () => {
    await render([SALE])
    // sold in R$: the dollar of those 15.000 sc is closed; basis, CBOT and everything else are open on the other 45.000
    expect(screen.getByTestId('com-fechado')).toHaveTextContent('25%')
    expect(screen.getByTestId('com-fechado')).toHaveTextContent('15.000 sc')
    expect(screen.getByTestId('com-dolar')).toHaveTextContent('75%')
    expect(screen.getByTestId('com-dolar')).toHaveTextContent('45.000 sc')
    expect(screen.getByTestId('com-basis')).toHaveTextContent('45.000 sc')
    expect(screen.getByTestId('com-completo')).toHaveTextContent('45.000 sc')
  })

  it('an operation on the exchange: protected sacks in the summary and the exposure follows', async () => {
    await render([SALE, FUTURE])
    // 1.000.000 bu ÷ 2,2046 bu/sc... the card prints the sacks covered at the crop's bushels per sack
    // the future covers the CBOT of every unsold sack (45.000): the dollar and the basis stay open, nothing is open in all three
    expect(screen.getByTestId('com-completo')).toHaveTextContent('0 sc')
    expect(screen.getByTestId('com-dolar')).toHaveTextContent('45.000 sc')
    expect(screen.getByTestId('com-basis')).toHaveTextContent('45.000 sc')
    expect(screen.getByTestId('com-fechado')).toHaveTextContent('15.000 sc')
    // the CBOT row of the exposure is now (partly) covered
    expect(within(screen.getByTestId('exp-cbot')).getByText(/Protegido|Parcialmente protegido/)).toBeInTheDocument()
    expect(readState().hedgeOps).toHaveLength(1)
  })

  it('without area and yield it says what is missing instead of inventing numbers', async () => {
    await renderWithStore(<Comercializacao />, [
      { type: 'setInput', key: 'areaHa', value: 0 },
      { type: 'setInput', key: 'yieldScHa', value: 0 },
    ])
    expect(screen.getByTestId('exp-summary')).toHaveTextContent('Informe área e produtividade')
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/)
  })

  it('has no axe violations with a sale, an operation and an open US$ cost', async () => {
    const { container } = await render([
      SALE,
      FUTURE,
      { type: 'setCostMode', mode: 'categorias' },
      { type: 'setGroupTotal', group: 'sementes', value: { usd: { amountUsdHa: 100, boughtPct: 0, boughtRate: 0 } } },
    ])
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })
})

describe('Comercialização: operações por cultura e leitura de operações que não cobrem', () => {
  it('a soybean operation is not shown nor settled when the crop on screen is milho', async () => {
    await render([FUTURE, { type: 'setCrop', crop: 'milho' }])
    expect(readState().crop).toBe('milho')
    expect(readState().hedgeOps).toHaveLength(1) // kept in the store (it is the soybean one)...
    expect(screen.queryByRole('group', { name: /Operação 1/ })).toBeNull() // ...but not shown for corn
    // the producer's productivity stays (60 sc/ha = 60.000 sc): the soybean future covers none of it
    expect(screen.getByTestId('exp-cbot')).toHaveTextContent('60.000 sc em aberto')
  })

  it('only calls/other legs: the exchange card still says there are operations', async () => {
    await render([
      {
        type: 'addHedgeOp',
        partial: { asset: 'soja', kind: 'call', side: 'comprado', qty: 500000, strike: 1300, premium: 20 },
      },
    ])
    // a bought call protects nothing, and the exposure says so
    expect(document.body.textContent).toMatch(/operação não protege/)
    expect(screen.getByTestId('exp-cbot')).toHaveTextContent('60.000 sc em aberto')
  })
})
