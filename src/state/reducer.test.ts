import { initialState, reducer, validateInput } from './reducer'
import { sumCategories } from './costs'
import { staticProvider } from '../data/staticProvider'
import type { MarketSnapshot } from '../data/types'
import type { AppState } from './types'
import { LEGACY_EXAMPLE } from '../test/helpers'

let snapshot: MarketSnapshot
let s0: AppState
beforeAll(async () => {
  snapshot = await staticProvider.getSnapshot()
})
beforeEach(() => {
  // The numeric fixture typed by a "producer" (see LEGACY_EXAMPLE); the empty start is covered below and in fob.test.ts.
  s0 = LEGACY_EXAMPLE.reduce(reducer, initialState(snapshot))
})

describe('initialState', () => {
  it('starts empty: everything the producer provides is zero, only the port fee has the app default', () => {
    const e = initialState(snapshot)
    expect(e.crop).toBe('soja')
    expect(e.inputs.areaHa).toBe(0)
    expect(e.inputs.yieldScHa).toBe(0)
    expect(e.inputs.costPerHaBrl).toBe(0)
    expect(e.inputs.freightBrlPerSc).toBe(0)
    expect(e.inputs.costUsd).toEqual([])
    expect(e.inputs.costScHa).toBe(0)
    expect(sumCategories(e.costCategories)).toBe(0)
    for (const g of Object.values(e.costGroups)) {
      expect(g.totalBrlHa).toBe(0)
      for (const it of Object.values(g.items)) expect(it).toEqual({ mode: 'nao', valueBrlHa: 0, unit: 'ha', usd: null, rows: null })
    }
    expect(e.inputs.portFeesBrlPerSc).toBe(5.2)
    expect(e.inputs.soldPct).toBe(0)
    expect(e.inputs.targetMargin).toBeNull()
    expect(e.inputs.marginBase).toBe('receita')
    expect(e.currency).toBe('BRL')
    expect(e.areaUnit).toBe('scHa')
    expect(e.costMode).toBe('total')
    expect(e.matrix).toEqual({ stepsPct: [2.5, 5, 10, 20], yieldFactor: 1, resultSteps: { cbotPct: 2.5, fxPct: 2.5, basisBrl: 1 } })
    expect(e.includeSold).toBe(true)
    expect(e.tourSeen).toBe(false)
    expect(e.overrides).toEqual({})
    expect('marginBase' in e).toBe(false)
    expect('regionId' in e).toBe(false)
    expect('edited' in e).toBe(false)
  })

  it('the typed fixture keeps its values (area, productivity, cost, freight, groups)', () => {
    expect(s0.inputs.areaHa).toBe(1000)
    expect(s0.inputs.yieldScHa).toBe(60.4)
    expect(s0.inputs.costPerHaBrl).toBe(6383.44)
    expect(sumCategories(s0.costCategories)).toBe(6383.44)
    expect(s0.inputs.freightBrlPerSc).toBeCloseTo(461.27 * 0.06, 10)
  })
})

describe('setTargetMargin', () => {
  it('sets a numeric target, including zero, and clears it with null', () => {
    const on = reducer(s0, { type: 'setTargetMargin', value: 0.15 })
    expect(on.inputs.targetMargin).toBe(0.15)
    expect(reducer(s0, { type: 'setTargetMargin', value: 0 }).inputs.targetMargin).toBe(0)
    const off = reducer(on, { type: 'setTargetMargin', value: null })
    expect(off.inputs.targetMargin).toBeNull()
  })

  it('keeps the other inputs', () => {
    const on = reducer(s0, { type: 'setTargetMargin', value: 0.2 })
    expect({ ...on.inputs, targetMargin: null }).toEqual(s0.inputs)
  })

  it('invalid values leave the same state reference', () => {
    for (const v of [-0.01, NaN, Infinity, -Infinity, '0.1' as unknown as number]) {
      expect(reducer(s0, { type: 'setTargetMargin', value: v })).toBe(s0)
    }
  })

  it('a target above 100% is accepted (unreachable is shown by the UI)', () => {
    expect(reducer(s0, { type: 'setTargetMargin', value: 1.5 }).inputs.targetMargin).toBe(1.5)
  })
})

