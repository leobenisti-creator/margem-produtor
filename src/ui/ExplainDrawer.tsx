import { Info } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useStore } from '../state/StoreProvider'
import { buildComparison } from './comparison'
import { buildExplanation, type ExplainKey } from './explain'
import { useDialogBehavior } from './useDialogBehavior'
import { useResult } from './useResult'

export type { ExplainKey } from './explain'

export interface ExplainApi {
  open(key: ExplainKey, trigger?: HTMLElement | null): void
  close(): void
  current: ExplainKey | null
}

interface Internal extends ExplainApi {
  trigger: HTMLElement | null
}

// Without a provider (isolated component tests) the triggers simply do nothing.
const NOOP: Internal = {
  open: () => {},
  close: () => {},
  current: null,
  trigger: null,
}
const ExplainContext = createContext<Internal>(NOOP)

export function useExplain(): ExplainApi {
  const { open, close, current } = useContext(ExplainContext)
  return { open, close, current }
}

export function ExplainProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    key: ExplainKey | null
    trigger: HTMLElement | null
  }>({
    key: null,
    trigger: null,
  })
  const open = useCallback((key: ExplainKey, trigger?: HTMLElement | null) => {
    const active = document.activeElement
    setState({
      key,
      trigger:
        trigger ?? (active instanceof HTMLElement && active !== document.body ? active : null),
    })
  }, [])
  const close = useCallback(() => setState((s) => ({ ...s, key: null })), [])
  const value = useMemo<Internal>(
    () => ({ open, close, current: state.key, trigger: state.trigger }),
    [open, close, state],
  )
  return <ExplainContext.Provider value={value}>{children}</ExplainContext.Provider>
}

/** Small round "i" button that opens the explanation for `k`. */
export function ExplainButton({
  k,
  label,
  className = '',
}: {
  k: ExplainKey
  label: string
  className?: string
}) {
  const { open } = useExplain()
  return (
    <button
      type="button"
      aria-label={`Como calculamos: ${label}`}
      onClick={(e) => open(k, e.currentTarget)}
      className={`inline-grid h-11 w-11 shrink-0 place-items-center rounded-full md:h-7 md:w-7 ${className}`}
    >
      <Info aria-hidden="true" size={20} strokeWidth={1.75} className="md:h-[18px] md:w-[18px]" />
    </button>
  )
}

function Drawer({
  k,
  trigger,
  onClose,
}: {
  k: ExplainKey
  trigger: HTMLElement | null
  onClose: () => void
}) {
  const { state, snapshot } = useStore()
  const { result, farmInputs, scenario, crop, currency, fx } = useResult()
  const comparison = buildComparison(snapshot, crop.id, currency, fx, result.farmPriceBrl)
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogBehavior(ref, onClose, trigger)

  const ex = buildExplanation(k, {
    result,
    farmInputs,
    scenario,
    crop,
    currency,
    fx,
    marginBase: farmInputs.marginBase,
    costMode: state.costMode,
    comparison: comparison.position ?? undefined,
  })

  return (
    <div className="fixed inset-0 z-50">
      <div
        data-testid="explain-backdrop"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="dialog-enter absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col overflow-hidden rounded-t-2xl bg-bg shadow-xl md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[440px] md:rounded-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line bg-card px-4 py-3">
          <div>
            <small className="text-xs font-medium text-mut">Como calculamos</small>
            <h2 id={titleId} className="text-[16px] font-bold">
              {ex.title}
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
        <div className="grid gap-3 overflow-y-auto px-4 py-4">
          <p className="text-sm">{ex.intro}</p>
          {/* Plain list with hairlines (P2-17): no cards inside the panel. */}
          <ol className="divide-y divide-line rounded-[10px] border border-line bg-card px-3">
            {ex.lines.map((l) => (
              <li key={l.label} className="py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-semibold">{l.label}</span>
                  <b className="num shrink-0 text-right text-sm">{l.value}</b>
                </div>
                <span className="text-pretty block break-words text-[11.5px] leading-[1.45] text-mut">{l.formula}</span>
              </li>
            ))}
          </ol>
          {ex.note && <p className="text-pretty text-xs text-mut">{ex.note}</p>}
          <p className="border-t border-line pt-3 text-[11.5px] text-mut">
            Valores em {currency === 'BRL' ? 'reais (R$)' : 'dólares (US$)'}; conta feita no seu
            navegador.
          </p>
        </div>
      </div>
    </div>
  )
}

/** Mount once inside StoreProvider + ExplainProvider. */
export function ExplainDrawer() {
  const { current, close, trigger } = useContext(ExplainContext)
  if (current === null) return null
  return <Drawer k={current} trigger={trigger} onClose={close} />
}
