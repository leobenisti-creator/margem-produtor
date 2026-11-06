import { render, screen, within } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import type { MarketDataProvider, MarketSnapshot } from '../../data/types'
import { computeResult } from '../../engine/calc'
import { CROPS } from '../../engine/crops'
import { StoreProvider } from '../../state/StoreProvider'
import { fmtNum } from '../format'
import { MercadoHoje, marketImpact, sparkSeries } from './MercadoHoje'
import { FOB_POINTS, shortFobLabel } from '../../data/fobPoints'
import { seedSnapshot } from './testUtils'
import { buildLiveExample } from './useLiveExample'

expect.extend(toHaveNoViolations)
vi.setConfig({ testTimeout: 15000 })

async function renderMercado(snapshot: MarketSnapshot) {
  const provider: MarketDataProvider = { getSnapshot: () => Promise.resolve(snapshot) }
  const ex = buildLiveExample(snapshot)
  const view = render(
    <StoreProvider provider={provider}>
      <MercadoHoje ex={ex} />
    </StoreProvider>,
  )
  const list = await screen.findByRole('list', { name: 'Cotações do mercado' })
  return { ...view, ex, list, cards: within(list).getAllByRole('listitem') }
}

const series = (base: number, n = 5) =>
  Array.from({ length: n }, (_, i) => ({ date: `2026-10-${String(10 + i).padStart(2, '0')}`, settle: base + i }))

beforeEach(() => localStorage.clear())

