import { act, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { mockMatchMedia } from '../test/helpers'
import { renderWithStore } from '../test/storeHarness'
import type { Action } from '../state/types'
import { SafraMap } from './SafraMap'

expect.extend(toHaveNoViolations)
vi.setConfig({ testTimeout: 20000 })

beforeEach(() => {
  localStorage.clear()
  mockMatchMedia(true)
})

// 1.000 ha x 60 sc/ha = 60.000 sc.
const FARM: Action[] = [
  { type: 'setInput', key: 'areaHa', value: 1000 },
  { type: 'setInput', key: 'yieldScHa', value: 60 },
]
const sale = (volume: number, extra: Record<string, unknown> = {}): Action => ({
  type: 'addSale',
  partial: { volume, volumeUnit: 'sc', price: 150, priceCurrency: 'BRL', ...extra },
})
// 2,20462 bu per sack: 44.092,4 bu cover 20.000 sc.
const BU_20K = 44092.4
const future = (qty = BU_20K): Action => ({
  type: 'addHedgeOp',
  partial: { asset: 'soja', kind: 'futuro', side: 'vendido', qty, strike: 1300 },
})
const COSTS_USD: Action[] = [
  { type: 'setCostMode', mode: 'categorias' },
  { type: 'setGroupTotal', group: 'sementes', value: { usd: { amountUsdHa: 100, boughtPct: 0, boughtRate: 0 } } },
]

describe('SafraMap', () => {
  it('nothing done: one red slice with the whole crop and 0% locked in the centre', async () => {
    await renderWithStore(<SafraMap />, FARM)
    expect(screen.getByTestId('card-mapa')).toHaveTextContent('Mapa da safra')
    expect(screen.getByTestId('mapa-resumo')).toHaveTextContent('60.000 sc')
    expect(screen.getByTestId('mapa-resumo')).toHaveTextContent('a preço de hoje')
    expect(screen.getByTestId('mapa-rosca').querySelectorAll('path')).toHaveLength(1)
    const slice = screen.getByTestId('mapa-fatia-tudo')
    expect(slice).toHaveStyle({ fill: 'var(--barneg)' })
    expect(slice).toHaveAccessibleName('Basis, CBOT e dólar em aberto: 60.000 sc, 100% da safra')
    expect(screen.getByTestId('mapa-rosca')).toHaveTextContent('100%')
    expect(screen.getByTestId('mapa-centro')).toHaveTextContent('0%da safra travada')
    expect(screen.getByTestId('mapa-linha-tudo')).toHaveTextContent('Tudo aberto')
    expect(screen.queryByText('Em que está exposto')).toBeNull()
    expect(screen.queryByTestId('mapa-lane-cbot')).toBeNull()
    expect(screen.getByTestId('card-mapa')).not.toHaveTextContent('Tudo travado')
  })

  it('Geral with a sale and a future: three slices, colours by open risks, centre 40%', async () => {
    await renderWithStore(<SafraMap />, [...FARM, sale(24000), future()])
    // Unsold 36.000; CBOT cover 20.000 -> {basis, dólar} 20.000 (33%), all open 16.000 (27%).
    expect(screen.getByTestId('mapa-fatia-travado')).toHaveStyle({ fill: 'var(--barpos)' })
    expect(screen.getByTestId('mapa-fatia-basis-dolar')).toHaveStyle({ fill: 'var(--sev2)' })
    expect(screen.getByTestId('mapa-fatia-tudo')).toHaveStyle({ fill: 'var(--barneg)' })
    expect(screen.getByTestId('mapa-fatia-basis-dolar')).toHaveAccessibleName(
      'Basis e dólar em aberto: 20.000 sc, 33% da safra',
    )
    expect(screen.getByTestId('mapa-fatia-travado')).toHaveAccessibleName('Tudo travado: 24.000 sc, 40% da safra')
    const rosca = screen.getByTestId('mapa-rosca')
    for (const t of ['40%', '33%', '27%']) expect(rosca).toHaveTextContent(t)
    expect(screen.getByTestId('mapa-centro')).toHaveTextContent('40%da safra travada')
    const legend = screen.getByTestId('mapa-legenda')
    expect(within(legend).getByTestId('mapa-linha-travado')).toHaveTextContent('Tudo travado24.00040%')
    expect(within(legend).getByTestId('mapa-linha-basis-dolar')).toHaveTextContent('Basis e dólar abertos')
    expect(within(legend).getByTestId('mapa-linha-basis-dolar')).toHaveTextContent('20.000')
    expect(within(legend).getByTestId('mapa-linha-tudo')).toHaveTextContent('16.000')
    expect(within(legend).getByTestId('mapa-linha-tudo')).toHaveTextContent('R$')
  })

  it('Geral cards have no per-risk lines and no sensitivity', async () => {
    const user = userEvent.setup()
    await renderWithStore(<SafraMap />, [...FARM, sale(24000)])
    await user.hover(screen.getByTestId('mapa-fatia-tudo'))
    expect(screen.queryByTestId('mapa-fechou')).toBeNull()
    expect(screen.queryByTestId('mapa-custos-usd')).toBeNull()
  })

  it('everything sold shows the all-locked line and 100% in the centre', async () => {
    await renderWithStore(<SafraMap />, [...FARM, sale(60000)])
    expect(screen.getByTestId('card-mapa')).toHaveTextContent('Tudo travado: nenhuma saca em risco')
    expect(screen.getByTestId('mapa-centro')).toHaveTextContent('100%da safra travada')
  })

  it('there are no view buttons: only the default map', async () => {
    await renderWithStore(<SafraMap />, [...FARM, sale(24000)])
    expect(screen.queryByRole('radiogroup', { name: 'Visão do mapa' })).toBeNull()
    for (const name of ['Geral', 'Dólar', 'Basis', 'CBOT']) expect(screen.queryByRole('radio', { name })).toBeNull()
    expect(screen.getByTestId('mapa-rosca')).toBeInTheDocument()
  })

  it('no production: asks for area and yield', async () => {
    await renderWithStore(<SafraMap />, [{ type: 'setInput', key: 'areaHa', value: 0 }])
    expect(screen.getByTestId('card-mapa')).toHaveTextContent('Informe área e produtividade')
    expect(screen.queryByTestId('mapa-rosca')).toBeNull()
  })

  it('hover and focus show the floating card with the Geral rows', async () => {
    const user = userEvent.setup()
    await renderWithStore(<SafraMap />, [...FARM, sale(24000)])
    expect(screen.queryByTestId('mapa-cartao')).toBeNull()
    const slice = screen.getByTestId('mapa-fatia-tudo')
    await user.hover(slice)
    const card = screen.getByTestId('mapa-cartao')
    expect(card).toHaveTextContent('Tudo aberto')
    expect(card).toHaveTextContent('36.000 sc · 60%')
    expect(card).toHaveTextContent('a preço de hoje')
    expect(card).toHaveTextContent('Fechado: nada')
    expect(card).toHaveTextContent('Nada travado')
    expect(screen.queryByTestId('mapa-sens')).toBeNull()
    expect(card.parentElement).toBe(document.body)
    await user.unhover(slice)
    expect(screen.queryByTestId('mapa-cartao')).toBeNull()
    act(() => screen.getByTestId('mapa-fatia-travado').focus())
    expect(screen.getByTestId('mapa-cartao')).toHaveTextContent('24.000 sc · 40%')
    expect(screen.getByTestId('mapa-cartao')).toHaveTextContent('Aberto: nada')
    act(() => screen.getByTestId('mapa-fatia-travado').blur())
    expect(screen.queryByTestId('mapa-cartao')).toBeNull()
  })

  it('click pins the card, Enter pins from the keyboard, Escape closes', async () => {
    const user = userEvent.setup()
    await renderWithStore(<SafraMap />, [...FARM, sale(24000)])
    const slice = screen.getByTestId('mapa-fatia-tudo')
    await user.click(slice)
    act(() => slice.blur())
    await user.unhover(slice)
    expect(screen.getByTestId('mapa-cartao')).toHaveTextContent('36.000 sc')
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('mapa-cartao')).toBeNull()
    const other = screen.getByTestId('mapa-fatia-travado')
    act(() => other.focus())
    await user.keyboard('{Enter}')
    act(() => other.blur())
    expect(screen.getByTestId('mapa-cartao')).toHaveTextContent('24.000 sc · 40%')
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('mapa-cartao')).toBeNull()
  })

  it('outside click unpins; scroll and resize close the card', async () => {
    const user = userEvent.setup()
    await renderWithStore(<SafraMap />, [...FARM, sale(24000)])
    const slice = screen.getByTestId('mapa-fatia-tudo')
    await user.click(slice)
    act(() => slice.blur())
    await user.unhover(slice)
    expect(screen.getByTestId('mapa-cartao')).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByTestId('mapa-cartao')).toBeNull()
    await user.hover(slice)
    fireEvent.scroll(window)
    expect(screen.queryByTestId('mapa-cartao')).toBeNull()
    await user.hover(screen.getByTestId('mapa-fatia-travado'))
    fireEvent(window, new Event('resize'))
    expect(screen.queryByTestId('mapa-cartao')).toBeNull()
  })

  it('legend: real table, a button per row pins the card, row click works too', async () => {
    const user = userEvent.setup()
    await renderWithStore(<SafraMap />, [...FARM, sale(24000), future()])
    const table = screen.getByRole('table', { name: 'Partes da safra' })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Parte da safra', 'Sacas', '% da safra', 'Valor'])
    expect(within(table).getAllByRole('row')).toHaveLength(4)
    const buttons = within(table).getAllByRole('button')
    expect(buttons).toHaveLength(3)
    await user.click(buttons[0])
    act(() => buttons[0].blur())
    await user.unhover(buttons[0])
    expect(screen.getByTestId('mapa-cartao')).toHaveTextContent('24.000 sc · 40%')
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true')
    await user.keyboard('{Escape}')
    const row = screen.getByTestId('mapa-linha-tudo')
    await user.click(row)
    await user.unhover(row)
    expect(screen.getByTestId('mapa-cartao')).toHaveTextContent('16.000 sc · 27%')
  })

  it('never prints NaN, Infinity or undefined', async () => {
    const user = userEvent.setup()
    await renderWithStore(<SafraMap />, [...FARM, sale(24000), future(), ...COSTS_USD])
    for (const s of screen.getByTestId('mapa-rosca').querySelectorAll('path')) {
      await user.hover(s)
      // the page text without the state probe (its JSON has real nulls)
      const text = (document.body.textContent ?? '').replace(screen.getByTestId('state-probe').textContent ?? '', '')
      expect(text).not.toMatch(/NaN|Infinity|undefined|null/)
    }
  })

  it('has no axe violations (with the card open)', async () => {
    const user = userEvent.setup()
    const { container } = await renderWithStore(<SafraMap />, [...FARM, sale(24000), future()])
    const opts = { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } }
    expect(await axe(container, opts)).toHaveNoViolations()
    await user.hover(screen.getByTestId('mapa-fatia-tudo'))
    expect(await axe(document.body, opts)).toHaveNoViolations()
  })
})
