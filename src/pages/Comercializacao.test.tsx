import { act, render, screen, within } from '@testing-library/react'
import { StoreProvider, useStore } from '../state/StoreProvider'
import { Comercializacao } from './Comercializacao'
import { LEGACY_EXAMPLE, seedState } from '../test/helpers'

vi.setConfig({ testTimeout: 15000 })

async function setup() {
  render(
    <StoreProvider>
      <Comercializacao />
    </StoreProvider>,
  )
  await screen.findByTestId('page-comercializacao')
  return screen.getByTestId('card-vendas')
}

beforeEach(() => {
  localStorage.clear()
  seedState(LEGACY_EXAMPLE, false)
  // @ts-expect-error resetting the stub between tests
  delete window.matchMedia
})

describe('Comercialização: Vendas da safra', () => {
  it('holds the sales card; no old sold fields, the target is not here', async () => {
    const card = await setup()
    expect(within(card).getByRole('heading', { name: /Vendas da safra/ })).toBeInTheDocument()
    expect(within(card).queryByLabelText('Já vendido')).toBeNull()
    expect(within(card).queryByLabelText('Preço médio vendido')).toBeNull()
    expect(within(card).queryByRole('switch', { name: /meta de margem/i })).toBeNull()
    expect(screen.queryByRole('switch', { name: /opcional/ })).toBeNull()
  })

  it('shows the tranche summary and the tranche rows', async () => {
    seedState([
      ...LEGACY_EXAMPLE,
      { type: 'addSale', partial: { volume: 600, volumeUnit: 't', price: 140, priceCurrency: 'BRL' } },
      { type: 'addSale', partial: { volume: 5000, volumeUnit: 'sc', price: 27.36, priceCurrency: 'USD', dollar: 5.4 } },
    ])
    const card = await setup()
    // 600 t = 10.000 sc at 140 + 5.000 sc at 147,744 → 15.000 sc of 60.400 (25%) at R$ 142,58
    expect(within(card).getByTestId('sales-summary')).toHaveTextContent(
      'Vendido 24,8% (15.000 sc) · preço médio R$ 142,58/sc',
    )
    // the card only has the summary; the saved sales are in the document behind "Vendas já realizadas"
    expect(within(card).getByRole('button', { name: 'Vendas já realizadas' })).toHaveTextContent('2')
    expect(within(card).queryByLabelText(/^Sacas vendidas/)).toBeNull()
    expect(within(card).queryByRole('link', { name: 'Registrar vendas ›' })).toBeNull()
    expect(within(card).queryByText(/ainda não reportou/)).toBeNull()
  })

  it('without tranches says nothing was reported; adding one in the store shows the summary', async () => {
    let api: ReturnType<typeof useStore> | null = null
    function Grab() {
      api = useStore()
      return null
    }
    render(
      <StoreProvider>
        <Comercializacao />
        <Grab />
      </StoreProvider>,
    )
    await screen.findByTestId('page-comercializacao')
    const card = screen.getByTestId('card-vendas')
    expect(within(card).getByText('Você ainda não reportou nenhuma venda.')).toBeInTheDocument()
    expect(within(card).queryByTestId('sales-summary')).toBeNull()
    expect(within(card).getByRole('button', { name: 'Adicionar venda' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Vendas já realizadas' })).toBeInTheDocument()
    act(() =>
      api!.dispatch({ type: 'addSale', partial: { volume: 6040, volumeUnit: 'sc', price: 130, priceCurrency: 'BRL' } }),
    )
    expect(within(card).queryByText(/ainda não reportou/)).toBeNull()
    expect(within(card).getByTestId('sales-summary')).toHaveTextContent(
      'Vendido 10,0% (6.040 sc) · preço médio R$ 130,00/sc',
    )
  })

  it('on the default start (no area × yield) asks for them instead of an over-production warning', async () => {
    seedState([{ type: 'addSale', partial: { volume: 1000, volumeUnit: 'sc', price: 100, priceCurrency: 'BRL' } }])
    const card = await setup()
    expect(within(card).queryByText('As vendas passam da produção estimada.')).toBeNull()
    expect(within(card).getByText('Informe área e produtividade para calcular o % vendido.')).toBeInTheDocument()
  })
})
