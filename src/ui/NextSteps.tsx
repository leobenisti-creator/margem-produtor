import { ArrowRight, Lock } from 'lucide-react'
import { useId } from 'react'
import { routeHref, type Route } from './routes'
import { usePageLocks } from './usePageLocks'

export type StepPage = 'simulador' | 'comercializacao' | 'resultados'

const LABELS: Record<StepPage, string> = {
  simulador: 'Lavoura e custos',
  comercializacao: 'Comercialização',
  resultados: 'Resultados financeiros',
}

const ORDER: StepPage[] = ['simulador', 'comercializacao', 'resultados']

const btn =
  'flex min-h-[44px] w-full items-center justify-between gap-2 rounded-[10px] border border-line-strong bg-surface2 px-4 py-2.5 text-left text-sm font-semibold text-tx'

/** "Ir para": the end-of-page block that leads to the other two main pages (scrolls with the content). */
export function NextSteps({ current }: { current: StepPage }) {
  const { isLocked, reason } = usePageLocks()
  const reasonId = useId()
  const targets = ORDER.filter((p) => p !== current)
  return (
    <nav aria-labelledby={`${reasonId}-h`} data-testid="next-steps" className="min-w-0 rounded-[14px] border border-line bg-card px-4 py-[15px]">
      <h2 id={`${reasonId}-h`} className="mb-2.5 text-[13.5px] font-bold">
        Ir para
      </h2>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {targets.map((p) => {
          if (isLocked(p)) {
            return (
              <div key={p} className="grid gap-1.5">
                <button
                  type="button"
                  aria-disabled="true"
                  aria-describedby={`${reasonId}-${p}`}
                  data-testid={`next-${p}`}
                  onClick={(e) => e.preventDefault()}
                  className={`${btn} cursor-not-allowed text-mut`}
                >
                  {LABELS[p]}
                  <Lock aria-hidden="true" size={16} strokeWidth={1.75} className="shrink-0" />
                </button>
                <p id={`${reasonId}-${p}`} className="text-xs text-mut">
                  {reason}
                </p>
              </div>
            )
          }
          return (
            <a
              key={p}
              href={routeHref(p as Route)}
              data-testid={`next-${p}`}
              data-tour={current === 'simulador' && p === 'comercializacao' ? 'proximo' : undefined}
              className={`${btn} hover:border-g7`}
            >
              {LABELS[p]}
              <ArrowRight aria-hidden="true" size={16} strokeWidth={1.75} className="shrink-0 text-g7" />
            </a>
          )
        })}
      </div>
    </nav>
  )
}
