import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { cardDelta, riskCurve, simulate, zeroPoint, CHART_HALF, type RiskCtx, type RiskDriver } from '../../engine/riskSim'
import { mockMatchMedia } from '../../test/helpers'
import { renderWithStore } from '../../test/storeHarness'
import type { Action } from '../../state/types'
import { makeFmt } from './riskText'
import { SeuRisco } from './SeuRisco'
import { useRiskBase } from './useRiskBase'

expect.extend(toHaveNoViolations)
vi.setConfig({ testTimeout: 30000 })

beforeEach(() => {
  localStorage.clear()
  mockMatchMedia(true)
})

const FARM: Action[] = [
  { type: 'setInput', key: 'areaHa', value: 1000 },
  { type: 'setInput', key: 'yieldScHa', value: 60 },
]
const brlSale = (volume: number): Action => ({
  type: 'addSale',
  partial: { volume, volumeUnit: 'sc', price: 120, priceCurrency: 'BRL' },
})
const FUTURE: Action = {
  type: 'addHedgeOp',
  partial: { asset: 'dolar', kind: 'futuro', side: 'vendido', qty: 1_000_000, strike: 5.6 },
}

function Probe() {
  const ctx = useRiskBase()
  return <output data-testid="ctx-probe">{JSON.stringify(ctx)}</output>
}

const render = (actions: Action[] = FARM, opts?: Parameters<typeof renderWithStore>[2]) =>
  renderWithStore(
    <>
      <SeuRisco />
      <Probe />
    </>,
    actions,
    opts,
  )
const ctxOf = () => JSON.parse(screen.getByTestId('ctx-probe').textContent ?? '{}') as RiskCtx
const txt = (id: string) => screen.getByTestId(id).textContent ?? ''
const slider = (driver: RiskDriver) =>
  screen.getByRole('slider', {
    name: { dolar: 'Mudança em o dólar', cbot: 'Mudança em a bolsa', basis: 'Mudança em o basis' }[driver],
  }) as HTMLInputElement
const numberInput = () => screen.getByRole('textbox', { name: /Quanto supor/ }) as HTMLInputElement
const pressed = () =>
  (['dolar', 'cbot', 'basis'] as const).filter((d) => screen.getByTestId(`risk-card-${d}`).getAttribute('aria-pressed') === 'true')

describe('SeuRisco: selector cards', () => {
  it('three cards with the margin change for -1% / -R$ 1,00/sc, as the engine computes it with the locks', async () => {
    await render([...FARM, brlSale(18000), FUTURE])
    const ctx = ctxOf()
    const f = makeFmt('BRL', ctx.base.fx)
    for (const d of ['dolar', 'cbot', 'basis'] as const) {
      expect(txt(`risk-card-valor-${d}`)).toBe(f.signedCompact(cardDelta(ctx, d)!))
      expect(txt(`risk-card-valor-${d}`)).toMatch(/^[−+]R\$ [\d.,]+( mil| mi)?$/)
    }
    expect(txt('risk-card-dolar')).toContain('1% (R$ 0,0')
    expect(txt('risk-card-cbot')).toMatch(/1% \(\d+ US¢\)/)
    expect(txt('risk-card-basis')).toContain('R$ 1,00/sc')
    expect(document.body.textContent).toContain('Calculado sobre a sua posição de hoje (não muda com o cenário escolhido na matriz)')
  })

  it('the biggest loss is selected by default; clicking another card (and the arrow keys) switches the detail', async () => {
    const { user } = await render()
    const ctx = ctxOf()
    const ds = (['dolar', 'cbot', 'basis'] as const).map((d) => cardDelta(ctx, d)!)
    const worst = (['dolar', 'cbot', 'basis'] as const)[ds.indexOf(Math.min(...ds))]
    expect(pressed()).toEqual([worst])
    const other = worst === 'basis' ? 'cbot' : 'basis'
    await user.click(screen.getByTestId(`risk-card-${other}`))
    expect(pressed()).toEqual([other])
    if (other === 'basis') expect(screen.getByRole('heading', { name: 'De onde vem o seu basis' })).toBeInTheDocument()
    else expect(screen.getByRole('heading', { name: 'Detalhe: a bolsa' })).toBeInTheDocument()
    // roving: only the selected card is in the tab order; the arrows move the selection
    expect(screen.getByTestId(`risk-card-${other}`)).toHaveAttribute('tabindex', '0')
    screen.getByTestId(`risk-card-${other}`).focus()
    await user.keyboard('{ArrowRight}')
    expect(pressed()).toHaveLength(1)
    expect(pressed()[0]).not.toBe(other)
  })

  it('shows today, not the scenario chosen in the matrix (CBOT and dollar overrides are ignored)', async () => {
    await render([...FARM, { type: 'applyScenario', cbotUsc: 900, fx: 4.2 }])
    const ctx = ctxOf()
    expect(ctx.base.cbotUsc).not.toBe(900)
    expect(ctx.base.fx).not.toBe(4.2)
  })
})

