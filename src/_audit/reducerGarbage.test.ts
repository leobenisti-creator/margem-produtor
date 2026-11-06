/**
 * The reducer must never throw nor store a non-finite number, whatever garbage an action carries
 * (a rejected action returns the very same state).
 */
import { initialState, reducer } from '../state/reducer'
import type { Action, AppState } from '../state/types'

const garbage: unknown[] = [undefined, null, NaN, Infinity, -Infinity, -1, 0, 1e15, '', 'x', [], {}, true, () => 1]

const types = [
  'setCrop', 'setRegion', 'setFob', 'setCustomBasis', 'setInput', 'setTargetMargin', 'setCurrency', 'setAreaUnit',
  'setCostMode', 'setCategory', 'override', 'applyScenario', 'resetScenario', 'setCostGroupMode', 'setCostItem',
  'setGroupTotal', 'setCostFxDefault', 'setCostBudgeted', 'setFxLock', 'setStepsPct', 'setYieldFactor',
  'setIncludeSold', 'addSale', 'updateSale', 'removeSale', 'addHedgeOp', 'updateHedgeOp', 'removeHedgeOp', 'tourDone',
]
const fields = [
  'crop', 'regionId', 'fobId', 'value', 'key', 'currency', 'unit', 'mode', 'fx', 'farmPriceBrl', 'id', 'group',
  'itemId', 'patch', 'partial', 'pct', 'rate', 'steps', 'cbotUsc',
]

function nonFinite(v: unknown, seen = new Set<unknown>()): string | null {
  if (typeof v === 'number') return Number.isFinite(v) ? null : 'non-finite number'
  if (v === null || typeof v !== 'object' || seen.has(v)) return null
  seen.add(v)
  for (const c of Object.values(v)) {
    const r = nonFinite(c, seen)
    if (r) return r
  }
  return null
}

describe('reducer with garbage payloads', () => {
  it('never throws and never leaves a non-finite number in the state', () => {
    let s: AppState = initialState()
    s = reducer(s, { type: 'addSale', partial: { volume: 10, price: 100 } })
    s = reducer(s, { type: 'addHedgeOp', partial: { qty: 1, strike: 1000 } })
    const problems: string[] = []
    for (const type of types) {
      for (const f of fields) {
        for (const g of garbage) {
          const a = { type, [f]: g } as unknown as Action
          try {
            const next = reducer(s, a)
            const bad = nonFinite(next.inputs) ?? nonFinite(next.overrides) ?? nonFinite(next.sales) ?? nonFinite(next.hedgeOps) ?? nonFinite(next.costGroups)
            if (bad) problems.push(`${type}.${f}=${String(g)}: ${bad}`)
          } catch (e) {
            problems.push(`${type}.${f}=${String(g)}: threw ${(e as Error).message}`)
          }
        }
      }
    }
    expect(problems).toEqual([])
  })
})
