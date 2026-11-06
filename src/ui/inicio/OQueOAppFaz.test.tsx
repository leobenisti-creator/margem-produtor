import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import type { MarketSnapshot } from '../../data/types'
import { fmtNum } from '../format'
import { OQueOAppFaz } from './OQueOAppFaz'
import { seedSnapshot } from './testUtils'
import { buildLiveExample } from './useLiveExample'

expect.extend(toHaveNoViolations)
vi.setConfig({ testTimeout: 15000 })

const view = (snapshot: MarketSnapshot = seedSnapshot()) => render(<OQueOAppFaz ex={buildLiveExample(snapshot)} />)
const panelText = () => screen.getByRole('tabpanel').textContent ?? ''

beforeEach(() => localStorage.clear())

describe('OQueOAppFaz', () => {
  it('has the title and three tabs, one per app page', () => {
    view()
    expect(screen.getByRole('heading', { level: 2, name: 'Do preço da bolsa até o dinheiro que sobra' })).toBeInTheDocument()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Lavoura e custos', 'Comercialização', 'Resultados financeiros'])
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    for (const t of tabs) expect(t).toHaveClass('min-h-[44px]')
  })

  it('arrows, Home and End move between tabs (roving tabindex)', async () => {
    const user = userEvent.setup()
    view()
    const tabs = screen.getAllByRole('tab')
    tabs[0].focus()
    await user.keyboard('{ArrowRight}')
    expect(tabs[1]).toHaveFocus()
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[1]).toHaveAttribute('tabindex', '0')
    expect(tabs[0]).toHaveAttribute('tabindex', '-1')
    await user.keyboard('{End}')
    expect(tabs[2]).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(tabs[0]).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(tabs[2]).toHaveFocus()
    await user.keyboard('{Home}')
    expect(tabs[0]).toHaveFocus()
  })

  it('has the two-line promise and the closing line', () => {
    view()
    expect(screen.getByText(/O app tem três páginas/)).toBeInTheDocument()
    expect(
      screen.getByText('As três páginas conversam: o que você preenche em uma aparece nas outras.'),
    ).toBeInTheDocument()
  })

  it.each([
    ['Lavoura e custos', /adubacao\.jpg$/, 'Trator com tanque amarelo'],
    ['Comercialização', /mercado\.jpg$/, 'Navio de carga'],
    ['Resultados financeiros', /meta\.jpg$/, 'Lavoura amarelada'],
  ])('%s: photo band with alt text and size, page name and promise, two item groups', async (name, src, alt) => {
    const user = userEvent.setup()
    view()
    await user.click(screen.getByRole('tab', { name }))
    const panel = screen.getByRole('tabpanel')
    const img = within(panel).getByRole('img', { name: new RegExp(alt) })
    expect(img.getAttribute('src')).toMatch(src)
    expect(Number(img.getAttribute('width'))).toBeGreaterThan(0)
    expect(Number(img.getAttribute('height'))).toBeGreaterThan(0)
    expect(within(panel).getByRole('heading', { level: 3, name })).toBeInTheDocument()
    expect(within(panel).getByRole('heading', { level: 4, name: 'O que você faz' })).toBeInTheDocument()
    expect(within(panel).getByRole('heading', { level: 4, name: 'O que o app mostra' })).toBeInTheDocument()
    const lists = within(panel)
      .getAllByRole('list')
      .filter((l) => !screen.getByTestId('app-preview').contains(l))
    expect(lists).toHaveLength(2)
    for (const l of lists) {
      const n = within(l).getAllByRole('listitem').length
      expect(n).toBeGreaterThanOrEqual(3)
      expect(n).toBeLessThanOrEqual(4)
      expect(l.querySelectorAll('svg').length).toBeGreaterThanOrEqual(n)
    }
  })

  it('Lavoura e custos copy and cost-group preview', () => {
    view()
    expect(panelText()).toMatch(/exemplo ilustrativo/)
    expect(panelText()).toMatch(/produto por produto/)
    expect(panelText()).toMatch(/bolsa de Chicago \(CBOT\) e do dólar/)
    expect(panelText()).toMatch(/dólar do dia da compra/)
    expect(panelText()).toMatch(/Realizou operação barter/)
    expect(panelText()).toMatch(/R\$\/ha, R\$\/sc ou sc\/ha/)
    const preview = screen.getByTestId('app-preview')
    expect(within(preview).getByText('Adubação')).toBeInTheDocument()
    expect(preview.querySelectorAll('li').length).toBeGreaterThanOrEqual(4)
  })

  it('Comercialização copy and exposure preview', async () => {
    const user = userEvent.setup()
    view()
    await user.click(screen.getByRole('tab', { name: 'Comercialização' }))
    expect(panelText()).toMatch(/sacas, toneladas ou bushels/)
    expect(panelText()).toMatch(/Salvar/)
    expect(panelText()).toMatch(/Futuros, opções e accumulators/)
    expect(panelText()).toMatch(/vencimento e lotes/)
    expect(panelText()).toMatch(/Mapa da safra/)
    const preview = screen.getByTestId('app-preview')
    for (const t of ['Protegido', 'Exposto', 'Dólar', 'Operações']) expect(within(preview).getByText(t)).toBeInTheDocument()
  })

  it('Resultados financeiros copy and 9x9 matrix preview', async () => {
    const user = userEvent.setup()
    const ex = buildLiveExample(seedSnapshot())
    render(<OQueOAppFaz ex={ex} />)
    await user.click(screen.getByRole('tab', { name: 'Resultados financeiros' }))
    expect(panelText()).toMatch(/9×9 \(CBOT × dólar × basis\)/)
    expect(panelText()).toMatch(/DRE/)
    expect(panelText()).toMatch(/Formação do preço da fazenda/)
    expect(panelText()).toMatch(/Seu risco/)
    expect(panelText()).toMatch(/margem chega a zero/)
    expect(panelText()).toMatch(/meta/)
    const grid = screen.getByRole('img', { name: /Matriz 9 por 9/ })
    expect(grid.querySelectorAll('i')).toHaveLength(81)
    // the settled number is the engine number
    expect(screen.getByTestId('app-preview').textContent).toContain(`R$ ${fmtNum(ex.marginPerSc as number, 2)}/sc`)
  })

  it('never mentions removed features or outside data, has no links', async () => {
    const user = userEvent.setup()
    const { container } = view()
    for (const t of screen.getAllByRole('tab')) {
      await user.click(t)
      expect(container.textContent).not.toMatch(/ponte|sensibilidade|ver exemplo|IMEA|média da região|B3|Cepea/i)
    }
    expect(container.querySelectorAll('a')).toHaveLength(0)
  })

  it('changes nothing in localStorage while switching tabs', async () => {
    const user = userEvent.setup()
    localStorage.setItem('margem:v3', '{"x":1}')
    const before = JSON.stringify({ ...localStorage })
    view()
    for (const t of screen.getAllByRole('tab')) await user.click(t)
    expect(JSON.stringify({ ...localStorage })).toBe(before)
  })

  it('is jest-axe clean in every tab', async () => {
    const user = userEvent.setup()
    const { container } = view()
    for (const t of screen.getAllByRole('tab')) {
      await user.click(t)
      expect(await axe(container)).toHaveNoViolations()
    }
  })

  it.each([
    ['dólar 0', (s: MarketSnapshot) => void (s.fx.value = 0)],
    ['CBOT soja 0', (s: MarketSnapshot) => void (s.cbotUsc.soja.value = 0)],
    ['dólar NaN', (s: MarketSnapshot) => void (s.fx.value = Number.NaN)],
  ])('%s: no NaN in any tab', async (_n, edit) => {
    const user = userEvent.setup()
    const s = seedSnapshot()
    edit(s)
    const { container } = view(s)
    for (const t of screen.getAllByRole('tab')) {
      await user.click(t)
      expect(container.textContent).not.toMatch(/NaN|Infinity|undefined/)
    }
    await user.click(screen.getByRole('tab', { name: 'Resultados financeiros' }))
    expect(container.textContent).toMatch(/Dólar ou CBOT indisponível/)
  })
})
