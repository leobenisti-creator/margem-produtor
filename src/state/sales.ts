import { CROPS } from '../engine/crops'
import { productionOf } from '../engine/production'
import { soldSummary, trancheSc, type SaleTranche } from '../engine/sales'
import type { AppState } from './types'

const isNonNeg = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/** Applies a typed patch to a tranche; null when any field is invalid (the action is then rejected). */
export function applySalePatch(cur: SaleTranche, p: unknown): SaleTranche | null {
  if (typeof p !== 'object' || p === null || Array.isArray(p)) return null
  const q = p as Record<string, unknown>
  const next: SaleTranche = { ...cur }
  if (q.volume !== undefined) {
    if (!isNonNeg(q.volume)) return null
    next.volume = q.volume
  }
  if (q.volumeUnit !== undefined) {
    if (q.volumeUnit !== 't' && q.volumeUnit !== 'sc' && q.volumeUnit !== 'bu') return null
    next.volumeUnit = q.volumeUnit
  }
  if (q.price !== undefined) {
    if (!isNonNeg(q.price)) return null
    next.price = q.price
  }
  if (q.priceCurrency !== undefined) {
    if (q.priceCurrency !== 'BRL' && q.priceCurrency !== 'USD') return null
    next.priceCurrency = q.priceCurrency
  }
  if (q.dollar !== undefined) {
    if (q.dollar !== null && !(isNonNeg(q.dollar) && q.dollar > 0)) return null
    next.dollar = q.dollar
  }
  if (q.marketDollar !== undefined) {
    if (q.marketDollar !== null && !(isNonNeg(q.marketDollar) && q.marketDollar > 0)) return null
    next.marketDollar = q.marketDollar
  }
  if (q.saved !== undefined) {
    if (typeof q.saved !== 'boolean') return null
    if (q.saved) delete next.saved
    else next.saved = false
  }
  return next
}

/** "venda-N" with N above every id in use (deterministic, so the reducer stays pure). */
export function nextSaleId(sales: SaleTranche[]): string {
  let n = sales.length
  for (const s of sales) {
    const m = /^venda-(\d+)$/.exec(s.id)
    if (m) n = Math.max(n, Number(m[1]))
  }
  return `venda-${n + 1}`
}

export const EMPTY_SALE: Omit<SaleTranche, 'id'> = {
  volume: 0,
  volumeUnit: 'sc',
  price: 0,
  priceCurrency: 'BRL',
  dollar: null,
  marketDollar: null,
}

/** Production used by the tranches: the NET production (area × yield less the barter); null when not usable. */
export function salesProductionSc(state: Pick<AppState, 'inputs'>): number | null {
  const p = productionOf(state.inputs)
  return Number.isFinite(p) && p >= 0 ? p : null
}

/**
 * Sacks of the production that the OTHER tranches leave free (never below 0): the most the tranche `id` can hold.
 * null when the production is unknown or 0 (nothing to compare against).
 */
export function saleRoomSc(
  sales: SaleTranche[],
  id: string,
  productionSc: number | null,
  bushelsPerSack: number,
): number | null {
  if (productionSc === null || !(productionSc > 0)) return null
  const others = sales.reduce((s, t) => (t.id === id ? s : s + trancheSc(t, bushelsPerSack)), 0)
  return Math.max(0, productionSc - others)
}

/** The tranche at `idx` cut down to what the production still allows (the sales never pass 100%). */
export function capSale(state: Pick<AppState, 'inputs' | 'crop'>, sales: SaleTranche[], idx: number): SaleTranche[] {
  const bps = CROPS[state.crop].bushelsPerSack
  const t = sales[idx]
  const room = saleRoomSc(sales, t.id, salesProductionSc(state), bps)
  const sc = trancheSc(t, bps)
  if (room === null || sc <= room + 1e-9) return sales
  const next = [...sales]
  const volume = t.volumeUnit === 'sc' ? room : t.volume * (room / sc)
  next[idx] = { ...t, volume: Math.floor(volume * 100) / 100 }
  return next
}

/**
 * Puts the effective sold % / average price into `inputs`: derived from the valid tranches when there
 * is at least one, otherwise the typed (manual) values. Returns the same state when nothing changes.
 */
export function syncSales(state: AppState): AppState {
  const sum = soldSummary(state.sales, salesProductionSc(state), CROPS[state.crop].bushelsPerSack)
  const derived = sum.validTranches.length > 0 && sum.avgPriceBrl !== null
  const soldPct = derived ? sum.soldPct : state.soldManual.soldPct
  const soldAvgPriceBrl = derived ? (sum.avgPriceBrl as number) : state.soldManual.soldAvgPriceBrl
  if (state.inputs.soldPct === soldPct && state.inputs.soldAvgPriceBrl === soldAvgPriceBrl) return state
  return { ...state, inputs: { ...state.inputs, soldPct, soldAvgPriceBrl } }
}

/** Strict check of a stored tranche (persistence): US$ needs its dollar. */
export function isStoredTranche(v: unknown): v is SaleTranche {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const t = v as Record<string, unknown>
  if (typeof t.id !== 'string' || t.id === '') return false
  if (!isNonNeg(t.volume) || !isNonNeg(t.price)) return false
  if (t.volumeUnit !== 't' && t.volumeUnit !== 'sc' && t.volumeUnit !== 'bu') return false
  if (t.priceCurrency !== 'BRL' && t.priceCurrency !== 'USD') return false
  if (t.dollar !== null && !(isNonNeg(t.dollar) && t.dollar > 0)) return false
  if (t.marketDollar !== undefined && t.marketDollar !== null && !(isNonNeg(t.marketDollar) && t.marketDollar > 0))
    return false
  if (t.priceCurrency === 'USD' && t.dollar === null && !(typeof t.marketDollar === 'number' && t.marketDollar > 0))
    return false
  return true
}
