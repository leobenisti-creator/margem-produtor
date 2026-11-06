import userEvent from '@testing-library/user-event'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import {
  buildScenarioMatrix,
  farmBasisBrlSc,
  heldAxis,
  matrixBaseScenario,
  premiumForFarmBasis,
  stepsFromSize,
  type MatrixAxis,
} from '../engine/scenarioMatrix'
import { loadState } from '../state/persist'
import type { Action } from '../state/types'
import { StoreProvider } from '../state/StoreProvider'
import { readState, renderWithStore, StateProbe } from '../test/storeHarness'
import { fmtCompactMoney, fmtMarginPct, fmtSignedMoney } from './fmtExtra'
import { fmtAxisPct, fmtFx } from './matrixFormat'
import { fmtNum } from './format'
import { ResultadosMatrix, scenarioMatrixToCsv } from './ResultadosMatrix'
import { ResultsUnitProvider, useResultsUnit, type ResultsUnit } from './resultsUnit'
import { useResult } from './useResult'
import { useResultadosBase, type ResultadosBase } from './useResultadosBase'

expect.extend(toHaveNoViolations)
vi.setConfig({ testTimeout: 30000 })
beforeEach(() => localStorage.clear())

// 1.000 ha x 60 sc/ha = 60.000 sc
const FARM: Action[] = [
  { type: 'setInput', key: 'areaHa', value: 1000 },
  { type: 'setInput', key: 'yieldScHa', value: 60 },
]
const SALE: Action = { type: 'addSale', partial: { volume: 30000, volumeUnit: 'sc', price: 120, priceCurrency: 'BRL' } }
const FUTURE: Action = {
  type: 'addHedgeOp',
  partial: { kind: 'futuro', side: 'vendido', qty: 100_000, strike: 1300, maturityDate: '2027-03-31' },
}

// Page-level landmark rules do not apply to a card rendered alone.
const OPTS = { rules: { region: { enabled: false } } }

let base: ResultadosBase
let farmPrice = 0
let setUnit: (u: ResultsUnit) => void = () => {}
function Probe() {
  base = useResultadosBase()
  farmPrice = useResult().result.farmPriceBrl ?? 0
  setUnit = useResultsUnit().setUnit
  return null
}
const ui = (
  <ResultsUnitProvider>
    <ResultadosMatrix />
    <Probe />
  </ResultsUnitProvider>
)

const AX: Record<string, [MatrixAxis, MatrixAxis]> = {
  'CBOT × Dólar': ['cbot', 'dolar'],
  'Basis × Dólar': ['basis', 'dolar'],
  'CBOT × Basis': ['cbot', 'basis'],
}

/** The grid the engine builds for what the page shows now: the same inputs the component hands to it. */
function expected(rowAxis: MatrixAxis = 'cbot', colAxis: MatrixAxis = 'dolar') {
  const st = readState().matrix.resultSteps
  const held = heldAxis(rowAxis, colAxis)
  return buildScenarioMatrix({
    crop: base.crop,
    scenario: matrixBaseScenario(base.today, base.chosen, held),
    inputs: base.inputs,
    tranches: base.tranches,
    rowAxis,
    colAxis,
    lens: 'tudo',
    axisStepsPct: { cbot: stepsFromSize(st.cbotPct), dolar: stepsFromSize(st.fxPct) },
    basisSteps: stepsFromSize(st.basisBrl),
  })
}
const cell = (r: number, c: number) => screen.getByTestId(`matriz-celula-${r}-${c}`)
const compact = (n: number | null) => {
  if (n === null) return '—'
  return n < 0 ? `−${fmtCompactMoney(-n, 'BRL')}` : fmtCompactMoney(n, 'BRL')
}
const persc = (c: { perSc: number | null }) => `${fmtSignedMoney(c.perSc, 'BRL')}/sc`

type User = ReturnType<typeof userEvent.setup>
async function openAjustar(user: User) {
  const btn = screen.getByRole('button', { name: 'Ajustar' })
  if (btn.getAttribute('aria-expanded') !== 'true') await user.click(btn)
  return screen.getByTestId('matriz-ajustar-painel')
}
async function cross(user: User, name: string) {
  const panel = await openAjustar(user)
  await user.click(within(panel).getByRole('radio', { name }))
  await user.keyboard('{Escape}')
}
async function openHeld(user: User, name: string) {
  await user.click(screen.getByRole('button', { name }))
  return screen.getByTestId('matriz-held-painel')
}
async function typeIn(user: User, field: HTMLElement, text: string) {
  await user.clear(field)
  await user.type(field, text)
}
const heldField = (panel: HTMLElement) => within(panel).getByRole('textbox', { name: /Usar outro valor/ })

