import { createContext, useContext, useState, type ReactNode } from 'react'

/** The unit every value of the Resultados page is shown in: per sack, per hectare or the whole crop. */
export type ResultsUnit = 'sc' | 'ha' | 'total'

interface Ctx {
  unit: ResultsUnit
  setUnit: (u: ResultsUnit) => void
}

const UnitContext = createContext<Ctx | null>(null)

/** One unit button for the whole page: the answer, the matrix and the DRE read it from here. */
export function ResultsUnitProvider({ children }: { children: ReactNode }) {
  const [unit, setUnit] = useState<ResultsUnit>('sc')
  return <UnitContext.Provider value={{ unit, setUnit }}>{children}</UnitContext.Provider>
}

/** The page unit; outside the provider (a component rendered alone) it keeps its own, starting at per sack. */
export function useResultsUnit(): Ctx {
  const shared = useContext(UnitContext)
  const [local, setLocal] = useState<ResultsUnit>('sc')
  return shared ?? { unit: local, setUnit: setLocal }
}

/** "R$/sc", "R$/ha" or "R$ total" (the money symbol follows the top currency). */
export function unitLabel(unit: ResultsUnit, currency: 'BRL' | 'USD'): string {
  const money = currency === 'USD' ? 'US$' : 'R$'
  return unit === 'total' ? `${money} total` : `${money}/${unit}`
}

/**
 * A whole-crop amount in the chosen unit: divided by the production (sacks), by the area (hectares) or as it is.
 * null when the divisor is not usable.
 */
export function inResultsUnit(total: number | null, unit: ResultsUnit, productionSc: number, areaHa: number): number | null {
  if (total === null || !Number.isFinite(total)) return null
  if (unit === 'total') return total
  const d = unit === 'sc' ? productionSc : areaHa
  return Number.isFinite(d) && d > 0 ? total / d : null
}
