import type { CropId } from '../engine/crops'
import type { FarmInputs } from '../engine/calc'
import type { CostCategoryId } from '../data/types'
import type { ProductRow } from '../engine/products'
import type { SaleTranche } from '../engine/sales'
import type { HedgeOp } from '../engine/hedge'

/**
 * Size of one step of the Resultados financeiros matrix (the grid goes from -4 to +4 steps of it): % of the CBOT, %
 * of the dollar and R$/sc of the basis. Separate from `stepsPct` (the Simulador matrix).
 */
export interface ResultSteps {
  cbotPct: number
  fxPct: number
  basisBrl: number
}

/** Matrix 9×9 settings: four % steps (strictly increasing, < 100), the yield selector and the Resultados steps. */
export interface MatrixSettings {
  stepsPct: [number, number, number, number]
  /** Steps of the Resultados financeiros matrix. */
  resultSteps: ResultSteps
  /** 0.9 (−10%), 1 (base) or 1.1 (+10%). */
  yieldFactor: number
}

export const YIELD_FACTORS: readonly number[] = [0.9, 1, 1.1]

/** 'valor' = typed value; 'nao' = not used (zero). */
export type ItemMode = 'valor' | 'nao'

/** A cost quoted in US$/ha, a fraction of it already bought at `boughtRate`. */
export interface UsdCost {
  amountUsdHa: number
  /** Fraction 0..1 already bought. */
  boughtPct: number
  /** R$/US$ of the part already bought; > 0 whenever `boughtPct` > 0. */
  boughtRate: number
  /** True when the item has no own dollar settings and follows `costFxDefault`. */
  followDefault?: boolean
}

/** US$ amount as typed in an action; omitting `boughtPct` means "follow the default dollar". */
export interface UsdInput {
  amountUsdHa: number
  boughtPct?: number
  boughtRate?: number
}

export interface CostItemState {
  mode: ItemMode
  /**
   * Typed R$ part of the item, kept while the mode changes (R$/ha); sc/ha when `unit` is 'scHa'
   * (only `arrendamento.valor`; the engine converts it at each scenario's farm price).
   */
  valueBrlHa: number
  unit: 'ha' | 'scHa'
  /** Typed US$ part (mode 'valor'); summed together with the R$ part (a product table may mix both). */
  usd: UsdCost | null
  /** Product table from "Detalhar" (Adubação/Defensivos); informational for the sum. */
  rows: ProductRow[] | null
  /** Optional freight to the farm (R$/t) typed in the product table; absent = none. */
  freightBrlTon?: number
  /** True = budgeted (orçado); absent = already incurred (realizado), the default. Informational only. */
  budgeted?: boolean
}

export interface CostGroupState {
  mode: 'total' | 'itens'
  totalBrlHa: number
  /** True when the producer typed this group total (as opposed to one spread from a single typed total). */
  totalTyped: boolean
  /** Non-null: the group total is in US$. */
  totalUsd: UsdCost | null
  /** Budgeted (orçado) group total; absent = realizado. Only read while `mode` is 'total'. */
  budgeted?: boolean
  items: Record<string, CostItemState>
}

export type CostGroups = Record<CostCategoryId, CostGroupState>

export interface CostFxDefault {
  boughtPct: number
  boughtRate: number
}

export interface CostItemPatch {
  mode?: ItemMode
  valueBrlHa?: number
  unit?: 'ha' | 'scHa'
  usd?: UsdInput | null
  rows?: ProductRow[] | null
  /** null clears the freight. */
  freightBrlTon?: number | null
}

export type NumericInputKey = Exclude<
  keyof FarmInputs,
  'marginBase' | 'targetMargin' | 'costUsd' | 'fxLockPct' | 'fxLockRate' | 'costScHa' | 'barterSc'
>
export type OverrideKey = 'cbotUsc' | 'basisUsc' | 'fx'

export interface Overrides {
  cbotUsc?: number
  /** The port premium typed in Lavoura e custos (US¢/bu). Only that card writes it. */
  basisUsc?: number
  fx?: number
  /**
   * Premium (US¢/bu) of the scenario chosen in Resultados financeiros (a basis typed there or a basis cell clicked):
   * a simulation that sits on top of `basisUsc` and never changes it.
   */
  simBasisUsc?: number
}

export interface AppState {
  crop: CropId
  /** Ponto FOB (src/data/fobPoints.ts) or 'outro' (typed base); its base feeds the scenario. */
  fobId: string
  /** Typed base (US¢/bu, > 0) while `fobId` is 'outro'; null otherwise. */
  customBasisUsc: number | null
  currency: 'BRL' | 'USD'
  areaUnit: 'scHa' | 'tHa'
  /** `inputs.marginBase` is the single home of the margin base. */
  inputs: FarmInputs
  /**
   * 'total' = one cost field (`inputs.costPerHaBrl`, legacy); 'categorias' = the per-group model in
   * `costGroups` drives `inputs.costPerHaBrl` (fixed R$ part) and `inputs.costUsd`.
   */
  costMode: 'total' | 'categorias'
  /** Fixed R$ part of each group, derived from `costGroups` (kept for the category UI). */
  costCategories: Record<CostCategoryId, number>
  costGroups: CostGroups
  /** Default "dollar of my US$ costs" for items without their own settings. */
  costFxDefault: CostFxDefault
  /**
   * Single total set by the last switch from 'categorias' to 'total' (the whole cost at that moment).
   * While the total still equals it, switching back restores the groups as they were; null otherwise.
   */
  costTotalSnapshot: number | null
  overrides: Overrides
  matrix: MatrixSettings
  includeSold: boolean
  tourSeen: boolean
  /**
   * Sales already made, by tranche. While at least one is valid, `inputs.soldPct` and
   * `inputs.soldAvgPriceBrl` are DERIVED from them (production = areaHa × yieldScHa less the barter).
   */
  sales: SaleTranche[]
  /**
   * LEGACY: the typed "% vendido" and "preço médio vendido" of the old step-3 fields; no UI writes it
   * any more (tranches replaced it). Kept so older saved states load; drives `inputs` when no tranche is valid.
   */
  soldManual: { soldPct: number; soldAvgPriceBrl: number }
  /** Market operations (futures, puts, calls on soybeans or the dollar) typed by the producer. */
  hedgeOps: HedgeOp[]
  /**
   * Barter: sacks of each crop the producer delivers to the reseller (0 = none). They leave the crop and enter no
   * calculation (see engine/production). `inputs.barterSc` mirrors the value of the crop on screen (the reducer keeps
   * it in sync), so every engine reads the net production from `inputs` alone.
   */
  barterSc: Record<CropId, number>
}