describe('ResultadosMatrix controls', () => {
  it('shows "Cruzando CBOT × Dólar", the held-basis button and Ajustar; no lens, unit or basis-simulation controls', async () => {
    await renderWithStore(ui, FARM)
    expect(screen.getByTestId('matriz-cruzando')).toHaveTextContent('Cruzando CBOT × Dólar')
    expect(screen.getByRole('button', { name: 'Alterar basis' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajustar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Voltar ao/ })).toBeNull()
    expect(screen.queryByTestId('matriz-lente')).toBeNull()
    expect(screen.queryByRole('radio', { name: 'Falta fixar' })).toBeNull()
    expect(screen.queryByTestId('matriz-unidade')).toBeNull()
    expect(screen.queryByTestId('matriz-basis-botao')).toBeNull()
    expect(screen.queryByText('Simular basis')).toBeNull()
    expect(screen.getAllByRole('button', { name: /^CBOT / })).toHaveLength(81)
    expect(screen.getByTestId('matriz-tabela').querySelector('caption')).toBeInTheDocument()
    expect(screen.getAllByText('● hoje')).toHaveLength(2)
    expect(within(screen.getByTestId('matriz-hoje')).getByTestId('matriz-celula-4-4')).toBeInTheDocument()
    // nothing picked: the DRE shows today, so the centre cell carries the mark of the chosen scenario, and only it
    expect(screen.getAllByTestId('matriz-escolhida')).toHaveLength(1)
    expect(within(screen.getByTestId('matriz-hoje')).getByTestId('matriz-escolhida')).toBeInTheDocument()
  })

  it('renders the headerAction first in the card, above the controls', async () => {
    await renderWithStore(
      <>
        <ResultadosMatrix headerAction={<button type="button">Formação do preço da fazenda</button>} />
        <Probe />
      </>,
      FARM,
    )
    const card = screen.getByTestId('card-matriz')
    const action = within(card).getByRole('button', { name: 'Formação do preço da fazenda' })
    const controls = screen.getByTestId('matriz-controles')
    expect(action.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(card.querySelector('button')).toBe(action)
  })

  it('Ajustar offers Cruzar, Mostrar and one step size per axis; Esc closes it and returns the focus', async () => {
    const { user } = await renderWithStore(ui, FARM)
    expect(screen.queryByTestId('matriz-ajustar-painel')).toBeNull()
    const btn = screen.getByRole('button', { name: 'Ajustar' })
    await user.click(btn)
    const panel = screen.getByTestId('matriz-ajustar-painel')
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    expect(within(within(panel).getByRole('radiogroup', { name: 'Cruzar' })).getAllByRole('radio').map((r) => r.textContent)).toEqual([
      'CBOT × Dólar',
      'Basis × Dólar',
      'CBOT × Basis',
    ])
    expect(within(within(panel).getByRole('radiogroup', { name: 'Mostrar' })).getAllByRole('radio').map((r) => r.textContent)).toEqual([
      'Margem',
      'Preço da fazenda',
    ])
    expect(within(panel).getByText('Tamanho do passo (cada quadrado)')).toBeInTheDocument()
    expect(within(panel).getByRole('textbox', { name: /Passo do CBOT/ })).toHaveValue('2,5')
    expect(within(panel).getByRole('textbox', { name: /Passo do Dólar/ })).toHaveValue('2,5')
    expect(within(panel).getByRole('textbox', { name: /Passo do Basis/ })).toHaveValue('1')
    expect(within(panel).getByText('A matriz vai de −4 a +4 passos.')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('matriz-ajustar-painel')).toBeNull()
    expect(btn).toHaveFocus()
    await user.click(btn)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByTestId('matriz-ajustar-painel')).toBeNull()
  })

  it('the radios move with the arrow keys', async () => {
    const { user } = await renderWithStore(ui, FARM)
    const panel = await openAjustar(user)
    const first = within(panel).getByRole('radio', { name: 'CBOT × Dólar' })
    first.focus()
    await user.keyboard('{ArrowDown}')
    expect(within(panel).getByRole('radio', { name: 'Basis × Dólar' })).toHaveFocus()
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(within(panel).getByRole('radio', { name: 'CBOT × Basis' })).toHaveFocus()
  })

  it('each crossing names its held driver: basis, CBOT or dollar', async () => {
    const { user } = await renderWithStore(ui, FARM)
    await cross(user, 'Basis × Dólar')
    expect(screen.getByTestId('matriz-cruzando')).toHaveTextContent('Cruzando Basis × Dólar')
    expect(screen.getByRole('button', { name: 'Alterar CBOT' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Alterar basis' })).toBeNull()
    await cross(user, 'CBOT × Basis')
    expect(screen.getByTestId('matriz-cruzando')).toHaveTextContent('Cruzando CBOT × Basis')
    expect(screen.getByRole('button', { name: 'Alterar dólar' })).toBeInTheDocument()
    await cross(user, 'CBOT × Dólar')
    expect(screen.getByRole('button', { name: 'Alterar basis' })).toBeInTheDocument()
  })
})

describe('ResultadosMatrix cells', () => {
  it('every cell of every crossing equals the engine matrix (margin %, amount, tone)', async () => {
    const { user } = await renderWithStore(ui, [...FARM, SALE, FUTURE])
    for (const [name, [row, col]] of Object.entries(AX)) {
      await cross(user, name)
      const m = expected(row, col)
      for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++) {
          const x = m.cells[r][c]
          expect(cell(r, c)).toHaveTextContent(fmtMarginPct(x.pct))
          expect(cell(r, c)).toHaveTextContent(persc(x))
          expect(cell(r, c)).toHaveAttribute('data-tone', String(x.tone))
        }
    }
  })

  it('centre cell with nothing fixed = production x (farm price - cost per sack)', async () => {
    await renderWithStore(ui, FARM)
    const m = expected()
    const p = m.cells[4][4].parts!
    expect(p.soldRevenue).toBe(0)
    expect(p.hedge).toBe(0)
    expect(p.revenue).toBeCloseTo(60000 * farmPrice, 4)
    expect(m.cells[4][4].total).toBeCloseTo(60000 * farmPrice - p.cost, 4)
    expect(cell(4, 4)).toHaveTextContent(persc(m.cells[4][4]))
  })

  it('the % has one decimal on the desktop and none on the phone, which shows only the %', async () => {
    await renderWithStore(ui, FARM)
    const x = expected().cells[3][5]
    const c = cell(3, 5)
    const phone = c.querySelector('span.block')!
    expect(phone.className).toContain('min-[560px]:hidden')
    expect(phone).toHaveTextContent(`${fmtNum((x.pct ?? 0) * 100, 0)}%`)
    const desk = c.querySelector('span.hidden')!
    expect(desk.className).toContain('min-[560px]:block')
    expect(desk).toHaveTextContent(fmtMarginPct(x.pct))
    // the amount is desktop only
    expect(c.querySelector('small')!.className).toContain('hidden')
    expect(c.querySelector('small')!.className).toContain('min-[560px]:block')
    // the axis units are dropped on the phone
    expect(within(screen.getByTestId('matriz-tabela')).getAllByText('US¢/bu')[0].className).toContain('hidden')
  })

  it('the amount under the % follows the unit of the page: R$/sc, R$/ha, R$ total', async () => {
    await renderWithStore(ui, [...FARM, SALE])
    const x = expected().cells[2][6]
    expect(cell(2, 6)).toHaveTextContent(persc(x))
    act(() => setUnit('ha'))
    expect(cell(2, 6)).toHaveTextContent(`${compact(x.perHa)}/ha`)
    expect(cell(2, 6)).not.toHaveTextContent('/sc')
    act(() => setUnit('total'))
    expect(cell(2, 6)).toHaveTextContent(compact(x.total))
    expect(cell(2, 6)).not.toHaveTextContent('/ha')
    expect(screen.getByTestId('matriz-cenario')).toHaveTextContent(compact(expected().cells[4][4].total))
    act(() => setUnit('sc'))
    expect(cell(2, 6)).toHaveTextContent(persc(x))
  })

  it('money follows the top currency (US$ at the dollar of the scenario)', async () => {
    await renderWithStore(ui, [...FARM, { type: 'setCurrency', currency: 'USD' }])
    expect(cell(4, 4).textContent).toContain('US$')
    expect(cell(4, 4).textContent).not.toContain('R$')
  })

  it('"Preço da fazenda" shows the farm price of each cell', async () => {
    const { user } = await renderWithStore(ui, FARM)
    const panel = await openAjustar(user)
    await user.click(within(panel).getByRole('radio', { name: 'Preço da fazenda' }))
    const c = expected().cells[3][5]
    expect(cell(3, 5)).toHaveTextContent(fmtSignedMoney(c.priceBrl, 'BRL'))
    expect(cell(3, 5)).toHaveTextContent('por saca')
    expect(cell(3, 5)).not.toHaveTextContent('%')
    expect(within(panel).getByRole('radio', { name: 'Preço da fazenda' })).toHaveAttribute('aria-checked', 'true')
    await user.click(within(panel).getByRole('radio', { name: 'Margem' }))
    expect(cell(3, 5)).toHaveTextContent(fmtMarginPct(c.pct))
  })

  it('switching the axes changes the headers and the cells', async () => {
    const { user } = await renderWithStore(ui, FARM)
    const table = screen.getByTestId('matriz-tabela')
    expect(within(table).getAllByText(/US¢\/bu/).length).toBeGreaterThan(0)
    await cross(user, 'Basis × Dólar')
    expect(within(table).queryByText(/US¢\/bu/)).toBeNull()
    expect(within(table).getAllByText('/sc').length).toBeGreaterThan(0)
    expect(within(table).getByText('+R$ 2,00')).toBeInTheDocument()
    const m = expected('basis', 'dolar')
    expect(cell(0, 4)).toHaveTextContent(persc(m.cells[0][4]))
    // the basis level is the farm price minus the CBOT
    const level = farmBasisBrlSc(base.crop, base.today, base.inputs)!
    expect(level).toBeLessThan(0)
    expect(m.rowValues[4]).toBeCloseTo(level, 6)
    await cross(user, 'CBOT × Basis')
    expect(screen.getByRole('columnheader', { name: /Basis →/ })).toBeInTheDocument()
  })

  it('the legend: perde, margem baixa (até 10%), margem boa and the solid outline of the shown scenario', async () => {
    await renderWithStore(ui, FARM)
    const l = screen.getByTestId('matriz-legenda')
    for (const t of ['Perde', 'Margem baixa (até 10%)', 'Margem boa', 'contorno cheio = cenário mostrado']) expect(l).toHaveTextContent(t)
    expect(l).not.toHaveTextContent('tracejado')
  })

  it('the centre cell (today) has no dotted outline: only the cell the producer picks is outlined', async () => {
    await renderWithStore(ui, FARM)
    const centre = within(screen.getByTestId('matriz-hoje')).getByRole('button')
    expect(centre.className).not.toMatch(/outline-dashed/)
    expect(screen.getByTestId('matriz-hoje').querySelector('[class*="outline-dashed"]')).toBeNull()
  })

  it('the legend names the target band when there is a margin target', async () => {
    await renderWithStore(ui, [...FARM, { type: 'setTargetMargin', value: 0.2 }])
    const l = screen.getByTestId('matriz-legenda')
    expect(l).toHaveTextContent('Bate a meta de 20,0%')
    expect(l).toHaveTextContent('Até 5 p.p. abaixo da meta')
  })
})

describe('ResultadosMatrix scenario shown and clicks', () => {
  it('the caption "Cenário mostrado" gives CBOT, dollar, basis and the margin of today, then of the clicked cell', async () => {
    const { user } = await renderWithStore(ui, FARM)
    const cap = screen.getByTestId('matriz-cenario')
    const today = expected().cells[4][4]
    expect(cap).toHaveTextContent('Cenário mostrado:')
    expect(cap).toHaveTextContent(`${fmtNum(base.today.cbotUsc, 2)} US¢`.replace(',00', ''))
    expect(cap).toHaveTextContent(`R$ ${fmtFx(base.today.fx)}`)
    const level = farmBasisBrlSc(base.crop, base.today, base.inputs)!
    expect(cap).toHaveTextContent(`basis −R$ ${fmtNum(Math.abs(level), 2)}/sc`)
    expect(cap).toHaveTextContent(`margem ${fmtMarginPct(today.pct)} · ${persc(today)}`)
    const m = expected()
    await user.click(cell(2, 6))
    const x = m.cells[2][6]
    expect(screen.getByTestId('matriz-cenario')).toHaveTextContent(`margem ${fmtMarginPct(x.pct)} · ${persc(x)}`)
    expect(screen.getByTestId('matriz-cenario')).toHaveTextContent(`R$ ${fmtFx(x.scenario.fx)}`)
  })

  it('clicking a cell applies it as the chosen scenario and the centre resets', async () => {
    const { user } = await renderWithStore(ui, FARM)
    const m = expected()
    await user.click(cell(2, 6))
    const o = readState().overrides
    expect(o.cbotUsc).toBeCloseTo(m.cells[2][6].scenario.cbotUsc, 6)
    expect(o.fx).toBeCloseTo(m.cells[2][6].scenario.fx, 6)
    expect(o.basisUsc).toBeUndefined()
    expect(o.simBasisUsc).toBeUndefined()
    expect(within(cell(2, 6).closest('td')!).getByTestId('matriz-escolhida')).toBeInTheDocument()
    await user.click(cell(4, 4))
    expect(readState().overrides.cbotUsc).toBeUndefined()
    expect(readState().overrides.fx).toBeUndefined()
    // back to today: the mark is on the centre cell again (and only there)
    expect(screen.getAllByTestId('matriz-escolhida')).toHaveLength(1)
    expect(within(screen.getByTestId('matriz-hoje')).getByTestId('matriz-escolhida')).toBeInTheDocument()
  })

  it('a click on a basis cell is a simulation: Lavoura e custos keeps its premium, and the centre click clears it', async () => {
    const { user } = await renderWithStore(ui, [...FARM, { type: 'override', key: 'basisUsc', value: 66 }])
    await cross(user, 'Basis × Dólar')
    const m = expected('basis', 'dolar')
    await user.click(cell(2, 4))
    const o = readState().overrides
    expect(o.simBasisUsc).toBeCloseTo(m.cells[2][4].scenario.basisUsc, 9)
    expect(o.basisUsc).toBe(66)
    expect(base.today.basisUsc).toBe(66) // the grid stays centred on the basis of Lavoura e custos
    expect(base.chosen.basisUsc).toBeCloseTo(m.cells[2][4].scenario.basisUsc, 9)
    expect(within(cell(2, 4).closest('td')!).getByTestId('matriz-escolhida')).toBeInTheDocument()
    await user.click(cell(4, 4))
    expect(readState().overrides.simBasisUsc).toBeUndefined()
    expect(readState().overrides.basisUsc).toBe(66)
  })

  it('moves with the arrows over a roving tabindex', async () => {
    const { user } = await renderWithStore(ui, FARM)
    expect(cell(4, 4)).toHaveAttribute('tabindex', '0')
    expect(cell(0, 0)).toHaveAttribute('tabindex', '-1')
    cell(4, 4).focus()
    await user.keyboard('{ArrowRight}')
    expect(cell(4, 5)).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(cell(5, 5)).toHaveFocus()
    await user.keyboard('{Home}')
    expect(cell(5, 0)).toHaveFocus()
    await user.keyboard('{Control>}{End}{/Control}')
    expect(cell(8, 8)).toHaveFocus()
    await user.keyboard('{ArrowRight}{ArrowDown}')
    expect(cell(8, 8)).toHaveFocus()
    expect(cell(8, 8)).toHaveAttribute('tabindex', '0')
    expect(cell(4, 4)).toHaveAttribute('tabindex', '-1')
    await user.keyboard('{Enter}')
    expect(readState().overrides.cbotUsc).toBeDefined()
  })

  it('shows the decomposition in a floating card on hover and closes it on Esc', async () => {
    const { user } = await renderWithStore(ui, [...FARM, SALE, FUTURE])
    await user.hover(cell(2, 6))
    const card = screen.getByTestId('matriz-cartao')
    expect(card.parentElement).toBe(document.body)
    for (const t of [
      'Receita vendida',
      'Receita do que está em aberto',
      'Resultado das operações',
      'Receita total',
      'Custos',
      'Margem',
      'Preço da fazenda',
      'CBOT',
      'Dólar',
      'Basis',
    ])
      expect(card).toHaveTextContent(t)
    const p = expected().cells[2][6].parts!
    expect(card).toHaveTextContent(fmtSignedMoney(p.margin, 'BRL'))
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('matriz-cartao')).toBeNull()
    await user.hover(cell(1, 1))
    expect(screen.getByTestId('matriz-cartao')).toBeInTheDocument()
    await user.unhover(cell(1, 1))
    expect(screen.queryByTestId('matriz-cartao')).toBeNull()
    act(() => {
      cell(3, 3).focus()
    })
    expect(screen.getByTestId('matriz-cartao')).toBeInTheDocument()
    fireEvent.scroll(window)
    await waitFor(() => expect(screen.queryByTestId('matriz-cartao')).toBeNull())
  })
})

describe('ResultadosMatrix held driver', () => {
  it('basis (CBOT × Dólar): shows the market basis, a typed value drives the cells and the scenario, and "Voltar" restores it', async () => {
    const { user } = await renderWithStore(ui, FARM)
    const market = farmBasisBrlSc(base.crop, base.today, base.inputs)!
    const panel = await openHeld(user, 'Alterar basis')
    expect(within(panel).getByTestId('matriz-held-mercado')).toHaveTextContent(`${fmtSignedMoney(market, 'BRL')}/sc`)
    expect(within(panel).getByText('Basis de mercado hoje')).toBeInTheDocument()
    expect(heldField(panel)).toHaveValue(market.toFixed(2).replace('.', ',').replace(/,?0$/, ''))
    const before = cell(4, 4).textContent
    await typeIn(user, heldField(panel), '-2,5')

    const o = readState().overrides
    const prem = premiumForFarmBasis(base.crop, base.today, base.inputs, -2.5)!
    expect(o.simBasisUsc).toBeCloseTo(prem, 9)
    expect(farmBasisBrlSc(base.crop, base.chosen, base.inputs)!).toBeCloseTo(-2.5, 9)
    // the grid is the engine's, with the basis held at the typed value
    const m = expected()
    expect(m.cells[4][4].scenario.basisUsc).toBeCloseTo(prem, 9)
    for (const [r, c] of [
      [4, 4],
      [0, 8],
      [7, 2],
    ])
      expect(cell(r, c)).toHaveTextContent(fmtMarginPct(m.cells[r][c].pct))
    expect(cell(4, 4).textContent).not.toBe(before)
    expect(screen.getByTestId('matriz-cenario')).toHaveTextContent('basis −R$ 2,50/sc')
    expect(screen.getByTestId('matriz-cenario')).toHaveTextContent(`margem ${fmtMarginPct(m.cells[4][4].pct)}`)

    const back = screen.getByRole('button', { name: 'Voltar ao basis de mercado' })
    await user.click(back)
    expect(readState().overrides.simBasisUsc).toBeUndefined()
    expect(screen.queryByRole('button', { name: /Voltar ao/ })).toBeNull()
    expect(cell(4, 4).textContent).toBe(before)
  })

  it('typing the market basis again is not an alteration', async () => {
    const { user } = await renderWithStore(ui, FARM)
    const market = farmBasisBrlSc(base.crop, base.today, base.inputs)!
    const panel = await openHeld(user, 'Alterar basis')
    await typeIn(user, heldField(panel), '-1')
    expect(screen.getByRole('button', { name: 'Voltar ao basis de mercado' })).toBeInTheDocument()
    await typeIn(user, heldField(panel), market.toFixed(6).replace('.', ','))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Voltar ao/ })).toBeNull())
  })

  it('never touches what the producer typed in Lavoura e custos, and the "market" basis is the Lavoura one', async () => {
    const { user } = await renderWithStore(ui, [...FARM, { type: 'override', key: 'basisUsc', value: 66 }])
    const lavoura = JSON.stringify({ i: readState().inputs, f: readState().fobId, c: readState().customBasisUsc, b: readState().overrides.basisUsc })
    expect(base.today.basisUsc).toBe(66)
    const market = farmBasisBrlSc(base.crop, base.today, base.inputs)!
    const panel = await openHeld(user, 'Alterar basis')
    expect(within(panel).getByTestId('matriz-held-mercado')).toHaveTextContent(fmtSignedMoney(market, 'BRL'))
    await typeIn(user, heldField(panel), '3,2')
    expect(readState().overrides.simBasisUsc).toBeDefined()
    const now = () => JSON.stringify({ i: readState().inputs, f: readState().fobId, c: readState().customBasisUsc, b: readState().overrides.basisUsc })
    expect(now()).toBe(lavoura)
    await user.click(screen.getByRole('button', { name: 'Voltar ao basis de mercado' }))
    expect(now()).toBe(lavoura)
    expect(readState().overrides.simBasisUsc).toBeUndefined()
    expect(base.today.basisUsc).toBe(66)
  })

  it('CBOT (Basis × Dólar): shows the market CBOT; a typed value is the CBOT of every cell and of the scenario', async () => {
    const { user } = await renderWithStore(ui, FARM)
    await cross(user, 'Basis × Dólar')
    const panel = await openHeld(user, 'Alterar CBOT')
    expect(within(panel).getByText('CBOT de mercado hoje')).toBeInTheDocument()
    expect(within(panel).getByTestId('matriz-held-mercado')).toHaveTextContent(`${fmtNum(base.today.cbotUsc, 2)} US¢/bu`)
    const before = cell(4, 4).textContent
    await typeIn(user, heldField(panel), '1300')
    expect(readState().overrides.cbotUsc).toBe(1300)
    const m = expected('basis', 'dolar')
    expect(m.cells[2][6].scenario.cbotUsc).toBe(1300)
    expect(cell(2, 6)).toHaveTextContent(fmtMarginPct(m.cells[2][6].pct))
    expect(cell(4, 4).textContent).not.toBe(before)
    expect(screen.getByTestId('matriz-cenario')).toHaveTextContent('1.300 US¢')
    // a click keeps the held CBOT
    await user.click(cell(2, 6))
    expect(readState().overrides.cbotUsc).toBe(1300)
    expect(readState().overrides.simBasisUsc).toBeCloseTo(m.cells[2][6].scenario.basisUsc, 9)
    await user.click(screen.getByRole('button', { name: 'Voltar ao CBOT de mercado' }))
    expect(readState().overrides.cbotUsc).toBeUndefined()
    expect(screen.queryByRole('button', { name: /Voltar ao CBOT/ })).toBeNull()
    expect(readState().overrides.basisUsc).toBeUndefined()
  })

  it('dollar (CBOT × Basis): shows the market dollar; a typed value drives the cells; "Voltar" restores it', async () => {
    const { user } = await renderWithStore(ui, FARM)
    await cross(user, 'CBOT × Basis')
    const panel = await openHeld(user, 'Alterar dólar')
    expect(within(panel).getByText('Dólar de mercado hoje')).toBeInTheDocument()
    expect(within(panel).getByTestId('matriz-held-mercado')).toHaveTextContent(`R$ ${fmtFx(base.today.fx)}`)
    await typeIn(user, heldField(panel), '6,1')
    expect(readState().overrides.fx).toBe(6.1)
    const m = expected('cbot', 'basis')
    expect(m.cells[3][3].scenario.fx).toBe(6.1)
    expect(cell(3, 3)).toHaveTextContent(fmtMarginPct(m.cells[3][3].pct))
    expect(screen.getByTestId('matriz-cenario')).toHaveTextContent('R$ 6,10')
    await user.click(screen.getByRole('button', { name: 'Voltar ao dólar de mercado' }))
    expect(readState().overrides.fx).toBeUndefined()
    expect(screen.queryByRole('button', { name: /Voltar ao/ })).toBeNull()
  })

  it('rejects a CBOT or dollar that is not positive, keeping the previous value', async () => {
    const { user } = await renderWithStore(ui, FARM)
    await cross(user, 'CBOT × Basis')
    const panel = await openHeld(user, 'Alterar dólar')
    await typeIn(user, heldField(panel), '0')
    expect(await within(panel).findByRole('alert')).toHaveTextContent('maior que zero')
    expect(readState().overrides.fx).toBeUndefined()
  })

  it('the held button, the popover and the "voltar" button work from the keyboard', async () => {
    const { user } = await renderWithStore(ui, FARM)
    const btn = screen.getByRole('button', { name: 'Alterar basis' })
    btn.focus()
    await user.keyboard('{Enter}')
    const panel = screen.getByTestId('matriz-held-painel')
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    await user.tab()
    expect(heldField(panel)).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('matriz-held-painel')).toBeNull()
    expect(btn).toHaveFocus()
  })

  it('the centre of a grid whose held basis was altered picks that scenario (the simulation stays); Lavoura e custos is untouched', async () => {
    const { user } = await renderWithStore(ui, [...FARM, { type: 'override', key: 'basisUsc', value: 66 }])
    const panel = await openHeld(user, 'Alterar basis')
    await typeIn(user, heldField(panel), '4')
    expect(readState().overrides.simBasisUsc).toBeDefined()
    await user.keyboard('{Escape}')
    await user.click(cell(4, 4)) // the centre of a held-altered grid is not "today": it picks that scenario
    expect(readState().overrides.simBasisUsc).toBeDefined()
    expect(readState().overrides.basisUsc).toBe(66)
  })
})

