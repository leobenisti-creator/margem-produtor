import type { CropConfig } from './crops'
import {
  blendedPriceBrl,
  costPerHaAt,
  farmPriceBrl,
  hedgeAt,
  inputsAt,
  inputsAtPrice,
  marginFromPrice,
  type FarmInputs,
  type Scenario,
} from './calc'

/** Default variations, in % of today's value, applied symmetrically on both axes. */
export const DEFAULT_STEPS_PCT = [2.5, 5, 10, 20] as const

export interface MatrixOptions {
  /** Four steps in %, strictly increasing, each in (0, 100). */
  stepsPct: readonly [number, number, number, number]
  /** Yield selector: 0.9 (−10%), 1 (base) or 1.1 (+10%); changes the cost per sack only. */
  yieldFactor: number
  includeSold: boolean
}

export interface Cell {
  cbotUsc: number
  fx: number
  priceBrl: number
  marginPerSc: number | null
  marginPct: number | null
  marginPerHa: number | null
  marginTotal: number | null
  /** R$ result of the market operations for the whole production in this cell (0 without hedge). */
  hedgeBrl: number
  /** Traffic light: 0 red, 1 amber, 2 green; null = unknown margin (neutral, never red or green). */
  tone: Tone
}

/** 0 red, 1 amber, 2 green (engine toneFor); null when the margin is unknown. */
export type Tone = 0 | 1 | 2 | null
/** A known traffic-light colour. */
export type KnownTone = Exclude<Tone, null>

export interface Matrix {
  cbotRows: number[]
  /** Variation of each row from today, in %. */
  cbotPct: number[]
  fxCols: number[]
  /** Variation of each column from today, in %. */
  fxPct: number[]
  cells: Cell[][]
  current: { row: 4; col: 4 }
  /** True when every column gives the same price and cost (dollar fully locked, US$ costs bought). */
  lockedAllFx: boolean
}

export type MatrixView = 'preco' | 'margemHa' | 'margemTotal' | 'margemPct'

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

function checkSteps(steps: readonly number[]): void {
  let prev = 0
  for (const s of steps) {
    if (!Number.isFinite(s) || !(s > prev) || !(s < 100)) {
      throw new RangeError('Matrix steps must be finite, increasing and between 0 and 100%')
    }
    prev = s
  }
}

function axisPct(steps: MatrixOptions['stepsPct']): number[] {
  const [s1, s2, s3, s4] = steps
  return [-s4, -s3, -s2, -s1, 0, s1, s2, s3, s4]
}

/** Axis values: value × (1 + p/100), 4 decimals; the centre is today's value exactly. */
function axis(base: number, pct: number[]): number[] {
  if (!Number.isFinite(base)) throw new RangeError('Base value must be a finite number')
  if (!(base > 0)) throw new RangeError('Base value must be positive')
  return pct.map((p) => (p === 0 ? base : round4(base * (1 + p / 100))))
}

/**
 * Traffic light on the margin % (in the client's chosen base).
 * Without a target: < 0 red; 0 ≤ m < goodMin amber; ≥ goodMin green.
 * With a target: m ≥ target green; m ≥ target − nearPp amber; otherwise red.
 * Unknown margin has no colour: null (shown as a neutral cell).
 */
export function toneFor(
  marginPct: number | null,
  target: number | null,
  goodMin = 0.1,
  nearPp = 0.05,
): Cell['tone'] {
  if (marginPct === null || !Number.isFinite(marginPct)) return null
  // Round to a hundredth of a p.p. first, so 0.20 − 0.05 lands exactly on the band edge.
  const r = (n: number) => Math.round(n * 10000) / 10000
  if (target === null) {
    if (marginPct < 0) return 0
    return r(marginPct - goodMin) >= 0 ? 2 : 1
  }
  const d = r(marginPct - target)
  if (d >= 0) return 2
  if (d >= -r(nearPp)) return 1
  return 0
}

const SAME = 1e-9

function same(a: number, b: number): boolean {
  return Math.abs(a - b) <= SAME * Math.max(1, Math.abs(a), Math.abs(b))
}

