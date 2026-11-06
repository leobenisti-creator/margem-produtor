import { act, render, screen } from '@testing-library/react'
import { StoreProvider, useStore } from './StoreProvider'
import { STORAGE_KEY } from './persist'
import { staticProvider } from '../data/staticProvider'

function Probe() {
  const { state, dispatch, scenario } = useStore()
  return (
    <div>
      <span data-testid="area">{state.inputs.areaHa}</span>
      <span data-testid="cbot">{scenario.cbotUsc}</span>
      <span data-testid="fx">{scenario.fx}</span>
      <button onClick={() => dispatch({ type: 'setInput', key: 'areaHa', value: 321 })}>edit</button>
      <button onClick={() => dispatch({ type: 'override', key: 'fx', value: 6 })}>fx</button>
    </div>
  )
}

const saved = {
  crop: 'soja',
  fobId: 'paranagua',
  customBasisUsc: null,
  regionId: 'centro-sul', // IMEA-era fields: ignored on load
  currency: 'BRL',
  areaUnit: 'scHa',
  inputs: {
    areaHa: 777,
    yieldScHa: 60,
    costPerHaBrl: 4000,
    freightBrlPerSc: 1,
    portFeesBrlPerSc: 1,
    soldPct: 0,
    soldAvgPriceBrl: 0,
    targetMargin: 0.35,
    marginBase: 'receita',
  },
  costMode: 'total',
  costCategories: {
    sementes: 1,
    fertilizantes: 1,
    defensivos: 1,
    operacoes: 1,
    maoDeObra: 1,
    arrendamento: 1,
    financeiro: 1,
    outros: 1,
  },
  overrides: {},
  matrix: { cbotStepUsc: 40, fxStep: 0.25, size: 5 },
  includeSold: true,
  tourSeen: true,
  edited: { yield: false, cost: false, freight: false }, // IMEA-era flags: ignored on load
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('StoreProvider', () => {
  it('useStore throws a clear error outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/StoreProvider/)
  })

  it('renders children only after the snapshot loads, with the seed scenario', async () => {
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    )
    expect(screen.queryByTestId('area')).toBeNull()
    expect(await screen.findByTestId('area')).toHaveTextContent('0')
    expect(screen.getByTestId('cbot')).toHaveTextContent('1241.25')
    expect(screen.getByTestId('fx')).toHaveTextContent('5.4998')
  })

  it('applies overrides to the scenario', async () => {
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    )
    await screen.findByTestId('area')
    act(() => screen.getByText('fx').click())
    expect(screen.getByTestId('fx')).toHaveTextContent('6')
  })

  it('debounces saving by 300 ms', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    render(
      <StoreProvider provider={staticProvider}>
        <Probe />
      </StoreProvider>,
    )
    await screen.findByTestId('area')
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    setItem.mockClear()

    act(() => screen.getByText('edit').click())
    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(setItem).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(2)
    })
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(setItem.mock.calls[0][0]).toBe(STORAGE_KEY)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).inputs.areaHa).toBe(321)
  })

  it('flushes the pending save when the page is hidden before the debounce ends', async () => {
    render(
      <StoreProvider provider={staticProvider}>
        <Probe />
      </StoreProvider>,
    )
    await screen.findByTestId('area')
    act(() => screen.getByText('edit').click())
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).inputs.areaHa).toBe(321)
  })

  it('restores saved state on load', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    )
    expect(await screen.findByTestId('area')).toHaveTextContent('777')
  })

  it('renders with defaults when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    )
    expect(await screen.findByTestId('area')).toHaveTextContent('0')
  })
})
