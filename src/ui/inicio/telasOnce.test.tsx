import { act, cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ComoFunciona } from './ComoFunciona'
import { OQueOAppFaz } from './OQueOAppFaz'
import { ContaECores } from './ContaECores'
import { ParaQuemFaq } from './ParaQuemFaq'
import { SuaMeta } from './SuaMeta'
import { FakeIO, fireIntersection, installFakeIO, removeIO } from './testUtils'
import { renderScreen } from './telasTestKit'
import { PLAYED_KEY, resetMotionSession } from './session'

vi.setConfig({ testTimeout: 15000 })

type Ex = Parameters<typeof ComoFunciona>[0]['ex']

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetMotionSession()
  // Once mode (vitest defaults to "always", which replays everything on purpose).
  localStorage.setItem('margem:motion', 'once')
})
// The motion library caches its IntersectionObserver per options for the whole file, so the double is installed once
// here (re-installing per test would hide the cached observer from fireIntersection).
beforeAll(() => installFakeIO())
afterAll(() => removeIO())
afterEach(() => {
  cleanup()
  ;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIO
})

/** Elements that still carry an entrance state (hidden, collapsed, shifted) or a glow. */
function animated(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('*')].filter((el) => {
    const o = el.style.opacity
    return (
      (o !== '' && Number(o) < 1) ||
      /scale[XY]\(0\)|translateY\((?!0)/.test(el.style.transform) ||
      el.style.boxShadow !== ''
    )
  })
}

/** Reports every observed element as entering the view. */
function seeEverything() {
  for (const io of [...FakeIO.instances]) for (const el of [...io.elements]) fireIntersection(el)
}

const screens = [
  ['OQueOAppFaz', (ex: Ex) => <OQueOAppFaz ex={ex} />, /Do preço da bolsa/],
  ['ComoFunciona', (ex: Ex) => <ComoFunciona ex={ex} />, /Como funciona em três/],
  ['ContaECores', (ex: Ex) => <ContaECores ex={ex} />, /Você confere cada número/],
  ['SuaMeta', (ex: Ex) => <SuaMeta ex={ex} />, /Diga quanto quer ganhar/],
  ['ParaQuemFaq', () => <ParaQuemFaq />, /Feito para quem decide/],
] as const

describe('screens 4 to 8 play their entrance once per visit', () => {
  it.each(screens)('%s: first mount animates, a second mount renders the final state', async (_n, ui, h) => {
    const first = await renderScreen(ui, undefined, h)
    expect(animated(first.container).length).toBeGreaterThan(0)
    seeEverything()
    first.unmount()

    // remount without resetting the registry
    const second = await renderScreen(ui, undefined, h)
    expect(animated(second.container)).toHaveLength(0)
    second.unmount()

    // a new JS session over the same tab (reload): the registry comes back from sessionStorage
    resetMotionSession()
    const third = await renderScreen(ui, undefined, h)
    expect(animated(third.container)).toHaveLength(0)
  })

  it.each(screens)('%s: a new visit (storage emptied) plays again', async (_n, ui, h) => {
    const first = await renderScreen(ui, undefined, h)
    seeEverything()
    first.unmount()
    sessionStorage.clear()
    resetMotionSession()
    const again = await renderScreen(ui, undefined, h)
    expect(animated(again.container).length).toBeGreaterThan(0)
  })

  it.each(screens)('%s: never touches margem:v3 for the registry', async (_n, ui, h) => {
    const { unmount } = await renderScreen(ui, undefined, h)
    seeEverything()
    unmount()
    expect(localStorage.getItem('margem:v3')?.includes('animacoes') ?? false).toBe(false)
    expect(sessionStorage.getItem(PLAYED_KEY)).not.toBeNull()
  })
})

describe('OQueOAppFaz tab previews', () => {
  it('each tab animates only the first time it is shown; coming back shows the final state', async () => {
    const user = userEvent.setup()
    await renderScreen((ex) => <OQueOAppFaz ex={ex} />, undefined, /Do preço da bolsa/)
    const preview = () => screen.getByTestId('app-preview')
    const panel = () => screen.getByRole('tabpanel')
    expect(animated(panel()).length).toBeGreaterThan(0)
    seeEverything()

    await user.click(screen.getByRole('tab', { name: 'Comercialização' }))
    expect(animated(panel()).length).toBeGreaterThan(0)
    seeEverything()

    await user.click(screen.getByRole('tab', { name: 'Resultados financeiros' }))
    expect(animated(preview()).length).toBeGreaterThan(0)
    seeEverything()

    for (const name of ['Lavoura e custos', 'Comercialização', 'Resultados financeiros', 'Lavoura e custos']) {
      await user.click(screen.getByRole('tab', { name }))
      expect(animated(panel()).length).toBe(0)
    }
    // the matrix is still all there
    await user.click(screen.getByRole('tab', { name: 'Resultados financeiros' }))
    expect(screen.getByRole('img', { name: /Matriz 9 por 9/ }).querySelectorAll('i')).toHaveLength(81)
  })

  it('does not throw when the observer disappears while effects still run', async () => {
    const user = userEvent.setup()
    await renderScreen((ex) => <OQueOAppFaz ex={ex} />, undefined, /Do preço da bolsa/)
    removeIO()
    await act(async () => {
      await user.click(screen.getByRole('tab', { name: 'Resultados financeiros' }))
    })
    expect(within(screen.getByRole('tabpanel')).getByRole('heading', { level: 3 })).toBeInTheDocument()
  })
})

describe('instant updates', () => {
  it('A conta aberta: the matrix toggle replays nothing', async () => {
    const first = await renderScreen((ex) => <ContaECores ex={ex} />, undefined, /Você confere cada número/)
    seeEverything()
    first.unmount()
    const { container } = await renderScreen((ex) => <ContaECores ex={ex} />, undefined, /Você confere cada número/)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Com meta 5%' }))
    expect(animated(container)).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Sem meta' }))
    expect(animated(container)).toHaveLength(0)
  })

  it('Sua meta: the slider moves the meter and the result at once, with no transition', async () => {
    const first = await renderScreen((ex) => <SuaMeta ex={ex} />, undefined, /Diga quanto quer ganhar/)
    seeEverything()
    first.unmount()
    const { container } = await renderScreen((ex) => <SuaMeta ex={ex} />, undefined, /Diga quanto quer ganhar/)
    const meter = screen.getByRole('meter')
    const before = meter.getAttribute('aria-valuenow')
    const slider = screen.getByRole('slider')
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(slider, { target: { value: '12' } })
    expect(screen.getByRole('slider')).toHaveValue('12')
    expect(meter.getAttribute('aria-valuenow')).not.toBeNull()
    expect(meter.innerHTML).not.toMatch(/transition/)
    expect(before).not.toBeNull()
    expect(animated(container)).toHaveLength(0)
  })
})
