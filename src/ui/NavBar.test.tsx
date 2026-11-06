import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { GATES_KEY } from '../state/gates'
import { seedState } from '../test/helpers'
import { StoreProvider, useStore } from '../state/StoreProvider'
import { NavBar } from './NavBar'
import { BottomNav } from './BottomNav'
import type { Route } from './routes'

expect.extend(toHaveNoViolations)

function Probe() {
  const { state } = useStore()
  return (
    <output data-testid="probe">
      {state.crop}|{state.currency}|{state.areaUnit}
    </output>
  )
}

async function setup(route: Route = 'simulador') {
  const user = userEvent.setup()
  const view = render(
    <StoreProvider>
      <NavBar route={route} />
      <Probe />
    </StoreProvider>,
  )
  await screen.findByTestId('probe')
  return { user, ...view }
}

beforeEach(() => {
  localStorage.clear()
})

describe('NavBar', () => {
  it('shows the provisional Hedgepoint mark with an accessible name', async () => {
    await setup()
    const logo = screen.getByRole('img', { name: 'Hedgepoint' })
    expect(logo).toHaveTextContent('HEDGEPOINT')
    // the logo takes the producer back to the Início
    expect(logo.closest('a')).toHaveAttribute('href', '#/inicio')
  })

  it('lays the bar out as logo + theme switch at the left, the pages in the middle, crop and currency at the right end', async () => {
    await setup('comercializacao')
    const banner = screen.getByRole('banner')
    const logo = within(banner).getByRole('img', { name: 'Hedgepoint' })
    const theme = within(banner).getByTestId('theme-toggle')
    const nav = within(banner).getByRole('navigation', { name: 'Navegação principal' })
    const controls = within(banner).getByTestId('shell-controls')
    const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(before(logo, theme)).toBe(true)
    expect(before(theme, nav)).toBe(true)
    expect(before(nav, controls)).toBe(true)
    // logo and switch share the left cell, the controls sit alone in the right one
    expect(logo.closest('a')!.parentElement).toBe(theme.parentElement)
    expect(controls.parentElement).not.toBe(theme.parentElement)
    expect(banner.firstElementChild).toHaveClass('md:grid-cols-[1fr_auto_1fr]')
  })

  it('has no "Em breve" menu and no "Copiar link do app" button any more', async () => {
    await setup('comercializacao')
    const banner = screen.getByRole('banner')
    expect(within(banner).queryByRole('button', { name: /Em breve/ })).toBeNull()
    expect(within(banner).queryByRole('button', { name: 'Copiar link do app' })).toBeNull()
    expect(banner).not.toHaveTextContent(/Em breve|Copiar link/)
  })

  it('inside the app it has exactly three tabs (no Início), with aria-current on the active route only', async () => {
    await setup('comercializacao')
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((a) => a.textContent)).toEqual(['1Lavoura e custos', '2Comercialização', '3Resultados financeiros'])
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['#/simulador', '#/comercializacao', '#/resultados'])
    expect(within(nav).getByRole('link', { name: 'Comercialização' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Lavoura e custos' })).not.toHaveAttribute('aria-current')
    expect(within(nav).queryByRole('link', { name: 'Início' })).toBeNull()
  })

  it('on the Início the four tabs show, with Início current; leaving it drops Início from the bar', async () => {
    const { rerender } = await setup('inicio')
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Início',
      '1Lavoura e custos',
      '2Comercialização',
      '3Resultados financeiros',
    ])
    expect(within(nav).getByRole('link', { name: 'Início' })).toHaveAttribute('aria-current', 'page')
    rerender(
      <StoreProvider>
        <NavBar route="simulador" />
        <Probe />
      </StoreProvider>,
    )
    expect(
      within(screen.getByRole('navigation', { name: 'Navegação principal' })).queryByRole('link', { name: 'Início' }),
    ).toBeNull()
  })

  it('keeps the crop and currency controls working, compact', async () => {
    const { user } = await setup()
    const banner = screen.getByRole('banner')
    expect(screen.getByTestId('probe')).toHaveTextContent('soja|BRL|scHa')
    const crop = within(banner).getByRole('radiogroup', { name: 'Cultura' })
    expect(within(crop).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Soja', 'Milho'])
    await user.click(within(banner).getByRole('radio', { name: 'Milho' }))
    await user.click(within(banner).getByRole('radio', { name: 'US$' }))
    expect(screen.getByTestId('probe')).toHaveTextContent('milho|USD|scHa')
    expect(within(banner).getByRole('radiogroup', { name: 'Moeda' })).toBeInTheDocument()
    expect(within(banner).queryByRole('radiogroup', { name: 'Unidade de área' })).toBeNull()
  })

  it('Tab follows the visual order: logo, theme switch, the pages, then the controls', async () => {
    const { user } = await setup('comercializacao')
    const order = [
      screen.getByRole('link', { name: 'Hedgepoint, ir ao Início' }),
      screen.getByRole('button', { name: 'Mudar para o tema claro' }),
      screen.getByRole('link', { name: 'Lavoura e custos' }),
      screen.getByRole('link', { name: 'Comercialização' }),
      screen.getByRole('link', { name: 'Resultados financeiros' }),
      screen.getByRole('radio', { name: 'Soja' }),
      screen.getByRole('radio', { name: 'R$' }),
    ]
    for (const el of order) {
      await user.tab()
      expect(el).toHaveFocus()
    }
  })

  it('has no axe violations', async () => {
    const { container } = await setup()
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })
})

