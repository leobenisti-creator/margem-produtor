import { screen } from '@testing-library/react'
import { mockMatchMedia } from '../test/helpers'
import { renderWithStore } from '../test/storeHarness'
import { Simulador } from './Simulador'

vi.setConfig({ testTimeout: 20000 })

beforeEach(() => {
  localStorage.clear()
  mockMatchMedia(true)
})

describe('Simulador: gráfico de custos no fim da página', () => {
  it('with a single total there is no chart; by category it comes after the form, as its own card', async () => {
    const { user } = await renderWithStore(<Simulador />)
    expect(screen.queryByTestId('cost-summary')).toBeNull()
    await user.click(screen.getByRole('radio', { name: 'Por categoria' }))
    const chart = screen.getByTestId('cost-summary')
    const form = screen.getByTestId('sim-form')
    expect(form.contains(chart)).toBe(true)
    // last card of the page column
    expect(form.lastElementChild?.contains(chart)).toBe(true)
  })

  it('the unit chosen in the cost card also drives the chart', async () => {
    const { user } = await renderWithStore(<Simulador />)
    await user.click(screen.getByRole('radio', { name: 'Por categoria' }))
    await user.click(screen.getAllByRole('button', { name: 'Trocar unidade (R$/ha)' })[0])
    await user.click(screen.getByRole('menuitem', { name: 'Mudar para R$/t' }))
    expect(screen.getByTestId('cost-summary')).toHaveTextContent('por tonelada')
  })
})
