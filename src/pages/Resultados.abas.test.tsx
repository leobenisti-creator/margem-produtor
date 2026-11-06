import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StoreProvider } from '../state/StoreProvider'
import { LEGACY_EXAMPLE, seedState } from '../test/helpers'
import { Resultados } from './Resultados'

vi.setConfig({ testTimeout: 20000 })

async function setup() {
  const user = userEvent.setup()
  render(
    <StoreProvider>
      <Resultados />
    </StoreProvider>,
  )
  await screen.findByTestId('page-resultados')
  return user
}

const setHash = (h: string) => window.history.replaceState(null, '', h)

beforeEach(() => {
  localStorage.clear()
  seedState(LEGACY_EXAMPLE, false)
  setHash('#/resultados')
})
afterEach(() => setHash('#'))

describe('Resultados: tabs "Resultado" and "Seu risco"', () => {
  it('is a tablist with two tabs; Resultado is the default and owns the hero, matrix and DRE', async () => {
    await setup()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Resultado', 'Seu risco'])
    expect(screen.getByRole('tablist', { name: 'Seções dos resultados' })).toBeInTheDocument()
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false')
    expect(tabs[0]).toHaveAttribute('tabindex', '0')
    expect(tabs[1]).toHaveAttribute('tabindex', '-1')
    const panel = screen.getByRole('tabpanel', { name: 'Resultado' })
    expect(panel).toBeVisible()
    for (const id of ['resultados-hero', 'card-matriz', 'mini-dre']) {
      expect(panel).toContainElement(screen.getByTestId(id))
    }
    expect(tabs[0]).toHaveAttribute('aria-controls', panel.id)
  })

  it('a click on "Seu risco" shows its panel and hides the Resultado content', async () => {
    const user = await setup()
    await user.click(screen.getByRole('tab', { name: 'Seu risco' }))
    expect(screen.getByRole('tab', { name: 'Seu risco' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: 'Seu risco' })).toBeInTheDocument()
    expect(screen.queryByTestId('resultados-hero')).toBeNull()
    expect(screen.queryByTestId('mini-dre')).toBeNull()
    await user.click(screen.getByRole('tab', { name: 'Resultado' }))
    expect(screen.getByTestId('resultados-hero')).toBeInTheDocument()
  })

  it('the arrow keys (and Home/End) move between the tabs and take the focus along', async () => {
    const user = await setup()
    screen.getByRole('tab', { name: 'Resultado' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Seu risco' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Seu risco' })).toHaveFocus()
    await user.keyboard('{ArrowRight}') // wraps around
    expect(screen.getByRole('tab', { name: 'Resultado' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Seu risco' })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('tab', { name: 'Resultado' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Seu risco' })).toHaveAttribute('aria-selected', 'true')
  })

  it('#/resultados?analise=1 lands on the Resultado tab with the analysis open', async () => {
    setHash('#/resultados?analise=1')
    await setup()
    expect(screen.getByRole('tab', { name: 'Resultado' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('dialog', { name: /Análise da meta/ })).toBeInTheDocument()
  })

  it('a hashchange with ?analise=1 while on "Seu risco" brings the Resultado tab back and opens the analysis', async () => {
    const user = await setup()
    await user.click(screen.getByRole('tab', { name: 'Seu risco' }))
    act(() => {
      setHash('#/resultados?analise=1')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(await screen.findByRole('dialog', { name: /Análise da meta/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Resultado' })).toHaveAttribute('aria-selected', 'true')
  })
})
