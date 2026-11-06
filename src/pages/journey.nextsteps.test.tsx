import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { StoreProvider, useStore } from '../state/StoreProvider'
import { GATES_KEY } from '../state/gates'
import { seedState } from '../test/helpers'
import { Comercializacao } from './Comercializacao'
import { Resultados } from './Resultados'
import { Simulador } from './Simulador'

vi.setConfig({ testTimeout: 30000 })
expect.extend(toHaveNoViolations)

let api: ReturnType<typeof useStore>
function Grab() {
  api = useStore()
  return null
}
function mount(ui: React.ReactNode) {
  return render(
    <StoreProvider>
      {ui}
      <Grab />
    </StoreProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  seedState([], false)
  window.history.replaceState(null, '', '#/resultados')
})
afterEach(() => window.history.replaceState(null, '', '#'))

function hrefs(nav: HTMLElement) {
  return Array.from(nav.querySelectorAll('a')).map((a) => a.getAttribute('href'))
}

describe('"Ir para" block (gates off)', () => {
  it('Lavoura e custos: Comercialização (tour anchor) and Resultados, at the end', async () => {
    mount(<Simulador />)
    const nav = await screen.findByTestId('next-steps')
    expect(nav).toHaveTextContent('Ir para')
    expect(hrefs(nav)).toEqual(['#/comercializacao', '#/resultados'])
    expect(screen.getByTestId('next-comercializacao')).toHaveAttribute('data-tour', 'proximo')
    expect(screen.getByTestId('sim-form').compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('Comercialização: Lavoura e custos and Resultados', async () => {
    mount(<Comercializacao />)
    const nav = await screen.findByTestId('next-steps')
    expect(hrefs(nav)).toEqual(['#/simulador', '#/resultados'])
    expect(nav.querySelector('[data-tour]')).toBeNull()
    expect(nav.parentElement?.lastElementChild).toBe(nav)
  })

  it('Resultados (normal page): Lavoura e custos and Comercialização', async () => {
    mount(<Resultados />)
    const nav = await screen.findByTestId('next-steps')
    expect(hrefs(nav)).toEqual(['#/simulador', '#/comercializacao'])
    expect(screen.getByTestId('card-matriz')).toBeInTheDocument()
    expect(screen.queryByTestId('resultados-locked')).toBeNull()
  })
})

describe('locked experience (gates on)', () => {
  beforeEach(() => localStorage.setItem(GATES_KEY, 'on'))

  it('the buttons to Comercialização and Resultados are aria-disabled with the reason and do not navigate', async () => {
    const user = userEvent.setup()
    mount(<Simulador />)
    window.history.replaceState(null, '', '#/simulador')
    for (const name of [/Comercialização/, /Resultados financeiros/]) {
      const btn = await screen.findByRole('button', { name })
      expect(btn).toHaveAttribute('aria-disabled', 'true')
      const reason = document.getElementById(btn.getAttribute('aria-describedby') ?? '')
      expect(reason).toHaveTextContent(/^Falta: /)
      expect(reason).toBeVisible()
      await user.click(btn)
      btn.focus()
      await user.keyboard('{Enter}')
      expect(window.location.hash).toBe('#/simulador')
    }
    const nav = screen.getByTestId('next-steps')
    expect(nav.querySelectorAll('a')).toHaveLength(0)
  })

  it('Resultados: the empty state replaces the page, with the missing list and the button', async () => {
    mount(<Resultados />)
    const box = await screen.findByTestId('resultados-locked')
    expect(box).toHaveTextContent('Para ver os seus resultados, preencha Lavoura e custos')
    expect(screen.getByTestId('locked-missing').textContent).toMatch(/área/)
    expect(screen.getByTestId('locked-missing').textContent).toMatch(/custo por hectare/)
    const link = screen.getByRole('link', { name: /Ir para Lavoura e custos/ })
    expect(link).toHaveAttribute('href', '#/simulador')
    expect(screen.queryByTestId('page-resultados')).toBeNull()
    expect(screen.queryByTestId('card-matriz')).toBeNull()
    expect(screen.queryByTestId('next-steps')).toBeNull()
    expect(window.location.hash).toBe('#/resultados')
  })

  it('Comercialização: the empty state replaces the page, no redirect', async () => {
    window.history.replaceState(null, '', '#/comercializacao')
    mount(<Comercializacao />)
    const box = await screen.findByTestId('comercializacao-locked')
    expect(box).toHaveTextContent('Para registrar vendas e operações, preencha Lavoura e custos')
    expect(screen.getByTestId('locked-missing').textContent).toMatch(/produtividade/)
    expect(screen.getByRole('link', { name: /Ir para Lavoura e custos/ })).toHaveAttribute('href', '#/simulador')
    expect(screen.queryByTestId('page-comercializacao')).toBeNull()
    expect(screen.queryByTestId('next-steps')).toBeNull()
    expect(window.location.hash).toBe('#/comercializacao')
  })

  it('ignores the analise deep link while locked', async () => {
    window.history.replaceState(null, '', '#/resultados?analise=1')
    mount(<Resultados />)
    await screen.findByTestId('resultados-locked')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('unlocks both pages once area, productivity and costs are filled', async () => {
    mount(
      <>
        <Comercializacao />
        <Resultados />
      </>,
    )
    await screen.findByTestId('comercializacao-locked')
    await screen.findByTestId('resultados-locked')
    act(() => {
      api.dispatch({ type: 'setInput', key: 'areaHa', value: 1234 })
      api.dispatch({ type: 'setInput', key: 'yieldScHa', value: 61 })
      api.dispatch({ type: 'setInput', key: 'costPerHaBrl', value: 5432 })
    })
    expect(await screen.findByTestId('page-resultados')).toBeInTheDocument()
    expect(screen.getByTestId('page-comercializacao')).toBeInTheDocument()
    expect(screen.queryByTestId('resultados-locked')).toBeNull()
    expect(screen.queryByTestId('comercializacao-locked')).toBeNull()
  })

  it('has no a11y violations in the locked states and in the Simulador blocks', async () => {
    const locked = mount(<Resultados />)
    await screen.findByTestId('resultados-locked')
    expect(await axe(locked.container)).toHaveNoViolations()
    locked.unmount()
    const com = mount(<Comercializacao />)
    await screen.findByTestId('comercializacao-locked')
    expect(await axe(com.container)).toHaveNoViolations()
    com.unmount()
    const sim = mount(<Simulador />)
    await screen.findByTestId('next-steps')
    expect(await axe(sim.container)).toHaveNoViolations()
    sim.unmount()
    localStorage.setItem(GATES_KEY, 'off')
    const open = mount(<Resultados />)
    await screen.findByTestId('page-resultados')
    expect(await axe(open.container)).toHaveNoViolations()
  })
})
