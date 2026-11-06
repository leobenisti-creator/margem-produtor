import { hedgeOpProblem, lotSizeOf, type HedgeOp } from '../engine/hedge'
import { legacyState } from '../test/helpers'
import { loadState, saveState, STORAGE_KEY } from './persist'
import { reducer } from './reducer'
import type { Action } from './types'
import { applyHedgePatch, isStoredHedgeOp } from './hedge'

beforeEach(() => localStorage.clear())

const run = (...actions: Action[]) => actions.reduce(reducer, legacyState())

describe('market operations (hedgeOps) in the store', () => {
  it('starts empty; addHedgeOp creates an empty soybean future sold with a generated id', () => {
    expect(legacyState().hedgeOps).toEqual([])
    const s = run({ type: 'addHedgeOp' }, { type: 'addHedgeOp' })
    expect(s.hedgeOps.map((o) => o.id)).toEqual(['op-1', 'op-2'])
    expect(s.hedgeOps[0]).toMatchObject({
      asset: 'soja',
      kind: 'futuro',
      side: 'vendido',
      qty: 0,
      strike: 0,
      premium: 0,
      fxFixed: null,
    })
  })

  it('ids never repeat after a removal', () => {
    const s = run(
      { type: 'addHedgeOp' },
      { type: 'addHedgeOp' },
      { type: 'removeHedgeOp', id: 'op-1' },
      { type: 'addHedgeOp' },
    )
    expect(s.hedgeOps.map((o) => o.id)).toEqual(['op-2', 'op-3'])
  })

  it('updateHedgeOp applies valid patches; invalid ones are rejected without touching the state', () => {
    const s = run(
      { type: 'addHedgeOp' },
      { type: 'updateHedgeOp', id: 'op-1', patch: { qty: 50000, strike: 1250, maturity: 'jul/27' } },
    )
    expect(s.hedgeOps[0]).toMatchObject({ qty: 50000, strike: 1250, maturity: 'jul/27' })
    for (const bad of [
      { qty: -1 },
      { strike: Number.NaN },
      { kind: 'swap' },
      { side: 'x' },
      { asset: 'milho' },
      { fxFixed: 0 },
      { maturity: 'x'.repeat(25) },
      { premium: -2 },
    ]) {
      expect(reducer(s, { type: 'updateHedgeOp', id: 'op-1', patch: bad as never })).toBe(s)
    }
    expect(reducer(s, { type: 'updateHedgeOp', id: 'nope', patch: { qty: 1 } })).toBe(s)
    expect(reducer(s, { type: 'removeHedgeOp', id: 'nope' })).toBe(s)
  })

  it('a future has no premium, and the dollar fixing exists only on soybean operations', () => {
    let s = run({ type: 'addHedgeOp', partial: { kind: 'put', premium: 30, fxFixed: 5.2 } })
    expect(s.hedgeOps[0]).toMatchObject({ kind: 'put', premium: 30, fxFixed: 5.2 })
    s = reducer(s, { type: 'updateHedgeOp', id: 'op-1', patch: { kind: 'futuro' } })
    expect(s.hedgeOps[0].premium).toBe(0)
    s = reducer(s, { type: 'updateHedgeOp', id: 'op-1', patch: { asset: 'dolar' } })
    expect(s.hedgeOps[0].fxFixed).toBeNull()
  })

  it('removeHedgeOp removes just that one', () => {
    const s = run({ type: 'addHedgeOp' }, { type: 'addHedgeOp' }, { type: 'removeHedgeOp', id: 'op-1' })
    expect(s.hedgeOps.map((o) => o.id)).toEqual(['op-2'])
  })

  it('hedgeOpProblem says what is missing, in pt-BR', () => {
    const base: HedgeOp = {
      id: 'a',
      asset: 'soja',
      kind: 'futuro',
      side: 'vendido',
      qty: 0,
      strike: 0,
      premium: 0,
      fxFixed: null,
      maturity: '',
    }
    expect(hedgeOpProblem(base)).toMatch(/quantidade/)
    expect(hedgeOpProblem({ ...base, qty: 5000 })).toMatch(/preço do futuro/)
    expect(hedgeOpProblem({ ...base, qty: 5000, strike: 1250 })).toBeNull()
    expect(hedgeOpProblem({ ...base, asset: 'dolar', qty: 1e5 })).toMatch(/preço do futuro em R\$\/US\$/)
    expect(hedgeOpProblem({ ...base, asset: 'dolar', qty: 1e5, strike: 5.4 })).toBeNull()
    expect(hedgeOpProblem({ ...base, asset: 'dolar', qty: 1e5, strike: 5.4, fxFixed: 5 })).toMatch(/dólar fixado/)
    expect(hedgeOpProblem({ ...base, qty: 5000, strike: 1250, fxFixed: 5.1 })).toBeNull()
  })

  it('operations survive a save and a load, including an empty one; a bad stored shape discards the blob', () => {
    const s = run(
      {
        type: 'addHedgeOp',
        partial: {
          kind: 'put',
          side: 'comprado',
          qty: 100000,
          strike: 1200,
          premium: 25,
          fxFixed: 5.3,
          maturity: 'mar/27',
        },
      },
      { type: 'addHedgeOp' },
    )
    saveState(s)
    expect(loadState()?.hedgeOps).toEqual(s.hedgeOps)
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string)
    raw.hedgeOps[0].kind = 'swap'
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
    expect(loadState()).toBeNull()
  })

  it('a saved state without operations loads as none (older saves)', () => {
    saveState(legacyState())
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string)
    delete raw.hedgeOps
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
    expect(loadState()?.hedgeOps).toEqual([])
  })

  it('duplicate ids discard the blob', () => {
    const s = run({ type: 'addHedgeOp' }, { type: 'addHedgeOp' })
    saveState(s)
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string)
    raw.hedgeOps[1].id = raw.hedgeOps[0].id
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
    expect(loadState()).toBeNull()
  })
})

