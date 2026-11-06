import { loadState, mergeState, saveState, STORAGE_KEY } from './persist'
import { initialState, reducer } from './reducer'
import type { Action, AppState } from './types'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

const boot = () => mergeState(initialState(), loadState())
const run = (actions: Action[]): AppState => actions.reduce(reducer, initialState())

describe('persistence v3 (ponto FOB)', () => {
  it('uses key margem:v3', () => {
    expect(STORAGE_KEY).toBe('margem:v3')
  })

  it('a valid margem:v2 blob is discarded without error (and removed)', () => {
    const v2 = run([{ type: 'setFob', fobId: 'sorriso' }])
    localStorage.setItem('margem:v2', JSON.stringify(v2))
    expect(() => loadState()).not.toThrow()
    expect(loadState()).toBeNull()
    expect(localStorage.getItem('margem:v2')).toBeNull()
    expect(boot()).toEqual(initialState())
  })

  it('round trip keeps the FOB point', () => {
    const s = run([{ type: 'setFob', fobId: 'sorriso' }, { type: 'setInput', key: 'areaHa', value: 321 }])
    saveState(s)
    const back = boot()
    expect(back.fobId).toBe('sorriso')
    expect(back.customBasisUsc).toBeNull()
    expect(back).toEqual(s)
  })

  it('round trip keeps "Outro" with the typed base', () => {
    const s = run([{ type: 'setFob', fobId: 'outro' }, { type: 'setCustomBasis', value: 33.3 }])
    saveState(s)
    const back = boot()
    expect(back.fobId).toBe('outro')
    expect(back.customBasisUsc).toBe(33.3)
    expect(back).toEqual(s)
  })

  it('round trip keeps a negative (premium) or zero typed base: soja → Barreiras → "Outro"', () => {
    for (const v of [-10.3, 0]) {
      const s = run([
        { type: 'setFob', fobId: 'barreiras' },
        { type: 'setFob', fobId: 'outro' },
        { type: 'setCustomBasis', value: v },
        { type: 'setInput', key: 'areaHa', value: 321 },
      ])
      saveState(s)
      expect(loadState()).not.toBeNull()
      const back = boot()
      expect(back.fobId).toBe('outro')
      expect(back.customBasisUsc).toBe(v)
      expect(back.inputs.areaHa).toBe(321)
      expect(back).toEqual(s)
    }
  })

  it('invalid FOB fields are a shape error', () => {
    const s = JSON.parse(JSON.stringify(run([{ type: 'setFob', fobId: 'outro' }])))
    const milho = JSON.parse(JSON.stringify(run([{ type: 'setCrop', crop: 'milho' }])))
    for (const blob of [
      { ...s, fobId: 'marte' },
      { ...s, fobId: 42 },
      { ...milho, fobId: 'campos-novos' },
      { ...s, customBasisUsc: 'x' },
      { ...s, fobId: undefined },
      { ...s, fobId: 'sorriso' },
    ]) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(blob))
      expect(loadState()).toBeNull()
    }
  })
})
