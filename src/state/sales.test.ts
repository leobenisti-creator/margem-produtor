import { computeResult, type Scenario } from '../engine/calc'
import { CROPS } from '../engine/crops'
import { soldSummary } from '../engine/sales'
import { legacyState } from '../test/helpers'
import { loadState, mergeState, saveState, STORAGE_KEY } from './persist'
import { initialState, reducer } from './reducer'
import type { Action, AppState } from './types'

afterEach(() => localStorage.clear())

const SCN: Scenario = { cbotUsc: 1050, basisUsc: 61.7, fx: 5.4 }
const run = (s: AppState, actions: Action[]): AppState => actions.reduce(reducer, s)
const result = (s: AppState) => computeResult(CROPS[s.crop], SCN, s.inputs)
const boot = () => mergeState(initialState(), loadState())

/** Legacy farm with a manual sale of 30% at R$ 140/sc. */
function manual(): AppState {
  return run(legacyState(), [
    { type: 'setInput', key: 'areaHa', value: 1000 },
    { type: 'setInput', key: 'yieldScHa', value: 60 },
    { type: 'setInput', key: 'soldPct', value: 0.3 },
    { type: 'setInput', key: 'soldAvgPriceBrl', value: 140 },
  ])
}

/** 600 t (10.000 sc) a R$ 120 + 5.000 sc a US$ 27,36 × 5,40 (= R$ 147,744); production 60.000 sc. */
const TWO: Action[] = [
  { type: 'addSale', partial: { volume: 600, volumeUnit: 't', price: 120 } },
  { type: 'addSale', partial: { volume: 5000, volumeUnit: 'sc', price: 27.36, priceCurrency: 'USD', dollar: 5.4 } },
]
const TWO_AVG = (1200000 + 738720) / 15000 // 129,248
const TWO_PCT = 15000 / 60000 // 0,25

