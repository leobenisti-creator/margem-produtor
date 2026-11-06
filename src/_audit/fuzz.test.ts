/**
 * Robustness audit: mutate every leaf of a rich saved blob (delete, null, string, negative, huge, zero) and check that
 * loading never throws and that, whatever is accepted, the whole engine returns numbers or null (never NaN/Infinity)
 * and never throws.
 */
import { computeResult } from '../engine/calc'
import { CROPS } from '../engine/crops'
import { activeHedge, coverOps, hedgeBreakdown } from '../engine/hedge'
import { computeExposure } from '../engine/exposure'
import { buildScenarioMatrix } from '../engine/scenarioMatrix'
import { buildCurves, ALL_FIXED, marginParts } from '../engine/sensitivity'
import { readyScenarios, marginBridge } from '../engine/scenarios'
import { analyzeTarget } from '../engine/targetAnalysis'
import { buildMatrix } from '../engine/matrix'
import { loadState, mergeState, saveState, STORAGE_KEY } from '../state/persist'
import { initialState, reducer } from '../state/reducer'
import type { Action, AppState } from '../state/types'
import { scenarioBasisUsc } from '../state/basis'
import { staticProvider } from '../data/staticProvider'
import type { MarketSnapshot } from '../data/types'

const actions: Action[] = [
  { type: 'setInput', key: 'areaHa', value: 500 },
  { type: 'setTargetMargin', value: 0.2 },
  { type: 'setFxLock', pct: 0.3, rate: 5.1 },
  { type: 'setCostItem', itemId: 'arrendamento.valor', patch: { mode: 'valor', unit: 'scHa', valueBrlHa: 3 } },
  { type: 'setCostItem', itemId: 'adubacao.macro', patch: { mode: 'valor', valueBrlHa: 100, usd: { amountUsdHa: 50, boughtPct: 0.5, boughtRate: 5 } } },
  { type: 'addSale', partial: { volume: 5000, volumeUnit: 'sc', price: 120 } },
  { type: 'addSale', partial: { volume: 10, volumeUnit: 't', price: 24, priceCurrency: 'USD', dollar: 5.3 } },
  { type: 'addHedgeOp', partial: { asset: 'soja', kind: 'futuro', side: 'vendido', qty: 100000, strike: 1300 } },
  {
    type: 'addHedgeOp',
    partial: {
      asset: 'soja',
      kind: 'accumulator',
      qty: 5000,
      strike: 1300,
      startDate: '2026-03-02',
      maturityDate: '2026-06-30',
      barrier: { type: 'ko', price: 1200, dir: 'baixa' },
      accum: { frequency: 'semanal' },
    },
  },
]

function richBlob(): unknown {
  const s = actions.reduce(reducer, initialState())
  const store: Record<string, string> = {}
  const ls = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => void (store[k] = v),
    removeItem: (k: string) => void delete store[k],
  }
  const real = globalThis.localStorage
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true })
  try {
    saveState({ ...s, tourSeen: true })
    return JSON.parse(store[STORAGE_KEY])
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { value: real, configurable: true })
  }
}

type Path = (string | number)[]
function leaves(v: unknown, path: Path = [], out: Path[] = []): Path[] {
  if (v !== null && typeof v === 'object') {
    for (const [k, c] of Object.entries(v)) leaves(c, [...path, Array.isArray(v) ? Number(k) : k], out)
    out.push(path)
  } else out.push(path)
  return out
}
function mutate(blob: unknown, path: Path, bad: unknown): unknown {
  const copy = structuredClone(blob) as Record<string, unknown>
  if (path.length === 0) return bad
  let node = copy as unknown as Record<string | number, unknown>
  for (const k of path.slice(0, -1)) node = node[k] as Record<string | number, unknown>
  const last = path[path.length - 1]
  if (bad === undefined) {
    if (Array.isArray(node)) node.splice(Number(last), 1)
    else delete node[last]
  } else node[last] = bad
  return copy
}

