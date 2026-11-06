import { useRef } from 'react'
import { useDialogBehavior } from '../useDialogBehavior'
import { WELCOME_CARDS } from './steps'
import { btn, primary, secondary } from './styles'

export function Dots({ count, index }: { count: number; index: number }) {
  return (
    <span aria-hidden="true" className="flex items-center gap-1.5">
      {Array.from({ length: count }, (_, i) => (
        <i key={i} className={`block h-1.5 w-1.5 rounded-full ${i === index ? 'bg-g7' : 'bg-line-strong'}`} />
      ))}
    </span>
  )
}

/**
 * Welcome cards: a centred modal dialog (focus trapped, Esc skips). `onSkip` ends the whole tour,
 * `onDone` moves on to the balloons.
 */
export function Welcome({
  card,
  onCard,
  onSkip,
  onDone,
}: {
  card: number
  onCard: (n: number) => void
  onSkip: () => void
  onDone: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useDialogBehavior(ref, onSkip)
  const total = WELCOME_CARDS.length
  const last = card === total - 1
  const { title, body } = WELCOME_CARDS[card]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-welcome-title"
        aria-describedby="tour-welcome-body"
        tabIndex={-1}
        className="dialog-enter max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-bg p-4 shadow-xl md:max-w-md md:rounded-2xl"
      >
        <div className="mb-3 flex items-center justify-between gap-3 text-xs text-mut">
          <span className="flex items-center gap-2">
            <Dots count={total} index={card} />
            <span>
              Passo {card + 1} de {total}
            </span>
          </span>
          <button type="button" onClick={onSkip} className={secondary}>
            Pular tour
          </button>
        </div>
        <div aria-live="polite">
          <h2 id="tour-welcome-title" className="text-[16px] font-bold">
            {title}
          </h2>
          <p id="tour-welcome-body" className="mt-1.5 text-pretty text-sm text-mut">
            {body}
          </p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          {card > 0 && (
            <button type="button" onClick={() => onCard(card - 1)} className={secondary}>
              Voltar
            </button>
          )}
          <button
            type="button"
            data-autofocus
            onClick={() => (last ? onDone() : onCard(card + 1))}
            className={`${btn} ${primary}`}
          >
            {last ? 'Começar' : 'Próximo'}
          </button>
        </div>
      </div>
    </div>
  )
}
