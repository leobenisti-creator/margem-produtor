import { ArrowRight, Lock } from 'lucide-react'
import { routeHref } from './routes'
import { usePageLocks } from './usePageLocks'

/** Calm empty state of a locked page (Comercialização, Resultados): what is missing and the way to Lavoura e custos. */
export function PageLocked({ testId, title }: { testId: string; title: string }) {
  const { missing } = usePageLocks()
  return (
    <section data-testid={testId} className="mx-auto my-6 grid w-full max-w-md gap-3 rounded-[14px] border border-line bg-card p-5 text-center">
      <Lock aria-hidden="true" size={22} strokeWidth={1.75} className="mx-auto text-mut" />
      <h2 className="text-[15px] font-bold">{title}</h2>
      <p className="text-sm text-mut">A margem precisa da sua lavoura e do seu custo por hectare para ser calculada.</p>
      {missing.length > 0 && (
        <div className="text-left">
          <p className="text-xs font-semibold text-mut">O que falta:</p>
          <ul data-testid="locked-missing" className="mt-1 list-disc pl-5 text-sm">
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      <a
        href={routeHref('simulador')}
        className="mx-auto inline-flex min-h-[44px] items-center gap-2 rounded-[9px] border border-g7 bg-g7 px-4 text-sm font-semibold text-accink hover:bg-mint"
      >
        Ir para Lavoura e custos
        <ArrowRight aria-hidden="true" size={16} strokeWidth={1.75} />
      </a>
    </section>
  )
}
