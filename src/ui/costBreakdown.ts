import { allItemsOf } from '../data/costItems'
import { COST_CATEGORY_IDS, COST_CATEGORY_LABELS, type CostCategoryId } from '../data/types'
import { effectiveFx, rentBrlHa } from '../engine/calc'
import type { AppState } from '../state/types'
import { groupTodayBrlHa } from './costView'

export type CostStatus = 'realizado' | 'orcado'

export interface CostSlice {
  id: string
  group: CostCategoryId
  label: string
  /** Today's R$/ha (US$ at its effective dollar, sc/ha rent at today's farm price). */
  brlHa: number
  status: CostStatus
}

const usable = (n: number) => Number.isFinite(n) && n > 0

/** One item's cost per ha today; 0 for "não uso", NaN when it cannot be valued (rent without a price). */
function itemTodayBrlHa(state: AppState, group: CostCategoryId, itemId: string, fx: number, farmPrice: number | null): number {
  const it = state.costGroups[group].items[itemId]
  if (!it || it.mode === 'nao') return 0
  if (it.unit === 'scHa') return rentBrlHa(it.valueBrlHa, farmPrice ?? Number.NaN)
  const pair = it.usd ? (it.usd.followDefault ? state.costFxDefault : it.usd) : null
  const usd = it.usd && pair ? it.usd.amountUsdHa * effectiveFx(pair.boughtPct, pair.boughtRate, fx) : 0
  return it.valueBrlHa + usd
}

/**
 * What the producer filled in, as slices of the whole cost per hectare: a group kept as one total is one slice;
 * a group opened into items gives one slice per item above zero. Only meaningful in the "Por categoria" mode.
 */
export function costSlices(state: AppState, fx: number, farmPrice: number | null): CostSlice[] {
  const out: CostSlice[] = []
  for (const group of COST_CATEGORY_IDS) {
    const g = state.costGroups[group]
    if (g.mode === 'total') {
      const v = groupTodayBrlHa(state, group, fx, farmPrice)
      if (v !== null && usable(v)) {
        out.push({ id: group, group, label: COST_CATEGORY_LABELS[group], brlHa: v, status: g.budgeted ? 'orcado' : 'realizado' })
      }
      continue
    }
    for (const def of allItemsOf(group)) {
      const v = itemTodayBrlHa(state, group, def.id, fx, farmPrice)
      if (!usable(v)) continue
      const it = state.costGroups[group].items[def.id]
      const status: CostStatus = it.budgeted ? 'orcado' : 'realizado'
      out.push({ id: def.id, group, label: def.label, brlHa: v, status })
    }
  }
  return out
}

export interface StatusTotals {
  totalBrlHa: number
  brlHa: Record<CostStatus, number>
  /** Fractions 0..1 of the total (all 0 when the total is 0). */
  share: Record<CostStatus, number>
  /** True when something is marked budgeted: the analysis only appears then. */
  hasBudgeted: boolean
}

export function statusTotals(slices: CostSlice[]): StatusTotals {
  const brlHa: Record<CostStatus, number> = { realizado: 0, orcado: 0 }
  for (const s of slices) brlHa[s.status] += s.brlHa
  const totalBrlHa = brlHa.realizado + brlHa.orcado
  const frac = (n: number) => (totalBrlHa > 0 ? n / totalBrlHa : 0)
  return {
    totalBrlHa,
    brlHa,
    share: { realizado: frac(brlHa.realizado), orcado: frac(brlHa.orcado) },
    hasBudgeted: slices.some((s) => s.status === 'orcado'),
  }
}

export interface CurrencyMix {
  /** Today's R$/ha by how the cost is quoted. */
  brlHa: { brl: number; usdFixed: number; usdOpen: number; sacas: number }
  totalBrlHa: number
  /** Fractions 0..1 of the total (all 0 when the total is 0). */
  share: { brl: number; usdFixed: number; usdOpen: number; sacas: number }
  /** US$/ha still at the market dollar (what the dollar exposure of the costs is made of). */
  usdOpenUsdHa: number
  hasUsd: boolean
}

/**
 * How much of the whole cost is in R$, in US$ already fixed (bought at a rate), in US$ still open (market dollar,
 * so exposed) and in sacks (the rent typed in sc/ha). Same valuation as `costSlices`, so the parts add up to the total.
 */
