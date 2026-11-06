import { COST_CATEGORY_IDS } from '../data/types'
import { initialState, reducer } from '../state/reducer'
import { legacyState } from '../test/helpers'
import type { Action, AppState } from '../state/types'
import { categorySlices, costCurrencyMix, costSlices, largestCost, sliceTooltip, statusTotals } from './costBreakdown'
import { todayCostBrlHa } from './costView'

const FX = 5.5
const PRICE = 120

function start(actions: Action[] = []): AppState {
  return actions.reduce(reducer, reducer(legacyState(), { type: 'setCostMode', mode: 'categorias' }))
}

describe('costSlices / statusTotals', () => {
  it('all groups in total mode: one slice per group with a value, all realizado, summing the whole cost', () => {
    const s = start()
    const slices = costSlices(s, FX, PRICE)
    expect(slices.length).toBeGreaterThan(0)
    expect(slices.every((x) => x.status === 'realizado')).toBe(true)
    const whole = todayCostBrlHa(s.inputs, FX, PRICE) as number
    expect(statusTotals(slices).totalBrlHa).toBeCloseTo(whole, 4)
    expect(statusTotals(slices).hasBudgeted).toBe(false)
  })

  it('a group opened into items is split into its items (one slice each above zero)', () => {
    const s = start([
      { type: 'setCostItem', itemId: 'defensivos.herbicida', patch: { mode: 'valor', valueBrlHa: 200 } },
      { type: 'setCostItem', itemId: 'defensivos.fungicida', patch: { mode: 'valor', valueBrlHa: 450 } },
    ])
    const slices = costSlices(s, FX, PRICE)
    const def = slices.filter((x) => x.group === 'defensivos')
    expect(def).toHaveLength(2)
    expect(def.every((x) => x.id.startsWith('defensivos.'))).toBe(true)
    // typed items are realizado unless marked as budgeted
    expect(def.every((x) => x.status === 'realizado')).toBe(true)
    const whole = todayCostBrlHa(s.inputs, FX, PRICE) as number
    expect(statusTotals(slices).totalBrlHa).toBeCloseTo(whole, 4)
  })

  it('budgeted marks move the share; unbudgeted data has no analysis', () => {
    let s = start()
    s = reducer(s, { type: 'setCostBudgeted', group: 'sementes', value: true })
    const t = statusTotals(costSlices(s, FX, PRICE))
    expect(t.hasBudgeted).toBe(true)
    expect(t.share.orcado + t.share.realizado).toBeCloseTo(1, 10)
    const sementes = costSlices(s, FX, PRICE).find((x) => x.group === 'sementes')!
    expect(t.brlHa.orcado).toBeCloseTo(sementes.brlHa, 6)
    s = reducer(s, { type: 'setCostBudgeted', group: 'sementes', value: false })
    expect(statusTotals(costSlices(s, FX, PRICE)).hasBudgeted).toBe(false)
  })

  it('a typed item can be budgeted; a US$ item counts at its effective dollar', () => {
    let s = start([
      { type: 'setCostItem', itemId: 'defensivos.herbicida', patch: { mode: 'valor', valueBrlHa: 0, usd: { amountUsdHa: 100, boughtPct: 0, boughtRate: 0 } } },
      { type: 'setCostBudgeted', group: 'defensivos', itemId: 'defensivos.herbicida', value: true },
    ])
    const h = costSlices(s, FX, PRICE).find((x) => x.id === 'defensivos.herbicida')!
    expect(h.status).toBe('orcado')
    expect(h.brlHa).toBeCloseTo(100 * FX, 6)
    s = reducer(s, { type: 'setCostItem', itemId: 'defensivos.herbicida', patch: { usd: { amountUsdHa: 100, boughtPct: 1, boughtRate: 5 } } })
    expect(costSlices(s, FX, PRICE).find((x) => x.id === 'defensivos.herbicida')!.brlHa).toBeCloseTo(500, 6)
  })

  it('setCostBudgeted ignores bad input and an item of another group', () => {
    const s = start()
    expect(reducer(s, { type: 'setCostBudgeted', group: 'sementes', itemId: 'defensivos.herbicida', value: true })).toBe(s)
    expect(reducer(s, { type: 'setCostBudgeted', group: 'nope' as never, value: true })).toBe(s)
    expect(COST_CATEGORY_IDS).toContain('sementes')
  })
})

