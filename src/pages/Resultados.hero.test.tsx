import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { staticProvider } from '../data/staticProvider'
import { CROPS } from '../engine/crops'
import { toneFor } from '../engine/matrix'
import { ALL_FIXED, marginParts } from '../engine/sensitivity'
import { StoreProvider, useStore } from '../state/StoreProvider'
import { fmtDateBr } from '../ui/format'
import { fmtCompactMoney, fmtMarginPct, fmtSignedMoney } from '../ui/fmtExtra'
import { LEGACY_EXAMPLE, seedState } from '../test/helpers'
import { engineToday } from '../test/storeHarness'
import { Resultados } from './Resultados'

vi.setConfig({ testTimeout: 20000 })

let api: ReturnType<typeof useStore>
function Grab() {
  api = useStore()
  return null
}

async function setup(extra: Parameters<typeof seedState>[0] = []) {
  seedState([...LEGACY_EXAMPLE, ...extra], false)
  const user = userEvent.setup()
  render(
    <StoreProvider>
      <Resultados />
      <Grab />
    </StoreProvider>,
  )
  await screen.findByTestId('resultados-hero')
  return user
}

/** The engine's margin of the chosen scenario with everything fixed, as the hero must show it. */
async function engineMargin() {
  const { scenario } = await engineToday(api.state)
  return marginParts(CROPS[api.state.crop], scenario, api.state.inputs, api.state.sales, ALL_FIXED)!
}

async function pickUnit(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole('button', { name: /^Unidade de todos os valores:/ }))
  await user.click(screen.getByRole('radio', { name: label }))
}

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '#/resultados')
})
afterEach(() => {
  window.history.replaceState(null, '', '#')
  vi.unstubAllGlobals()
})

describe('Resultados hero', () => {
  it('the big number is the engine margin per sack, per hectare and for the whole crop', async () => {
    const user = await setup()
    const p = await engineMargin()
    const big = screen.getByTestId('hero-valor')
    expect(big).toHaveTextContent(fmtSignedMoney(p.margin / p.productionSc, 'BRL', 2))
    expect(big).toHaveTextContent('por saca')
    await pickUnit(user, 'R$/ha')
    expect(big).toHaveTextContent(fmtSignedMoney(p.margin / api.state.inputs.areaHa, 'BRL', 2))
    expect(big).toHaveTextContent('por hectare')
    await pickUnit(user, 'R$ total')
    expect(big).toHaveTextContent(fmtSignedMoney(p.margin, 'BRL', 0))
    expect(big).toHaveTextContent('na safra toda')
  })

  it('follows the top currency (US$ at the scenario dollar)', async () => {
    await setup([{ type: 'setCurrency', currency: 'USD' }])
    const p = await engineMargin()
    const { scenario } = await engineToday(api.state)
    expect(screen.getByTestId('hero-valor')).toHaveTextContent(
      fmtSignedMoney(p.margin / p.productionSc / scenario.fx, 'USD', 2),
    )
    expect(screen.getByRole('button', { name: /^Unidade de todos os valores: US\$\/sc/ })).toBeInTheDocument()
  })

  it('the status pill uses the engine traffic light; the sentence and the trust line carry real numbers', async () => {
    await setup()
    const p = await engineMargin()
    const pct = p.margin / p.revenue
    const tone = toneFor(pct, null)
    const pill = screen.getByTestId('hero-pill')
    expect(pill).toHaveTextContent(tone === 2 ? 'Margem boa' : tone === 1 ? 'Margem baixa' : 'No prejuízo')
    expect(pill).toHaveTextContent(fmtMarginPct(pct))
    expect(pill.className).toContain(`bg-tone${tone}`)
    const snap = await staticProvider.getSnapshot()
    const sentence = screen.getByTestId('hero-frase')
    expect(sentence).toHaveTextContent(
      /^Com a bolsa a 1\.241 US¢\/bu e o dólar a R\$ 5,4998, depois de pagar todos os custos (sobram|faltam) /,
    )
    expect(sentence).toHaveTextContent(fmtCompactMoney(Math.abs(p.margin), 'BRL'))
    expect(screen.getByTestId('hero-confianca')).toHaveTextContent(
      `Margem bruta: antes de impostos, juros e perdas · Preços de ${fmtDateBr(snap.cbotUsc.soja.asOf)}, não ao vivo`,
    )
  })

  it('with a target the pill is read against it', async () => {
    await setup([{ type: 'setTargetMargin', value: 0.9 }])
    expect(screen.getByTestId('hero-pill')).toHaveTextContent('Abaixo da meta')
  })

  it('a chosen scenario is named in the chip with its moves and "voltar a hoje" restores today', async () => {
    const user = await setup()
    expect(screen.getByTestId('hero-chip')).toHaveTextContent('Cenário: Hoje')
    const today = (await engineMargin()).margin
    act(() => api.dispatch({ type: 'applyScenario', cbotUsc: 1117.125, fx: 5.4998 })) // CBOT -10%
    const chip = screen.getByTestId('hero-chip')
    expect(chip).toHaveTextContent('Cenário alterado: CBOT 1.117 (−10,0%)')
    expect(chip).not.toHaveTextContent('dólar')
    const p = await engineMargin()
    expect(p.margin).not.toBe(today)
    expect(screen.getByTestId('hero-valor')).toHaveTextContent(fmtSignedMoney(p.margin / p.productionSc, 'BRL', 2))
    await user.click(within(chip).getByRole('button', { name: 'voltar a hoje' }))
    expect(screen.getByTestId('hero-chip')).toHaveTextContent('Cenário: Hoje')
    expect(api.state.overrides.cbotUsc).toBeUndefined()
  })

  it('a simulated basis shows up in the chip as a move of the basis, and the way back clears it', async () => {
    const user = await setup()
    act(() => api.dispatch({ type: 'setSimBasis', value: 70 }))
    const chip = screen.getByTestId('hero-chip')
    expect(chip).toHaveTextContent(/basis \+R\$ \d+,\d\d\/sc/)
    await user.click(within(chip).getByRole('button', { name: 'voltar a hoje' }))
    expect(api.state.overrides.simBasisUsc).toBeUndefined()
  })

  it('has the slim bar only after the hero leaves the view (IntersectionObserver)', async () => {
    const cbs: Array<(e: Array<{ isIntersecting: boolean }>) => void> = []
    class IO {
      constructor(c: (e: Array<{ isIntersecting: boolean }>) => void) {
        cbs.push(c)
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    const report = (isIntersecting: boolean) => act(() => cbs.forEach((c) => c([{ isIntersecting }])))
    vi.stubGlobal('IntersectionObserver', IO)
    const user = await setup()
    expect(screen.queryByTestId('hero-slim')).toBeNull()
    // The observer registers after the first paint: report again until the bar shows (one early report could be lost).
    const slim = await waitFor(
      () => {
        report(false)
        return screen.getByTestId('hero-slim')
      },
      { timeout: 5000 },
    )
    const p = await engineMargin()
    expect(slim).toHaveTextContent(fmtSignedMoney(p.margin / p.productionSc, 'BRL', 2) + '/sc')
    expect(slim).toHaveTextContent('Cenário: Hoje')
    act(() => api.dispatch({ type: 'applyScenario', cbotUsc: 1117.125, fx: 5.4998 }))
    await user.click(within(screen.getByTestId('hero-slim')).getByRole('button', { name: 'voltar a hoje' }))
    expect(api.state.overrides.cbotUsc).toBeUndefined()
    report(true)
    expect(screen.queryByTestId('hero-slim')).toBeNull()
  })
})
