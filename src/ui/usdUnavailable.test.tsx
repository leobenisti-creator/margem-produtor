import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StoreProvider, useStore } from '../state/StoreProvider'
import { Simulador } from '../pages/Simulador'
import { CropCurrencyControls } from './TopBar'
import { staticProvider } from '../data/staticProvider'
import type { MarketDataProvider } from '../data/types'
import { mockMatchMedia, seedState } from '../test/helpers'
import type { Action } from '../state/types'

const NOTE = 'Dólar indisponível: digite o valor no lápis da cotação ou volte para R$'

function Probe() {
  const { state } = useStore()
  return <output data-testid="inputs">{JSON.stringify({ ...state.inputs, cats: state.costCategories })}</output>
}
const stored = () => JSON.parse(screen.getByTestId('inputs').textContent ?? '{}')

async function openWithoutDollar(actions: Action[] = []) {
  seedState([{ type: 'setCurrency', currency: 'USD' }, ...actions])
  const s = await staticProvider.getSnapshot()
  s.fx.value = 0
  const provider: MarketDataProvider = { getSnapshot: () => Promise.resolve(s) }
  const user = userEvent.setup()
  render(
    <StoreProvider provider={provider}>
      <CropCurrencyControls />
      <Simulador />
      <Probe />
    </StoreProvider>,
  )
  await screen.findByTestId('page-simulador')
  return user
}

beforeEach(() => {
  localStorage.clear()
  mockMatchMedia(true)
})

describe('USD with an unusable dollar', () => {
  it('the cost total input is disabled, shows a dash and the note', async () => {
    await openWithoutDollar()
    const cost = screen.getByLabelText('Custo por hectare')
    // Feedback 1: the sold price left the Simulação (sales are tranches in the Comercialização).
    expect(screen.queryByLabelText('Preço médio vendido')).toBeNull()
    for (const input of [cost]) {
      expect(input).toBeDisabled()
      expect(input).toHaveValue('—')
    }
    expect(screen.getAllByText(NOTE).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByLabelText('Custo por hectare')).not.toHaveValue('0')
  })

  it('typing does nothing and never stores a value', async () => {
    const user = await openWithoutDollar()
    const before = stored()
    await user.type(screen.getByLabelText('Custo por hectare'), '1000{Enter}')
    await user.tab()
    expect(stored()).toEqual(before)
    expect(screen.getByLabelText('Custo por hectare')).toHaveValue('—')
  })

  it('category inputs are disabled too', async () => {
    const user = await openWithoutDollar([{ type: 'setCostMode', mode: 'categorias' }])
    const before = stored()
    const rows = screen.getAllByTestId('cost-row')
    expect(rows).toHaveLength(8)
    for (const row of rows) {
      const input = row.querySelector('input') as HTMLInputElement
      expect(input).toBeDisabled()
      expect(input.value).toBe('—')
      await user.type(input, '5{Enter}')
    }
    expect(stored()).toEqual(before)
    expect(screen.getAllByText(NOTE).length).toBeGreaterThanOrEqual(1)
  })

  it('switching back to R$ re-enables the inputs and removes the note', async () => {
    const user = await openWithoutDollar()
    await user.click(screen.getByRole('radio', { name: 'R$' }))
    const cost = screen.getByLabelText('Custo por hectare')
    expect(cost).toBeEnabled()
    expect(cost).not.toHaveValue('—')
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument()
    await user.clear(cost)
    await user.type(cost, '4.000')
    await user.tab()
    expect(stored().costPerHaBrl).toBe(4000)
  })

  it('with a usable dollar in US$ nothing is disabled', async () => {
    seedState([{ type: 'setCurrency', currency: 'USD' }])
    render(
      <StoreProvider>
        <Simulador />
        <Probe />
      </StoreProvider>,
    )
    await screen.findByTestId('page-simulador')
    expect(screen.getByLabelText('Custo por hectare')).toBeEnabled()
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument()
  })
})
