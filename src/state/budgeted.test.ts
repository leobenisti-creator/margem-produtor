import { legacyState } from '../test/helpers'
import { loadState, saveState, STORAGE_KEY } from './persist'
import { reducer } from './reducer'

beforeEach(() => localStorage.clear())

describe('budgeted (orçado) flag', () => {
  it('survives a save and a load (group and item), and absent means realizado', () => {
    let s = reducer(legacyState(), { type: 'setCostMode', mode: 'categorias' })
    s = reducer(s, { type: 'setCostBudgeted', group: 'sementes', value: true })
    s = reducer(s, { type: 'setCostItem', itemId: 'defensivos.herbicida', patch: { mode: 'valor', valueBrlHa: 300 } })
    s = reducer(s, { type: 'setCostBudgeted', group: 'defensivos', itemId: 'defensivos.herbicida', value: true })
    saveState(s)
    const back = loadState()
    expect(back?.costGroups?.sementes.budgeted).toBe(true)
    expect(back?.costGroups?.defensivos.items['defensivos.herbicida'].budgeted).toBe(true)
    expect(back?.costGroups?.fertilizantes.budgeted).toBeUndefined()
  })

  it('a saved state without the flag still loads (no version bump)', () => {
    saveState(reducer(legacyState(), { type: 'setCostMode', mode: 'categorias' }))
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string)
    expect(JSON.stringify(raw)).not.toContain('budgeted')
    expect(loadState()).not.toBeNull()
  })

  it('a non-boolean flag discards the blob like any other bad field', () => {
    saveState(reducer(legacyState(), { type: 'setCostMode', mode: 'categorias' }))
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string)
    raw.costGroups.sementes.budgeted = 'sim'
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
    expect(loadState()).toBeNull()
  })
})
