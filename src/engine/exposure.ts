/**
 * Exposure analysis ("Exposição") of the Comercialização tab. Pure: no store, no React.
 *
 * Production P = area x yield (sacks). Three factors the producer is exposed to, each reported in sacks
 * (`openSc`), % of the production (`pct`) and sc/ha (`scPerHa`); `exposed` = openSc > 0.5% of P.
 *
 * 1. BASIS open = max(0, P - S), S = sacks of ALL valid tranches (a sale fixes the price incl. basis, any currency).
 * 2. CBOT open = max(0, P - S - H). H = CBOT cover from operations on soybeans: futures SOLD (+qty/bushelsPerSack),
 *    futures BOUGHT (-), puts BOUGHT (+, also tracked in `floorSc`: protected against a fall, keeps the upside).
 *    Calls (bought or sold) and puts sold do NOT cover (counted in `otherOps`). Dollar operations never cover CBOT.
 * 3. DOLLAR (revenue side) open = max(0, P - R$ tranches - US$ tranches with their OWN typed dollar (`t.dollar > 0`)
 *    - D). US$ tranches with the dollar left empty (market dollar) stay exposed. D = dollar cover:
 *    dollar futures SOLD (+ US$ notional / usdPerSc), BOUGHT (-), dollar puts BOUGHT (+, floor), plus SOY operations
 *    carrying `fxFixed` (they fix the dollar for the same sacks; same sign rules as the CBOT cover). When `usdPerSc`
 *    is null the dollar notional cannot be converted: it counts as 0 and a note says so.
 *    Costs side: `costsUsd` = open US$ costs (whole area), `costsSc` = costsUsd / usdPerSc (null when unusable),
 *    `netSc` = revenue open sc - costsSc (negative = short dollar), with `netPct` and `netScPerHa`. Gross revenue
 *    exposure, costs and net are always reported separately.
 *
 * PROFILES partition the production into groups of sacks by which risks are open (sum of `sc` = production):
 * - Sold sacks have price (basis + CBOT) fixed. Their dollar is closed unless the tranche is US$ with an open dollar
 *   (profile {dolar}). Sold sacks beyond the production are clamped (open-dollar ones scaled by the same factor).
 * - Unsold sacks U = max(0, P - S): basis is always open (no basis hedge exists). CBOT cover Hc and dollar cover Hd are
 *   clamped to [0, U] for this partition (negative cover from bought futures counts as 0); the dollar cover left over
 *   after the unsold sacks closes the open-dollar sold sacks. Covers are assumed to fall on the SAME sacks as much as
 *   possible (overlap = min(Hc, Hd)): {basis} = overlap, {basis,dolar} = Hc - overlap (only CBOT covered),
 *   {basis,cbot} = Hd - overlap (only dollar covered), {basis,cbot,dolar} = U - Hc - Hd + overlap.
 * Only profiles with sc > 0 are returned, ordered from fully closed to fully open.
 *
 * `openSc` is clamped at 0; cover beyond what is open sets `overHedged` and adds a note.
 * No production (<= 0 or not finite) gives `{ ok: false }`.
 */
import { CROPS } from './crops'
import { hedgeOpProblem, type HedgeOp } from './hedge'
import { trancheProblem, trancheSc, type SaleTranche } from './sales'

/** Open share of the production below which a factor does not count as exposed. */
export const EXPOSED_THRESHOLD = 0.005

export interface ExposureInput {
  productionSc: number
  areaHa: number
  bushelsPerSack: number
  tranches: SaleTranche[]
  hedgeOps: HedgeOp[]
  /** Farm-gate US$/sc today (farm price / market dollar); null when unusable. */
  usdPerSc: number | null
  /** US$ of the costs still at the market dollar, on the whole area. */
  costsUsdOpen: number
}

export interface FactorExposure {
  openSc: number
  /** Fraction of the production (0..1). */
  pct: number
  /** null when the area is unknown. */
  scPerHa: number | null
  exposed: boolean
  /** Cover (or sales) beyond what was open. */
  overHedged: boolean
  /** Sacks covered by operations (CBOT, dollar); 0 for the basis. */
  coverSc: number
  /** Part of the covered sacks that is a bought put (floor, upside kept). */
  floorSc: number
}

export interface DollarExposure extends FactorExposure {
  costsUsd: number
  /** null when the dollar price per sack is unusable (and there are open costs to convert). */
  costsSc: number | null
  netSc: number | null
  netPct: number | null
  netScPerHa: number | null
}

export type RiskKey = 'basis' | 'cbot' | 'dolar'

export interface ExposureProfile {
  key: string
  label: string
  open: RiskKey[]
  sc: number
  /** Fraction of the production. */
  pct: number
}

export interface ExposureOk {
  profiles: ExposureProfile[]
  ok: true
  productionSc: number
  soldSc: number
  basis: FactorExposure
  cbot: FactorExposure
  dollar: DollarExposure
  /** Valid operations that do not cover anything (calls, puts sold). */
  otherOps: number
  notes: string[]
  anyExposed: boolean
  /** Nothing sold and no valid operation. */
  allOpen: boolean
  /** No factor exposed. */
  allClosed: boolean
}

export type Exposure = { ok: false } | ExposureOk

const finitePos = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0