function seedFilled() {
  seedState([
    { type: 'setInput', key: 'areaHa', value: 800 },
    { type: 'setInput', key: 'yieldScHa', value: 58 },
    { type: 'setInput', key: 'costPerHaBrl', value: 4800 },
  ])
}

describe('step numbers and the Comercialização/Resultados locks', () => {
  afterEach(() => localStorage.clear())

  it('numbers the three journey pages 1-3, in both bars (Início is only on the Início itself)', async () => {
    render(
      <StoreProvider>
        <NavBar route="comercializacao" />
        <BottomNav route="comercializacao" />
      </StoreProvider>,
    )
    await screen.findByRole('navigation', { name: 'Navegação inferior' })
    for (const name of ['Navegação principal', 'Navegação inferior']) {
      const links = within(screen.getByRole('navigation', { name })).getAllByRole('link')
      expect(links.map((a) => a.textContent?.[0])).toEqual(['1', '2', '3'])
      expect(links[1]).toHaveAttribute('aria-current', 'page')
    }
  })

  it.each(['off', null])('is never locked when gates are %s (dev default)', async (flag) => {
    if (flag) localStorage.setItem(GATES_KEY, flag)
    await setup('resultados')
    render(
      <StoreProvider>
        <BottomNav route="resultados" />
      </StoreProvider>,
    )
    await screen.findByRole('navigation', { name: 'Navegação inferior' })
    for (const a of screen.getAllByRole('link', { name: 'Resultados financeiros' })) {
      expect(a).not.toHaveAttribute('aria-disabled')
      expect(a).not.toHaveAttribute('aria-describedby')
    }
    expect(screen.queryByText(/Falta:/)).toBeNull()
  })

  it('desktop: locked tab has a padlock, aria-disabled, visible reason, describedby, and does not navigate', async () => {
    localStorage.setItem(GATES_KEY, 'on')
    window.location.hash = '#/simulador'
    const { user } = await setup('simulador')
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(within(nav).getAllByText('Falta: área, produtividade, custo por hectare')).toHaveLength(2)
    for (const name of ['Comercialização', 'Resultados financeiros']) {
      const tab = within(nav).getByRole('link', { name })
      expect(tab).toHaveAttribute('aria-disabled', 'true')
      expect(tab.querySelector('svg.lucide-lock')).not.toBeNull()
      const reason = document.getElementById(tab.getAttribute('aria-describedby') ?? '')
      expect(reason).toHaveTextContent('Falta: área, produtividade, custo por hectare')
      expect(reason).toBeVisible()
      await user.click(tab)
      tab.focus()
      await user.keyboard('{Enter}')
      expect(window.location.hash).toBe('#/simulador')
    }
    // Lavoura e custos is never locked (and Início is not in the bar inside the app)
    expect(within(nav).getByRole('link', { name: 'Lavoura e custos' })).not.toHaveAttribute('aria-disabled')
    expect(within(nav).queryByRole('link', { name: 'Início' })).toBeNull()
  })

  it('desktop: keeps the locked tab focusable in the tab order', async () => {
    localStorage.setItem(GATES_KEY, 'on')
    const { user } = await setup('inicio')
    // the logo link first (the theme switch is disabled on the Início, so it is skipped), then the four tabs
    for (const name of ['Hedgepoint, ir ao Início', 'Início', 'Lavoura e custos', 'Comercialização', 'Resultados financeiros']) {
      await user.tab()
      expect(screen.getByRole('link', { name })).toHaveFocus()
    }
  })

  it('the locked tab stays current on #/resultados', async () => {
    localStorage.setItem(GATES_KEY, 'on')
    await setup('resultados')
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    const tab = within(nav).getByRole('link', { name: 'Resultados financeiros' })
    expect(tab).toHaveAttribute('aria-current', 'page')
    expect(tab).toHaveAttribute('aria-disabled', 'true')
  })

  it('phone: the reason is a visible caption above the tabs, wired with aria-describedby; click does not navigate', async () => {
    localStorage.setItem(GATES_KEY, 'on')
    window.location.hash = '#/simulador'
    const user = userEvent.setup()
    render(
      <StoreProvider>
        <BottomNav route="simulador" />
      </StoreProvider>,
    )
    const nav = await screen.findByRole('navigation', { name: 'Navegação inferior' })
    for (const name of ['Comercialização', 'Resultados financeiros']) {
      const tab = within(nav).getByRole('link', { name })
      expect(tab).toHaveAttribute('aria-disabled', 'true')
      expect(tab.querySelector('svg.lucide-lock')).not.toBeNull()
      const caption = document.getElementById(tab.getAttribute('aria-describedby') ?? '')
      expect(caption).toHaveTextContent('Comercialização e Resultados financeiros · Falta: área, produtividade, custo por hectare')
      expect(caption).toBeVisible()
      await user.click(tab)
      tab.focus()
      await user.keyboard('{Enter}')
      expect(window.location.hash).toBe('#/simulador')
    }
  })

  it('is unlocked once the farm and the cost are filled, in both bars', async () => {
    localStorage.setItem(GATES_KEY, 'on')
    seedFilled()
    await setup('simulador')
    render(
      <StoreProvider>
        <BottomNav route="simulador" />
      </StoreProvider>,
    )
    await screen.findByRole('navigation', { name: 'Navegação inferior' })
    for (const a of screen.getAllByRole('link', { name: /Comercialização|Resultados financeiros/ })) {
      expect(a).not.toHaveAttribute('aria-disabled')
    }
    expect(screen.queryByText(/Falta:/)).toBeNull()
  })

  it.each([
    ['locked', true],
    ['unlocked', false],
  ])('has no axe violations in both bars (%s)', async (_n, lock) => {
    if (lock) localStorage.setItem(GATES_KEY, 'on')
    const { container } = await setup('simulador')
    const bottom = render(
      <StoreProvider>
        <BottomNav route="simulador" />
      </StoreProvider>,
    )
    await screen.findByRole('navigation', { name: 'Navegação inferior' })
    const opts = { rules: { 'color-contrast': { enabled: false } } }
    expect(await axe(container, opts)).toHaveNoViolations()
    expect(await axe(bottom.container, opts)).toHaveNoViolations()
  })
})

