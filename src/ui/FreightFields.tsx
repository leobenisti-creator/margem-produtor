import { useState } from 'react'
import { useStore } from '../state/StoreProvider'
import { DEFAULT_PORT_FEES_BRL_PER_SC, isCustomBasis, validateInput } from '../state/reducer'
import { scenarioBasisUsc } from '../state/basis'
import { OUTRO_FOB_ID } from '../data/fobPoints'
import { SACK_TON } from '../engine/units'
import { fmtBrl } from './format'
import { NumberField } from './NumberField'
import { UnitPicker } from './UnitNumberField'
import { useResult } from './useResult'

export type PerUnit = 't' | 'sc'

/**
 * One unit button for the premium, freight and port fees together: <currency>/t (default) or <currency>/sc.
 * The currency is the one of the top button; the stored values never change, only how they are shown and typed.
 */
export function PerUnitPicker({ unit, onChange }: { unit: PerUnit; onChange: (next: PerUnit) => void }) {
  const { currency, usdBlocked } = useResult()
  const sym = currency === 'USD' ? 'US$' : 'R$'
  return (
    <div className="flex items-center gap-1.5 text-[12px] text-mut">
      <span>Valores em</span>
      <UnitPicker
        units={[
          { id: 't', label: `${sym}/t` },
          { id: 'sc', label: `${sym}/sc` },
        ]}
        unit={unit}
        title="Unidade do prêmio, do frete e das taxas"
        disabled={usdBlocked}
        onPick={(id) => onChange(id as PerUnit)}
      />
    </div>
  )
}

/**
 * A money field in <currency>/t or /sc (the `unit` shared by the fields next to it). The currency is the one of
 * the top button; the stored value is always R$/sc (or US¢/bu for the premium), and the typed number is converted to it.
 */
export function PerUnitMoneyField({
  label,
  unit,
  brlPerSc,
  validateBrlPerSc,
  onCommitBrlPerSc,
  helper,
}: {
  label: string
  unit: PerUnit
  /** Stored value in R$/sc. */
  brlPerSc: number
  validateBrlPerSc: (brlPerSc: number) => string | null
  onCommitBrlPerSc: (brlPerSc: number) => void
  helper?: React.ReactNode
}) {
  const { currency, toDisplay, fromDisplayMoney, usdBlocked } = useResult()
  const sym = currency === 'USD' ? 'US$' : 'R$'
  const perT = unit === 't'
  const shown = toDisplay(brlPerSc)
  // Typed number (in the shown currency and unit) to R$/sc; null when the dollar cannot convert it.
  const toBrlPerSc = (v: number) => {
    const brl = fromDisplayMoney(v)
    return brl === null ? null : perT ? brl * SACK_TON : brl
  }
  return (
    <NumberField
      label={label}
      unit={`${sym}/${unit}`}
      disabled={usdBlocked}
      value={shown === null ? 0 : perT ? shown / SACK_TON : shown}
      validate={(v) => {
        const brl = toBrlPerSc(v)
        return brl === null ? 'Dólar indisponível.' : validateBrlPerSc(brl)
      }}
      onCommit={(v) => {
        const brl = toBrlPerSc(v)
        if (brl !== null) onCommitBrlPerSc(brl)
      }}
      helper={helper}
    />
  )
}

/**
 * The three things that turn the market price into the farm price: premium of the port (stored in US¢/bu as the
 * basis override), freight to the port and port/warehouse fees (stored in R$/sc). Opens in <currency>/t.
 */
export function FreightFields() {
  const { state, dispatch } = useStore()
  const { farmInputs, crop, fx } = useResult()
  const fees = farmInputs.portFeesBrlPerSc
  // The freight starts empty: the producer types it, and 0 is said out loud so it is never read as a reference.
  const noFreight = !(farmInputs.freightBrlPerSc > 0)
  // US¢/bu <-> R$/sc: c/100 × bushels per sack × dollar. "Outro" types it here too (stored as its own base).
  const premiumBrlPerSc = (scenarioBasisUsc(state) / 100) * crop.bushelsPerSack * fx
  const premiumUsable = Number.isFinite(premiumBrlPerSc) && Number.isFinite(fx) && fx > 0
  const toCents = (brl: number) => (brl / (crop.bushelsPerSack * fx)) * 100
  const outro = state.fobId === OUTRO_FOB_ID
  const [unit, setUnit] = useState<PerUnit>('t')
  return (
    <div className="mt-2 grid gap-2">
      <PerUnitPicker unit={unit} onChange={setUnit} />
      <div className="grid gap-2.5 sm:grid-cols-3">
        {premiumUsable && (
        <PerUnitMoneyField
          label="Prêmio do porto"
          unit={unit}
          brlPerSc={premiumBrlPerSc}
          validateBrlPerSc={(brl) =>
            outro ? (isCustomBasis(toCents(brl)) ? null : 'Digite um número.') : validateInput('basisUsc', toCents(brl))
          }
          onCommitBrlPerSc={(brl) =>
            dispatch(
              outro
                ? { type: 'setCustomBasis', value: toCents(brl) }
                : { type: 'override', key: 'basisUsc', value: toCents(brl) },
            )
          }
          helper={
            outro || state.overrides.basisUsc !== undefined ? (
              <span data-testid="premium-derived">equivale a {scenarioBasisUsc(state).toFixed(2).replace('.', ',')} US¢/bu</span>
            ) : (
              <span className="inline-block rounded-full bg-surface2 px-2 py-px text-[11px] text-acc">
                da praça escolhida
              </span>
            )
          }
        />
      )}
        <PerUnitMoneyField
          label="Frete até o porto"
          unit={unit}
          brlPerSc={farmInputs.freightBrlPerSc}
          validateBrlPerSc={(brl) => validateInput('freightBrlPerSc', brl)}
          onCommitBrlPerSc={(brl) => dispatch({ type: 'setInput', key: 'freightBrlPerSc', value: brl })}
          helper={
            <>
              <span data-testid="freight-derived">equivale a {fmtBrl(farmInputs.freightBrlPerSc)}/sc</span>
              {noFreight && <span className="block">Informe o seu frete até o porto: sem ele, a conta não desconta frete.</span>}
            </>
          }
        />
        <PerUnitMoneyField
          label="Taxas de porto/armazém"
          unit={unit}
          brlPerSc={fees}
          validateBrlPerSc={(brl) => validateInput('portFeesBrlPerSc', brl)}
          onCommitBrlPerSc={(brl) => dispatch({ type: 'setInput', key: 'portFeesBrlPerSc', value: brl })}
          helper={
            fees === DEFAULT_PORT_FEES_BRL_PER_SC ? (
              <span className="inline-block rounded-full bg-surface2 px-2 py-px text-[11px] text-acc">
                padrão do app
              </span>
            ) : undefined
          }
        />
      </div>
    </div>
  )
}
