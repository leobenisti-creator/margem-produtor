import type { CropId } from './crops'

/** One settlement of a market on a trading day. */
export interface DailyPoint {
  /** ISO date (YYYY-MM-DD). */
  date: string
  /** CBOT in US¢/bu; dollar in R$/US$. */
  settle: number
}

/** Daily settlement history the operations are checked against (barriers, fixings, expiry). Comes from the data API. */
export interface MarketHistory {
  /** CBOT settle (US¢/bu) per crop. */
  cbotUsc?: Partial<Record<CropId, DailyPoint[]>>
  /** Dollar (R$/US$) per day. */
  fx?: DailyPoint[]
}

/** A settle older than this many days is not used for a later date (a missing stretch of history, not a weekend). */
export const MAX_GAP_DAYS = 7

const dayDiff = (a: string, b: string): number =>
  (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000

/** Settle of exactly `date`, or null. */
export function exactSettle(series: DailyPoint[] | undefined, date: string): number | null {
  if (!series) return null
  const p = series.find((x) => x.date === date)
  return p && Number.isFinite(p.settle) && p.settle > 0 ? p.settle : null
}

/** Settle of `date`, else the last one before it (at most MAX_GAP_DAYS earlier); null without data. */
export function settleAt(series: DailyPoint[] | undefined, date: string): number | null {
  if (!series) return null
  let best: DailyPoint | null = null
  for (const p of series) {
    if (p.date > date || !Number.isFinite(p.settle) || !(p.settle > 0)) continue
    if (best === null || p.date > best.date) best = p
  }
  return best !== null && dayDiff(date, best.date) <= MAX_GAP_DAYS ? best.settle : null
}

export type BarrierDir = 'alta' | 'baixa'

/**
 * First date in [from, to] whose settle reaches the barrier (alta: settle >= price; baixa: settle <= price);
 * null when none, or when there is no history for the stretch.
 */
export function firstCross(
  series: DailyPoint[] | undefined,
  from: string,
  to: string,
  dir: BarrierDir,
  price: number,
): string | null {
  if (!series) return null
  let found: string | null = null
  for (const p of series) {
    if (p.date < from || p.date > to || !Number.isFinite(p.settle) || !(p.settle > 0)) continue
    const hit = dir === 'alta' ? p.settle >= price : p.settle <= price
    if (hit && (found === null || p.date < found)) found = p.date
  }
  return found
}

/** True when the series has at least one point in [from, to] (so "no crossing" really means "did not cross"). */
export function hasDataBetween(series: DailyPoint[] | undefined, from: string, to: string): boolean {
  return !!series && series.some((p) => p.date >= from && p.date <= to)
}
