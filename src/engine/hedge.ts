import { isIsoDate, isYearMonth, fixingDates, type Frequency } from './calendar'
import type { CropId } from './crops'
import {
  exactSettle,
  firstCross,
  hasDataBetween,
  settleAt,
  type BarrierDir,
  type DailyPoint,
  type MarketHistory,
} from './history'

/**
 * Market operations (hedge) the producer holds on the exchange: futures, puts, calls and accumulators on soybeans or
 * corn (CBOT) and futures/options on the dollar. The producer types them in until the positions come from an API.
 *
 * Money: an operation that is still open is settled at the scenario price (the matrix cell); one that already expired,
 * was closed, or an accumulator fixing that already happened is settled at the real settle of that day (price history).
 * Premiums are paid up front and always count. The whole result is added to the revenue per sack.
 */

export type HedgeAsset = 'soja' | 'dolar'
export type HedgeKind = 'futuro' | 'put' | 'call' | 'accumulator'
export type HedgeSide = 'vendido' | 'comprado'
export type BarrierType = 'ko' | 'ki'

export interface Barrier {
  /** ko: the option dies when the barrier is reached. ki: the option only exists once it was reached. */
  type: BarrierType
  /** Barrier price (US¢/bu), compared with the daily settle. */
  price: number
  dir: BarrierDir
}

export interface Accum {
  frequency: Frequency
  /** semanal: weekday 1..5 (Monday..Friday); mensal: day of the month 1..31. Empty = the day of the start date. */
  day?: number
  /** The producer corrects the number of fixings already done (otherwise counted from the dates). */
  fixingsDone?: number
  /** The first N fixings count even if the knock-out happens earlier (guaranteed period). Default 0. */
  guaranteed?: number
  /**
   * Total lots of the whole accumulator, as the producer types them. The quantity per fixing (`HedgeOp.qty`) is derived:
   * total lots x lot size / number of fixings of the schedule. Empty (older saves) = `qty` is the typed one.
   */
  totalLots?: number
}

export interface HedgeOp {
  id: string
  /** The crop the operation was created for (absent in older saves = soja): an operation never settles another crop. */
  crop?: CropId
  asset: HedgeAsset
  kind: HedgeKind
  side: HedgeSide
  /** Soja: bushels (accumulator: bushels PER FIXING). Dólar: US$ notional. */
  qty: number
  /** Soja: US¢/bu (futures: the price of the operation; options and accumulators: the strike). Dólar: R$/US$. */
  strike: number
  /** Option premium per unit, in the unit of `strike`; 0 for a future and for an accumulator. */
  premium: number
  /**
   * Soja only: R$/US$ at which the operation's US$ result is converted. null = open: the result follows the dollar of
   * the day (realized) or of the scenario (projected). A fixed one also fixes the dollar for the same sacks.
   */
  fxFixed: number | null
  /** Free label of older saves ("jul/27"); the maturity date below replaces it. */
  maturity: string
  /** Contract month (YYYY-MM) the producer typed first; the end date (`maturityDate`) is derived from it and editable. */
  maturityMonth?: string
  /**
   * Size of one lot when it is not the standard one: bushels for soybeans/corn (mini contract, OTC), US$ for the
   * dollar (B3 mini, NDF). Empty = the standard of the asset.
   */
  lotSize?: number
  /** ISO date the operation was contracted (the barrier is watched from it). */
  startDate?: string
  /** ISO maturity date. */
  maturityDate?: string
  /** ISO date the producer left the operation before maturity. */
  closedDate?: string
  /**
   * What the position was closed at. Future: the closing price (same unit as the price). Put/call: the premium per unit
   * received (long) or paid to buy it back (short). Not used by accumulators. Empty = the settle of the closing day.
   */
  closePrice?: number
  /** Accumulator closed early: US$ received (+) or paid (−) to end it. */
  closeValueUsd?: number
  /** Brokerage and fees, R$ in total, paid once. */
  costBrl?: number
  /** ISO date the barrier was reached according to the producer: it overrides the check against the history. */
  barrierHitDate?: string
  /** Free text: contract month or ticker ("SK26"). */
  contract?: string
  /** Soja/corn put, call and accumulator only. */
  barrier?: Barrier
  /** Accumulator only. */
  accum?: Accum
  /**
   * Accumulator floor/ceiling (producer) only: the Floor Level (US¢/bu), below the market and below the enhancement
   * level (`strike`). At each fixing, a settle ABOVE the floor sells the period quantity at the enhancement level; a
   * settle at or BELOW the floor sells it at the floor level. (The ceiling level belongs to the consumer accumulator.)
   */
  floorLevel?: number
  /** Accumulator only: the premium is paid by the producer (default) or received. */
  premiumDir?: 'pago' | 'recebido'
  /**
   * false = reported but not saved yet: it counts in the numbers while the app is open, but is not written to the
   * browser, so it is gone on the next visit. Absent or true = saved.
   */
  saved?: boolean
}

