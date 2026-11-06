import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { effectiveFx, farmPriceBrl, referencePriceBrl } from '../engine/calc'
import { CROPS } from '../engine/crops'
import { StoreProvider, useStore } from '../state/StoreProvider'
import { fmtMoney, fmtNum } from '../ui/format'
import { LEGACY_EXAMPLE, seedState } from '../test/helpers'
import { engineToday } from '../test/storeHarness'
import { Resultados } from './Resultados'

vi.setConfig({ testTimeout: 30000 })
expect.extend(toHaveNoViolations)

let api: ReturnType<typeof useStore>
function Grab() {
  api = useStore()
  return null
}

async function setup(extra: Parameters<typeof seedState>[0] = []) {
  seedState([...LEGACY_EXAMPLE, ...extra], false)
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

const openBtn = () => screen.getByRole('button', { name: 'Formação do preço da fazenda' })
async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(openBtn())
  return screen.getByRole('dialog', { name: 'Formação do preço da fazenda' })
}

/** Engine's farm price for the chosen scenario of the store. */
async function enginePrice() {
  const { scenario } = await engineToday(api.state)
  return { scenario, farm: farmPriceBrl(CROPS[api.state.crop], scenario, api.state.inputs) }
}

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '#/resultados')
})
afterEach(() => window.history.replaceState(null, '', '#'))

describe('Formação do preço da fazenda (document overlay)', () => {
  it('opens from the small gold button of the answer card, with the kicker and the chain of today', async () => {
    const { user } = await setup()
    expect(screen.getByTestId('resultados-hero')).toContainElement(openBtn())
    expect(openBtn()).toHaveAttribute('aria-haspopup', 'dialog')
    const dialog = await open(user)
    expect(dialog).toHaveTextContent('Cálculo')
    expect(dialog).toHaveTextContent('Com os preços de hoje')
    const { scenario, farm } = await enginePrice()
    const crop = CROPS.soja
    const t = (id: string) => within(dialog).getByTestId(id).textContent
    // the numbers are the engine's
    expect(t('pf-final')).toBe(`${fmtMoney(farm, 'BRL')}/sc`)
    expect(t('pf-fob')).toBe(`${fmtMoney(referencePriceBrl(crop, scenario), 'BRL')}/sc`)
    expect(t('pf-bolsa')).toBe(`${fmtMoney((scenario.cbotUsc / 100) * crop.bushelsPerSack * scenario.fx, 'BRL')}/sc`)
    expect(t('pf-freight')).toBe(`${fmtMoney(api.state.inputs.freightBrlPerSc, 'BRL')}/sc`)
    expect(t('pf-fees')).toBe(`${fmtMoney(api.state.inputs.portFeesBrlPerSc, 'BRL')}/sc`)
    expect(t('pf-cbot')).toBe(`${fmtNum(scenario.cbotUsc, 2)} US¢/bu`)
    // the formula line and the basis (farm price − bolsa)
    expect(dialog).toHaveTextContent(`÷ 100 × ${fmtNum(crop.bushelsPerSack, 4)} bu por saca × dólar R$ 5,4998`)
    const bolsa = (scenario.cbotUsc / 100) * crop.bushelsPerSack * scenario.fx
    expect(t('pf-basis')).toBe(`−${fmtMoney(Math.abs(farm - bolsa), 'BRL')}/sc`)
    // no basis simulation: no adjustment line
    expect(within(dialog).queryByTestId('pf-adjust')).toBeNull()
  })

  it('shows the chosen scenario, not today', async () => {
    const { user } = await setup()
    act(() => api.dispatch({ type: 'applyScenario', cbotUsc: 1117.125, fx: 5.2 }))
    const dialog = await open(user)
    expect(dialog).toHaveTextContent('No cenário: CBOT 1.117 US¢/bu · dólar R$ 5,20')
    const { farm, scenario } = await enginePrice()
    expect(scenario.fx).toBe(5.2)
    expect(within(dialog).getByTestId('pf-final')).toHaveTextContent(`${fmtMoney(farm, 'BRL')}/sc`)
  })

  it('a simulated basis adds the adjustment line and the steps still add up to the engine farm price', async () => {
    const { user } = await setup()
    act(() => api.dispatch({ type: 'setSimBasis', value: 70 }))
    const dialog = await open(user)
    expect(within(dialog).getByTestId('pf-adjust')).toBeInTheDocument()
    expect(dialog).toHaveTextContent('Você alterou o basis nesta tela.')
    const { scenario } = await enginePrice()
    const crop = CROPS.soja
    // the engine's farm price at the simulated premium (70 US¢/bu)
    const farm = farmPriceBrl(crop, { ...scenario, basisUsc: 70 }, api.state.inputs)
    const fx = effectiveFx(api.state.inputs.fxLockPct, api.state.inputs.fxLockRate, scenario.fx)
    const perUsc = (crop.bushelsPerSack / 100) * fx
    // 61,7 (the premium in use in the fixture, Lavoura e custos) + the simulated move = 70
    const premium = 61.7 * perUsc
    const adjust = (70 - 61.7) * perUsc
    const bolsa = scenario.cbotUsc * perUsc
    expect(bolsa + premium - api.state.inputs.freightBrlPerSc - api.state.inputs.portFeesBrlPerSc + adjust).toBeCloseTo(farm, 8)
    expect(within(dialog).getByTestId('pf-premium')).toHaveTextContent(`${fmtMoney(premium, 'BRL')}/sc`)
    expect(within(dialog).getByTestId('pf-adjust')).toHaveTextContent(`${fmtMoney(adjust, 'BRL')}/sc`)
    expect(within(dialog).getByTestId('pf-final')).toHaveTextContent(`${fmtMoney(farm, 'BRL')}/sc`)
  })

  it('the switch shows every price in US¢/bu (the inverse of the CBOT conversion)', async () => {
    const { user } = await setup()
    const dialog = await open(user)
    await user.click(within(dialog).getByRole('button', { name: 'US¢/bu' }))
    const { scenario, farm } = await enginePrice()
    const crop = CROPS.soja
    const cents = (farm / (crop.bushelsPerSack * scenario.fx)) * 100
    expect(within(dialog).getByTestId('pf-final')).toHaveTextContent(`${fmtNum(cents, 2)} US¢/bu`)
    expect(within(dialog).getByTestId('pf-premium')).toHaveTextContent(`${fmtNum(scenario.basisUsc, 2)} US¢/bu`)
    for (const id of ['pf-fob', 'pf-freight', 'pf-fees']) {
      expect(within(dialog).getByTestId(id).textContent).toMatch(/US¢\/bu$/)
    }
    await user.click(within(dialog).getByRole('button', { name: 'R$/sc' }))
    expect(within(dialog).getByTestId('pf-final').textContent).toMatch(/^R\$ [\d.,]+\/sc$/)
  })

  it('Esc closes it and the focus goes back to the button', async () => {
    const { user } = await setup()
    await open(user)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(openBtn()).toHaveFocus()
  })

  it('the close button works too and the focus is inside while it is open', async () => {
    const { user } = await setup()
    const dialog = await open(user)
    expect(dialog.contains(document.activeElement)).toBe(true)
    await user.click(within(dialog).getByRole('button', { name: 'Fechar Formação do preço da fazenda' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(openBtn()).toHaveFocus()
  })

  it('has no axe violations with the overlay open (color-contrast off)', async () => {
    const { user, view } = await setup()
    await open(user)
    expect(await axe(view.container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })
})
