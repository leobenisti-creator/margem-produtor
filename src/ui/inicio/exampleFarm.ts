import type { CostCategoryId } from '../../data/types'

/**
 * ILLUSTRATIVE example farm of the Início page.
 *
 * These numbers are INVENTED example values: they are not data from any source and they are not the visitor's
 * data. They exist only so the landing page can show what a filled-in farm looks like (the margin of the example,
 * the cost bars, the Adubação weight). The visitor's own farm starts empty in the app.
 */
export const EXAMPLE_FARM = {
  areaHa: 1000,
  /** sc/ha. */
  yieldScHa: 61.3,
  /** R$/ha, the sum of `costByGroupBrlHa`. */
  costPerHaBrl: 6627.48,
  /** R$ per sack (freight to the port). */
  freightBrlPerSc: 29.358,
} as const

/** Example cost per group, R$/ha (invented; adds up to `EXAMPLE_FARM.costPerHaBrl`). */
export const EXAMPLE_COST_BY_GROUP: Record<CostCategoryId, number> = {
  sementes: 440.54,
  fertilizantes: 2072.83,
  defensivos: 1104.13,
  operacoes: 1137.66,
  maoDeObra: 569.93,
  arrendamento: 423.96,
  financeiro: 453.9,
  outros: 424.53,
}

/** Example Adubação items, R$/ha (invented; add up to the `fertilizantes` group above). */
export const EXAMPLE_ADUBACAO_BRL_HA = {
  corretivos: 253.91,
  macro: 1712.6,
  micro: 106.32,
} as const
