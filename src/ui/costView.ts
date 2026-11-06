import type { CostCategoryId } from '../data/types'
import { isDemaisItem } from '../data/costItems'
import { effectiveFx, inputsAtPrice, rentBrlHa, type FarmInputs } from '../engine/calc'
import { foldOneGroup } from '../state/costs'
import type { AppState } from '../state/types'

const finite = (n: number): number | null => (Number.isFinite(n) ? n : null)

/** Whole cost per ha at today's dollar and farm price (US$ lines and sc/ha rent folded in); null if unusable. */
export function todayCostBrlHa(i: FarmInputs, fx: number, farmPrice: number | null): number | null {
  return finite(inputsAtPrice(i, fx, farmPrice ?? Number.NaN).costPerHaBrl)
}

/** One group's whole cost per ha today (R$ part + US$ lines at their effective dollar + sc/ha rent). */
export function groupTodayBrlHa(
  state: AppState,
  group: CostCategoryId,
  fx: number,
  farmPrice: number | null,
): number | null {
  const g = foldOneGroup(state.costGroups, group, state.costFxDefault)
  const usd = g.usdLines.reduce((s, l) => s + l.usdPerHa * effectiveFx(l.boughtPct, l.boughtRate, fx), 0)
  return finite(g.brl + usd + rentBrlHa(g.scHa, farmPrice ?? Number.NaN))
}

/** Items that open the "Detalhar" product table: Adubação and Defensivos (not their remainder). */
export function hasDetail(itemId: string): boolean {
  return (itemId.startsWith('adubacao.') || itemId.startsWith('defensivos.')) && !isDemaisItem(itemId)
}
