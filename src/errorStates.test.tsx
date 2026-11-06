import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StoreProvider } from './state/StoreProvider'
import { Ticker } from './ui/Ticker'
import { CropCurrencyControls } from './ui/TopBar'
import { Simulador } from './pages/Simulador'
import { KpiRow } from './ui/KpiRow'
import { Waterfall } from './ui/Waterfall'
import { Comercializacao } from './pages/Comercializacao'
import { Resultados } from './pages/Resultados'
import { staticProvider } from './data/staticProvider'
import type { MarketDataProvider, MarketSnapshot } from './data/types'
import { LEGACY_EXAMPLE, mockMatchMedia, seedState } from './test/helpers'

async function snap(patch: (s: MarketSnapshot) => void): Promise<MarketDataProvider> {
  const s = await staticProvider.getSnapshot()
  patch(s)
  return { getSnapshot: () => Promise.resolve(s) }
}

beforeEach(() => {
  localStorage.clear()
  mockMatchMedia(true)
  seedState(LEGACY_EXAMPLE)
})

describe('StoreProvider load failure', () => {
  it('shows an EmptyState with a retry that re-fetches (fail, then succeed)', async () => {
    const user = userEvent.setup()
    const getSnapshot = vi
      .fn<MarketDataProvider['getSnapshot']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(() => staticProvider.getSnapshot())
    render(
      <StoreProvider provider={{ getSnapshot }}>
        <p>conteúdo</p>
      </StoreProvider>,
    )
    expect(await screen.findByText('Não foi possível carregar as cotações')).toBeInTheDocument()
    expect(screen.queryByText('conteúdo')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('conteúdo')).toBeInTheDocument()
    expect(getSnapshot).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Não foi possível carregar as cotações')).toBeNull()
  })

  it('stays on the error state when the retry fails again', async () => {
    const user = userEvent.setup()
    const getSnapshot = vi.fn<MarketDataProvider['getSnapshot']>().mockRejectedValue(new Error('x'))
    render(
      <StoreProvider provider={{ getSnapshot }}>
        <p>conteúdo</p>
      </StoreProvider>,
    )
    await user.click(await screen.findByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    expect(getSnapshot.mock.calls.length).toBe(2)
  })
})

describe('missing market data', () => {
  it('Ticker shows the EmptyState for a missing CBOT and the pencil still works', async () => {
    const user = userEvent.setup()
    const provider = await snap((s) => {
      s.cbotUsc.soja.value = Number.NaN
    })
    render(
      <StoreProvider provider={provider}>
        <Ticker />
      </StoreProvider>,
    )
    expect(await screen.findByText('Aguardando — digite o valor no lápis')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/NaN/)
    await user.click(screen.getByRole('button', { name: 'Editar CBOT' }))
    await user.type(screen.getByLabelText('CBOT (novo valor)'), '1200,5')
    await user.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(screen.queryByText('Aguardando — digite o valor no lápis')).toBeNull()
    expect(screen.getByText('1.200,50')).toBeInTheDocument()
  })

  it('Ticker treats a zero dollar as missing', async () => {
    const provider = await snap((s) => {
      s.fx.value = 0
    })
    render(
      <StoreProvider provider={provider}>
        <Ticker />
      </StoreProvider>,
    )
    const pencil = await screen.findByRole('button', { name: 'Editar Dólar PTAX' })
    expect(pencil.parentElement).toHaveTextContent('Aguardando — digite o valor no lápis')
  })

  it('Simulador with fx = 0 renders, inputs stay editable and results show an em dash', async () => {
    const user = userEvent.setup()
    const provider = await snap((s) => {
      s.fx.value = 0
    })
    render(
      <StoreProvider provider={provider}>
        <CropCurrencyControls />
        <Ticker />
        <Simulador kpis={<KpiRow />} showMeta />
      </StoreProvider>,
    )
    await screen.findByTestId('page-simulador')
    const margem = screen.getByTestId('kpi-margem')
    expect(margem).toHaveTextContent('—')
    expect(margem).not.toHaveTextContent('✓')
    expect(within(screen.getByTestId('kpi-preco')).getByText('—')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/)
    const area = screen.getByLabelText(/Área plantada/)
    await user.clear(area)
    await user.type(area, '250')
    await user.tab()
    expect(area).toHaveValue('250')
    // typing a dollar in the ticker recovers the page
    await user.click(screen.getByRole('button', { name: 'Editar Dólar PTAX' }))
    await user.type(screen.getByLabelText('Dólar PTAX (novo valor)'), '5,5')
    await user.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(screen.getByTestId('kpi-margem')).not.toHaveTextContent('—')
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/)
  })

  it('Resultados with fx = 0 renders without NaN/Infinity', async () => {
    const provider = await snap((s) => {
      s.fx.value = 0
    })
    render(
      <StoreProvider provider={provider}>
        <Resultados />
      </StoreProvider>,
    )
    await screen.findByTestId('page-resultados')
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/)
  })

  it('Comercializacao with fx = 0 renders without NaN/Infinity', async () => {
    const provider = await snap((s) => {
      s.fx.value = 0
    })
    render(
      <StoreProvider provider={provider}>
        <Comercializacao />
      </StoreProvider>,
    )
    await screen.findByTestId('page-comercializacao')
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/)
  })

  it('Waterfall with fx = 0 emits no NaN inline style and shows dashes for price rows', async () => {
    const provider = await snap((s) => {
      s.fx.value = 0
    })
    const { container } = render(
      <StoreProvider provider={provider}>
        <Waterfall />
      </StoreProvider>,
    )
    await screen.findByRole('list', { name: 'De onde vem o preço' })
    for (const el of container.querySelectorAll('[style]')) {
      expect(el.getAttribute('style')).not.toMatch(/NaN|Infinity/)
    }
    // 8 rows (R23): bolsa, base, referência, frete, taxas, fazenda, custo, margem — price rows are dashes
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(8)
    for (const i of [0, 1, 2, 5, 7]) expect(within(rows[i]).getByText('—')).toBeInTheDocument()
  })

  it('USD with fx = 0: cost KPIs show an em dash, never a BRL amount labelled US$', async () => {
    seedState([...LEGACY_EXAMPLE, { type: 'setCurrency', currency: 'USD' }])
    const provider = await snap((s) => {
      s.fx.value = 0
    })
    render(
      <StoreProvider provider={provider}>
        <Simulador />
      </StoreProvider>,
    )
    await screen.findByTestId('page-simulador')
    const custo = screen.getByTestId('farm-custo')
    expect(custo).toHaveTextContent('—')
    expect(custo.textContent).not.toMatch(/US\$\s*[\d.,]+/)
    expect(document.body.textContent).not.toMatch(/US\$\s*[\d.,]+\s*\/ha/)
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/)
  })
})