describe('ResultadosMatrix step sizes', () => {
  it('the headers and cells follow the size typed for each axis', async () => {
    const { user } = await renderWithStore(ui, FARM)
    const table = screen.getByTestId('matriz-tabela')
    expect(table).toHaveTextContent(fmtAxisPct(10))
    expect(table).not.toHaveTextContent(fmtAxisPct(20))
    const panel = await openAjustar(user)
    await typeIn(user, within(panel).getByRole('textbox', { name: /Passo do CBOT/ }), '5')
    expect(readState().matrix.resultSteps).toEqual({ cbotPct: 5, fxPct: 2.5, basisBrl: 1 })
    let m = expected()
    expect(m.rowDelta).toEqual([-20, -15, -10, -5, 0, 5, 10, 15, 20])
    expect(m.colDelta).toEqual([-10, -7.5, -5, -2.5, 0, 2.5, 5, 7.5, 10])
    expect(table).toHaveTextContent(fmtAxisPct(20))
    expect(table).toHaveTextContent(fmtAxisPct(7.5))
    expect(cell(0, 8)).toHaveTextContent(fmtMarginPct(m.cells[0][8].pct))
    await typeIn(user, within(panel).getByRole('textbox', { name: /Passo do Dólar/ }), '1')
    m = expected()
    expect(m.colDelta).toEqual([-4, -3, -2, -1, 0, 1, 2, 3, 4])
    expect(cell(5, 1)).toHaveTextContent(fmtMarginPct(m.cells[5][1].pct))
    expect(m.cells[5][1].scenario.fx).toBeCloseTo(base.today.fx * 0.97, 4)
    // the basis axis
    await user.click(within(panel).getByRole('radio', { name: 'Basis × Dólar' }))
    await typeIn(user, within(panel).getByRole('textbox', { name: /Passo do Basis/ }), '0,5')
    m = expected('basis', 'dolar')
    expect(m.rowDelta).toEqual([-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2])
    expect(table).toHaveTextContent('+R$ 2,00')
    expect(cell(8, 4)).toHaveTextContent(fmtMarginPct(m.cells[8][4].pct))
    expect(readState().matrix.stepsPct).toEqual([2.5, 5, 10, 20]) // the Simulador steps are another setting
  })

  it('refuses a step that is zero, negative or too large and keeps the grid', async () => {
    const { user } = await renderWithStore(ui, FARM)
    const panel = await openAjustar(user)
    const cbot = within(panel).getByRole('textbox', { name: /Passo do CBOT/ })
    await typeIn(user, cbot, '0')
    expect(await within(panel).findByText('O passo deve ser maior que zero.')).toBeInTheDocument()
    expect(readState().matrix.resultSteps.cbotPct).toBe(2.5)
    // Typing commits every valid prefix ("3"), so the grid keeps the last valid size while the error shows.
    await typeIn(user, cbot, '30')
    expect(await within(panel).findByText(/menor que 25%/)).toBeInTheDocument()
    expect(readState().matrix.resultSteps.cbotPct).toBe(3)
    await typeIn(user, cbot, '-1')
    expect(readState().matrix.resultSteps.cbotPct).toBe(3)
    await typeIn(user, cbot, '25')
    expect(readState().matrix.resultSteps.cbotPct).toBe(2)
    const basis = within(panel).getByRole('textbox', { name: /Passo do Basis/ })
    await typeIn(user, basis, '0')
    expect(readState().matrix.resultSteps.basisBrl).toBe(1)
    expect(screen.getByTestId('matriz-tabela')).not.toHaveTextContent(fmtAxisPct(100))
  })

  it('persists the sizes: they survive a reload', async () => {
    const { user, unmount } = await renderWithStore(ui, FARM)
    const panel = await openAjustar(user)
    await typeIn(user, within(panel).getByRole('textbox', { name: /Passo do CBOT/ }), '4')
    await typeIn(user, within(panel).getByRole('textbox', { name: /Passo do Basis/ }), '0,25')
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(loadState()?.matrix?.resultSteps).toEqual({ cbotPct: 4, fxPct: 2.5, basisBrl: 0.25 })
    unmount()
    // A new session reads the storage (renderWithStore would seed it again).
    render(
      <StoreProvider>
        {ui}
        <StateProbe />
      </StoreProvider>,
    )
    await screen.findByTestId('state-probe')
    expect(readState().matrix.resultSteps).toEqual({ cbotPct: 4, fxPct: 2.5, basisBrl: 0.25 })
    expect(screen.getByTestId('matriz-tabela')).toHaveTextContent(fmtAxisPct(16))
  })
})