function assertClean(v: unknown, where: string, seen = new Set<unknown>()): void {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`non-finite number at ${where}`)
    return
  }
  if (v === null || typeof v !== 'object' || seen.has(v)) return
  seen.add(v)
  for (const [k, c] of Object.entries(v)) assertClean(c, `${where}.${k}`, seen)
}

function runEngine(state: AppState, snap: MarketSnapshot) {
  const crop = CROPS[state.crop]
  const scenario = {
    cbotUsc: state.overrides.cbotUsc ?? snap.cbotUsc[state.crop].value,
    basisUsc: scenarioBasisUsc(state),
    fx: state.overrides.fx ?? snap.fx.value,
  }
  const hedge = activeHedge(state.hedgeOps, scenario.fx, { today: '2026-04-10', crop: state.crop })
  const inputs = { ...state.inputs, ...(hedge && { hedge }) }
  const out: Record<string, unknown> = {}
  out.result = computeResult(crop, scenario, inputs)
  out.parts = marginParts(crop, scenario, inputs, state.sales, ALL_FIXED)
  out.matrix = buildMatrix(crop, scenario, inputs, { stepsPct: state.matrix.stepsPct, yieldFactor: state.matrix.yieldFactor, includeSold: true })
  for (const lens of ['tudo', 'aberto', 'operacoes', 'diferenca'] as const)
    out['sm' + lens] = buildScenarioMatrix({ crop, scenario, inputs, tranches: state.sales, rowAxis: 'cbot', colAxis: 'basis', lens })
  out.curves = buildCurves({ crop, scenario, inputs, tranches: state.sales })
  out.ready = readyScenarios({ crop, scenario, inputs, tranches: state.sales })
  out.bridge = marginBridge({ crop, scenario, inputs, tranches: state.sales })
  out.target = analyzeTarget(crop, scenario, inputs, out.matrix as ReturnType<typeof buildMatrix>)
  if (hedge) out.lines = hedgeBreakdown(hedge, scenario.cbotUsc, scenario.fx)
  const P = inputs.areaHa * inputs.yieldScHa
  out.exp = computeExposure({
    productionSc: P,
    areaHa: inputs.areaHa,
    bushelsPerSack: crop.bushelsPerSack,
    tranches: state.sales,
    hedgeOps: coverOps(state.hedgeOps, hedge),
    usdPerSc: out.result && (out.result as { farmPriceBrl: number | null }).farmPriceBrl ? (out.result as { farmPriceBrl: number }).farmPriceBrl / scenario.fx : null,
    costsUsdOpen: 0,
  })
  assertClean(out, 'engine')
}

describe('fuzzed saved blobs', () => {
  let snap: MarketSnapshot
  beforeAll(async () => {
    snap = await staticProvider.getSnapshot()
  })
  const blob = richBlob()
  const paths = leaves(blob)
  const bads: unknown[] = [undefined, null, 'x', -1, 0, 1e15, 1.5, [], {}, true]

  it('the unmutated blob loads and runs', () => {
    const store = new Map<string, string>([[STORAGE_KEY, JSON.stringify(blob)]])
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) => store.get(k) ?? null)
    const saved = loadState()
    expect(saved).not.toBeNull()
    runEngine(mergeState(initialState(), saved), snap)
    vi.restoreAllMocks()
  })

  it(`never throws and never yields NaN/Infinity (${paths.length} paths x ${bads.length} values)`, () => {
    const failures: string[] = []
    let loaded = 0
    for (const p of paths) {
      for (const bad of bads) {
        const mutated = mutate(blob, p, bad)
        const store = new Map<string, string>([[STORAGE_KEY, JSON.stringify(mutated)]])
        const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation((k) => store.get(k) ?? null)
        try {
          const saved = loadState()
          if (saved) {
            loaded += 1
            runEngine(mergeState(initialState(), saved), snap)
          }
        } catch (e) {
          failures.push(`${p.join('.')} <- ${JSON.stringify(bad)}: ${(e as Error).message}`)
        } finally {
          spy.mockRestore()
        }
      }
    }
    expect(loaded).toBeGreaterThan(0)
    expect(failures).toEqual([])
  }, 120_000)
})
