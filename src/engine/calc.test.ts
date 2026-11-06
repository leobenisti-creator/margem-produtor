import { describe, expect, it } from 'vitest'
import { CROPS } from './crops'
import {
  basisSummary,
  blendedPriceBrl,
  breakEven,
  computeResult,
  farmPriceBrl,
  marginFromPrice,
  minPriceForTarget,
  referencePriceBrl,
  costPerHaAt,
  effectiveFx,
  inputsAt,
  type FarmInputs,
} from './calc'

const base: FarmInputs = {
  areaHa: 1000,
  yieldScHa: 60,
  costPerHaBrl: 4200,
  freightBrlPerSc: 0,
  portFeesBrlPerSc: 0,
  soldPct: 0,
  soldAvgPriceBrl: 0,
  targetMargin: 0.15,
  marginBase: 'receita',
  costUsd: [],
  fxLockPct: 0,
  fxLockRate: 0,
  costScHa: 0,
}

function noNonFinite(value: unknown): void {
  if (typeof value === 'number') {
    expect(Number.isFinite(value)).toBe(true)
  } else if (Array.isArray(value)) {
    value.forEach(noNonFinite)
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach(noNonFinite)
  }
}

describe('engine calc', () => {
  it('case B: risk x return (spec §7)', () => {
    const r = marginFromPrice(120, {
      ...base,
      areaHa: 1200,
      yieldScHa: 65,
      costPerHaBrl: 3200,
      soldPct: 0.3,
      targetMargin: 0.15,
      marginBase: 'custo',
    })
    expect(r.productionSc).toBeCloseTo(78000, 6)
    expect(r.soldSc).toBeCloseTo(23400, 6)
    expect(r.exposureSc).toBeCloseTo(54600, 6)
    expect(r.marginPct).toBeCloseTo(1.4375, 4)
    expect(r.costPerSc).toBeCloseTo(49.2308, 4)
  })

  it('case A: parity without basis (spec §7)', () => {
    expect(
      referencePriceBrl(CROPS.soja, { cbotUsc: 1298.25, basisUsc: 0, fx: 5.383 }),
    ).toBeCloseTo(154.07, 2)
  })

  it('case A: reference price with basis (spec §7)', () => {
    expect(
      referencePriceBrl(CROPS.soja, { cbotUsc: 1298.25, basisUsc: -175, fx: 5.383 }),
    ).toBeCloseTo(133.3, 1)
  })

  it('farm price subtracts freight and fees', () => {
    const s = { cbotUsc: 1298.25, basisUsc: 0, fx: 5.383 }
    const ref = referencePriceBrl(CROPS.soja, s)
    const farm = farmPriceBrl(CROPS.soja, s, {
      ...base,
      freightBrlPerSc: 0.18,
      portFeesBrlPerSc: 2.6,
    })
    expect(farm).toBeCloseTo(ref - 2.78, 2)
    expect(farm).toBeCloseTo(151.29, 2)
  })

  it('margin over revenue vs over cost', () => {
    // cost/sc = 4200 / 60 = 70
    const rev = marginFromPrice(116.7, { ...base, marginBase: 'receita' })
    const cost = marginFromPrice(116.7, { ...base, marginBase: 'custo' })
    expect(rev.marginPct).toBeCloseTo(0.4002, 4)
    expect(cost.marginPct).toBeCloseTo(0.6671, 4)
  })

  it('computes margin per ha and total', () => {
    const r = marginFromPrice(116.7, base)
    expect(r.marginPerSc).toBeCloseTo(46.7, 6)
    expect(r.marginPerHa).toBeCloseTo(46.7 * 60, 6)
    expect(r.marginTotal).toBeCloseTo(46.7 * 60 * 1000, 4)
  })

  it('min price for target', () => {
    expect(minPriceForTarget({ ...base, targetMargin: 0.35, marginBase: 'receita' })).toBeCloseTo(
      107.69,
      2,
    )
    expect(minPriceForTarget({ ...base, targetMargin: 0.35, marginBase: 'custo' })).toBeCloseTo(
      94.5,
      2,
    )
  })

  it('unreachable target', () => {
    expect(minPriceForTarget({ ...base, targetMargin: 1, marginBase: 'receita' })).toBeNull()
    expect(minPriceForTarget({ ...base, targetMargin: 1.5, marginBase: 'receita' })).toBeNull()
  })

  it('no target (null) yields no minimum price, in either base', () => {
    expect(minPriceForTarget({ ...base, targetMargin: null, marginBase: 'receita' })).toBeNull()
    expect(minPriceForTarget({ ...base, targetMargin: null, marginBase: 'custo' })).toBeNull()
    const r = computeResult(CROPS.soja, { cbotUsc: 1241.25, basisUsc: -50, fx: 5.15 }, {
      ...base,
      targetMargin: null,
    })
    expect(r.minPriceBrl).toBeNull()
    expect(r.farmPriceBrl).not.toBeNull()
    expect(r.marginPerSc).not.toBeNull()
  })

  it('break-even', () => {
    const be = breakEven(116.7, base)
    expect(be.yieldScHa).toBeCloseTo(35.99, 2)
    expect(be.priceBrl).toBeCloseTo(70, 6)
  })

  it('blended', () => {
    expect(blendedPriceBrl(116.7, { ...base, soldPct: 0.3, soldAvgPriceBrl: 118 })).toBeCloseTo(
      117.09,
      2,
    )
  })

  it('zero yield gives nulls not NaN', () => {
    const i = { ...base, yieldScHa: 0 }
    const r = marginFromPrice(120, i)
    for (const v of Object.values(r)) expect(v).toBeNull()
    expect(minPriceForTarget(i)).toBeNull()
    const full = computeResult(CROPS.soja, { cbotUsc: 1241.25, basisUsc: 0, fx: 5.4998 }, i)
    expect(full.minPriceBrl).toBeNull()
    expect(full.breakEven.yieldScHa).toBeNull()
    expect(full.blendedMarginPct).toBeNull()
    noNonFinite(full)
  })

  it('zero area nulls totals but keeps per-sack values', () => {
    const r = marginFromPrice(120, { ...base, areaHa: 0 })
    expect(r.productionSc).toBeNull()
    expect(r.soldSc).toBeNull()
    expect(r.exposureSc).toBeNull()
    expect(r.marginTotal).toBeNull()
    expect(r.marginPerSc).not.toBeNull()
  })

  it('NaN yield is treated as no yield', () => {
    const r = marginFromPrice(120, { ...base, yieldScHa: Number.NaN })
    for (const v of Object.values(r)) expect(v).toBeNull()
  })

  it('milho uses 2.36218', () => {
    expect(
      referencePriceBrl(CROPS.milho, { cbotUsc: 455, basisUsc: 0, fx: 5.4998 }),
    ).toBeCloseTo(59.11, 2)
  })

  it('computeResult combines everything with ordered steps', () => {
    const s = { cbotUsc: 1298.25, basisUsc: -175, fx: 5.383 }
    const i = { ...base, freightBrlPerSc: 0.18, portFeesBrlPerSc: 2.6, soldPct: 0.3, soldAvgPriceBrl: 118 }
    const r = computeResult(CROPS.soja, s, i)
    const ref = r.referencePriceBrl!
    const farm = r.farmPriceBrl!
    const blended = r.blendedPriceBrl!
    expect(ref).toBeCloseTo(133.3, 1)
    expect(farm).toBeCloseTo(ref - 2.78, 6)
    expect(r.marginPerSc).toBeCloseTo(farm - 70, 6)
    expect(r.minPriceBrl).toBeCloseTo(70 / 0.85, 6)
    expect(r.breakEven.priceBrl).toBeCloseTo(70, 6)
    expect(blended).toBeCloseTo(0.3 * 118 + 0.7 * farm, 6)
    expect(r.blendedMarginPct).toBeCloseTo((blended - 70) / blended, 6)
    expect(r.steps.map((x) => x.label).length).toBe(7)
    expect(r.steps[0].unit).toBe('US$/bu')
    expect(r.steps[0].value).toBeCloseTo(11.2325, 4)
    expect(r.steps[4].value).toBeCloseTo(farm, 6)
    noNonFinite(r)
  })

  describe.each([
    ['fx = 0', { cbotUsc: 1241.25, basisUsc: 61.7, fx: 0 }],
    ['fx = NaN', { cbotUsc: 1241.25, basisUsc: 61.7, fx: Number.NaN }],
    ['fx < 0', { cbotUsc: 1241.25, basisUsc: 61.7, fx: -5 }],
    ['cbot = NaN', { cbotUsc: Number.NaN, basisUsc: 61.7, fx: 5.4998 }],
    ['cbot = 0', { cbotUsc: 0, basisUsc: 61.7, fx: 5.4998 }],
    ['basis = NaN', { cbotUsc: 1241.25, basisUsc: Number.NaN, fx: 5.4998 }],
    ['fx = Infinity', { cbotUsc: 1241.25, basisUsc: 61.7, fx: Infinity }],
  ])('unusable scenario: %s', (_n, s) => {
    it('every price-derived field and step value is null, nothing is NaN/Infinity', () => {
      const r = computeResult(CROPS.soja, s, { ...base, soldPct: 0.3, soldAvgPriceBrl: 118 })
      expect(r.referencePriceBrl).toBeNull()
      expect(r.farmPriceBrl).toBeNull()
      expect(r.blendedPriceBrl).toBeNull()
      expect(r.blendedMarginPct).toBeNull()
      expect(r.marginPerSc).toBeNull()
      expect(r.marginPct).toBeNull()
      expect(r.marginPerHa).toBeNull()
      expect(r.marginTotal).toBeNull()
      expect(r.breakEven.yieldScHa).toBeNull()
      for (const step of r.steps.slice(0, 5)) {
        if (step.label !== 'Menos frete' && step.label !== 'Menos taxas de porto') {
          expect(step.value).toBeNull()
        }
      }
      // cost-side figures do not depend on the price and stay available
      expect(r.costPerSc).toBeCloseTo(base.costPerHaBrl / base.yieldScHa, 6)
      expect(r.minPriceBrl).not.toBeNull()
      noNonFinite(r.steps.map((x) => x.value ?? 0))
      noNonFinite({ ...r, steps: [] })
    })
  })
})


