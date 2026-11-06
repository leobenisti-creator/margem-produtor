import { computeResult, type Scenario } from '../engine/calc'
import { CROPS } from '../engine/crops'
import { computeExposure } from '../engine/exposure'
import { effectiveYieldScHa, netProductionSc, productionOf } from '../engine/production'
import { matrixBaseScenario } from '../engine/scenarioMatrix'
import { buildScenarioMatrix } from '../engine/scenarioMatrix'
import { saleRoomSc, salesProductionSc } from './sales'
import { soldSummary } from '../engine/sales'
import { buildCurves, ALL_FIXED, marginParts } from '../engine/sensitivity'
import { biggestLoss, dollarSides, simulate, zeroPoint, type RiskCtx } from '../engine/riskSim'
import { loadState, mergeState, saveState, STORAGE_KEY } from './persist'
import { initialState, reducer } from './reducer'
import type { Action, AppState } from './types'

/*
 * The worked example, by hand:
 *   1.000 ha x 60 sc/ha = 60.000 sc; barter 5.000 sc -> net production 55.000 sc.
 *   Cost typed R$ 5.980/ha -> R$ 5.980.000 for the field; at a farm price of R$ 109/sc:
 *   revenue 55.000 x 109 = R$ 5.995.000; margin R$ 15.000 = R$ 0,2727.../sc on 55.000 sc.
 *   Sold 20.000 sc -> 20.000 / 55.000 = 36,36% (not 33,33%).
 */
const crop = CROPS.soja
const BPS = crop.bushelsPerSack
const FX = 5
const CBOT = 1200
// Freight chosen so that the farm price is exactly R$ 109,00/sc at this scenario.
const REF = (CBOT / 100) * BPS * FX
const FREIGHT = REF - 109
const scenario: Scenario = { cbotUsc: CBOT, basisUsc: 0, fx: FX }

const FARM: Action[] = [
  { type: 'setInput', key: 'areaHa', value: 1000 },
  { type: 'setInput', key: 'yieldScHa', value: 60 },
  { type: 'setInput', key: 'costPerHaBrl', value: 5980 },
  { type: 'setInput', key: 'freightBrlPerSc', value: FREIGHT },
  { type: 'setInput', key: 'portFeesBrlPerSc', value: 0 },
]

function build(actions: Action[]): AppState {
  return [...FARM, ...actions].reduce(reducer, initialState())
}

const withBarter = (b: number) => build([{ type: 'setBarterSc', value: b }])

