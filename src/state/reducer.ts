import { CROPS, type CropId } from '../engine/crops'
import { inputsAtPrice, type FarmInputs } from '../engine/calc'
import { DEFAULT_STEPS_PCT } from '../engine/matrix'
import { barterProblem, grossProductionOf, normalizeBarter } from '../engine/production'
import { DEFAULT_FOB_ID, OUTRO_FOB_ID, isFobFor } from '../data/fobPoints'
import type { CostCategoryId, MarketSnapshot } from '../data/types'
import { COST_CATEGORY_IDS } from '../data/types'
import { groupOfItem } from '../data/costItems'
import {
  SC_HA_ITEM,
  copyRow,
  foldCosts,
  freshGroups,
  freshItem,
  isProductRow,
  sumCategories,
  validateFxPair,
  validateUsdCost,
  zeroCategories,
} from './costs'
import { fobBasisUsc } from './basis'
import { EMPTY_SALE, applySalePatch, capSale, nextSaleId, syncSales } from './sales'
import { EMPTY_HEDGE_OP } from '../engine/hedge'
import { applyHedgePatch, isStoredHedgeOp, nextHedgeId } from './hedge'
import {
  YIELD_FACTORS,
  type Action,
  type AppState,
  type CostFxDefault,
  type CostGroupState,
  type CostGroups,
  type CostItemPatch,
  type CostItemState,
  type MatrixSettings,
  type ResultSteps,
  type OverrideKey,
  type UsdCost,
  type UsdInput,
} from './types'

/** The app's own default (not a fetched number); the UI flags it as "padrão do app". */
export const DEFAULT_PORT_FEES_BRL_PER_SC = 5.2

/** Resultados financeiros matrix: 2,5% of CBOT, 2,5% of the dollar, R$ 1/sc of basis per step. */
export const DEFAULT_RESULT_STEPS: ResultSteps = { cbotPct: 2.5, fxPct: 2.5, basisBrl: 1 }

export const DEFAULT_MATRIX: MatrixSettings = {
  stepsPct: [DEFAULT_STEPS_PCT[0], DEFAULT_STEPS_PCT[1], DEFAULT_STEPS_PCT[2], DEFAULT_STEPS_PCT[3]],
  yieldFactor: 1,
  resultSteps: { ...DEFAULT_RESULT_STEPS },
}

const NUMERIC_KEYS = [
  'areaHa',
  'yieldScHa',
  'costPerHaBrl',
  'freightBrlPerSc',
  'portFeesBrlPerSc',
  'soldPct',
  'soldAvgPriceBrl',
  'targetMargin',
  'fx',
  'cbotUsc',
  'basisUsc',
] as const

/** Returns a pt-BR error message, or null when the value is acceptable. */
export function validateInput(key: string, value: number): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Informe um número válido.'
  switch (key) {
    case 'soldPct':
      return value < 0 || value > 1 ? 'O percentual vendido deve estar entre 0% e 100%.' : null
    case 'areaHa':
      return value < 0 ? 'A área não pode ser negativa.' : null
    case 'yieldScHa':
      return value < 0 ? 'A produtividade não pode ser negativa.' : null
    case 'targetMargin':
      return value < 0 ? 'A margem alvo não pode ser negativa.' : null
    case 'fx':
      return value <= 0 ? 'O dólar deve ser maior que zero.' : null
    case 'cbotUsc':
      return value <= 0 ? 'O CBOT deve ser maior que zero.' : null
    case 'cbotStepUsc':
      return value < 0.01 ? 'O passo do CBOT deve ser de pelo menos 0,01 US¢/bu.' : null
    case 'fxStep':
      return value < 0.0001 ? 'O passo do dólar deve ser de pelo menos 0,0001.' : null
    case 'category':
    case 'costPerHaBrl':
    case 'freightBrlPerSc':
    case 'portFeesBrlPerSc':
    case 'soldAvgPriceBrl':
      return value < 0 ? 'O valor não pode ser negativo.' : null
    default:
      return (NUMERIC_KEYS as readonly string[]).includes(key) || key === 'basisUsc' ? null : 'Campo desconhecido.'
  }
}

