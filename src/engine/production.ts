/**
 * THE single source of truth for the production the app calculates with.
 *
 * When the producer swaps part of the crop for fertilizer with the reseller ("barter"), those sacks leave the
 * crop and enter NONE of his numbers: the production used everywhere is
 *
 *   net = max(0, area × productivity − barter)
 *
 * Nothing else in the code may multiply area by productivity to get a production (a source scan in
 * `production.test.ts` enforces it): use `netProductionSc`, `productionOf` or `effectiveYieldScHa`.
 * Costs stay as typed (R$/ha × area), so the cost per sack is the whole cost divided by the NET production.
 */

/** What the production needs from the farm inputs (structurally compatible with `FarmInputs`). */
export interface ProductionInput {
  areaHa: number
  yieldScHa: number
  /** Sacks delivered to the reseller; absent, negative or not finite = 0. */
  barterSc?: number
}

/** The barter as a safe number: finite and >= 0, anything else is 0. */
export function normalizeBarter(barterSc: unknown): number {
  return typeof barterSc === 'number' && Number.isFinite(barterSc) && barterSc > 0 ? barterSc : 0
}

/** Gross production of the field (area × productivity), before the barter. Only for "de Y sc" and for validation. */
export function grossProductionSc(areaHa: number, yieldScHa: number): number {
  return areaHa * yieldScHa
}

/**
 * Net production in sacks: the gross one less the barter, never below 0. Without barter this is exactly
 * `areaHa × yieldScHa` (bit for bit, NaN included, so every old number stays the same).
 */
export function netProductionSc(areaHa: number, yieldScHa: number, barterSc?: number): number {
  const gross = grossProductionSc(areaHa, yieldScHa)
  const barter = normalizeBarter(barterSc)
  if (barter === 0 || !Number.isFinite(gross)) return gross
  return Math.max(0, gross - barter)
}

/** Net production of the farm inputs. */
export function productionOf(i: ProductionInput): number {
  return netProductionSc(i.areaHa, i.yieldScHa, i.barterSc)
}

/** Gross production of the farm inputs (area × productivity). */
export function grossProductionOf(i: ProductionInput): number {
  return grossProductionSc(i.areaHa, i.yieldScHa)
}

/**
 * Net sacks per hectare (net production ÷ area): the divisor of every "per sack" cost and the multiplier of every
 * "per hectare" margin. Exactly `yieldScHa` without barter (or without an area to spread it over).
 */
export function effectiveYieldScHa(i: ProductionInput): number {
  const barter = normalizeBarter(i.barterSc)
  if (barter === 0 || !(i.areaHa > 0) || !Number.isFinite(i.areaHa)) return i.yieldScHa
  const net = productionOf(i)
  return Number.isFinite(net) ? net / i.areaHa : i.yieldScHa
}

/** Error text (pt-BR) for a barter typed against a gross production; null when acceptable. */
export function barterProblem(barterSc: number, grossSc: number): string | null {
  if (typeof barterSc !== 'number' || !Number.isFinite(barterSc)) return 'Informe um número válido.'
  if (barterSc < 0) return 'As sacas do barter não podem ser negativas.'
  if (barterSc > 0 && !(Number.isFinite(grossSc) && grossSc > 0)) {
    return 'Informe a área e a produtividade antes de lançar o barter.'
  }
  if (barterSc > grossSc) return 'As sacas do barter não podem passar da produção da lavoura.'
  return null
}
