import { loadState, mergeState, saveState, STORAGE_KEY } from './persist'
import { initialState, reducer } from './reducer'
import type { Action, AppState } from './types'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

/** Sets a nested value in a parsed JSON blob (test helper). */
function setPath(root: unknown, path: (string | number)[], value: unknown): void {
  let node = root as Record<string | number, unknown>
  for (const k of path.slice(0, -1)) node = node[k] as Record<string | number, unknown>
  node[path[path.length - 1]] = value
}

const boot = () => mergeState(initialState(), loadState())

function edited(): AppState {
  const actions: Action[] = [
    { type: 'setCostItem', itemId: 'adubacao.macro', patch: { mode: 'valor', usd: { amountUsdHa: 195, boughtPct: 0.6, boughtRate: 5.2 } } },
    { type: 'setCostItem', itemId: 'adubacao.micro', patch: { mode: 'nao' } },
    {
      type: 'setCostItem',
      itemId: 'adubacao.corretivos',
      patch: { mode: 'valor', valueBrlHa: 150, usd: { amountUsdHa: 40, boughtPct: 0, boughtRate: 0 } },
    },
    { type: 'setCostItem', itemId: 'arrendamento.valor', patch: { mode: 'valor', unit: 'scHa', valueBrlHa: 8 } },
    {
      type: 'setCostItem',
      itemId: 'defensivos.herbicida',
      patch: {
        mode: 'valor',
        valueBrlHa: 300,
        rows: [
          { id: 'r1', productId: null, name: 'Glifosato', dose: 2, doseUnit: 'L', price: 30, priceUnit: 'L', currency: 'BRL', applications: 2 },
        ],
      },
    },
    { type: 'setGroupTotal', group: 'outros', value: { totalBrlHa: 777 } },
    { type: 'setCostFxDefault', value: { boughtPct: 0.25, boughtRate: 5.05 } },
    { type: 'setFxLock', pct: 0.3, rate: 5.6 },
    { type: 'setStepsPct', steps: [1, 3, 6, 12] },
    { type: 'setYieldFactor', value: 0.9 },
  ]
  return actions.reduce(reducer, initialState())
}

describe('persistence v2', () => {
  it('a valid margem:v1 blob is ignored: default state, no error', () => {
    const v1 = { ...initialState(), inputs: { ...initialState().inputs, areaHa: 555 } }
    localStorage.setItem('margem:v1', JSON.stringify(v1))
    expect(() => loadState()).not.toThrow()
    expect(loadState()).toBeNull()
    expect(boot()).toEqual(initialState())
  })

  it('corrupt JSON gives the default state without throwing', () => {
    localStorage.setItem(STORAGE_KEY, '{"crop":')
    expect(() => boot()).not.toThrow()
    expect(boot()).toEqual(initialState())
  })

  it('round-trip keeps costGroups, costFxDefault, stepsPct, yieldFactor and the new inputs', () => {
    const s = edited()
    saveState(s)
    const back = boot()
    expect(back.costGroups).toEqual(s.costGroups)
    expect(back.costFxDefault).toEqual({ boughtPct: 0.25, boughtRate: 5.05 })
    expect(back.matrix).toEqual({ stepsPct: [1, 3, 6, 12], yieldFactor: 0.9, resultSteps: { cbotPct: 2.5, fxPct: 2.5, basisBrl: 1 } })
    expect(back.inputs.costUsd).toEqual(s.inputs.costUsd)
    expect(back.inputs.fxLockPct).toBe(0.3)
    expect(back.inputs.fxLockRate).toBe(5.6)
    expect(back.inputs.costScHa).toBe(8)
    expect(back.costGroups.fertilizantes.items['adubacao.corretivos']).toMatchObject({
      mode: 'valor',
      valueBrlHa: 150,
      usd: { amountUsdHa: 40, boughtPct: 0, boughtRate: 0 },
    })
    expect(back.inputs.costUsd).toHaveLength(2)
    expect(back.inputs.costPerHaBrl).toBe(s.inputs.costPerHaBrl)
    expect(back.costMode).toBe('categorias')
    expect(back).toEqual(s)
  })

  it('wrong shapes or out-of-range new fields fall back to the default state', () => {
    const s = JSON.parse(JSON.stringify(edited()))
    const macro = ['costGroups', 'fertilizantes', 'items', 'adubacao.macro']
    const herb = ['costGroups', 'defensivos', 'items', 'defensivos.herbicida', 'rows']
    const bad: [(string | number)[], unknown][] = [
      [['costGroups'], []],
      [['costGroups', 'sementes'], null],
      [['costGroups', 'sementes', 'mode'], 'x'],
      [['costGroups', 'sementes', 'totalBrlHa'], -1],
      [[...macro, 'usd', 'boughtPct'], 2],
      [[...macro, 'usd', 'amountUsdHa'], 'x'],
      [[...macro, 'mode'], 'zz'],
      [[...macro, 'unit'], 'scHa'],
      [herb, [{ id: 1 }]],
      [[...herb, 0, 'dose'], -1],
      [['costFxDefault'], { boughtPct: 0.5, boughtRate: 0 }],
      [['inputs', 'fxLockPct'], 1.5],
      [['inputs', 'fxLockRate'], -1],
      [['inputs', 'costScHa'], -1],
      [['inputs', 'costScHa'], 'x'],
      [['costGroups', 'outros', 'totalTyped'], 'yes'],
      [['inputs', 'costUsd'], [{ usdPerHa: 'x', boughtPct: 0, boughtRate: 0 }]],
    ]
    for (const [path, value] of bad) {
      const blob: unknown = JSON.parse(JSON.stringify(s))
      setPath(blob, path, value)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(blob))
      expect(loadState()).toBeNull()
      expect(boot()).toEqual(initialState())
    }
  })

  it('never restores NaN: Infinity serialises to null and is rejected', () => {
    const s = edited()
    const bad = { ...s, inputs: { ...s.inputs, fxLockRate: Infinity } }
    saveState(bad)
    expect(loadState()).toBeNull()
  })
})