/**
 * Standard contract size of one lot: CBOT soybean and corn = 5.000 bushels; dollar (B3 DOL) = US$ 50.000. The producer
 * types lots (and may edit the size of the lot); `qty` stays in bushels / US$ so the maths does not change.
 */
export const LOT_SIZE: Record<HedgeAsset, number> = { soja: 5000, dolar: 50000 }

const pos = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0
const nonNeg = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/** Size of one lot of this operation: the typed one (mini, OTC, NDF...), else the standard of the asset. */
export function lotSizeOf(op: Pick<HedgeOp, 'asset' | 'lotSize'>): number {
  return pos(op.lotSize) ? op.lotSize : LOT_SIZE[op.asset]
}

export const HEDGE_ASSETS: HedgeAsset[] = ['soja', 'dolar']
export const HEDGE_KINDS: HedgeKind[] = ['futuro', 'put', 'call', 'accumulator']
export const HEDGE_SIDES: HedgeSide[] = ['vendido', 'comprado']
export const BARRIER_TYPES: BarrierType[] = ['ko', 'ki']
export const BARRIER_DIRS: BarrierDir[] = ['alta', 'baixa']
export const FREQUENCIES: Frequency[] = ['diario', 'semanal', 'mensal']

/** Shape check of a barrier / accumulator block (used by the patch and by persistence). */
export function isBarrier(v: unknown): v is Barrier {
  if (typeof v !== 'object' || v === null) return false
  const b = v as Record<string, unknown>
  // The price may still be empty (0) while the producer types it: the operation is then invalid, not the shape.
  return BARRIER_TYPES.includes(b.type as never) && BARRIER_DIRS.includes(b.dir as never) && nonNeg(b.price)
}
export function isAccum(v: unknown): v is Accum {
  if (typeof v !== 'object' || v === null) return false
  const a = v as Record<string, unknown>
  if (!FREQUENCIES.includes(a.frequency as never)) return false
  const intIn = (x: unknown, lo: number, hi: number) =>
    typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi
  if (a.day !== undefined && !intIn(a.day, 1, a.frequency === 'semanal' ? 5 : 31)) return false
  if (a.fixingsDone !== undefined && !intIn(a.fixingsDone, 0, 100000)) return false
  if (a.guaranteed !== undefined && !intIn(a.guaranteed, 0, 100000)) return false
  if (a.totalLots !== undefined && !nonNeg(a.totalLots)) return false
  return true
}

