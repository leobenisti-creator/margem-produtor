import { staticProvider } from './staticProvider'
import { EXPECTED_UNITS, snapshotContractViolations } from './contract'
import type { MarketSnapshot } from './types'

/**
 * Contract every MarketDataProvider must honour (the API provider included): it is derived from
 * how the UI parses the snapshot (Ticker, KpiRow, comparison, engine). Run it against the new
 * provider by swapping `staticProvider` below, or by calling `snapshotContractViolations` directly.
 */
describe('MarketSnapshot contract', () => {
  let snap: MarketSnapshot
  beforeAll(async () => {
    snap = await staticProvider.getSnapshot()
  })

  it('documents the exact unit strings the UI expects (read from the seed)', () => {
    expect(EXPECTED_UNITS).toEqual({
      cbotUsc: 'USc/bu',
      fx: 'R$/US$',
      basisUsc: 'USc/bu',
      b3: { soja: 'US$/sc', milho: 'R$/sc' },
      cepea: { soja: 'R$/sc', milho: 'R$/sc' },
    })
  })

  it('the static provider passes the whole contract', () => {
    expect(snapshotContractViolations(snap)).toEqual([])
  })

  it('every quote: finite value, expected unit, ISO asOf, known kind, non-empty source', () => {
    for (const crop of ['soja', 'milho'] as const) {
      for (const q of [snap.cbotUsc[crop], snap.b3[crop], snap.cepea[crop], snap.basisUsc[crop]]) {
        expect(Number.isFinite(q.value)).toBe(true)
        expect(q.unit).toMatch(/\S/)
        expect(q.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(['fechamento', 'ao_vivo', 'manual']).toContain(q.kind)
        expect(q.source).toMatch(/\S/)
      }
      expect(snap.cbotUsc[crop].unit).toBe('USc/bu')
      expect(snap.basisUsc[crop].unit).toBe('USc/bu')
      expect(snap.cepea[crop].unit).toBe('R$/sc')
    }
    expect(snap.fx.unit).toBe('R$/US$')
    expect(snap.b3.soja.unit).toBe('US$/sc')
    expect(snap.b3.milho.unit).toBe('R$/sc')
  })

  it('names each violation so the API provider can be debugged', () => {
    const bad = structuredClone(snap)
    bad.fx.value = Number.NaN
    bad.cbotUsc.soja.unit = 'US¢/bu'
    bad.b3.milho.asOf = '26/10/2026'
    bad.cepea.soja.kind = 'live' as never
    bad.basisUsc.milho.source = ''
    const v = snapshotContractViolations(bad)
    expect(v).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^fx: value/),
        expect.stringMatching(/^cbotUsc\.soja: unit/),
        expect.stringMatching(/^b3\.milho: asOf/),
        expect.stringMatching(/^cepea\.soja: kind/),
        expect.stringMatching(/^basisUsc\.milho: source/),
      ]),
    )
    expect(v).toHaveLength(5)
  })

  it('rejects a snapshot with a missing crop or a non-object quote', () => {
    const bad = structuredClone(snap) as unknown as Record<string, unknown>
    delete (bad.b3 as Record<string, unknown>).milho
    bad.fx = null
    const v = snapshotContractViolations(bad as unknown as MarketSnapshot)
    expect(v.some((m) => m.startsWith('b3.milho:'))).toBe(true)
    expect(v.some((m) => m.startsWith('fx:'))).toBe(true)
  })
})
