import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import { LEGACY_EXAMPLE, mockMatchMedia, seedState } from './test/helpers'

beforeEach(() => {
  localStorage.clear()
  window.location.hash = ''
})

describe('App', () => {
  it('renders the legal footer', async () => {
    render(<App />)
    expect(
      await screen.findByText('Material educacional e indicativo. Não constitui recomendação.'),
    ).toBeInTheDocument()
  })

  it('defaults to the inicio page', async () => {
    render(<App />)
    const page = await screen.findByTestId('page-inicio')
    // The capa title is the page h1 (the "Sua safra" screen is gone).
    expect(
      within(page).getByRole('heading', { level: 1, name: 'Saiba quanto sobra por saca antes de vender.' }),
    ).toBeInTheDocument()
    // The only action is a button that opens the "where to go" card (it never navigates by itself).
    const ctas = within(page).getAllByRole('button', { name: 'Descobrir minha margem →' })
    expect(ctas.length).toBeGreaterThanOrEqual(2)
    for (const b of ctas) expect(b).toHaveAttribute('aria-haspopup', 'dialog')
  })

  it('hides the market ticker on #/inicio and shows it on the other routes', async () => {
    seedState(LEGACY_EXAMPLE)
    render(<App />)
    await screen.findByTestId('page-inicio')
    expect(screen.queryByRole('region', { name: /Cotações de/ })).toBeNull()
    act(() => {
      window.location.hash = '#/simulador'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await screen.findByTestId('page-simulador')
    expect(screen.getByRole('region', { name: 'Cotações de Soja' })).toBeInTheDocument()
    act(() => {
      window.location.hash = '#/comercializacao'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await screen.findByTestId('page-comercializacao')
    expect(screen.getByRole('region', { name: 'Cotações de Soja' })).toBeInTheDocument()
  })

  it('keeps the page title as the h1 on Lavoura e custos, Comercialização and Resultados financeiros', async () => {
    seedState(LEGACY_EXAMPLE)
    window.location.hash = '#/simulador'
    render(<App />)
    await screen.findByTestId('page-simulador')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /^Lavoura e custos · Soja · /,
    )
    act(() => {
      window.location.hash = '#/resultados'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await screen.findByTestId('page-resultados')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /^Resultados financeiros · Soja · /,
    )
  })

  it('shows the first-visit tour on the Simulador, not on Início', async () => {
    render(<App />)
    await screen.findByTestId('page-inicio')
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => {
      window.location.hash = '#/simulador'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await screen.findByTestId('page-simulador')
    expect(await screen.findByRole('dialog', { name: 'Como o site funciona' })).toBeInTheDocument()
  })

  it('the top bar marks the current route', async () => {
    window.location.hash = '#/comercializacao'
    seedState(LEGACY_EXAMPLE)
    render(<App />)
    await screen.findByTestId('page-comercializacao')
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(within(nav).getByRole('link', { name: 'Comercialização' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('routes by hash and reacts to hashchange', async () => {
    window.location.hash = '#/comercializacao'
    render(<App />)
    expect(await screen.findByTestId('page-comercializacao')).toBeInTheDocument()
    act(() => {
      window.location.hash = '#/simulador'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(await screen.findByTestId('page-simulador')).toBeInTheDocument()
  })

  it('unknown hash falls back to inicio', async () => {
    window.location.hash = '#/nada'
    render(<App />)
    expect(await screen.findByTestId('page-inicio')).toBeInTheDocument()
  })

  it('normalises an empty hash to #/inicio without adding a history entry', async () => {
    const replace = vi.spyOn(window.history, 'replaceState')
    const push = vi.spyOn(window.history, 'pushState')
    const before = window.history.length
    render(<App />)
    await screen.findByTestId('page-inicio')
    expect(window.location.hash).toBe('#/inicio')
    expect(window.location.href).toMatch(/#\/inicio$/)
    expect(replace).toHaveBeenCalledWith(null, '', '#/inicio')
    expect(push).not.toHaveBeenCalled()
    expect(window.history.length).toBe(before)
    replace.mockRestore()
    push.mockRestore()
  })

  it('does not crash when history.replaceState throws', async () => {
    const replace = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    render(<App />)
    expect(await screen.findByTestId('page-inicio')).toBeInTheDocument()
    expect(replace).toHaveBeenCalled()
    replace.mockRestore()
  })

  it('normalises an unknown hash to #/inicio', async () => {
    window.location.hash = '#/nada'
    render(<App />)
    await screen.findByTestId('page-inicio')
    expect(window.location.hash).toBe('#/inicio')
  })

  it('the matrix legend "analisar" button opens the target analysis in place (no navigation)', async () => {
    seedState([...LEGACY_EXAMPLE, { type: 'setTargetMargin', value: 0.15 }])
    mockMatchMedia(true)
    window.location.hash = '#/resultados'
    const user = userEvent.setup()
    render(<App />)
    await screen.findByTestId('page-resultados')
    await user.click(screen.getByRole('button', { name: /Meta: 15% · analisar/ }))
    expect(await screen.findByRole('dialog', { name: 'Análise da meta de margem' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/resultados')
  })

  it('keeps the query string of a canonical route (?analise=1 is read by the Resultados)', async () => {
    window.location.hash = '#/resultados?analise=1'
    const replace = vi.spyOn(window.history, 'replaceState')
    render(<App />)
    await screen.findByTestId('page-resultados')
    expect(window.location.hash).toBe('#/resultados?analise=1')
    expect(replace).not.toHaveBeenCalled()
    act(() => {
      window.location.hash = '#/resultados?vendas=1'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(window.location.hash).toBe('#/resultados?vendas=1')
    expect(replace).not.toHaveBeenCalled()
    replace.mockRestore()
  })

  it('the legacy #/comercializacao?analise=1 opens the Resultados and ends at #/resultados?analise=1', async () => {
    seedState(LEGACY_EXAMPLE)
    window.location.hash = '#/comercializacao?analise=1'
    render(<App />)
    expect(await screen.findByTestId('page-resultados')).toBeInTheDocument()
    expect(screen.queryByTestId('page-comercializacao')).toBeNull()
    await waitFor(() => expect(window.location.hash.startsWith('#/resultados?analise=1')).toBe(true))
  })

  it('an unknown route with a query is still normalised to #/inicio', async () => {
    window.location.hash = '#/nada?analise=1'
    render(<App />)
    await screen.findByTestId('page-inicio')
    expect(window.location.hash).toBe('#/inicio')
  })

  it('#/preco opens "De onde vem o preço" without the ticker (read-only) and with Lavoura e custos highlighted', async () => {
    seedState(LEGACY_EXAMPLE, false)
    window.location.hash = '#/preco'
    render(<App />)
    await screen.findByTestId('page-preco')
    expect(window.location.hash).toBe('#/preco')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^De onde vem o preço · Soja · /)
    // read-only page: no ticker (no edits from an old tab overwriting the saved state)
    expect(screen.queryByRole('region', { name: 'Cotações de Soja' })).toBeNull()
    for (const name of ['Navegação principal', 'Navegação inferior']) {
      const nav = screen.getByRole('navigation', { name })
      for (const a of within(nav).getAllByRole('link')) {
        if (a.textContent?.includes('Lavoura e custos')) expect(a).toHaveAttribute('aria-current', 'page')
        else expect(a).not.toHaveAttribute('aria-current')
      }
      expect(within(nav).getAllByRole('link').some((a) => a.getAttribute('aria-current') === 'page')).toBe(true)
    }
    // no tour on this page, even on a first visit
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('leaves a valid hash alone', async () => {
    window.location.hash = '#/comercializacao'
    const replace = vi.spyOn(window.history, 'replaceState')
    render(<App />)
    await screen.findByTestId('page-comercializacao')
    expect(window.location.hash).toBe('#/comercializacao')
    expect(replace).not.toHaveBeenCalled()
    replace.mockRestore()
  })
})