describe('costCurrencyMix', () => {
  it('all R$ by default: the parts add up to the whole cost and nothing is in US$', () => {
    const s = start()
    const m = costCurrencyMix(s, FX, PRICE)
    expect(m.hasUsd).toBe(false)
    expect(m.share.brl).toBeCloseTo(1, 10)
    expect(m.totalBrlHa).toBeCloseTo(todayCostBrlHa(s.inputs, FX, PRICE) as number, 4)
    expect(m.usdOpenUsdHa).toBe(0)
  })

  it('splits US$ into fixed and open, in R$ at each dollar, and still adds up to the whole', () => {
    const s = start([
      { type: 'setGroupTotal', group: 'sementes', value: { usd: { amountUsdHa: 100, boughtPct: 0, boughtRate: 0 } } },
      { type: 'setGroupTotal', group: 'defensivos', value: { usd: { amountUsdHa: 200, boughtPct: 1, boughtRate: 5 } } },
      { type: 'setGroupTotal', group: 'financeiro', value: { usd: { amountUsdHa: 50, boughtPct: 0.4, boughtRate: 6 } } },
    ])
    const m = costCurrencyMix(s, FX, PRICE)
    expect(m.hasUsd).toBe(true)
    // fixed: 200×5 + 50×0.4×6 = 1120; open: 100×5.5 + 50×0.6×5.5 = 715
    expect(m.brlHa.usdFixed).toBeCloseTo(1000 + 120, 6)
    expect(m.brlHa.usdOpen).toBeCloseTo(550 + 165, 6)
    expect(m.usdOpenUsdHa).toBeCloseTo(100 + 30, 6)
    expect(m.totalBrlHa).toBeCloseTo(todayCostBrlHa(s.inputs, FX, PRICE) as number, 4)
    expect(m.share.brl + m.share.usdFixed + m.share.usdOpen + m.share.sacas).toBeCloseTo(1, 10)
  })

  it('rent typed in sacks has its own part', () => {
    const s = start([
      { type: 'setCostItem', itemId: 'arrendamento.valor', patch: { mode: 'valor', unit: 'scHa', valueBrlHa: 8 } },
    ])
    const m = costCurrencyMix(s, FX, PRICE)
    expect(m.brlHa.sacas).toBeCloseTo(8 * PRICE, 6)
    expect(m.totalBrlHa).toBeCloseTo(todayCostBrlHa(s.inputs, FX, PRICE) as number, 4)
  })
})

describe('largestCost', () => {
  it('Por categoria: the biggest slice and its share of the whole cost', () => {
    const s = start()
    const slices = costSlices(s, FX, PRICE)
    const top = [...slices].sort((a, b) => b.brlHa - a.brlHa)[0]
    const l = largestCost(s, FX, PRICE)!
    expect(l.label).toBe(top.label)
    expect(l.brlHa).toBeCloseTo(top.brlHa, 6)
    expect(l.share).toBeCloseTo(top.brlHa / statusTotals(slices).totalBrlHa, 10)
  })

  it('an opened category counts as the sum of its items', () => {
    const s = start([
      { type: 'setCostItem', itemId: 'defensivos.herbicida', patch: { mode: 'valor', valueBrlHa: 5000 } },
    ])
    const l = largestCost(s, FX, PRICE)!
    expect(l.label).toBe('Defensivos')
    expect(l.brlHa).toBeGreaterThanOrEqual(5000)
  })

  it('single typed total: no split of its own, so no biggest cost', () => {
    const s = reducer(initialState(), { type: 'setInput', key: 'costPerHaBrl', value: 5000 })
    expect(largestCost(s, FX, PRICE)).toBeNull()
  })

  it('null when there is no cost to split', () => {
    const s = reducer(legacyState(), { type: 'setInput', key: 'costPerHaBrl', value: 0 })
    // the single-total mode distributes the typed total over the categories: 0 in, nothing to show
    expect(largestCost({ ...s, costCategories: Object.fromEntries(COST_CATEGORY_IDS.map((g) => [g, 0])) as never }, FX, PRICE)).toBeNull()
  })
})