describe('MercadoHoje', () => {
  it('shows the four cards with value, unit, source and date from the provider', async () => {
    const { cards, container } = await renderMercado(seedSnapshot())
    expect(cards.map((c) => within(c).getByRole('heading', { level: 3 }).textContent)).toEqual([
      'CBOT soja',
      'Dólar PTAX',
      'Prêmio do porto',
      'CBOT milho',
    ])
    expect(container.textContent).not.toMatch(/B3|SJC|Cepea|IMEA/)
    const [cbot, fx, premio, milho] = cards
    expect(cbot).toHaveTextContent('1.241,25')
    expect(cbot).toHaveTextContent('US¢/bu')
    expect(cbot).toHaveTextContent(/Yahoo/)
    expect(cbot).toHaveTextContent('26/10/2026')
    expect(fx).toHaveTextContent('5,4998')
    expect(fx).toHaveTextContent('BCB')
    expect(premio).toHaveTextContent('61,70')
    expect(premio).toHaveTextContent('21/10/2026')
    expect(milho).toHaveTextContent('455,00')
  })

  it('no card or FOB point is singled out as "a confirmar": every value is provisional and one note says so', async () => {
    const { cards } = await renderMercado(seedSnapshot())
    for (const c of cards) expect(c).not.toHaveTextContent('a confirmar')
    expect(screen.getByTestId('pontos-fob')).not.toHaveTextContent('a confirmar')
    expect(screen.getByText('Valores provisórios do último fechamento, não ao vivo.')).toBeInTheDocument()
  })

  it('lists real FOB points of the data file with their values', async () => {
    await renderMercado(seedSnapshot())
    const fob = within(screen.getByTestId('pontos-fob'))
    const rows = fob.getAllByRole('listitem')
    expect(rows.length).toBeGreaterThanOrEqual(5)
    for (const p of FOB_POINTS.filter((x) => ['paranagua', 'sorriso', 'itaqui'].includes(x.id))) {
      const row = rows.find((r) => r.textContent?.includes(shortFobLabel(p)))
      expect(row).toBeDefined()
      expect(row).toHaveTextContent(fmtNum(p.baseUsc.soja as number, 2))
    }
    expect(screen.getByTestId('pontos-fob')).toHaveTextContent('Hedgepoint/CME/ESALQ')
  })

  it('milho reads "a definir" when the snapshot lacks it', async () => {
    const s = seedSnapshot()
    delete (s.cbotUsc as Partial<MarketSnapshot['cbotUsc']>).milho
    const { cards } = await renderMercado(s)
    expect(cards[3]).toHaveTextContent('a definir')
  })

  it('mini chart only where the provider has history; never invented', async () => {
    const none = await renderMercado(seedSnapshot())
    expect(screen.queryAllByTestId('mini-chart')).toHaveLength(0)
    none.unmount()

    const s = seedSnapshot()
    s.history = { cbotUsc: { soja: series(1200), milho: series(450, 1) }, fx: series(5.4) }
    const { cards } = await renderMercado(s)
    expect(within(cards[0]).getByTestId('mini-chart')).toBeInTheDocument()
    expect(within(cards[1]).getByTestId('mini-chart')).toBeInTheDocument()
    // milho has a single point (not a series); the other cards have no history in the provider at all.
    for (const i of [2, 3]) expect(within(cards[i]).queryByTestId('mini-chart')).toBeNull()
  })

  it('sparkSeries drops unusable points and needs two', () => {
    expect(sparkSeries(undefined)).toBeNull()
    expect(sparkSeries([{ date: '2026-10-01', settle: 1 }])).toBeNull()
    const pts = sparkSeries([
      { date: '2026-10-03', settle: 3 },
      { date: '2026-10-01', settle: Number.NaN },
      { date: '2026-10-02', settle: 2 },
    ])
    expect(pts?.map((p) => p.settle)).toEqual([2, 3])
  })

  it('impact lines equal the engine difference of the margin per sack', async () => {
    const { ex } = await renderMercado(seedSnapshot())
    const crop = CROPS.soja
    const base = computeResult(crop, ex.scenario, ex.inputs).marginPerSc as number
    const fx = (computeResult(crop, { ...ex.scenario, fx: ex.scenario.fx + 0.1 }, ex.inputs).marginPerSc as number) - base
    const cb =
      (computeResult(crop, { ...ex.scenario, cbotUsc: ex.scenario.cbotUsc + 10 }, ex.inputs).marginPerSc as number) - base
    const imp = marketImpact(ex)
    expect(imp.fxUpPerSc).toBeCloseTo(fx, 10)
    expect(imp.cbotUpPerSc).toBeCloseTo(cb, 10)
    expect(fx).toBeGreaterThan(0)
    expect(cb).toBeGreaterThan(0)
    expect(screen.getByText(`+R$ ${fmtNum(fx, 2)}/sc`)).toBeInTheDocument()
    expect(screen.getByText(`+R$ ${fmtNum(cb, 2)}/sc`)).toBeInTheDocument()
    expect(screen.getByText(/Dólar \+R\$ 0,10/)).toBeInTheDocument()
    expect(screen.getByText(/CBOT \+US¢ 10/)).toBeInTheDocument()
    expect(screen.getByText('Valores provisórios do último fechamento, não ao vivo.')).toBeInTheDocument()
  })

  it('calls the port premium "Prêmio do porto", never "Base" or "basis"', async () => {
    const { container } = await renderMercado(seedSnapshot())
    expect(screen.getAllByText('Prêmio do porto').length).toBeGreaterThan(0)
    expect(container.textContent).not.toMatch(/\bbase\b|basis/i)
  })

  it('has no links or buttons and writes nothing to localStorage', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem')
    const { container } = await renderMercado(seedSnapshot())
    spy.mockClear()
    expect(container.querySelectorAll('a, button')).toHaveLength(0)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('is jest-axe clean', async () => {
    const s = seedSnapshot()
    s.history = { cbotUsc: { soja: series(1200) }, fx: series(5.4) }
    const { container } = await renderMercado(s)
    expect(await axe(container)).toHaveNoViolations()
  })

  it.each([
    ['dólar 0', (s: MarketSnapshot) => void (s.fx.value = 0)],
    ['CBOT soja 0', (s: MarketSnapshot) => void (s.cbotUsc.soja.value = 0)],
    ['dólar NaN', (s: MarketSnapshot) => void (s.fx.value = Number.NaN)],
  ])('%s: no NaN, no impact numbers, neutral line instead', async (_n, edit) => {
    const s = seedSnapshot()
    edit(s)
    const { container } = await renderMercado(s)
    expect(container.textContent).not.toMatch(/NaN|Infinity|undefined/)
    expect(screen.getByText(/Dólar ou CBOT indisponível/)).toBeInTheDocument()
    expect(screen.queryByText(/Dólar \+R\$ 0,10/)).toBeNull()
  })
})
