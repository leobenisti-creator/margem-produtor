import { CROPS, type CropId } from '../engine/crops'
import type { CostUsdLine } from '../engine/calc'
import { OUTRO_FOB_ID, isFobFor } from '../data/fobPoints'
import { COST_CATEGORY_IDS } from '../data/types'
import { allItemsOf } from '../data/costItems'
import {
  SC_HA_ITEM,
  copyRow,
  freshGroups,
  isProductRow,
  validateFxPair,
  validateUsdCost,
} from './costs'
import {
  DEFAULT_MATRIX,
  DEFAULT_RESULT_STEPS,
  cleanBarter,
  syncBarter,
  syncCosts,
  validResultStep,
  validStepsPct,
  validYieldFactor,
  validateInput,
} from './reducer'
import { isStoredTranche, syncSales } from './sales'
import { isStoredHedgeOp } from './hedge'
import type { HedgeOp } from '../engine/hedge'
import type { SaleTranche } from '../engine/sales'
import type { AppState, CostFxDefault, CostGroupState, CostGroups, CostItemState, ResultSteps, UsdCost } from './types'

export const STORAGE_KEY = 'margem:v3'
/** Older blobs: never read (v1 predates the cost items, v2 the FOB point); removed on load. */
const LEGACY_KEYS = ['margem:v1', 'margem:v2']

const INPUT_KEYS = [
  'areaHa',
  'yieldScHa',
  'costPerHaBrl',
  'freightBrlPerSc',
  'portFeesBrlPerSc',
  'soldPct',
  'soldAvgPriceBrl',
] as const

type Obj = Record<string, unknown>

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function isMoney(v: unknown): v is number {
  return isNum(v) && v >= 0
}

/** Picks only the user-entered fields (never market data). */
function pickPersisted(s: AppState) {
  return {
    crop: s.crop,
    fobId: s.fobId,
    customBasisUsc: s.customBasisUsc,
    currency: s.currency,
    areaUnit: s.areaUnit,
    inputs: s.inputs,
    // A US$ tranche still without its dollar is not saved (it would discard the whole blob on load).
    // Only what the producer saved: a sale or an operation still marked as not saved lives until the page closes.
    sales: s.sales.filter((t) => t.saved !== false).filter(isStoredTranche),
    hedgeOps: s.hedgeOps.filter((o) => o.saved !== false),
    // Barter sacks per crop: a plain input, saved right away.
    barterSc: s.barterSc,
    // The typed sold values; the tranche-derived ones in `inputs` are recomputed on load.
    soldManual: s.soldManual,
    costMode: s.costMode,
    costCategories: s.costCategories,
    costGroups: s.costGroups,
    costFxDefault: s.costFxDefault,
    costTotalSnapshot: s.costTotalSnapshot,
    overrides: s.overrides,
    matrix: s.matrix,
    includeSold: s.includeSold,
    tourSeen: s.tourSeen,
  }
}

/** Sentinel for "present but invalid" (the whole blob is then discarded). */
const BAD = Symbol('bad')
type Parsed<T> = T | typeof BAD

function parseUsd(v: unknown): Parsed<UsdCost | null> {
  if (v === null) return null
  if (!isObj(v) || validateUsdCost(v)) return BAD
  if (v.followDefault !== undefined && typeof v.followDefault !== 'boolean') return BAD
  const out: UsdCost = {
    amountUsdHa: v.amountUsdHa as number,
    boughtPct: v.boughtPct as number,
    boughtRate: v.boughtRate as number,
  }
  if (v.followDefault === true) out.followDefault = true
  return out
}

function parseItem(id: string, v: unknown): Parsed<CostItemState> {
  if (!isObj(v)) return BAD
  const { mode, valueBrlHa, unit, rows } = v
  // 'media' (the old regional average) no longer exists: such an item loads as not used.
  if (mode !== 'media' && mode !== 'valor' && mode !== 'nao') return BAD
  if (!isMoney(valueBrlHa)) return BAD
  if (unit !== 'ha' && unit !== 'scHa') return BAD
  if (unit === 'scHa' && id !== SC_HA_ITEM) return BAD
  const usd = parseUsd(v.usd)
  if (usd === BAD) return BAD
  if (unit === 'scHa' && usd !== null) return BAD
  if (rows !== null && !(Array.isArray(rows) && rows.every(isProductRow))) return BAD
  if (v.freightBrlTon !== undefined && !isMoney(v.freightBrlTon)) return BAD
  if (v.budgeted !== undefined && typeof v.budgeted !== 'boolean') return BAD
  const item: CostItemState = { mode: mode === 'media' ? 'nao' : mode, valueBrlHa, unit, usd, rows: rows === null ? null : rows.map(copyRow) }
  if (v.freightBrlTon !== undefined) item.freightBrlTon = v.freightBrlTon
  if (v.budgeted === true) item.budgeted = true
  return item
}

