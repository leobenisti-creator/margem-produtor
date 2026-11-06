import type { RiskDriver } from '../../engine/riskSim'
import { fmtSignedMoney as signedMoney } from '../fmtExtra'
import { fmtNum } from '../format'

export const NAME: Record<RiskDriver, string> = { dolar: 'Dólar', cbot: 'Bolsa (CBOT)', basis: 'Basis' }
/** "E se {the} mexer?" */
export const THE: Record<RiskDriver, string> = { dolar: 'o dólar', cbot: 'a bolsa', basis: 'o basis' }
/** Unit of the slider and of the number next to it. */
export const UNIT_LABEL: Record<RiskDriver, string> = { dolar: '%', cbot: '%', basis: 'R$/sc' }
export const AXIS_LABEL: Record<RiskDriver, string> = {
  dolar: 'Dólar (R$/US$)',
  cbot: 'CBOT (US¢/bu)',
  basis: 'Basis (R$/sc)',
}

export type Currency = 'BRL' | 'USD'

const SYM: Record<Currency, string> = { BRL: 'R$', USD: 'US$' }
const sign = (n: number) => (n < 0 ? '−' : '+')

/** Money formatting in the top currency; `fx` converts the R$ amounts the engines return (today's dollar). */
export interface RiskFmt {
  cur: Currency
  /** R$ to the display currency. */
  conv: (brl: number) => number
  /** "−R$ 12,34" (two decimals). */
  money: (brl: number) => string
  /** "−R$ 47 mil", "R$ 2,10 mi". */
  compact: (brl: number) => string
  /** Like `compact`, always with the sign ("+R$ 47 mil"). */
  signedCompact: (brl: number) => string
  /** Like `money`, always with the sign. */
  signedMoney: (brl: number) => string
}

export function makeFmt(cur: Currency, fx: number): RiskFmt {
  const conv = (brl: number) => (cur === 'USD' ? (fx > 0 ? brl / fx : Number.NaN) : brl)
  const compactOf = (n: number): string => {
    if (!Number.isFinite(n)) return '—'
    const a = Math.abs(n)
    let body: string
    if (a >= 1e6) body = `${SYM[cur]} ${fmtNum(a / 1e6, 2)} mi`
    else if (a >= 1e3) body = `${SYM[cur]} ${fmtNum(a / 1e3, a >= 1e4 ? 0 : 1)} mil`
    else body = `${SYM[cur]} ${fmtNum(a, 0)}`
    return a < 0.5 ? body : `${n < 0 ? '−' : ''}${body}`
  }
  const compact = (brl: number) => compactOf(conv(brl))
  return {
    cur,
    conv,
    money: (brl) => signedMoney(conv(brl), cur, 2),
    compact,
    signedCompact: (brl) => {
      const n = conv(brl)
      if (!Number.isFinite(n)) return '—'
      const c = compactOf(Math.abs(n))
      return Math.abs(n) < 0.5 ? c : `${sign(n)}${c}`
    },
    signedMoney: (brl) => {
      const n = conv(brl)
      if (!Number.isFinite(n)) return '—'
      return Math.abs(n) < 0.005 ? signedMoney(0, cur, 2) : `${sign(n)}${signedMoney(Math.abs(n), cur, 2)}`
    },
  }
}

/** The driver's absolute level as the producer reads it: "R$ 5,50", "1.241 US¢/bu", "−R$ 56,52/sc". */
export function levelText(d: RiskDriver, level: number | null): string {
  if (level === null || !Number.isFinite(level)) return '—'
  if (d === 'dolar') return `R$ ${fmtNum(level, 2)}`
  if (d === 'cbot') return `${fmtNum(level, 0)} US¢/bu`
  return `${signedMoney(level, 'BRL', 2)}/sc`
}

/** Shorter level for axis ticks: "5,50", "1.241", "−56,5". */
export function tickText(d: RiskDriver, level: number): string {
  if (d === 'dolar') return fmtNum(level, 2)
  if (d === 'cbot') return fmtNum(level, 0)
  return fmtNum(level, 1)
}

/** A move from today: "+5,0%" or "−R$ 2,00/sc". */
export function moveText(d: RiskDriver, move: number): string {
  if (d === 'basis') return `${sign(move)}R$ ${fmtNum(Math.abs(move), 2)}/sc`
  return `${sign(move)}${fmtNum(Math.abs(move), 1)}%`
}

/** A share of the revenue or cost: "12,3%", "−4,0%"; "—" when unknown. */
export function pctText(p: number | null, digits = 1): string {
  if (p === null || !Number.isFinite(p)) return '—'
  return `${p < 0 ? '−' : ''}${fmtNum(Math.abs(p) * 100, digits)}%`
}