/** Four % steps, finite, strictly increasing, each in (0, 100) — what engine/matrix requires. */
export function validStepsPct(steps: unknown): steps is MatrixSettings['stepsPct'] {
  if (!Array.isArray(steps) || steps.length !== 4) return false
  let prev = 0
  for (const v of steps) {
    if (typeof v !== 'number' || !Number.isFinite(v) || !(v > prev) || !(v < 100)) return false
    prev = v
  }
  return true
}

/** One step of the Resultados matrix: finite and > 0; the % ones also < 25 (four steps must stay under 100%). */
export function validResultStep(key: keyof ResultSteps, v: unknown): v is number {
  if (typeof v !== 'number' || !Number.isFinite(v) || !(v > 0)) return false
  return key === 'basisBrl' ? v <= 1e6 : v < 25
}

export function validYieldFactor(v: unknown): v is number {
  return typeof v === 'number' && YIELD_FACTORS.includes(v)
}

function isMoney(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0
}

/**
 * Recomputes the derived cost fields from `costGroups`: `costCategories` (fixed R$ per group) always;
 * in 'categorias' mode also `inputs.costPerHaBrl` (fixed R$ part) and `inputs.costUsd`.
 * In 'total' mode the single typed total is kept and there are no US$ lines (legacy behaviour).
 */
export function syncCosts(state: AppState): AppState {
  const f = foldCosts(state.costGroups, state.costFxDefault)
  const inputs: FarmInputs =
    state.costMode === 'categorias'
      ? { ...state.inputs, costPerHaBrl: f.brlFixed, costUsd: f.usdLines, costScHa: f.arrendamentoScHa }
      : { ...state.inputs, costUsd: [], costScHa: 0 }
  return { ...state, costCategories: f.categories, inputs }
}

/**
 * Puts `total` into the group totals, every group in total mode. A single typed total has no split of its own,
 * so it all goes to "Outros custos".
 */
function distributeIntoGroups(state: AppState, total: number): CostGroups {
  const out = {} as CostGroups
  for (const g of COST_CATEGORY_IDS) {
    out[g] = {
      ...state.costGroups[g],
      mode: 'total',
      totalBrlHa: g === 'outros' ? total : 0,
      totalTyped: false,
      totalUsd: null,
    }
  }
  return out
}

/**
 * Switches to the per-group model. When the single total still equals the groups' fixed R$ sum (or the snapshot of
 * the last switch back) the groups are kept as they are (items and US$ lines included); otherwise the typed
 * total is moved into the groups.
 */
function enterCategorias(state: AppState): AppState {
  if (state.costMode === 'categorias') return state
  const total = state.inputs.costPerHaBrl
  const same =
    Math.abs(total - sumCategories(state.costCategories)) < 0.005 ||
    (state.costTotalSnapshot !== null && total === state.costTotalSnapshot)
  const costGroups = same ? state.costGroups : distributeIntoGroups(state, total)
  return syncCosts({ ...state, costMode: 'categorias', costGroups })
}

/** Typed US$ → stored UsdCost; without `boughtPct` it follows the default dollar. Null when invalid. */
function toUsdCost(u: UsdInput, def: CostFxDefault): UsdCost | null {
  if (typeof u !== 'object' || u === null) return null
  const out: UsdCost =
    u.boughtPct !== undefined
      ? { amountUsdHa: u.amountUsdHa, boughtPct: u.boughtPct, boughtRate: u.boughtRate ?? def.boughtRate }
      : { amountUsdHa: u.amountUsdHa, boughtPct: def.boughtPct, boughtRate: def.boughtRate, followDefault: true }
  return validateUsdCost(out) ? null : out
}

function applyItemPatch(state: AppState, itemId: string, cur: CostItemState, p: CostItemPatch): CostItemState | null {
  if (typeof p !== 'object' || p === null) return null
  const next: CostItemState = { ...cur }
  if (p.mode !== undefined) {
    if (p.mode !== 'valor' && p.mode !== 'nao') return null
    next.mode = p.mode
  }
  if (p.valueBrlHa !== undefined) {
    if (!isMoney(p.valueBrlHa)) return null
    next.valueBrlHa = p.valueBrlHa
  }
  if (p.unit !== undefined) {
    if (p.unit !== 'ha' && p.unit !== 'scHa') return null
    if (p.unit === 'scHa' && itemId !== SC_HA_ITEM) return null
    next.unit = p.unit
  }
  if (p.usd !== undefined) {
    if (p.usd === null) next.usd = null
    else {
      const u = toUsdCost(p.usd, state.costFxDefault)
      if (!u) return null
      next.usd = u
    }
  }
  if (p.rows !== undefined) {
    if (p.rows !== null && !(Array.isArray(p.rows) && p.rows.every(isProductRow))) return null
    next.rows = p.rows === null ? null : p.rows.map(copyRow)
  }
  if (p.freightBrlTon === null) delete next.freightBrlTon
  else if (p.freightBrlTon !== undefined) {
    if (!isMoney(p.freightBrlTon)) return null
    next.freightBrlTon = p.freightBrlTon
  }
  // A value in sacks cannot be in US$ at the same time.
  if (next.unit === 'scHa' && next.usd !== null) return null
  return next
}

