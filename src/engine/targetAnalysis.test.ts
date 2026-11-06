import { describe, expect, it } from 'vitest'
import { CROPS } from './crops'
import { computeResult, type FarmInputs, type Scenario } from './calc'
import { DEFAULT_STEPS_PCT, buildMatrix, type MatrixOptions } from './matrix'
import { analyzeTarget, type Lever, type TargetAnalysis } from './targetAnalysis'

const soja = CROPS.soja
/** Centro-Sul case: market of 26/10, freight + port fees = 32,88 R$/sc. */
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

function analyze(i: FarmInputs, s: Scenario = today): TargetAnalysis | null {
  return analyzeTarget(soja, s, i, buildMatrix(soja, s, i, opts))
}

function must(a: TargetAnalysis | null): TargetAnalysis {
  if (a === null) throw new Error('expected an analysis')
  return a
}

function lever(a: TargetAnalysis, id: Lever): number {
  const l = a.levers.find((x) => x.lever === id)
  if (!l || l.value === null) throw new Error(`lever ${id} has no value`)
  return l.value
}

/** Within one unit of the last digit shown. */
function near(v: number, want: number, unit: number): void {
  expect(Math.abs(v - want)).toBeLessThanOrEqual(unit)
}

/** Margin (in the client's base) after applying a lever value on its own. */
function marginWithLever(id: Lever, value: number, i: FarmInputs, s: Scenario = today): number {
  const base = computeResult(soja, s, i)
  let r
  switch (id) {
    case 'preco':
      r = computeResult(soja, s, {
        ...i,
        freightBrlPerSc: i.freightBrlPerSc - (value - (base.farmPriceBrl as number)),
      })
      break
    case 'cbot':
      r = computeResult(soja, { ...s, cbotUsc: value }, i)
      break
    case 'dolar':
      r = computeResult(soja, { ...s, fx: value }, i)
      break
    case 'produtividade':
      r = computeResult(soja, s, { ...i, yieldScHa: value })
      break
    case 'custo':
      r = computeResult(soja, s, { ...i, costPerHaBrl: value, costUsd: [] })
      break
  }
  return r.marginPct as number
}

