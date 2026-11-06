import { screen, waitFor, within } from '@testing-library/react'
import { fireIntersection, installFakeIO, removeIO, renderInicio } from '../ui/inicio/testUtils'
import { mockMatchMedia, removeMatchMedia } from '../test/helpers'
import { INICIO_SECTIONS } from './Inicio'

vi.setConfig({ testTimeout: 15000 })

const TITLES = [
  'Capa',
  'Mercado de hoje',
  'O que o app faz',
  'Como funciona',
  'A conta aberta',
  'Sua meta',
  'Para quem',
]

const section = (id: string) => document.getElementById(id) as HTMLElement

beforeEach(() => {
  localStorage.clear()
  installFakeIO()
})
afterEach(() => {
  removeIO()
  removeMatchMedia()
  document.documentElement.style.scrollSnapType = ''
})

describe('Início · shell (7 telas)', () => {
  it('has 7 rail points with the agreed titles and ids, starting at the capa', async () => {
    const { page } = await renderInicio()
    expect(INICIO_SECTIONS.map((s) => s.title)).toEqual(TITLES)
    expect(INICIO_SECTIONS.map((s) => s.id)).toEqual([
      'capa',
      'mercado',
      'app-faz',
      'como-funciona',
      'conta',
      'meta',
      'duvidas',
    ])
    expect(page.querySelector('section')?.id).toBe('capa')
    const rail = screen.getByRole('navigation', { name: 'Telas do Início' })
    expect(within(rail).getByText('01/07')).toBeInTheDocument()
    expect(within(rail).getAllByRole('button')).toHaveLength(7)
    TITLES.forEach((t, i) => {
      expect(within(rail).getByRole('button', { name: `Ir para tela ${i + 1}: ${t}` })).toBeInTheDocument()
    })
    expect(within(rail).getByRole('button', { name: 'Ir para tela 1: Capa' })).toHaveAttribute('aria-current', 'step')
  })

  it('has no "Sua safra" screen', async () => {
    const { page } = await renderInicio()
    expect(document.getElementById('safra')).toBeNull()
    expect(page).not.toHaveTextContent('Sua safra')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Saiba quanto sobra por saca antes de vender.')
  })

  it('shows the bar after the capa leaves the view and hides it on the last section', async () => {
    await renderInicio()
    expect(screen.queryByTestId('cta-bar')).toBeNull()
    // The observers register after the first paint: fire again until the bar shows (a single early fire could be lost under load).
    const bar = await waitFor(
      () => {
        fireIntersection(section('capa'), false)
        fireIntersection(section('mercado'))
        return screen.getByTestId('cta-bar')
      },
      { timeout: 5000 },
    )
    expect(within(bar).getByRole('button', { name: 'Descobrir minha margem →' })).toBeInTheDocument()
    fireIntersection(section('duvidas'))
    await waitFor(() => expect(screen.queryByTestId('cta-bar')).toBeNull(), { timeout: 5000 })
    fireIntersection(section('conta'))
    expect(await screen.findByTestId('cta-bar', {}, { timeout: 5000 })).toBeInTheDocument()
  })

  it('bar is phone-first: above the BottomNav, full-width button, logo only from sm', async () => {
    await renderInicio()
    // The observers register after the first paint: fire again until the bar shows (a single early fire could be lost under load).
    const bar = await waitFor(
      () => {
        fireIntersection(section('capa'), false)
        fireIntersection(section('mercado'))
        return screen.getByTestId('cta-bar')
      },
      { timeout: 5000 },
    )
    expect(bar.className).toContain('bottom-14')
    expect(bar.className).toContain('md:bottom-0')
    expect(within(bar).getByRole('button', { name: 'Descobrir minha margem →' }).className).toContain('w-full')
    expect(within(bar).getByRole('button', { name: 'Descobrir minha margem →' }).className).toContain('sm:w-auto')
    expect(within(bar).getByRole('img', { name: 'Hedgepoint' }).closest('.hidden')).not.toBeNull()
  })

  it('has exactly one internal action in the capa (no "Ver exemplo")', async () => {
    await renderInicio()
    expect(screen.queryByText('Ver exemplo')).toBeNull()
    expect(within(section('capa')).getAllByRole('button', { name: 'Descobrir minha margem →' })).toHaveLength(1)
    expect(within(section('capa')).queryAllByRole('link')).toHaveLength(0)
  })

  it('does not use CSS scroll-snap any more (the page moves screen by screen from the scroll itself)', async () => {
    mockMatchMedia(true)
    const { unmount } = await renderInicio()
    expect(document.documentElement.style.scrollSnapType).toBe('')
    unmount()
    expect(document.documentElement.style.scrollSnapType).toBe('')
  })
})
