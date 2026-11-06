import { X } from 'lucide-react'
import { useId, useRef, type ReactNode } from 'react'
import { useDialogBehavior } from './useDialogBehavior'

/**
 * A "document" laid over the page: the page behind stays visible but dimmed, and this sheet is the focus (a centred
 * sheet from sm, a bottom sheet on the phone). Focus moves in, Tab is trapped, Esc and the backdrop close it, and
 * focus goes back to the opener. Used for the saved sales and the saved market operations.
 */
export function DocumentOverlay({
  title,
  kicker,
  onClose,
  returnFocus,
  testId,
  wide = false,
  children,
}: {
  title: string
  /** Small line above the title. */
  kicker?: string
  onClose: () => void
  returnFocus?: () => HTMLElement | null
  testId?: string
  /** A wider sheet (from sm) for long documents with tables. */
  wide?: boolean
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogBehavior(ref, onClose, undefined, returnFocus)
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        className={`dialog-enter relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line-strong bg-bg shadow-2xl sm:max-h-[86vh] sm:rounded-2xl ${wide ? 'sm:max-w-[920px]' : 'sm:max-w-[720px]'}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line bg-card px-4 py-3.5">
          <div className="min-w-0">
            {kicker && <small className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-acc">{kicker}</small>}
            <h2 id={titleId} className="text-[17px] font-bold leading-tight">
              {title}
            </h2>
          </div>
          <button
            type="button"
            aria-label={`Fechar ${title}`}
            onClick={onClose}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[9px] border border-line bg-card text-mut hover:text-tx"
          >
            <X aria-hidden="true" size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="grid gap-3 overflow-y-auto px-4 py-4 text-xs">{children}</div>
      </div>
    </div>
  )
}