describe('barter: the net production is the single production', () => {
  it('netProductionSc: max(0, area x yield - barter); bit for bit area x yield without barter', () => {
    expect(netProductionSc(1000, 60, 5000)).toBe(55000)
    expect(netProductionSc(1000, 60)).toBe(60000)
    expect(netProductionSc(1000, 60, 0)).toBe(60000)
    expect(netProductionSc(61.3, 1000.7, 0)).toBe(61.3 * 1000.7)
    expect(netProductionSc(1000, 60, 60000)).toBe(0)
    expect(netProductionSc(1000, 60, 90000)).toBe(0)
    expect(netProductionSc(1000, 60, -5)).toBe(60000)
    expect(netProductionSc(1000, 60, Number.NaN)).toBe(60000)
    expect(netProductionSc(0, 60, 5000)).toBe(0)
  })

  it('effectiveYieldScHa is the net production per hectare, exactly the yield without barter', () => {
    expect(effectiveYieldScHa({ areaHa: 1000, yieldScHa: 60, barterSc: 5000 })).toBe(55)
    expect(effectiveYieldScHa({ areaHa: 1000, yieldScHa: 60.37 })).toBe(60.37)
    expect(effectiveYieldScHa({ areaHa: 0, yieldScHa: 60, barterSc: 5000 })).toBe(60)
  })

  it('calc: R$ 15.000 of margin, R$ 0,27/sc on 55.000 sc, revenue R$ 5.995.000', () => {
    const s = withBarter(5000)
    expect(s.inputs.barterSc).toBe(5000)
    const r = computeResult(crop, scenario, s.inputs)
    expect(r.farmPriceBrl).toBeCloseTo(109, 9)
    expect(r.productionSc).toBeCloseTo(55000, 6)
    expect(r.costPerSc).toBeCloseTo(5_980_000 / 55_000, 9)
    expect(r.marginPerSc).toBeCloseTo(109 - 5_980_000 / 55_000, 9)
    expect(r.marginPerSc).toBeCloseTo(0.2727, 4)
    expect(r.marginTotal).toBeCloseTo(15000, 4)
    // per hectare: R$ 15.000 on 1.000 ha
    expect(r.marginPerHa).toBeCloseTo(15, 6)
    // revenue 55.000 x 109
    expect(55000 * (r.farmPriceBrl as number)).toBeCloseTo(5_995_000, 4)
    // the cost stays as typed: cost per sack x net production = R$ 5.980.000
    expect((r.costPerSc as number) * (r.productionSc as number)).toBeCloseTo(5_980_000, 4)
  })

  it('without barter nothing changes (margin on 60.000 sc, cost R$ 99,67/sc)', () => {
    const r = computeResult(crop, scenario, build([]).inputs)
    expect(r.productionSc).toBe(60000)
    expect(r.costPerSc).toBeCloseTo(5980 / 60, 9)
    expect(r.marginTotal).toBeCloseTo(60000 * (109 - 5980 / 60), 4)
  })

  it('break-even productivity is the gross one: net sacks that pay the cost plus the barter per hectare', () => {
    const r = computeResult(crop, scenario, withBarter(5000).inputs)
    // 5.980 / 109 = 54,862 net sc/ha + 5 sc/ha of barter
    expect(r.breakEven.yieldScHa).toBeCloseTo(5980 / 109 + 5, 9)
    expect(r.breakEven.priceBrl).toBeCloseTo(5_980_000 / 55_000, 9)
  })

  it('sales: 20.000 sc is 36,4% of the 55.000 sc (not 33,3%), the room of a tranche and the cap follow the net', () => {
    const s = build([
      { type: 'setBarterSc', value: 5000 },
      { type: 'addSale', partial: { volume: 20000, volumeUnit: 'sc', price: 110 } },
    ])
    expect(salesProductionSc(s)).toBe(55000)
    const sum = soldSummary(s.sales, salesProductionSc(s), BPS)
    expect(sum.soldSc).toBe(20000)
    expect(sum.soldPct).toBeCloseTo(20000 / 55000, 12)
    expect(sum.soldPct * 100).toBeCloseTo(36.36, 2)
    expect(s.inputs.soldPct).toBeCloseTo(20000 / 55000, 12)
    expect(saleRoomSc(s.sales, 'nova', salesProductionSc(s), BPS)).toBe(35000)
    // a sale above the net production is cut to it (never 60.000)
    const big = build([
      { type: 'setBarterSc', value: 5000 },
      { type: 'addSale', partial: { volume: 58000, volumeUnit: 'sc', price: 110 } },
    ])
    expect(big.sales[0].volume).toBe(55000)
    expect(big.inputs.soldPct).toBe(1)
  })

  it('exposure: the sacks open in CBOT/basis/dollar are counted on the net production', () => {
    const s = build([
      { type: 'setBarterSc', value: 5000 },
      { type: 'addSale', partial: { volume: 20000, volumeUnit: 'sc', price: 110 } },
    ])
    const exp = computeExposure({
      productionSc: salesProductionSc(s) as number,
      areaHa: s.inputs.areaHa,
      bushelsPerSack: BPS,
      tranches: s.sales,
      hedgeOps: [],
      usdPerSc: 109 / FX,
      costsUsdOpen: 0,
    })
    expect(exp.ok).toBe(true)
    if (!exp.ok) return
    expect(exp.productionSc).toBe(55000)
    expect(exp.cbot.openSc).toBe(35000)
    expect(exp.basis.openSc).toBe(35000)
    expect(exp.cbot.pct).toBeCloseTo(35000 / 55000, 12)
    expect(exp.cbot.scPerHa).toBe(35)
  })

  it('sensitivity (marginParts): production, revenue, cost and margin of the example', () => {
    const s = withBarter(5000)
    const p = marginParts(crop, scenario, s.inputs, [], ALL_FIXED)
    expect(p).not.toBeNull()
    expect(p?.productionSc).toBeCloseTo(55000, 6)
    expect(p?.revenue).toBeCloseTo(5_995_000, 3)
    expect(p?.cost).toBeCloseTo(5_980_000, 3)
    expect(p?.margin).toBeCloseTo(15000, 3)
    const curves = buildCurves({ crop, scenario, inputs: s.inputs, tranches: [] })
    expect(curves.productionSc).toBe(productionOf(s.inputs))
    expect(curves.productionSc).toBeCloseTo(55000, 6)
  })

  it('scenario matrix: the centre cell is the R$ 15.000 / R$ 0,27 per sack of the example', () => {
    const s = withBarter(5000)
    const m = buildScenarioMatrix({
      crop,
      scenario,
      inputs: s.inputs,
      tranches: [],
      rowAxis: 'cbot',
      colAxis: 'dolar',
      lens: 'tudo',
    })
    const mid = m.cells[4][4]
    expect(mid.total).toBeCloseTo(15000, 3)
    expect(mid.perSc).toBeCloseTo(15000 / 55000, 9)
    expect(mid.perHa).toBeCloseTo(15, 6)
    expect(matrixBaseScenario(scenario, scenario, 'basis')).toEqual(scenario)
  })

  it('riskSim (Seu risco): margin and cost per hectare use the net production', () => {
    const s = withBarter(5000)
    const ctx: RiskCtx = { crop, base: scenario, inputs: s.inputs, tranches: [] }
    const sim = simulate(ctx, 'dolar', 0)
    expect(sim).not.toBeNull()
    expect(sim?.withLocks.today.productionSc).toBeCloseTo(55000, 6)
    expect(sim?.withLocks.today.margin).toBeCloseTo(15000, 3)
    expect(dollarSides(ctx).costBrlHa).toBeCloseTo(5980, 6)
    expect(zeroPoint(ctx, 'cbot', true)).not.toBeUndefined()
    expect(biggestLoss(ctx)).not.toBeUndefined()
  })

  it('DRE per unit: the whole-crop margin divided by the net production or by the area', () => {
    const s = withBarter(5000)
    const r = computeResult(crop, scenario, s.inputs)
    const total = r.marginTotal as number
    expect(total / (r.productionSc as number)).toBeCloseTo(r.marginPerSc as number, 9)
    expect(total / s.inputs.areaHa).toBeCloseTo(r.marginPerHa as number, 9)
  })

  it('barter equal to or above the gross production: net 0, nothing is NaN or Infinity', () => {
    for (const b of [60000]) {
      const s = withBarter(b)
      expect(salesProductionSc(s)).toBe(0)
      const r = computeResult(crop, scenario, s.inputs)
      for (const v of Object.values({ ...r, steps: undefined, breakEven: undefined })) {
        if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true)
      }
      expect(r.costPerSc).toBeNull()
      expect(r.marginPerSc).toBeNull()
      expect(r.marginTotal).toBeNull()
      expect(marginParts(crop, scenario, s.inputs, [], ALL_FIXED)).toBeNull()
      expect(buildCurves({ crop, scenario, inputs: s.inputs, tranches: [] }).ok).toBe(false)
      expect(simulate({ crop, base: scenario, inputs: s.inputs, tranches: [] }, 'dolar', 0)).toBeNull()
      const sum = soldSummary([], salesProductionSc(s), BPS)
      expect(sum.soldPct).toBe(0)
    }
  })

  it('area or productivity lowered below the barter: net 0, no crash', () => {
    const s = [
      ...FARM,
      { type: 'setBarterSc', value: 5000 } as Action,
      { type: 'setInput', key: 'areaHa', value: 50 } as Action,
    ].reduce(reducer, initialState())
    expect(s.barterSc.soja).toBe(5000)
    expect(salesProductionSc(s)).toBe(0)
    expect(computeResult(crop, scenario, s.inputs).marginTotal).toBeNull()
  })
})

