import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import type { ReactNode } from 'react'
import { Simulador } from '../pages/Simulador'
import { SAVE_DEBOUNCE_MS, StoreProvider } from '../state/StoreProvider'
import type { Action } from '../state/types'
import { mockMatchMedia, removeMatchMedia, seedState } from '../test/helpers'
import { readState, StateProbe } from '../test/storeHarness'
import { AppShell } from './AppShell'
import { Tour, resetTourProgress } from './Tour'
import { MISSING_GRACE_MS } from './tour/Balloons'

expect.extend(toHaveNoViolations)
vi.setConfig({ testTimeout: 15000 })

// jsdom has no layout: colour contrast is covered token by token in src/styles/contrast.test.ts.
const check = (el: Element) => axe(el, { rules: { 'color-contrast': { enabled: false } } })

const MT: Action[] = [{ type: 'setFob', fobId: 'sorriso' }]
const NEXT = { name: 'Próximo' }
const SKIP = { name: 'Pular tour' }

function page(route: 'simulador' | 'inicio' | 'resultados' = 'simulador'): ReactNode {
  return (
    <StoreProvider>
      <AppShell route={route}>{route === 'simulador' ? <Simulador /> : <p>outra página</p>}</AppShell>
      <StateProbe />
    </StoreProvider>
  )
}

async function boot(actions: Action[] = MT, tourSeen = false) {
  seedState(actions, tourSeen)
  const user = userEvent.setup()
  const view = render(page())
  await screen.findByTestId('state-probe')
  return { user, ...view }
}

/** Click through the welcome cards into the balloons. */
async function toBalloons(user: ReturnType<typeof userEvent.setup>) {
  for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', NEXT))
  await user.click(screen.getByRole('button', { name: 'Começar' }))
  return screen.findByRole('dialog', { name: 'Escolha a praça' })
}

beforeEach(() => {
  localStorage.clear()
  resetTourProgress()
  removeMatchMedia()
})