describe('lotSize (dollar contract size)', () => {
  const base = {
    id: 'op-1',
    asset: 'dolar',
    kind: 'futuro',
    side: 'vendido',
    qty: 0,
    strike: 0,
    premium: 0,
    fxFixed: null,
    maturity: '',
  } as const

  it('accepts a positive size on a dollar operation, rejects zero/negative, null clears it', () => {
    const a = applyHedgePatch({ ...base }, { lotSize: 10_000 })
    expect(a?.lotSize).toBe(10_000)
    expect(applyHedgePatch({ ...base }, { lotSize: 0 })).toBeNull()
    expect(applyHedgePatch({ ...base }, { lotSize: -1 })).toBeNull()
    expect(applyHedgePatch(a!, { lotSize: null })?.lotSize).toBeUndefined()
  })

  it('soja may have its own size too (mini or OTC); changing the asset drops it (other unit)', () => {
    expect(applyHedgePatch({ ...base, asset: 'soja' }, { lotSize: 1_000 })?.lotSize).toBe(1_000)
    expect(applyHedgePatch({ ...base, lotSize: 10_000 }, { asset: 'soja' })?.lotSize).toBeUndefined()
  })

  it('lotSizeOf: the typed size (any asset), else the standard', () => {
    expect(lotSizeOf({ asset: 'dolar' })).toBe(50_000)
    expect(lotSizeOf({ asset: 'dolar', lotSize: 1_000_000 })).toBe(1_000_000)
    expect(lotSizeOf({ asset: 'soja' })).toBe(5_000)
    expect(lotSizeOf({ asset: 'soja', lotSize: 1_000 })).toBe(1_000)
  })

  it('stored shape: a bad size is rejected', () => {
    expect(isStoredHedgeOp({ ...base, lotSize: 10_000 })).toBe(true)
    expect(isStoredHedgeOp({ ...base, lotSize: 0 })).toBe(false)
    expect(isStoredHedgeOp({ ...base, lotSize: 'x' })).toBe(false)
  })
})

describe('lotSize persistence', () => {
  it('a typed contract size survives save and load', () => {
    const s = run({ type: 'addHedgeOp', partial: { asset: 'dolar', qty: 2_000_000, strike: 5.5, lotSize: 1_000_000 } })
    saveState(s)
    expect(loadState()?.hedgeOps?.[0]?.lotSize).toBe(1_000_000)
  })
})

