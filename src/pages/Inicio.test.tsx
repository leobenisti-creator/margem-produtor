import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import {
  fireIntersection,
  installFakeIO,
  removeIO,
  renderInicio,
} from '../ui/inicio/testUtils'
import { LEGACY_EXAMPLE, seedState } from '../test/helpers'

// The screens have their own test files (Capa, MercadoHoje, OQueOAppFaz, ComoFunciona, ContaECores, SuaMeta,
// ParaQuemFaq, the shell and the journey dialogs). This file is the page-level contract.

// Mounts whole pages (axe/keyboard): under a full parallel run a test can pass the default 5 s.
vi.setConfig({ testTimeout: 15000 })

expect.extend(toHaveNoViolations)

const IDS = ['capa', 'mercado', 'app-faz', 'como-funciona', 'conta', 'meta', 'duvidas']
const TITLES = [
  'Capa',
  'Mercado de hoje',
  'O que o app faz',
  'Como funciona',
  'A conta aberta',
  'Sua meta',
  'Para quem',
]

let scrolled: Element[] = []
beforeEach(() => {
  localStorage.clear()
  // Pre-FOB example farm (Centro-Sul at the Paranaguá base); tour still unseen like a first visit.
  seedState(LEGACY_EXAMPLE, false)
  installFakeIO()
  scrolled = []
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this)
  }
})
afterEach(() => {
  removeIO()
})

const section = (id: string) => document.getElementById(id) as HTMLElement
const CTA = 'Descobrir minha margem →'

