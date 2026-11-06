import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { staticProvider } from '../data/staticProvider'
import { StoreProvider, useStore } from '../state/StoreProvider'
import { fmtNum } from '../ui/format'
import { LEGACY_EXAMPLE, seedState } from '../test/helpers'
import { Resultados } from './Resultados'

vi.setConfig({ testTimeout: 30000 })
expect.extend(toHaveNoViolations)

let api: ReturnType<typeof useStore>
function Grab() {
  api = useStore()
  return null
}

async function setup() {
  const user = userEvent.setup()
  const view = render(
    <StoreProvider>
      <Resultados />
      <Grab />
    </StoreProvider>,
  )
  await screen.findByTestId('page-resultados')
  return { user, view }
}

const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

beforeEach(() => {
  localStorage.clear()
  seedState(LEGACY_EXAMPLE, false)
  window.history.replaceState(null, '', '#/resultados')
})
afterEach(() => window.history.replaceState(null, '', '#'))

describe('Resultados financeiros (page)', () => {
  it('renders every section, in order', async () => {
    await setup()
    const order = [
      screen.getByRole('tablist'),
      screen.getByTestId('resultados-hero'),
      screen.getByTestId('card-matriz'),
      screen.getByTestId('mini-dre'),
    ]
    for (let i = 1; i < order.length; i++) expect(follows(order[i - 1], order[i])).toBe(true)
  })

  it('the DRE card carries the collapsed comparison with the praça market price (not for the "Outro" point)', async () => {
    // the fixture farm is on "Outro": no market price to compare with
    await setup()
    expect(screen.queryByTestId('price-compare')).toBeNull()
    cleanup()
    seedState([], false) // the default FOB point (Paranaguá)
    await setup()
    const row = within(screen.getByTestId('mini-dre')).getByTestId('price-compare')
    expect(row).not.toHaveAttribute('open')
    expect(row).toHaveTextContent('Seu preço contra o mercado da praça · Paranaguá')
  })

  it('has none of the old controls', async () => {
    await setup()
    expect(screen.queryByRole('link', { name: /^Minhas vendas/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Simular variações' })).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Considerar já vendido' })).toBeNull()
    expect(screen.queryByTestId('chosen-scenario')).toBeNull()
    expect(screen.queryByTestId('card-cenarios')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Simular frete e taxas' })).toBeNull()
    expect(screen.queryByTestId('matrix-card')).toBeNull()
    // dropped from the page: the scenario bar, the four KPI cards and the sensitivity block
    expect(screen.queryByTestId('cenario-escolhido')).toBeNull()
    expect(screen.queryByTestId('resultados-kpis')).toBeNull()
    expect(screen.queryByTestId('botao-sensibilidade')).toBeNull()
    // the bridge of the margin and the old "Mais" area are gone
    expect(screen.queryByTestId('botao-ponte')).toBeNull()
    expect(screen.queryByTestId('card-ponte')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Mais' })).toBeNull()
  })

  it('the meta and the price formation are small buttons at the bottom right of the answer card', async () => {
    const { user } = await setup()
    const hero = screen.getByTestId('resultados-hero')
    const meta = within(hero).getByTestId('botao-meta')
    const formacao = within(hero).getByTestId('botao-formacao')
    expect(meta).toHaveTextContent('Meta de margem')
    expect(formacao).toHaveTextContent('Formação do preço da fazenda')
    // after the trust line, inside the same card
    expect(follows(within(hero).getByTestId('hero-confianca'), meta)).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(meta)
    const dialog = screen.getByRole('dialog', { name: 'Análise da meta de margem' })
    expect(within(dialog).getByRole('switch', { name: 'Definir meta de margem' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(meta).toHaveFocus()
  })

  it('a matrix cell updates the hero and the DRE; "voltar a hoje" restores', async () => {
    const { user } = await setup()
    const snap = await staticProvider.getSnapshot()
    const hero = screen.getByTestId('resultados-hero')
    const dre = screen.getByTestId('mini-dre')
    expect(within(hero).getByTestId('hero-chip')).toHaveTextContent('Cenário: Hoje')
    expect(within(hero).queryByRole('button', { name: 'voltar a hoje' })).toBeNull()
    const heroToday = hero.textContent
    const dreToday = dre.textContent

    // cell 0-0 is the lowest row and column of the 9x9 grid: the largest step down on CBOT and on the dollar
    await user.click(screen.getByTestId('matriz-celula-0-0'))
    const chip = within(hero).getByTestId('hero-chip')
    expect(chip).toHaveTextContent('Cenário alterado')
    const cbot = api.state.overrides.cbotUsc!
    expect(cbot).toBeLessThan(snap.cbotUsc.soja.value)
    const down = (1 - cbot / snap.cbotUsc.soja.value) * 100
    expect(chip).toHaveTextContent(`CBOT ${fmtNum(cbot, 0)} (−${fmtNum(down, 1)}%)`)
    expect(chip).toHaveTextContent('dólar')
    expect(hero.textContent).not.toBe(heroToday)
    expect(dre.textContent).not.toBe(dreToday)

    await user.click(within(hero).getByRole('button', { name: 'voltar a hoje' }))
    expect(within(hero).getByTestId('hero-chip')).toHaveTextContent('Cenário: Hoje')
    expect(hero.textContent).toBe(heroToday)
    expect(dre.textContent).toBe(dreToday)
    expect(api.state.overrides.cbotUsc).toBeUndefined()
    expect(api.state.overrides.fx).toBeUndefined()
  })

  it('a dollar fully locked does not break the page', async () => {
    await setup()
    act(() => api.dispatch({ type: 'setFxLock', pct: 1, rate: 5.2 }))
    expect(screen.getByTestId('card-matriz')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/NaN|Infinity|undefined/)
  })

  it('shows no NaN, Infinity or undefined, closed or with the dialogs open', async () => {
    const { user } = await setup()
    const clean = () => expect(document.body.textContent).not.toMatch(/NaN|Infinity|undefined/)
    clean()
    await user.click(screen.getByTestId('botao-meta'))
    clean()
    await user.keyboard('{Escape}')
    await user.click(screen.getByTestId('botao-formacao'))
    clean()
    await user.keyboard('{Escape}')
    await user.click(screen.getByTestId('matriz-celula-8-8'))
    clean()
  })

  it('has no axe violations (color-contrast off), closed and with the meta and formation dialogs open', async () => {
    const { user, view } = await setup()
    const check = () => axe(view.container, { rules: { 'color-contrast': { enabled: false } } })
    expect(await check()).toHaveNoViolations()
    await user.click(screen.getByTestId('botao-meta'))
    expect(await check()).toHaveNoViolations()
    await user.keyboard('{Escape}')
    await user.click(screen.getByTestId('botao-formacao'))
    expect(await check()).toHaveNoViolations()
  })
})
