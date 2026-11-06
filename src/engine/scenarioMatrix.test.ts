import type { FarmInputs, Scenario } from './calc'
import { CROPS } from './crops'
import { activeHedge, type HedgeOp } from './hedge'
import type { SaleTranche } from './sales'
import {
  applyAxes,
  applyAxis,
  basisBrlSc,
  buildScenarioMatrix,
  evaluateScenario,
  farmBasisBrlSc,
  heldAxis,
  matrixBaseScenario,
  premiumForFarmBasis,
  stepsFromSize,
  type ScenarioMatrixInput,
} from './scenarioMatrix'
import { marginBridge, readyScenarios, type ReadyInput } from './scenarios'

const crop = CROPS.soja
const BPS = crop.bushelsPerSack
const P = 60000
// CBOT 1.000, basis 0, dollar 5 -> farm price R$ 110,231/sc (no freight, no fees); cost R$ 100/sc
const scenario: Scenario = { cbotUsc: 1000, basisUsc: 0, fx: 5 }
const inputs: FarmInputs = {
  areaHa: 1000,
  yieldScHa: 60,
  costPerHaBrl: 6000,
  freightBrlPerSc: 0,
  portFeesBrlPerSc: 0,
  soldPct: 0,
  soldAvgPriceBrl: 0,
  targetMargin: null,
  marginBase: 'receita',
  costUsd: [],
  fxLockPct: 0,
  fxLockRate: 0,
  costScHa: 0,
}
const REF = 10 * BPS * 5 // 110,231
const sale = (volume: number, price = 120): SaleTranche => ({
  id: 's' + volume,
  volume,
  volumeUnit: 'sc',
  price,
  priceCurrency: 'BRL',
  dollar: null,
})
const future: HedgeOp = {
  id: 'h',
  asset: 'soja',
  kind: 'futuro',
  side: 'vendido',
  qty: 100_000,
  strike: 1300,
  premium: 0,
  fxFixed: null,
  maturity: '',
}
const input = (over: Partial<ScenarioMatrixInput> = {}): ScenarioMatrixInput => ({
  crop,
  scenario,
  inputs,
  tranches: [],
  rowAxis: 'cbot',
  colAxis: 'dolar',
  lens: 'tudo',
  ...over,
})

