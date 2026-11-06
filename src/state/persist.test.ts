import { loadState, saveState, STORAGE_KEY, mergeState } from './persist'
import { initialState } from './reducer'
import { staticProvider } from '../data/staticProvider'
import type { AppState } from './types'

let s0: AppState
beforeAll(async () => {
  s0 = initialState(await staticProvider.getSnapshot())
})
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('persistence', () => {
  it('uses key margem:v3', () => {
    expect(STORAGE_KEY).toBe('margem:v3')
  })

  it('round-trips user state', () => {
    saveState(s0)
    expect(loadState()).toEqual(JSON.parse(JSON.stringify(s0)))
  })

  it('persists a numeric target and a null target', () => {
    const on = { ...s0, inputs: { ...s0.inputs, targetMargin: 0.2 } }
    saveState(on)
    expect(loadState()?.inputs?.targetMargin).toBe(0.2)
    saveState(s0)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).inputs.targetMargin).toBeNull()
    expect(loadState()?.inputs?.targetMargin).toBeNull()
  })

  it('a blob saved with the old numeric target still loads; a missing target loads as null', () => {
    saveState({ ...s0, inputs: { ...s0.inputs, targetMargin: 0.15 } })
    expect(loadState()?.inputs?.targetMargin).toBe(0.15)
    const blob = JSON.parse(JSON.stringify(s0))
    delete blob.inputs.targetMargin
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blob))
    expect(loadState()?.inputs?.targetMargin).toBeNull()
  })

  it('a target of the wrong type is a shape error', () => {
    for (const bad of ['0.15', -0.5, {}, true, [0.1]]) {
      const blob = JSON.parse(JSON.stringify(s0))
      blob.inputs.targetMargin = bad
      localStorage.setItem(STORAGE_KEY, JSON.stringify(blob))
      expect(loadState()).toBeNull()
    }
  })

  it('does not persist market data', () => {
    saveState(s0)
    const raw = localStorage.getItem(STORAGE_KEY)!
    expect(raw).not.toContain('snapshot')
    expect(raw).not.toContain('1241.25')
  })

  it('returns null when nothing is stored', () => {
    expect(loadState()).toBeNull()
  })

  it('loadState returns null when localStorage.getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(loadState()).toBeNull()
  })

  it('loadState returns null for corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    expect(loadState()).toBeNull()
  })

  it('loadState returns null for wrong shape', () => {
    for (const v of [
      'null',
      '[]',
      '42',
      '{}',
      JSON.stringify({ ...s0, crop: 'trigo' }),
      JSON.stringify({ ...s0, inputs: { ...s0.inputs, areaHa: 'mil' } }),
      JSON.stringify({ ...s0, inputs: { ...s0.inputs, soldPct: 3 } }),
      JSON.stringify({ ...s0, overrides: { fx: 0 } }),
      JSON.stringify({ ...s0, matrix: { ...s0.matrix, stepsPct: 'x' } }),
      JSON.stringify({ ...s0, matrix: 7 }),
      JSON.stringify({ ...s0, costCategories: { sementes: 1 } }),
      JSON.stringify({ ...s0, tourSeen: 'yes' }),
      JSON.stringify({ ...s0, inputs: { ...s0.inputs, costPerHaBrl: -1 } }),
      JSON.stringify({ ...s0, inputs: { ...s0.inputs, freightBrlPerSc: -1 } }),
      JSON.stringify({ ...s0, crop: 'toString' }),
    ]) {
      localStorage.setItem(STORAGE_KEY, v)
      expect(loadState()).toBeNull()
    }
  })

  it('ignores the retired ownPriceMode / basisFromOwnPrice fields of an older save', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...s0, overrides: { basisUsc: 70 }, ownPriceMode: true, basisFromOwnPrice: 'yes' }),
    )
    const loaded = loadState()
    expect(loaded?.overrides?.basisUsc).toBe(70)
    expect(loaded).not.toHaveProperty('ownPriceMode')
    expect(loaded).not.toHaveProperty('basisFromOwnPrice')
  })

  it('out-of-range matrix steps or yield factor fall back to the default and keep the rest', () => {
    for (const matrix of [
      { stepsPct: [1, 1, 2, 3], yieldFactor: 1.1 },
      { stepsPct: [1, 2, 3, 150], yieldFactor: 1.1 },
      { stepsPct: [1, 2, 3], yieldFactor: 1.1 },
    ]) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s0, crop: 'milho', matrix }))
      const loaded = loadState()
      expect(loaded?.crop).toBe('milho')
      expect(loaded?.inputs).toEqual(s0.inputs)
      expect(loaded?.matrix).toEqual({ stepsPct: [2.5, 5, 10, 20], yieldFactor: 1.1, resultSteps: { cbotPct: 2.5, fxPct: 2.5, basisBrl: 1 } })
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s0, matrix: { stepsPct: [1, 2, 3, 4], yieldFactor: 3 } }))
    expect(loadState()?.matrix).toEqual({ stepsPct: [1, 2, 3, 4], yieldFactor: 1, resultSteps: { cbotPct: 2.5, fxPct: 2.5, basisBrl: 1 } })
  })

  it('a non-numeric matrix step is still a shape error', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...s0, matrix: { ...s0.matrix, stepsPct: [1, 'x', 3, 4] } }),
    )
    expect(loadState()).toBeNull()
  })

  it('saveState swallows setItem errors (incl. quota)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    expect(() => saveState(s0)).not.toThrow()
  })

  it('round-trips the Resultados steps and the basis simulation; older blobs get the defaults', () => {
    const on = {
      ...s0,
      overrides: { ...s0.overrides, simBasisUsc: 64.25 },
      matrix: { ...s0.matrix, resultSteps: { cbotPct: 5, fxPct: 1.5, basisBrl: 0.5 } },
    }
    saveState(on)
    const back = loadState()
    expect(back?.matrix?.resultSteps).toEqual({ cbotPct: 5, fxPct: 1.5, basisBrl: 0.5 })
    expect(back?.overrides?.simBasisUsc).toBe(64.25)
    // A blob saved before these fields existed: still loads, with the defaults.
    const old = JSON.parse(JSON.stringify(s0))
    delete old.matrix.resultSteps
    localStorage.setItem(STORAGE_KEY, JSON.stringify(old))
    expect(loadState()?.matrix?.resultSteps).toEqual({ cbotPct: 2.5, fxPct: 2.5, basisBrl: 1 })
    expect(loadState()?.overrides?.simBasisUsc).toBeUndefined()
  })

  it('an invalid Resultados step falls back to its default without losing the blob', () => {
    const bad = JSON.parse(JSON.stringify(s0))
    bad.matrix.resultSteps = { cbotPct: 0, fxPct: 'x', basisBrl: 0.25 }
    bad.overrides.simBasisUsc = 'x'
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bad))
    const back = loadState()
    expect(back).not.toBeNull()
    expect(back?.matrix?.resultSteps).toEqual({ cbotPct: 2.5, fxPct: 2.5, basisBrl: 0.25 })
    expect(back?.overrides?.simBasisUsc).toBeUndefined()
    bad.matrix.resultSteps = 7
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bad))
    expect(loadState()?.matrix?.resultSteps).toEqual({ cbotPct: 2.5, fxPct: 2.5, basisBrl: 1 })
  })

  it('mergeState overlays saved fields on a base state', () => {
    const merged = mergeState(s0, { crop: 'milho', tourSeen: true })
    expect(merged.crop).toBe('milho')
    expect(merged.tourSeen).toBe(true)
    expect(merged.inputs).toEqual(s0.inputs)
    expect(mergeState(s0, null)).toBe(s0)
  })
})