describe('engine: dólar efetivo, custo em US$ e trava', () => {
  const cs: FarmInputs = {
    ...base,
    yieldScHa: 60.4,
    costPerHaBrl: 6383.44,
    freightBrlPerSc: 27.68,
    portFeesBrlPerSc: 5.2,
  }
  const sc = { cbotUsc: 1241.25, basisUsc: 61.7, fx: 5.4998 }

  it('effectiveFx mistura trava e mercado', () => {
    expect(effectiveFx(0.6, 5.2, 5.4998)).toBeCloseTo(5.3199, 4)
    expect(effectiveFx(0, 0, 5.4998)).toBe(5.4998)
    expect(effectiveFx(1, 5.2, 6)).toBe(5.2)
  })

  it('costPerHaAt soma linhas em US$ ao dólar efetivo', () => {
    const i: FarmInputs = {
      ...base,
      costPerHaBrl: 5311,
      costUsd: [{ usdPerHa: 195, boughtPct: 0.6, boughtRate: 5.2 }],
    }
    expect(costPerHaAt(i, 5.4998)).toBeCloseTo(6348.38, 2)
    const j = inputsAt(i, 5.4998)
    expect(j.costUsd).toEqual([])
    expect(j.costPerHaBrl).toBeCloseTo(6348.38, 2)
  })

  it('campos neutros mantêm o resultado Centro-Sul', () => {
    const r = computeResult(CROPS.soja, sc, cs)
    expect(r.farmPriceBrl).toBeCloseTo(125.11, 1)
    expect(r.marginPerSc).toBeCloseTo(19.42, 1)
    expect(r.costPerSc).toBeCloseTo(6383.44 / 60.4, 6)
  })

  it('venda travada ignora o dólar do cenário', () => {
    const locked = { ...cs, fxLockPct: 1, fxLockRate: 5.2 }
    const a = computeResult(CROPS.soja, { ...sc, fx: 6 }, locked)
    const b = computeResult(CROPS.soja, { ...sc, fx: 5.2 }, cs)
    expect(a.farmPriceBrl).toBeCloseTo(b.farmPriceBrl as number, 8)
  })

  it('produtividade 0 com costUsd: margem null, sem NaN', () => {
    const r = computeResult(CROPS.soja, sc, {
      ...cs,
      yieldScHa: 0,
      costUsd: [{ usdPerHa: 195, boughtPct: 0.6, boughtRate: 5.2 }],
    })
    expect(r.marginPerSc).toBeNull()
    noNonFinite(r)
  })
})

