import { fmtMoney, fmtNum } from './format'

const fieldFmts = new Map<number, Intl.NumberFormat>()
function fieldFmt(max: number): Intl.NumberFormat {
  let f = fieldFmts.get(max)
  if (!f) {
    f = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: max })
    fieldFmts.set(max, f)
  }
  return f
}

/** Text shown inside an input: pt-BR, up to 2 decimals, no trailing zeros. */
export function fmtField(n: number, maxDecimals = 2): string {
  if (!Number.isFinite(n)) return ''
  return fieldFmt(maxDecimals).format(n).replace(/[  ]/g, ' ')
}

/** Like fmtNum but without forced decimals for whole values ("1.000", "60,4"). */
export function fmtLoose(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—'
  return fmtNum(n, Number.isInteger(n) ? 0 : 2)
}

/** Margin percentage: one decimal below 100% (a target comparison needs it, R25), none from 100%. */
export function fmtMarginPct(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return '—'
  return `${fmtNum(p * 100, Math.abs(p) < 1 ? 1 : 0)}%`
}

/** Money with the sign before the symbol ("−R$ 227"), as pt-BR reads it; `digits` decimals. */
export function fmtSignedMoney(n: number | null, currency: 'BRL' | 'USD', digits = 2): string {
  if (n === null || !Number.isFinite(n)) return '—'
  const sym = currency === 'BRL' ? 'R$' : 'US$'
  const abs = fmtNum(Math.abs(n), digits)
  return `${n < 0 && abs !== fmtNum(0, digits) ? '−' : ''}${sym} ${abs}`
}

/** "R$ 2,80 mi", "R$ 12,5 mil", otherwise the full value. */
export function fmtCompactMoney(n: number | null, currency: 'BRL' | 'USD'): string {
  if (n === null || !Number.isFinite(n)) return '—'
  const sym = currency === 'BRL' ? 'R$' : 'US$'
  const abs = Math.abs(n)
  if (abs >= 1e6) return `${sym} ${fmtNum(n / 1e6, 2)} mi`
  if (abs >= 1e3) return `${sym} ${fmtNum(n / 1e3, 1)} mil`
  return fmtMoney(n, currency)
}
