import { COST_CATEGORY_IDS, type CostCategoryId } from '../data/types'
import type { CostUsdLine } from '../engine/calc'
import { validCustomContents, type ProductRow } from '../engine/products'
import { allItemsOf } from '../data/costItems'
import type {
  CostFxDefault,
  CostGroupState,
  CostGroups,
  CostItemState,
  UsdCost,
} from './types'

export type CostBreakdown = Record<CostCategoryId, number>

export function zeroCategories(): CostBreakdown {
  return Object.fromEntries(COST_CATEGORY_IDS.map((id) => [id, 0])) as CostBreakdown
}

/** Sum of the categories, rounded to 1e-6 to hide float noise. */
export function sumCategories(c: CostBreakdown): number {
  const s = COST_CATEGORY_IDS.reduce((acc, id) => acc + (c[id] ?? 0), 0)
  return Math.round(s * 1e6) / 1e6
}

// ---- Per-group / per-item cost model (redesign Task 4) ----

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** The item that may be typed in sc/ha. */
export const SC_HA_ITEM = 'arrendamento.valor'

/** An item still untouched: not used, zero. */
export function freshItem(): CostItemState {
  return { mode: 'nao', valueBrlHa: 0, unit: 'ha', usd: null, rows: null }
}

/** Groups in total mode with the given totals and every item in its default state. */
export function freshGroups(totals: CostBreakdown = zeroCategories()): CostGroups {
  const out = {} as CostGroups
  for (const g of COST_CATEGORY_IDS) {
    const items: Record<string, CostItemState> = {}
    for (const it of allItemsOf(g)) items[it.id] = freshItem()
    out[g] = { mode: 'total', totalBrlHa: totals[g] ?? 0, totalTyped: false, totalUsd: null, items }
  }
  return out
}

/** pt-BR error for a US$ cost, or null. A positive rate is required whenever part is bought. */
export function validateUsdCost(u: { amountUsdHa?: unknown; boughtPct?: unknown; boughtRate?: unknown }): string | null {
  if (!fin(u.amountUsdHa) || u.amountUsdHa < 0) return 'Informe um valor em US$ válido.'
  return validateFxPair(u.boughtPct, u.boughtRate)
}

/** Shared rule for (fraction, rate) pairs: fraction 0..1, rate finite ≥ 0 and > 0 when fraction > 0. */
export function validateFxPair(pct: unknown, rate: unknown): string | null {
  if (!fin(pct) || pct < 0 || pct > 1) return 'O percentual deve estar entre 0% e 100%.'
  if (!fin(rate) || rate < 0 || (pct > 0 && rate <= 0)) return 'O dólar deve ser maior que zero.'
  return null
}

export function isProductRow(v: unknown): v is ProductRow {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const r = v as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    (r.productId === null || typeof r.productId === 'string') &&
    typeof r.name === 'string' &&
    fin(r.dose) &&
    r.dose >= 0 &&
    (r.doseUnit === 'kg' || r.doseUnit === 't' || r.doseUnit === 'L') &&
    fin(r.price) &&
    r.price >= 0 &&
    (r.priceUnit === 't' || r.priceUnit === 'kg' || r.priceUnit === 'L' || r.priceUnit === 'ha') &&
    (r.currency === 'BRL' || r.currency === 'USD') &&
    fin(r.applications) &&
    r.applications >= 0 &&
    (r.custom === undefined || validCustomContents(r.custom))
  )
}

/** Copy of a product row (its custom contents too). */
export function copyRow(r: ProductRow): ProductRow {
  return r.custom ? { ...r, custom: { ...r.custom } } : { ...r }
}

function usdLine(u: UsdCost, def: CostFxDefault): CostUsdLine {
  const fx = u.followDefault ? def : u
  return { usdPerHa: u.amountUsdHa, boughtPct: fx.boughtPct, boughtRate: fx.boughtRate }
}

export interface CostFold {
  /** Fixed R$ part of each group. */
  categories: CostBreakdown
  /** Σ categories (rounded like `sumCategories`). */
  brlFixed: number
  /** One line per US$ item or US$ group total, in group/item order. */
  usdLines: CostUsdLine[]
  /** sc/ha of the arrendamento item typed in sacks (0 when not used). */
  arrendamentoScHa: number
}

function foldGroup(
  g: CostGroupState,
  ids: string[],
  def: CostFxDefault,
  lines: CostUsdLine[],
): { brl: number; scHa: number } {
  if (g.mode === 'total') {
    if (g.totalUsd) {
      lines.push(usdLine(g.totalUsd, def))
      return { brl: 0, scHa: 0 }
    }
    return { brl: g.totalBrlHa, scHa: 0 }
  }
  let brl = 0
  let scHa = 0
  for (const id of ids) {
    const it = g.items[id]
    if (!it || it.mode === 'nao') continue
    if (it.unit === 'scHa') {
      scHa += it.valueBrlHa
    } else {
      // R$ part and US$ part are both summed (a product table may mix currencies).
      brl += it.valueBrlHa
      if (it.usd) lines.push(usdLine(it.usd, def))
    }
  }
  return { brl, scHa }
}

/** One group alone: its fixed R$ part, its US$ lines and its sc/ha (for the per-group display). */
export function foldOneGroup(
  groups: CostGroups,
  group: CostCategoryId,
  def: CostFxDefault,
): { brl: number; usdLines: CostUsdLine[]; scHa: number } {
  const usdLines: CostUsdLine[] = []
  const ids = allItemsOf(group).map((i) => i.id)
  const r = foldGroup(groups[group], ids, def, usdLines)
  return { brl: r.brl, usdLines, scHa: r.scHa }
}

/** Folds the per-group model into the fixed R$ part, the US$ lines and the sc/ha arrendamento. */
export function foldCosts(groups: CostGroups, def: CostFxDefault): CostFold {
  const categories = zeroCategories()
  const usdLines: CostUsdLine[] = []
  let arrendamentoScHa = 0
  for (const id of COST_CATEGORY_IDS) {
    const ids = allItemsOf(id).map((i) => i.id)
    const r = foldGroup(groups[id], ids, def, usdLines)
    categories[id] = r.brl
    arrendamentoScHa += r.scHa
  }
  return { categories, brlFixed: sumCategories(categories), usdLines, arrendamentoScHa }
}