describe('buildScenarioMatrix', () => {
  it('9 x 9 around today; the centre is today exactly; CBOT and dollar axes use the % steps', () => {
    const m = buildScenarioMatrix(input())
    expect(m.cells).toHaveLength(9)
    expect(m.cells.every((r) => r.length === 9)).toBe(true)
    expect(m.rowValues).toEqual([800, 900, 950, 975, 1000, 1025, 1050, 1100, 1200])
    expect(m.rowDelta).toEqual([-20, -10, -5, -2.5, 0, 2.5, 5, 10, 20])
    expect(m.colValues[4]).toBe(5)
    expect(m.colValues[0]).toBeCloseTo(4, 9)
    expect(m.cells[4][4].scenario).toEqual(scenario)
    expect(m.current).toEqual({ row: 4, col: 4 })
  })

  it('lens tudo, nothing fixed: production x (farm price - cost); the centre is R$ 613.860', () => {
    const m = buildScenarioMatrix(input())
    const c = m.cells[4][4]
    expect(c.total).toBeCloseTo(P * (REF - 100), 4)
    expect(c.perSc).toBeCloseTo(REF - 100, 6)
    expect(c.perHa).toBeCloseTo((P * (REF - 100)) / 1000, 4)
    expect(c.priceBrl).toBeCloseTo(REF, 6)
    // margin % in the revenue base: 613.860 / (60.000 x 110,231)
    expect(c.pct).toBeCloseTo((REF - 100) / REF, 9)
    expect(c.parts).toMatchObject({ soldRevenue: 0, hedge: 0 })
    expect(c.parts?.revenue).toBeCloseTo(P * REF, 4)
    expect(c.parts?.cost).toBeCloseTo(6_000_000, 4)
  })

  it('CBOT x dollar: a cell at CBOT +10% (1.100) and today dollar', () => {
    const m = buildScenarioMatrix(input())
    // farm 11 x 2,20462 x 5 = 121,2541 -> margin 60.000 x 21,2541
    expect(m.cells[7][4].total).toBeCloseTo(P * (11 * BPS * 5 - 100), 4)
    // dollar +10% (5,5) at today CBOT: 10 x 2,20462 x 5,5 = 121,2541: the same by symmetry of the product
    expect(m.cells[4][7].total).toBeCloseTo(P * (10 * BPS * 5.5 - 100), 4)
  })

  it('basis axis is in R$/sc: steps 1/2/4/8, the value is today basis + the move, the margin moves by P x move', () => {
    const m = buildScenarioMatrix(input({ rowAxis: 'basis', colAxis: 'cbot' }))
    expect(m.rowDelta).toEqual([-8, -4, -2, -1, 0, 1, 2, 4, 8])
    expect(m.rowValues).toEqual([-8, -4, -2, -1, 0, 1, 2, 4, 8]) // today basis is 0 R$/sc here
    expect(m.cells[6][4].total).toBeCloseTo(P * (REF - 100) + P * 2, 3) // +R$ 2/sc on 60.000 sc
    expect(m.cells[2][4].total).toBeCloseTo(P * (REF - 100) - P * 2, 3)
    expect(basisBrlSc(crop, { cbotUsc: 1000, basisUsc: 61.7, fx: 5 })).toBeCloseTo(0.617 * BPS * 5, 9)
  })

  it('basis x dollar: a basis move is a US$ spread, so it grows with a higher dollar (R$ 2/sc at 5 is R$ 2,2/sc at 5,5)', () => {
    const m = buildScenarioMatrix(input({ rowAxis: 'basis', colAxis: 'dolar' }))
    // row +R$ 2/sc, column +10% dollar (5,5): farm = (10 x 2,20462 + 2/5) x 5,5
    const farm = (10 * BPS + 2 / 5) * 5.5
    expect(m.cells[6][7].priceBrl).toBeCloseTo(farm, 6)
    expect(m.cells[6][7].total).toBeCloseTo(P * (farm - 100), 3)
  })

  it('the three lenses with a sale of 30.000 sc at R$ 120', () => {
    const tr = [sale(30000)]
    const tudo = buildScenarioMatrix(input({ tranches: tr })).cells[4][4]
    // 30.000 x 120 + 30.000 x 110,231 - 6.000.000
    expect(tudo.total).toBeCloseTo(3_600_000 + 30000 * REF - 6_000_000, 4)
    const dif = buildScenarioMatrix(input({ tranches: tr, lens: 'diferenca' })).cells[4][4]
    // what the sale is worth: 30.000 x (120 - 110,231)
    expect(dif.total).toBeCloseTo(30000 * (120 - REF), 4)
    const aberto = buildScenarioMatrix(input({ tranches: tr, lens: 'aberto' })).cells[4][4]
    // the part not sold: 30.000 x (110,231 - 100); per sack of the OPEN part
    expect(aberto.total).toBeCloseTo(30000 * (REF - 100), 4)
    expect(aberto.perSc).toBeCloseTo(REF - 100, 6)
    expect(aberto.pct).toBeNull()
  })

  it('lens operacoes is only the result of the market operations', () => {
    const hedge = activeHedge([future], 5)
    const m = buildScenarioMatrix(input({ inputs: { ...inputs, hedge }, lens: 'operacoes' }))
    // (1300 - 1000) = 300 cents x 100.000 bu / 100 = US$ 300.000 x 5
    expect(m.cells[4][4].total).toBeCloseTo(1_500_000, 4)
    // CBOT +10% (1.100): 200 cents -> US$ 200.000 x 5
    expect(m.cells[7][4].total).toBeCloseTo(1_000_000, 4)
    // the dollar +10% (5,5) at today CBOT: 300 cents x 1.000 x 5,5
    expect(m.cells[4][7].total).toBeCloseTo(1_650_000, 4)
  })

  it('lens diferenca with an operation: margin with everything fixed minus margin with nothing fixed', () => {
    const hedge = activeHedge([future], 5)
    const c = buildScenarioMatrix(input({ inputs: { ...inputs, hedge }, lens: 'diferenca' })).cells[4][4]
    expect(c.total).toBeCloseTo(1_500_000, 4)
  })

  it('tone: tudo follows the margin % against the target; the other lenses follow the sign', () => {
    const noTarget = buildScenarioMatrix(input()).cells[4][4]
    expect(noTarget.tone).toBe(1) // 9,3% is between 0 and 10%: amber
    const withTarget = buildScenarioMatrix(input({ inputs: { ...inputs, targetMargin: 0.05 } })).cells[4][4]
    expect(withTarget.tone).toBe(2) // above the 5% target: green
    const low = buildScenarioMatrix(input()).cells[0][0] // CBOT -20% and dollar -20%: farm price below the cost
    expect(low.total as number).toBeLessThan(0)
    expect(low.tone).toBe(0)
    const dif = buildScenarioMatrix(input({ lens: 'diferenca' })).cells[4][4]
    expect(dif.total).toBeCloseTo(0, 6) // nothing fixed: no difference
    expect(dif.tone).toBe(2)
    const neg = buildScenarioMatrix(input({ lens: 'aberto' })).cells[0][0]
    expect(neg.tone).toBe(0)
  })

  it('margin base custo: the % is over the cost', () => {
    const c = buildScenarioMatrix(input({ inputs: { ...inputs, marginBase: 'custo' } })).cells[4][4]
    expect(c.pct).toBeCloseTo((REF - 100) / 100, 9)
  })

  it('a US$ sale with the dollar open follows the dollar of each column; a typed dollar does not', () => {
    const open: SaleTranche = {
      id: 'o',
      volume: 30000,
      volumeUnit: 'sc',
      price: 28,
      priceCurrency: 'USD',
      dollar: null,
      marketDollar: 5,
    }
    const typed = { ...open, id: 't', dollar: 5 }
    const mo = buildScenarioMatrix(input({ tranches: [open] }))
    const mt = buildScenarioMatrix(input({ tranches: [typed] }))
    // column +10% dollar (5,5): the open sale is worth 30.000 x 28 x 5,5 and the typed one 30.000 x 28 x 5
    expect(mo.cells[4][7].parts?.soldRevenue).toBeCloseTo(30000 * 28 * 5.5, 4)
    expect(mt.cells[4][7].parts?.soldRevenue).toBeCloseTo(30000 * 28 * 5, 4)
  })

  it('validation: different axes, increasing steps, positive base', () => {
    expect(() => buildScenarioMatrix(input({ colAxis: 'cbot' }))).toThrow(RangeError)
    expect(() => buildScenarioMatrix(input({ stepsPct: [5, 2, 10, 20] }))).toThrow(RangeError)
    expect(() => buildScenarioMatrix(input({ stepsPct: [2.5, 5, 10, 100] }))).toThrow(RangeError)
    expect(() => buildScenarioMatrix(input({ basisSteps: [0, 2, 4, 8] }))).toThrow(RangeError)
    expect(() => buildScenarioMatrix(input({ scenario: { ...scenario, fx: 0 } }))).toThrow(RangeError)
  })

  it('without production the cells are empty (null), never NaN', () => {
    const m = buildScenarioMatrix(input({ inputs: { ...inputs, areaHa: 0 } }))
    expect(m.cells[4][4]).toMatchObject({ total: null, perSc: null, pct: null, tone: null, parts: null })
    expect(JSON.stringify(m)).not.toMatch(/NaN|Infinity/)
  })

  it('the basis move uses today dollar whatever the order of the axes (and a dollar moved at the same time)', () => {
    const a = applyAxes(crop, scenario, [
      ['dolar', 10],
      ['basis', 2],
    ])
    const b = applyAxes(crop, scenario, [
      ['basis', 2],
      ['dolar', 10],
    ])
    expect(a).toEqual(b)
    expect(a.fx).toBeCloseTo(5.5, 9)
    expect(a.basisUsc).toBeCloseTo(2 / ((BPS / 100) * 5), 9) // converted at 5, not at 5,5
    // the same cell from a matrix with the axes swapped
    const m1 = buildScenarioMatrix(input({ rowAxis: 'basis', colAxis: 'dolar' }))
    const m2 = buildScenarioMatrix(input({ rowAxis: 'dolar', colAxis: 'basis' }))
    expect(m1.cells[6][7].total).toBeCloseTo(m2.cells[7][6].total as number, 6)
  })

  it('the BASIS is the farm price minus the CBOT (freight and fees inside), the same number as the Lavoura card', () => {
    const withFreight: FarmInputs = { ...inputs, freightBrlPerSc: 10, portFeesBrlPerSc: 3 }
    // farm = 110,231 - 13; CBOT in R$/sc = 10 x 2,20462 x 5 = 110,231 -> basis = -13
    expect(farmBasisBrlSc(crop, scenario, withFreight)).toBeCloseTo(-13, 9)
    expect(farmBasisBrlSc(crop, scenario, inputs)).toBeCloseTo(0, 9)
    expect(farmBasisBrlSc(crop, { ...scenario, fx: 0 }, inputs)).toBeNull()
    // the axis of a basis matrix is that basis plus the move
    const m = buildScenarioMatrix(input({ inputs: withFreight, rowAxis: 'basis', colAxis: 'cbot' }))
    expect(m.rowValues[4]).toBeCloseTo(-13, 9)
    expect(m.rowValues[6]).toBeCloseTo(-11, 9) // +R$ 2/sc
    expect(m.rowValues[2]).toBeCloseTo(-15, 9)
    // and the basis moves the farm price one for one
    expect((m.cells[6][4].priceBrl as number) - (m.cells[4][4].priceBrl as number)).toBeCloseTo(2, 9)
  })

  it('applyAxis moves one driver and leaves the others', () => {
    expect(applyAxis(crop, scenario, 'cbot', 10)).toEqual({ ...scenario, cbotUsc: 1100 })
    expect(applyAxis(crop, scenario, 'dolar', -10)).toEqual({ ...scenario, fx: 4.5 })
    expect(applyAxis(crop, scenario, 'basis', 0)).toEqual(scenario)
    expect(applyAxis(crop, scenario, 'basis', 2).basisUsc).toBeCloseTo(2 / ((BPS / 100) * 5), 9)
  })
})