describe('barter: state', () => {
  it('starts at zero for both crops and in the engine inputs', () => {
    const s = initialState()
    expect(s.barterSc).toEqual({ soja: 0, milho: 0 })
    expect(s.inputs.barterSc).toBe(0)
  })

  it('validates: finite, >= 0, not above the gross production; a rejected action returns the same state', () => {
    const s = build([])
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, 60001]) {
      expect(reducer(s, { type: 'setBarterSc', value: bad })).toBe(s)
    }
    expect(reducer(s, { type: 'setBarterSc', value: 60000 }).barterSc.soja).toBe(60000)
    expect(reducer(s, { type: 'setBarterSc', value: 0 })).toBe(s)
    // no area/productivity yet: nothing to take sacks from
    expect(reducer(initialState(), { type: 'setBarterSc', value: 10 })).toEqual(initialState())
    expect(reducer(s, { type: 'setBarterSc', value: 10, crop: 'xx' as never })).toBe(s)
  })

  it('each crop keeps its own barter; the engine inputs follow the crop on screen', () => {
    let s = withBarter(5000)
    s = reducer(s, { type: 'setBarterSc', value: 3000, crop: 'milho' })
    expect(s.inputs.barterSc).toBe(5000)
    s = reducer(s, { type: 'setCrop', crop: 'milho' })
    expect(s.barterSc).toEqual({ soja: 5000, milho: 3000 })
    expect(s.inputs.barterSc).toBe(3000)
    expect(salesProductionSc(s)).toBe(57000)
    s = reducer(s, { type: 'setBarterSc', value: 0 })
    expect(s.barterSc).toEqual({ soja: 5000, milho: 0 })
    s = reducer(s, { type: 'setCrop', crop: 'soja' })
    expect(s.inputs.barterSc).toBe(5000)
    expect(salesProductionSc(s)).toBe(55000)
  })

  it('does not touch the journey inputs: it is optional', () => {
    const a = build([])
    const b = withBarter(5000)
    expect({ ...b.inputs, barterSc: 0 }).toEqual({ ...a.inputs, barterSc: 0 })
  })
})

