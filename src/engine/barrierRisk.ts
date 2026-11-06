import type { BarrierType, HedgeKind, HedgeOp, HedgeSide, HedgeSpec, OpState } from './hedge'
import { hedgeOpMoney, hedgeOpProblem, opStatus } from './hedge'
import type { BarrierDir } from './history'

/**
 * Barrier operations (knock-out / knock-in) seen as a risk of the producer: the cover they give is not firm, it lasts
 * only while the CBOT does not touch the barrier. Pure: no store, no React.
 *
 * The scenario engines read a barrier from the scenario price (a price at or beyond it = touched). A real knock-out
 * depends on the PATH: the CBOT may touch the barrier and come back. So the risk is shown as the worst case: if the
 * barrier is touched at any moment, the cover of what is still to come is gone, even if the price returns.
 */

export interface BarrierRisk {
  id: string
  kind: Exclude<HedgeKind, 'futuro'>
  side: HedgeSide
  type: BarrierType
  dir: BarrierDir
  /** Barrier and strike (accumulator: the enhancement level), US¢/bu. */
  barrierUsc: number
  strikeUsc: number
  state: OpState
  /** ISO date the barrier was reached, when it was (the knock-out already happened / the knock-in already started). */
  hitDate?: string
  /** True when the operation protects the production (put bought, accumulator sold). */
  covers: boolean
  /** Sacks this operation covers today (0 once knocked out, expired or while a knock-in is not active). */
  sc: number
  /** Accumulator: sacks of the guaranteed fixings still to come; they survive a knock-out. */
  guaranteedSc: number
  /** Barrier minus today's CBOT: US¢/bu and fraction of today's level (positive = above today's price). */
  distanceUsc: number
  distancePct: number
  /** Today's CBOT is already beyond the barrier but the history has no record of the touch. */
  beyondToday: boolean
  /** Knock-out that still covers: touching the barrier takes the cover away. */
  atRisk: boolean
}

const finitePos = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

/** Operations that protect the production (a call bought or a put sold does not). */
function coversProduction(op: HedgeOp): boolean {
  if (op.kind === 'accumulator') return true
  return op.kind === 'put' && op.side === 'comprado'
}

/** Guaranteed fixings of an accumulator still to come (bushels), 0 for the others. */
function guaranteedLeftQty(op: HedgeOp, spec: HedgeSpec): number {
  if (op.kind !== 'accumulator') return 0
  const st = opStatus(op, spec)
  const guaranteed = Math.min(op.accum?.guaranteed ?? 0, st.fixingsTotal ?? 0)
  const left = Math.max(0, Math.min(st.fixingsLeft ?? 0, guaranteed - (st.fixingsDone ?? 0)))
  return left * op.qty
}

/** The barrier operations of the spec (grain only: the dollar has no barrier), ranked by how close the barrier is. */
export function barrierRisks(spec: HedgeSpec, cbotToday: number, bushelsPerSack: number): BarrierRisk[] {
  if (!finitePos(cbotToday) || !finitePos(bushelsPerSack)) return []
  const out: BarrierRisk[] = []
  for (const op of spec.ops) {
    if (hedgeOpProblem(op) !== null || op.asset !== 'soja' || op.barrier === undefined || op.kind === 'futuro') continue
    const st = opStatus(op, spec)
    const b = op.barrier
    const covers = coversProduction(op)
    const beyond = b.dir === 'alta' ? cbotToday >= b.price : cbotToday <= b.price
    out.push({
      id: op.id,
      kind: op.kind,
      side: op.side,
      type: b.type,
      dir: b.dir,
      barrierUsc: b.price,
      strikeUsc: op.strike,
      state: st.state,
      ...(st.barrierDate !== undefined && { hitDate: st.barrierDate }),
      covers,
      sc: covers ? st.coverQty / bushelsPerSack : 0,
      guaranteedSc: covers ? guaranteedLeftQty(op, spec) / bushelsPerSack : 0,
      distanceUsc: b.price - cbotToday,
      distancePct: b.price / cbotToday - 1,
      beyondToday: beyond && st.barrierHit !== true,
      atRisk: covers && b.type === 'ko' && st.state === 'aberta',
    })
  }
  return out.sort((a, z) => Math.abs(a.distancePct) - Math.abs(z.distancePct))
}

/** The knock-out that still covers and whose barrier is the closest to today's price; null when there is none. */
export function nearestBarrier(risks: BarrierRisk[]): BarrierRisk | null {
  return risks.find((r) => r.atRisk) ?? null
}

/**
 * What the barrier does to ONE operation if it is touched at some point and the CBOT ends the crop at `cbotUsc`: R$ of
 * the operation touched minus the same operation never touched (whole position, with the premium paid in both). A knock-out
 * gives <= 0 (the cover lost); a knock-in gives >= 0 (the cover gained). 0 for an operation without a barrier.
 */
export function touchEffectBrl(op: HedgeOp, spec: HedgeSpec, cbotUsc: number, fx: number): number {
  if (op.barrier === undefined || hedgeOpProblem(op) !== null) return 0
  const touched = hedgeOpMoney(op, spec, cbotUsc, fx, 'touched')
  const untouched = hedgeOpMoney(op, spec, cbotUsc, fx, 'untouched')
  return touched.realizedBrl + touched.projectedBrl - (untouched.realizedBrl + untouched.projectedBrl)
}

