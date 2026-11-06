import { reducer } from './reducer'
import { legacyState } from '../test/helpers'
import { foldOneGroup } from './costs'
import { loadState, mergeState, saveState } from './persist'
import type { AppState } from './types'

afterEach(() => localStorage.clear())

describe('item freight from the product table (Task 9)', () => {
  it('setCostItem stores the optional freight R$/t and rejects a negative one', () => {
    const s0 = legacyState()
    const s1 = reducer(s0, { type: 'setCostItem', itemId: 'adubacao.macro', patch: { freightBrlTon: 150 } })
    expect(s1.costGroups.fertilizantes.items['adubacao.macro'].freightBrlTon).toBe(150)
    const s2 = reducer(s1, { type: 'setCostItem', itemId: 'adubacao.macro', patch: { freightBrlTon: -1 } })
    expect(s2).toBe(s1)
  })

  it('the freight survives persistence; an invalid one discards the blob', () => {
    const s = reducer(legacyState(), {
      type: 'setCostItem',
      itemId: 'adubacao.macro',
      patch: { mode: 'valor', valueBrlHa: 700, freightBrlTon: 150 },
    })
    saveState(s)
    const back: AppState = mergeState(legacyState(), loadState())
    expect(back.costGroups.fertilizantes.items['adubacao.macro'].freightBrlTon).toBe(150)
    const raw = JSON.parse(localStorage.getItem('margem:v3') ?? '{}')
    raw.costGroups.fertilizantes.items['adubacao.macro'].freightBrlTon = 'x'
    localStorage.setItem('margem:v3', JSON.stringify(raw))
    expect(loadState()).toBeNull()
  })
})

describe('foldOneGroup', () => {
  it('returns the R$ part, the US$ lines and the sc/ha of one group', () => {
    let s = legacyState()
    s = reducer(s, {
      type: 'setCostItem',
      itemId: 'adubacao.macro',
      patch: { mode: 'valor', valueBrlHa: 100, usd: { amountUsdHa: 50, boughtPct: 0.6, boughtRate: 5.2 } },
    })
    s = reducer(s, { type: 'setCostItem', itemId: 'arrendamento.valor', patch: { mode: 'valor', unit: 'scHa', valueBrlHa: 8 } })
    const g = foldOneGroup(s.costGroups, 'fertilizantes', s.costFxDefault)
    expect(g.brl).toBeCloseTo(s.costCategories.fertilizantes, 6)
    expect(g.usdLines).toEqual([{ usdPerHa: 50, boughtPct: 0.6, boughtRate: 5.2 }])
    expect(g.scHa).toBe(0)
    const a = foldOneGroup(s.costGroups, 'arrendamento', s.costFxDefault)
    expect(a).toEqual({ brl: 0, usdLines: [], scHa: 8 })
  })
})

describe('custom formula rows (Follow-up 1)', () => {
  const customRow = {
    id: 'p1',
    productId: 'custom',
    name: '04-30-10',
    dose: 200,
    doseUnit: 'kg' as const,
    price: 3000,
    priceUnit: 't' as const,
    currency: 'BRL' as const,
    applications: 1,
    custom: { n: 0.04, p2o5: 0.3, k2o: 0.1 },
  }

  it('accepts valid contents and round-trips them through persistence', () => {
    const s = reducer(legacyState(), {
      type: 'setCostItem',
      itemId: 'adubacao.macro',
      patch: { mode: 'valor', valueBrlHa: 600, rows: [customRow] },
    })
    expect(s.costGroups.fertilizantes.items['adubacao.macro'].rows?.[0].custom).toEqual(customRow.custom)
    saveState(s)
    const back = mergeState(legacyState(), loadState())
    expect(back.costGroups.fertilizantes.items['adubacao.macro'].rows?.[0]).toEqual(customRow)
  })

  it('rejects contents that sum above 100% or are negative, in the reducer and in persistence', () => {
    const s0 = legacyState()
    for (const custom of [{ n: 0.5, p2o5: 0.4, k2o: 0.2 }, { n: -0.1, p2o5: 0, k2o: 0 }]) {
      const s1 = reducer(s0, {
        type: 'setCostItem',
        itemId: 'adubacao.macro',
        patch: { rows: [{ ...customRow, custom }] },
      })
      expect(s1).toBe(s0)
    }
    const ok = reducer(s0, { type: 'setCostItem', itemId: 'adubacao.macro', patch: { rows: [customRow] } })
    saveState(ok)
    const raw = JSON.parse(localStorage.getItem('margem:v3') ?? '{}')
    raw.costGroups.fertilizantes.items['adubacao.macro'].rows[0].custom.k2o = 0.9
    localStorage.setItem('margem:v3', JSON.stringify(raw))
    expect(loadState()).toBeNull()
  })
})

describe('clearing the item freight (Fix round 1, minor 9)', () => {
  it('freightBrlTon: null removes it', () => {
    const s1 = reducer(legacyState(), { type: 'setCostItem', itemId: 'adubacao.macro', patch: { freightBrlTon: 150 } })
    const s2 = reducer(s1, { type: 'setCostItem', itemId: 'adubacao.macro', patch: { mode: 'nao', rows: null, freightBrlTon: null } })
    expect(s2.costGroups.fertilizantes.items['adubacao.macro'].freightBrlTon).toBeUndefined()
    expect('freightBrlTon' in s2.costGroups.fertilizantes.items['adubacao.macro']).toBe(false)
  })
})