describe('engine review fixes', () => {
  const sc = { cbotUsc: 1241.25, basisUsc: 61.7, fx: 5.4998 }
  const locked: FarmInputs = {
    ...base,
    freightBrlPerSc: 27.6762,
    portFeesBrlPerSc: 5.2,
    fxLockPct: 0.3,
    fxLockRate: 5.4,
  }

  it('effectiveFx skips zero-weight terms', () => {
    expect(effectiveFx(1, 5.2, Number.NaN)).toBe(5.2)
    expect(effectiveFx(0, Number.NaN, 5.5)).toBe(5.5)
    expect(effectiveFx(0, 0, 5.5)).toBe(5.5)
    expect(effectiveFx(1, 5.2, 5.5)).toBe(5.2)
    expect(effectiveFx(0.5, 5, 6)).toBeCloseTo(5.5, 12)
  })

  it('explanation steps chain at the effective dollar when locked', () => {
    const r = computeResult(CROPS.soja, sc, locked)
    const v = (label: string) => r.steps.find((x) => x.label === label)?.value as number
    const sum = v('Preço de referência') + v('Menos frete') + v('Menos taxas de porto')
    expect(Math.abs(sum - (r.farmPriceBrl as number))).toBeLessThanOrEqual(1e-6)
    expect(r.steps.some((x) => x.label === 'Dólar efetivo')).toBe(true)
  })
})