/** Fields of a tranche as typed in `addSale` / `updateSale` (the id is the reducer's). */
export type SalePatch = Partial<Omit<SaleTranche, 'id'>>

/** Fields of an operation as typed in `addHedgeOp` / `updateHedgeOp` (the id is the reducer's). */
export type HedgeOpPatch = Partial<
  Omit<
    HedgeOp,
    | 'id'
    | 'lotSize'
    | 'startDate'
    | 'maturityDate'
    | 'maturityMonth'
    | 'closedDate'
    | 'barrier'
    | 'accum'
    | 'closePrice'
    | 'closeValueUsd'
    | 'costBrl'
    | 'barrierHitDate'
    | 'contract'
    | 'floorLevel'
    | 'premiumDir'
  >
> & {
  lotSize?: number | null
  /** ISO dates; null or '' clears. */
  startDate?: string | null
  maturityDate?: string | null
  /** YYYY-MM; null or '' clears. */
  maturityMonth?: string | null
  closedDate?: string | null
  closePrice?: number | null
  closeValueUsd?: number | null
  costBrl?: number | null
  barrierHitDate?: string | null
  contract?: string | null
  floorLevel?: number | null
  premiumDir?: 'pago' | 'recebido' | null
  barrier?: HedgeOp['barrier'] | null
  accum?: HedgeOp['accum'] | null
}

export type Action =
  | { type: 'setCrop'; crop: CropId }
  /** A point of the current crop or 'outro'. */
  | { type: 'setFob'; fobId: string }
  /** Typed base for "Outro" (finite > 0) or null. */
  | { type: 'setCustomBasis'; value: number | null }
  | { type: 'setInput'; key: NumericInputKey; value: number }
  | { type: 'setInput'; key: 'marginBase'; value: 'receita' | 'custo' }
  /** null turns the optional target margin off. */
  | { type: 'setTargetMargin'; value: number | null }
  | { type: 'setCurrency'; currency: 'BRL' | 'USD' }
  | { type: 'setAreaUnit'; unit: 'scHa' | 'tHa' }
  /**
   * Switching to 'total' with US$ costs or a sc/ha rent needs today's dollar and farm price, so the
   * single total is the whole current cost; without them (or unusable) the state is unchanged.
   */
  | { type: 'setCostMode'; mode: 'total' | 'categorias'; fx?: number; farmPriceBrl?: number | null }
  | { type: 'setCategory'; id: CostCategoryId; value: number }
  | { type: 'override'; key: OverrideKey; value: number | null }
  | { type: 'applyScenario'; cbotUsc: number; fx: number }
  | { type: 'resetScenario' }
  /** Simulated premium (US¢/bu) of Resultados financeiros; null goes back to the Lavoura e custos basis. */
  | { type: 'setSimBasis'; value: number | null }
  /** Size of one matrix step in Resultados financeiros; only the fields given change, an invalid one rejects all. */
  | { type: 'setResultSteps'; steps: Partial<ResultSteps> }
  | { type: 'setCostGroupMode'; group: CostCategoryId; mode: 'total' | 'itens' }
  | { type: 'setCostItem'; itemId: string; patch: CostItemPatch }
  | { type: 'setGroupTotal'; group: CostCategoryId; value: { totalBrlHa?: number; usd?: UsdInput | null } }
  | { type: 'setCostFxDefault'; value: CostFxDefault }
  /** Marks a group total (no `itemId`) or one item as budgeted (true) or realized (false). Informational. */
  | { type: 'setCostBudgeted'; group: CostCategoryId; itemId?: string; value: boolean }
  | { type: 'setFxLock'; pct: number; rate: number }
  | { type: 'setStepsPct'; steps: [number, number, number, number] }
  | { type: 'setYieldFactor'; value: number }
  | { type: 'setIncludeSold'; value: boolean }
  /** New tranche (default t / R$, zeros) with a generated id; invalid fields reject the action. */
  | { type: 'addSale'; partial?: SalePatch }
  | { type: 'updateSale'; id: string; patch: SalePatch }
  | { type: 'removeSale'; id: string }
  /** New empty operation (soybean future sold, zeros) with a generated id; invalid fields reject the action. */
  | { type: 'addHedgeOp'; partial?: HedgeOpPatch }
  | { type: 'updateHedgeOp'; id: string; patch: HedgeOpPatch }
  /** Replaces a whole operation (the edit of a saved one, after "Salvar alterações"). */
  | { type: 'replaceHedgeOp'; op: HedgeOp }
  | { type: 'removeHedgeOp'; id: string }
  /** Barter sacks of `crop` (default: the crop on screen). Finite, >= 0 and not above the gross production, else rejected. */
  | { type: 'setBarterSc'; value: number; crop?: CropId }
  | { type: 'tourDone' }