/** Validates the groups; absent items get their default state, unknown item ids are dropped. */
function parseGroups(v: unknown): Parsed<CostGroups> {
  if (!isObj(v)) return BAD
  const fresh = freshGroups()
  const out = {} as CostGroups
  for (const g of COST_CATEGORY_IDS) {
    const raw = v[g]
    if (!isObj(raw)) return BAD
    if (raw.mode !== 'total' && raw.mode !== 'itens') return BAD
    if (!isMoney(raw.totalBrlHa)) return BAD
    const totalUsd = parseUsd(raw.totalUsd)
    if (totalUsd === BAD) return BAD
    if (raw.totalTyped !== undefined && typeof raw.totalTyped !== 'boolean') return BAD
    if (raw.budgeted !== undefined && typeof raw.budgeted !== 'boolean') return BAD
    if (!isObj(raw.items)) return BAD
    const items: Record<string, CostItemState> = {}
    for (const it of allItemsOf(g)) {
      const r = raw.items[it.id]
      if (r === undefined) {
        items[it.id] = fresh[g].items[it.id]
        continue
      }
      const item = parseItem(it.id, r)
      if (item === BAD) return BAD
      items[it.id] = item
    }
    const group: CostGroupState = {
      mode: raw.mode,
      totalBrlHa: raw.totalBrlHa,
      totalTyped: raw.totalTyped === true,
      totalUsd,
      items,
    }
    if (raw.budgeted === true) group.budgeted = true
    out[g] = group
  }
  return out
}

function parseCostUsd(v: unknown): Parsed<CostUsdLine[]> {
  if (!Array.isArray(v)) return BAD
  const out: CostUsdLine[] = []
  for (const l of v) {
    if (!isObj(l)) return BAD
    if (validateUsdCost({ amountUsdHa: l.usdPerHa, boughtPct: l.boughtPct, boughtRate: l.boughtRate })) return BAD
    out.push({ usdPerHa: l.usdPerHa as number, boughtPct: l.boughtPct as number, boughtRate: l.boughtRate as number })
  }
  return out
}