describe('validation', () => {
  it('soldPct above 1 or below 0 is rejected and state unchanged', () => {
    for (const v of [1.01, -0.01, NaN]) {
      expect(reducer(s0, { type: 'setInput', key: 'soldPct', value: v })).toBe(s0)
    }
    const ok = reducer(s0, { type: 'setInput', key: 'soldPct', value: 0.4 })
    expect(ok.inputs.soldPct).toBe(0.4)
  })

  it('rejects NaN/Infinity, negative area/yield/target', () => {
    const bad: Array<[Parameters<typeof reducer>[1]]> = [
      [{ type: 'setInput', key: 'areaHa', value: -1 }],
      [{ type: 'setInput', key: 'areaHa', value: Infinity }],
      [{ type: 'setInput', key: 'yieldScHa', value: -5 }],
      [{ type: 'setInput', key: 'yieldScHa', value: NaN }],
      [{ type: 'setTargetMargin', value: -0.1 }],
      [{ type: 'setTargetMargin', value: NaN }],
      [{ type: 'setTargetMargin', value: Infinity }],
      [{ type: 'setInput', key: 'costPerHaBrl', value: NaN }],
      [{ type: 'setInput', key: 'freightBrlPerSc', value: Infinity }],
    ]
    for (const [a] of bad) expect(reducer(s0, a)).toBe(s0)
  })

  it('accepts zero for money, area and yield', () => {
    expect(reducer(s0, { type: 'setInput', key: 'costPerHaBrl', value: 0 }).inputs.costPerHaBrl).toBe(0)
    expect(reducer(s0, { type: 'setInput', key: 'areaHa', value: 0 }).inputs.areaHa).toBe(0)
    expect(reducer(s0, { type: 'setInput', key: 'portFeesBrlPerSc', value: 0 }).inputs.portFeesBrlPerSc).toBe(0)
  })

  it('override fx 0 or negative is rejected', () => {
    for (const v of [0, -1, NaN, Infinity]) {
      expect(reducer(s0, { type: 'override', key: 'fx', value: v })).toBe(s0)
    }
    expect(reducer(s0, { type: 'override', key: 'cbotUsc', value: 0 })).toBe(s0)
    expect(reducer(s0, { type: 'override', key: 'basisUsc', value: Infinity })).toBe(s0)
    expect(reducer(s0, { type: 'override', key: 'basisUsc', value: -20 }).overrides.basisUsc).toBe(-20)
  })

  it('validateInput returns pt-BR messages or null', () => {
    expect(validateInput('soldPct', 1.5)).toMatch(/\S/)
    expect(validateInput('fx', 0)).toMatch(/dólar/i)
    expect(validateInput('soldPct', 0.5)).toBeNull()
    expect(validateInput('areaHa', 0)).toBeNull()
  })

  it('rejects invalid matrix settings (setMatrix replaced by setStepsPct / setYieldFactor)', () => {
    expect(reducer(s0, { type: 'setStepsPct', steps: [0, 5, 10, 20] })).toBe(s0)
    expect(reducer(s0, { type: 'setStepsPct', steps: [5, 5, 10, 20] })).toBe(s0)
    expect(reducer(s0, { type: 'setYieldFactor', value: 0.5 })).toBe(s0)
    expect(validateInput('fxStep', 0.00005)).toMatch(/0,0001/)
    expect(validateInput('cbotStepUsc', 0.005)).toMatch(/0,01/)
    expect(validateInput('fxStep', 0.0001)).toBeNull()
    expect(reducer(s0, { type: 'setStepsPct', steps: [1, 5, 10, 30] }).matrix.stepsPct).toEqual([1, 5, 10, 30])
  })
})

describe('overrides and scenario', () => {
  it('override null clears it', () => {
    const a = reducer(s0, { type: 'override', key: 'fx', value: 5.8 })
    expect(a.overrides.fx).toBe(5.8)
    const b = reducer(a, { type: 'override', key: 'fx', value: null })
    expect('fx' in b.overrides).toBe(false)
  })

  it('applyScenario sets overrides and resetScenario clears the scenario and the basis simulation, not the Lavoura premium', () => {
    const withBasis = reducer(s0, { type: 'override', key: 'basisUsc', value: -30 })
    const a = reducer(withBasis, { type: 'applyScenario', cbotUsc: 1300, fx: 5.9 })
    const sim = reducer(a, { type: 'setSimBasis', value: -25 })
    expect(sim.overrides).toEqual({ cbotUsc: 1300, fx: 5.9, basisUsc: -30, simBasisUsc: -25 })
    const b = reducer(sim, { type: 'resetScenario' })
    // The premium the producer typed in Lavoura e custos is data, not a simulation.
    expect(b.overrides).toEqual({ basisUsc: -30 })
  })

  it('applyScenario rejects invalid values', () => {
    expect(reducer(s0, { type: 'applyScenario', cbotUsc: 1300, fx: 0 })).toBe(s0)
    expect(reducer(s0, { type: 'applyScenario', cbotUsc: -1, fx: 5 })).toBe(s0)
  })
})

