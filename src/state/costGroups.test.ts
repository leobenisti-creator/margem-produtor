import { reducer } from './reducer'
import { legacyState } from '../test/helpers'
import { foldCosts } from './costs'
import { COST_CATEGORY_IDS, COST_CATEGORY_LABELS } from '../data/types'
import { allItemsOf } from '../data/costItems'
import type { AppState } from './types'

let s0: AppState
beforeEach(() => {
  s0 = legacyState()
})

describe('labels and items', () => {
  it('fertilizantes is labelled Adubação (id unchanged)', () => {
    expect(COST_CATEGORY_LABELS.fertilizantes).toBe('Adubação')
    expect(COST_CATEGORY_IDS).toContain('fertilizantes')
  })

  it('every group exposes a synthetic "Demais itens" item', () => {
    for (const g of COST_CATEGORY_IDS) {
      const items = allItemsOf(g)
      const demais = items[items.length - 1]
      expect(demais.id.endsWith('.demais')).toBe(true)
      expect(demais.label).toBe('Demais itens')
      expect(demais.group).toBe(g)
    }
  })
})

describe('initial cost state', () => {
  it('has all groups in total mode with the typed totals and every item not used', () => {
    for (const g of COST_CATEGORY_IDS) {
      expect(s0.costGroups[g].mode).toBe('total')
      expect(s0.costGroups[g].totalBrlHa).toBe(s0.costCategories[g])
      expect(s0.costGroups[g].totalUsd).toBeNull()
      for (const it of allItemsOf(g)) expect(s0.costGroups[g].items[it.id]).toBeDefined()
    }
    for (const g of COST_CATEGORY_IDS) {
      for (const it of allItemsOf(g)) expect(s0.costGroups[g].items[it.id]).toMatchObject({ mode: 'nao', valueBrlHa: 0 })
    }
    expect(s0.costFxDefault).toEqual({ boughtPct: 0, boughtRate: 0 })
    expect(s0.matrix).toEqual({ stepsPct: [2.5, 5, 10, 20], yieldFactor: 1, resultSteps: { cbotPct: 2.5, fxPct: 2.5, basisBrl: 1 } })
    expect(s0.inputs.costUsd).toEqual([])
    expect(s0.inputs.fxLockPct).toBe(0)
    expect(s0.inputs.fxLockRate).toBe(0)
  })
})