/** Returns a fully validated copy or null when anything is off. */
function parse(raw: unknown): Partial<AppState> | null {
  if (!isObj(raw)) return null
  const { crop, currency, areaUnit, inputs, costMode, costCategories } = raw
  if (typeof crop !== 'string' || !Object.hasOwn(CROPS, crop)) return null
  // The FOB point must exist for the crop.
  const { fobId, customBasisUsc } = raw
  if (!isFobFor(fobId, crop as CropId)) return null
  let custom: number | null = null
  if (customBasisUsc !== null) {
    if (!isNum(customBasisUsc) || fobId !== OUTRO_FOB_ID) return null // any finite base (negatives too)
    custom = customBasisUsc
  }
  if (currency !== 'BRL' && currency !== 'USD') return null
  if (areaUnit !== 'scHa' && areaUnit !== 'tHa') return null
  if (costMode !== 'total' && costMode !== 'categorias') return null

  if (!isObj(inputs)) return null
  const outInputs: Obj = {}
  for (const k of INPUT_KEYS) {
    const v = inputs[k]
    if (!isNum(v) || validateInput(k, v)) return null
    outInputs[k] = v
  }
  // Optional target: absent/null means "no target"; a present value must be a valid number.
  const target = inputs.targetMargin
  if (target === undefined || target === null) outInputs.targetMargin = null
  else if (isNum(target) && !validateInput('targetMargin', target)) outInputs.targetMargin = target
  else return null
  if (inputs.marginBase !== 'receita' && inputs.marginBase !== 'custo') return null
  outInputs.marginBase = inputs.marginBase
  // Redesign fields: absent → neutral values; present → validated.
  if (inputs.costUsd === undefined) outInputs.costUsd = []
  else {
    const lines = parseCostUsd(inputs.costUsd)
    if (lines === BAD) return null
    outInputs.costUsd = lines
  }
  const lockPct = inputs.fxLockPct === undefined ? 0 : inputs.fxLockPct
  const lockRate = inputs.fxLockRate === undefined ? 0 : inputs.fxLockRate
  if (validateFxPair(lockPct, lockRate)) return null
  outInputs.fxLockPct = lockPct as number
  outInputs.fxLockRate = lockRate as number
  if (inputs.costScHa === undefined) outInputs.costScHa = 0
  else if (isMoney(inputs.costScHa)) outInputs.costScHa = inputs.costScHa
  else return null

  if (!isObj(costCategories)) return null
  const outCats: Obj = {}
  for (const id of COST_CATEGORY_IDS) {
    const v = costCategories[id]
    if (!isNum(v) || v < 0) return null
    outCats[id] = v
  }

  let costGroups: CostGroups | undefined
  if (raw.costGroups !== undefined) {
    const g = parseGroups(raw.costGroups)
    if (g === BAD) return null
    costGroups = g
  }
  let costFxDefault: CostFxDefault | undefined
  if (raw.costFxDefault !== undefined) {
    const d = raw.costFxDefault
    if (!isObj(d) || validateFxPair(d.boughtPct, d.boughtRate)) return null
    costFxDefault = { boughtPct: d.boughtPct as number, boughtRate: d.boughtRate as number }
  }

  let costTotalSnapshot: number | null = null
  if (raw.costTotalSnapshot !== undefined && raw.costTotalSnapshot !== null) {
    if (!isMoney(raw.costTotalSnapshot)) return null
    costTotalSnapshot = raw.costTotalSnapshot
  }

  const { overrides, matrix } = raw
  if (!isObj(overrides)) return null
  const outOverrides: Obj = {}
  for (const k of ['cbotUsc', 'basisUsc', 'fx'] as const) {
    const v = overrides[k]
    if (v === undefined) continue
    if (!isNum(v) || validateInput(k, v)) return null
    outOverrides[k] = v
  }
  // The Resultados simulation (absent in older blobs): a bad value is dropped, never a reason to lose the blob.
  if (isNum(overrides.simBasisUsc)) outOverrides.simBasisUsc = overrides.simBasisUsc

  // Matrix: non-numeric values are a shape error; numeric but out-of-range ones fall back to the default.
  if (!isObj(matrix)) return null
  const { stepsPct, yieldFactor, resultSteps } = matrix
  if (stepsPct !== undefined && !(Array.isArray(stepsPct) && stepsPct.every(isNum))) return null
  if (yieldFactor !== undefined && !isNum(yieldFactor)) return null
  const outSteps = validStepsPct(stepsPct) ? stepsPct : DEFAULT_MATRIX.stepsPct
  const outYield = validYieldFactor(yieldFactor) ? yieldFactor : DEFAULT_MATRIX.yieldFactor
  // Resultados steps (absent in older blobs): each one on its own, invalid or missing -> the default.
  const outResultSteps: ResultSteps = { ...DEFAULT_RESULT_STEPS }
  if (isObj(resultSteps)) {
    for (const k of ['cbotPct', 'fxPct', 'basisBrl'] as const) {
      const v = resultSteps[k]
      if (validResultStep(k, v)) outResultSteps[k] = v
    }
  }

  if (typeof raw.includeSold !== 'boolean' || typeof raw.tourSeen !== 'boolean') return null
  // Old blobs also carry `regionId` and `edited` (the IMEA-era flags): they are ignored.

  // Sale tranches: absent → none; present → strictly valid with unique ids.
  let sales: SaleTranche[] = []
  if (raw.sales !== undefined) {
    if (!Array.isArray(raw.sales) || !raw.sales.every(isStoredTranche)) return null
    const ids = new Set(raw.sales.map((t) => t.id))
    if (ids.size !== raw.sales.length) return null
    sales = raw.sales.map((t) => ({
      id: t.id,
      volume: t.volume,
      volumeUnit: t.volumeUnit,
      price: t.price,
      priceCurrency: t.priceCurrency,
      dollar: t.dollar,
      marketDollar: typeof t.marketDollar === 'number' ? t.marketDollar : null,
    }))
  }

  // Market operations: absent → none; present → every one well-formed with unique ids.
  let hedgeOps: HedgeOp[] = []
  if (raw.hedgeOps !== undefined) {
    if (!Array.isArray(raw.hedgeOps) || !raw.hedgeOps.every(isStoredHedgeOp)) return null
    const ids = new Set(raw.hedgeOps.map((o) => o.id))
    if (ids.size !== raw.hedgeOps.length) return null
    hedgeOps = raw.hedgeOps.map((o) => ({
      id: o.id,
      asset: o.asset,
      kind: o.kind,
      side: o.side,
      qty: o.qty,
      strike: o.strike,
      premium: o.premium,
      fxFixed: o.fxFixed,
      maturity: o.maturity,
      ...(o.lotSize !== undefined ? { lotSize: o.lotSize } : {}),
      ...(o.closePrice !== undefined ? { closePrice: o.closePrice } : {}),
      ...(o.closeValueUsd !== undefined ? { closeValueUsd: o.closeValueUsd } : {}),
      ...(o.costBrl !== undefined ? { costBrl: o.costBrl } : {}),
      ...(o.barrierHitDate !== undefined ? { barrierHitDate: o.barrierHitDate } : {}),
      ...(o.contract !== undefined ? { contract: o.contract } : {}),
      ...(o.floorLevel !== undefined ? { floorLevel: o.floorLevel } : {}),
      ...(o.premiumDir !== undefined ? { premiumDir: o.premiumDir } : {}),
      ...(o.startDate !== undefined ? { startDate: o.startDate } : {}),
      ...(o.maturityDate !== undefined ? { maturityDate: o.maturityDate } : {}),
      ...(o.maturityMonth !== undefined ? { maturityMonth: o.maturityMonth } : {}),
      ...(o.closedDate !== undefined ? { closedDate: o.closedDate } : {}),
      ...(o.barrier !== undefined
        ? { barrier: { type: o.barrier.type, price: o.barrier.price, dir: o.barrier.dir } }
        : {}),
      ...(o.accum !== undefined ? { accum: { ...o.accum } } : {}),
      crop: o.crop ?? 'soja',
    }))
  }

  // Typed sold values: absent (older v3 blob) → the saved inputs; present → validated like them.
  let soldManual = { soldPct: outInputs.soldPct as number, soldAvgPriceBrl: outInputs.soldAvgPriceBrl as number }
  if (raw.soldManual !== undefined) {
    const m = raw.soldManual
    if (!isObj(m) || !isNum(m.soldPct) || validateInput('soldPct', m.soldPct)) return null
    if (!isNum(m.soldAvgPriceBrl) || validateInput('soldAvgPriceBrl', m.soldAvgPriceBrl)) return null
    soldManual = { soldPct: m.soldPct, soldAvgPriceBrl: m.soldAvgPriceBrl }
  }

  const out: Partial<AppState> = {
    sales,
    soldManual,
    crop: crop as AppState['crop'],
    fobId,
    customBasisUsc: custom,
    currency,
    areaUnit,
    inputs: outInputs as unknown as AppState['inputs'],
    costMode,
    costCategories: outCats as unknown as AppState['costCategories'],
    costTotalSnapshot,
    overrides: outOverrides as AppState['overrides'],
    matrix: {
      stepsPct: [outSteps[0], outSteps[1], outSteps[2], outSteps[3]],
      yieldFactor: outYield,
      resultSteps: outResultSteps,
    },
    includeSold: raw.includeSold,
    tourSeen: raw.tourSeen,
  }
  if (costGroups) out.costGroups = costGroups
  out.hedgeOps = hedgeOps
  // Absent (older blobs) or invalid -> 0; never a reason to lose the blob.
  out.barterSc = cleanBarter(raw.barterSc)
  // The engines' copy for the crop on screen.
  outInputs.barterSc = out.barterSc[crop as AppState['crop']]
  if (costFxDefault) out.costFxDefault = costFxDefault
  return out
}

