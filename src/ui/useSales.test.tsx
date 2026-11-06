import { act, render, screen } from '@testing-library/react'
import { StoreProvider, useStore } from '../state/StoreProvider'
import { LEGACY_EXAMPLE, seedState } from '../test/helpers'
import type { Action } from '../state/types'
import { useSales, type UseSales } from './useSales'

let latest: UseSales | null = null
let dispatchRef: ((a: Action) => void) | null = null

function Probe() {
  latest = useSales()
  dispatchRef = useStore().dispatch
  return <output data-testid="ready">ok</output>
}

beforeEach(() => {
  localStorage.clear()
  latest = null
})

describe('useSales', () => {
  it('exposes the tranches and the summary for the current production', async () => {
    seedState([
      ...LEGACY_EXAMPLE,
      { type: 'setInput', key: 'areaHa', value: 100 },
      { type: 'setInput', key: 'yieldScHa', value: 60 },
      { type: 'addSale', partial: { volume: 60, volumeUnit: 't', price: 120 } },
    ])
    render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    )
    await screen.findByTestId('ready')
    expect(latest!.tranches).toHaveLength(1)
    expect(latest!.productionSc).toBe(6000)
    expect(latest!.summary.soldSc).toBeCloseTo(1000, 9)
    expect(latest!.summary.soldPct).toBeCloseTo(1000 / 6000, 12)
    expect(latest!.summary.avgPriceBrl).toBe(120)

    // 9.000 sc would pass the 6.000 sc production: the store cuts it to what is left (5.000 sc), 100% sold
    act(() => dispatchRef!({ type: 'addSale', partial: { volume: 9000, volumeUnit: 'sc', price: 100 } }))
    expect(latest!.summary.overProduction).toBe(false)
    expect(latest!.summary.soldPct).toBeCloseTo(1, 9)
    expect(latest!.summary.soldSc).toBeCloseTo(6000, 6)
  })
})