describe('ResultadosMatrix other', () => {
  it('exports the shown values as CSV (from Ajustar) with a BOM, and reports a failure', async () => {
    const blobs: Blob[] = []
    const create = vi.fn((b: Blob) => {
      blobs.push(b)
      return 'blob:x'
    })
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() })
    const { user } = await renderWithStore(ui, FARM)
    await user.click(await within(await openAjustar(user)).findByTestId('matriz-csv'))
    expect(create).toHaveBeenCalledTimes(1)
    const bytes = await new Promise<Uint8Array>((res) => {
      const fr = new FileReader()
      fr.onload = () => res(new Uint8Array(fr.result as ArrayBuffer))
      fr.readAsArrayBuffer(blobs[0])
    })
    const m = expected()
    const csv = scenarioMatrixToCsv(m, 'pct', (v) => v)
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf])
    expect(new TextDecoder().decode(bytes.slice(3))).toBe(csv)
    const lines = csv.split('\n')
    expect(lines).toHaveLength(10)
    expect(lines[0].startsWith('CBOT \\ Dólar;')).toBe(true)
    expect(lines[5].split(';')).toHaveLength(10)
    expect(lines[5]).toMatch(/^[^;]*\(hoje\);-?\d+,\d+/)
    expect(csv).not.toMatch(/NaN|undefined|Infinity/)
    expect(scenarioMatrixToCsv(m, 'price', (v) => v)).toMatch(/\d+,\d\d/)

    create.mockImplementation(() => {
      throw new Error('no')
    })
    await user.click(within(await openAjustar(user)).getByTestId('matriz-csv'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível baixar a matriz')
  })

  it('says so when there is no production or no market price', async () => {
    await renderWithStore(ui, [{ type: 'setInput', key: 'areaHa', value: 0 }])
    expect(screen.getByText('Informe área e produtividade para ver a matriz.')).toBeInTheDocument()
    expect(screen.queryByTestId('matriz-tabela')).toBeNull()
    expect(screen.getByRole('button', { name: 'Ajustar' })).toBeInTheDocument()
  })

  it('says so when the dollar is unusable', async () => {
    await renderWithStore(ui, FARM, { fx: 0 })
    expect(screen.getByText('Sem preço de CBOT ou dólar para montar a matriz.')).toBeInTheDocument()
    expect(screen.queryByTestId('matriz-tabela')).toBeNull()
  })

  it('never prints NaN, Infinity or undefined, and names every control', async () => {
    const { user } = await renderWithStore(ui, [...FARM, SALE, FUTURE])
    for (const name of ['Basis × Dólar', 'CBOT × Basis', 'CBOT × Dólar']) {
      await cross(user, name)
      for (const u of ['sc', 'ha', 'total'] as const) {
        act(() => setUnit(u))
        expect(screen.getByTestId('card-matriz').textContent).not.toMatch(/NaN|Infinity|undefined/)
      }
    }
    const panel = await openAjustar(user)
    await user.click(within(panel).getByRole('radio', { name: 'Preço da fazenda' }))
    expect(screen.getByTestId('card-matriz').textContent).not.toMatch(/NaN|Infinity|undefined/)
    for (const b of screen.getAllByRole('button')) expect(b).toHaveAccessibleName()
  })

  it('has no axe violations: closed, with Ajustar open, with the held popover open and with the floating card', async () => {
    const { container, user } = await renderWithStore(ui, [...FARM, SALE, FUTURE])
    expect(await axe(container, OPTS)).toHaveNoViolations()
    await openAjustar(user)
    expect(await axe(container, OPTS)).toHaveNoViolations()
    await user.keyboard('{Escape}')
    await openHeld(user, 'Alterar basis')
    expect(await axe(container, OPTS)).toHaveNoViolations()
    await typeIn(user, heldField(screen.getByTestId('matriz-held-painel')), '1')
    expect(await axe(container, OPTS)).toHaveNoViolations() // with "Voltar ao basis de mercado" showing
    await user.keyboard('{Escape}')
    await user.hover(cell(2, 6))
    expect(screen.getByTestId('matriz-cartao')).toBeInTheDocument()
    expect(await axe(document.body, OPTS)).toHaveNoViolations()
  })
})