describe('barrier, accumulator and dates in the patch', () => {
  const base = {
    id: 'op-1',
    asset: 'soja',
    kind: 'futuro',
    side: 'vendido',
    qty: 0,
    strike: 0,
    premium: 0,
    fxFixed: null,
    maturity: '',
  } as const

  it('accumulator is forced to sold, keeps its premium, with a default weekly schedule', () => {
    const a = applyHedgePatch({ ...base, side: 'comprado', premium: 10 }, { kind: 'accumulator' })
    expect(a).toMatchObject({ kind: 'accumulator', side: 'vendido', premium: 10, accum: { frequency: 'semanal' } })
    // a sold accumulator stays sold even when asked otherwise
    expect(applyHedgePatch(a!, { side: 'comprado' })?.side).toBe('vendido')
  })

  it('accumulator keeps only a knock-out barrier; leaving it drops the schedule', () => {
    const acc = applyHedgePatch({ ...base }, { kind: 'accumulator' })!
    expect(applyHedgePatch(acc, { barrier: { type: 'ki', price: 1100, dir: 'baixa' } })?.barrier).toBeUndefined()
    const ko = applyHedgePatch(acc, { barrier: { type: 'ko', price: 1100, dir: 'baixa' } })!
    expect(ko.barrier).toEqual({ type: 'ko', price: 1100, dir: 'baixa' })
    const put = applyHedgePatch(ko, { kind: 'put' })!
    expect(put.accum).toBeUndefined()
    expect(put.barrier).toEqual({ type: 'ko', price: 1100, dir: 'baixa' }) // a put may keep a knock-out
  })

  it('a future never keeps a barrier; null clears it', () => {
    const put = applyHedgePatch({ ...base }, { kind: 'put', barrier: { type: 'ko', price: 1100, dir: 'baixa' } })!
    expect(put.barrier).toBeDefined()
    expect(applyHedgePatch(put, { kind: 'futuro' })?.barrier).toBeUndefined()
    expect(applyHedgePatch(put, { barrier: null })?.barrier).toBeUndefined()
  })

  it('the dollar has no barrier and no accumulator: choosing the dollar turns it into a future', () => {
    const acc = applyHedgePatch(
      { ...base },
      { kind: 'accumulator', barrier: { type: 'ko', price: 1100, dir: 'baixa' } },
    )!
    const dol = applyHedgePatch(acc, { asset: 'dolar' })!
    expect(dol).toMatchObject({ asset: 'dolar', kind: 'futuro' })
    expect(dol.barrier).toBeUndefined()
    expect(dol.accum).toBeUndefined()
  })

  it('barrier price may still be empty (0) while typing; a negative price or a bad direction is rejected', () => {
    expect(
      applyHedgePatch({ ...base, kind: 'put' }, { barrier: { type: 'ko', price: 0, dir: 'baixa' } }),
    ).not.toBeNull()
    expect(applyHedgePatch({ ...base, kind: 'put' }, { barrier: { type: 'ko', price: -1, dir: 'baixa' } })).toBeNull()
    expect(applyHedgePatch({ ...base, kind: 'put' }, { barrier: { type: 'ko', price: 1, dir: 'x' } })).toBeNull()
  })

  it('dates must be real ISO dates; null or empty clears them', () => {
    const a = applyHedgePatch(
      { ...base },
      { startDate: '2026-01-05', maturityDate: '2026-03-31', closedDate: '2026-02-01' },
    )!
    expect(a).toMatchObject({ startDate: '2026-01-05', maturityDate: '2026-03-31', closedDate: '2026-02-01' })
    expect(applyHedgePatch(a, { maturityDate: null })?.maturityDate).toBeUndefined()
    expect(applyHedgePatch(a, { closedDate: '' })?.closedDate).toBeUndefined()
    expect(applyHedgePatch(a, { startDate: '2026-02-30' })).toBeNull()
    expect(applyHedgePatch(a, { startDate: '05/01/2026' })).toBeNull()
  })

  it('accumulator schedule is validated (day range by frequency, whole number of fixings done)', () => {
    const acc = applyHedgePatch({ ...base }, { kind: 'accumulator' })!
    expect(applyHedgePatch(acc, { accum: { frequency: 'semanal', day: 4 } })?.accum).toEqual({
      frequency: 'semanal',
      day: 4,
    })
    expect(applyHedgePatch(acc, { accum: { frequency: 'semanal', day: 6 } })).toBeNull()
    expect(applyHedgePatch(acc, { accum: { frequency: 'mensal', day: 31 } })).not.toBeNull()
    expect(applyHedgePatch(acc, { accum: { frequency: 'mensal', day: 32 } })).toBeNull()
    expect(applyHedgePatch(acc, { accum: { frequency: 'diario', fixingsDone: 1.5 } })).toBeNull()
    expect(applyHedgePatch(acc, { accum: { frequency: 'quinzenal' } as never })).toBeNull()
  })
})

