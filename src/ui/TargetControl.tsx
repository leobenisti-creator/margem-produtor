import { useStore } from '../state/StoreProvider'
import { validateInput } from '../state/reducer'
import { NumberField } from './NumberField'
import { Switch } from './Switch'
import { useResult } from './useResult'

const DEFAULT_TARGET = 0.15

/** Hash fragment used by the matrix legend's "editar" link to reach this control. */
export const TARGET_ANCHOR_ID = 'meta-de-margem'

/**
 * Optional margin target (R13/R14/R20): off by default; on, it reveals the % field. It sits in the
 * "Definir meta de margem" dialog of the Simulação (Feedback 1): it only produces the minimum
 * price, the hero's "meta" check and the matrix colours.
 */
export function TargetControl() {
  const { dispatch } = useStore()
  const { farmInputs } = useResult()
  const target = farmInputs.targetMargin
  return (
    <div id={TARGET_ANCHOR_ID} className="scroll-mt-20">
      <Switch
        checked={target !== null}
        onChange={(on) => dispatch({ type: 'setTargetMargin', value: on ? DEFAULT_TARGET : null })}
        label="Definir meta de margem"
      />
      {target === null ? (
        <p className="text-[11px] text-mut">Sem meta: o app mostra só a margem final.</p>
      ) : (
        <div className="mt-1.5 sm:max-w-[50%]">
          <NumberField
            label="Meta de margem (%)"
            unit="%"
            value={target * 100}
            validate={(v) => validateInput('targetMargin', v / 100)}
            onCommit={(v) => dispatch({ type: 'setTargetMargin', value: v / 100 })}
          />
        </div>
      )}
    </div>
  )
}
