import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StoreProvider, useStore } from '../state/StoreProvider'
import { SalesSection } from '../ui/SalesPanel'
import { LEGACY_EXAMPLE, seedState } from '../test/helpers'

// The sales tests open a panel and type several fields; under a parallel run they can pass 5 s.
vi.setConfig({ testTimeout: 15000 })

type Store = ReturnType<typeof useStore>
let api: Store
function Grab() {
  api = useStore()
  return <output data-testid="overrides">{JSON.stringify(api.state.overrides)}</output>
}

beforeEach(() => {
  localStorage.clear()
  // Pre-FOB example farm (Centro-Sul at the Paranaguá base); tour still unseen like a first visit.
  seedState(LEGACY_EXAMPLE, false)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('Comercializacao sale plan (now "Vendas da safra")', () => {
  async function fill(user: ReturnType<typeof userEvent.setup>, label: RegExp, i: number, v: string) {
    const f = screen.getAllByLabelText(label)[i]
    await user.clear(f)
    await user.type(f, v)
    await user.tab()
  }
  // The sales form lives in the Simulação now: mount it with the same store.
  async function setupSales() {
    const user = userEvent.setup()
    render(
      <StoreProvider>
        <SalesSection />
        <Grab />
      </StoreProvider>,
    )
    await screen.findByRole('button', { name: /adicionar venda/i })
    return user
  }

  it('weights the tranches into the average price, refuses sales above the production and removes a tranche', async () => {
    const user = await setupSales()
    await user.click(screen.getByRole('button', { name: /adicionar venda/i }))
    await fill(user, /sacas vendidas \(nova venda/i, 0, '10000')
    await fill(user, /preço por saca \(nova venda/i, 0, '150')
    // an unsaved sale already counts while the app is open
    expect(screen.getByTestId('sales-summary')).toHaveTextContent(/^Vendido [\d,]+% \(10\.000 sc\) · preço médio R\$ 150,00\/sc$/)
    expect(screen.getByRole('button', { name: 'Remover nova venda' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/)
    await user.click(screen.getByRole('button', { name: /adicionar venda/i }))
    await fill(user, /sacas vendidas \(nova venda 2/i, 0, '1000000')
    await fill(user, /preço por saca \(nova venda 2/i, 0, '100')
    // the volume above what is left of the production is refused: the store never passes 100%
    expect(screen.getByText(/Não dá para vender mais que a produção/)).toBeInTheDocument()
    expect(screen.queryByTestId('sales-over')).toBeNull()
    expect(api.state.sales[1].volume).toBeLessThan(1000000)
    await user.click(screen.getByRole('button', { name: /remover nova venda 2/i }))
    expect(screen.queryByText(/Não dá para vender mais que a produção/)).toBeNull()
  })

  it('a rejected volume (−5) keeps the previous volume after blur', async () => {
    const user = await setupSales()
    await user.click(screen.getByRole('button', { name: /adicionar venda/i }))
    await fill(user, /sacas vendidas \(nova venda/i, 0, '600')
    await fill(user, /preço por saca \(nova venda/i, 0, '150')
    const sum = screen.getByTestId('sales-summary').textContent
    await fill(user, /sacas vendidas \(nova venda/i, 0, '-5')
    expect(screen.getByRole('alert')).toHaveTextContent(/mínimo/i)
    expect(screen.getByTestId('sales-summary').textContent).toBe(sum)
    expect(api.state.sales[0].volume).toBe(600)
  })

  it('the tranches are stored (no cap of three)', async () => {
    const user = await setupSales()
    for (let i = 0; i < 4; i++) await user.click(screen.getByRole('button', { name: /adicionar venda/i }))
    expect(screen.getAllByLabelText(/sacas vendidas \(nova venda/i)).toHaveLength(4)
    expect(api.state.sales).toHaveLength(4)
  })
})
