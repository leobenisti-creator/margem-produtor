import { screen, within } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { renderWithStore } from '../test/storeHarness'
import { CostItemRow } from './CostItemRow'

// Heavy whole-panel test: under CPU load (default workers) it can pass 5 s.
vi.setConfig({ testTimeout: 15000 })

expect.extend(toHaveNoViolations)
beforeEach(() => localStorage.clear())

describe('DetailPanel', () => {
  it('opens from "Detalhar ›", traps Tab and Shift+Tab, Esc closes and returns focus', async () => {
    const { user } = await renderWithStore(<CostItemRow group="fertilizantes" itemId="adubacao.macro" />)
    const trigger = screen.getByRole('button', { name: 'Detalhar Macronutrientes' })
    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Detalhar Macronutrientes' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog.contains(document.activeElement)).toBe(true)
    for (let i = 0; i < 25; i++) {
      await user.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
    for (let i = 0; i < 5; i++) {
      await user.tab({ shift: true })
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('Enter on the trigger opens it; the Fechar button closes it', async () => {
    const { user } = await renderWithStore(<CostItemRow group="defensivos" itemId="defensivos.herbicida" />)
    const trigger = screen.getByRole('button', { name: 'Detalhar Herbicidas' })
    trigger.focus()
    await user.keyboard('{Enter}')
    const dialog = screen.getByRole('dialog', { name: 'Detalhar Herbicidas' })
    expect(within(dialog).getAllByTestId('product-row')).toHaveLength(1)
    await user.click(within(dialog).getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('has no axe violations while open', async () => {
    const { user, container } = await renderWithStore(<CostItemRow group="fertilizantes" itemId="adubacao.macro" />)
    await user.click(screen.getByRole('button', { name: 'Detalhar Macronutrientes' }))
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })
})
