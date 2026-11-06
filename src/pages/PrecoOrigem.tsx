import { PROVISORIO } from '../data/fobPoints'
import { Card } from '../ui/Card'
import { Reveal } from '../ui/motion'
import {
  BreakEvenCard,
  ComoCalculamosButton,
  ExposureCard,
  OtherMarketsNote,
} from '../ui/PriceSections'
import { routeHref } from '../ui/routes'
import { Waterfall } from '../ui/Waterfall'

/**
 * "De onde vem o preço" (`#/preco`, Feedback 1): opened in a new tab from the Simulação. It reads
 * the same saved state, so it opens with the Simulação numbers. Not a tab of the NavBar.
 */
export function PrecoOrigem() {
  return (
    <section data-testid="page-preco" className="mx-auto grid w-full min-w-0 max-w-[880px] gap-3.5">
      <a
        href={routeHref('simulador')}
        className="inline-flex min-h-[44px] items-center justify-self-start text-[13px] font-semibold text-g7 underline-offset-2 hover:underline md:min-h-[32px]"
      >
        ← Voltar à Simulação
      </a>
      <Reveal>
        <Card title="Cascata do preço" right="por saca">
          <Waterfall />
          <ComoCalculamosButton />
          <div className="mt-3 border-t border-dashed border-line pt-2.5">
            <OtherMarketsNote />
          </div>
        </Card>
      </Reveal>
      <div className="grid min-w-0 gap-3.5 sm:grid-cols-2">
        <Reveal delay={0.04}>
          <BreakEvenCard />
        </Reveal>
        <Reveal delay={0.08}>
          <ExposureCard />
        </Reveal>
      </div>
      {PROVISORIO && (
        <p role="note" className="text-[11px] text-mut">
          Bases por ponto FOB provisórias até a fonte de preços ser ligada.
        </p>
      )}
    </section>
  )
}