/** pt-BR reason why an operation cannot enter the numbers, or null when it is valid. */
export function hedgeOpProblem(op: HedgeOp): string | null {
  if (!pos(op.qty)) {
    if (op.kind === 'accumulator' && pos(op.accum?.totalLots)) {
      return 'Informe a data de início e o mês de vencimento: o app divide os lotes pelos fixings.'
    }
    return 'Informe a quantidade de lotes (maior que zero).'
  }
  if (!pos(op.strike)) {
    if (op.kind === 'futuro') {
      return op.asset === 'soja'
        ? 'Informe o preço do futuro (maior que zero).'
        : 'Informe o preço do futuro em R$/US$ (maior que zero).'
    }
    return op.asset === 'soja'
      ? 'Informe o strike, o preço do CBOT (maior que zero).'
      : 'Informe o strike, o dólar da operação (maior que zero).'
  }
  if ((op.kind === 'put' || op.kind === 'call' || op.kind === 'accumulator') && !nonNeg(op.premium)) {
    return 'O prêmio não pode ser negativo.'
  }
  if (op.fxFixed !== null && !(op.asset === 'soja' && pos(op.fxFixed))) return 'O dólar fixado deve ser maior que zero.'
  if (op.maturityMonth !== undefined && !isYearMonth(op.maturityMonth)) return 'Mês de vencimento inválido.'
  for (const d of [op.startDate, op.maturityDate, op.closedDate, op.barrierHitDate]) {
    if (d !== undefined && !isIsoDate(d)) return 'Data inválida.'
  }
  if (op.closePrice !== undefined && !nonNeg(op.closePrice)) return 'O preço de encerramento não pode ser negativo.'
  if (op.closeValueUsd !== undefined && !Number.isFinite(op.closeValueUsd)) return 'Valor de encerramento inválido.'
  if (op.costBrl !== undefined && !nonNeg(op.costBrl)) return 'Os custos da operação não podem ser negativos.'
  if (op.floorLevel !== undefined && !nonNeg(op.floorLevel)) return 'O nível piso não pode ser negativo.'
  if (op.premiumDir !== undefined && op.premiumDir !== 'pago' && op.premiumDir !== 'recebido') {
    return 'Informe se o prêmio foi pago ou recebido.'
  }
  if (op.startDate && op.maturityDate && op.maturityDate < op.startDate) {
    return 'O vencimento deve ser depois da data da operação.'
  }
  if (op.startDate && op.closedDate && op.closedDate < op.startDate) {
    return 'A data de encerramento deve ser depois da data da operação.'
  }
  if (op.barrier !== undefined) {
    if (op.asset !== 'soja' || !(op.kind === 'put' || op.kind === 'call' || op.kind === 'accumulator')) {
      return 'Barreira só vale para put, call e accumulator de soja ou milho.'
    }
    if (!isBarrier(op.barrier) || !pos(op.barrier.price)) return 'Informe o preço e o tipo da barreira.'
    if (op.kind === 'accumulator' && op.barrier.type !== 'ko') return 'O accumulator só tem barreira de knock-out.'
    if (!op.startDate) return 'Informe a data da operação: a barreira vale a partir dela.'
  }
  if (op.kind === 'accumulator') {
    if (op.asset !== 'soja') return 'Accumulator só vale para soja ou milho.'
    if (op.side !== 'vendido') return 'O accumulator é sempre vendido.'
    if (!op.startDate || !op.maturityDate) return 'Informe a data da operação e o vencimento.'
    if (!isAccum(op.accum)) return 'Informe a frequência dos fixings.'
    // The floor/ceiling accumulator (no knock-out) is defined by its floor level, which sits below the enhancement level.
    if (!op.barrier) {
      if (!pos(op.floorLevel)) return 'Informe o nível piso (floor level).'
      if (op.floorLevel >= op.strike) return 'O nível piso deve ficar abaixo do nível de melhoria.'
    }
  }
  return null
}

/** A new, empty operation (invalid until the quantity and the price are typed). */
export const EMPTY_HEDGE_OP: Omit<HedgeOp, 'id' | 'crop'> = {
  asset: 'soja',
  kind: 'futuro',
  side: 'vendido',
  qty: 0,
  strike: 0,
  premium: 0,
  fxFixed: null,
  maturity: '',
}

