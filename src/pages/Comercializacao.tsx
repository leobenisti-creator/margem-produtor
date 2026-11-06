import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { BarrierNotice } from '../ui/BarrierNotice'
import { Card } from '../ui/Card'
import { ComercializacaoKpis } from '../ui/ComercializacaoKpis'
import { ExposureCard } from '../ui/ExposureCard'
import { HedgePanel } from '../ui/HedgePanel'
import { NextSteps } from '../ui/NextSteps'
import { PageLocked } from '../ui/PageLocked'
import { SafraMap } from '../ui/SafraMap'
import { SalesSection } from '../ui/SalesPanel'
import { usePageLocks } from '../ui/usePageLocks'

/** The line-by-line exposure (the old card), kept one click away: the map and the risk lanes above say the same, drawn. */
function ExposureDetails() {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="exposicao-detalhes"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-[44px] items-center gap-1 rounded-[9px] border border-line px-3 text-xs text-mut hover:text-tx md:min-h-[36px]"
      >
        {open ? 'Esconder detalhes da exposição' : 'Ver detalhes da exposição'}
        <ChevronDown aria-hidden="true" size={14} strokeWidth={1.75} className={open ? 'rotate-180' : ''} />
      </button>
      <div id="exposicao-detalhes" hidden={!open} className="mt-3">
        <ExposureCard />
      </div>
    </div>
  )
}

/**
 * Comercialização: four cards about the crop (protected, 100% exposed, dollar, basis), what the producer already sold,
 * the operations on the exchange (hedge) and, at the end, the picture of the crop: the map of what is exposed to what
 * and the detailed exposure.
 */
export function Comercializacao() {
  const { isLocked } = usePageLocks()
  if (isLocked('comercializacao'))
    return <PageLocked testId="comercializacao-locked" title="Para registrar vendas e operações, preencha Lavoura e custos" />
  return (
    <section data-testid="page-comercializacao" className="mx-auto grid w-full min-w-0 max-w-[880px] gap-3.5">
      <ComercializacaoKpis />
      <Card n={1} title="Vendas da safra" testId="card-vendas">
        <SalesSection />
      </Card>
      <HedgePanel />
      <SafraMap />
      <BarrierNotice />
      <ExposureDetails />
      <NextSteps current="comercializacao" />
    </section>
  )
}
