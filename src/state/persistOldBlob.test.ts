import { loadState, mergeState, saveState, STORAGE_KEY } from './persist'
import { initialState, reducer } from './reducer'
import { journeyOf } from './journey'
import type { Action, AppState } from './types'

afterEach(() => localStorage.clear())

const run = (actions: Action[]): AppState => actions.reduce(reducer, initialState())
const boot = () => mergeState(initialState(), loadState())

/**
 * A blob as the IMEA-era app saved it: prefilled numbers, the retired `regionId`, `edited` and `costTotalSnapshot`,
 * and cost items in the retired 'media' mode.
 */
function oldBlob() {
  const s = run([
    { type: 'setFob', fobId: 'sorriso' },
    { type: 'setInput', key: 'areaHa', value: 1000 },
    { type: 'setInput', key: 'yieldScHa', value: 61.3 },
    { type: 'setInput', key: 'costPerHaBrl', value: 6627.48 },
    { type: 'setInput', key: 'freightBrlPerSc', value: 29.358 },
    { type: 'setCategory', id: 'fertilizantes', value: 2072.83 },
  ])
  const raw = JSON.parse(JSON.stringify(s))
  raw.regionId = 'medio-norte'
  raw.edited = { yield: false, cost: false, freight: false }
  raw.costTotalSnapshot = 6627.48
  raw.costGroups.defensivos.items['defensivos.herbicida'].mode = 'media'
  return raw
}

describe('loading a blob saved by the IMEA-era app', () => {
  it('keeps the numbers (they are the producer\'s now) and ignores regionId / edited', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(oldBlob()))
    const back = boot()
    expect(back.inputs.areaHa).toBe(1000)
    expect(back.inputs.yieldScHa).toBe(61.3)
    expect(back.inputs.costPerHaBrl).toBe(6627.48)
    expect(back.inputs.freightBrlPerSc).toBe(29.358)
    expect(back.costGroups.fertilizantes.totalBrlHa).toBe(2072.83)
    expect(back.costTotalSnapshot).toBe(6627.48)
    expect(back.fobId).toBe('sorriso')
    expect(back).not.toHaveProperty('regionId')
    expect(back).not.toHaveProperty('edited')
    expect(journeyOf(back).state).toBe('com-custos')
  })

  it('a retired "media" item loads as not used', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(oldBlob()))
    const item = boot().costGroups.defensivos.items['defensivos.herbicida']
    expect(item.mode).toBe('nao')
    expect(item.valueBrlHa).toBe(0)
  })

  it('a blob without regionId and edited loads too, and saving no longer writes them', () => {
    const raw = oldBlob()
    delete raw.regionId
    delete raw.edited
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
    const back = boot()
    expect(back.inputs.areaHa).toBe(1000)
    saveState(back)
    const written = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    expect(written).not.toHaveProperty('regionId')
    expect(written).not.toHaveProperty('edited')
    expect(written.costTotalSnapshot).toBe(6627.48)
    expect(boot()).toEqual(back)
  })

  it('a malformed edited / regionId is just ignored', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...oldBlob(), edited: 'x', regionId: 42 }))
    expect(boot().inputs.areaHa).toBe(1000)
  })

  it('an old blob that was never filled loads with its zeros and stays sem-custos', () => {
    const raw = JSON.parse(JSON.stringify(run([])))
    raw.regionId = 'outra'
    raw.edited = { yield: false, cost: false, freight: false }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
    const back = boot()
    expect(back.inputs.areaHa).toBe(0)
    expect(journeyOf(back).missing).toEqual(['área', 'produtividade', 'custo por hectare'])
  })
})
