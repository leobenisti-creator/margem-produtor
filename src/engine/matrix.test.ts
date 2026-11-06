import { describe, expect, it } from 'vitest'
import { CROPS } from './crops'
import { computeResult, farmPriceBrl, type FarmInputs, type Scenario } from './calc'
import {
  DEFAULT_STEPS_PCT,
  buildMatrix,
  matrixToCsv,
  okCount,
  toneFor,
  type MatrixOptions,
} from './matrix'

const soja = CROPS.soja
/** Opening state of the app: soja, Centro-Sul, market of 26/10. */
const today: Scenario = { cbotUsc: 1241.25, basisUsc: 61.7, fx: 5.4998 }
const cs: FarmInputs = {
  areaHa: 1000,
  yieldScHa: 60.4,
  costPerHaBrl: 6383.44,
  freightBrlPerSc: 27.6762,
  portFeesBrlPerSc: 5.2,
  soldPct: 0,
  soldAvgPriceBrl: 0,
  targetMargin: null,
  marginBase: 'receita',
  costUsd: [],
  fxLockPct: 0,
  fxLockRate: 0,
  costScHa: 0,
}
const opts: MatrixOptions = { stepsPct: DEFAULT_STEPS_PCT, yieldFactor: 1, includeSold: false }
const r2 = (n: number) => Math.round(n * 100) / 100