/** Re-resolves the US$ costs that follow the default dollar. */
function withFxDefault(groups: CostGroups, def: CostFxDefault): CostGroups {
  const follow = (u: UsdCost | null): UsdCost | null =>
    u && u.followDefault ? { ...u, boughtPct: def.boughtPct, boughtRate: def.boughtRate } : u
  const out = {} as CostGroups
  for (const g of COST_CATEGORY_IDS) {
    const items: Record<string, CostItemState> = {}
    for (const [id, it] of Object.entries(groups[g].items)) items[id] = { ...it, usd: follow(it.usd) }
    out[g] = { ...groups[g], totalUsd: follow(groups[g].totalUsd), items }
  }
  return out
}

function withGroup(state: AppState, group: CostCategoryId, g: CostGroupState): AppState {
  return syncCosts({ ...state, costGroups: { ...state.costGroups, [group]: g } })
}

/** A typed base ("Outro") can be any finite number: zero and negatives (a premium) included. */
export function isCustomBasis(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** The snapshot is not stored in the state; the parameter keeps the call site stable. */
export function initialState(_snapshot?: MarketSnapshot): AppState {
  return {
    crop: 'soja',
    fobId: DEFAULT_FOB_ID,
    customBasisUsc: null,
    currency: 'BRL',
    areaUnit: 'scHa',
    inputs: {
      // Everything the producer provides starts empty: the site only fetches the CBOT, the dollar and the FOB points.
      areaHa: 0,
      yieldScHa: 0,
      costPerHaBrl: 0,
      freightBrlPerSc: 0,
      portFeesBrlPerSc: DEFAULT_PORT_FEES_BRL_PER_SC,
      soldPct: 0,
      soldAvgPriceBrl: 0,
      targetMargin: null,
      marginBase: 'receita',
      costUsd: [],
      fxLockPct: 0,
      fxLockRate: 0,
      costScHa: 0,
      barterSc: 0,
    },
    costMode: 'total',
    costCategories: zeroCategories(),
    costGroups: freshGroups(),
    costFxDefault: { boughtPct: 0, boughtRate: 0 },
    costTotalSnapshot: null,
    overrides: {},
    matrix: {
      stepsPct: [...DEFAULT_MATRIX.stepsPct],
      yieldFactor: DEFAULT_MATRIX.yieldFactor,
      resultSteps: { ...DEFAULT_RESULT_STEPS },
    },
    includeSold: true,
    tourSeen: false,
    sales: [],
    hedgeOps: [],
    barterSc: { soja: 0, milho: 0 },
    // Legacy: the typed "% vendido"/price of the old step-3 fields. No UI writes it any more (the
    // tranches in "Minhas vendas" replaced them); kept so older saved states still load.
    soldManual: { soldPct: 0, soldAvgPriceBrl: 0 },
  }
}

/**
 * Every accepted action ends with `syncSales`, so the sold % derived from the tranches follows the
 * tranches and the production (area/yield) alike. A rejected action returns the same state.
 */
export function reducer(state: AppState, a: Action): AppState {
  const next = baseReducer(state, a)
  return next === state ? state : syncSales(syncBarter(next))
}

/** The barter of each crop as stored: only known crops, each a finite number >= 0 (anything else is 0). */
export function cleanBarter(v: unknown): Record<CropId, number> {
  const o = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
  const out = {} as Record<CropId, number>
  for (const id of Object.keys(CROPS) as CropId[]) out[id] = normalizeBarter(o[id])
  return out
}

/** `inputs.barterSc` = the barter of the crop on screen (the single place where the engines' input is derived). */
export function syncBarter(state: AppState): AppState {
  const barter = normalizeBarter(state.barterSc?.[state.crop])
  if (state.inputs.barterSc === barter) return state
  return { ...state, inputs: { ...state.inputs, barterSc: barter } }
}

function baseReducer(state: AppState, a: Action): AppState {
  switch (a.type) {
    case 'setCrop':
      if (!Object.hasOwn(CROPS, a.crop)) return state
      {
        // One basis and one CBOT override serve both crops (US¢/bu of soybeans vs corn are not comparable), so
        // they must not leak to the other crop. The dollar is the same for both and stays.
        const overrides = { ...state.overrides }
        delete overrides.basisUsc
        delete overrides.simBasisUsc
        delete overrides.cbotUsc
        const base = { ...state, overrides }
        // The FOB point stays when the new crop has it; otherwise back to Paranaguá. A typed base
        // ("Outro") is per crop: it restarts at the new crop's Paranaguá base. Nothing the producer typed
        // (area, productivity, costs, freight) changes with the crop.
        const fobId = isFobFor(state.fobId, a.crop) ? state.fobId : DEFAULT_FOB_ID
        const customBasisUsc =
          fobId === OUTRO_FOB_ID ? fobBasisUsc({ crop: a.crop, fobId: DEFAULT_FOB_ID, customBasisUsc: null }) : null
        return { ...base, crop: a.crop, fobId, customBasisUsc }
      }

    case 'setFob': {
      if (!isFobFor(a.fobId, state.crop)) return state
      // "Outro" starts from the base in use, so the scenario never loses its base.
      const customBasisUsc = a.fobId === OUTRO_FOB_ID ? (state.customBasisUsc ?? fobBasisUsc(state)) : null
      return { ...state, fobId: a.fobId, customBasisUsc }
    }

    case 'setCustomBasis':
      if (a.value !== null && (!isCustomBasis(a.value) || state.fobId !== OUTRO_FOB_ID)) return state
      return { ...state, customBasisUsc: a.value }

    case 'setInput': {
      if (a.key === 'marginBase') {
        if (a.value !== 'receita' && a.value !== 'custo') return state
        return { ...state, inputs: { ...state.inputs, marginBase: a.value } }
      }
      if (validateInput(a.key, a.value)) return state
      const inputs: FarmInputs = { ...state.inputs, [a.key]: a.value }
      if (a.key === 'costPerHaBrl') {
        if (state.costMode === 'categorias') {
          // Typing the total over the groups spreads it like before (groups back to total mode).
          return syncCosts({ ...state, inputs, costGroups: distributeIntoGroups(state, a.value) })
        }
        return { ...state, inputs, costTotalSnapshot: null }
      }
      if (a.key === 'soldPct' || a.key === 'soldAvgPriceBrl') {
        // The typed value is kept as the manual one; with valid tranches syncSales overrides `inputs`.
        return { ...state, inputs, soldManual: { ...state.soldManual, [a.key]: a.value } }
      }
      return { ...state, inputs }
    }

    case 'setTargetMargin': {
      if (a.value !== null && (typeof a.value !== 'number' || validateInput('targetMargin', a.value))) {
        return state
      }
      return { ...state, inputs: { ...state.inputs, targetMargin: a.value } }
    }

    case 'setCurrency':
      return a.currency === 'BRL' || a.currency === 'USD' ? { ...state, currency: a.currency } : state

    case 'setAreaUnit':
      return a.unit === 'scHa' || a.unit === 'tHa' ? { ...state, areaUnit: a.unit } : state

    case 'setCostMode': {
      if (a.mode === state.costMode) return state
      if (a.mode === 'categorias') return enterCategorias(state)
      if (a.mode !== 'total') return state
      // The single total becomes the whole current cost: US$ lines at their effective dollar and the
      // sc/ha rent at today's farm price (same cost per sack before and after). Typed US$/sc-ha data
      // stays in the groups and returns with 'categorias'. Without a usable dollar/price: unchanged.
      let total = sumCategories(state.costCategories)
      if (state.inputs.costUsd.length > 0 || state.inputs.costScHa > 0) {
        if (typeof a.fx !== 'number') return state
        const price = typeof a.farmPriceBrl === 'number' ? a.farmPriceBrl : Number.NaN
        const whole = inputsAtPrice(state.inputs, a.fx, price).costPerHaBrl
        if (!Number.isFinite(whole) || whole < 0) return state
        total = whole
      }
      return syncCosts({
        ...state,
        costMode: 'total',
        costTotalSnapshot: total,
        inputs: { ...state.inputs, costPerHaBrl: total },
      })
    }

    case 'setCategory': {
      if (!COST_CATEGORY_IDS.includes(a.id) || validateInput('category', a.value)) return state
      const g: CostGroupState = {
        ...state.costGroups[a.id],
        mode: 'total',
        totalBrlHa: a.value,
        totalTyped: true,
        totalUsd: null,
      }
      return withGroup(state, a.id, g)
    }

    case 'setCostGroupMode': {
      if (!COST_CATEGORY_IDS.includes(a.group) || (a.mode !== 'total' && a.mode !== 'itens')) return state
      const s = enterCategorias(state)
      if (s.costGroups[a.group].mode === a.mode) return s
      const g: CostGroupState = { ...s.costGroups[a.group], mode: a.mode }
      return syncCosts({ ...s, costGroups: { ...s.costGroups, [a.group]: g } })
    }

    case 'setCostItem': {
      const group = typeof a.itemId === 'string' ? groupOfItem(a.itemId) : undefined
      if (!group) return state
      const cur = state.costGroups[group].items[a.itemId] ?? freshItem()
      const item = applyItemPatch(state, a.itemId, cur, a.patch)
      if (!item) return state
      const s = enterCategorias(state)
      const g = s.costGroups[group]
      return withGroup(s, group, { ...g, mode: 'itens', items: { ...g.items, [a.itemId]: item } })
    }

    case 'setGroupTotal': {
      if (!COST_CATEGORY_IDS.includes(a.group) || typeof a.value !== 'object' || a.value === null) return state
      const { totalBrlHa, usd } = a.value
      if (totalBrlHa !== undefined && !isMoney(totalBrlHa)) return state
      let totalUsd: UsdCost | null | undefined
      if (usd === null) totalUsd = null
      else if (usd !== undefined) {
        totalUsd = toUsdCost(usd, state.costFxDefault)
        if (!totalUsd) return state
      }
      const s = enterCategorias(state)
      const g = s.costGroups[a.group]
      return withGroup(s, a.group, {
        ...g,
        mode: 'total',
        totalTyped: true,
        totalBrlHa: totalBrlHa ?? g.totalBrlHa,
        totalUsd: totalUsd === undefined ? g.totalUsd : totalUsd,
      })
    }

    case 'setCostBudgeted': {
      if (!COST_CATEGORY_IDS.includes(a.group) || typeof a.value !== 'boolean') return state
      const g = state.costGroups[a.group]
      const flag = a.value ? { budgeted: true } : {}
      if (a.itemId === undefined) {
        const { budgeted: _drop, ...rest } = g
        return { ...state, costGroups: { ...state.costGroups, [a.group]: { ...rest, ...flag } } }
      }
      if (groupOfItem(a.itemId) !== a.group) return state
      const cur = g.items[a.itemId] ?? freshItem()
      const { budgeted: _old, ...item } = cur
      return {
        ...state,
        costGroups: {
          ...state.costGroups,
          [a.group]: { ...g, items: { ...g.items, [a.itemId]: { ...item, ...flag } } },
        },
      }
    }

    case 'setCostFxDefault': {
      const v = a.value
      if (typeof v !== 'object' || v === null || validateFxPair(v.boughtPct, v.boughtRate)) return state
      const costFxDefault: CostFxDefault = { boughtPct: v.boughtPct, boughtRate: v.boughtRate }
      return syncCosts({ ...state, costFxDefault, costGroups: withFxDefault(state.costGroups, costFxDefault) })
    }

    case 'setFxLock':
      if (validateFxPair(a.pct, a.rate)) return state
      return { ...state, inputs: { ...state.inputs, fxLockPct: a.pct, fxLockRate: a.rate } }

    case 'setStepsPct':
      if (!validStepsPct(a.steps)) return state
      return { ...state, matrix: { ...state.matrix, stepsPct: [a.steps[0], a.steps[1], a.steps[2], a.steps[3]] } }

    case 'setYieldFactor':
      if (!validYieldFactor(a.value)) return state
      return { ...state, matrix: { ...state.matrix, yieldFactor: a.value } }

    case 'override': {
      const key: OverrideKey = a.key
      if (key !== 'cbotUsc' && key !== 'basisUsc' && key !== 'fx') return state
      if (a.value === null) {
        const overrides = { ...state.overrides }
        delete overrides[key]
        return { ...state, overrides }
      }
      if (validateInput(key, a.value)) return state
      return { ...state, overrides: { ...state.overrides, [key]: a.value } }
    }

    case 'applyScenario':
      if (validateInput('cbotUsc', a.cbotUsc) || validateInput('fx', a.fx)) return state
      return { ...state, overrides: { ...state.overrides, cbotUsc: a.cbotUsc, fx: a.fx } }

    case 'resetScenario': {
      const overrides = { ...state.overrides }
      delete overrides.cbotUsc
      delete overrides.fx
      // Only the simulation goes: the premium typed in Lavoura e custos (`basisUsc`) is the producer's own data.
      delete overrides.simBasisUsc
      return { ...state, overrides }
    }

    case 'setSimBasis': {
      if (a.value === null) {
        if (state.overrides.simBasisUsc === undefined) return state
        const overrides = { ...state.overrides }
        delete overrides.simBasisUsc
        return { ...state, overrides }
      }
      if (typeof a.value !== 'number' || !Number.isFinite(a.value)) return state
      return { ...state, overrides: { ...state.overrides, simBasisUsc: a.value } }
    }

    case 'setResultSteps': {
      const given = Object.entries(a.steps) as Array<[keyof ResultSteps, unknown]>
      if (given.some(([k, v]) => !(k in DEFAULT_RESULT_STEPS) || !validResultStep(k, v))) return state
      return { ...state, matrix: { ...state.matrix, resultSteps: { ...state.matrix.resultSteps, ...a.steps } } }
    }

    case 'setIncludeSold':
      return typeof a.value === 'boolean' ? { ...state, includeSold: a.value } : state

    case 'setBarterSc': {
      const crop = a.crop ?? state.crop
      if (!Object.hasOwn(CROPS, crop)) return state
      if (barterProblem(a.value, grossProductionOf(state.inputs))) return state
      if (state.barterSc[crop] === a.value) return state
      return { ...state, barterSc: { ...state.barterSc, [crop]: a.value } }
    }

    case 'tourDone':
      return state.tourSeen ? state : { ...state, tourSeen: true }

    case 'addSale': {
      const t = applySalePatch({ id: nextSaleId(state.sales), ...EMPTY_SALE }, a.partial ?? {})
      if (!t) return state
      const sales = [...state.sales, t]
      return { ...state, sales: capSale(state, sales, sales.length - 1) }
    }

    case 'updateSale': {
      const i = state.sales.findIndex((s) => s.id === a.id)
      if (i < 0) return state
      const t = applySalePatch(state.sales[i], a.patch)
      if (!t) return state
      const sales = [...state.sales]
      sales[i] = t
      return { ...state, sales: capSale(state, sales, i) }
    }

    case 'removeSale': {
      if (!state.sales.some((s) => s.id === a.id)) return state
      return { ...state, sales: state.sales.filter((s) => s.id !== a.id) }
    }

    case 'addHedgeOp': {
      const o = applyHedgePatch(
        { id: nextHedgeId(state.hedgeOps), crop: state.crop, ...EMPTY_HEDGE_OP },
        a.partial ?? {},
      )
      return o ? { ...state, hedgeOps: [...state.hedgeOps, o] } : state
    }

    case 'updateHedgeOp': {
      const i = state.hedgeOps.findIndex((o) => o.id === a.id)
      if (i < 0) return state
      const o = applyHedgePatch(state.hedgeOps[i], a.patch)
      if (!o) return state
      const hedgeOps = [...state.hedgeOps]
      hedgeOps[i] = o
      return { ...state, hedgeOps }
    }

    case 'replaceHedgeOp': {
      const i = state.hedgeOps.findIndex((o) => o.id === a.op.id)
      if (i < 0 || !isStoredHedgeOp(a.op)) return state
      const hedgeOps = [...state.hedgeOps]
      hedgeOps[i] = { ...a.op }
      return { ...state, hedgeOps }
    }

    case 'removeHedgeOp': {
      if (!state.hedgeOps.some((o) => o.id === a.id)) return state
      return { ...state, hedgeOps: state.hedgeOps.filter((o) => o.id !== a.id) }
    }

    default:
      return state
  }
}
