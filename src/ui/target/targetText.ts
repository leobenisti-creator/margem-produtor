import type { LeverRow, ReportLever, StressStatus, TargetReport } from '../../engine/targetReport'
import { fmtNum } from '../format'

/** Money in the top currency, as the producer reads it. All take R$ (the engines' unit). */
export interface Money {
  /** "R$ 12,34" (digits decimals); "—" when unknown. */
  brl: (n: number | null, digits?: number) => string
  /** "−R$ 12,34": with the sign of the number. */
  signed: (n: number | null, digits?: number) => string
  /** "R$ 2,80 mi", "R$ 12,5 mil". */
  compact: (n: number | null) => string
}

/** "+3,2 p.p." / "−1,0 p.p." (the value already in percentage points). */
export const signedPp = (pp: number) => `${pp < 0 ? '−' : '+'}${fmtNum(Math.abs(pp), 1)} p.p.`
/** "+3,2%" / "−1,0%" (the value already in %). */
export const signedPct = (pct: number) => `${pct < 0 ? '−' : '+'}${fmtNum(Math.abs(pct), 1)}%`
/** A fraction as a margin: "31,9%". */
export const pct1 = (p: number | null) => (p === null || !Number.isFinite(p) ? '—' : `${fmtNum(p * 100, 1)}%`)

export const LEVER_NAME: Record<ReportLever, string> = {
  basis: 'Basis',
  cbot: 'CBOT',
  dolar: 'Dólar',
  custo: 'Custo',
}

/** A lever's own value as a number with its unit. */
export function leverValue(lever: ReportLever, v: number | null, m: Money): string {
  if (v === null || !Number.isFinite(v)) return '—'
  switch (lever) {
    case 'basis':
      return `${m.brl(v)}/sc`
    case 'cbot':
      return `${fmtNum(v, 0)} US¢/bu`
    case 'dolar':
      return `R$ ${fmtNum(v, 2)}`
    case 'custo':
      return `${m.brl(v, 0)}/ha`
  }
}

export const STATUS_TEXT: Record<StressStatus, string> = {
  meta: 'na meta',
  perto: 'perto da meta',
  longe: 'longe da meta',
  prejuizo: 'prejuízo',
  indefinido: 'indefinido',
}

const base = (r: TargetReport) => (r.base === 'custo' ? 'do custo' : 'da receita')

/** The headline of the verdict. */
export function verdictTitle(r: TargetReport): string {
  const v = r.verdict
  if (v.gapPp === null) return 'Margem não calculada'
  if (v.status === 'na-meta') return 'Você está exatamente na meta'
  return `Você está ${fmtNum(v.gapPp, 1)} p.p. ${v.status === 'abaixo' ? 'abaixo' : 'acima'} da meta`
}

/** How far a factor moves, as the table writes it: "+23,6%" for CBOT, dollar and cost, "+R$ 22,40/sc" for the basis. */
export function moveText(l: LeverRow, key: 'toTarget' | 'toZero', m: Money): string {
  const x = l[key]
  if (x.deltaPct !== null) return signedPct(x.deltaPct)
  return x.delta === null ? '' : `${m.signed(x.delta)}/sc`
}

/** The levers that can be reached alone, the closest to the scenario first (the smallest relative move). */
export function reachable(levers: LeverRow[], key: 'toTarget' | 'toZero' = 'toTarget'): LeverRow[] {
  return levers
    .filter((l) => l[key].reachable && l[key].rel !== null)
    .sort((a, z) => Math.abs(a[key].rel as number) - Math.abs(z[key].rel as number))
}