describe('cost mode', () => {
  it('switching to categorias then back keeps the total', () => {
    const t = reducer(s0, { type: 'setInput', key: 'costPerHaBrl', value: 4200 })
    const c = reducer(t, { type: 'setCostMode', mode: 'categorias' })
    expect(c.costMode).toBe('categorias')
    expect(sumCategories(c.costCategories)).toBe(4200)
    const back = reducer(c, { type: 'setCostMode', mode: 'total' })
    expect(back.inputs.costPerHaBrl).toBe(4200)
  })

  it('editing a category in categorias mode updates the total', () => {
    const c = reducer(s0, { type: 'setCostMode', mode: 'categorias' })
    const e = reducer(c, { type: 'setCategory', id: 'outros', value: c.costCategories.outros + 100 })
    expect(e.inputs.costPerHaBrl).toBeCloseTo(c.inputs.costPerHaBrl + 100, 6)
  })

  it('categorias -> total sets total to the category sum', () => {
    let c = reducer(s0, { type: 'setCostMode', mode: 'categorias' })
    c = reducer(c, { type: 'setCategory', id: 'sementes', value: 0 })
    const back = reducer(c, { type: 'setCostMode', mode: 'total' })
    expect(back.inputs.costPerHaBrl).toBe(sumCategories(c.costCategories))
  })

  it('a single typed total with no split of its own goes to outros', () => {
    const t = reducer(initialState(snapshot), { type: 'setInput', key: 'costPerHaBrl', value: 3000 })
    const c = reducer(t, { type: 'setCostMode', mode: 'categorias' })
    expect(c.costCategories.outros).toBe(3000)
    expect(c.costCategories.sementes).toBe(0)
  })

  it('rejects invalid category values', () => {
    expect(reducer(s0, { type: 'setCategory', id: 'outros', value: NaN })).toBe(s0)
    expect(reducer(s0, { type: 'setCategory', id: 'outros', value: -1 })).toBe(s0)
  })
})

describe('crop and point never prefill', () => {
  it('setCrop keeps everything the producer typed and prefills nothing', () => {
    const a = reducer(s0, { type: 'setCrop', crop: 'milho' })
    expect(a.crop).toBe('milho')
    expect(a.inputs).toEqual(s0.inputs)
    expect(a.costCategories).toEqual(s0.costCategories)
    const fresh = reducer(initialState(snapshot), { type: 'setCrop', crop: 'milho' })
    expect(fresh.inputs.yieldScHa).toBe(0)
    expect(fresh.inputs.costPerHaBrl).toBe(0)
    expect(fresh.inputs.areaHa).toBe(0)
  })

  it('setFob never touches the producer fields', () => {
    const a = reducer(s0, { type: 'setFob', fobId: 'sorriso' })
    expect(a.inputs).toEqual(s0.inputs)
    const fresh = reducer(initialState(snapshot), { type: 'setFob', fobId: 'sorriso' })
    expect(fresh.inputs.yieldScHa).toBe(0)
    expect(fresh.inputs.freightBrlPerSc).toBe(0)
  })

  it('the retired actions are ignored', () => {
    expect(reducer(s0, { type: 'setRegion', regionId: 'oeste' } as never)).toBe(s0)
    expect(reducer(s0, { type: 'confirmDefaults', cost: true } as never)).toBe(s0)
  })

  it('tourDone, currency, unit, includeSold and marginBase work', () => {
    expect(reducer(s0, { type: 'tourDone' }).tourSeen).toBe(true)
    expect(reducer(s0, { type: 'setCurrency', currency: 'USD' }).currency).toBe('USD')
    expect(reducer(s0, { type: 'setAreaUnit', unit: 'tHa' }).areaUnit).toBe('tHa')
    expect(reducer(s0, { type: 'setIncludeSold', value: false }).includeSold).toBe(false)
    expect(reducer(s0, { type: 'setInput', key: 'marginBase', value: 'custo' }).inputs.marginBase).toBe('custo')
  })
})

