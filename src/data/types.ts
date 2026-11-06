import type { CropId } from '../engine/crops'
import type { MarketHistory } from '../engine/history'

export type DataKind = 'fechamento' | 'ao_vivo' | 'manual'

export interface Quote {
  value: number
  unit: string
  /** ISO date (YYYY-MM-DD) */
  asOf: string
  source: string
  kind: DataKind
}

export interface MarketSnapshot {
  cbotUsc: Record<CropId, Quote>
  fx: Quote
  b3: Record<CropId, Quote>
  cepea: Record<CropId, Quote>
  basisUsc: Record<CropId, Quote>
  /** Daily settles (CBOT per crop, dollar) the market operations are checked against; absent = no history yet. */
  history?: MarketHistory
  /** ISO date of today; absent = the system date (tests and demos can pin it). */
  today?: string
}

export interface MarketDataProvider {
  getSnapshot(): Promise<MarketSnapshot>
}

export type CostCategoryId =
  'sementes' | 'fertilizantes' | 'defensivos' | 'operacoes' | 'maoDeObra' | 'arrendamento' | 'financeiro' | 'outros'

export const COST_CATEGORY_IDS: readonly CostCategoryId[] = [
  'sementes',
  'fertilizantes',
  'defensivos',
  'operacoes',
  'maoDeObra',
  'arrendamento',
  'financeiro',
  'outros',
]

export const COST_CATEGORY_LABELS: Record<CostCategoryId, string> = {
  sementes: 'Sementes',
  fertilizantes: 'Adubação',
  defensivos: 'Defensivos',
  operacoes: 'Operações / máquinas',
  maoDeObra: 'Mão de obra',
  arrendamento: 'Arrendamento',
  financeiro: 'Financeiro / seguro',
  outros: 'Outros custos',
}