/** "Em resumo": the plain-language reading of the report, one sentence each. */
export function summaryBullets(r: TargetReport, m: Money): string[] {
  const out: string[] = []
  const v = r.verdict
  const t = `${fmtNum(r.target * 100, 1)}%`

  // 1 · the verdict, in money
  if (v.marginPct !== null) {
    const margin = `${pct1(v.marginPct)} ${base(r)}`
    if (v.status === 'na-meta') out.push(`Sua margem é de ${margin}, exatamente a meta de ${t}.`)
    else if (v.status === 'acima')
      out.push(
        `Sua margem é de ${margin}, ${fmtNum(v.gapPp ?? 0, 1)} p.p. acima da meta de ${t}: sobram ${m.compact(v.slackTotal)} (${m.brl(v.slackPerSc)}/sc) sobre o que a meta pede.`,
      )
    else
      out.push(
        `Sua margem é de ${margin}, ${fmtNum(v.gapPp ?? 0, 1)} p.p. abaixo da meta de ${t}: faltam ${m.compact(-v.slackTotal)} (${m.brl(-v.slackPerSc)}/sc) para chegar nela.`,
      )
  }

  // 2 · prices
  const { farmPrice, minPrice } = r.prices
  if (farmPrice !== null && minPrice !== null) {
    const d = farmPrice - minPrice
    out.push(
      `O preço mínimo para fechar a meta é ${m.brl(minPrice)}/sc e o preço na fazenda hoje é ${m.brl(farmPrice)}/sc (${d >= 0 ? 'folga' : 'faltam'} ${m.brl(Math.abs(d))}/sc).`,
    )
  }

  // 3 · the lever that decides it
  const near = reachable(r.levers)[0]
  if (near && near.toTarget.value !== null) {
    const name = LEVER_NAME[near.lever].toLowerCase()
    const at = `${leverValue(near.lever, near.toTarget.value, m)} (${moveText(near, 'toTarget', m)} sobre hoje)`
    out.push(
      v.status === 'abaixo'
        ? `A mudança mais curta até a meta: ${name} em ${at}, mantendo o resto.`
        : `O fator mais perto de te tirar da meta é ${name}: sozinho, em ${at}, a margem chega à meta.`,
    )
  }

  // 4 · the grid
  if (r.grid) {
    const g = r.grid
    out.push(
      `Das ${g.total} combinações de CBOT e dólar da matriz, ${g.green} batem a meta, ${g.amber} ficam até 5 p.p. abaixo e ${g.red} ficam mais abaixo.`,
    )
  }

  // 5 · what weighs the most
  const top = r.sensitivity[0]
  if (top && top.swingPp > 0)
    out.push(`O que mais pesa na margem é ${top.label.toLowerCase()}: cada 10% a mais ou a menos mexe cerca de ${fmtNum(top.swingPp / 2, 1)} p.p.`)

  // 6 · the combined stress
  const combo = r.stress.find((s) => s.id === 'combo')
  if (combo && combo.marginPct !== null)
    out.push(
      `Se vierem juntos CBOT −10%, dólar −5% e basis −R$ 3/sc, a margem vai para ${pct1(combo.marginPct)}: ${STATUS_TEXT[combo.status]}.`,
    )

  // 7 · sales and operations
  if (r.sales) {
    const s = r.sales
    const avg = s.avgPriceBrl === null ? '' : `, a ${m.brl(s.avgPriceBrl)}/sc em média`
    const vs =
      s.belowMinSc > 0
        ? `; ${fmtNum(s.belowMinSc, 0)} sc foram vendidas abaixo do preço mínimo da meta`
        : s.aboveMinSc > 0
          ? '; tudo foi vendido acima do preço mínimo da meta'
          : ''
    out.push(`Você já vendeu ${fmtNum(s.soldPct * 100, 0)}% da safra${avg}${vs}.`)
  }
  if (r.hedge && r.hedge.pctWithout !== null && r.hedge.gapWithoutPp !== null) {
    out.push(
      `As operações em bolsa dão ${m.signed(r.hedge.brl, 0)}; sem elas a margem seria ${pct1(r.hedge.pctWithout)} (${signedPp(r.hedge.gapWithoutPp)} da meta).`,
    )
  }
  return out
}

export interface Actions {
  /** What the producer controls (the price he sells at, the cost, the yield). */
  hands: string[]
  /** What depends on the market (CBOT, dollar). */
  market: string[]
  /** "Para chegar à meta" or "Para proteger a meta". */
  title: string
}

/** What to do about the target: below it, the way there; on or above it, what to protect. */
export function actions(r: TargetReport, m: Money): Actions {
  const below = r.verdict.status === 'abaixo'
  const hands: string[] = []
  const market: string[] = []
  const at = (l: ReportLever) => {
    const x = r.levers.find((y) => y.lever === l)
    return x && x.toTarget.reachable && x.toTarget.value !== null ? x : null
  }
  const text = (l: ReportLever, x: LeverRow) => {
    const val = leverValue(l, x.toTarget.value, m)
    const d = moveText(x, 'toTarget', m)
    if (l === 'custo') return below ? `Reduzir o custo para ${val} (${d}).` : `O custo pode subir até ${val} (${d}) antes de tirar você da meta.`
    if (l === 'basis') return below ? `Basis em ${val} (${d}), mantendo CBOT e dólar de hoje.` : `O basis aguenta até ${val} (${d}) com CBOT e dólar de hoje.`
    if (l === 'cbot') return below ? `CBOT em ${val} (${d}), com o dólar de hoje.` : `A CBOT aguenta até ${val} (${d}) com o dólar de hoje.`
    return below ? `Dólar em ${val} (${d}), com a CBOT de hoje.` : `O dólar aguenta até ${val} (${d}) com a CBOT de hoje.`
  }
  const cost = at('custo')
  if (cost) hands.push(text('custo', cost))
  if (r.prices.unsoldNeeded !== null && r.prices.unsoldSc > 0) {
    hands.push(
      below
        ? `As ${fmtNum(r.prices.unsoldSc, 0)} sc ainda sem venda precisam sair a ${m.brl(r.prices.unsoldNeeded)}/sc ou mais para fechar a meta.`
        : `As ${fmtNum(r.prices.unsoldSc, 0)} sc ainda sem venda mantêm a meta se saírem a ${m.brl(r.prices.unsoldNeeded)}/sc ou mais.`,
    )
  } else if (r.prices.minPrice !== null) {
    hands.push(`Venda a partir de ${m.brl(r.prices.minPrice)}/sc para garantir a meta.`)
  }
  for (const l of ['basis', 'cbot', 'dolar'] as const) {
    const x = at(l)
    if (x) market.push(text(l, x))
  }
  return { hands, market, title: below ? 'Para chegar à meta' : 'Para proteger a meta' }
}