describe('categorySlices', () => {
  it('one slice per category (8 at most), summing opened items; same total as the item-level slices', () => {
    const s = start([
      { type: 'setCostItem', itemId: 'defensivos.herbicida', patch: { mode: 'valor', valueBrlHa: 900 } },
      { type: 'setCostItem', itemId: 'defensivos.fungicida', patch: { mode: 'valor', valueBrlHa: 600 } },
    ])
    const items = costSlices(s, FX, PRICE)
    const cats = categorySlices(items)
    expect(cats.length).toBeLessThanOrEqual(8)
    expect(new Set(cats.map((c) => c.group)).size).toBe(cats.length)
    expect(cats.every((c) => c.id === c.group)).toBe(true)
    const def = cats.find((c) => c.group === 'defensivos')!
    expect(def.label).toBe('Defensivos')
    expect(def.brlHa).toBeCloseTo(items.filter((i) => i.group === 'defensivos').reduce((a, i) => a + i.brlHa, 0), 8)
    expect(statusTotals(cats).totalBrlHa).toBeCloseTo(statusTotals(items).totalBrlHa, 8)
  })

  it('a category is orçado when any of its items is', () => {
    const s = start([
      { type: 'setCostItem', itemId: 'defensivos.herbicida', patch: { mode: 'valor', valueBrlHa: 900 } },
      { type: 'setCostBudgeted', group: 'defensivos', itemId: 'defensivos.herbicida', value: true },
    ])
    expect(categorySlices(costSlices(s, FX, PRICE)).find((c) => c.group === 'defensivos')!.status).toBe('orcado')
  })
})

describe('sliceTooltip (by category)', () => {
  it('a category kept as one total: its cost and share of the whole, no item list', () => {
    const s = start()
    const slices = costSlices(s, FX, PRICE)
    const total = statusTotals(slices).totalBrlHa
    const t = sliceTooltip(slices, 'sementes')!
    expect(t.title).toBe('Sementes')
    expect(t.items).toBeNull()
    expect(t.brlHa).toBeCloseTo(slices.find((x) => x.id === 'sementes')!.brlHa, 8)
    expect(t.shareTotal).toBeCloseTo(t.brlHa / total, 10)
  })

  it('an opened category lists every item with its share of the category and of the whole cost', () => {
    const s = start([
      { type: 'setCostItem', itemId: 'defensivos.herbicida', patch: { mode: 'valor', valueBrlHa: 900 } },
      { type: 'setCostItem', itemId: 'defensivos.fungicida', patch: { mode: 'valor', valueBrlHa: 600 } },
      { type: 'setCostBudgeted', group: 'defensivos', itemId: 'defensivos.fungicida', value: true },
    ])
    const slices = costSlices(s, FX, PRICE)
    const total = statusTotals(slices).totalBrlHa
    const t = sliceTooltip(slices, 'defensivos')!
    expect(t.title).toBe('Defensivos')
    const items = t.items!
    expect(items.length).toBeGreaterThanOrEqual(2)
    expect(items[0].brlHa).toBeGreaterThanOrEqual(items[1].brlHa)
    expect(items.reduce((a, i) => a + i.shareGroup, 0)).toBeCloseTo(1, 10)
    const herb = items.find((i) => i.id === 'defensivos.herbicida')!
    expect(herb.brlHa).toBeCloseTo(900, 6)
    expect(herb.shareTotal).toBeCloseTo(900 / total, 10)
    expect(herb.shareGroup).toBeCloseTo(900 / t.brlHa, 10)
    expect(items.find((i) => i.id === 'defensivos.fungicida')!.status).toBe('orcado')
    expect(t.shareTotal).toBeCloseTo(t.brlHa / total, 10)
  })

  it('a category with no cost → null', () => {
    expect(sliceTooltip(costSlices(start(), FX, PRICE), 'nope' as never)).toBeNull()
  })
})
