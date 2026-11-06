import { activeHedge, opsForCrop, type HedgeOp } from './hedge'
import { marginFromPrice, type FarmInputs } from './calc'
import { legacyState } from '../test/helpers'
import { reducer } from '../state/reducer'
import { loadState, saveState, STORAGE_KEY } from '../state/persist'
import type { Action } from '../state/types'

beforeEach(() => localStorage.clear())

const op = (id: string, crop?: HedgeOp['crop']): HedgeOp => ({
  id,
  ...(crop ? { crop } : {}),
  asset: 'soja',
  kind: 'futuro',
  side: 'vendido',
  qty: 1000,
  strike: 1100,
  premium: 0,
  fxFixed: null,
  maturity: '',
})

describe('operations belong to their crop', () => {
  it('opsForCrop keeps only that crop; an operation without a crop is a soybean one', () => {
    const all = [op('a'), op('b', 'soja'), op('c', 'milho')]
    expect(opsForCrop(all, 'soja').map((o) => o.id)).toEqual(['a', 'b'])
    expect(opsForCrop(all, 'milho').map((o) => o.id)).toEqual(['c'])
    expect(activeHedge(opsForCrop(all, 'milho'), 5.5)?.ops).toHaveLength(1)
    expect(activeHedge(opsForCrop([op('a')], 'milho'), 5.5)).toBeUndefined()
  })

  it('addHedgeOp stamps the crop on screen; switching crop does not touch the operations', () => {
    let s = reducer(legacyState(), { type: 'addHedgeOp' })
    expect(s.hedgeOps[0].crop).toBe('soja')
    s = reducer(s, { type: 'setCrop', crop: 'milho' })
    s = reducer(s, { type: 'addHedgeOp' })
    expect(s.hedgeOps.map((o) => o.crop)).toEqual(['soja', 'milho'])
  })

  it('the crop survives a save/load; older saves without it load as soja; a bad crop discards the blob', () => {
    const s = reducer(reducer(legacyState(), { type: 'setCrop', crop: 'milho' }), { type: 'addHedgeOp' })
    saveState(s)
    expect(loadState()?.hedgeOps?.[0].crop).toBe('milho')
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string)
    delete raw.hedgeOps[0].crop
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
    expect(loadState()?.hedgeOps?.[0].crop).toBe('soja')
    raw.hedgeOps[0].crop = 'trigo'
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
    expect(loadState()).toBeNull()
  })

  it('a patch cannot move an operation to another crop', () => {
    const s = reducer(legacyState(), { type: 'addHedgeOp' })
    const t = reducer(s, { type: 'updateHedgeOp', id: 'op-1', patch: { crop: 'milho' } as never })
    expect(t.hedgeOps[0].crop).toBe('soja')
  })
})

describe('changing the asset of an operation (reducer level)', () => {
  it('starts the numbers over: bushels are not reinterpreted as US$', () => {
    const a: Action[] = [
      { type: 'addHedgeOp', partial: { qty: 50000, strike: 1250, kind: 'put', premium: 20, fxFixed: 5.3 } },
      { type: 'updateHedgeOp', id: 'op-1', patch: { asset: 'dolar' } },
    ]
    const s = a.reduce(reducer, legacyState())
    expect(s.hedgeOps[0]).toMatchObject({ asset: 'dolar', qty: 0, strike: 0, premium: 0, fxFixed: null })
  })

  it('keeps what the same patch types explicitly', () => {
    const a: Action[] = [
      { type: 'addHedgeOp', partial: { qty: 50000, strike: 1250 } },
      { type: 'updateHedgeOp', id: 'op-1', patch: { asset: 'dolar', qty: 1e6, strike: 5.4 } },
    ]
    expect(a.reduce(reducer, legacyState()).hedgeOps[0]).toMatchObject({ asset: 'dolar', qty: 1e6, strike: 5.4 })
  })
})

describe('margin % with a non-positive revenue', () => {
  const i: FarmInputs = {
    areaHa: 100,
    yieldScHa: 60,
    costPerHaBrl: 3000,
    freightBrlPerSc: 0,
    portFeesBrlPerSc: 0,
    soldPct: 0,
    soldAvgPriceBrl: 0,
    targetMargin: null,
    marginBase: 'receita',
    costUsd: [],
    fxLockPct: 0,
    fxLockRate: 0,
    costScHa: 0,
  }
  it('is unknown (null), never a positive number, when the effective price is ≤ 0 on the revenue base', () => {
    for (const price of [-20, 0]) {
      const m = marginFromPrice(price, i)
      expect(m.marginPerSc).toBeCloseTo(price - 50, 10)
      expect(m.marginPct).toBeNull()
    }
    expect(marginFromPrice(100, i).marginPct).toBeCloseTo(0.5, 10)
  })
  it('the cost base is unchanged (cost is the denominator)', () => {
    expect(marginFromPrice(-20, { ...i, marginBase: 'custo' }).marginPct).toBeCloseTo(-70 / 50, 10)
  })
})