describe('sales tranches in the state', () => {
  it('starts with no tranches', () => {
    expect(initialState().sales).toEqual([])
  })

  it('addSale creates tranches with unique ids and the defaults sc / R$', () => {
    const s = run(initialState(), [{ type: 'addSale' }, { type: 'addSale' }])
    expect(s.sales).toHaveLength(2)
    expect(s.sales[0]).toMatchObject({ volume: 0, volumeUnit: 'sc', price: 0, priceCurrency: 'BRL', dollar: null })
    expect(s.sales[0].id).not.toBe(s.sales[1].id)
    // after a removal the next id still does not collide
    const s2 = run(s, [{ type: 'removeSale', id: s.sales[0].id }, { type: 'addSale' }])
    expect(new Set(s2.sales.map((x) => x.id)).size).toBe(2)
  })

  it('no tranches: the result is identical to today (manual values)', () => {
    const before = manual()
    expect(before.inputs.soldPct).toBe(0.3)
    expect(before.inputs.soldAvgPriceBrl).toBe(140)
    const r = result(before)
    expect(r.blendedPriceBrl).toBeCloseTo(0.3 * 140 + 0.7 * r.farmPriceBrl!, 9)
    // an empty (invalid) tranche changes nothing either
    const withEmpty = run(before, [{ type: 'addSale' }])
    expect(withEmpty.inputs).toEqual(before.inputs)
    expect(result(withEmpty)).toEqual(r)
  })

  it('with valid tranches soldPct / soldAvgPriceBrl are derived and the result matches the manual equivalent', () => {
    const s = run(manual(), TWO)
    expect(s.inputs.soldPct).toBeCloseTo(TWO_PCT, 12)
    expect(s.inputs.soldAvgPriceBrl).toBeCloseTo(TWO_AVG, 9)
    const byHand = computeResult(CROPS.soja, SCN, { ...s.inputs, soldPct: 0.25, soldAvgPriceBrl: 129.248 })
    const r = result(s)
    expect(r.blendedPriceBrl).toBeCloseTo(byHand.blendedPriceBrl!, 9)
    expect(r.blendedPriceBrl).toBeCloseTo(0.25 * 129.248 + 0.75 * r.farmPriceBrl!, 9)
    expect(r.marginPct).toBeCloseTo(byHand.marginPct!, 9)
  })

  it('typing soldPct while tranches exist keeps the derived value and stores the manual one', () => {
    const s = run(manual(), [...TWO, { type: 'setInput', key: 'soldPct', value: 0.5 }])
    expect(s.inputs.soldPct).toBeCloseTo(TWO_PCT, 12)
    const back = run(
      s,
      s.sales.map((x): Action => ({ type: 'removeSale', id: x.id })),
    )
    expect(back.inputs.soldPct).toBe(0.5)
    expect(back.inputs.soldAvgPriceBrl).toBe(140)
  })

  it('removing all tranches restores the manual values (and the result)', () => {
    const before = manual()
    const s = run(before, TWO)
    const back = run(
      s,
      s.sales.map((x): Action => ({ type: 'removeSale', id: x.id })),
    )
    expect(back.sales).toEqual([])
    expect(back.inputs).toEqual(before.inputs)
    expect(result(back)).toEqual(result(before))
  })

  it('a sale above what is left of the production is cut to what is left (never past 100%)', () => {
    const s = run(manual(), [...TWO, { type: 'addSale', partial: { volume: 50000, volumeUnit: 'sc', price: 100 } }])
    expect(s.inputs.soldPct).toBe(1)
    expect(soldSummary(s.sales, 60000).soldSc).toBeCloseTo(60000, 6)
    expect(s.sales[s.sales.length - 1].volume).toBeLessThan(50000)
    expect(soldSummary(s.sales, 60000).overProduction).toBe(false)
  })

  it('updating a sale above the room is cut the same way, and a full production leaves 0 for a new sale', () => {
    const s = run(manual(), [...TWO, { type: 'addSale', partial: { volume: 50000, volumeUnit: 'sc', price: 100 } }])
    const id = s.sales[0].id
    const u = run(s, [{ type: 'updateSale', id, patch: { volume: 999999 } }])
    expect(soldSummary(u.sales, 60000).soldSc).toBeCloseTo(60000, 6)
    const extra = run(u, [{ type: 'addSale', partial: { volume: 10, volumeUnit: 'sc', price: 100 } }])
    expect(extra.sales[extra.sales.length - 1].volume).toBe(0)
  })

  it('production reduced after the sales: nothing is rewritten (a half-typed yield must not eat the sales)', () => {
    const s = run(manual(), TWO)
    const a = run(s, [{ type: 'setInput', key: 'areaHa', value: 1 }])
    expect(a.sales).toEqual(s.sales)
    expect(a.inputs.soldPct).toBe(1)
  })

  it('production 0 gives soldPct 0 without NaN', () => {
    const s = run(manual(), [...TWO, { type: 'setInput', key: 'areaHa', value: 0 }])
    expect(s.inputs.soldPct).toBe(0)
    expect(s.inputs.soldAvgPriceBrl).toBeCloseTo(TWO_AVG, 9)
    const r = result(s)
    for (const v of Object.values(r)) if (typeof v === 'number') expect(Number.isNaN(v)).toBe(false)
  })

  it('changing area or yield updates the derived soldPct', () => {
    const s = run(manual(), TWO)
    const a = run(s, [{ type: 'setInput', key: 'areaHa', value: 500 }])
    expect(a.inputs.soldPct).toBeCloseTo(15000 / 30000, 12)
    const y = run(s, [{ type: 'setInput', key: 'yieldScHa', value: 75 }])
    expect(y.inputs.soldPct).toBeCloseTo(15000 / 75000, 12)
  })

  it('updateSale patches a tranche and re-derives', () => {
    const s = run(manual(), TWO)
    const id = s.sales[1].id
    const u = run(s, [{ type: 'updateSale', id, patch: { dollar: 5 } }])
    expect(u.sales[1].dollar).toBe(5)
    expect(u.inputs.soldAvgPriceBrl).toBeCloseTo((1200000 + 5000 * 27.36 * 5) / 15000, 9)
    // USD without dollar → that tranche drops out of the derivation
    const n = run(s, [{ type: 'updateSale', id, patch: { dollar: null } }])
    expect(n.inputs.soldPct).toBeCloseTo(10000 / 60000, 12)
    expect(n.inputs.soldAvgPriceBrl).toBeCloseTo(120, 9)
  })

  it('rejected actions keep the same state reference', () => {
    const s = run(manual(), TWO)
    const id = s.sales[0].id
    const bad: Action[] = [
      { type: 'addSale', partial: { volume: -1 } },
      { type: 'addSale', partial: { volume: Number.NaN } },
      { type: 'addSale', partial: { price: Number.POSITIVE_INFINITY } },
      { type: 'addSale', partial: { dollar: 0 } },
      { type: 'addSale', partial: { volumeUnit: 'kg' as 't' } },
      { type: 'addSale', partial: { priceCurrency: 'EUR' as 'BRL' } },
      { type: 'updateSale', id: 'nao-existe', patch: { volume: 1 } },
      { type: 'updateSale', id, patch: { volume: -5 } },
      { type: 'updateSale', id, patch: { dollar: -1 } },
      { type: 'updateSale', id, patch: { volumeUnit: 'kg' as 't' } },
      { type: 'updateSale', id, patch: { price: Number.NaN } },
      { type: 'removeSale', id: 'nao-existe' },
    ]
    for (const a of bad) expect(reducer(s, a)).toBe(s)
  })

  it('fxLockPct / fxLockRate are untouched by the tranches', () => {
    const s = run(manual(), [{ type: 'setFxLock', pct: 0.4, rate: 5.3 }, ...TWO])
    expect(s.inputs.fxLockPct).toBe(0.4)
    expect(s.inputs.fxLockRate).toBe(5.3)
  })
})

