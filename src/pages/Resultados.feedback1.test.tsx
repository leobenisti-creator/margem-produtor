import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { StoreProvider, useStore } from '../state/StoreProvider'
import { Resultados } from './Resultados'
import { LEGACY_EXAMPLE, seedState } from '../test/helpers'

vi.setConfig({ testTimeout: 30000 })
expect.extend(toHaveNoViolations)

type Store = ReturnType<typeof useStore>
let api: Store
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

const dispatch = (a: Parameters<Store['dispatch']>[0]) => act(() => api.dispatch(a))
const setHash = (h: string) => window.history.replaceState(null, '', h)

/** The analysis is one document opened by the "Meta de margem" button of the answer card. */
async function openAnalysis(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Meta de margem/ }))
  return screen.getByRole('dialog', { name: 'Análise da meta de margem' })
}

beforeEach(() => {
  localStorage.clear()
  seedState(LEGACY_EXAMPLE, false)
  setHash('#/resultados')
})
afterEach(() => {
  setHash('#')
})

describe('Resultados: Análise da meta', () => {
  it('the Meta de margem button opens ONE document with the target control and the analysis (no second dialog)', async () => {
    const { user } = await setup()
    await dispatch({ type: 'setTargetMargin', value: 0.2 })
    expect(screen.queryByRole('dialog')).toBeNull()
    const dialog = await openAnalysis(user)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(within(dialog).getByRole('switch', { name: 'Definir meta de margem' })).toBeChecked()
    expect(within(dialog).getByTestId('meta-veredito')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Análise da meta/ })).toBeNull()
  })

  it('below the target: the verdict says how far, the summary and the sections are there; Esc closes and returns focus', async () => {
    const { user } = await setup()
    await dispatch({ type: 'setTargetMargin', value: 0.2 })
    const dialog = await openAnalysis(user)
    const verdict = within(dialog).getByTestId('meta-veredito')
    expect(verdict).toHaveTextContent(/Você está [\d,]+ p\.p\. abaixo da meta/)
    expect(verdict).toHaveTextContent('Falta para a meta')
    expect(within(dialog).getByTestId('meta-resumo-lista').children.length).toBeGreaterThanOrEqual(4)
    for (const id of ['meta-precos', 'meta-fatores', 'meta-peso', 'meta-matriz', 'meta-estresse', 'meta-vendas', 'meta-acoes']) {
      expect(within(dialog).getByTestId(id)).toBeInTheDocument()
    }
    expect(within(dialog).getByRole('heading', { name: 'Para chegar à meta' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('botao-meta')).toHaveFocus()
  })

  it('above the target: "acima", the slack, "Para proteger a meta" and the cell that takes you out', async () => {
    const { user } = await setup()
    await dispatch({ type: 'setTargetMargin', value: 0.1 })
    const dialog = await openAnalysis(user)
    const verdict = within(dialog).getByTestId('meta-veredito')
    expect(verdict).toHaveTextContent(/Você está [\d,]+ p\.p\. acima da meta/)
    expect(verdict).toHaveTextContent('Folga sobre a meta')
    expect(within(dialog).getByRole('heading', { name: 'Para proteger a meta' })).toBeInTheDocument()
    expect(within(dialog).getByTestId('meta-matriz-perto')).toHaveTextContent('tira você da meta')
  })

  it('the four factors (basis, CBOT, dollar, cost), the stress rows and the weights are all there, with no productivity', async () => {
    const { user } = await setup()
    await dispatch({ type: 'setTargetMargin', value: 0.1 })
    const dialog = await openAnalysis(user)
    for (const l of ['basis', 'cbot', 'dolar', 'custo']) {
      expect(within(dialog).getByTestId(`meta-fator-${l}`)).toBeInTheDocument()
    }
    expect(within(dialog).queryByTestId('meta-fator-produtividade')).toBeNull()
    for (const s of ['cbot-10', 'dolar-10', 'basis-5', 'custo+10', 'combo', 'favoravel']) {
      expect(within(dialog).getByTestId(`meta-estresse-${s}`)).toBeInTheDocument()
    }
    for (const s of ['cbot', 'dolar', 'basis', 'custo']) {
      expect(within(dialog).getByTestId(`meta-peso-${s}`)).toBeInTheDocument()
    }
    expect(within(dialog).queryByTestId('meta-peso-produtividade')).toBeNull()
    expect(dialog.textContent).not.toMatch(/produtividade/i)
    expect(within(dialog).getByTestId('meta-matriz-contagem')).toHaveTextContent(/\d+ batem a meta/)
  })

  it('the counts of the grid are the ones the matrix colours show', async () => {
    const { user } = await setup()
    await dispatch({ type: 'setTargetMargin', value: 0.2 })
    const matrixBefore = screen.getByTestId('matriz-tabela')
    const toneCount = (t: string) => matrixBefore.querySelectorAll(`[data-tone="${t}"]`).length
    const green = toneCount('2')
    const amber = toneCount('1')
    const red = toneCount('0')
    const dialog = await openAnalysis(user)
    const counts = within(dialog).getByTestId('meta-matriz-contagem')
    expect(counts).toHaveTextContent(`${green} batem a meta`)
    expect(counts).toHaveTextContent(`${amber} até 5 p.p. abaixo`)
    expect(counts).toHaveTextContent(`${red} mais de 5 p.p. abaixo`)
  })

  it('without a target: the control is there and an explanation of what the analysis will show', async () => {
    const { user } = await setup()
    const dialog = await openAnalysis(user)
    expect(within(dialog).getByRole('switch', { name: 'Definir meta de margem' })).not.toBeChecked()
    expect(within(dialog).getByTestId('meta-sem-meta')).toHaveTextContent('Defina uma meta para ver a análise completa')
    expect(within(dialog).queryByTestId('meta-veredito')).toBeNull()
  })

  it('turning the target on inside the document shows the analysis right away', async () => {
    const { user } = await setup()
    const dialog = await openAnalysis(user)
    await user.click(within(dialog).getByRole('switch', { name: 'Definir meta de margem' }))
    expect(await within(dialog).findByTestId('meta-veredito')).toBeInTheDocument()
    expect(within(dialog).queryByTestId('meta-sem-meta')).toBeNull()
  })

  it('"Ver esse cenário" applies the nearest cell, closes the document and the hero shows it', async () => {
    const { user } = await setup()
    await dispatch({ type: 'setTargetMargin', value: 0.2 })
    expect(screen.getByTestId('hero-chip')).toHaveTextContent('Cenário: Hoje')
    const dialog = await openAnalysis(user)
    await user.click(within(dialog).getByRole('button', { name: 'Ver esse cenário' }))
    expect(api.state.overrides.cbotUsc).toBeDefined()
    expect(api.state.overrides.fx).toBeDefined()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('hero-chip')).toHaveTextContent('Cenário alterado')
    expect(screen.getByRole('button', { name: 'voltar a hoje' })).toBeInTheDocument()
  })

  it('has no row of jump buttons (the document is just read top to bottom)', async () => {
    const { user } = await setup()
    await dispatch({ type: 'setTargetMargin', value: 0.2 })
    const dialog = await openAnalysis(user)
    expect(within(dialog).queryByRole('navigation', { name: 'Ir para uma parte da análise' })).toBeNull()
    for (const name of ['Veredito', 'Em resumo', 'Preço', 'Fatores', 'O que pesa', 'Matriz', 'Estresse', 'Vendas', 'O que fazer']) {
      expect(within(dialog).queryByRole('button', { name })).toBeNull()
    }
  })

  it('the matrix legend "Meta: X% · analisar" opens the document in place', async () => {
    const { user } = await setup()
    await dispatch({ type: 'setTargetMargin', value: 0.2 })
    await user.click(screen.getByRole('button', { name: /Meta: 20% · analisar/ }))
    expect(screen.getByRole('dialog', { name: 'Análise da meta de margem' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/resultados')
  })

  it('#/resultados?analise=1 opens the analysis on mount', async () => {
    seedState([...LEGACY_EXAMPLE, { type: 'setTargetMargin', value: 0.1 }])
    setHash('#/resultados?analise=1')
    await setup()
    expect(screen.getByRole('dialog', { name: 'Análise da meta de margem' })).toBeInTheDocument()
  })

  it('a hashchange while mounted opens the analysis', async () => {
    await setup()
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => {
      setHash('#/resultados?analise=1')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(await screen.findByRole('dialog', { name: 'Análise da meta de margem' })).toBeInTheDocument()
  })

  it('closing the document drops ?analise=1 from the address', async () => {
    setHash('#/resultados?analise=1')
    seedState([...LEGACY_EXAMPLE, { type: 'setTargetMargin', value: 0.2 }])
    const { user } = await setup()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fechar Análise da meta de margem' }))
    expect(window.location.hash).toBe('#/resultados')
  })
})

describe('Resultados: accessibility', () => {
  it('has no axe violations with the analysis open (with and without a target)', async () => {
    const { user, view } = await setup()
    const check = () => axe(view.container, { rules: { 'color-contrast': { enabled: false } } })
    expect(await check()).toHaveNoViolations()
    await openAnalysis(user)
    expect(await check()).toHaveNoViolations()
    await user.keyboard('{Escape}')
    await dispatch({ type: 'setTargetMargin', value: 0.2 })
    await openAnalysis(user)
    expect(await check()).toHaveNoViolations()
  })
})