describe('analyzeTarget: Centro-Sul case', () => {
  it('farm price today is about 125,11', () => {
    const p = computeResult(soja, today, cs).farmPriceBrl as number
    expect(p).toBeGreaterThanOrEqual(125.1)
    expect(p).toBeLessThanOrEqual(125.12)
  })

  it('no target gives null', () => {
    expect(analyze(cs)).toBeNull()
  })

  it('target 20%: below, gap 4,5 p.p., each lever alone reaches the target', () => {
    const a = must(analyze({ ...cs, targetMargin: 0.2 }))
    expect(a.status).toBe('abaixo')
    near(a.gapPp as number, 4.5, 0.05)
    near(lever(a, 'preco'), 132.11, 0.01)
    near(lever(a, 'cbot'), 1299, 1)
    near(lever(a, 'dolar'), 5.74, 0.01)
    near(lever(a, 'produtividade'), 63.8, 0.1)
    near(lever(a, 'custo'), 6045, 1)
    expect(a.levers.map((l) => l.lever)).toEqual([
      'preco',
      'cbot',
      'dolar',
      'produtividade',
      'custo',
    ])
    expect(a.levers.every((l) => l.reachable)).toBe(true)
    expect(a.cellsOk).toBe(31)
    expect(a.cellsTotal).toBe(81)
  })

  it('target 20%: delta % is relative to today', () => {
    const a = must(analyze({ ...cs, targetMargin: 0.2 }))
    const cbot = a.levers.find((l) => l.lever === 'cbot')
    expect(cbot?.deltaPct as number).toBeCloseTo((lever(a, 'cbot') / 1241.25 - 1) * 100, 6)
    const custo = a.levers.find((l) => l.lever === 'custo')
    expect(custo?.deltaPct as number).toBeLessThan(0)
  })

  it('target 20%: each lever value lands the margin on the target', () => {
    const i = { ...cs, targetMargin: 0.2 }
    const a = must(analyze(i))
    for (const l of a.levers) {
      expect(marginWithLever(l.lever, l.value as number, i)).toBeCloseTo(0.2, 6)
    }
  })

  it('target 20%: nearest green cell is dollar +5%, CBOT 0%', () => {
    const a = must(analyze({ ...cs, targetMargin: 0.2 }))
    const m = buildMatrix(soja, today, { ...cs, targetMargin: 0.2 }, opts)
    expect(a.nearest).not.toBeNull()
    const n = a.nearest as { row: number; col: number }
    expect(m.fxPct[n.col]).toBe(5)
    expect(m.cbotPct[n.row]).toBe(0)
  })

  it('target 10%: above, gap 5,5 p.p., levers show how far it can fall', () => {
    const a = must(analyze({ ...cs, targetMargin: 0.1 }))
    expect(a.status).toBe('acima')
    near(a.gapPp as number, 5.5, 0.05)
    near(lever(a, 'preco'), 117.43, 0.01)
    near(lever(a, 'cbot'), 1178, 1)
    near(lever(a, 'dolar'), 5.23, 0.01)
    near(lever(a, 'produtividade'), 56.7, 0.1)
    near(lever(a, 'custo'), 6801, 1)
    expect(a.cellsOk).toBe(51)
    expect(a.cellsTotal - a.cellsOk).toBe(30)
    // Today already meets the target: the nearest green cell is today.
    expect(a.nearest).toEqual({ row: 4, col: 4 })
  })

  it('target 10%: stress table', () => {
    const a = must(analyze({ ...cs, targetMargin: 0.1 }))
    expect(a.stress.map((s) => s.id)).toEqual([
      'cbot-10',
      'dolar-10',
      'prod-10',
      'custo+10',
      'combo',
    ])
    const by = (id: string) => {
      const row = a.stress.find((s) => s.id === id)
      if (!row) throw new Error(id)
      return row
    }
    near((by('cbot-10').marginPct as number) * 100, 4.0, 0.05)
    near((by('dolar-10').marginPct as number) * 100, 3.3, 0.05)
    near((by('prod-10').marginPct as number) * 100, 6.1, 0.05)
    near((by('custo+10').marginPct as number) * 100, 7.1, 0.05)
    expect(by('cbot-10').status).toBe('longe')
    expect(by('dolar-10').status).toBe('longe')
    expect(by('prod-10').status).toBe('perto')
    expect(by('custo+10').status).toBe('perto')
    expect(by('combo').marginPct as number).toBeLessThan(0)
    expect(by('combo').status).toBe('prejuizo')
    for (const s of a.stress) expect(s.label.length).toBeGreaterThan(0)
  })

  it('target equal to today\'s margin is "na-meta"', () => {
    const m = computeResult(soja, today, cs).marginPct as number
    const a = must(analyze({ ...cs, targetMargin: m }))
    expect(a.status).toBe('na-meta')
    expect(a.gapPp as number).toBeCloseTo(0, 6)
  })
})