/** The valid operations plus today's market dollar and, when known, the date of today and the price history. */
export interface HedgeSpec {
  ops: HedgeOp[]
  marketFx: number
  /** ISO date of today; absent = every operation is treated as open (no history to compare). */
  today?: string
  history?: MarketHistory
  /** Crop on screen: the history series of operations without their own crop. */
  crop?: CropId
}

export type OpState = 'aberta' | 'vencida' | 'encerrada' | 'derrubada' | 'nao-ativada'

export interface HedgeLine {
  id: string
  label?: string
  /** R$ for the whole position (realized + at the scenario): `premiumBrl + resultBrl`. */
  brl: number
  /** The cost of the operation (premiums paid/received, brokerage and fees); negative = paid. */
  premiumBrl: number
  /** The profit or loss of the operation (payoffs, fixings, closing trades), without the cost above. */
  resultBrl: number
  state: OpState
}

const usable = (v: number): boolean => Number.isFinite(v) && v > 0

/** The spec when there is at least one valid operation and a usable market dollar; otherwise undefined. */
export function activeHedge(
  ops: HedgeOp[],
  marketFx: number,
  ctx: { today?: string; history?: MarketHistory; crop?: CropId } = {},
): HedgeSpec | undefined {
  if (!usable(marketFx)) return undefined
  const valid = ops.filter((o) => hedgeOpProblem(o) === null)
  if (valid.length === 0) return undefined
  return {
    ops: valid,
    marketFx,
    ...(ctx.today !== undefined && { today: ctx.today }),
    ...(ctx.history && { history: ctx.history }),
    ...(ctx.crop && { crop: ctx.crop }),
  }
}

/** Payoff per unit (unit of `strike`) at settle price S, without the premium, signed for the side. */
export function hedgeUnitPayoff(op: HedgeOp, settle: number): number {
  // An accumulator is a sale per fixing: at the enhancement level (`strike`), or, in the floor/ceiling version, at the
  // floor level when the settle is at or below it. Cash settled, so it pays the difference to the settle.
  if (op.kind === 'accumulator') {
    const sold = op.floorLevel !== undefined && !op.barrier && settle <= op.floorLevel ? op.floorLevel : op.strike
    return sold - settle
  }
  if (op.kind === 'futuro') {
    return op.side === 'vendido' ? op.strike - settle : settle - op.strike
  }
  const intrinsic = op.kind === 'put' ? Math.max(op.strike - settle, 0) : Math.max(settle - op.strike, 0)
  return op.side === 'comprado' ? intrinsic : -intrinsic
}

/** Premium effect per unit: paid when bought (negative), received when sold (positive); 0 for futures and accumulators. */
export function hedgeUnitPremium(op: HedgeOp): number {
  if (op.kind === 'futuro' || op.kind === 'accumulator') return 0
  return op.side === 'comprado' ? -op.premium : op.premium
}

// ───────────────────────── status (what is alive, what protects, what happened) ─────────────────────────

export interface OpStatus {
  state: OpState
  /** Quantity (bushels or US$) that still protects today: 0 once expired, closed, knocked out or not yet activated. */
  coverQty: number
  /** The result is already realized at a real settle (expired or closed). */
  settled: boolean
  endDate?: string
  /** null when the operation has no barrier. */
  barrierHit: boolean | null
  barrierDate?: string
  /** Accumulator: fixings in the contract (until the knock-out), already done and still to come. */
  fixingsTotal?: number
  fixingsDone?: number
  fixingsLeft?: number
  notes: string[]
}

interface Analysis extends OpStatus {
  /** Accumulator: the fixings already done with their real settle (null = no history that day). */
  done: { date: string; settle: number | null }[]
  /** Futures and options: the real settle on the end date (null = no history). */
  settleEnd: number | null
  /** Accumulator: all the fixings of the contract (before any knock-out), for what is charged on the whole contract. */
  planned: number
}

const analysisCache = new WeakMap<HedgeSpec, Map<HedgeOp, Analysis>>()

