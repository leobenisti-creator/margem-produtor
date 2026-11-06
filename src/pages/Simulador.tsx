import type { ReactNode } from 'react'
import { CostSummary } from '../ui/CostSummary'
import { CostUnitProvider } from '../ui/costUnit'
import { CustoCard } from '../ui/CustoCard'
import { fmtMoney } from '../ui/format'
import { FarmKpiRow } from '../ui/FarmKpiRow'
import { LavouraCard } from '../ui/LavouraCard'
import { NextSteps } from '../ui/NextSteps'
import { Reveal } from '../ui/motion'
import { SimActions } from '../ui/SimActions'
import { useResult } from '../ui/useResult'

/** Screen-reader echo of the hero number (the result cards are not a live region themselves). */
function ResultLive() {
  const { result, currency, toDisplay } = useResult()
  return (
    <span data-testid="result-live" className="sr-only" aria-live="polite" aria-atomic="true">
      Margem bruta por saca {fmtMoney(toDisplay(result.marginPerSc), currency)}
    </span>
  )
}

/**
 * Simulação limpa (Feedback 1): the four farm cards on top (`kpis`, the margin cards in the old layout), a slim row of buttons (meta, análise,
 * "De onde vem o preço" in a new tab), then the three steps in one centred column. Nothing on the
 * right and no result sheet on phones: the cards at the top carry the result at every width.
 */
export function Simulador({ kpis = <FarmKpiRow />, showMeta = false }: { kpis?: ReactNode; showMeta?: boolean }) {
  return (
    <section data-testid="page-simulador" className="grid min-w-0 gap-3.5">
      {kpis}
      <SimActions showMeta={showMeta} />
      <div data-testid="sim-form" className="mx-auto grid w-full min-w-0 max-w-[880px] gap-3.5">
        <Reveal>
          <LavouraCard />
        </Reveal>
        <CostUnitProvider>
          <Reveal delay={0.04}>
            <CustoCard />
          </Reveal>
          {/* The chart follows the page, not the cost card; it shares the card's unit choice. */}
          <CostSummary />
        </CostUnitProvider>
      </div>
      <NextSteps current="simulador" />
      <ResultLive />
    </section>
  )
}
