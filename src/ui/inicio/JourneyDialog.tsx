import type { ReactNode } from 'react'
import { gatesEnabled } from '../../state/gates'
import type { Journey } from '../../state/journey'
import { DocumentOverlay } from '../DocumentOverlay'
import { routeHref, type TabRoute } from '../routes'

const rowBase = 'flex min-h-[44px] items-center gap-3 rounded-[10px] border px-3 py-2.5 text-[13px]'
const rowLink = `${rowBase} border-line bg-card hover:border-gold`
const rowStatic = `${rowBase} border-line bg-card`
const rowLocked = `${rowBase} border-line bg-bg text-mut opacity-80`
const primaryBtn =
  'inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-acc px-5 text-sm font-extrabold text-accink hover:bg-mint'

function Num({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="num grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line-strong text-[11px] font-bold"
    >
      {n}
    </span>
  )
}

function Row({
  n,
  title,
  note,
  badge,
  href,
  locked = false,
}: {
  n: number
  title: string
  note: ReactNode
  badge?: string
  href?: string
  locked?: boolean
}) {
  const body = (
    <>
      <Num n={n} />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className={`block text-[12px] leading-snug ${locked ? '' : 'text-mut'}`}>{note}</span>
      </span>
      {badge && (
        <span className="shrink-0 rounded-full bg-acc px-2 py-0.5 text-[10.5px] font-extrabold tracking-wide text-accink">
          {badge}
        </span>
      )}
    </>
  )
  if (href) {
    return (
      <li>
        <a href={href} className={rowLink}>
          {body}
        </a>
      </li>
    )
  }
  return (
    <li>
      <div className={locked ? rowLocked : rowStatic} {...(locked ? { 'data-locked': 'true' } : {})}>
        {body}
      </div>
    </li>
  )
}

interface DialogProps {
  onClose: () => void
  /** Where focus goes on close when the browser did not focus the button on click (Safari). */
  returnFocus?: () => HTMLElement | null
}

/** Visitor who started but has no cost per hectare yet: the way is Lavoura e custos first. */
function SemCustosDialog({ journey, onClose, returnFocus }: DialogProps & { journey: Journey }) {
  const toGo = routeHref('simulador')
  return (
    <DocumentOverlay title="Primeiro, preencha Lavoura e custos" onClose={onClose} returnFocus={returnFocus} testId="journey-sem-custos">
      <p className="text-[13px] leading-relaxed text-mut">
        Para calcular a sua margem o app precisa da sua lavoura e do seu custo. Depois de preencher, você libera as
        outras páginas.
      </p>
      <ol aria-label="As três páginas" className="grid gap-2">
        <Row
          n={1}
          title="Lavoura e custos"
          note={journey.missing.length > 0 ? `Falta: ${journey.missing.join(', ')}` : 'Área, produtividade e custos'}
          badge="AGORA"
        />
        {gatesEnabled() ? (
          <>
            <Row n={2} title="Comercialização" note="Libera depois de preencher os custos" locked />
            <Row n={3} title="Resultados financeiros" note="Libera depois de preencher os custos" locked />
          </>
        ) : (
          <>
            <Row n={2} title="Comercialização" note="Suas vendas, operações em bolsa e exposição" href={routeHref('comercializacao')} />
            <Row n={3} title="Resultados financeiros" note="Margem, cenários do mercado e risco" href={routeHref('resultados')} />
          </>
        )}
      </ol>
      <a href={toGo} className={primaryBtn}>
        Ir para Lavoura e custos →
      </a>
    </DocumentOverlay>
  )
}

function OptionRow({ n, route, title, note }: { n: number; route: TabRoute; title: string; note: ReactNode }) {
  return <Row n={n} title={title} note={note} href={routeHref(route)} />
}

/** Visitor who already filled the farm and costs: just the three pages to choose from; a click goes straight there. */
function ComCustosDialog({ onClose, returnFocus }: DialogProps) {
  return (
    <DocumentOverlay title="Bem-vindo de volta" onClose={onClose} returnFocus={returnFocus} testId="journey-com-custos">
      <p className="text-[13px] leading-relaxed text-mut">Escolha a página que quer abrir. Seus dados continuam salvos neste navegador.</p>
      <ol aria-label="As três páginas" className="grid gap-2">
        <OptionRow n={1} route="simulador" title="Lavoura e custos" note="Sua lavoura, seus custos e o preço na fazenda" />
        <OptionRow n={2} route="comercializacao" title="Comercialização" note="Suas vendas, operações em bolsa e exposição" />
        <OptionRow n={3} route="resultados" title="Resultados financeiros" note="Margem, cenários do mercado e risco" />
      </ol>
    </DocumentOverlay>
  )
}

/** The dialog for a journey state. */
export function JourneyDialog({ journey, onClose, returnFocus }: DialogProps & { journey: Journey }) {
  if (journey.state === 'com-custos') return <ComCustosDialog onClose={onClose} returnFocus={returnFocus} />
  return <SemCustosDialog journey={journey} onClose={onClose} returnFocus={returnFocus} />
}