describe('basisSummary', () => {
  const crop = CROPS.soja
  const inputs: FarmInputs = {
    areaHa: 1000,
    yieldScHa: 60,
    costPerHaBrl: 6000,
    freightBrlPerSc: 20,
    portFeesBrlPerSc: 5,
    soldPct: 0,
    soldAvgPriceBrl: 0,
    targetMargin: null,
    marginBase: 'receita',
    costUsd: [],
    fxLockPct: 0,
    fxLockRate: 0,
    costScHa: 0,
  }
  const s = { cbotUsc: 1000, basisUsc: 50, fx: 5 }

  it('is the farm price minus the CBOT price in R$/sc: premium less freight and port fees', () => {
    const b = basisSummary(crop, s, inputs)!
    const cbotBrl = (1000 / 100) * crop.bushelsPerSack * 5
    expect(b.brlPerSc).toBeCloseTo(farmPriceBrl(crop, s, inputs) - cbotBrl, 10)
    expect(b.brlPerSc).toBeCloseTo((50 / 100) * crop.bushelsPerSack * 5 - 20 - 5, 10)
    // the same amount in US¢/bu
    expect(b.uscPerBu).toBeCloseTo((b.brlPerSc / (crop.bushelsPerSack * 5)) * 100, 10)
  })

  it('does not move with the CBOT (only the premium, freight and fees change it)', () => {
    const a = basisSummary(crop, s, inputs)!
    const b = basisSummary(crop, { ...s, cbotUsc: 1300 }, inputs)!
    expect(b.brlPerSc).toBeCloseTo(a.brlPerSc, 10)
  })

  it('uses the effective dollar when part of it is locked, and is null without a usable scenario', () => {
    const locked = basisSummary(crop, s, { ...inputs, fxLockPct: 1, fxLockRate: 6 })!
    expect(locked.brlPerSc).toBeCloseTo((50 / 100) * crop.bushelsPerSack * 6 - 25, 10)
    expect(basisSummary(crop, { ...s, fx: 0 }, inputs)).toBeNull()
    expect(basisSummary(crop, { ...s, cbotUsc: 0 }, inputs)).toBeNull()
  })
})
