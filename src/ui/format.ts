const clean = (s: string) => s.replace(/[  ]/g, ' ')

function valid(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

const nf = (digits: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })

export function fmtNum(n: number | null, digits = 2): string {
  if (!valid(n)) return '—'
  const out = clean(nf(digits).format(n))
  return /^-0(,0+)?$/.test(out) ? out.slice(1) : out
}

export function fmtBrl(n: number | null): string {
  return valid(n) ? `R$ ${fmtNum(n, 2)}` : '—'
}

export function fmtUsd(n: number | null): string {
  return valid(n) ? `US$ ${fmtNum(n, 2)}` : '—'
}

/** `n` is a fraction: 0.4 becomes "40%". */
export function fmtPct(n: number | null, digits = 0): string {
  return valid(n) ? `${fmtNum(n * 100, digits)}%` : '—'
}

export function fmtMoney(n: number | null, currency: 'BRL' | 'USD'): string {
  return currency === 'BRL' ? fmtBrl(n) : fmtUsd(n)
}

/** ISO YYYY-MM-DD to dd/mm/aaaa. */
export function fmtDateBr(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/** ISO YYYY-MM-DD to dd/mm. */
export function fmtDayMonth(iso: string): string {
  const full = fmtDateBr(iso)
  return full === '—' ? full : full.slice(0, 5)
}
