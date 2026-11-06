/**
 * What the crop-map and risk-value charts of the Comercialização tab show, from an `ExposureOk`. Pure: no store, no
 * React. Money is always R$ (the UI converts to the display currency).
 *
 * - `mapSegments`: the production split into groups of sacks by which risks are still open (one segment per profile).
 * - `riskLanes`: for each risk (dollar, basis, CBOT) the open and closed sacks and what closed them.
 * - `riskSensitivity`: what a move of the market does to the revenue of the OPEN sacks (R$), both ways.
 */
import type { ExposureOk, RiskKey } from './exposure'

const finite = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)

const RISK_LABEL: Record<RiskKey, string> = { dolar: 'dólar', basis: 'basis', cbot: 'CBOT' }
export const RISK_NAME: Record<RiskKey, string> = { dolar: 'Dólar', basis: 'Basis', cbot: 'CBOT' }

/** pt-BR sentence for each segment of the map: what is closed, what still moves. */
const SEGMENT_TEXT: Record<string, string> = {
  travado: 'Preço, basis e dólar já travados: nada mais muda para essas sacas.',
  dolar: 'Preço e basis travados, mas o dólar ainda mexe (venda em US$ com câmbio aberto).',
  basis: 'CBOT e dólar protegidos; o basis ainda não está travado.',
  'basis-dolar': 'O CBOT está protegido; basis e dólar ainda estão em aberto.',
  'basis-cbot': 'O dólar está protegido; CBOT e basis ainda estão em aberto.',
  tudo: 'Nada travado: CBOT, basis e dólar ainda podem mexer.',
}

export interface MapSegment {
  key: string
  label: string
  /** Risks still open in these sacks. */
  open: RiskKey[]
  /** Risks already closed in these sacks (price = CBOT). */
  closed: RiskKey[]
  sc: number
  /** Fraction of the production (0..1). */
  pct: number
  /** R$ at today's farm price; null when there is no price. */
  brl: number | null
  /** Plain-language reading of the segment. */
  text: string
}

const ALL_RISKS: RiskKey[] = ['cbot', 'basis', 'dolar']

/** Segments of the map, from fully closed to fully open (the order of the profiles). */
export function mapSegments(exp: ExposureOk, pricePerSc: number | null): MapSegment[] {
  return exp.profiles.map((p) => ({
    key: p.key,
    label: p.label,
    open: p.open,
    closed: ALL_RISKS.filter((r) => !p.open.includes(r)),
    sc: p.sc,
    pct: p.pct,
    brl: finite(pricePerSc) ? p.sc * pricePerSc : null,
    text: SEGMENT_TEXT[p.key] ?? '',
  }))
}

export interface LaneSource {
  label: string
  sc: number
}

export interface RiskLane {
  risk: RiskKey
  label: string
  openSc: number
  /** Production minus the open sacks. */
  closedSc: number
  /** Fraction of the production still open / already closed. */
  openPct: number
  closedPct: number
  /** Open sacks that are a bought put (protected from a fall, upside kept). */
  floorSc: number
  /** R$ of the open sacks at today's farm price; null without a price. */
  openBrl: number | null
  /** What closed the risk, in sacks (sales, operations); empty when nothing closed it. */
  closedBy: LaneSource[]
  /** True when there is more protection than sacks open. */
  overHedged: boolean
}

/** One lane per risk, in the order the producer cares about: dollar, basis, CBOT. */
export function riskLanes(exp: ExposureOk, pricePerSc: number | null): RiskLane[] {
  const P = exp.productionSc
  const soldClamped = Math.min(exp.soldSc, P)
  const dollarBase = exp.dollar.openSc + exp.dollar.coverSc
  const dollarSales = Math.max(0, P - dollarBase)
  const mk = (risk: RiskKey, f: ExposureOk['basis'], closedBy: LaneSource[]): RiskLane => ({
    risk,
    label: RISK_NAME[risk],
    openSc: f.openSc,
    closedSc: Math.max(0, P - f.openSc),
    openPct: f.pct,
    closedPct: Math.max(0, 1 - f.pct),
    floorSc: f.floorSc,
    openBrl: finite(pricePerSc) ? f.openSc * pricePerSc : null,
    closedBy: closedBy.filter((s) => s.sc > 0.5),
    overHedged: f.overHedged,
  })
  return [
    mk('dolar', exp.dollar, [
      { label: 'Vendas em R$ ou com dólar fixado', sc: dollarSales },
      { label: 'Operações com o dólar travado', sc: exp.dollar.coverSc },
    ]),
    mk('basis', exp.basis, [{ label: 'Vendas', sc: soldClamped }]),
    mk('cbot', exp.cbot, [
      { label: 'Vendas', sc: soldClamped },
      { label: 'Operações em bolsa', sc: exp.cbot.coverSc },
    ]),
  ]
}