const ready = (over: Partial<ReadyInput> = {}): ReadyInput => ({ crop, scenario, inputs, tranches: [], ...over })

describe('readyScenarios', () => {
  it('today is the market of today', () => {
    const [hoje] = readyScenarios(ready())
    expect(hoje.id).toBe('hoje')
    expect(hoje.scenario).toEqual(scenario)
    expect(hoje.total).toBeCloseTo(P * (REF - 100), 4)
    expect(hoje.priceBrl).toBeCloseTo(REF, 6)
  })

  it('pessimistic = CBOT -5%, dollar -5%, basis -R$ 1/sc; optimistic is the mirror', () => {
    const list = readyScenarios(ready())
    const pes = list.find((r) => r.id === 'pessimista')!
    expect(pes.scenario.cbotUsc).toBeCloseTo(950, 9)
    expect(pes.scenario.fx).toBeCloseTo(4.75, 9)
    const basisUsc = -1 / ((BPS / 100) * 5)
    expect(pes.scenario.basisUsc).toBeCloseTo(basisUsc, 9)
    const farm = ((950 + basisUsc) / 100) * BPS * 4.75
    expect(pes.total).toBeCloseTo(P * (farm - 100), 3)
    expect(pes.note).toBe('CBOT −5%, dólar −5%, basis −R$ 1/sc')
    const ote = list.find((r) => r.id === 'otimista')!
    expect(ote.scenario.cbotUsc).toBeCloseTo(1050, 9)
    expect(ote.total as number).toBeGreaterThan(pes.total as number)
    const est = list.find((r) => r.id === 'estresse')!
    expect(est.scenario.cbotUsc).toBeCloseTo(900, 9)
    expect(est.total as number).toBeLessThan(pes.total as number)
  })

  it('break-even: the CBOT at which the margin is zero (farm price = cost: 100 / (2,20462 x 5 / 100) cents)', () => {
    const eq = readyScenarios(ready()).find((r) => r.id === 'equilibrio')!
    expect(eq.scenario.cbotUsc).toBeCloseTo(100 / ((BPS * 5) / 100), 4)
    expect(eq.total as number).toBeCloseTo(0, 0)
    expect(eq.scenario.fx).toBe(5)
  })

  it('break-even with a sale in R$ is further away (half of the crop is fixed at R$ 120)', () => {
    const eq = readyScenarios(ready({ tranches: [sale(30000)] })).find((r) => r.id === 'equilibrio')!
    // 3.600.000 + 30.000 x farm = 6.000.000 -> farm R$ 80 -> CBOT 80 / 0,110231 cents
    expect(eq.scenario.cbotUsc).toBeCloseTo(80 / ((BPS * 5) / 100), 3)
  })

  it('no break-even when the margin never reaches zero (everything sold at a profit)', () => {
    const eq = readyScenarios(ready({ tranches: [sale(60000, 200)] })).find((r) => r.id === 'equilibrio')!
    expect(eq.total).toBeNull()
    expect(eq.note).toMatch(/não zera/)
  })

  it('target: only with a target margin; the CBOT where margin % = target (5% of the revenue)', () => {
    expect(readyScenarios(ready()).some((r) => r.id === 'meta')).toBe(false)
    const meta = readyScenarios(ready({ inputs: { ...inputs, targetMargin: 0.05 } })).find((r) => r.id === 'meta')!
    // revenue = cost / 0.95 -> farm = 100 / 0,95
    expect(meta.scenario.cbotUsc).toBeCloseTo(100 / 0.95 / ((BPS * 5) / 100), 3)
    expect(meta.pct).toBeCloseTo(0.05, 6)
  })

  it('no NaN anywhere, and an unusable scenario gives nulls', () => {
    const bad = readyScenarios(ready({ inputs: { ...inputs, areaHa: 0 } }))
    expect(JSON.stringify(bad)).not.toMatch(/NaN|Infinity/)
    expect(bad[0].total).toBeNull()
  })
})