describe('Início: 7 telas', () => {
  it('renders the 7 sections, in order, and starts straight at the capa', async () => {
    const { page } = await renderInicio()
    expect([...page.querySelectorAll('section')].map((s) => s.id)).toEqual(IDS)
    expect(screen.getByRole('heading', { level: 1, name: /Saiba quanto sobra/ })).toBeInTheDocument()
    expect(screen.queryByText('Sua safra')).toBeNull()
    for (const name of [
      'O preço da soja mudou hoje. E a sua margem?',
      'Do preço da bolsa até o dinheiro que sobra',
      'Como funciona em três passos',
      'Diga quanto quer ganhar. O app diz o que falta.',
      'Feito para quem decide a venda da safra',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
  })

  it('rail shows 01/07 and follows the section reported by IntersectionObserver', async () => {
    await renderInicio()
    const rail = screen.getByRole('navigation', { name: 'Telas do Início' })
    expect(within(rail).getByText('01/07')).toBeInTheDocument()
    expect(within(rail).getByRole('button', { name: 'Ir para tela 1: Capa' })).toHaveAttribute('aria-current', 'step')
    fireIntersection(section('app-faz'))
    expect(within(rail).getByText('03/07')).toBeInTheDocument()
    expect(within(rail).getByRole('button', { name: 'Ir para tela 3: O que o app faz' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(within(rail).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(
      TITLES.map((t, i) => `Ir para tela ${i + 1}: ${t}`),
    )
  })

  it('clicking a rail dot scrolls that section into view and moves focus to its heading', async () => {
    const user = userEvent.setup()
    await renderInicio()
    await user.click(screen.getByRole('button', { name: 'Ir para tela 5: A conta aberta' }))
    expect(scrolled).toContain(section('conta'))
    const heading = within(section('conta')).getByRole('heading', { level: 2 })
    expect(heading).toHaveAttribute('tabindex', '-1')
    expect(heading).toHaveFocus()
  })

  it('the only action is the button "Descobrir minha margem →" (capa, fixed bar after the capa, last screen)', async () => {
    const { page } = await renderInicio()
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
    expect(within(bar).getByRole('img', { name: 'Hedgepoint' })).toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: CTA })).toBeInTheDocument()
    expect(within(section('capa')).getByRole('button', { name: CTA })).toBeInTheDocument()
    expect(within(section('duvidas')).getByRole('button', { name: CTA })).toBeInTheDocument()
    // no link to an internal page anywhere in the screens, and no "Ver exemplo"
    expect(page.querySelectorAll('a[href^="#/"]')).toHaveLength(0)
    expect(screen.queryByText(/Ver exemplo/)).toBeNull()
  })

  it('the bar is gone on the last screen', async () => {
    await renderInicio()
    await waitFor(
      () => {
        fireIntersection(section('capa'), false)
        fireIntersection(section('mercado'))
        expect(screen.getByTestId('cta-bar')).toBeInTheDocument()
      },
      { timeout: 5000 },
    )
    fireIntersection(section('duvidas'))
    await waitFor(() => expect(screen.queryByTestId('cta-bar')).toBeNull(), { timeout: 5000 })
  })

  it('has no FAQ and no legal footer', async () => {
    const { page } = await renderInicio()
    const text = page.textContent ?? ''
    expect(text).not.toMatch(/HEDGEPOINT · Material indicativo/)
    expect(text).not.toMatch(/Preciso detalhar o custo\?|Meus dados ficam salvos\?|É recomendação\?/)
    expect(text).not.toMatch(/salvos na sua conta/)
  })

  it('screen-3 tabs are at least 44 px tall below md', async () => {
    await renderInicio()
    const tabs = within(section('app-faz')).getAllByRole('tab')
    expect(tabs).toHaveLength(3)
    for (const t of tabs) {
      expect(t).toHaveClass('min-h-[44px]')
    }
  })

  it('every image has alt text (or is decorative) and width/height; only the capa loads eagerly', async () => {
    const { page } = await renderInicio()
    const imgs = [...page.querySelectorAll('img')]
    expect(imgs.length).toBeGreaterThanOrEqual(5)
    for (const img of imgs) {
      const decorative = img.getAttribute('alt') === '' && img.getAttribute('aria-hidden') === 'true'
      if (!decorative && !/Hedgepoint/.test(img.getAttribute('alt') ?? '')) {
        expect((img.getAttribute('alt') ?? '').trim().length).toBeGreaterThan(10)
      }
      if (img.getAttribute('src')?.match(/photos\//)) {
        expect(Number(img.getAttribute('width'))).toBeGreaterThan(0)
        expect(Number(img.getAttribute('height'))).toBeGreaterThan(0)
        expect(img.getAttribute('src')).toMatch(/photos\/[a-z0-9]+\.jpg$/)
      }
    }
    const capaImg = section('capa').querySelector('img') as HTMLImageElement
    expect(capaImg).not.toHaveAttribute('loading', 'lazy')
    expect(capaImg).toHaveAttribute('fetchpriority', 'high')
  })

  it('the landing never changes what is saved (reading it, scrolling and opening the button card)', async () => {
    const user = userEvent.setup()
    const before = localStorage.getItem('margem:v3')
    expect(before).not.toBeNull()
    await renderInicio()
    fireIntersection(section('capa'), false)
    fireIntersection(section('mercado'))
    await user.click(within(section('capa')).getByRole('button', { name: CTA }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    // the store autosaves on mount, but with the same content; nothing else is written
    expect(localStorage.getItem('margem:v3')).toBe(before)
    expect(Object.keys(localStorage).sort()).toEqual(['margem:v3'])
  })

  it('no invented testimonials or statistics', async () => {
    const { page } = await renderInicio()
    const text = page.textContent ?? ''
    expect(text).not.toMatch(/depoimento/i)
    expect(text).not.toMatch(/dos produtores/i)
    expect(text).not.toMatch(/\b9\d%/)
    expect(text).not.toMatch(/mil produtores|clientes satisfeitos/i)
  })

  it('no invented testimonials or statistics in the source texts of the screens', () => {
    const dir = join(__dirname, '..', 'ui', 'inicio')
    const sources = readdirSync(dir)
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f) && !/testUtils|telasTestKit/.test(f))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n')
    expect(sources).not.toMatch(/depoimento/i)
    expect(sources).not.toMatch(/dos produtores/i)
    expect(sources).not.toMatch(/\b9\d%/)
    expect(sources).not.toMatch(/mil produtores|clientes satisfeitos/i)
  })

  it('has no axe violations (rail and CTA bar shown)', async () => {
    const { container } = await renderInicio()
    fireIntersection(section('capa'), false)
    fireIntersection(section('mercado'))
    const results = await axe(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(results).toHaveNoViolations()
  })

  it('does not render the market ticker and clips horizontal overflow', async () => {
    const { page } = await renderInicio()
    expect(screen.queryByRole('region', { name: /Cotações de/ })).toBeNull()
    expect(page.className).toMatch(/overflow-x-clip/)
  })
})