export function computeExposure(input: ExposureInput): Exposure {
  const P = input.productionSc
  if (!finitePos(P)) return { ok: false }
  const bps = finitePos(input.bushelsPerSack) ? input.bushelsPerSack : CROPS.soja.bushelsPerSack
  const usdPerSc = finitePos(input.usdPerSc) ? input.usdPerSc : null
  const notes: string[] = []

  const tranches = input.tranches.filter((t) => trancheProblem(t) === null)
  const ops = input.hedgeOps.filter((o) => hedgeOpProblem(o) === null)

  let soldSc = 0
  let dollarFixedSc = 0
  let openDollarSoldSc = 0
  for (const t of tranches) {
    const sc = trancheSc(t, bps)
    soldSc += sc
    // A US$ sale with the dollar left empty follows the market dollar: it stays exposed.
    if (t.priceCurrency === 'BRL' || finitePos(t.dollar)) dollarFixedSc += sc
    else openDollarSoldSc += sc
  }

  let cbotCover = 0
  let cbotFloor = 0
  let fxCover = 0
  let fxFloor = 0
  let otherOps = 0
  let unconverted = false
  for (const o of ops) {
    const covers = o.kind === 'futuro' || (o.kind === 'put' && o.side === 'comprado')
    const sign = !covers ? 0 : o.kind === 'futuro' && o.side === 'comprado' ? -1 : 1
    if (sign === 0) {
      otherOps += 1
      continue
    }
    const isPut = o.kind === 'put'
    if (o.asset === 'soja') {
      const sc = (sign * o.qty) / bps
      cbotCover += sc
      if (isPut) cbotFloor += sc
      if (o.fxFixed !== null) {
        fxCover += sc
        if (isPut) fxFloor += sc
      }
    } else if (usdPerSc === null) {
      unconverted = true
    } else {
      const sc = (sign * o.qty) / usdPerSc
      fxCover += sc
      if (isPut) fxFloor += sc
    }
  }
  if (unconverted) {
    notes.push('Sem preço em dólar por saca, as operações em dólar não puderam ser convertidas em sacas.')
  }
  if (otherOps > 0) {
    notes.push(
      `${otherOps} ${otherOps === 1 ? 'operação não protege' : 'operações não protegem'} (compra de call ou venda de put).`,
    )
  }
  if (soldSc > P) notes.push('As vendas somam mais que a produção estimada.')

  const area = input.areaHa > 0 && Number.isFinite(input.areaHa) ? input.areaHa : null
  const factor = (base: number, cover: number, floor: number, label: string | null): FactorExposure => {
    const raw = base - cover
    const openSc = Math.max(0, raw)
    // A bought future (negative cover) is a long position on top of the physical: the exposure can pass the open sacks.
    if (cover < 0 && label) notes.push(`${label}: futuro comprado soma exposição (fica acima das sacas em aberto).`)
    const overHedged = cover > 0 && raw < 0
    if (overHedged && label) notes.push(`${label}: você tem mais proteção do que produção em aberto.`)
    const covered = Math.max(0, Math.min(base, cover))
    return {
      openSc,
      pct: openSc / P,
      scPerHa: area === null ? null : openSc / area,
      exposed: openSc > EXPOSED_THRESHOLD * P,
      overHedged,
      coverSc: covered,
      floorSc: Math.max(0, Math.min(covered, floor)),
    }
  }

  const basis = factor(Math.max(0, P - soldSc), 0, 0, null)
  const cbot = factor(Math.max(0, P - soldSc), cbotCover, cbotFloor, 'CBOT')
  const dollarBase = Math.max(0, P - dollarFixedSc)
  const dollarRev = factor(dollarBase, fxCover, fxFloor, 'Dólar')

  const costsUsd = Number.isFinite(input.costsUsdOpen) && input.costsUsdOpen > 0 ? input.costsUsdOpen : 0
  let costsSc: number | null = 0
  if (costsUsd > 0) costsSc = usdPerSc === null ? null : costsUsd / usdPerSc
  if (costsUsd > 0 && costsSc === null)
    notes.push('Sem preço em dólar por saca, os custos em US$ não puderam ser convertidos em sacas.')
  const netSc = costsSc === null ? null : dollarRev.openSc - costsSc
  const dollar: DollarExposure = {
    ...dollarRev,
    costsUsd,
    costsSc,
    netSc,
    netPct: netSc === null ? null : netSc / P,
    netScPerHa: netSc === null || area === null ? null : netSc / area,
  }

  // Profiles (see header).
  const soldClamped = Math.min(soldSc, P)
  const openDollarSold = soldSc > 0 ? openDollarSoldSc * (soldClamped / soldSc) : 0
  const unsold = P - soldClamped
  const hc = Math.min(Math.max(0, cbotCover), unsold)
  const hdTotal = Math.max(0, fxCover)
  const hd = Math.min(hdTotal, unsold)
  const soldDollarClosed = Math.min(hdTotal - hd, openDollarSold)
  const overlap = Math.min(hc, hd)
  const parts: [string, string, RiskKey[], number][] = [
    ['travado', 'Tudo travado', [], soldClamped - openDollarSold + soldDollarClosed],
    ['dolar', 'Só dólar em aberto', ['dolar'], openDollarSold - soldDollarClosed],
    ['basis', 'Só basis em aberto', ['basis'], overlap],
    ['basis-dolar', 'Basis e dólar em aberto', ['basis', 'dolar'], hc - overlap],
    ['basis-cbot', 'Basis e CBOT em aberto', ['basis', 'cbot'], hd - overlap],
    ['tudo', 'Tudo em aberto (basis, CBOT e dólar)', ['basis', 'cbot', 'dolar'], unsold - hc - hd + overlap],
  ]
  const profiles: ExposureProfile[] = parts
    .filter(([, , , v]) => v > 1e-9)
    .map(([key, label, open, v]) => ({ key, label, open, sc: v, pct: v / P }))

  const anyExposed = basis.exposed || cbot.exposed || dollar.exposed
  return {
    ok: true,
    productionSc: P,
    profiles,
    soldSc,
    basis,
    cbot,
    dollar,
    otherOps,
    notes,
    anyExposed,
    allOpen: tranches.length === 0 && ops.length === 0,
    allClosed: !anyExposed,
  }
}