describe('analyzeTarget: margin base and edge cases', () => {
  it('margin on cost: solves in its own base', () => {
    const i: FarmInputs = { ...cs, marginBase: 'custo', targetMargin: 0.2 }
    const a = must(analyze(i))
    // Today: 125,11 / 105,69 − 1 ≈ 18,4% on cost, so below a 20% target.
    expect(a.status).toBe('abaixo')
    const costSc = 6383.44 / 60.4
    near(lever(a, 'preco'), costSc * 1.2, 0.01)
    for (const l of a.levers) {
      expect(l.reachable).toBe(true)
      expect(marginWithLever(l.lever, l.value as number, i)).toBeCloseTo(0.2, 6)
    }
  })

  it('target 100% on revenue: no lever reaches it, no NaN', () => {
    const a = must(analyze({ ...cs, targetMargin: 1 }))
    expect(a.status).toBe('abaixo')
    expect(Number.isFinite(a.gapPp as number)).toBe(true)
    for (const l of a.levers) {
      expect(l.reachable).toBe(false)
      expect(l.value).toBeNull()
      expect(l.deltaPct).toBeNull()
    }
    for (const s of a.stress) {
      if (s.marginPct !== null) expect(Number.isFinite(s.marginPct)).toBe(true)
    }
    expect(a.cellsOk).toBe(0)
    expect(a.nearest).toBeNull()
  })

  it('target far beyond ±80% bounds is unreachable', () => {
    const a = must(analyze({ ...cs, marginBase: 'custo', targetMargin: 50 }))
    for (const l of a.levers) {
      expect(l.reachable).toBe(false)
      expect(l.value).toBeNull()
    }
  })

  it('unbought US$ cost: dollar lever differs from the BRL-only case and still solves', () => {
    const usd = 300
    const i: FarmInputs = {
      ...cs,
      targetMargin: 0.2,
      costPerHaBrl: 6383.44 - usd * today.fx,
      costUsd: [{ usdPerHa: usd, boughtPct: 0, boughtRate: 0 }],
    }
    // Same margin as the BRL-only case today.
    expect(computeResult(soja, today, i).marginPct as number).toBeCloseTo(
      computeResult(soja, today, cs).marginPct as number,
      10,
    )
    const brl = must(analyze({ ...cs, targetMargin: 0.2 }))
    const a = must(analyze(i))
    const fx = a.levers.find((l) => l.lever === 'dolar')
    expect(fx?.reachable).toBe(true)
    // A higher dollar also raises the US$ cost, so more dollar is needed.
    expect(lever(a, 'dolar')).toBeGreaterThan(lever(brl, 'dolar') + 0.01)
    expect(marginWithLever('dolar', lever(a, 'dolar'), i)).toBeCloseTo(0.2, 6)
    // Cost lever reports the total BRL cost per ha at today's dollar.
    near(lever(a, 'custo'), 6045, 1)
    for (const l of a.levers) {
      expect(marginWithLever(l.lever, l.value as number, i)).toBeCloseTo(0.2, 6)
    }
  })

  it('dollar partly locked: dollar lever needs a bigger move, still solves', () => {
    const i: FarmInputs = { ...cs, targetMargin: 0.2, fxLockPct: 0.5, fxLockRate: 5.4998 }
    const brl = must(analyze({ ...cs, targetMargin: 0.2 }))
    const a = must(analyze(i))
    expect(lever(a, 'dolar')).toBeGreaterThan(lever(brl, 'dolar') + 0.01)
    expect(marginWithLever('dolar', lever(a, 'dolar'), i)).toBeCloseTo(0.2, 6)
  })

  it('dollar fully locked and no US$ cost: dollar lever is unreachable', () => {
    const i: FarmInputs = { ...cs, targetMargin: 0.2, fxLockPct: 1, fxLockRate: 5.4998 }
    const a = must(analyze(i))
    const fx = a.levers.find((l) => l.lever === 'dolar')
    expect(fx?.reachable).toBe(false)
    expect(fx?.value).toBeNull()
    expect(a.levers.find((l) => l.lever === 'cbot')?.reachable).toBe(true)
  })

  it('unusable scenario (no dollar): nothing is NaN', () => {
    const s: Scenario = { ...today, fx: Number.NaN }
    const i = { ...cs, targetMargin: 0.2 }
    const a = analyzeTarget(soja, s, i, buildMatrix(soja, today, i, opts))
    const r = must(a)
    expect(r.gapPp).toBeNull()
    for (const l of r.levers) {
      if (l.value !== null) expect(Number.isFinite(l.value)).toBe(true)
      if (l.deltaPct !== null) expect(Number.isFinite(l.deltaPct)).toBe(true)
    }
    for (const st of r.stress) expect(st.marginPct).toBeNull()
  })

  it('stress rows: non-positive farm price never shows a margin or "meta"', () => {
    const i = { ...cs, freightBrlPerSc: 5000, targetMargin: 0.1 }
    const r = must(analyze(i))
    for (const st of r.stress) {
      expect(st.marginPct).toBeNull()
      expect(st.status).toBe('indefinido')
    }
  })
})
