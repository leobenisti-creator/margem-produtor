import { act, fireEvent, screen, within } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { toneFor } from '../../engine/matrix'
import { fmtNum } from '../format'
import { installFakeIO, removeIO, renderInicio, seedSnapshot } from './testUtils'
import { buildLiveExample, exampleMarginAt } from './useLiveExample'
import { CBOT_SPAN_USC, FX_SPAN_CENTS } from './Capa'

vi.setConfig({ testTimeout: 15000 })
expect.extend(toHaveNoViolations)

beforeEach(() => {
  localStorage.clear()
  installFakeIO()
})
afterEach(() => removeIO())

const capa = () => document.getElementById('capa') as HTMLElement
const margem = () => screen.getByTestId('capa-margem')
const set = (el: HTMLElement, v: number) => act(() => void fireEvent.change(el, { target: { value: String(v) } }))

describe('Capa', () => {
  it('has the approved copy and a single action', async () => {
    await renderInicio()
    const c = within(capa())
    expect(c.getByText('Margem do produtor · Soja e milho')).toBeInTheDocument()
    expect(c.getByRole('heading', { level: 1 })).toHaveTextContent('Saiba quanto sobra por saca antes de vender.')
    const gold = [...capa().querySelectorAll('h1 .text-gold')].map((e) => e.textContent)
    expect(gold).toEqual(['por', 'saca'])
    expect(
      c.getByText(
        'Junte o custo, o preço do dia e o dólar numa conta só. Você vê cada linha e sabe o que sobra em cada saca.',
      ),
    ).toBeInTheDocument()
    expect(capa()).not.toHaveTextContent(/cadastro|2 minutos/)
    expect(c.queryByText('Ver exemplo')).toBeNull()
    expect(c.getAllByRole('button', { name: 'Descobrir minha margem →' })).toHaveLength(1)
    expect(c.queryAllByRole('link')).toHaveLength(0)
    expect(c.getByText('Role para ver como funciona')).toBeInTheDocument()
    expect(c.getByText('Exemplo ao vivo')).toBeInTheDocument()
    expect(c.getByText(/Exemplo ilustrativo/)).toBeInTheDocument()
  })

  it('market strip shows only the closing date, CBOT, dólar and prêmio do porto', async () => {
    await renderInicio()
    const c = within(capa())
    expect(c.getByText('Fechamento 26/10/2026')).toBeInTheDocument()
    const snap = seedSnapshot()
    expect(capa()).toHaveTextContent(`CBOT ${fmtNum(snap.cbotUsc.soja.value, 2)}`)
    expect(capa()).toHaveTextContent(`Dólar ${fmtNum(snap.fx.value, 4)}`)
    expect(capa()).toHaveTextContent(`Prêmio do porto ${fmtNum(snap.basisUsc.soja.value, 2)}`)
    expect(capa()).not.toHaveTextContent(/B3|SJC|Cepea|IMEA/)
  })

  it('starts at the closing margin, with the engine colour', async () => {
    await renderInicio()
    const ex = buildLiveExample(seedSnapshot())
    expect(margem()).toHaveTextContent(`R$ ${fmtNum(ex.marginPerSc, 2)}`)
    const tone = toneFor(ex.marginPct, null)
    expect(margem().querySelector('b')).toHaveAttribute('data-tone', String(tone))
  })

  it('sliders are labelled range inputs with the agreed spans', async () => {
    await renderInicio()
    const fx = screen.getByLabelText(/Dólar/) as HTMLInputElement
    const cbot = screen.getByLabelText(/CBOT soja/) as HTMLInputElement
    expect(fx).toHaveAttribute('type', 'range')
    expect(cbot).toHaveAttribute('type', 'range')
    expect(fx).toHaveAttribute('min', String(-FX_SPAN_CENTS))
    expect(fx).toHaveAttribute('max', String(FX_SPAN_CENTS))
    expect(cbot).toHaveAttribute('min', String(-CBOT_SPAN_USC))
    expect(cbot).toHaveAttribute('max', String(CBOT_SPAN_USC))
    expect(fx).toHaveAttribute('aria-valuetext')
  })

  it('moving the sliders recomputes the margin and the colour exactly like the engine helper', async () => {
    await renderInicio()
    const ex = buildLiveExample(seedSnapshot())
    const fxEl = screen.getByLabelText(/Dólar/) as HTMLElement
    const cbotEl = screen.getByLabelText(/CBOT soja/) as HTMLElement
    const base = exampleMarginAt(ex, ex.scenario.fx, ex.scenario.cbotUsc)
    expect(base.marginPerSc).toBeCloseTo(ex.marginPerSc as number, 9)

    set(fxEl, FX_SPAN_CENTS)
    set(cbotEl, CBOT_SPAN_USC)
    const hi = exampleMarginAt(ex, ex.scenario.fx + 0.3, ex.scenario.cbotUsc + 120)
    expect(hi.marginPerSc as number).toBeGreaterThan(base.marginPerSc as number)
    expect(margem()).toHaveTextContent(`R$ ${fmtNum(hi.marginPerSc, 2)}`)
    expect(margem().querySelector('b')).toHaveAttribute('data-tone', String(hi.tone))
    expect(fxEl).toHaveAttribute('aria-valuetext', `R$ ${fmtNum(ex.scenario.fx + 0.3, 2)}`)

    set(fxEl, -FX_SPAN_CENTS)
    set(cbotEl, -CBOT_SPAN_USC)
    const lo = exampleMarginAt(ex, ex.scenario.fx - 0.3, ex.scenario.cbotUsc - 120)
    expect(lo.marginPerSc as number).toBeLessThan(base.marginPerSc as number)
    expect(margem()).toHaveTextContent(`R$ ${fmtNum(lo.marginPerSc, 2)}`)
    expect(margem().querySelector('b')).toHaveAttribute('data-tone', String(lo.tone))
  })

  it('writes nothing to localStorage while the sliders move', async () => {
    await renderInicio()
    const spy = vi.spyOn(Storage.prototype, 'setItem')
    set(screen.getByLabelText(/Dólar/), 10)
    set(screen.getByLabelText(/CBOT soja/), -50)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('has no accessibility violations', async () => {
    await renderInicio()
    expect(await axe(capa())).toHaveNoViolations()
  })
})
