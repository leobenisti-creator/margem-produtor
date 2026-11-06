import { render, screen } from '@testing-library/react'
import { StoreProvider } from '../state/StoreProvider'
import { Resultados } from './Resultados'
import { staticProvider } from '../data/staticProvider'
import type { MarketDataProvider, MarketSnapshot } from '../data/types'
import { LEGACY_EXAMPLE, seedState } from '../test/helpers'

const MARKET = 'Sem preço de CBOT ou dólar para montar a matriz.'
const FARM = 'Informe área e produtividade para ver a matriz.'

async function open(edit: (s: MarketSnapshot) => void = () => {}) {
  const s = await staticProvider.getSnapshot()
  edit(s)
  const provider: MarketDataProvider = { getSnapshot: () => Promise.resolve(s) }
  render(
    <StoreProvider provider={provider}>
      <Resultados />
    </StoreProvider>,
  )
  await screen.findByTestId('page-resultados')
}

beforeEach(() => {
  localStorage.clear()
  seedState(LEGACY_EXAMPLE)
})

describe('Resultados financeiros: why the matrix is missing', () => {
  it.each([
    ['dólar 0', (s: MarketSnapshot) => void (s.fx.value = 0)],
    ['CBOT 0', (s: MarketSnapshot) => void (s.cbotUsc.soja.value = 0)],
  ])('%s: says the dollar/CBOT is unavailable', async (_n, edit) => {
    await open(edit)
    const card = screen.getByTestId('card-matriz')
    expect(card).toHaveTextContent(MARKET)
    expect(card).not.toHaveTextContent(FARM)
    expect(screen.queryByTestId('matriz-tabela')).toBeNull()
    expect(document.body.textContent).not.toMatch(/NaN|Infinity|undefined/)
  })

  it('a farm without yield says so instead of showing a blank matrix', async () => {
    seedState([...LEGACY_EXAMPLE, { type: 'setInput', key: 'yieldScHa', value: 0 }])
    await open()
    const card = screen.getByTestId('card-matriz')
    expect(card).toHaveTextContent(FARM)
    expect(card).not.toHaveTextContent(MARKET)
    expect(document.body.textContent).not.toMatch(/NaN|Infinity|undefined/)
  })
})
