import type { AppState } from './types'

/**
 * How far the visitor is in the app. The landing button uses it to choose where to send them, and the Resultados
 * page is locked until the producer has filled the three basics.
 *
 * There is no account and nothing is prefilled: the area, the productivity and the cost start at zero, so a field
 * counts as filled when its value is above zero.
 * - 'sem-custos': the farm (area, productivity) or the cost per hectare is still missing.
 * - 'com-custos': area, productivity and cost per hectare were all filled by the producer.
 */
export type JourneyState = 'sem-custos' | 'com-custos'

export interface Journey {
  state: JourneyState
  /** Area and productivity filled by the producer. */
  hasFarm: boolean
  /** Cost per hectare filled by the producer (typed as a total, through the categories, in US$ or in sc/ha). */
  hasCosts: boolean
  /** What is still missing, in pt-BR: 'área', 'produtividade', 'custo por hectare'. */
  missing: string[]
}

/**
 * The category mode folds into the same inputs (`costPerHaBrl` is the fixed R$ part, `costUsd` the US$ lines,
 * `costScHa` the sc/ha rent), so one check covers both ways of typing the cost.
 */
export function journeyOf(s: AppState): Journey {
  const { areaHa, yieldScHa, costPerHaBrl, costUsd, costScHa } = s.inputs

  const hasArea = areaHa > 0
  const hasYield = yieldScHa > 0
  const hasFarm = hasArea && hasYield
  const hasCosts = costPerHaBrl > 0 || costUsd.length > 0 || costScHa > 0

  const missing: string[] = []
  if (!hasArea) missing.push('área')
  if (!hasYield) missing.push('produtividade')
  if (!hasCosts) missing.push('custo por hectare')

  const state: JourneyState = hasFarm && hasCosts ? 'com-custos' : 'sem-custos'
  return { state, hasFarm, hasCosts, missing }
}
