import { computeResult } from '../engine/calc'
import { CROPS } from '../engine/crops'
import { findFob } from '../data/fobPoints'
import { initialState, reducer } from './reducer'
import { fobBasisUsc, scenarioBasisUsc } from './basis'
import type { Action, AppState } from './types'

const run = (actions: Action[], s: AppState = initialState()) => actions.reduce(reducer, s)
const scenario = (s: AppState) => ({ cbotUsc: 1241.25, basisUsc: scenarioBasisUsc(s), fx: 5.4998 })
const farmPrice = (s: AppState) => computeResult(CROPS[s.crop], scenario(s), s.inputs).farmPriceBrl

describe('state: ponto FOB', () => {
  it('starts at Paranaguá with no typed base and everything the producer provides at zero', () => {
    const s = initialState()
    expect(s.fobId).toBe('paranagua')
    expect(s.customBasisUsc).toBeNull()
    expect(s.inputs.areaHa).toBe(0)
    expect(s.inputs.yieldScHa).toBe(0)
    expect(s.inputs.costPerHaBrl).toBe(0)
    expect(s.inputs.freightBrlPerSc).toBe(0)
    expect(fobBasisUsc(s)).toBe(3.5)
  })

  it('choosing a point (in or outside MT) never prefills the producer fields', () => {
    for (const fobId of ['sorriso', 'cascavel', 'rondonopolis']) {
      const s = run([{ type: 'setFob', fobId }])
      expect(s.fobId).toBe(fobId)
      expect(s.inputs.areaHa).toBe(0)
      expect(s.inputs.yieldScHa).toBe(0)
      expect(s.inputs.costPerHaBrl).toBe(0)
      expect(s.inputs.freightBrlPerSc).toBe(0)
    }
  })

  it('changing the FOB changes the scenario base and the farm price', () => {
    const a = initialState()
    const b = run([{ type: 'setFob', fobId: 'rio-verde' }], a)
    expect(scenarioBasisUsc(b)).toBe(findFob('rio-verde')?.baseUsc.soja)
    expect(scenarioBasisUsc(b)).not.toBe(scenarioBasisUsc(a))
    // Same farm inputs on both (no reference either way): only the base moves the price.
    expect(farmPrice(b) as number).toBeLessThan(farmPrice(a) as number)
  })

  it('rejects unknown ids and points that do not exist for the crop', () => {
    const s = initialState()
    expect(reducer(s, { type: 'setFob', fobId: 'nope' })).toBe(s)
    const milho = run([{ type: 'setCrop', crop: 'milho' }])
    expect(reducer(milho, { type: 'setFob', fobId: 'campos-novos' })).toBe(milho)
    expect(run([{ type: 'setFob', fobId: 'chapeco' }]).fobId).toBe('paranagua')
  })

  it('crop change keeps the FOB when it exists for the new crop, else falls back to Paranaguá', () => {
    const kept = run([{ type: 'setFob', fobId: 'sorriso' }, { type: 'setCrop', crop: 'milho' }])
    expect(kept.fobId).toBe('sorriso')
    expect(scenarioBasisUsc(kept)).toBe(findFob('sorriso')?.baseUsc.milho)
    const back = run([{ type: 'setFob', fobId: 'campos-novos' }, { type: 'setCrop', crop: 'milho' }])
    expect(back.fobId).toBe('paranagua')
    expect(scenarioBasisUsc(back)).toBe(97.6)
  })

  it('"Outro" uses the typed base; picking a listed point clears it', () => {
    let s = run([{ type: 'setFob', fobId: 'outro' }])
    expect(s.fobId).toBe('outro')
    // Pre-filled with the base in use, so the scenario never loses its base.
    expect(s.customBasisUsc).toBe(3.5)
    s = reducer(s, { type: 'setCustomBasis', value: -10 })
    expect(s.customBasisUsc).toBe(-10)
    expect(scenarioBasisUsc(s)).toBe(-10)
    expect(farmPrice(s) as number).toBeLessThan(farmPrice(initialState()) as number)
    s = reducer(s, { type: 'setFob', fobId: 'itaqui' })
    expect(s.customBasisUsc).toBeNull()
    expect(scenarioBasisUsc(s)).toBe(findFob('itaqui')?.baseUsc.soja)
  })

  it('setCustomBasis accepts any finite value, zero and negatives (a premium), or null', () => {
    const s = run([{ type: 'setFob', fobId: 'outro' }])
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '5' as unknown as number]) {
      expect(reducer(s, { type: 'setCustomBasis', value: bad })).toBe(s)
    }
    expect(reducer(s, { type: 'setCustomBasis', value: 0 }).customBasisUsc).toBe(0)
    expect(reducer(s, { type: 'setCustomBasis', value: -10.3 }).customBasisUsc).toBe(-10.3)
    expect(scenarioBasisUsc(reducer(s, { type: 'setCustomBasis', value: -10.3 }))).toBe(-10.3)
    expect(reducer(s, { type: 'setCustomBasis', value: null }).customBasisUsc).toBeNull()
  })

  it('soja → Barreiras → "Outro": the typed base keeps a negative value', () => {
    let s = run([{ type: 'setFob', fobId: 'barreiras' }, { type: 'setFob', fobId: 'outro' }])
    expect(s.customBasisUsc).toBe(findFob('barreiras')?.baseUsc.soja)
    s = reducer(s, { type: 'setCustomBasis', value: -10.3 })
    expect(s.fobId).toBe('outro')
    expect(s.customBasisUsc).toBe(-10.3)
    expect(scenarioBasisUsc(s)).toBe(-10.3)
  })

  it('the basis override still wins over the FOB base', () => {
    const s = run([
      { type: 'setFob', fobId: 'sorriso' },
      { type: 'override', key: 'basisUsc', value: 12.3 },
    ])
    expect(scenarioBasisUsc(s)).toBe(12.3)
    expect(fobBasisUsc(s)).toBe(findFob('sorriso')?.baseUsc.soja)
  })

  it('a typed yield survives a FOB change', () => {
    const s = run([
      { type: 'setFob', fobId: 'sorriso' },
      { type: 'setInput', key: 'yieldScHa', value: 70 },
      { type: 'setFob', fobId: 'dourados' },
    ])
    expect(s.inputs.yieldScHa).toBe(70)
  })
})
