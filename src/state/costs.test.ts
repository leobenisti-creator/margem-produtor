import { foldCosts, freshGroups, freshItem, sumCategories, zeroCategories } from './costs'
import { COST_CATEGORY_IDS } from '../data/types'

describe('empty cost model', () => {
  it('zeroCategories sums to zero', () => {
    const z = zeroCategories()
    expect(sumCategories(z)).toBe(0)
    for (const id of COST_CATEGORY_IDS) expect(z[id]).toBe(0)
  })

  it('a fresh item is not used and zero', () => {
    expect(freshItem()).toEqual({ mode: 'nao', valueBrlHa: 0, unit: 'ha', usd: null, rows: null })
  })

  it('fresh groups fold to nothing', () => {
    const f = foldCosts(freshGroups(), { boughtPct: 0, boughtRate: 0 })
    expect(f.brlFixed).toBe(0)
    expect(f.usdLines).toEqual([])
    expect(f.arrendamentoScHa).toBe(0)
  })

  it('group totals are what the producer gave them', () => {
    const totals = { ...zeroCategories(), sementes: 400, outros: 100.5 }
    const f = foldCosts(freshGroups(totals), { boughtPct: 0, boughtRate: 0 })
    expect(f.categories.sementes).toBe(400)
    expect(f.brlFixed).toBe(500.5)
  })
})
