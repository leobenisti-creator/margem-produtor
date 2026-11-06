import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { effectiveYieldScHa } from '../engine/production'
import { scHaToTHa } from '../engine/units'
import { useResult } from './useResult'

type CostUnit = 'ha' | 't' | 'sc'

const Ctx = createContext<{ unit: CostUnit; setUnit: (u: CostUnit) => void; shared: boolean }>({
  unit: 'ha',
  setUnit: () => {},
  shared: false,
})

/** One cost-unit choice (R$/ha, R$/t or R$/sc) shared by every cost field of the "Custo de produção" card and the chart below it. */
export function CostUnitProvider({ children }: { children: ReactNode }) {
  const parent = useContext(Ctx)
  const [unit, setUnit] = useState<CostUnit>('ha')
  const value = useMemo(() => ({ unit, setUnit, shared: true }), [unit])
  // Already inside one (the page shares it between the cost card and the chart below): reuse it.
  if (parent.shared) return <>{children}</>
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/**
 * How the cost fields show a per-hectare amount: R$/ha (default) or per tonne or per sack (the cost per ha divided by
 * the yield in t/ha or sc/ha), in the currency chosen at the top. Everything stays stored per hectare; only what is
 * shown and typed is converted. Without a usable yield there is no per-tonne or per-sack view, so it stays on /ha.
 */
export function useCostUnit() {
  const { unit, setUnit } = useContext(Ctx)
  const { farmInputs, currency } = useResult()
  // Net sacks per hectare (barter out): the same divisor as the cost per sack of the result.
  const yieldSc = effectiveYieldScHa(farmInputs)
  const yieldT = scHaToTHa(yieldSc)
  const hasYield = Number.isFinite(yieldT) && yieldT > 0
  const id: CostUnit = hasYield ? unit : 'ha'
  // Cost per ha ÷ divisor = cost per shown unit.
  const divisor = id === 't' ? yieldT : id === 'sc' ? yieldSc : 1
  const sym = currency === 'BRL' ? 'R$' : 'US$'
  /** The two options for a given currency symbol (items are R$ or US$ whatever the top currency is). */
  const unitsFor = (s: string) => [
    { id: 'ha', label: `${s}/ha` },
    { id: 't', label: `${s}/t` },
    { id: 'sc', label: `${s}/sc` },
  ]
  return {
    units: unitsFor(sym),
    unitsFor,
    unitId: id,
    unitLabel: `${sym}/${id}`,
    /** Suffix of the shown unit: ha, t or sc. */
    suffix: id,
    /** Field name for the chosen unit. */
    fieldLabel: id === 't' ? 'Custo por tonelada' : id === 'sc' ? 'Custo por saca' : 'Custo por hectare',
    /** Plain label for a field of the given currency symbol (items are R$ or US$ whatever the top currency is). */
    labelFor: (s: string) => `${s}/${id}`,
    /** Per-tonne needs a yield to divide by. */
    canPick: (u: string) => u === 'ha' || hasYield,
    perT: id === 't',
    setUnit: (u: string) => setUnit(u === 't' ? 't' : u === 'sc' ? 'sc' : 'ha'),
    /** A per-hectare amount (already in the displayed currency) as shown: per ha or per t. */
    show: (perHa: number | null): number | null => (perHa === null ? null : perHa / divisor),
    /** What was typed (per ha or per t) back to per hectare. */
    toPerHa: (typed: number): number => typed * divisor,
    /** Same cost in the other unit; null when the yield is missing. */
    convert: (v: number, from: string, to: string): number | null => {
      if (from === to) return v
      if (!hasYield) return null
      const div = (u: string) => (u === 't' ? yieldT : u === 'sc' ? yieldSc : 1)
      return (v * div(from)) / div(to)
    },
  }
}