describe('setCostItem', () => {
  it('a US$ item becomes one costUsd line and is not summed in costPerHaBrl', () => {
    const s = reducer(s0, {
      type: 'setCostItem',
      itemId: 'adubacao.macro',
      patch: { mode: 'valor', usd: { amountUsdHa: 195, boughtPct: 0.6, boughtRate: 5.2 } },
    })
    expect(s.costMode).toBe('categorias')
    expect(s.costGroups.fertilizantes.mode).toBe('itens')
    expect(s.inputs.costUsd).toEqual([{ usdPerHa: 195, boughtPct: 0.6, boughtRate: 5.2 }])
    // The group is now the sum of its items: only the US$ one, so its R$ part is zero.
    expect(s.inputs.costPerHaBrl).toBeCloseTo(s0.inputs.costPerHaBrl - s0.costCategories.fertilizantes, 6)
  })

  it('a US$ item without its own dollar follows costFxDefault', () => {
    let s = reducer(s0, { type: 'setCostFxDefault', value: { boughtPct: 0.5, boughtRate: 5.1 } })
    s = reducer(s, {
      type: 'setCostItem',
      itemId: 'adubacao.macro',
      patch: { mode: 'valor', usd: { amountUsdHa: 100 } },
    })
    expect(s.inputs.costUsd).toEqual([{ usdPerHa: 100, boughtPct: 0.5, boughtRate: 5.1 }])
    s = reducer(s, { type: 'setCostFxDefault', value: { boughtPct: 1, boughtRate: 5.3 } })
    expect(s.inputs.costUsd).toEqual([{ usdPerHa: 100, boughtPct: 1, boughtRate: 5.3 }])
  })

  it('mode nao zeroes the item; valor sums the typed R$ value', () => {
    const open = reducer(s0, { type: 'setCostGroupMode', group: 'fertilizantes', mode: 'itens' })
    // Opened into items nobody filled: the group counts only what is typed.
    expect(open.costCategories.fertilizantes).toBe(0)
    expect(open.inputs.costPerHaBrl).toBeCloseTo(s0.inputs.costPerHaBrl - s0.costCategories.fertilizantes, 6)
    const typed = reducer(open, {
      type: 'setCostItem',
      itemId: 'adubacao.macro',
      patch: { mode: 'valor', valueBrlHa: 1000 },
    })
    expect(typed.costCategories.fertilizantes).toBe(1000)
    const off = reducer(typed, { type: 'setCostItem', itemId: 'adubacao.macro', patch: { mode: 'nao' } })
    expect(off.costCategories.fertilizantes).toBe(0)
    expect(off.costGroups.fertilizantes.items['adubacao.macro'].valueBrlHa).toBe(1000)
  })

  it('switching itens → total → itens keeps the typed values', () => {
    let s = reducer(s0, { type: 'setCostItem', itemId: 'adubacao.macro', patch: { mode: 'valor', valueBrlHa: 900 } })
    s = reducer(s, { type: 'setGroupTotal', group: 'fertilizantes', value: { totalBrlHa: 2000 } })
    expect(s.costGroups.fertilizantes.mode).toBe('total')
    expect(s.costCategories.fertilizantes).toBe(2000)
    s = reducer(s, { type: 'setCostGroupMode', group: 'fertilizantes', mode: 'itens' })
    expect(s.costGroups.fertilizantes.items['adubacao.macro']).toMatchObject({ mode: 'valor', valueBrlHa: 900 })
    s = reducer(s, { type: 'setCostGroupMode', group: 'fertilizantes', mode: 'total' })
    expect(s.costGroups.fertilizantes.totalBrlHa).toBe(2000)
    // valor → nao → valor keeps the typed number too
    s = reducer(s, { type: 'setCostItem', itemId: 'adubacao.macro', patch: { mode: 'nao' } })
    s = reducer(s, { type: 'setCostItem', itemId: 'adubacao.macro', patch: { mode: 'valor' } })
    expect(s.costGroups.fertilizantes.items['adubacao.macro'].valueBrlHa).toBe(900)
  })

  it('rejects invalid patches with the same state reference', () => {
    const bad = [
      { itemId: 'nao.existe', patch: { mode: 'nao' as const } },
      { itemId: 'adubacao.macro', patch: { valueBrlHa: -1 } },
      { itemId: 'adubacao.macro', patch: { valueBrlHa: Number.NaN } },
      { itemId: 'adubacao.macro', patch: { mode: 'x' as 'nao' } },
      { itemId: 'adubacao.macro', patch: { unit: 'scHa' as const } },
      { itemId: 'financeiro.seguroProducao', patch: { mode: 'media' as 'nao' } }, // the retired regional-average mode
      { itemId: 'adubacao.macro', patch: { usd: { amountUsdHa: -1 } } },
      { itemId: 'adubacao.macro', patch: { usd: { amountUsdHa: 10, boughtPct: 1.2, boughtRate: 5 } } },
      { itemId: 'adubacao.macro', patch: { usd: { amountUsdHa: 10, boughtPct: 0.5, boughtRate: 0 } } },
      { itemId: 'adubacao.macro', patch: { usd: { amountUsdHa: Infinity } } },
      {
        itemId: 'arrendamento.valor',
        patch: { unit: 'scHa' as const, usd: { amountUsdHa: 10 } },
      },
    ]
    for (const b of bad) expect(reducer(s0, { type: 'setCostItem', ...b })).toBe(s0)
  })

  it('arrendamento in sc/ha stays out of the fixed R$ sum (converted by useResult)', () => {
    const s = reducer(s0, {
      type: 'setCostItem',
      itemId: 'arrendamento.valor',
      patch: { mode: 'valor', unit: 'scHa', valueBrlHa: 8 },
    })
    expect(s.costCategories.arrendamento).toBe(0)
    expect(foldCosts(s.costGroups, s.costFxDefault).arrendamentoScHa).toBe(8)
    expect(s.inputs.costScHa).toBe(8)
  })
})

describe('setGroupTotal', () => {
  it('a US$ group total becomes a line; R$ total sums', () => {
    const s = reducer(s0, {
      type: 'setGroupTotal',
      group: 'defensivos',
      value: { usd: { amountUsdHa: 300, boughtPct: 0, boughtRate: 0 } },
    })
    expect(s.inputs.costUsd).toEqual([{ usdPerHa: 300, boughtPct: 0, boughtRate: 0 }])
    expect(s.costCategories.defensivos).toBe(0)
    expect(s.inputs.costPerHaBrl).toBeCloseTo(s0.inputs.costPerHaBrl - s0.costCategories.defensivos, 1)
    const back = reducer(s, { type: 'setGroupTotal', group: 'defensivos', value: { usd: null } })
    expect(back.inputs.costUsd).toEqual([])
    expect(back.costCategories.defensivos).toBe(s0.costCategories.defensivos)
  })

  it('rejects invalid totals', () => {
    for (const value of [{ totalBrlHa: -1 }, { totalBrlHa: Number.NaN }, { usd: { amountUsdHa: Number.NaN } }]) {
      expect(reducer(s0, { type: 'setGroupTotal', group: 'outros', value })).toBe(s0)
    }
    expect(reducer(s0, { type: 'setGroupTotal', group: 'xyz' as 'outros', value: { totalBrlHa: 1 } })).toBe(s0)
    expect(reducer(s0, { type: 'setCostGroupMode', group: 'outros', mode: 'x' as 'total' })).toBe(s0)
  })
})

