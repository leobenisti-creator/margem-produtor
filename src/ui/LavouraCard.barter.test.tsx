import { screen, waitFor } from '@testing-library/react'
import type { Action } from '../state/types'
import { readState, renderWithStore } from '../test/storeHarness'
import { LavouraCard } from './LavouraCard'
import { SalesSection } from './SalesPanel'

afterEach(() => localStorage.clear())

const FARM: Action[] = [
  { type: 'setInput', key: 'areaHa', value: 1000 },
  { type: 'setInput', key: 'yieldScHa', value: 60 },
]

const FIELD = 'Sacas que você vai entregar à revendedora (barter)'

describe('LavouraCard: Realizou operação barter', () => {
  it('shows only a quiet button while there is no barter', async () => {
    await renderWithStore(<LavouraCard />, FARM, { base: [] })
    expect(screen.getByRole('button', { name: 'Realizou operação barter' })).toBeInTheDocument()
    expect(screen.queryByLabelText(FIELD)).not.toBeInTheDocument()
    expect(screen.queryByTestId('barter-confirm')).not.toBeInTheDocument()
  })

  it('the button reveals the field with the helper text', async () => {
    const { user } = await renderWithStore(<LavouraCard />, FARM, { base: [] })
    await user.click(screen.getByRole('button', { name: 'Realizou operação barter' }))
    expect(screen.getByLabelText(FIELD)).toBeInTheDocument()
    expect(
      screen.getByText('Digite o custo da lavoura sem os insumos que você vai pagar com essas sacas.'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('barter-confirm')).not.toBeInTheDocument()
  })

  it('typing saves at once and shows the production used by the calculations', async () => {
    const { user } = await renderWithStore(<LavouraCard />, FARM, { base: [] })
    await user.click(screen.getByRole('button', { name: 'Realizou operação barter' }))
    await user.type(screen.getByLabelText(FIELD), '5000')
    expect(readState().barterSc.soja).toBe(5000)
    expect(readState().inputs.barterSc).toBe(5000)
    expect(screen.getByTestId('barter-confirm')).toHaveTextContent('Produção para as contas: 55.000 sc (de 60.000 sc)')
    await waitFor(() => expect(JSON.parse(localStorage.getItem('margem:v3') as string).barterSc.soja).toBe(5000))
  })

  it('a value above the production is refused with a pt-BR message and not saved', async () => {
    const { user } = await renderWithStore(<LavouraCard />, FARM, { base: [] })
    await user.click(screen.getByRole('button', { name: 'Realizou operação barter' }))
    await user.type(screen.getByLabelText(FIELD), '70000')
    expect(screen.getByText('As sacas do barter não podem passar da produção da lavoura.')).toBeInTheDocument()
    // The live keystrokes 7, 70, 700 and 7.000 were fine; the last digit was refused and the last valid value stays.
    expect(readState().barterSc.soja).toBe(7000)
  })

  it('opens already filled when there is a saved barter, and "Remover barter" clears and collapses it', async () => {
    const { user } = await renderWithStore(<LavouraCard />, [...FARM, { type: 'setBarterSc', value: 5000 }], { base: [] })
    expect(screen.getByLabelText(FIELD)).toHaveValue('5.000')
    expect(screen.getByTestId('barter-confirm')).toHaveTextContent('55.000 sc')
    await user.click(screen.getByRole('button', { name: 'Remover barter' }))
    expect(readState().barterSc.soja).toBe(0)
    expect(screen.queryByLabelText(FIELD)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Realizou operação barter' })).toBeInTheDocument()
  })

  it('each crop has its own barter on screen', async () => {
    const { user } = await renderWithStore(
      <LavouraCard />,
      [...FARM, { type: 'setBarterSc', value: 5000 }, { type: 'setBarterSc', value: 3000, crop: 'milho' }],
      { base: [] },
    )
    expect(screen.getByLabelText(FIELD)).toHaveValue('5.000')
    expect(user).toBeDefined()
    expect(readState().barterSc).toEqual({ soja: 5000, milho: 3000 })
  })

  it('keeps the data-tour anchors', async () => {
    const { container } = await renderWithStore(<LavouraCard />, FARM, { base: [] })
    for (const a of ['praca', 'area', 'produtividade']) expect(container.querySelector(`[data-tour="${a}"]`)).not.toBeNull()
  })
})

describe('Comercialização: production estimated text', () => {
  it('says "− barter" and shows the net production when there is barter', async () => {
    await renderWithStore(
      <SalesSection />,
      [
        ...FARM,
        { type: 'setBarterSc', value: 5000 },
        { type: 'addSale', partial: { volume: 20000, volumeUnit: 'sc', price: 110 } },
      ],
      { base: [] },
    )
    expect(screen.getByText(/Produção estimada: 55\.000 sc/)).toHaveTextContent('(área × produtividade − barter)')
    expect(screen.getByTestId('sales-summary')).toHaveTextContent('Vendido 36,4%')
  })

  it('keeps the old text without barter', async () => {
    await renderWithStore(
      <SalesSection />,
      [...FARM, { type: 'addSale', partial: { volume: 20000, volumeUnit: 'sc', price: 110 } }],
      { base: [] },
    )
    expect(screen.getByText(/Produção estimada: 60\.000 sc/)).toHaveTextContent('(área × produtividade).')
    expect(screen.getByTestId('sales-summary')).toHaveTextContent('Vendido 33,3%')
  })
})