describe('barrier, accumulator and dates persistence', () => {
  it('everything survives save and load', () => {
    const s = run(
      {
        type: 'addHedgeOp',
        partial: {
          kind: 'accumulator',
          floorLevel: 1000,
          qty: 5000,
          strike: 1300,
          startDate: '2026-03-02',
          maturityDate: '2026-03-30',
          closedDate: '2026-03-20',
          barrier: { type: 'ko', price: 1250, dir: 'baixa' },
          accum: { frequency: 'mensal', day: 15, fixingsDone: 2 },
        },
      },
      {
        type: 'addHedgeOp',
        partial: {
          kind: 'call',
          side: 'comprado',
          qty: 5000,
          strike: 1300,
          premium: 10,
          barrier: { type: 'ki', price: 1400, dir: 'alta' },
        },
      },
    )
    saveState(s)
    expect(loadState()?.hedgeOps).toEqual(s.hedgeOps)
  })

  it('a corrupted barrier or date makes the save unreadable (strict parse)', () => {
    const s = run({
      type: 'addHedgeOp',
      partial: { kind: 'put', qty: 5000, strike: 1300, barrier: { type: 'ko', price: 1250, dir: 'baixa' } },
    })
    saveState(s)
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string)
    raw.hedgeOps[0].barrier.dir = 'lado'
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
    expect(loadState()).toBeNull()
    saveState(s)
    const raw2 = JSON.parse(localStorage.getItem(STORAGE_KEY) as string)
    raw2.hedgeOps[0].startDate = '2026-13-45'
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw2))
    expect(loadState()).toBeNull()
  })

  it('older saves without any of the new fields still load', () => {
    const s = run({ type: 'addHedgeOp', partial: { qty: 5000, strike: 1300, maturity: 'jul/27' } })
    saveState(s)
    const op = loadState()?.hedgeOps?.[0]
    expect(op).toMatchObject({ kind: 'futuro', maturity: 'jul/27' })
    expect(op?.startDate).toBeUndefined()
    expect(op?.barrier).toBeUndefined()
  })
})

