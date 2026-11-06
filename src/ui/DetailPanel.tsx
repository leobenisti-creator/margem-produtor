import { useId, useRef } from 'react'
import { COST_ITEMS, groupOfItem } from '../data/costItems'
import { COST_CATEGORY_LABELS } from '../data/types'
import { FertilizerPanel } from './FertilizerPanel'
import { ProductTable } from './ProductTable'
import { useDialogBehavior } from './useDialogBehavior'

/**
 * Side drawer (bottom sheet on phones) for "Detalhar ›" on an Adubação or Defensivos item. Modal:
 * focus moves in, Tab is trapped, Esc and "Fechar" close it and focus returns to the trigger.
 */
export function DetailPanel({
  itemId,
  onClose,
  trigger,
}: {
  itemId: string
  onClose: () => void
  trigger: HTMLElement | null
}) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogBehavior(ref, onClose, trigger)
  const group = groupOfItem(itemId)
  const label = COST_ITEMS.find((i) => i.id === itemId)?.label ?? itemId
  const adubo = group === 'fertilizantes'

  return (
    <div className="fixed inset-0 z-50">
      <div data-testid="detail-backdrop" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="dialog-enter absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col overflow-hidden rounded-t-2xl bg-bg shadow-xl md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[560px] md:rounded-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line bg-card px-4 py-3">
          <div className="min-w-0">
            <small className="text-xs font-medium text-mut">{group ? `Seu custo · ${COST_CATEGORY_LABELS[group]}` : 'Seu custo'}</small>
            <h2 id={titleId} className="text-[16px] font-bold">
              Detalhar {label}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] shrink-0 rounded-[9px] border border-line bg-card px-4 text-xs font-semibold"
          >
            Fechar
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-4 py-4">
          {adubo ? (
            <FertilizerPanel itemId={itemId} onDone={onClose} />
          ) : (
            <ProductTable itemId={itemId} kind="defensivo" onDone={onClose} />
          )}
        </div>
      </div>
    </div>
  )
}