describe('SeuRisco: E se mexer? (slider, number, results)', () => {
  it('slider and number input stay in sync both ways, and "zerar" goes back to 0', async () => {
    const { user } = await render([...FARM, brlSale(18000)])
    const driver = pressed()[0]
    fireEvent.change(slider(driver), { target: { value: '10' } })
    expect(numberInput().value).toBe('10')
    await user.clear(numberInput())
    await user.type(numberInput(), '-7,5')
    expect(slider(driver).value).toBe('-7.5')
    await user.click(screen.getByRole('button', { name: 'zerar' }))
    expect(slider(driver).value).toBe('0')
    expect(numberInput().value).toBe('0')
  })

  it('the results equal the engine with and without the locks, and "a trava vale" is their difference', async () => {
    await render([...FARM, brlSale(18000), FUTURE])
    const ctx = ctxOf()
    const f = makeFmt('BRL', ctx.base.fx)
    for (const d of ['dolar', 'cbot', 'basis'] as const) {
      fireEvent.click(screen.getByTestId(`risk-card-${d}`))
      const mv = d === 'basis' ? -3 : -12
      fireEvent.change(slider(d), { target: { value: String(mv) } })
      const s = simulate(ctx, d, mv)!
      expect(txt('risk-sim-with')).toBe(f.signedCompact(s.withLocks.delta))
      expect(txt('risk-sim-without')).toBe(f.signedCompact(s.noLocks.delta))
      expect(txt('risk-sim-lock')).toContain(f.signedCompact(s.lockValue))
      expect(txt('risk-sim-margin')).toBe(f.money(s.withLocks.at.margin / s.withLocks.at.productionSc))
      expect(txt('risk-sim-line')).toMatch(/em relação a hoje/)
    }
  })

  it('each driver keeps its own simulated move while switching cards', async () => {
    const { user } = await render()
    await user.click(screen.getByTestId('risk-card-dolar'))
    fireEvent.change(slider('dolar'), { target: { value: '20' } })
    await user.click(screen.getByTestId('risk-card-basis'))
    expect(slider('basis').value).toBe('0')
    await user.click(screen.getByTestId('risk-card-dolar'))
    expect(slider('dolar').value).toBe('20')
  })

  it('an extreme move that leaves the valid domain says so instead of showing NaN', async () => {
    await render()
    fireEvent.click(screen.getByTestId('risk-card-dolar'))
    fireEvent.change(slider('dolar'), { target: { value: '-100' } })
    expect(txt('risk-sim-erro')).toMatch(/Não é possível calcular/)
    expect(document.body.textContent).not.toMatch(/NaN|Infinity|undefined/)
  })
})

