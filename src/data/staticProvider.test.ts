import { describe, expect, it } from 'vitest'
import { staticProvider } from './staticProvider'
import type { MarketSnapshot, Quote } from './types'

function allQuotes(s: MarketSnapshot): Quote[] {
  return [
    ...Object.values(s.cbotUsc),
    s.fx,
    ...Object.values(s.b3),
    ...Object.values(s.cepea),
  ]
}

describe('staticProvider seed', () => {
  it('seed has 26/10 closing values', async () => {
    const s = await staticProvider.getSnapshot()
    expect(s.cbotUsc.soja.value).toBe(1241.25)
    expect(s.cbotUsc.milho.value).toBe(455)
    expect(s.fx.value).toBe(5.4998)
    expect(s.b3.soja.value).toBe(27.3644)
    expect(s.b3.milho.value).toBe(66.89)
    expect(s.cepea.soja.value).toBe(155.55)
    expect(s.cepea.milho.value).toBe(64.24)
  })

  it('every quote has asOf 2026-10-26 and kind fechamento', async () => {
    const s = await staticProvider.getSnapshot()
    for (const q of allQuotes(s)) {
      expect(q.asOf).toBe('2026-10-26')
      expect(q.kind).toBe('fechamento')
      expect(q.source.length).toBeGreaterThan(0)
    }
  })

  it('basis quotes keep their real point date 2026-10-21 and kind fechamento', async () => {
    const s = await staticProvider.getSnapshot()
    for (const q of Object.values(s.basisUsc)) {
      expect(q.asOf).toBe('2026-10-21')
      expect(q.kind).toBe('fechamento')
    }
  })

  it('no quote carries kind ao_vivo', async () => {
    const s = await staticProvider.getSnapshot()
    expect([...allQuotes(s), ...Object.values(s.basisUsc)].some((q) => q.kind === 'ao_vivo')).toBe(false)
  })

  it('no value in the seed is dated 2026-10-27', async () => {
    const s = await staticProvider.getSnapshot()
    expect(JSON.stringify(s)).not.toContain('2026-10-27')
  })

  it('has a basis quote per crop, flagged for confirmation', async () => {
    const s = await staticProvider.getSnapshot()
    expect(s.basisUsc.soja.unit).toBe('USc/bu')
    expect(s.basisUsc.milho.unit).toBe('USc/bu')
    expect(s.basisUsc.soja.source).toContain('a confirmar')
    expect(s.basisUsc.milho.source).toContain('a confirmar')
  })
})
