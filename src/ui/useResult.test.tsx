import { act, render, screen } from '@testing-library/react'
import { StoreProvider, useStore } from '../state/StoreProvider'
import { staticProvider } from '../data/staticProvider'
import type { MarketDataProvider } from '../data/types'
import { LEGACY_EXAMPLE, seedState } from '../test/helpers'
import type { Action } from '../state/types'
import { useResult, type UseResult } from './useResult'

let latest: UseResult | null = null
let dispatchRef: ((a: Action) => void) | null = null
let storedInputs: unknown = null

function Probe() {
  const r = useResult()
  const { dispatch, state } = useStore()
  latest = r
  dispatchRef = dispatch
  storedInputs = state.inputs
  return <output data-testid="ready">ok</output>
}

async function boot(actions: Action[], provider: MarketDataProvider = staticProvider) {
  seedState([...LEGACY_EXAMPLE, ...actions])
  render(
    <StoreProvider provider={provider}>
      <Probe />
    </StoreProvider>,
  )
  await screen.findByTestId('ready')
  return latest!
}

beforeEach(() => {
  localStorage.clear()
  latest = null
})

const macroUsd: Action = {
  type: 'setCostItem',
  itemId: 'adubacao.macro',
  patch: { mode: 'valor', usd: { amountUsdHa: 195, boughtPct: 0.6, boughtRate: 5.2 } },
}

describe('useResult', () => {
  it('exposes usdLines and folds them into the result at the scenario dollar', async () => {
    const r = await boot([macroUsd])
    expect(r.usdLines).toEqual([{ usdPerHa: 195, boughtPct: 0.6, boughtRate: 5.2 }])
    expect(r.farmInputs.costUsd).toBe(r.usdLines)
    const effFx = 0.4 * r.fx + 0.6 * 5.2
    const costHa = r.farmInputs.costPerHaBrl + 195 * effFx
    expect(r.result.costPerSc).toBeCloseTo(costHa / r.farmInputs.yieldScHa, 6)
    expect(r.scHaUnconverted).toBe(false)
  })

  it('US$ mode with an unusable dollar stays blocked and converts nothing', async () => {
    const s = await staticProvider.getSnapshot()
    s.fx.value = 0
    const r = await boot([{ type: 'setCurrency', currency: 'USD' }, macroUsd], {
      getSnapshot: () => Promise.resolve(s),
    })
    expect(r.usdBlocked).toBe(true)
    expect(r.toDisplay(1000)).toBeNull()
    expect(r.fromDisplayMoney(1000)).toBeNull()
    // Lines stay in US$ as typed; nothing is converted with the bad dollar.
    expect(r.usdLines).toEqual([{ usdPerHa: 195, boughtPct: 0.6, boughtRate: 5.2 }])
    for (const v of [r.result.costPerSc, r.result.marginPct, r.result.farmPriceBrl]) {
      expect(v === null || Number.isFinite(v)).toBe(true)
    }
    // A line not fully bought cannot be valued without a dollar: no cost per sack (never understated).
    expect(r.result.costPerSc).toBeNull()
    expect(Number.isFinite(r.farmInputs.costPerHaBrl)).toBe(true)
  })

  it('arrendamento of 8 sc/ha adds 8 × farm price to the cost and follows the price', async () => {
    const r = await boot([
      { type: 'setCostItem', itemId: 'arrendamento.valor', patch: { mode: 'valor', unit: 'scHa', valueBrlHa: 8 } },
    ])
    const fixed = (storedInputs as { costPerHaBrl: number }).costPerHaBrl
    const farm = r.result.farmPriceBrl!
    expect(farm).toBeCloseTo(125.11, 2)
    // the engine converts it (inputs carry sc/ha, the R$ part stays fixed)
    expect(r.farmInputs.costScHa).toBe(8)
    expect(r.farmInputs.costPerHaBrl).toBe(fixed)
    expect(r.result.costPerSc).toBeCloseTo((fixed + 8 * farm) / r.farmInputs.yieldScHa, 9)
    expect(8 * farm).toBeCloseTo(1000.88, 1)
    expect(r.scHaUnconverted).toBe(false)

    act(() => dispatchRef!({ type: 'override', key: 'fx', value: 6 }))
    const r2 = latest!
    expect(r2.result.farmPriceBrl).not.toBeCloseTo(farm, 2)
    expect(r2.result.costPerSc).toBeCloseTo((fixed + 8 * r2.result.farmPriceBrl!) / r2.farmInputs.yieldScHa, 9)
  })

  it('without a usable farm price the sc/ha rent gives no cost per sack and is flagged', async () => {
    const s = await staticProvider.getSnapshot()
    s.fx.value = 0
    const r = await boot(
      [{ type: 'setCostItem', itemId: 'arrendamento.valor', patch: { mode: 'valor', unit: 'scHa', valueBrlHa: 8 } }],
      { getSnapshot: () => Promise.resolve(s) },
    )
    expect(r.farmInputs.costPerHaBrl).toBe((storedInputs as { costPerHaBrl: number }).costPerHaBrl)
    expect(r.result.costPerSc).toBeNull()
    expect(r.scHaUnconverted).toBe(true)
  })
})
