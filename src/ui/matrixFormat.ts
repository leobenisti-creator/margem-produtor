import type { Cell, MatrixView, Tone } from '../engine/matrix'
import { brlToUsd } from '../engine/units'
import { fmtNum } from './format'
import { fmtField, fmtMarginPct } from './fmtExtra'

export type Currency = 'BRL' | 'USD'

const fxFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })

/** Dollar header/label: pt-BR, 2 to 4 decimals ("5,50", "5,4998"). */
export function fmtFx(fx: number): string {
  return fxFmt.format(fx).replace(/[  ]/g, ' ')
}

export const symbol = (c: Currency) => (c === 'BRL' ? 'R$' : 'US$')

/** Money in the display currency, converted at the given (cell) dollar. Null prints a dash. */
export function cellMoney(brl: number | null, fx: number, c: Currency): number | null {
  if (brl === null || !Number.isFinite(brl)) return null
  return c === 'USD' && fx > 0 ? brlToUsd(brl, fx) : brl
}

export function moneyText(brl: number | null, fx: number, c: Currency): string {
  return fmtNum(cellMoney(brl, fx, c), 2)
}

function compact(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e6) return `${fmtNum(n / 1e6, 2)} mi`
  if (abs >= 1e3) return `${fmtNum(n / 1e3, 1)} mil`
  return fmtNum(n, 0)
}

export function viewLabel(view: MatrixView, c: Currency): string {
  switch (view) {
    case 'preco':
      return `Preço ${symbol(c)}/sc`
    case 'margemHa':
      return `Margem ${symbol(c)}/ha`
    case 'margemTotal':
      return 'Margem total'
    case 'margemPct':
      return 'Margem %'
  }
}

/** Integer money for the secondary line ("1.173", "−227"): cents are noise in a cell (P2-4). */
function intText(brl: number | null, fx: number, c: Currency): string {
  const v = cellMoney(brl, fx, c)
  if (v === null) return '—'
  const r = Math.round(v)
  return `${r < 0 ? '−' : ''}${fmtNum(Math.abs(r), 0)}`
}

/**
 * Main value, the secondary line (margin % + one rounded value) and the compact line shown
 * below `sm` (one value only).
 */
export function cellTexts(
  cell: Cell,
  view: MatrixView,
  c: Currency,
): { main: string; sub: string; subCompact: string } {
  const money = (v: number | null) => moneyText(v, cell.fx, c)
  const pct = fmtMarginPct(cell.marginPct)
  const ha = `${intText(cell.marginPerHa, cell.fx, c)}/ha`
  const price = `${intText(cell.priceBrl, cell.fx, c)}/sc`
  switch (view) {
    case 'preco':
      return { main: money(cell.priceBrl), sub: `${pct} · ${ha}`, subCompact: pct }
    case 'margemHa':
      return { main: money(cell.marginPerHa), sub: `${pct} · ${price}`, subCompact: pct }
    case 'margemTotal':
      return { main: compact(cellMoney(cell.marginTotal, cell.fx, c)), sub: `${pct} · ${ha}`, subCompact: pct }
    case 'margemPct':
      return { main: pct, sub: `${ha} · ${price}`, subCompact: ha }
  }
}

/** Axis variation: "+2,5%", "−20%" (true minus sign), "0%". */
export function fmtAxisPct(p: number): string {
  if (!Number.isFinite(p)) return '—'
  const r = Math.round(p * 100) / 100
  const body = fmtField(Math.abs(r), 2)
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${body}%`
}

/** Said of a cell whose margin is unknown (no colour). */
export const UNKNOWN_MARGIN = 'margem indisponível'

/** Plain-language situation of a cell, by the same rule as the colour (engine/matrix toneFor). */
export function toneSituation(tone: Tone, target: number | null): string {
  if (tone === null) return UNKNOWN_MARGIN
  if (target === null) return ['margem negativa', 'margem baixa', 'margem boa'][tone]
  return ['mais de 5 p.p. abaixo da meta', 'até 5 p.p. abaixo da meta', 'bate a meta'][tone]
}

/**
 * Share (0..1) of today's cost per ha (R$ fixed part + US$ lines at today's dollar) that is already
 * bought at a locked dollar. Null when the cost is not positive or the dollar is unusable.
 */
export function lockedCostShare(
  i: { costPerHaBrl: number; costUsd: { usdPerHa: number; boughtPct: number; boughtRate: number }[] },
  fx: number,
): number | null {
  if (!(Number.isFinite(fx) && fx > 0)) return null
  let locked = 0
  let total = i.costPerHaBrl
  for (const l of i.costUsd) {
    locked += l.usdPerHa * l.boughtPct * l.boughtRate
    total += l.usdPerHa * (l.boughtPct * l.boughtRate + (1 - l.boughtPct) * fx)
  }
  return total > 0 && Number.isFinite(locked / total) ? locked / total : null
}

export interface CellContext {
  cbotPct: number
  fxPct: number
  situation: string
}

const axisNote = (p: number) => (p === 0 ? ' (hoje)' : ` (${fmtAxisPct(p)})`)

export function cellAriaLabel(
  cell: Cell,
  c: Currency,
  view: MatrixView = 'preco',
  ctx?: CellContext,
): string {
  const money = (v: number | null) => `${symbol(c)} ${moneyText(v, cell.fx, c)}`
  const lead =
    view === 'margemHa'
      ? `margem ${money(cell.marginPerHa)} por hectare; `
      : view === 'margemTotal'
        ? `margem total ${money(cell.marginTotal)}; `
        : view === 'margemPct'
          ? `margem ${fmtMarginPct(cell.marginPct)}, `
          : ''
  return (
    lead +
    `CBOT ${fmtNum(cell.cbotUsc, 2)}${ctx ? axisNote(ctx.cbotPct) : ''}, ` +
    `dólar ${fmtFx(cell.fx)}${ctx ? axisNote(ctx.fxPct) : ''}: ` +
    `preço ${symbol(c)} ${moneyText(cell.priceBrl, cell.fx, c)} por saca, ` +
    `margem ${fmtMarginPct(cell.marginPct)}` +
    (ctx ? `; ${ctx.situation}` : '')
  )
}

const round4 = (n: number) => Math.round(n * 10000) / 10000
export const sameAxisValue = (a: number, b: number) => Math.abs(round4(a) - round4(b)) < 1e-9