describe('closing, costs, contract and barrier date fields', () => {
  const base = {
    id: 'op-1',
    asset: 'soja',
    kind: 'futuro',
    side: 'vendido',
    qty: 0,
    strike: 0,
    premium: 0,
    fxFixed: null,
    maturity: '',
  } as const

  it('closePrice, costBrl: non-negative numbers, null clears, negatives are rejected', () => {
    const a = applyHedgePatch({ ...base }, { closePrice: 1270, costBrl: 1200 })!
    expect(a).toMatchObject({ closePrice: 1270, costBrl: 1200 })
    expect(applyHedgePatch(a, { closePrice: null, costBrl: null })).toEqual({ ...base })
    expect(applyHedgePatch(a, { closePrice: -1 })).toBeNull()
    expect(applyHedgePatch(a, { costBrl: -5 })).toBeNull()
  })

  it('closeValueUsd is signed, only for accumulators; closePrice is not for accumulators', () => {
    const acc = applyHedgePatch({ ...base }, { kind: 'accumulator', closeValueUsd: -2000 })!
    expect(acc.closeValueUsd).toBe(-2000)
    expect(applyHedgePatch(acc, { closeValueUsd: Number.NaN })).toBeNull()
    expect(applyHedgePatch(acc, { closePrice: 1200 })?.closePrice).toBeUndefined()
    // a future never keeps a signed closing value
    expect(applyHedgePatch({ ...base }, { closeValueUsd: 5 })?.closeValueUsd).toBeUndefined()
  })

  it('changing the kind starts the closing price over unless a new one is given', () => {
    const fut = applyHedgePatch({ ...base }, { closePrice: 1270 })!
    expect(applyHedgePatch(fut, { kind: 'put' })?.closePrice).toBeUndefined()
    expect(applyHedgePatch(fut, { kind: 'put', closePrice: 40 })?.closePrice).toBe(40)
    expect(applyHedgePatch(fut, { side: 'comprado' })?.closePrice).toBe(1270) // same kind: kept
  })

  it('contract is short free text; barrierHitDate needs a barrier and a real date', () => {
    expect(applyHedgePatch({ ...base }, { contract: 'SK26' })?.contract).toBe('SK26')
    expect(applyHedgePatch({ ...base, contract: 'SK26' }, { contract: '' })?.contract).toBeUndefined()
    expect(applyHedgePatch({ ...base }, { contract: 'x'.repeat(25) })).toBeNull()
    const put = applyHedgePatch({ ...base }, { kind: 'put', barrier: { type: 'ko', price: 1100, dir: 'baixa' } })!
    expect(applyHedgePatch(put, { barrierHitDate: '2026-02-01' })?.barrierHitDate).toBe('2026-02-01')
    expect(applyHedgePatch(put, { barrierHitDate: '2026-02-31' })).toBeNull()
    // taking the barrier away takes its date away
    const hit = applyHedgePatch(put, { barrierHitDate: '2026-02-01' })!
    expect(applyHedgePatch(hit, { barrier: null })?.barrierHitDate).toBeUndefined()
    // a future has no barrier, so no barrier date either
    expect(applyHedgePatch({ ...base }, { barrierHitDate: '2026-02-01' })?.barrierHitDate).toBeUndefined()
  })

  it('guaranteed fixings: a whole number of fixings inside the schedule', () => {
    const acc = applyHedgePatch({ ...base }, { kind: 'accumulator' })!
    expect(applyHedgePatch(acc, { accum: { frequency: 'semanal', guaranteed: 4 } })?.accum?.guaranteed).toBe(4)
    expect(applyHedgePatch(acc, { accum: { frequency: 'semanal', guaranteed: 1.5 } })).toBeNull()
    expect(applyHedgePatch(acc, { accum: { frequency: 'semanal', guaranteed: -1 } })).toBeNull()
  })

  it('hedgeOpProblem validates the new fields', () => {
    const ok = { ...base, qty: 5000, strike: 1300 }
    expect(hedgeOpProblem(ok)).toBeNull()
    expect(hedgeOpProblem({ ...ok, closePrice: -1 })).toMatch(/preço de encerramento/)
    expect(hedgeOpProblem({ ...ok, costBrl: -1 })).toMatch(/custos da operação/)
    expect(hedgeOpProblem({ ...ok, closeValueUsd: Number.POSITIVE_INFINITY })).toMatch(/encerramento/)
    expect(hedgeOpProblem({ ...ok, barrierHitDate: '2026-13-01' })).toMatch(/Data inválida/)
  })

  it('all of them survive save and load; a corrupted one makes the save unreadable', () => {
    const s = run({
      type: 'addHedgeOp',
      partial: {
        kind: 'put',
        side: 'comprado',
        qty: 5000,
        strike: 1300,
        premium: 10,
        startDate: '2026-01-05',
        maturityDate: '2026-12-31',
        closedDate: '2026-02-10',
        closePrice: 55,
        costBrl: 300,
        contract: 'SK26',
        lotSize: 1000,
        barrier: { type: 'ko', price: 1150, dir: 'baixa' },
        barrierHitDate: '2026-02-01',
      },
    })
    saveState(s)
    expect(loadState()?.hedgeOps).toEqual(s.hedgeOps)
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string)
    raw.hedgeOps[0].costBrl = -3
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
    expect(loadState()).toBeNull()
  })
})

