import { CROPS } from './crops'
import { SACK_TON } from './units'

/** One sale already made: a volume (t or sc) at a price per sack (R$ or US$ at its own dollar). */
export interface SaleTranche {
  id: string
  volume: number
  volumeUnit: 't' | 'sc' | 'bu'
  /** Price per 60 kg sack, in `priceCurrency`. */
  price: number
  priceCurrency: 'BRL' | 'USD'
  /** R$/US$ typed for this sale (> 0); null/empty means "use the market dollar". Ignored for R$. */
  dollar: number | null
  /** Market dollar saved when the sale went to US$: the dollar used while `dollar` is empty. */
  marketDollar?: number | null
  /**
   * false = reported but not saved yet: it counts in the numbers while the app is open, but is not written to the
   * browser, so it is gone on the next visit. Absent or true = saved.
   */
  saved?: boolean
}

export interface SoldSummary {
  validTranches: SaleTranche[]
  /** Sacks sold by the valid tranches (may exceed the production). */
  soldSc: number
  /** soldSc / production, capped at 1; 0 when the production is unknown or 0. */
  soldPct: number
  /** Volume-weighted R$/sc of the valid tranches; null when there is none. */
  avgPriceBrl: number | null
  /** Sold more than the production: a warning, not an error. */
  overProduction: boolean
  invalid: { id: string; reason: string }[]
}

const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0

/** Sacks of a tranche: t ÷ SACK_TON, bushels ÷ bushels per sack of the crop, sc as is. */
export function trancheSc(t: SaleTranche, bushelsPerSack: number = CROPS.soja.bushelsPerSack): number {
  if (t.volumeUnit === 't') return t.volume / SACK_TON
  if (t.volumeUnit === 'bu') return t.volume / bushelsPerSack
  return t.volume
}

/** The dollar of a US$ sale: the one typed, else the market dollar saved with it; null when neither. */
export function trancheDollar(t: SaleTranche): number | null {
  if (positive(t.dollar)) return t.dollar
  return positive(t.marketDollar) ? t.marketDollar : null
}

/** R$/sc of a tranche (US$ × its dollar); null when it cannot be valued. */
export function tranchePriceBrl(t: SaleTranche): number | null {
  if (!positive(t.price)) return null
  if (t.priceCurrency === 'BRL') return t.price
  const dollar = trancheDollar(t)
  return dollar === null ? null : t.price * dollar
}

/**
 * R$/sc of a tranche at a scenario dollar: R$ and US$ with a typed dollar are fixed; a US$ sale with the dollar left
 * open follows the scenario dollar (the dollar saved with it is only a fallback to show a price while typing).
 */
export function trancheBrlAt(t: SaleTranche, fx: number): number | null {
  if (!positive(t.price)) return null
  if (t.priceCurrency === 'BRL') return t.price
  if (positive(t.dollar)) return t.price * t.dollar
  return trancheDollar(t) === null || !positive(fx) ? null : t.price * fx
}

/** Volume-weighted R$/sc of the valid tranches at a scenario dollar; null when there is none. */
export function soldAvgPriceAt(tranches: SaleTranche[], fx: number, bushelsPerSack: number): number | null {
  let sc = 0
  let brl = 0
  for (const t of tranches) {
    if (trancheProblem(t) !== null) continue
    const p = trancheBrlAt(t, fx)
    if (p === null) return null
    const s = trancheSc(t, bushelsPerSack)
    sc += s
    brl += s * p
  }
  return sc > 0 && Number.isFinite(brl) ? brl / sc : null
}

/** pt-BR reason why a tranche cannot enter the sum, or null when it is valid. */
export function trancheProblem(t: SaleTranche): string | null {
  if (!positive(t.volume)) return 'Informe um volume maior que zero.'
  if (!positive(t.price)) return 'Informe um preço maior que zero.'
  if (t.priceCurrency === 'USD' && trancheDollar(t) === null)
    return 'Venda em US$: informe o dólar desta venda (maior que zero).'
  return null
}

export function soldSummary(
  tranches: SaleTranche[],
  productionSc: number | null,
  bushelsPerSack: number = CROPS.soja.bushelsPerSack,
): SoldSummary {
  const validTranches: SaleTranche[] = []
  const invalid: { id: string; reason: string }[] = []
  let soldSc = 0
  let totalBrl = 0
  for (const t of tranches) {
    const reason = trancheProblem(t)
    if (reason) {
      invalid.push({ id: t.id, reason })
      continue
    }
    const sc = trancheSc(t, bushelsPerSack)
    validTranches.push(t)
    soldSc += sc
    totalBrl += sc * (tranchePriceBrl(t) as number)
  }
  const avgPriceBrl = soldSc > 0 && Number.isFinite(totalBrl) ? totalBrl / soldSc : null
  const hasProduction = typeof productionSc === 'number' && Number.isFinite(productionSc) && productionSc >= 0
  const soldPct = hasProduction && productionSc > 0 ? Math.min(1, soldSc / productionSc) : 0
  // Only a real production (> 0) can be exceeded; without one the UI asks for area and yield instead.
  const overProduction = hasProduction && productionSc > 0 && soldSc > productionSc
  return { validTranches, soldSc, soldPct, avgPriceBrl, overProduction, invalid }
}
