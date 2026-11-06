import { Target } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/StoreProvider'
import { consumeFocusRequest, focusTarget } from './focusRequest'
import { fmtNum } from './format'
import { MinPrice } from './PriceSections'
import { PriceFormationOverlay } from './PriceFormation'
import { TargetControl } from './TargetControl'
import { useDialogBehavior } from './useDialogBehavior'

const pill =
  'inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-[9px] border px-3 text-xs font-semibold md:min-h-[36px]'
const quiet = `${pill} border-line bg-card text-tx hover:border-g7`

/** Small modal with the target switch, the % field and the minimum price it implies. */
function MetaDialog({ returnTo, onClose }: { returnTo: () => HTMLElement | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  // Focus goes back to what opened it (the button); when opened from the matrix legend link, to the button too.
  useDialogBehavior(ref, onClose, undefined, returnTo)
  // A request from the matrix legend ("Meta · editar") lands on the switch (it is also the first control).
  useEffect(() => {
    if (ref.current) focusTarget('meta', ref.current)
  }, [])
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center md:items-center">
      <div data-testid="meta-backdrop" aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="meta-dialog-title"
        className="dialog-enter relative max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-bg p-4 shadow-xl md:max-w-sm md:rounded-2xl"
      >
        <h2 id="meta-dialog-title" className="mb-2 text-[16px] font-bold">
          Meta de margem
        </h2>
        <TargetControl />
        <div className="mt-3">
          <MinPrice />
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className={quiet}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Slim row under the cards: "Formação do preço" opens the same "Formação do preço da fazenda" document (on top of the page) as Resultados financeiros. The margin-target button is off the page for now (`showMeta`, until it gets its
 * new place); the dialog still opens from the matrix legend's "Meta · editar" link.
 */
export function SimActions({ showMeta = false }: { showMeta?: boolean }) {
  const { state } = useStore()
  const target = state.inputs.targetMargin
  const [open, setOpen] = useState(false)
  const [formation, setFormation] = useState(false)
  const metaBtn = useRef<HTMLButtonElement>(null)
  const formationBtn = useRef<HTMLButtonElement>(null)

  // The matrix legend's "Meta: X% · editar" link asks for the target control: open the dialog on it.
  useEffect(() => {
    if (consumeFocusRequest() === 'meta') setOpen(true)
  }, [])

  return (
    <>
      <div data-testid="sim-actions" className="flex flex-wrap items-center gap-2">
        {showMeta && (
          <button
            ref={metaBtn}
            type="button"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
            className={target === null ? quiet : `${pill} border-g7 bg-card text-g7`}
          >
            <Target aria-hidden="true" size={14} strokeWidth={1.75} />
            {target === null ? 'Definir meta de margem' : `Meta: ${fmtNum(target * 100, 0)}%`}
          </button>
        )}
        <button
          ref={formationBtn}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={formation}
          onClick={() => setFormation(true)}
          className={`${pill} border-g7 bg-card text-g7`}
        >
          Formação do preço da fazenda
        </button>
      </div>
      {formation && <PriceFormationOverlay onClose={() => setFormation(false)} returnFocus={() => formationBtn.current} />}
      {open && <MetaDialog returnTo={() => metaBtn.current} onClose={() => setOpen(false)} />}
    </>
  )
}