describe('accumulator: floor level and premium direction', () => {
  const base = {
    id: 'op-1',
    asset: 'soja',
    kind: 'futuro',
    side: 'vendido',
    qty: 0,
    strike: 0,
    premium: 0,
    fxFixed: null,
    maturity: '',
  } as const

  it('the floor level exists only on the accumulator without a knock-out (floor/ceiling)', () => {
    const acc = applyHedgePatch({ ...base }, { kind: 'accumulator', floorLevel: 1200 })!
    expect(acc.floorLevel).toBe(1200)
    expect(applyHedgePatch(acc, { floorLevel: null })?.floorLevel).toBeUndefined()
    expect(applyHedgePatch(acc, { floorLevel: -1 })).toBeNull()
    // with a knock-out the floor level goes away; a put or a future never keeps one
    expect(applyHedgePatch(acc, { barrier: { type: 'ko', price: 1100, dir: 'baixa' } })?.floorLevel).toBeUndefined()
    expect(applyHedgePatch(acc, { kind: 'put' })?.floorLevel).toBeUndefined()
    expect(applyHedgePatch({ ...base }, { floorLevel: 1200 })?.floorLevel).toBeUndefined()
  })

  it('premiumDir is pago or recebido, accumulator only', () => {
    const acc = applyHedgePatch({ ...base }, { kind: 'accumulator', premiumDir: 'recebido' })!
    expect(acc.premiumDir).toBe('recebido')
    expect(applyHedgePatch(acc, { premiumDir: null })?.premiumDir).toBeUndefined()
    expect(applyHedgePatch(acc, { premiumDir: 'x' as never })).toBeNull()
    expect(applyHedgePatch(acc, { kind: 'put' })?.premiumDir).toBeUndefined()
    expect(applyHedgePatch({ ...base }, { premiumDir: 'pago' })?.premiumDir).toBeUndefined()
  })

  it('the premium of an accumulator is validated and both new fields survive save and load', () => {
    const ok = {
      ...base,
      kind: 'accumulator' as const,
      floorLevel: 1000,
      qty: 5000,
      strike: 1300,
      startDate: '2026-03-02',
      maturityDate: '2026-03-30',
      accum: { frequency: 'semanal' as const },
    }
    expect(hedgeOpProblem(ok)).toBeNull()
    expect(hedgeOpProblem({ ...ok, premium: -1 })).toMatch(/prêmio/)
    expect(hedgeOpProblem({ ...ok, floorLevel: -5 })).toMatch(/nível piso/)
    expect(hedgeOpProblem({ ...ok, premiumDir: 'x' as never })).toMatch(/pago ou recebido/)
    const s = run({ type: 'addHedgeOp', partial: { ...ok, premium: 20, premiumDir: 'recebido', floorLevel: 1200 } })
    saveState(s)
    expect(loadState()?.hedgeOps).toEqual(s.hedgeOps)
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string)
    raw.hedgeOps[0].premiumDir = 'talvez'
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
    expect(loadState()).toBeNull()
  })
})

describe('maturity month and total lots of the accumulator', () => {
  const acc = {
    id: 'op-1',
    asset: 'soja' as const,
    side: 'vendido' as const,
    qty: 0,
    premium: 0,
    fxFixed: null,
    maturity: '',
    kind: 'accumulator' as const,
    floorLevel: 1000,
    strike: 1300,
    startDate: '2026-03-02',
    maturityDate: '2026-03-30',
    accum: { frequency: 'semanal' as const },
  }

  it('the quantity per fixing is the total lots x lot size / fixings, and follows the schedule', () => {
    const a = applyHedgePatch({ ...acc, qty: 0 } as HedgeOp, { accum: { frequency: 'semanal', totalLots: 10 } }) as HedgeOp
    expect(a.qty).toBe((10 * 5000) / 5) // 5 Mondays
    const b = applyHedgePatch(a, { maturityDate: '2026-04-27' }) as HedgeOp
    expect(b.qty).toBe((10 * 5000) / 9)
    expect(b.accum?.totalLots).toBe(10)
    const c = applyHedgePatch(b, { lotSize: 1000 }) as HedgeOp
    expect(c.qty).toBe((10 * 1000) / 9)
    const d = applyHedgePatch(b, { startDate: null }) as HedgeOp
    expect(d.qty).toBe(0) // no schedule, nothing to divide by
    expect(hedgeOpProblem(d)).toMatch(/data de início e o mês de vencimento/)
  })

  it('without total lots (older saves) the typed quantity stays', () => {
    const a = applyHedgePatch({ ...acc, qty: 5000 } as HedgeOp, { maturityDate: '2026-04-27' }) as HedgeOp
    expect(a.qty).toBe(5000)
    expect(a.accum?.totalLots).toBeUndefined()
  })

  it('total lots and maturity month are validated, survive save and load, and a bad month rejects the save', () => {
    expect(applyHedgePatch({ ...acc, qty: 5000 } as HedgeOp, { accum: { frequency: 'semanal', totalLots: -1 } })).toBeNull()
    expect(applyHedgePatch({ ...acc, qty: 5000 } as HedgeOp, { maturityMonth: '2026-13' })).toBeNull()
    const s = run({
      type: 'addHedgeOp',
      partial: { ...acc, qty: 0, maturityMonth: '2026-04', accum: { frequency: 'semanal', totalLots: 10 } },
    })
    expect(s.hedgeOps[0]).toMatchObject({ maturityMonth: '2026-04', qty: 10000, accum: { totalLots: 10 } })
    saveState(s)
    expect(loadState()?.hedgeOps).toEqual(s.hedgeOps)
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string)
    raw.hedgeOps[0].maturityMonth = 'abril'
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
    expect(loadState()).toBeNull()
  })
})
