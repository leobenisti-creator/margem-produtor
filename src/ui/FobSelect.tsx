import { FOB_GROUP_LABELS, OUTRO_FOB_ID, fobPointsFor, type FobGroup } from '../data/fobPoints'
import { useStore } from '../state/StoreProvider'

/** "Praça" select: the crop's points grouped by region (ports first), "Outro" last. */
export function FobSelect({ id, className }: { id: string; className: string }) {
  const { state, dispatch } = useStore()
  const points = fobPointsFor(state.crop)
  const groups = (Object.keys(FOB_GROUP_LABELS) as FobGroup[]).filter((g) => points.some((p) => p.group === g))
  return (
    <select
      id={id}
      value={state.fobId}
      onChange={(e) => dispatch({ type: 'setFob', fobId: e.target.value })}
      className={className}
    >
      {groups.map((g) => (
        <optgroup key={g} label={FOB_GROUP_LABELS[g]}>
          {points
            .filter((p) => p.group === g)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === 'paranagua' ? `${p.label} · referência` : p.label}
              </option>
            ))}
        </optgroup>
      ))}
      <option value={OUTRO_FOB_ID}>Outro (digitar os dados)</option>
    </select>
  )
}