describe('buildMatrix: always 9×9 in percentage steps', () => {
  it('default steps are 2,5 / 5 / 10 / 20%', () => {
    expect(DEFAULT_STEPS_PCT).toEqual([2.5, 5, 10, 20])
  })

  it('dollar axis: today 5,4998 with the default steps', () => {
    const m = buildMatrix(soja, today, cs, opts)
    const want = [4.3998, 4.9498, 5.2248, 5.3623, 5.4998, 5.6373, 5.7748, 6.0498, 6.5998]
    expect(m.fxCols).toHaveLength(9)
    m.fxCols.forEach((v, k) => expect(v).toBeCloseTo(want[k], 4))
    expect(m.fxPct).toEqual([-20, -10, -5, -2.5, 0, 2.5, 5, 10, 20])
  })

  it('CBOT axis: today 1241,25 with the default steps', () => {
    const m = buildMatrix(soja, today, cs, opts)
    expect(m.cbotRows.map(r2)).toEqual([
      993.0, 1117.13, 1179.19, 1210.22, 1241.25, 1272.28, 1303.31, 1365.38, 1489.5,
    ])
    expect(m.cbotPct).toEqual([-20, -10, -5, -2.5, 0, 2.5, 5, 10, 20])
  })

  it('9 rows × 9 cols, current = centre (4, 4) = today exactly', () => {
    const m = buildMatrix(soja, today, cs, opts)
    expect(m.cells).toHaveLength(9)
    m.cells.forEach((row) => expect(row).toHaveLength(9))
    expect(m.current).toEqual({ row: 4, col: 4 })
    const c = m.cells[4][4]
    expect(c.cbotUsc).toBe(1241.25)
    expect(c.fx).toBe(5.4998)
    expect(c.priceBrl).toBeCloseTo(125.11, 2)
    expect(c.priceBrl).toBeCloseTo(farmPriceBrl(soja, today, cs), 10)
    expect(c.marginPct as number).toBeCloseTo(0.155, 3)
    expect(m.lockedAllFx).toBe(false)
  })

  it('custom steps are applied symmetrically on both axes', () => {
    const m = buildMatrix(soja, today, cs, { ...opts, stepsPct: [1, 2, 3, 4] })
    expect(m.fxPct).toEqual([-4, -3, -2, -1, 0, 1, 2, 3, 4])
    expect(m.cbotRows[8]).toBeCloseTo(1241.25 * 1.04, 4)
  })

  it('price rises with CBOT rows and with dollar cols', () => {
    const m = buildMatrix(soja, today, cs, opts)
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (r > 0) expect(m.cells[r][c].priceBrl).toBeGreaterThan(m.cells[r - 1][c].priceBrl)
        if (c > 0) expect(m.cells[r][c].priceBrl).toBeGreaterThan(m.cells[r][c - 1].priceBrl)
      }
    }
  })

  it('yieldFactor 0,9 lowers the centre margin from ≈15,5% to ≈6,1%; price is unchanged', () => {
    const base = buildMatrix(soja, today, cs, opts).cells[4][4]
    const low = buildMatrix(soja, today, cs, { ...opts, yieldFactor: 0.9 }).cells[4][4]
    expect(base.marginPct as number).toBeCloseTo(0.155, 3)
    expect(low.marginPct as number).toBeCloseTo(0.061, 3)
    expect(low.priceBrl).toBe(base.priceBrl)
    const high = buildMatrix(soja, today, cs, { ...opts, yieldFactor: 1.1 }).cells[4][4]
    expect(high.marginPct as number).toBeGreaterThan(base.marginPct as number)
  })

  it('each column costs the US$ lines at its own dollar', () => {
    const usd: FarmInputs = {
      ...cs,
      costPerHaBrl: 5311,
      costUsd: [{ usdPerHa: 195, boughtPct: 0, boughtRate: 0 }],
    }
    const m = buildMatrix(soja, today, usd, opts)
    const c = m.cells[4][8]
    const cost = (5311 + 195 * c.fx) / 60.4
    expect(c.marginPerSc as number).toBeCloseTo(c.priceBrl - cost, 8)
    expect(m.lockedAllFx).toBe(false)
  })

  it('fxLockPct 1 with no open US$ cost: every column repeats, lockedAllFx is true, no exception', () => {
    const locked: FarmInputs = { ...cs, fxLockPct: 1, fxLockRate: 5.2 }
    const m = buildMatrix(soja, today, locked, opts)
    expect(m.lockedAllFx).toBe(true)
    for (const row of m.cells) {
      for (const c of row) {
        expect(c.priceBrl).toBeCloseTo(row[0].priceBrl, 9)
        expect(c.marginPct as number).toBeCloseTo(row[0].marginPct as number, 9)
      }
    }
    // the axes stay shown
    expect(new Set(m.fxCols).size).toBe(9)
  })

  it('fxLockPct 1 but open US$ cost: columns differ by cost, so not lockedAllFx', () => {
    const m = buildMatrix(
      soja,
      today,
      { ...cs, fxLockPct: 1, fxLockRate: 5.2, costUsd: [{ usdPerHa: 100, boughtPct: 0, boughtRate: 0 }] },
      opts,
    )
    expect(m.lockedAllFx).toBe(false)
  })

  it('throws RangeError for non-positive / non-finite steps, unordered steps or a non-positive base', () => {
    const bad: Array<MatrixOptions['stepsPct']> = [
      [0, 5, 10, 20],
      [-2.5, 5, 10, 20],
      [2.5, 5, 10, Number.NaN],
      [2.5, 5, 10, Number.POSITIVE_INFINITY],
      [5, 2.5, 10, 20],
      [2.5, 5, 10, 100],
    ]
    for (const stepsPct of bad) {
      expect(() => buildMatrix(soja, today, cs, { ...opts, stepsPct })).toThrow(RangeError)
    }
    expect(() => buildMatrix(soja, today, cs, { ...opts, yieldFactor: 0 })).toThrow(RangeError)
    expect(() => buildMatrix(soja, { ...today, cbotUsc: 0 }, cs, opts)).toThrow(RangeError)
    expect(() => buildMatrix(soja, { ...today, fx: -1 }, cs, opts)).toThrow(RangeError)
    expect(() => buildMatrix(soja, { ...today, fx: Number.NaN }, cs, opts)).toThrow(RangeError)
  })

  it('includeSold blends margin only, never price', () => {
    const sold: FarmInputs = { ...cs, soldPct: 0.3, soldAvgPriceBrl: 100 }
    const off = buildMatrix(soja, today, sold, { ...opts, includeSold: false }).cells[4][4]
    const on = buildMatrix(soja, today, sold, { ...opts, includeSold: true }).cells[4][4]
    expect(on.priceBrl).toBe(off.priceBrl)
    const blended = 0.3 * 100 + 0.7 * off.priceBrl
    expect(on.marginPerSc as number).toBeCloseTo(blended - 6383.44 / 60.4, 10)
  })

  it('includeSold with soldPct 0 matches unblended', () => {
    const on = buildMatrix(soja, today, cs, { ...opts, includeSold: true })
    const off = buildMatrix(soja, today, cs, opts)
    expect(on.cells).toEqual(off.cells)
  })

  it('no yield: every margin null, tone null (unknown, neutral), no NaN', () => {
    const m = buildMatrix(soja, today, { ...cs, yieldScHa: 0 }, opts)
    m.cells.flat().forEach((c) => {
      expect(c.marginPct).toBeNull()
      expect(c.tone).toBeNull()
      expect(Number.isFinite(c.priceBrl)).toBe(true)
    })
    expect(okCount(m, null)).toBe(0)
    expect(okCount(m, 0.2)).toBe(0)
  })

  it('opening grid without a target shows the three tones', () => {
    const m = buildMatrix(soja, today, cs, opts)
    expect(new Set(m.cells.flat().map((c) => c.tone))).toEqual(new Set([0, 1, 2]))
  })
})

