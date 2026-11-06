import { screen, within } from '@testing-library/react'
import { readState, renderWithStore } from '../test/storeHarness'
import { CostGroup } from './CostGroup'

beforeEach(() => localStorage.clear())

describe('CostGroup', () => {
  it('is labelled Adubação, never Fertilizantes, and shows no regional reference', async () => {
    await renderWithStore(<CostGroup group="fertilizantes" />, [{ type: 'setCostMode', mode: 'categorias' }])
    expect(screen.getByText('Adubação')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Fertilizantes/)
    expect(screen.getByTestId('cost-row')).not.toHaveTextContent(/Referência da região/)
  })

  it('accepts just the total R$/ha without opening, and the result follows', async () => {
    const { user } = await renderWithStore(<CostGroup group="fertilizantes" />)
    const field = screen.getByRole('textbox', { name: 'Adubação' })
    await user.clear(field)
    await user.type(field, '3.000')
    await user.tab()
    const s = readState()
    expect(s.costMode).toBe('categorias')
    expect(s.costGroups.fertilizantes).toMatchObject({ mode: 'total', totalBrlHa: 3000 })
    expect(s.costCategories.fertilizantes).toBe(3000)
    expect(screen.queryByTestId('item-adubacao.macro')).toBeNull()
  })

  it('Abrir shows the items (with the remainder), Fechar hides them', async () => {
    const { user } = await renderWithStore(<CostGroup group="fertilizantes" />)
    const open = screen.getByRole('button', { name: 'Abrir Adubação' })
    expect(open).toHaveAttribute('aria-expanded', 'false')
    expect(open).toHaveTextContent('Abrir ›')
    await user.click(open)
    const close = screen.getByRole('button', { name: 'Fechar Adubação' })
    expect(close).toHaveAttribute('aria-expanded', 'true')
    expect(close).toHaveTextContent('Fechar ‹')
    for (const id of ['adubacao.corretivos', 'adubacao.macro', 'adubacao.micro', 'adubacao.demais']) {
      expect(screen.getByTestId(`item-${id}`)).toBeInTheDocument()
    }
    await user.click(close)
    expect(screen.queryByTestId('item-adubacao.macro')).toBeNull()
  })

  it('changing an item moves the group field (sum of the items)', async () => {
    const { user } = await renderWithStore(<CostGroup group="fertilizantes" />)
    const field = screen.getByRole('textbox', { name: 'Adubação' }) as HTMLInputElement
    const num = () => Number(field.value.replace(/\./g, '').replace(',', '.'))
    expect(num()).toBeCloseTo(2150.85, 0)
    await user.click(screen.getByRole('button', { name: 'Abrir Adubação' }))
    await user.click(within(screen.getByTestId('item-adubacao.macro')).getByRole('radio', { name: 'meu valor' }))
    // Opened into items none of which is filled: the group counts only what is typed (zero).
    expect(num()).toBeCloseTo(0, 0)
    expect(screen.getByText(/soma dos itens/)).toBeInTheDocument()
    const macroField = within(screen.getByTestId('item-adubacao.macro')).getByLabelText('Valor de Macronutrientes')
    await user.clear(macroField)
    await user.type(macroField, '900')
    await user.tab()
    expect(num()).toBeCloseTo(900, 0)
  })
})