function seriesOf(op: HedgeOp, spec: HedgeSpec): DailyPoint[] | undefined {
  return op.asset === 'dolar' ? spec.history?.fx : spec.history?.cbotUsc?.[op.crop ?? spec.crop ?? 'soja']
}

function analyse(op: HedgeOp, spec: HedgeSpec): Analysis {
  let byOp = analysisCache.get(spec)
  if (!byOp) analysisCache.set(spec, (byOp = new Map()))
  const hit = byOp.get(op)
  if (hit) return hit
  const a = computeAnalysis(op, spec)
  byOp.set(op, a)
  return a
}

function computeAnalysis(op: HedgeOp, spec: HedgeSpec): Analysis {
  const today = spec.today
  const series = seriesOf(op, spec)
  const notes: string[] = []
  const closedFirst = op.closedDate !== undefined && (op.maturityDate === undefined || op.closedDate < op.maturityDate)
  const endDate = closedFirst ? op.closedDate : op.maturityDate
  const ended = today !== undefined && endDate !== undefined && endDate <= today
  const endState: OpState = closedFirst ? 'encerrada' : 'vencida'
  const closedByUser = closedFirst && ended
  if (op.closedDate !== undefined && !closedFirst && op.maturityDate !== undefined) {
    notes.push('A data de encerramento não é antes do vencimento: vale o vencimento.')
  }

  // Barrier: was it reached (daily settle) between the start of the operation and today / the end?
  let barrierHit: boolean | null = null
  let barrierDate: string | undefined
  if (op.barrier && op.barrierHitDate && (today === undefined || op.barrierHitDate <= today)) {
    // The producer says when it was reached: that wins over the history.
    barrierHit = true
    barrierDate = op.barrierHitDate
  } else if (op.barrier && op.startDate && today !== undefined) {
    const to = endDate !== undefined && endDate < today ? endDate : today
    const d = firstCross(series, op.startDate, to, op.barrier.dir, op.barrier.price)
    barrierHit = d !== null
    if (d !== null) barrierDate = d
    else if (!hasDataBetween(series, op.startDate, to)) {
      notes.push(
        'Sem histórico de preços desde a data da operação: a barreira não pôde ser conferida (vale como não atingida).',
      )
    }
  } else if (op.barrier) {
    barrierHit = false
  }

  if (op.kind === 'accumulator' && op.accum && op.startDate && op.maturityDate) {
    const last = endDate ?? op.maturityDate
    const all = fixingDates(op.startDate, last, op.accum.frequency, op.accum.day)
    const koDate = op.barrier?.type === 'ko' ? barrierDate : undefined
    // The fixing of the knock-out day itself does not count, except the guaranteed first fixings.
    const guaranteed = op.accum.guaranteed ?? 0
    const valid = koDate ? all.filter((d, i) => d < koDate || i < guaranteed) : all
    const happened = (d: string) =>
      today !== undefined && (d < today || (d === today && exactSettle(series, d) !== null))
    let doneDates: string[] = []
    if (today !== undefined) {
      if (closedByUser) doneDates = valid
      else if (op.accum.fixingsDone !== undefined && !koDate) {
        doneDates = valid.slice(0, Math.min(op.accum.fixingsDone, valid.length))
      } else doneDates = valid.filter(happened)
    }
    const done = doneDates.map((date) => ({ date, settle: settleAt(series, date) }))
    const missing = done.filter((x) => x.settle === null).length
    if (missing > 0) notes.push(`Sem histórico de preço em ${missing} fixing(s) já feitos: valem pelo cenário.`)
    const left = valid.length - doneDates.length
    if (koDate && left > 0) notes.push(`Barreira atingida: ainda restam ${left} fixing(s) garantidos.`)
    const state: OpState = koDate && left === 0 ? 'derrubada' : left === 0 && today !== undefined ? endState : 'aberta'
    return {
      state,
      coverQty: left * op.qty,
      settled: left === 0 && today !== undefined,
      ...(endDate !== undefined && { endDate }),
      barrierHit,
      ...(barrierDate !== undefined && { barrierDate }),
      fixingsTotal: valid.length,
      fixingsDone: doneDates.length,
      fixingsLeft: left,
      notes,
      done,
      settleEnd: null,
      // The premium was paid on the whole contract, also when the producer closed it before the last fixing.
      planned: fixingDates(op.startDate, op.maturityDate, op.accum.frequency, op.accum.day).length,
    }
  }

  // Future / put / call.
  const option = op.kind === 'put' || op.kind === 'call'
  let state: OpState = ended ? endState : 'aberta'
  if (today !== undefined) {
    if (op.barrier?.type === 'ko' && barrierHit) state = 'derrubada'
    if (op.barrier?.type === 'ki' && !barrierHit) state = 'nao-ativada'
  }
  const alive = state === 'aberta' || state === 'vencida' || state === 'encerrada'
  // Closed by the producer with a typed price: that price is the settle (a future); an option uses the premium instead.
  const typedClose = closedByUser && op.closePrice !== undefined
  let settleEnd: number | null = null
  if (ended && endDate !== undefined) {
    if (typedClose && !option) settleEnd = op.closePrice ?? null
    // On the end day itself only that day's settle counts (the history may not have it yet).
    else settleEnd = endDate === today ? exactSettle(series, endDate) : settleAt(series, endDate)
  }
  if (ended && alive && !typedClose && settleEnd === null) {
    notes.push('Sem histórico de preço na data de encerramento: vale pelo cenário.')
  }
  if (ended && alive && option && closedByUser && op.closePrice === undefined) {
    notes.push('Informe o prêmio de encerramento: sem ele vale só o valor intrínseco do dia.')
  }
  return {
    state,
    coverQty: state === 'aberta' ? op.qty : 0,
    settled: ended && alive && (settleEnd !== null || (typedClose && option)),
    ...(endDate !== undefined && { endDate }),
    barrierHit,
    ...(barrierDate !== undefined && { barrierDate }),
    notes,
    done: [],
    settleEnd,
    planned: 0,
  }
}

