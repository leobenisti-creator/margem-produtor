import { computeResult } from '../engine/calc'
import { CROPS } from '../engine/crops'
import { initialState, reducer } from '../state/reducer'
import { COST_CATEGORY_IDS } from '../data/types'
import { groupTodayBrlHa, todayCostBrlHa } from '../ui/costView'

describe('cost: groups, whole cost per ha and cost per sack reconcile', () => {
  const s = [
    { type: 'setCostItem', itemId: 'adubacao.macro', patch: { mode: 'valor', valueBrlHa: 400, usd: { amountUsdHa: 100, boughtPct: 0.5, boughtRate: 5 } } },
    { type: 'setCostItem', itemId: 'arrendamento.valor', patch: { mode: 'valor', unit: 'scHa', valueBrlHa: 3 } },
    { type: 'setGroupTotal', group: 'defensivos', value: { usd: { amountUsdHa: 80, boughtPct: 0, boughtRate: 0 } } },
    { type: 'setInput', key: 'yieldScHa', value: 60 },
    { type: 'setInput', key: 'areaHa', value: 100 },
  ].reduce((st, a) => reducer(st, a as never), initialState())

  it('sum of group costs == whole cost == cost per sack x yield, at the scenario dollar and farm price', () => {
    const scenario = { cbotUsc: 1300, basisUsc: -50, fx: 5.5 }
    const r = computeResult(CROPS.soja, scenario, s.inputs)
    const farm = r.farmPriceBrl!
    const groups = COST_CATEGORY_IDS.reduce((n, g) => n + (groupTodayBrlHa(s, g, scenario.fx, farm) ?? NaN), 0)
    const whole = todayCostBrlHa(s.inputs, scenario.fx, farm)!
    expect(groups).toBeCloseTo(whole, 6)
    expect(r.costPerSc! * s.inputs.yieldScHa).toBeCloseTo(whole, 6)
    // the pieces by hand: US$ 100 half at 5.0, half at the market 5.5 -> 100 x 5.25 = 525 ; defensivos US$ 80 open = 440 ;
    // rent 3 sc x farm price
    const usd = 525 + 440
    const reais = s.inputs.costPerHaBrl // fixed R$ part kept by the engine
    expect(whole).toBeCloseTo(reais + usd + 3 * farm, 6)
  })
});