describe('fix round 1', () => {
  it('negative money is rejected, zero accepted', () => {
    for (const key of ['costPerHaBrl', 'freightBrlPerSc', 'portFeesBrlPerSc', 'soldAvgPriceBrl'] as const) {
      expect(reducer(s0, { type: 'setInput', key, value: -1 })).toBe(s0)
      expect(reducer(s0, { type: 'setInput', key, value: 0 }).inputs[key]).toBe(0)
      expect(validateInput(key, -1)).toMatch(/negativ/)
    }
  })

  it('setCategory with an unknown id is ignored', () => {
    expect(reducer(s0, { type: 'setCategory', id: 'xyz' as 'outros', value: 1 })).toBe(s0)
  })

  it('setCrop with an inherited property name is ignored', () => {
    expect(reducer(s0, { type: 'setCrop', crop: 'toString' as 'soja' })).toBe(s0)
  })
})

describe('Resultados matrix steps', () => {
  it('start at 2,5% CBOT, 2,5% dollar and R$ 1/sc basis', () => {
    expect(s0.matrix.resultSteps).toEqual({ cbotPct: 2.5, fxPct: 2.5, basisBrl: 1 })
  })

  it('setResultSteps changes only the fields given, leaving the Simulador steps alone', () => {
    const s = reducer(s0, { type: 'setResultSteps', steps: { cbotPct: 5 } })
    expect(s.matrix.resultSteps).toEqual({ cbotPct: 5, fxPct: 2.5, basisBrl: 1 })
    expect(s.matrix.stepsPct).toEqual(s0.matrix.stepsPct)
    expect(reducer(s, { type: 'setResultSteps', steps: { basisBrl: 0.5, fxPct: 1 } }).matrix.resultSteps).toEqual({
      cbotPct: 5,
      fxPct: 1,
      basisBrl: 0.5,
    })
  })

  it('rejects a step that is zero, negative, not finite or too large (four steps must stay under 100%)', () => {
    for (const steps of [
      { cbotPct: 0 },
      { fxPct: -1 },
      { basisBrl: 0 },
      { cbotPct: Number.NaN },
      { fxPct: Infinity },
      { cbotPct: 25 },
      { fxPct: 30 },
      { basisBrl: -0.5 },
      { cbotPct: 5, fxPct: 0 }, // one bad field rejects all
      { nope: 1 } as never,
    ])
      expect(reducer(s0, { type: 'setResultSteps', steps })).toBe(s0)
    expect(reducer(s0, { type: 'setResultSteps', steps: { cbotPct: 24.9 } }).matrix.resultSteps.cbotPct).toBe(24.9)
  })
})

describe('basis override', () => {
  it('setCrop clears the basis and CBOT overrides (they belong to one crop) but keeps the dollar one', () => {
    let s = reducer(s0, { type: 'override', key: 'basisUsc', value: 70 })
    s = reducer(s, { type: 'override', key: 'cbotUsc', value: 1200 })
    s = reducer(s, { type: 'override', key: 'fx', value: 5.2 })
    s = reducer(s, { type: 'setCrop', crop: 'milho' })
    expect(s.overrides).toEqual({ fx: 5.2 })
  })

  it('setSimBasis stores a simulation apart from the Lavoura premium; null clears only the simulation', () => {
    let s = reducer(s0, { type: 'override', key: 'basisUsc', value: 70 })
    s = reducer(s, { type: 'setSimBasis', value: 65.5 })
    expect(s.overrides).toEqual({ basisUsc: 70, simBasisUsc: 65.5 })
    expect(reducer(s, { type: 'setSimBasis', value: Number.NaN })).toBe(s)
    expect(reducer(s, { type: 'setSimBasis', value: Infinity })).toBe(s)
    s = reducer(s, { type: 'setSimBasis', value: null })
    expect(s.overrides).toEqual({ basisUsc: 70 })
    expect(reducer(s, { type: 'setSimBasis', value: null })).toBe(s)
  })

  it('setCrop also drops the basis simulation', () => {
    let s = reducer(s0, { type: 'setSimBasis', value: 70 })
    s = reducer(s, { type: 'setCrop', crop: 'milho' })
    expect(s.overrides).toEqual({})
  })

  it('an unknown override key is rejected', () => {
    expect(reducer(s0, { type: 'override', key: 'areaHa' as 'fx', value: 5 })).toBe(s0)
  })

  it('a null value removes only that override', () => {
    let s = reducer(s0, { type: 'override', key: 'basisUsc', value: 70 })
    s = reducer(s, { type: 'override', key: 'fx', value: 5.1 })
    s = reducer(s, { type: 'override', key: 'basisUsc', value: null })
    expect(s.overrides).toEqual({ fx: 5.1 })
  })
})