describe('setCostFxDefault / setFxLock', () => {
  it('validates 0..1 and a positive rate', () => {
    const ok = reducer(s0, { type: 'setFxLock', pct: 0.3, rate: 5.6 })
    expect(ok.inputs.fxLockPct).toBe(0.3)
    expect(ok.inputs.fxLockRate).toBe(5.6)
    expect(reducer(ok, { type: 'setFxLock', pct: 0, rate: 0 }).inputs.fxLockPct).toBe(0)
    for (const [pct, rate] of [
      [1.01, 5],
      [-0.1, 5],
      [0.5, 0],
      [0.5, -5],
      [Number.NaN, 5],
      [0.5, Infinity],
    ]) {
      expect(reducer(s0, { type: 'setFxLock', pct, rate })).toBe(s0)
      expect(reducer(s0, { type: 'setCostFxDefault', value: { boughtPct: pct, boughtRate: rate } })).toBe(s0)
    }
  })
})

describe('matrix settings', () => {
  it('setStepsPct accepts strictly increasing steps below 100', () => {
    expect(reducer(s0, { type: 'setStepsPct', steps: [1, 2, 3, 4] }).matrix.stepsPct).toEqual([1, 2, 3, 4])
    for (const steps of [
      [1, 1, 3, 4],
      [0, 2, 3, 4],
      [1, 2, 3, 100],
      [4, 3, 2, 1],
      [1, 2, Number.NaN, 4],
    ] as [number, number, number, number][]) {
      expect(reducer(s0, { type: 'setStepsPct', steps })).toBe(s0)
    }
    expect(reducer(s0, { type: 'setStepsPct', steps: [1, 2, 3] as unknown as [number, number, number, number] })).toBe(s0)
  })

  it('setYieldFactor accepts only 0.9, 1 and 1.1', () => {
    expect(reducer(s0, { type: 'setYieldFactor', value: 0.9 }).matrix.yieldFactor).toBe(0.9)
    expect(reducer(s0, { type: 'setYieldFactor', value: 1.1 }).matrix.yieldFactor).toBe(1.1)
    for (const v of [0.8, 1.2, Number.NaN, 0]) expect(reducer(s0, { type: 'setYieldFactor', value: v })).toBe(s0)
  })
})

describe('crop change with items', () => {
  it('keeps typed items, typed totals and US$ lines', () => {
    let s = reducer(s0, { type: 'setCostGroupMode', group: 'fertilizantes', mode: 'itens' })
    s = reducer(s, { type: 'setCostItem', itemId: 'adubacao.micro', patch: { mode: 'valor', valueBrlHa: 123 } })
    s = reducer(s, {
      type: 'setCostItem',
      itemId: 'adubacao.macro',
      patch: { mode: 'valor', usd: { amountUsdHa: 195, boughtPct: 0.6, boughtRate: 5.2 } },
    })
    const m = reducer(s, { type: 'setCrop', crop: 'milho' })
    expect(m.costGroups.fertilizantes.items['adubacao.micro']).toMatchObject({ mode: 'valor', valueBrlHa: 123 })
    expect(m.costCategories.fertilizantes).toBe(123)
    expect(m.inputs.costUsd).toHaveLength(1)
    expect(m.inputs.costPerHaBrl).toBe(s.inputs.costPerHaBrl)
  })
})

describe('legacy total mode is unchanged', () => {
  it('total mode never carries US$ lines', () => {
    let s = reducer(s0, {
      type: 'setCostItem',
      itemId: 'adubacao.macro',
      patch: { mode: 'valor', usd: { amountUsdHa: 195, boughtPct: 0.6, boughtRate: 5.2 } },
    })
    const brl = s.inputs.costPerHaBrl
    s = reducer(s, { type: 'setCostMode', mode: 'total', fx: 5.5, farmPriceBrl: 125 })
    expect(s.inputs.costUsd).toEqual([])
    // the single total is the whole cost at today's dollar (US$ line at its effective dollar)
    expect(s.inputs.costPerHaBrl).toBeCloseTo(brl + 195 * (0.4 * 5.5 + 0.6 * 5.2), 9)
    // back to categorias with the total untouched: the groups (and the US$ line) come back
    s = reducer(s, { type: 'setCostMode', mode: 'categorias' })
    expect(s.inputs.costUsd).toHaveLength(1)
    expect(s.inputs.costPerHaBrl).toBeCloseTo(brl, 6)
    expect(s.costGroups.fertilizantes.mode).toBe('itens')
  })
})