export function buildMatrix(
  crop: CropConfig,
  base: Scenario,
  i: FarmInputs,
  o: MatrixOptions,
): Matrix {
  checkSteps(o.stepsPct)
  if (!Number.isFinite(o.yieldFactor) || !(o.yieldFactor > 0)) {
    throw new RangeError('Yield factor must be a positive number')
  }
  const pct = axisPct(o.stepsPct)
  const cbotRows = axis(base.cbotUsc, pct)
  const fxCols = axis(base.fx, pct)
  const scaled: FarmInputs = { ...i, yieldScHa: i.yieldScHa * o.yieldFactor }
  const colInputs = fxCols.map((fx) => inputsAt(scaled, fx))
  const blend = o.includeSold && i.soldPct > 0

  const cells = cbotRows.map((cbotUsc) =>
    fxCols.map((fx, c): Cell => {
      const priceBrl = farmPriceBrl(crop, { ...base, cbotUsc, fx }, colInputs[c])
      // The sc/ha rent is valued at this cell's own farm price.
      const ci = inputsAtPrice(colInputs[c], fx, priceBrl)
      const effective = blend ? blendedPriceBrl(priceBrl, ci) : priceBrl
      const h = hedgeAt(ci, cbotUsc, fx)
      const m = marginFromPrice(h.active && h.perSc !== null ? effective + h.perSc : effective, ci)
      return {
        cbotUsc,
        fx,
        priceBrl,
        marginPerSc: m.marginPerSc,
        marginPct: m.marginPct,
        marginPerHa: m.marginPerHa,
        marginTotal: m.marginTotal,
        hedgeBrl: h.brl,
        tone: toneFor(m.marginPct, i.targetMargin),
      }
    }),
  )

  const costs = fxCols.map((fx) => costPerHaAt(scaled, fx))
  const lockedAllFx =
    costs.every((c) => same(c, costs[0])) &&
    cells.every((row) => row.every((c) => same(c.priceBrl, row[0].priceBrl)))

  return {
    cbotRows,
    cbotPct: pct,
    fxCols,
    fxPct: [...pct],
    cells,
    current: { row: 4, col: 4 },
    lockedAllFx,
  }
}

/**
 * Cells that meet the target (green). Without a target: cells with a known, non-negative margin.
 * Cells with an unknown margin (tone null) never count.
 */
export function okCount(m: Matrix, target: number | null): number {
  return m.cells
    .flat()
    .filter((c) =>
      target === null
        ? c.marginPct !== null && c.marginPct >= 0
        : toneFor(c.marginPct, target) === 2,
    ).length
}

function num(n: number | null, decimals = 2): string {
  return n === null ? '' : n.toFixed(decimals).replace('.', ',')
}

/** Dollar header keeps up to 4 decimals (PTAX has 4), at least 2. */
function fxLabel(fx: number): string {
  return round4(fx).toFixed(4).replace(/0{1,2}$/, '').replace('.', ',')
}

/** "+2,5%", "-20%", "0%". */
function pctLabel(p: number): string {
  const body = (Math.round(Math.abs(p) * 100) / 100).toString().replace('.', ',')
  return `${p > 0 ? '+' : p < 0 ? '-' : ''}${body}%`
}

export function matrixToCsv(m: Matrix, view: MatrixView): string {
  const pick = (c: Cell): string => {
    switch (view) {
      case 'preco':
        return num(c.priceBrl)
      case 'margemHa':
        return num(c.marginPerHa)
      case 'margemTotal':
        return num(c.marginTotal)
      case 'margemPct':
        return num(c.marginPct === null ? null : c.marginPct * 100, 1)
    }
  }
  const header = [
    'CBOT \\ Dólar',
    ...m.fxCols.map((fx, k) => `${fxLabel(fx)} (${pctLabel(m.fxPct[k])})`),
  ].join(';')
  const body = m.cells.map((row, r) =>
    [`${num(m.cbotRows[r])} (${pctLabel(m.cbotPct[r])})`, ...row.map(pick)].join(';'),
  )
  return [header, ...body].join('\n')
}