describe('toneFor: traffic light', () => {
  it('without a target: < 0 red, 0 to 10% amber, ≥ 10% green', () => {
    expect(toneFor(-0.01, null)).toBe(0)
    expect(toneFor(0, null)).toBe(1)
    expect(toneFor(0.05, null)).toBe(1)
    expect(toneFor(0.0999, null)).toBe(1)
    expect(toneFor(0.1, null)).toBe(2)
    expect(toneFor(0.9, null)).toBe(2)
  })

  it('with a target: at/above green, up to 5 p.p. below amber, beyond red', () => {
    expect(toneFor(0.2, 0.2)).toBe(2)
    expect(toneFor(0.35, 0.2)).toBe(2)
    expect(toneFor(0.15, 0.2)).toBe(1)
    expect(toneFor(0.149, 0.2)).toBe(0)
    expect(toneFor(-0.5, 0.2)).toBe(0)
  })

  it('custom limits', () => {
    expect(toneFor(0.12, null, 0.15)).toBe(1)
    expect(toneFor(0.15, null, 0.15)).toBe(2)
    expect(toneFor(0.12, 0.2, 0.1, 0.1)).toBe(1)
    expect(toneFor(0.0999, 0.2, 0.1, 0.1)).toBe(0)
  })

  it('unknown margin has no colour (null), with or without a target', () => {
    expect(toneFor(null, null)).toBeNull()
    expect(toneFor(null, 0.15)).toBeNull()
    expect(toneFor(Number.NaN, 0.15)).toBeNull()
  })

  it('cells follow the margin in the chosen base (custo)', () => {
    const custo: FarmInputs = { ...cs, marginBase: 'custo', targetMargin: 0.18 }
    const c = buildMatrix(soja, today, custo, opts).cells[4][4]
    // 19,42 / 105,69 ≈ 18,4% on cost: green against an 18% target
    expect(c.marginPct as number).toBeCloseTo(0.184, 3)
    expect(c.tone).toBe(2)
  })
})

describe('okCount', () => {
  it('Centro-Sul: 31 of 81 meet a 20% target and 51 meet 10%', () => {
    const m = buildMatrix(soja, today, cs, opts)
    expect(okCount(m, 0.2)).toBe(31)
    expect(okCount(m, 0.1)).toBe(51)
  })

  it('without a target counts the cells with a non-negative margin', () => {
    const m = buildMatrix(soja, today, cs, opts)
    const flat = m.cells.flat()
    expect(okCount(m, null)).toBe(flat.filter((c) => (c.marginPct as number) >= 0).length)
    expect(okCount(m, null)).toBe(flat.filter((c) => c.tone !== 0).length)
  })
})

describe('matrixToCsv', () => {
  it('header and row labels carry value and percentage, comma decimals', () => {
    const m = buildMatrix(soja, today, cs, opts)
    const lines = matrixToCsv(m, 'preco').split('\n')
    expect(lines).toHaveLength(10)
    expect(lines[0]).toBe(
      'CBOT \\ Dólar;4,3998 (-20%);4,9498 (-10%);5,2248 (-5%);5,3623 (-2,5%);5,4998 (0%);' +
        '5,6373 (+2,5%);5,7748 (+5%);6,0498 (+10%);6,5998 (+20%)',
    )
    expect(lines[1].startsWith('993,00 (-20%);')).toBe(true)
    expect(lines[5].startsWith('1241,25 (0%);')).toBe(true)
    expect(lines[6].startsWith('1272,28 (+2,5%);')).toBe(true)
    expect(lines.join('\n')).not.toMatch(/\d\.\d/)
    expect(lines[5].split(';')[5]).toBe(m.cells[4][4].priceBrl.toFixed(2).replace('.', ','))
  })

  it('dollar header keeps 4 decimals when present', () => {
    const m = buildMatrix(soja, { ...today, fx: 5.1234 }, cs, opts)
    expect(matrixToCsv(m, 'preco').split('\n')[0]).toContain(';5,1234 (0%);')
  })

  it('pct view uses percent number with one decimal; null is empty', () => {
    const m = buildMatrix(soja, today, cs, opts)
    const pct = m.cells[4][4].marginPct as number
    const row = matrixToCsv(m, 'margemPct').split('\n')[5].split(';')
    expect(row[5]).toBe((pct * 100).toFixed(1).replace('.', ','))
    const empty = buildMatrix(soja, today, { ...cs, yieldScHa: 0 }, opts)
    expect(matrixToCsv(empty, 'margemHa').split('\n')[1]).toBe('993,00 (-20%)' + ';'.repeat(9))
  })
})

describe('buildMatrix centre cell matches computeResult', () => {
  const variants: [string, FarmInputs][] = [
    ['US$ cost lines', { ...cs, costUsd: [{ usdPerHa: 300, boughtPct: 0.4, boughtRate: 5.1 }] }],
    ['dollar lock', { ...cs, fxLockPct: 0.3, fxLockRate: 5.4 }],
  ]
  for (const [name, inputs] of variants) {
    it(name, () => {
      const m = buildMatrix(soja, today, inputs, opts)
      const c = m.cells[4][4]
      const r = computeResult(soja, today, inputs)
      expect(c.priceBrl).toBeCloseTo(r.farmPriceBrl as number, 9)
      expect(c.marginPerSc).toBeCloseTo(r.marginPerSc as number, 9)
      expect(c.marginPct).toBeCloseTo(r.marginPct as number, 9)
      expect(c.marginPerHa).toBeCloseTo(r.marginPerHa as number, 9)
    })
  }
})