/** What happened to an operation and what still protects (scenario-independent). */
export function opStatus(op: HedgeOp, spec: HedgeSpec): OpStatus {
  const { done, settleEnd, planned, ...status } = analyse(op, spec)
  void done
  void settleEnd
  void planned
  return status
}

// ───────────────────────────────────────────── money ─────────────────────────────────────────────

export interface OpMoney {
  /** R$ already realized: premium paid, expired/closed payoff, fixings that happened. */
  realizedBrl: number
  /** R$ at the scenario: what is still open. */
  projectedBrl: number
  /**
   * The part of the result that is the COST of the operation: opening premiums (negative = paid, positive = received)
   * and brokerage/fees. realized + projected = premiumBrl + the profit or loss (payoffs, fixings, closing trades).
   */
  premiumBrl: number
}

const fxOn = (op: HedgeOp, spec: HedgeSpec, date: string | undefined, fallback: number): number =>
  op.fxFixed ?? (date !== undefined ? settleAt(spec.history?.fx, date) : null) ?? fallback

/**
 * R$ result of one operation, split into realized and projected, at a CBOT price (US¢/bu) and a scenario dollar.
 * `touch` forces the path of the barrier instead of reading it from the price: 'touched' = the CBOT reached the barrier
 * at some point (a knock-out dies, a knock-in starts), 'untouched' = it never did. Absent = the old rule: the barrier
 * counts as reached only when the scenario price itself is at or beyond it.
 */
