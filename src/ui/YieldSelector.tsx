import { useStore } from '../state/StoreProvider'
import { Segmented } from './Segmented'

type Factor = '0.9' | '1' | '1.1'
const OPTIONS: { value: Factor; label: string }[] = [
  { value: '0.9', label: '−10%' },
  { value: '1', label: 'base' },
  { value: '1.1', label: '+10%' },
]

/** Label of a yield factor for notes: "−10%", "+10%" or "base". */
export function yieldFactorLabel(f: number): string {
  return OPTIONS.find((o) => Math.abs(Number(o.value) - f) < 1e-9)?.label ?? 'base'
}

/** Discreet yield selector for the matrix: a worse or better crop changes the cost per sack. */
export function YieldSelector() {
  const { state, dispatch } = useStore()
  const f = state.matrix.yieldFactor
  const value: Factor = f < 1 ? '0.9' : f > 1 ? '1.1' : '1'
  return (
    <div className="flex items-center gap-2 text-xs text-mut">
      <span aria-hidden="true">Produtividade</span>
      <Segmented
        ariaLabel="Produtividade da matriz"
        value={value}
        options={OPTIONS}
        onChange={(v) => dispatch({ type: 'setYieldFactor', value: Number(v) })}
      />
    </div>
  )
}