describe('fix round 1', () => {
  const snapFx = 5.4998
  const usdItem = {
    type: 'setCostItem' as const,
    itemId: 'adubacao.macro',
    patch: { mode: 'valor' as const, usd: { amountUsdHa: 195, boughtPct: 0.6, boughtRate: 5.2 } },
  }
  const rentItem = {
    type: 'setCostItem' as const,
    itemId: 'arrendamento.valor',
    patch: { mode: 'valor' as const, unit: 'scHa' as const, valueBrlHa: 8 },
  }

  it('categorias → total keeps costPerSc identical (US$ line and sc/ha rent at today) and back restores', async () => {
    const { computeResult } = await import('../engine/calc')
    const { CROPS } = await import('../engine/crops')
    const scen = { cbotUsc: 1241.25, basisUsc: 61.7, fx: snapFx }
    let s = reducer(reducer(s0, usdItem), rentItem)
    expect(s.inputs.costScHa).toBe(8)
    const before = computeResult(CROPS.soja, scen, s.inputs)
    const farm = before.farmPriceBrl!
    const t = reducer(s, { type: 'setCostMode', mode: 'total', fx: scen.fx, farmPriceBrl: farm })
    expect(t.costMode).toBe('total')
    expect(t.inputs.costUsd).toEqual([])
    expect(t.inputs.costScHa).toBe(0)
    expect(computeResult(CROPS.soja, scen, t.inputs).costPerSc).toBe(before.costPerSc)
    // back: the typed US$ and sc/ha data return
    s = reducer(t, { type: 'setCostMode', mode: 'categorias' })
    expect(s.inputs.costUsd).toHaveLength(1)
    expect(s.inputs.costScHa).toBe(8)
    expect(s.costGroups.fertilizantes.mode).toBe('itens')
  })

  it('categorias → total without a usable dollar/price does not understate: same state', () => {
    const s = reducer(reducer(s0, usdItem), rentItem)
    expect(reducer(s, { type: 'setCostMode', mode: 'total' })).toBe(s)
    expect(reducer(s, { type: 'setCostMode', mode: 'total', fx: 0, farmPriceBrl: 125 })).toBe(s)
    expect(reducer(s, { type: 'setCostMode', mode: 'total', fx: snapFx, farmPriceBrl: null })).toBe(s)
  })

  it('a typed total after the toggle is the whole cost: back to categorias spreads it', () => {
    let s = reducer(s0, usdItem)
    s = reducer(s, { type: 'setCostMode', mode: 'total', fx: snapFx, farmPriceBrl: 125 })
    s = reducer(s, { type: 'setInput', key: 'costPerHaBrl', value: 5000 })
    s = reducer(s, { type: 'setCostMode', mode: 'categorias' })
    expect(s.inputs.costUsd).toEqual([])
    expect(s.inputs.costPerHaBrl).toBeCloseTo(5000, 6)
  })

  it('an item can hold a R$ part and a US$ part at once', () => {
    const s = reducer(s0, {
      type: 'setCostItem',
      itemId: 'adubacao.macro',
      patch: { mode: 'valor', valueBrlHa: 400, usd: { amountUsdHa: 100, boughtPct: 0, boughtRate: 0 } },
    })
    expect(s.inputs.costUsd).toEqual([{ usdPerHa: 100, boughtPct: 0, boughtRate: 0 }])
    expect(s.inputs.costPerHaBrl).toBeCloseTo(s0.inputs.costPerHaBrl - s0.costCategories.fertilizantes + 400, 6)
    const off = reducer(s, { type: 'setCostItem', itemId: 'adubacao.macro', patch: { mode: 'nao' } })
    expect(off.inputs.costUsd).toEqual([])
    expect(off.inputs.costPerHaBrl).toBeCloseTo(s0.inputs.costPerHaBrl - s0.costCategories.fertilizantes, 6)
  })

  it('setCrop keeps typed group totals and typed items', () => {
    let s = reducer(s0, { type: 'setGroupTotal', group: 'outros', value: { totalBrlHa: 777 } })
    s = reducer(s, { type: 'setCostItem', itemId: 'adubacao.micro', patch: { mode: 'valor', valueBrlHa: 123 } })
    const m = reducer(s, { type: 'setCrop', crop: 'milho' })
    expect(m.costGroups.outros.totalBrlHa).toBe(777)
    expect(m.costCategories.outros).toBe(777)
    expect(m.costGroups.fertilizantes.items['adubacao.micro']).toMatchObject({ mode: 'valor', valueBrlHa: 123 })
    expect(m.costCategories.sementes).toBe(s.costCategories.sementes)
    expect(m.costCategories.fertilizantes).toBe(123)
  })
})