export interface SensitivitySteps {
  /** R$ per US$ (dollar move). */
  dolar: number
  /** R$ per sack (basis move). */
  basisBrlSc: number
  /** US¢ per bushel (CBOT move). */
  cbotUsc: number
}

export const DEFAULT_STEPS: SensitivitySteps = { dolar: 0.5, basisBrlSc: 2, cbotUsc: 50 }

export interface SensitivityInput {
  exp: ExposureOk
  /** Scenario in use (today's market by default). */
  fx: number
  bushelsPerSack: number
  /** R$/sc of the price before freight and fees (the part that moves with CBOT, basis and dollar); null if unknown. */
  referencePriceBrl: number | null
  steps: SensitivitySteps
}

export interface SensitivityLine {
  risk: RiskKey
  label: string
  /** The size of the move as typed ("R$ 0,50", "50 US¢/bu"), in the unit of the step. */
  step: number
  /** R$ for the whole open position if the market FALLS by the step (negative = loss). */
  down: number
  /** R$ if the market RISES by the step (positive = gain). */
  up: number
  openSc: number
  /** Sacks that keep the upside but are protected from the fall (bought puts). */
  floorSc: number
}

export interface Sensitivity {
  /** false when it cannot be computed (no usable dollar, price or step). */
  ok: boolean
  lines: SensitivityLine[]
  /** Everything falls together / rises together. */
  allDown: number
  allUp: number
}

/**
 * Effect of a market move on the revenue of the open sacks:
 * - dollar: revenue in US$ = open sacks x (reference price / dollar) per sack; the open US$ costs move the other way,
 *   so they are netted. A bought dollar put keeps the upside only.
 * - basis (R$/sc): each open sack moves 1 R$/sc per R$/sc.
 * - CBOT (US¢/bu): each open sack moves bushelsPerSack / 100 x dollar R$/sc per US¢; a bought put keeps the upside.
 */
export function riskSensitivity(i: SensitivityInput): Sensitivity {
  const { exp, fx, bushelsPerSack: bps, referencePriceBrl: ref, steps } = i
  const usable =
    finite(ref) &&
    ref > 0 &&
    finite(fx) &&
    fx > 0 &&
    finite(bps) &&
    bps > 0 &&
    steps.dolar >= 0 &&
    steps.basisBrlSc >= 0 &&
    steps.cbotUsc >= 0
  if (!usable) return { ok: false, lines: [], allDown: 0, allUp: 0 }

  const usdPerSc = (ref as number) / fx
  const costsUsd = exp.dollar.costsUsd
  const dollarDown = -steps.dolar * (exp.dollar.openSc * usdPerSc - costsUsd)
  const dollarUp = steps.dolar * ((exp.dollar.openSc + exp.dollar.floorSc) * usdPerSc - costsUsd)

  const basisMove = steps.basisBrlSc * exp.basis.openSc

  const brlPerCent = (bps / 100) * fx
  const cbotDown = -steps.cbotUsc * brlPerCent * exp.cbot.openSc
  const cbotUp = steps.cbotUsc * brlPerCent * (exp.cbot.openSc + exp.cbot.floorSc)

  const lines: SensitivityLine[] = [
    {
      risk: 'dolar',
      label: RISK_NAME.dolar,
      step: steps.dolar,
      down: dollarDown,
      up: dollarUp,
      openSc: exp.dollar.openSc,
      floorSc: exp.dollar.floorSc,
    },
    {
      risk: 'basis',
      label: RISK_NAME.basis,
      step: steps.basisBrlSc,
      down: -basisMove,
      up: basisMove,
      openSc: exp.basis.openSc,
      floorSc: 0,
    },
    {
      risk: 'cbot',
      label: RISK_NAME.cbot,
      step: steps.cbotUsc,
      down: cbotDown,
      up: cbotUp,
      openSc: exp.cbot.openSc,
      floorSc: exp.cbot.floorSc,
    },
  ]
  return {
    ok: true,
    lines,
    allDown: lines.reduce((s, l) => s + l.down, 0),
    allUp: lines.reduce((s, l) => s + l.up, 0),
  }
}