export function loadState(): Partial<AppState> | null {
  try {
    for (const k of LEGACY_KEYS) localStorage.removeItem(k)
  } catch {
    // Storage blocked: nothing to clean.
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    return parse(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveState(s: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pickPersisted(s)))
  } catch {
    // Storage blocked or full: the app keeps working without persistence.
  }
}

/**
 * Overlays validated saved fields onto a base state. The derived cost fields (`costCategories`,
 * and in 'categorias' mode `inputs.costPerHaBrl`/`inputs.costUsd`) are recomputed from the groups,
 * so a restored state is always consistent. A blob without groups rebuilds them from its categories.
 */
export function mergeState(base: AppState, saved: Partial<AppState> | null): AppState {
  if (!saved) return base
  const merged: AppState = {
    ...base,
    ...saved,
    inputs: { ...base.inputs, ...saved.inputs },
    costCategories: { ...base.costCategories, ...saved.costCategories },
    overrides: { ...saved.overrides },
    matrix: { ...base.matrix, ...saved.matrix },
  }
  const costGroups = saved.costGroups ?? freshGroups(merged.costCategories)
  // The typed sold values come back as typed; the tranches then derive the effective ones.
  const soldManual =
    saved.soldManual ??
    (saved.inputs
      ? { soldPct: merged.inputs.soldPct, soldAvgPriceBrl: merged.inputs.soldAvgPriceBrl }
      : base.soldManual)
  return syncSales(syncBarter(syncCosts({ ...merged, costGroups, soldManual })))
}