describe('SeuRisco: onde a margem zera, faixa inteira, blocos próprios', () => {
  it('the break-even text matches the engine and the chart marks it when it is inside the range', async () => {
    await render([...FARM, { type: 'setInput', key: 'yieldScHa', value: 55 }])
    const ctx = ctxOf()
    for (const d of ['dolar', 'cbot', 'basis'] as const) {
      fireEvent.click(screen.getByTestId(`risk-card-${d}`))
      const z = zeroPoint(ctx, d, true)
      const t = txt('risk-zero-text')
      if (z === null) expect(t).toMatch(/não chega a zero/)
      else expect(t).toMatch(z.fromNegative ? /já está negativa/ : /Sua margem zera com/)
      const marker = screen.queryByTestId('risk-zero-marker')
      expect(marker !== null).toBe(z !== null && Math.abs(z.move) <= CHART_HALF[d])
    }
  })

  it('the chart draws two lines, the zero line, the negative tint and "hoje"; the numbers table has 41 rows', async () => {
    await render([...FARM, brlSale(18000)])
    const ctx = ctxOf()
    const d = pressed()[0]
    const svg = screen.getByTestId('risk-chart')
    expect(svg).toHaveAttribute('role', 'img')
    expect(svg.getAttribute('aria-label')).toMatch(/Margem por saca em função de/)
    const com = screen.getByTestId('risk-line-com').getAttribute('points')!.trim().split(' ')
    const sem = screen.getByTestId('risk-line-sem').getAttribute('points')!.trim().split(' ')
    expect(com).toHaveLength(41)
    expect(sem).toHaveLength(41)
    expect(screen.getByTestId('risk-zero-line')).toBeInTheDocument()
    expect(screen.getByTestId('risk-hoje')).toBeInTheDocument()
    // the lines are named by the legend above the chart, not by labels drawn on it
    expect(svg.textContent).not.toContain('Com suas travas')
    expect(svg.textContent).not.toContain('Sem nada travado')
    expect(screen.getByTestId('risk-legenda')).toHaveTextContent('Com suas travas')
    expect(screen.getByTestId('risk-legenda')).toHaveTextContent('Sem nada travado')
    const rows = within(screen.getByTestId('risk-chart-table')).getAllByRole('row')
    expect(rows).toHaveLength(42)
    // the table is the engine curve
    const c = riskCurve(ctx, d)
    expect(rows[21].textContent).toContain('(hoje)')
    expect(c[20].withLocks).not.toBeNull()
  })

  it('a break-even inside the range shows its marker with the label', async () => {
    // Yield 52 puts the dollar/CBOT/basis zero close to today for this farm
    await render([...FARM, { type: 'setInput', key: 'yieldScHa', value: 52 }])
    const ctx = ctxOf()
    let seen = 0
    for (const d of ['dolar', 'cbot', 'basis'] as const) {
      fireEvent.click(screen.getByTestId(`risk-card-${d}`))
      const z = zeroPoint(ctx, d, true)
      if (z !== null && Math.abs(z.move) <= CHART_HALF[d]) {
        seen++
        expect(screen.getByTestId('risk-zero-marker').textContent).toMatch(/^zera em /)
      }
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('clicking the chart sets the slider to that point (snapped to the step); hovering shows both values', async () => {
    await render([...FARM, brlSale(18000), FUTURE])
    const d = pressed()[0]
    const svg = screen.getByTestId('risk-chart') as unknown as SVGSVGElement
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 330, right: 640, bottom: 330, x: 0, y: 0, toJSON: () => ({}) })
    const half = CHART_HALF[d]
    // x for a move of +half/2: L + PLOT_W * 3/4 with L = 50 and PLOT_W = 640 - 50 - 16 = 574 (width without a measure)
    const x = 50 + 574 * 0.75
    fireEvent.pointerMove(svg, { clientX: x })
    const cursor = screen.getByTestId('risk-cursor')
    expect(cursor.textContent).toMatch(/Com travas: .*\/sc/)
    expect(cursor.textContent).toMatch(/Sem travas: .*\/sc/)
    fireEvent.click(svg, { clientX: x })
    expect(Number(slider(d).value)).toBeCloseTo(half / 2, 6)
    expect(numberInput().value).toBe(String(half / 2).replace('.', ','))
  })

  it('dollar block: only what the state has, the +R$ 0,10 effect adds up', async () => {
    await render([...FARM, brlSale(18000)])
    fireEvent.click(screen.getByTestId('risk-card-dolar'))
    const block = screen.getByTestId('risk-bloco-dolar')
    expect(block.textContent).toContain('Cada R$ 0,10 a mais no dólar')
    expect(block.textContent).toMatch(/· receita/)
    expect(block.textContent).toMatch(/· custo/)
    expect(block.textContent).toMatch(/· no resultado/)
  })

  it('CBOT has no "A bolsa em reais" block, and the dollar and basis keep theirs', async () => {
    await render([...FARM, brlSale(18000)])
    fireEvent.click(screen.getByTestId('risk-card-cbot'))
    expect(screen.queryByTestId('risk-bloco-cbot')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'A bolsa em reais' })).toBeNull()
    expect(screen.getByTestId('risk-chart')).toBeInTheDocument()
  })

  it('the per-sack table starts with the price (the farm price at the scenario), before the revenue', async () => {
    await render([...FARM, brlSale(18000)])
    for (const d of ['dolar', 'cbot', 'basis'] as const) {
      fireEvent.click(screen.getByTestId(`risk-card-${d}`))
      const table = screen.getAllByRole('table').find((t) => t.textContent?.includes('Receita') && t.textContent?.includes('Margem'))!
      const names = within(table).getAllByRole('rowheader').map((h) => h.textContent)
      expect(names).toEqual(['Preço', 'Receita', 'Custo', 'Margem'])
      expect(within(screen.getByTestId('risk-sim-preco')).getAllByRole('cell')[0].textContent).toMatch(/R\$ [\d.,]+/)
    }
  })

  it('basis block: premium - freight - fees = basis, and the note that only a physical sale closes it', async () => {
    await render([...FARM, brlSale(18000)])
    fireEvent.click(screen.getByTestId('risk-card-basis'))
    const block = screen.getByTestId('risk-bloco-basis')
    expect(block.textContent).toContain('Prêmio do porto')
    expect(block.textContent).toContain('= Seu basis')
    expect(block.textContent).toContain('não existe operação de bolsa para ele')
    expect(txt('risk-basis-nota')).toContain('42.000 sc')
  })

  it('no recommendation anywhere', async () => {
    await render([...FARM, brlSale(18000)])
    for (const d of ['dolar', 'cbot', 'basis'] as const) {
      fireEvent.click(screen.getByTestId(`risk-card-${d}`))
      expect(document.body.textContent).not.toMatch(/trave agora|recomend|você deve/i)
    }
  })
})