describe('marginBridge', () => {
  it('nothing fixed: the bridge is flat and ends where it starts', () => {
    const b = marginBridge(ready())!
    expect(b.map((s) => s.key)).toEqual(['sem', 'vendas', 'operacoes', 'custos', 'final'])
    expect(b[0].value).toBeCloseTo(P * (REF - 100), 4)
    expect(b[1].value).toBeCloseTo(0, 6)
    expect(b[2].value).toBeCloseTo(0, 6)
    expect(b[3].value).toBeCloseTo(0, 6)
    expect(b[4].value).toBeCloseTo(b[0].value, 6)
  })

  it('a sale in R$: its effect is 30.000 x (120 - farm price); the effects add up to the end', () => {
    const b = marginBridge(ready({ tranches: [sale(30000)] }))!
    expect(b[1].value).toBeCloseTo(30000 * (120 - REF), 4)
    expect(b[0].value + b[1].value + b[2].value + b[3].value).toBeCloseTo(b[4].value, 6)
  })

  it('an open future: its effect is all projected at the scenario (nothing realized yet)', () => {
    const hedge = activeHedge([future], 5)
    const b = marginBridge(ready({ inputs: { ...inputs, hedge } }))!
    expect(b[2].value).toBeCloseTo(1_500_000, 4)
    expect(b[2].detail).toEqual({ realized: 0, projected: expect.closeTo(1_500_000, 4) })
  })

  it('US$ costs already bought at 5 while the dollar is 6: the effect is the saving on the costs', () => {
    const withCosts: FarmInputs = {
      ...inputs,
      costPerHaBrl: 5000,
      costUsd: [{ usdPerHa: 200, boughtPct: 1, boughtRate: 5 }],
    }
    const at6 = { ...scenario, fx: 6 }
    const b = marginBridge(ready({ inputs: withCosts }), at6)!
    // 1.000 ha x US$ 200 x (6 - 5)
    expect(b[3].value).toBeCloseTo(200_000, 4)
    expect(b[4].value).toBeCloseTo(b[0].value + 200_000, 4)
  })

  it('an unusable scenario gives null', () => {
    expect(marginBridge(ready({ inputs: { ...inputs, areaHa: 0 } }))).toBeNull()
  })
})

