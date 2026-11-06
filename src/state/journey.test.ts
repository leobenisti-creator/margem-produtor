import { initialState, reducer } from './reducer'
import { journeyOf } from './journey'
import type { Action, AppState } from './types'

const run = (actions: Action[], from: AppState = initialState()) => actions.reduce(reducer, from)

describe('journeyOf', () => {
  it('a fresh visitor is sem-custos, everything missing', () => {
    const j = journeyOf(initialState())
    expect(j.state).toBe('sem-custos')
    expect(j.hasFarm).toBe(false)
    expect(j.hasCosts).toBe(false)
    expect(j.missing).toEqual(['área', 'produtividade', 'custo por hectare'])
  })

  it('a fresh visitor who only dismissed the tour is still sem-custos and has nothing filled (tourSeen is not a signal)', () => {
    const j = journeyOf({ ...initialState(), tourSeen: true })
    expect(j.hasFarm || j.hasCosts).toBe(false)
  })

  it('choosing a crop or a point fills nothing', () => {
    for (const fobId of ['sorriso', 'outro', 'cascavel']) {
      const j = journeyOf(run([{ type: 'setCrop', crop: 'milho' }, { type: 'setFob', fobId }]))
      expect(j.state).toBe('sem-custos')
      expect(j.missing).toEqual(['área', 'produtividade', 'custo por hectare'])
    }
  })

  it('area and productivity typed but no cost: sem-custos, only the cost is missing', () => {
    const s = run([
      { type: 'setInput', key: 'areaHa', value: 2500 },
      { type: 'setInput', key: 'yieldScHa', value: 63 },
    ])
    const j = journeyOf(s)
    expect(j).toEqual({ state: 'sem-custos', hasFarm: true, hasCosts: false, missing: ['custo por hectare'] })
  })

  it('only the area typed: sem-custos, productivity and cost missing', () => {
    const j = journeyOf(run([{ type: 'setInput', key: 'areaHa', value: 300 }]))
    expect(j.state).toBe('sem-custos')
    expect(j.hasFarm).toBe(false)
    expect(j.missing).toEqual(['produtividade', 'custo por hectare'])
  })

  it('a typed productivity alone is not a farm: the area is still missing', () => {
    const j = journeyOf(run([{ type: 'setInput', key: 'yieldScHa', value: 61 }]))
    expect(j.hasFarm).toBe(false)
    expect(j.state).toBe('sem-custos')
    expect(j.missing).toEqual(['área', 'custo por hectare'])
  })

  it('everything typed by the producer is com-custos', () => {
    const s = run([
      { type: 'setInput', key: 'areaHa', value: 800 },
      { type: 'setInput', key: 'yieldScHa', value: 58 },
      { type: 'setInput', key: 'costPerHaBrl', value: 4800 },
    ])
    expect(journeyOf(s)).toEqual({ state: 'com-custos', hasFarm: true, hasCosts: true, missing: [] })
  })

  it('a cost typed through the categories counts', () => {
    const s = run([
      { type: 'setInput', key: 'areaHa', value: 800 },
      { type: 'setInput', key: 'yieldScHa', value: 58 },
      { type: 'setCostMode', mode: 'categorias' },
      { type: 'setGroupTotal', group: 'fertilizantes', value: { totalBrlHa: 2100 } },
    ])
    expect(s.costMode).toBe('categorias')
    expect(journeyOf(s).state).toBe('com-custos')
  })

  it('a US$ cost or a rent in sc/ha counts as cost', () => {
    const usd = run([
      { type: 'setCostItem', itemId: 'defensivos.herbicida', patch: { mode: 'valor', usd: { amountUsdHa: 80 } } },
    ])
    expect(usd.inputs.costUsd.length).toBe(1)
    expect(journeyOf(usd).hasCosts).toBe(true)
    const sc = run([
      { type: 'setCostItem', itemId: 'arrendamento.valor', patch: { mode: 'valor', unit: 'scHa', valueBrlHa: 5 } },
    ])
    expect(sc.inputs.costScHa).toBe(5)
    expect(journeyOf(sc).hasCosts).toBe(true)
  })

  it('a cost typed item by item in a group counts', () => {
    const s = run([
      { type: 'setCostItem', itemId: 'sementes.cultura', patch: { mode: 'valor', valueBrlHa: 430 } },
    ])
    expect(s.costMode).toBe('categorias')
    expect(journeyOf(s).hasCosts).toBe(true)
  })

  it('switching to the category mode without typing anything is not a cost', () => {
    const s = run([{ type: 'setCostMode', mode: 'categorias' }])
    expect(journeyOf(s).hasCosts).toBe(false)
  })

  it('a save with values of its own is com-custos', () => {
    const base = initialState()
    const legacy: AppState = {
      ...base,
      tourSeen: true,
      inputs: { ...base.inputs, areaHa: 1750, yieldScHa: 57.3, costPerHaBrl: 4321.5 },
    }
    expect(journeyOf(legacy)).toEqual({ state: 'com-custos', hasFarm: true, hasCosts: true, missing: [] })
  })

  it('a cost of its own but no farm is still sem-custos', () => {
    const base = initialState()
    const j = journeyOf({ ...base, inputs: { ...base.inputs, costPerHaBrl: 4321.5 } })
    expect(j.hasCosts).toBe(true)
    expect(j.hasFarm).toBe(false)
    expect(j.state).toBe('sem-custos')
  })

  it('a sale or an operation alone is progress', () => {
    const s = run([{ type: 'addSale', partial: { volume: 100, price: 120 } }])
    expect(s.sales.length).toBe(1)
    expect(journeyOf(s).state).toBe('sem-custos')
  })
})