describe('BottomNav', () => {
  it('lays the four destinations in four columns (no fifth-row wrap)', async () => {
    render(
      <StoreProvider>
        <BottomNav route="inicio" />
      </StoreProvider>,
    )
    const nav = await screen.findByRole('navigation', { name: 'Navegação inferior' })
    expect(nav.className).toContain('grid-cols-4')
  })

  it('renders the three pages with icons inside the app, and Início too only on the Início', async () => {
    render(
      <StoreProvider>
        <BottomNav route="simulador" />
      </StoreProvider>,
    )
    const nav = await screen.findByRole('navigation', { name: 'Navegação inferior' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((a) => a.textContent)).toEqual(['1Lavoura e custos', '2Comercialização', '3Resultados financeiros'])
    expect(nav.className).toContain('grid-cols-3')
    const sim = within(nav).getByRole('link', { name: 'Lavoura e custos' })
    expect(sim).toHaveAttribute('aria-current', 'page')
    expect(sim.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    for (const a of links) expect(a.querySelector('svg')).not.toBeNull()
    expect(within(nav).queryByRole('link', { name: 'Início' })).toBeNull()
    expect(within(nav).getByRole('link', { name: 'Comercialização' })).toHaveAttribute(
      'href',
      '#/comercializacao',
    )
    expect(within(nav).getByRole('link', { name: 'Resultados financeiros' })).toHaveAttribute('href', '#/resultados')
  })
})
