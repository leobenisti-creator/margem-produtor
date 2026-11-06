import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installFakeIO, mockReducedMotion, removeIO, renderInicio } from '../ui/inicio/testUtils'

// Own file: motion caches the reduced-motion preference per module, so it is set before any render.
mockReducedMotion(true)

beforeEach(() => {
  localStorage.clear()
  installFakeIO()
})
afterEach(() => removeIO())

describe('Início with prefers-reduced-motion: reduce', () => {
  it('every section renders visible content: no opacity 0 and no transforms anywhere', async () => {
    const { page } = await renderInicio()
    const sections = page.querySelectorAll('section')
    expect(sections).toHaveLength(7)
    for (const s of sections) {
      expect(s).toBeVisible()
      expect((s.textContent ?? '').trim().length).toBeGreaterThan(20)
    }
    for (const el of page.querySelectorAll<HTMLElement>('*')) {
      expect(el.style.opacity === '' || Number(el.style.opacity) === 1).toBe(true)
      expect(el.style.transform === '' || el.style.transform === 'none').toBe(true)
    }
  })

  it('tabs of screen 3 swap the page preview (arrow keys move the selection)', async () => {
    const user = userEvent.setup()
    await renderInicio()
    const s3 = within(document.getElementById('app-faz') as HTMLElement)
    const tabs = s3.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Lavoura e custos', 'Comercialização', 'Resultados financeiros'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(s3.getByRole('tabpanel')).toHaveTextContent(/custo/i)

    await user.click(tabs[1])
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(s3.getByRole('tabpanel')).toHaveTextContent(/vendas/i)

    tabs[1].focus()
    await user.keyboard('{ArrowRight}')
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[2]).toHaveFocus()
    expect(s3.getByRole('tabpanel')).not.toHaveTextContent(/ponte da margem|sensibilidade/i)
    await user.keyboard('{Home}')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('tabpanel').length).toBeGreaterThanOrEqual(1)
  })
})