describe('Tour welcome cards', () => {
  it('opens on the first visit as a modal dialog with steps, Pular tour and no Voltar', async () => {
    await boot()
    const dialog = screen.getByRole('dialog', { name: 'Como o site funciona' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveTextContent('Passo 1 de 4')
    expect(dialog).toHaveTextContent('Lavoura e custos, Comercialização e Resultados financeiros')
    expect(screen.getByRole('button', SKIP)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Voltar' })).toBeNull()
  })

  it('walks the four cards (rule, storage, Salvar) and Voltar goes back', async () => {
    const { user } = await boot()
    await user.click(screen.getByRole('button', NEXT))
    expect(screen.getByRole('dialog', { name: 'Custos primeiro' })).toHaveTextContent('lavoura e os custos estão preenchidos')
    await user.click(screen.getByRole('button', NEXT))
    expect(screen.getByRole('dialog', { name: /neste navegador/ })).toHaveTextContent('Não há conta')
    await user.click(screen.getByRole('button', NEXT))
    expect(screen.getByRole('dialog', { name: /Vendas e operações/ })).toHaveTextContent('depois de clicar em Salvar')
    expect(screen.queryByRole('button', NEXT)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByRole('dialog', { name: /neste navegador/ })).toBeInTheDocument()
  })

  it('moves focus to the primary button and traps Tab inside the dialog', async () => {
    const { user } = await boot()
    const dialog = screen.getByRole('dialog')
    await waitFor(() => expect(screen.getByRole('button', NEXT)).toHaveFocus())
    for (let i = 0; i < 8; i++) {
      await user.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
    for (let i = 0; i < 4; i++) {
      await user.tab({ shift: true })
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
  })

  it('Esc skips: tourDone, nothing left on screen', async () => {
    const { user } = await boot()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(readState().tourSeen).toBe(true)
  })

  it('Pular tour skips and the tour does not come back after a remount', async () => {
    const { user, unmount } = await boot()
    await user.click(screen.getByRole('button', SKIP))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(readState().tourSeen).toBe(true)
    await waitFor(() => expect(localStorage.getItem('margem:v3')).toContain('"tourSeen":true'), {
      timeout: SAVE_DEBOUNCE_MS * 5,
    })
    unmount()
    render(page())
    await screen.findByTestId('page-simulador')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('still works when localStorage is blocked (once per session)', async () => {
    seedState(MT, false)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const user = userEvent.setup()
    render(page())
    await screen.findByTestId('page-simulador')
    await user.click(screen.getByRole('button', SKIP))
    expect(screen.queryByRole('dialog')).toBeNull()
    vi.restoreAllMocks()
  })

  it('returns focus to <main> when it closes', async () => {
    const { user } = await boot()
    await user.click(screen.getByRole('button', SKIP))
    expect(screen.getByRole('main')).toHaveFocus()
  })
})

describe('Tour balloons on the real page', () => {
  it('visits praça, área, produtividade, custo and the Próximo link, in order, then finishes', async () => {
    const { user } = await boot()
    expect(await toBalloons(user)).toHaveAttribute('aria-modal', 'false')
    const titles = ['Escolha a praça', 'Informe a área plantada', 'Informe a produtividade', 'Informe o custo por hectare', 'Próxima página']
    for (let i = 0; i < titles.length; i++) {
      const dialog = screen.getByRole('dialog', { name: titles[i] })
      expect(dialog).toHaveTextContent(`Passo ${i + 1} de 5`)
      expect(screen.getByRole('button', i < 4 ? NEXT : { name: 'Concluir' })).toHaveFocus()
      expect(screen.getByTestId('tour-highlight')).toHaveClass('pointer-events-none')
      if (i < 4) await user.click(screen.getByRole('button', NEXT))
    }
    await user.click(screen.getByRole('button', { name: 'Concluir' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByTestId('tour-highlight')).toBeNull()
    expect(readState().tourSeen).toBe(true)
  })

  it('never mentions regional averages or IMEA, in any balloon', async () => {
    const { user } = await boot()
    await toBalloons(user)
    for (let i = 0; i < 5; i++) {
      expect(screen.getByRole('dialog')).not.toHaveTextContent(/média|IMEA|Usar a/i)
      if (i < 4) await user.click(screen.getByRole('button', NEXT))
    }
  })

  it('does not block the highlighted field: the visitor types while the balloon is open', async () => {
    const { user } = await boot()
    await toBalloons(user)
    await user.click(screen.getByRole('button', NEXT))
    const area = screen.getByLabelText('Área plantada')
    await user.clear(area)
    await user.type(area, '1234')
    expect(readState().inputs.areaHa).toBe(1234)
    expect(screen.getByRole('dialog', { name: 'Informe a área plantada' })).toBeInTheDocument()
  })

  it('Voltar goes back one step', async () => {
    const { user } = await boot()
    await toBalloons(user)
    expect(screen.queryByRole('button', { name: 'Voltar' })).toBeNull()
    await user.click(screen.getByRole('button', NEXT))
    await user.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByRole('dialog', { name: 'Escolha a praça' })).toBeInTheDocument()
  })

  it('Tab flows from the balloon into its field and Shift+Tab back', async () => {
    const { user } = await boot()
    await toBalloons(user)
    expect(screen.getByRole('button', NEXT)).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText('Praça')).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', NEXT)).toHaveFocus()
  })

  it('Esc skips from the balloons: tourDone and the focus goes to <main>', async () => {
    const { user } = await boot()
    await toBalloons(user)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(readState().tourSeen).toBe(true)
    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('Pular tour from a balloon is final, also after a remount', async () => {
    const { user, unmount } = await boot()
    await toBalloons(user)
    await user.click(screen.getByRole('button', SKIP))
    expect(readState().tourSeen).toBe(true)
    await waitFor(() => expect(localStorage.getItem('margem:v3')).toContain('"tourSeen":true'), {
      timeout: SAVE_DEBOUNCE_MS * 5,
    })
    unmount()
    render(page())
    await screen.findByTestId('page-simulador')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('announces each step in a polite status region', async () => {
    const { user } = await boot()
    await toBalloons(user)
    expect(screen.getByText('Passo 1 de 5: Escolha a praça', { selector: '[aria-live="polite"]' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', NEXT))
    expect(screen.getByText('Passo 2 de 5: Informe a área plantada', { selector: '[aria-live="polite"]' })).toBeInTheDocument()
  })

  it('scrolls the target into view, smoothly only without reduced motion', async () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    try {
      mockMatchMedia(false)
      const { user, unmount } = await boot()
      await toBalloons(user)
      expect(scroll).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: 'smooth' }))
      unmount()
      scroll.mockClear()
      resetTourProgress()
      window.matchMedia = ((q: string) => ({
        matches: q.includes('reduce'),
        media: q,
        addEventListener() {},
        removeEventListener() {},
      })) as unknown as typeof window.matchMedia
      seedState(MT, false)
      const u2 = userEvent.setup()
      render(page())
      await screen.findByTestId('state-probe')
      await toBalloons(u2)
      expect(scroll).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: 'auto' }))
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    }
  })
})

describe('Tour with missing anchors', () => {
  function Fake({ anchors }: { anchors: string[] }) {
    return (
      <StoreProvider>
        <main tabIndex={-1}>
          {anchors.map((a) =>
            a === 'proximo' ? (
              <a key={a} data-tour={a} href="#/comercializacao">
                seguir
              </a>
            ) : (
              <div key={a} data-tour={a}>
                <input aria-label={a} />
              </div>
            ),
          )}
          <Tour />
        </main>
        <StateProbe />
      </StoreProvider>
    )
  }

  it('skips the steps whose anchor is absent (and counts only the ones shown)', async () => {
    seedState([], false)
    const user = userEvent.setup()
    render(<Fake anchors={['praca', 'produtividade', 'proximo']} />)
    await screen.findByTestId('state-probe')
    await toBalloons(user)
    await user.click(screen.getByRole('button', NEXT))
    const dialog = screen.getByRole('dialog', { name: 'Informe a produtividade' })
    expect(dialog).toHaveTextContent('Passo 2 de 3')
    await user.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByRole('dialog', { name: 'Escolha a praça' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', NEXT))
    await user.click(screen.getByRole('button', NEXT))
    expect(screen.getByRole('dialog', { name: 'Próxima página' })).toHaveTextContent('Passo 3 de 3')
  })

  it('starts at the first step that exists when the first anchors are missing', async () => {
    seedState([], false)
    const user = userEvent.setup()
    render(<Fake anchors={['custo', 'proximo']} />)
    await screen.findByTestId('state-probe')
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', NEXT))
    await user.click(screen.getByRole('button', { name: 'Começar' }))
    expect(await screen.findByRole('dialog', { name: 'Informe o custo por hectare' }, { timeout: MISSING_GRACE_MS * 4 })).toHaveTextContent(
      'Passo 1 de 2',
    )
  })

  it('finishes (tourDone) when no anchor exists at all', async () => {
    seedState([], false)
    const user = userEvent.setup()
    render(<Fake anchors={[]} />)
    await screen.findByTestId('state-probe')
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', NEXT))
    await user.click(screen.getByRole('button', { name: 'Começar' }))
    await waitFor(() => expect(readState().tourSeen).toBe(true), { timeout: MISSING_GRACE_MS * 4 })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Tour scope', () => {
  it('is not shown when tourSeen is already true', async () => {
    await boot(MT, true)
    await screen.findByTestId('page-simulador')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it.each(['inicio', 'resultados'] as const)('is not shown on the %s page, even on a first visit', async (route) => {
    seedState(MT, false)
    render(page(route))
    await screen.findByText('outra página')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(readState().tourSeen).toBe(false)
  })

  it('leaving Lavoura e custos mid-tour pauses it (not done) and coming back resumes at the same balloon', async () => {
    const { user, rerender } = await boot()
    await toBalloons(user)
    await user.click(screen.getByRole('button', NEXT))
    expect(screen.getByRole('dialog', { name: 'Informe a área plantada' })).toBeInTheDocument()
    rerender(page('resultados'))
    await screen.findByText('outra página')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(readState().tourSeen).toBe(false)
    rerender(page('simulador'))
    expect(await screen.findByRole('dialog', { name: 'Informe a área plantada' })).toBeInTheDocument()
  })
})

describe('Tour accessibility', () => {
  it('has no axe violations in the welcome cards', async () => {
    const { container } = await boot()
    expect(await check(container)).toHaveNoViolations()
  })

  it('has no axe violations in the balloons, on a step and on the last one', async () => {
    const { user, container } = await boot()
    await toBalloons(user)
    expect(await check(container)).toHaveNoViolations()
    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole('button', NEXT))
      if (i === 1) expect(await check(container)).toHaveNoViolations()
    }
    expect(await check(container)).toHaveNoViolations()
  })
})