describe('Resultados page helpers', () => {
  const mk = (over: Partial<ScenarioMatrixInput> = {}) => input(over)

  it('stepsFromSize gives 1x..4x of the size without float noise', () => {
    expect(stepsFromSize(2.5)).toEqual([2.5, 5, 7.5, 10])
    expect(stepsFromSize(0.1)).toEqual([0.1, 0.2, 0.3, 0.4])
    expect(stepsFromSize(0.3)).toEqual([0.3, 0.6, 0.9, 1.2])
  })

  it('heldAxis is the driver that is on neither axis', () => {
    expect(heldAxis('cbot', 'dolar')).toBe('basis')
    expect(heldAxis('basis', 'dolar')).toBe('cbot')
    expect(heldAxis('cbot', 'basis')).toBe('dolar')
  })

  it('matrixBaseScenario moves only the held driver to the chosen value', () => {
    const today: Scenario = { cbotUsc: 1000, basisUsc: 5, fx: 5 }
    const chosen: Scenario = { cbotUsc: 1100, basisUsc: 8, fx: 5.5 }
    expect(matrixBaseScenario(today, chosen, 'cbot')).toEqual({ cbotUsc: 1100, basisUsc: 5, fx: 5 })
    expect(matrixBaseScenario(today, chosen, 'dolar')).toEqual({ cbotUsc: 1000, basisUsc: 5, fx: 5.5 })
    expect(matrixBaseScenario(today, chosen, 'basis')).toEqual({ cbotUsc: 1000, basisUsc: 8, fx: 5 })
  })

  it('axisStepsPct gives CBOT and the dollar a step each; the grid follows them', () => {
    const m = buildScenarioMatrix(
      mk({ axisStepsPct: { cbot: stepsFromSize(5), dolar: stepsFromSize(1) }, basisSteps: stepsFromSize(0.5) }),
    )
    expect(m.rowDelta).toEqual([-20, -15, -10, -5, 0, 5, 10, 15, 20])
    expect(m.colDelta).toEqual([-4, -3, -2, -1, 0, 1, 2, 3, 4])
    expect(m.rowValues[8]).toBeCloseTo(1200, 6)
    expect(m.colValues[0]).toBeCloseTo(4.8, 6)
    const b = buildScenarioMatrix(mk({ rowAxis: 'basis', colAxis: 'dolar', basisSteps: stepsFromSize(0.5) }))
    expect(b.rowDelta).toEqual([-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2])
    expect(() => buildScenarioMatrix(mk({ axisStepsPct: { cbot: stepsFromSize(25) } }))).toThrow(RangeError)
  })

  it('evaluateScenario is exactly the cell the matrix builds for that scenario', () => {
    const tranches = [sale(30000)]
    const withOps: FarmInputs = { ...inputs, hedge: activeHedge([future], 5) }
    for (const lens of ['tudo', 'aberto', 'operacoes', 'diferenca'] as const) {
      const m = buildScenarioMatrix(mk({ inputs: withOps, tranches, lens }))
      for (const [r, c] of [
        [0, 0],
        [4, 4],
        [2, 7],
        [8, 3],
      ]) {
        const cell = m.cells[r][c]
        if (lens === 'operacoes') expect(cell.total).not.toBe(0)
        expect(evaluateScenario(crop, cell.scenario, withOps, tranches, lens)).toEqual(cell)
      }
    }
  })

  it('premiumForFarmBasis is exact: the basis of the answer is the one asked, with and without a dollar lock', () => {
    for (const lock of [
      { fxLockPct: 0, fxLockRate: 0 },
      { fxLockPct: 0.4, fxLockRate: 5.3 },
    ]) {
      const inp = { ...inputs, freightBrlPerSc: 7, portFeesBrlPerSc: 5.2, ...lock }
      const s: Scenario = { cbotUsc: 1250, basisUsc: 60, fx: 5.4 }
      const now = farmBasisBrlSc(crop, s, inp)!
      for (const target of [now, now + 3.37, now - 8, -2.5, 0]) {
        const prem = premiumForFarmBasis(crop, s, inp, target)!
        expect(farmBasisBrlSc(crop, { ...s, basisUsc: prem }, inp)!).toBeCloseTo(target, 9)
      }
      expect(premiumForFarmBasis(crop, s, inp, now)!).toBeCloseTo(s.basisUsc, 9)
    }
    expect(premiumForFarmBasis(crop, { ...scenario, fx: 0 }, inputs, 3)).toBeNull()
    expect(premiumForFarmBasis(crop, scenario, inputs, Number.NaN)).toBeNull()
  })
})
