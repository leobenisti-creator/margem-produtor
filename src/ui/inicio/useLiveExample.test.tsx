import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import seed from '../../data/seed-2026-10-26.json'
import { findFob } from '../../data/fobPoints'
import type { MarketDataProvider, MarketSnapshot } from '../../data/types'
import { StoreProvider } from '../../state/StoreProvider'
import { buildLiveExample, metaTargets, useLiveExample } from './useLiveExample'

const base = () => structuredClone(seed.snapshot) as MarketSnapshot

function live(s: MarketSnapshot): MarketSnapshot {
  for (const q of [s.cbotUsc.soja, s.cbotUsc.milho, s.fx, s.b3.soja, s.b3.milho, s.cepea.soja, s.basisUsc.soja]) {
    q.kind = 'ao_vivo'
  }
  return s
}

const SORRISO = findFob('sorriso')?.baseUsc.soja as number

describe('buildLiveExample (motor, Soja · Sorriso)', () => {
  it('returns a computed margin, farm price and cost for the seed snapshot', () => {
    const ex = buildLiveExample(base())
    expect(ex.regionLabel).toBe('Soja · Sorriso (MT)')
    // The FOB Sorriso base (provisional), not the snapshot (Paranaguá) base.
    expect(ex.scenario.basisUsc).toBe(SORRISO)
    expect(ex.scenario.basisUsc).not.toBe(base().basisUsc.soja.value)
    expect(typeof ex.marginPerSc).toBe('number')
    expect(Number.isFinite(ex.marginPerSc)).toBe(true)
    expect(ex.farmPrice).toBeGreaterThan(0)
    expect(ex.costPerSc).toBeGreaterThan(0)
    expect(ex.asOf).toBe('2026-10-26')
    // Sorriso → IMEA Médio-Norte reference: 61,3 sc/ha and R$ 6.627,48/ha (IMEA), 1.000 ha, no target.
    expect(ex.inputs.yieldScHa).toBeCloseTo(61.3)
    expect(ex.inputs.costPerHaBrl).toBeCloseTo(6627.48)
    expect(ex.inputs.areaHa).toBe(1000)
    expect(ex.inputs.targetMargin).toBeNull()
    expect(ex.costPerSc).toBeCloseTo(6627.48 / 61.3, 6)
  })

  it('moves with the CBOT and with the dollar (live, never hard-coded)', () => {
    const a = buildLiveExample(base())
    const up = base()
    up.cbotUsc.soja.value += 50
    const b = buildLiveExample(up)
    expect(b.marginPerSc as number).toBeGreaterThan(a.marginPerSc as number)
    const fx = base()
    fx.fx.value -= 0.3
    const c = buildLiveExample(fx)
    expect(c.marginPerSc as number).toBeLessThan(a.marginPerSc as number)
  })

  it('is stale for a closing snapshot and not stale when the quotes are live', () => {
    expect(buildLiveExample(base()).stale).toBe(true)
    expect(buildLiveExample(live(base())).stale).toBe(false)
  })

  it('"por que importa" comes from the engine', () => {
    const ex = buildLiveExample(base())
    // +R$ 0,25 in the dollar raises the farm price by (CBOT+base)/100 × 2,20462 × 0,25.
    const s = base()
    const expected = ((s.cbotUsc.soja.value + SORRISO) / 100) * 2.20462 * 0.25
    expect(ex.why.fxUpMarginPerSc).toBeCloseTo(expected, 6)
    const cost = 6627.48
    expect(ex.why.yieldUpCostDropPerSc).toBeCloseTo(cost / 61.3 - cost / 64.3, 6)
    expect(ex.why.adubacaoShare).toBeCloseTo(2072.83 / 6627.48, 6)
  })

  it('meta cards: one below and one above the margin, multiples of 5 p.p.', () => {
    // With the 04/11 Sorriso basis the seed margin is ~1%, so both cards would sit at the 5% floor;
    // +113 US¢/bu of CBOT restores the previous price level (margin ~11%) to exercise both sides.
    const s = base()
    s.cbotUsc.soja.value += 113
    const ex = buildLiveExample(s)
    const m = (ex.marginPct as number) * 100
    expect(ex.meta.below.targetPct % 5).toBe(0)
    expect(ex.meta.below.targetPct).toBeGreaterThanOrEqual(m + 3)
    expect(ex.meta.below.analysis?.status).toBe('abaixo')
    expect(ex.meta.above.targetPct % 5).toBe(0)
    expect(ex.meta.above.targetPct).toBeLessThanOrEqual(Math.max(5, m - 3))
    expect(ex.meta.above.analysis?.status).toBe('acima')
  })

  it('metaTargets picks the next/previous multiple of 5 p.p. with a 5% floor', () => {
    expect(metaTargets(0.153)).toEqual({ below: 20, above: 10 })
    expect(metaTargets(0.17)).toEqual({ below: 20, above: 10 })
    expect(metaTargets(0.18)).toEqual({ below: 25, above: 15 })
    expect(metaTargets(0.04)).toEqual({ below: 10, above: 5 })
    expect(metaTargets(-0.2)).toEqual({ below: 5, above: 5 })
  })
})

describe('useLiveExample', () => {
  it('reads the store snapshot', async () => {
    const provider: MarketDataProvider = { getSnapshot: () => Promise.resolve(base()) }
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StoreProvider provider={provider}>{children}</StoreProvider>
    )
    const { result } = renderHook(() => useLiveExample(), { wrapper })
    await waitFor(() => expect(result.current).toBeTruthy())
    expect(result.current.regionLabel).toBe('Soja · Sorriso (MT)')
    expect(typeof result.current.marginPerSc).toBe('number')
    expect(result.current.stale).toBe(true)
    expect(result.current.marginPerSc).toBeCloseTo(buildLiveExample(base()).marginPerSc as number, 9)
  })
})