/** The same for every knock-out that still covers, summed: the worst case of touching their barriers (<= 0). */
export function touchLossBrl(spec: HedgeSpec, cbotUsc: number, fx: number): number {
  let total = 0
  for (const op of spec.ops) {
    if (op.barrier?.type !== 'ko' || !coversProduction(op)) continue
    if (opStatus(op, spec).state !== 'aberta') continue
    total += touchEffectBrl(op, spec, cbotUsc, fx)
  }
  return total
}

export interface CoverSplit {
  /** Sacks covered by CBOT operations that do not depend on a barrier (futures, plain puts, guaranteed fixings). */
  firmSc: number
  /** Sacks covered only while the CBOT does not touch a knock-out barrier. */
  barrierSc: number
  totalSc: number
  /** barrierSc / totalSc (0 when there is no cover). */
  barrierShare: number
}

/**
 * The CBOT cover of the grain operations split in firm and dependent on a barrier. Same rule of the exposure for what
 * counts as cover (sold future, bought put, accumulator fixings to come); a bought future subtracts and is firm.
 */
export function cbotCoverSplit(spec: HedgeSpec, bushelsPerSack: number): CoverSplit {
  let firm = 0
  let barrier = 0
  if (finitePos(bushelsPerSack)) {
    for (const op of spec.ops) {
      if (hedgeOpProblem(op) !== null || op.asset !== 'soja') continue
      const qty = opStatus(op, spec).coverQty
      if (op.kind === 'futuro') {
        firm += ((op.side === 'comprado' ? -1 : 1) * qty) / bushelsPerSack
      } else if (coversProduction(op)) {
        const dependent = op.barrier?.type === 'ko' && opStatus(op, spec).state === 'aberta'
        if (!dependent) firm += qty / bushelsPerSack
        else {
          const guaranteed = guaranteedLeftQty(op, spec)
          firm += guaranteed / bushelsPerSack
          barrier += (qty - guaranteed) / bushelsPerSack
        }
      }
    }
  }
  const firmSc = Math.max(0, firm)
  const total = firmSc + barrier
  return { firmSc, barrierSc: barrier, totalSc: total, barrierShare: total > 0 ? barrier / total : 0 }
}

export interface CallCap {
  id: string
  /** Strike of the call sold, US¢/bu: above it the producer no longer gains with the rise. */
  strikeUsc: number
  sc: number
  /** Strike minus today's CBOT: US¢/bu and fraction of today's level (negative = today's price is already above it). */
  distanceUsc: number
  distancePct: number
  /** Knock-out call sold: the cap ends if the CBOT touches this barrier (good for the producer). */
  barrier?: { type: BarrierType; price: number; dir: BarrierDir }
}

/**
 * The calls SOLD still open (grain only): they protect nothing, but cap the gain above the strike. Listed apart from the
 * cover; ranked by the closest strike. A knock-in call not yet active is not a cap yet and is left out.
 */
export function shortCallCaps(spec: HedgeSpec, cbotToday: number, bushelsPerSack: number): CallCap[] {
  if (!finitePos(cbotToday) || !finitePos(bushelsPerSack)) return []
  const out: CallCap[] = []
  for (const op of spec.ops) {
    if (hedgeOpProblem(op) !== null || op.asset !== 'soja' || op.kind !== 'call' || op.side !== 'vendido') continue
    const st = opStatus(op, spec)
    if (st.state !== 'aberta') continue
    out.push({
      id: op.id,
      strikeUsc: op.strike,
      sc: st.coverQty / bushelsPerSack,
      distanceUsc: op.strike - cbotToday,
      distancePct: op.strike / cbotToday - 1,
      ...(op.barrier !== undefined && { barrier: { ...op.barrier } }),
    })
  }
  return out.sort((a, z) => Math.abs(a.distancePct) - Math.abs(z.distancePct))
}

/**
 * What changes in the hedge result (R$, whole position) at a scenario if every knock-out that still covers had touched its
 * barrier, compared with how the scenario engines read it (touched only when the scenario price itself is beyond the
 * barrier): 0 for a price already beyond the barrier, the cover lost for a price short of it. Added to the margin per sack
 * (÷ production) it gives the margin if the barrier is touched, as shown in "Seu risco".
 */
export function touchedHedgeDeltaBrl(spec: HedgeSpec, cbotUsc: number, fx: number): number {
  let total = 0
  for (const op of spec.ops) {
    if (op.barrier?.type !== 'ko' || !coversProduction(op) || hedgeOpProblem(op) !== null) continue
    if (opStatus(op, spec).state !== 'aberta') continue
    const touched = hedgeOpMoney(op, spec, cbotUsc, fx, 'touched')
    const asRead = hedgeOpMoney(op, spec, cbotUsc, fx)
    total += touched.realizedBrl + touched.projectedBrl - (asRead.realizedBrl + asRead.projectedBrl)
  }
  return total
}