describe('barter: persistence', () => {
  afterEach(() => localStorage.clear())

  it('round-trips both crops and comes back in the engine inputs', () => {
    let s = withBarter(5000)
    s = reducer(s, { type: 'setBarterSc', value: 3000, crop: 'milho' })
    saveState(s)
    const back = mergeState(initialState(), loadState())
    expect(back.barterSc).toEqual({ soja: 5000, milho: 3000 })
    expect(back.inputs.barterSc).toBe(5000)
    expect(salesProductionSc(back)).toBe(55000)
  })

  it('an old save without barter loads with zero for both crops', () => {
    saveState(build([]))
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string)
    delete raw.barterSc
    delete raw.inputs.barterSc
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
    const back = mergeState(initialState(), loadState())
    expect(back.barterSc).toEqual({ soja: 0, milho: 0 })
    expect(back.inputs.barterSc).toBe(0)
    expect(salesProductionSc(back)).toBe(60000)
  })

  it('invalid stored values become 0 without losing the rest of the save', () => {
    saveState(withBarter(5000))
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string)
    raw.barterSc = { soja: -4, milho: 'abc', outra: 9 }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw))
    const back = mergeState(initialState(), loadState())
    expect(back.barterSc).toEqual({ soja: 0, milho: 0 })
    expect(back.inputs.areaHa).toBe(1000)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...raw, barterSc: 'x' }))
    expect(mergeState(initialState(), loadState()).barterSc).toEqual({ soja: 0, milho: 0 })
  })

  it('the stored blob keeps the version key (margem:v3)', () => {
    expect(STORAGE_KEY).toBe('margem:v3')
  })
})