describe('sales persistence (margem:v3)', () => {
  it('round trip keeps the tranches, the derived values and the manual values', () => {
    const s = run(manual(), [
      ...TWO,
      { type: 'addSale', partial: { volume: 10, volumeUnit: 'sc', price: 100, priceCurrency: 'BRL' } },
    ])
    saveState(s)
    const back = boot()
    expect(back.sales).toEqual(s.sales)
    expect(back).toEqual(s)
    const restored = run(
      back,
      back.sales.map((x): Action => ({ type: 'removeSale', id: x.id })),
    )
    expect(restored.inputs.soldPct).toBe(0.3)
    expect(restored.inputs.soldAvgPriceBrl).toBe(140)
  })

  it('a blob without sales loads with no tranches', () => {
    const s = manual()
    const blob = JSON.parse(JSON.stringify(s)) as Record<string, unknown>
    delete blob.sales
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blob))
    expect(boot().sales).toEqual([])
  })

  it('an in-progress US$ tranche without a dollar is not saved (the rest of the blob survives)', () => {
    const s = run(manual(), [...TWO, { type: 'addSale', partial: { priceCurrency: 'USD', volume: 5, price: 20 } }])
    saveState(s)
    const back = boot()
    expect(back.sales).toEqual(s.sales.slice(0, 2))
    expect(back.inputs.areaHa).toBe(1000)
  })

  it('invalid sales are a shape error (whole blob discarded)', () => {
    const s = JSON.parse(JSON.stringify(run(manual(), TWO))) as Record<string, unknown> & {
      sales: Record<string, unknown>[]
    }
    const [a, b] = s.sales
    for (const sales of [
      'x',
      [{ ...a, id: b.id }, b],
      [{ ...a, id: 7 }],
      [{ ...a, volumeUnit: 'kg' }],
      [{ ...a, priceCurrency: 'EUR' }],
      [{ ...a, volume: -1 }],
      [{ ...a, volume: 'x' }],
      [{ ...a, price: null }],
      [{ ...b, dollar: null }],
      [{ ...b, dollar: 0 }],
      [{ ...a, dollar: -2 }],
      [null],
    ]) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s, sales }))
      expect(loadState()).toBeNull()
    }
    for (const soldManual of ['x', { soldPct: 2, soldAvgPriceBrl: 1 }, { soldPct: 0.1, soldAvgPriceBrl: -1 }]) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s, soldManual }))
      expect(loadState()).toBeNull()
    }
  })
})