export function hedgeOpMoney(
  op: HedgeOp,
  spec: HedgeSpec,
  cbotUsc: number,
  fx: number,
  touch?: 'touched' | 'untouched',
): OpMoney {
  const a = analyse(op, spec)
  const soja = op.asset === 'soja'
  const scenarioPrice = soja ? cbotUsc : fx
  // R$ for `qty` units settled at `price` (soja: US¢/bu × bu → US$ → R$ at `conv`; dólar: R$/US$ × US$ is already R$).
  const brl = (price: number, qty: number, conv: number) =>
    soja ? ((hedgeUnitPayoff(op, price) * qty) / 100) * conv : hedgeUnitPayoff(op, price) * qty
  // Brokerage and fees: paid once, always count (they are part of the cost of the operation).
  let premium = 0 - (op.costBrl ?? 0)
  let realized = premium
  let projected = 0
  // A scenario price at or beyond the barrier means the barrier is reached before what is still to come: a knock-out
  // dies for the fixings/expiry still open, a knock-in not yet active starts to work.
  const touchesAtScenario =
    op.barrier !== undefined &&
    soja &&
    (touch !== undefined
      ? touch === 'touched'
      : op.barrier.dir === 'alta'
        ? cbotUsc >= op.barrier.price
        : cbotUsc <= op.barrier.price)
  const koAtScenario = touchesAtScenario && op.barrier?.type === 'ko' && a.state === 'aberta'
  const ended = spec.today !== undefined && a.endDate !== undefined && a.endDate <= spec.today
  const kiAtScenario = touchesAtScenario && op.barrier?.type === 'ki' && a.state === 'nao-ativada' && !ended

  if (op.kind === 'accumulator') {
    for (const f of a.done) {
      if (f.settle === null) projected += brl(scenarioPrice, op.qty, op.fxFixed ?? fx)
      else realized += brl(f.settle, op.qty, fxOn(op, spec, f.date, spec.marketFx))
    }
    // A knock-out at the scenario kills what is still to come, except the guaranteed first fixings not yet done.
    const left = a.fixingsLeft ?? 0
    const surviving = koAtScenario
      ? Math.min(left, Math.max(0, Math.min(op.accum?.guaranteed ?? 0, a.fixingsTotal ?? 0) - (a.fixingsDone ?? 0)))
      : left
    projected += brl(scenarioPrice, op.qty * surviving, op.fxFixed ?? fx)
    // Premium of the contract: per bushel over everything contracted (all the fixings), paid or received at the start.
    if (op.premium > 0) {
      const units = op.premium * op.qty * a.planned * (op.premiumDir === 'recebido' ? 1 : -1)
      const p = (units / 100) * fxOn(op, spec, op.startDate, spec.marketFx)
      realized += p
      premium += p
    }
    // Closed early: what the producer received (+) or paid (−) to end the contract.
    if (a.state === 'encerrada' && op.closeValueUsd !== undefined) {
      realized += op.closeValueUsd * fxOn(op, spec, a.endDate, spec.marketFx)
    }
    return { realizedBrl: realized, projectedBrl: projected, premiumBrl: premium }
  }

  // Premium: paid up front, always counts (also when the option dies or is never activated).
  const premiumUnits = hedgeUnitPremium(op) * op.qty
  const openingPremium = soja ? (premiumUnits / 100) * fxOn(op, spec, op.startDate, spec.marketFx) : premiumUnits
  realized += openingPremium
  premium += openingPremium

  const works =
    (a.state === 'aberta' || a.state === 'vencida' || a.state === 'encerrada' || kiAtScenario) && !koAtScenario
  if (!works) return { realizedBrl: realized, projectedBrl: 0, premiumBrl: premium }
  // Option closed before the expiry: it is sold (long) or bought back (short) at the typed premium, not exercised.
  if ((op.kind === 'put' || op.kind === 'call') && a.state === 'encerrada' && op.closePrice !== undefined) {
    const units = (op.side === 'comprado' ? 1 : -1) * op.closePrice * op.qty
    realized += soja ? (units / 100) * fxOn(op, spec, a.endDate, spec.marketFx) : units
    return { realizedBrl: realized, projectedBrl: 0, premiumBrl: premium }
  }
  if (a.settled && a.settleEnd !== null) {
    realized += brl(a.settleEnd, op.qty, fxOn(op, spec, a.endDate, spec.marketFx))
  } else {
    projected += brl(scenarioPrice, op.qty, op.fxFixed ?? fx)
  }
  return { realizedBrl: realized, projectedBrl: projected, premiumBrl: premium }
}