export function costCurrencyMix(state: AppState, fx: number, farmPrice: number | null): CurrencyMix {
  const brlHa = { brl: 0, usdFixed: 0, usdOpen: 0, sacas: 0 }
  let usdOpenUsdHa = 0
  const addUsd = (u: { amountUsdHa: number; boughtPct: number; boughtRate: number }) => {
    const fixed = u.amountUsdHa * u.boughtPct * u.boughtRate
    const open = u.amountUsdHa * (1 - u.boughtPct) * fx
    if (Number.isFinite(fixed)) brlHa.usdFixed += fixed
    if (Number.isFinite(open)) brlHa.usdOpen += open
    if (u.boughtPct < 1) usdOpenUsdHa += u.amountUsdHa * (1 - u.boughtPct)
  }
  const pairOf = (u: NonNullable<AppState['costGroups'][CostCategoryId]['totalUsd']>) =>
    u.followDefault ? { amountUsdHa: u.amountUsdHa, ...state.costFxDefault } : u
  for (const group of COST_CATEGORY_IDS) {
    const g = state.costGroups[group]
    if (g.mode === 'total') {
      if (g.totalUsd) addUsd(pairOf(g.totalUsd))
      else brlHa.brl += g.totalBrlHa
      continue
    }
    for (const def of allItemsOf(group)) {
      const it = g.items[def.id]
      if (!it || it.mode === 'nao') continue
      if (it.unit === 'scHa') {
        const v = rentBrlHa(it.valueBrlHa, farmPrice ?? Number.NaN)
        if (Number.isFinite(v)) brlHa.sacas += v
      } else {
        brlHa.brl += it.valueBrlHa
        if (it.usd) addUsd(pairOf(it.usd))
      }
    }
  }
  const totalBrlHa = brlHa.brl + brlHa.usdFixed + brlHa.usdOpen + brlHa.sacas
  const f = (n: number) => (totalBrlHa > 0 ? n / totalBrlHa : 0)
  return {
    brlHa,
    totalBrlHa,
    share: { brl: f(brlHa.brl), usdFixed: f(brlHa.usdFixed), usdOpen: f(brlHa.usdOpen), sacas: f(brlHa.sacas) },
    usdOpenUsdHa,
    hasUsd: brlHa.usdFixed + brlHa.usdOpen > 0,
  }
}

/**
 * The chart's slices: one per category (8 at most). The items a producer opened a category into are not slices of
 * the chart; they only show inside the card of their category. A category is "orçado" if any of its slices is.
 */
export function categorySlices(slices: CostSlice[]): CostSlice[] {
  const out: CostSlice[] = []
  for (const group of COST_CATEGORY_IDS) {
    const inGroup = slices.filter((s) => s.group === group)
    if (inGroup.length === 0) continue
    const status: CostStatus = inGroup.some((s) => s.status === 'orcado') ? 'orcado' : 'realizado'
    out.push({
      id: group,
      group,
      label: COST_CATEGORY_LABELS[group],
      brlHa: inGroup.reduce((a, s) => a + s.brlHa, 0),
      status,
    })
  }
  return out
}

/**
 * True while the cost still is what the producer typed in the categories: always in "Por categoria"; and back on the
 * single "Total" it is the sum of those categories until a total is typed straight over it (that clears the snapshot).
 * The chart and the biggest-cost card live on this; a total typed directly makes them disappear.
 */
export function categoriesInEffect(state: AppState): boolean {
  if (state.costMode === 'categorias') return true
  return state.costTotalSnapshot !== null && state.inputs.costPerHaBrl === state.costTotalSnapshot
}

export interface LargestCost {
  label: string
  brlHa: number
  /** Fraction 0..1 of the whole cost. */
  share: number
}

/**
 * The biggest cost: the biggest category of the chart (an opened category counts as the sum of its items).
 * With a single typed total there is no split of the producer's own, so there is no biggest cost (null).
 */
export function largestCost(state: AppState, fx: number, farmPrice: number | null): LargestCost | null {
  if (!categoriesInEffect(state)) return null
  const slices = categorySlices(costSlices(state, fx, farmPrice))
  const total = statusTotals(slices).totalBrlHa
  const top = slices.reduce<CostSlice | null>((m, s) => (m === null || s.brlHa > m.brlHa ? s : m), null)
  return top && total > 0 ? { label: top.label, brlHa: top.brlHa, share: top.brlHa / total } : null
}

export interface TooltipItem {
  id: string
  label: string
  brlHa: number
  /** Fractions 0..1 of the category and of the whole cost. */
  shareGroup: number
  shareTotal: number
  status: CostStatus
}

export interface SliceTooltip {
  group: CostCategoryId
  title: string
  /** The whole category (every slice of the group added). */
  brlHa: number
  shareTotal: number
  /** Present when the category was opened into items: all of them, biggest first. */
  items: TooltipItem[] | null
}

/**
 * What the pointer shows over a slice of the chart (a category; `slices` are the item-level ones): the category with its cost and share of the whole cost, and, when the producer
 * opened the category into items, every item with its share of the category and of the whole cost.
 */
export function sliceTooltip(slices: CostSlice[], group: CostCategoryId): SliceTooltip | null {
  const hit = slices.find((s) => s.group === group)
  if (!hit) return null
  const total = slices.reduce((a, s) => a + s.brlHa, 0)
  const inGroup = slices.filter((s) => s.group === hit.group)
  const groupTotal = inGroup.reduce((a, s) => a + s.brlHa, 0)
  const frac = (n: number, d: number) => (d > 0 ? n / d : 0)
  const itemized = hit.id !== hit.group
  return {
    group: hit.group,
    title: COST_CATEGORY_LABELS[hit.group],
    brlHa: groupTotal,
    shareTotal: frac(groupTotal, total),
    items: itemized
      ? [...inGroup]
          .sort((a, b) => b.brlHa - a.brlHa)
          .map((s) => ({
            id: s.id,
            label: s.label,
            brlHa: s.brlHa,
            shareGroup: frac(s.brlHa, groupTotal),
            shareTotal: frac(s.brlHa, total),
            status: s.status,
          }))
      : null,
  }
}
