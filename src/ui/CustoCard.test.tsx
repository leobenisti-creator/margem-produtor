import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StoreProvider } from '../state/StoreProvider'
import { staticProvider } from '../data/staticProvider'
import type { MarketDataProvider } from '../data/types'
import { mockMatchMedia, seedState } from '../test/helpers'
import type { Action } from '../state/types'
import { CustoCard } from './CustoCard'

const NOTE = 'Não dá para somar os custos em US$/sacas agora: o dólar ou o preço de hoje está indisponível.'
const rentItem: Action = {
  type: 'setCostItem',
  itemId: 'arrendamento.valor',
  patch: { mode: 'valor', unit: 'scHa', valueBrlHa: 8 },
}

async function open(fx: number) {
  seedState([{ type: 'setCostMode', mode: 'categorias' }, rentItem])
  const s = await staticProvider.getSnapshot()
  s.fx.value = fx
  const provider: MarketDataProvider = { getSnapshot: () => Promise.resolve(s) }
  render(
    <StoreProvider provider={provider}>
      <CustoCard />
    </StoreProvider>,
  )
  await screen.findByRole('radio', { name: 'Total' })
  return userEvent.setup()
}

beforeEach(() => {
  localStorage.clear()
  mockMatchMedia(true)
})

describe('CustoCard: Total with US$/sc-ha costs', () => {
  it('shows a visible status note when the dollar/price is unusable (mode unchanged)', async () => {
    const user = await open(0)
    expect(screen.queryByText(NOTE)).toBeNull()
    await user.click(screen.getByRole('radio', { name: 'Total' }))
    expect(screen.getByRole('status')).toHaveTextContent(NOTE)
    expect(screen.getByRole('radio', { name: 'Por categoria' })).toHaveAttribute('aria-checked', 'true')
  })

  it('switches to Total without the note when the dollar is usable', async () => {
    const s = await staticProvider.getSnapshot()
    const user = await open(s.fx.value)
    await user.click(screen.getByRole('radio', { name: 'Total' }))
    expect(screen.queryByText(NOTE)).toBeNull()
    expect(screen.getByRole('radio', { name: 'Total' })).toHaveAttribute('aria-checked', 'true')
  })
})