/** "dólar", "basis" or "CBOT" for a list of risks: "dólar e basis", "CBOT, basis e dólar". */
export function riskList(risks: RiskKey[]): string {
  const names = risks.map((r) => RISK_LABEL[r])
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}` : (names[0] ?? '')
}

// ───────────────────────────────────── donut per risk ─────────────────────────────────────

/**
 * How a slice of a per-risk donut is painted: closed by sales, closed by exchange operations, protected by a put (falls
 * are covered, the rise is kept), open but offset by open US$ costs (dollar only), and open.
 */
export type SliceTone = 'sales' | 'ops' | 'put' | 'offset' | 'open'

export interface DonutSlice {
  key: string
  label: string
  sc: number
  /** Fraction of the production (0..1). */
  pct: number
  /** R$ at the farm price of today; null without a price. */
  brl: number | null
  tone: SliceTone
  /** Plain-language reading. */
  text: string
}

/**
 * The production split by what closed (or did not close) ONE risk: sales, operations, puts and what is left open. The
 * slices always add up to the production. For the dollar the open part is split into what the open US$ costs offset
 * (the natural opposite position) and what is really exposed.
 */
export function riskDonut(exp: ExposureOk, risk: RiskKey, pricePerSc: number | null): DonutSlice[] {
  const P = exp.productionSc
  const soldClamped = Math.min(exp.soldSc, P)
  const f = risk === 'dolar' ? exp.dollar : risk === 'cbot' ? exp.cbot : exp.basis
  const put = risk === 'basis' ? 0 : Math.min(f.floorSc, f.coverSc)
  const ops = risk === 'basis' ? 0 : Math.max(0, f.coverSc - put)
  // Sacks sold: the sales that closed this risk (for the dollar, only those in R$ or with a typed dollar).
  const sales = risk === 'dolar' ? Math.max(0, P - (f.openSc + f.coverSc)) : soldClamped
  const open = Math.max(0, P - sales - ops - put)
  const offset = risk === 'dolar' && exp.dollar.costsSc !== null ? Math.min(open, exp.dollar.costsSc) : 0
  const name = RISK_LABEL[risk]
  const value = (sc: number) => (finite(pricePerSc) ? sc * pricePerSc : null)
  const slice = (key: string, label: string, sc: number, tone: SliceTone, text: string): DonutSlice => ({
    key,
    label,
    sc,
    pct: P > 0 ? sc / P : 0,
    brl: value(sc),
    tone,
    text,
  })
  const all: DonutSlice[] = [
    slice(
      'vendas',
      risk === 'dolar' ? 'Vendas com dólar fechado' : 'Vendidas',
      sales,
      'sales',
      risk === 'dolar'
        ? 'Vendas em R$ ou em US$ com o dólar fixado: o dólar dessas sacas não mexe mais.'
        : `Sacas vendidas: o ${name} delas já está fechado.`,
    ),
    slice(
      'operacoes',
      'Protegidas por operações',
      ops,
      'ops',
      `Futuros e accumulators em bolsa travam o ${name} dessas sacas.`,
    ),
    slice(
      'put',
      'Protegidas por put',
      put,
      'put',
      `A put protege da queda do ${name} e mantém a alta (sem travar o preço).`,
    ),
    slice(
      'compensado',
      'Aberto, compensado por custos em US$',
      offset,
      'offset',
      'Receita em dólar aberta que tem, do outro lado, custos em US$ também abertos: se o dólar sobe, os dois sobem.',
    ),
    slice(
      'aberto',
      risk === 'dolar' && offset > 0 ? 'Exposto de fato' : 'Em aberto',
      open - offset,
      'open',
      `O ${name} dessas sacas ainda não está fechado: elas ganham ou perdem com o mercado.`,
    ),
  ]
  return all.filter((s) => s.sc > 1e-9)
}
