import { fixingDates, isIsoDate, isYearMonth } from '../engine/calendar'
import { CROPS } from '../engine/crops'
import { HEDGE_ASSETS, HEDGE_KINDS, HEDGE_SIDES, isAccum, isBarrier, lotSizeOf, type HedgeOp } from '../engine/hedge'

const isNonNeg = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/** Applies a typed patch to an operation; null when any field is invalid (the action is then rejected). */
export function applyHedgePatch(cur: HedgeOp, p: unknown): HedgeOp | null {
  if (typeof p !== 'object' || p === null || Array.isArray(p)) return null
  const q = p as Record<string, unknown>
  const next: HedgeOp = { ...cur }
  if (q.asset !== undefined) {
    if (!HEDGE_ASSETS.includes(q.asset as never)) return null
    next.asset = q.asset as HedgeOp['asset']
  }
  if (q.kind !== undefined) {
    if (!HEDGE_KINDS.includes(q.kind as never)) return null
    next.kind = q.kind as HedgeOp['kind']
  }
  if (q.side !== undefined) {
    if (!HEDGE_SIDES.includes(q.side as never)) return null
    next.side = q.side as HedgeOp['side']
  }
  for (const k of ['qty', 'strike', 'premium'] as const) {
    if (q[k] !== undefined) {
      if (!isNonNeg(q[k])) return null
      next[k] = q[k] as number
    }
  }
  if (q.fxFixed !== undefined) {
    if (q.fxFixed !== null && !(isNonNeg(q.fxFixed) && q.fxFixed > 0)) return null
    next.fxFixed = q.fxFixed
  }
  if (q.lotSize !== undefined) {
    if (q.lotSize === null) delete next.lotSize
    else if (isNonNeg(q.lotSize) && q.lotSize > 0) next.lotSize = q.lotSize
    else return null
  }
  for (const k of ['closePrice', 'costBrl', 'floorLevel'] as const) {
    if (q[k] === undefined) continue
    if (q[k] === null) delete next[k]
    else if (isNonNeg(q[k])) next[k] = q[k] as number
    else return null
  }
  if (q.premiumDir !== undefined) {
    if (q.premiumDir === null) delete next.premiumDir
    else if (q.premiumDir === 'pago' || q.premiumDir === 'recebido') next.premiumDir = q.premiumDir
    else return null
  }
  if (q.closeValueUsd !== undefined) {
    if (q.closeValueUsd === null) delete next.closeValueUsd
    else if (typeof q.closeValueUsd === 'number' && Number.isFinite(q.closeValueUsd))
      next.closeValueUsd = q.closeValueUsd
    else return null
  }
  if (q.contract !== undefined) {
    if (q.contract === null || q.contract === '') delete next.contract
    else if (typeof q.contract === 'string' && q.contract.length <= 24) next.contract = q.contract
    else return null
  }
  for (const k of ['startDate', 'maturityDate', 'closedDate', 'barrierHitDate'] as const) {
    if (q[k] === undefined) continue
    if (q[k] === null || q[k] === '') delete next[k]
    else if (isIsoDate(q[k])) next[k] = q[k] as string
    else return null
  }
  if (q.saved !== undefined) {
    if (typeof q.saved !== 'boolean') return null
    if (q.saved) delete next.saved
    else next.saved = false
  }
  if (q.maturityMonth !== undefined) {
    if (q.maturityMonth === null || q.maturityMonth === '') delete next.maturityMonth
    else if (isYearMonth(q.maturityMonth)) next.maturityMonth = q.maturityMonth
    else return null
  }
  if (q.barrier !== undefined) {
    if (q.barrier === null) delete next.barrier
    else if (isBarrier(q.barrier)) next.barrier = { type: q.barrier.type, price: q.barrier.price, dir: q.barrier.dir }
    else return null
  }
  if (q.accum !== undefined) {
    if (q.accum === null) delete next.accum
    else if (isAccum(q.accum)) next.accum = { ...q.accum }
    else return null
  }
  if (q.maturity !== undefined) {
    if (typeof q.maturity !== 'string' || q.maturity.length > 24) return null
    next.maturity = q.maturity
  }
  // What the closing price means depends on the kind: another kind starts it over.
  if (q.kind !== undefined && q.kind !== cur.kind) {
    if (q.closePrice === undefined) delete next.closePrice
    if (q.closeValueUsd === undefined) delete next.closeValueUsd
  }
  // Another asset means other units (bushels vs US$, US¢/bu vs R$/US$): nothing typed carries over by itself.
  if (q.asset !== undefined && q.asset !== cur.asset) {
    for (const k of ['qty', 'strike', 'premium'] as const) if (q[k] === undefined) next[k] = 0
    if (q.fxFixed === undefined) next.fxFixed = null
    if (q.lotSize === undefined) delete next.lotSize
  }
  // Barriers and accumulators exist only for soybeans/corn: the dollar has futures, puts and calls.
  if (next.asset === 'dolar') {
    delete next.barrier
    delete next.accum
    if (next.kind === 'accumulator') next.kind = 'futuro'
  }
  // A future has no premium and no barrier; the dollar fixing exists only on soybean operations.
  if (next.kind === 'futuro') {
    next.premium = 0
    delete next.barrier
  }
  // An accumulator is always sold, has no premium and only a knock-out barrier; any other kind drops its schedule.
  if (next.kind === 'accumulator') {
    next.side = 'vendido'
    next.accum ??= { frequency: 'semanal' }
    if (next.barrier?.type === 'ki') delete next.barrier
  } else {
    delete next.accum
    delete next.premiumDir
  }
  // The floor level exists only on the accumulator without a knock-out (floor/ceiling).
  if (next.kind !== 'accumulator' || next.barrier) delete next.floorLevel
  // The dollar has no dollar to fix; a barrier date only makes sense with a barrier.
  if (next.asset === 'dolar') next.fxFixed = null
  // The accumulator is typed as TOTAL lots: the quantity per fixing follows from the schedule (0 while it is not known).
  if (next.kind === 'accumulator' && next.accum?.totalLots !== undefined) {
    const fixings =
      next.startDate && next.maturityDate
        ? fixingDates(next.startDate, next.maturityDate, next.accum.frequency, next.accum.day).length
        : 0
    next.qty = fixings > 0 ? (next.accum.totalLots * lotSizeOf(next)) / fixings : 0
  }
  if (!next.barrier) delete next.barrierHitDate
  if (next.kind !== 'accumulator') delete next.closeValueUsd
  else delete next.closePrice
  return next
}