describe('SeuRisco: moeda e estados vazios', () => {
  it('in US$ the money follows the top currency (cards, tiles, chart axis, table) at today dollar', async () => {
    await render([...FARM, brlSale(18000), { type: 'setCurrency', currency: 'USD' }])
    const ctx = ctxOf()
    const f = makeFmt('USD', ctx.base.fx)
    const d = pressed()[0]
    expect(txt(`risk-card-valor-${d}`)).toBe(f.signedCompact(cardDelta(ctx, d)!))
    expect(txt(`risk-card-valor-${d}`)).toContain('US$')
    fireEvent.change(slider(d), { target: { value: '-10' } })
    expect(txt('risk-sim-with')).toContain('US$')
    expect(txt('risk-sim-margin')).toContain('US$')
    expect(screen.getByTestId('risk-chart').textContent).toContain('Margem (US$ por saca)')
    const cells = within(screen.getByTestId('risk-chart-table')).getAllByRole('cell')
    expect(cells.length).toBeGreaterThan(80)
    for (const c of cells) expect(c.textContent).toMatch(/^US\$ |^−US\$ /)
  })

  it('no area/yield: a clear message and nothing else', async () => {
    await render([{ type: 'setInput', key: 'areaHa', value: 0 }])
    await waitFor(() => expect(screen.getByTestId('risk-vazio')).toBeInTheDocument())
    expect(txt('risk-vazio')).toMatch(/Informe área e produtividade/)
    expect(screen.queryByTestId('risk-card-dolar')).toBeNull()
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/)
  })

  it('no sales and no operations: it works, and the lock is worth nothing', async () => {
    await render(FARM)
    const d = pressed()[0]
    fireEvent.change(slider(d), { target: { value: '-10' } })
    const ctx = ctxOf()
    const s = simulate(ctx, d, -10)!
    expect(s.withLocks.at.soldSc).toBe(0)
    expect(txt('risk-sim-without')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/NaN|Infinity|undefined/)
  })
})

describe('SeuRisco: acessibilidade', () => {
  for (const d of ['dolar', 'cbot', 'basis'] as const) {
    it(`no axe violations with ${d} selected and a move simulated`, async () => {
      const { container } = await render([...FARM, brlSale(18000), FUTURE])
      fireEvent.click(screen.getByTestId(`risk-card-${d}`))
      fireEvent.change(slider(d), { target: { value: d === 'basis' ? '-4' : '-10' } })
      expect(await axe(container)).toHaveNoViolations()
    })
  }
})