/** R$ result of one operation (realized + projected) at a CBOT price (US¢/bu) and a scenario dollar. */
export function hedgeOpBrl(op: HedgeOp, spec: HedgeSpec, cbotUsc: number, fx: number): number {
  const m = hedgeOpMoney(op, spec, cbotUsc, fx)
  return m.realizedBrl + m.projectedBrl
}

const KIND_LABEL: Record<HedgeKind, string> = { futuro: 'futuro', put: 'put', call: 'call', accumulator: 'accumulator' }

function formatDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

/** One entry per valid operation, in R$ for the whole position. */
export function hedgeBreakdown(spec: HedgeSpec, cbotUsc: number, fx: number): HedgeLine[] {
  return spec.ops
    .filter((o) => hedgeOpProblem(o) === null)
    .map((op) => {
      const kind = `${KIND_LABEL[op.kind]}${op.barrier ? ` ${op.barrier.type === 'ko' ? 'KO' : 'KI'}` : ''}`
      const head = `${op.asset === 'soja' ? 'Soja' : 'Dólar'} · ${kind} ${op.side}`
      const when = op.maturityDate ? formatDate(op.maturityDate) : op.maturity.trim()
      const label = [head, op.contract?.trim() ?? '', when].filter((x) => x !== '').join(' · ')
      const m = hedgeOpMoney(op, spec, cbotUsc, fx)
      const brl = m.realizedBrl + m.projectedBrl
      return {
        id: op.id,
        label,
        brl,
        premiumBrl: m.premiumBrl,
        resultBrl: brl - m.premiumBrl,
        state: analyse(op, spec).state,
      }
    })
}

/** Total R$ of all valid operations (realized + at the scenario; 0 when none). */
export function hedgeBrlAt(spec: HedgeSpec | undefined, cbotUsc: number, fx: number): number {
  if (!spec) return 0
  return spec.ops.reduce((s, op) => (hedgeOpProblem(op) === null ? s + hedgeOpBrl(op, spec, cbotUsc, fx) : s), 0)
}

/** Total R$ already realized by all valid operations (premiums, expired/closed results, fixings done). */
export function hedgeRealizedBrl(spec: HedgeSpec | undefined, cbotUsc: number, fx: number): number {
  if (!spec) return 0
  return spec.ops.reduce(
    (s, op) => (hedgeOpProblem(op) === null ? s + hedgeOpMoney(op, spec, cbotUsc, fx).realizedBrl : s),
    0,
  )
}

/**
 * The operations as the exposure sees them: only what still protects. Expired, closed, knocked-out and not-yet-active
 * operations are dropped; an accumulator becomes a future sold for the quantity of its fixings still to come; a barrier
 * option that is alive is a plain option.
 */
export function coverOps(ops: HedgeOp[], spec: HedgeSpec | undefined): HedgeOp[] {
  if (!spec) return ops.filter((o) => hedgeOpProblem(o) === null)
  const out: HedgeOp[] = []
  for (const op of ops) {
    if (hedgeOpProblem(op) !== null) continue
    const st = opStatus(op, spec)
    if (st.coverQty <= 0) continue
    if (op.kind === 'accumulator') {
      out.push({
        ...op,
        kind: 'futuro',
        side: 'vendido',
        qty: st.coverQty,
        premium: 0,
        barrier: undefined,
        accum: undefined,
      })
    } else {
      const { barrier, ...rest } = op
      void barrier
      out.push(rest)
    }
  }
  return out
}

/** The operations of one crop (an operation without a crop is a soybean one). */
export function opsForCrop(ops: HedgeOp[], crop: CropId): HedgeOp[] {
  return ops.filter((o) => (o.crop ?? 'soja') === crop)
}