/** "op-N" with N above every id in use (deterministic, so the reducer stays pure). */
export function nextHedgeId(ops: HedgeOp[]): string {
  let n = ops.length
  for (const o of ops) {
    const m = /^op-(\d+)$/.exec(o.id)
    if (m) n = Math.max(n, Number(m[1]))
  }
  return `op-${n + 1}`
}

/** Strict shape check of a stored operation (persistence). Business validity (qty > 0 ...) is not required. */
export function isStoredHedgeOp(v: unknown): v is HedgeOp {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const o = v as Record<string, unknown>
  if (typeof o.id !== 'string' || o.id === '') return false
  if (
    !HEDGE_ASSETS.includes(o.asset as never) ||
    !HEDGE_KINDS.includes(o.kind as never) ||
    !HEDGE_SIDES.includes(o.side as never)
  ) {
    return false
  }
  if (!isNonNeg(o.qty) || !isNonNeg(o.strike) || !isNonNeg(o.premium)) return false
  if (o.fxFixed !== null && !(isNonNeg(o.fxFixed) && o.fxFixed > 0)) return false
  if (typeof o.maturity !== 'string' || o.maturity.length > 24) return false
  if (o.maturityMonth !== undefined && !isYearMonth(o.maturityMonth)) return false
  if (o.lotSize !== undefined && !(isNonNeg(o.lotSize) && o.lotSize > 0)) return false
  for (const k of ['closePrice', 'costBrl', 'floorLevel'] as const)
    if (o[k] !== undefined && !isNonNeg(o[k])) return false
  if (o.premiumDir !== undefined && o.premiumDir !== 'pago' && o.premiumDir !== 'recebido') return false
  if (o.closeValueUsd !== undefined && !(typeof o.closeValueUsd === 'number' && Number.isFinite(o.closeValueUsd)))
    return false
  if (o.contract !== undefined && !(typeof o.contract === 'string' && o.contract.length <= 24)) return false
  for (const k of ['startDate', 'maturityDate', 'closedDate', 'barrierHitDate'] as const) {
    if (o[k] !== undefined && !isIsoDate(o[k])) return false
  }
  if (o.barrier !== undefined && !isBarrier(o.barrier)) return false
  if (o.accum !== undefined && !isAccum(o.accum)) return false
  if (o.crop !== undefined && !(typeof o.crop === 'string' && Object.hasOwn(CROPS, o.crop))) return false
  return true
}
