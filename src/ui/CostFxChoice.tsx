import { useState } from 'react'
import { effectiveFxText, FxPairFields, type FxPair } from './FxChip'
import { NumberField } from './NumberField'
import { Segmented } from './Segmented'

type Mode = 'aberto' | 'fixado'

/** 0% bought = open (market dollar); 100% at a rate = fixed; anything in between is a partial purchase. */
export function fxModeOf(v: FxPair): Mode | 'parcial' {
  if (v.boughtPct === 0) return 'aberto'
  return v.boughtPct === 1 ? 'fixado' : 'parcial'
}

/**
 * The dollar of one cost in US$ (an item or a group total): open (today's market dollar, so exposed) or fixed at the
 * rate it was bought. "Editar câmbio" opens the optional partial split (part fixed at a rate, the rest open).
 * `fx` is today's market dollar. A fixed choice without its rate is held here (never stored) until the rate is typed.
 */
export function CostFxChoice({
  value,
  onChange,
  fx,
  label,
  followsDefault = false,
}: {
  value: FxPair
  onChange: (v: FxPair) => void
  fx: number
  /** Name of the cost, used in the accessible names. */
  label: string
  followsDefault?: boolean
}) {
  const stored = fxModeOf(value)
  const [wantsFixed, setWantsFixed] = useState(false)
  const [partial, setPartial] = useState(stored === 'parcial')
  const mode: Mode = stored === 'aberto' ? (wantsFixed ? 'fixado' : 'aberto') : 'fixado'
  const rate = value.boughtPct > 0 ? value.boughtRate : 0

  function choose(next: Mode) {
    if (next === 'aberto') {
      setWantsFixed(false)
      setPartial(false)
      onChange({ boughtPct: 0, boughtRate: 0 })
    } else if (value.boughtPct === 0) {
      // Nothing is stored until the producer types the dollar it was fixed at.
      setWantsFixed(true)
    }
  }

  return (
    <div role="group" aria-label={`Dólar de ${label}`} className="mt-2 rounded-[10px] border border-line bg-surface2 px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Mode>
          ariaLabel={`Câmbio de ${label}`}
          value={mode}
          options={[
            { value: 'aberto', label: 'Câmbio aberto' },
            { value: 'fixado', label: 'Câmbio fixado' },
          ]}
          onChange={choose}
        />
        {mode === 'fixado' && stored !== 'parcial' && (
          <NumberField
            label={`A que dólar (${label})`}
            labelHidden
            unit="R$/US$"
            maxDecimals={4}
            value={rate}
            validate={(v) => (v <= 0 ? 'O dólar deve ser maior que zero.' : null)}
            onCommit={(v) => {
              if (v > 0) {
                setWantsFixed(false)
                onChange({ boughtPct: 1, boughtRate: v })
              }
            }}
          />
        )}
        <button
          type="button"
          aria-expanded={partial}
          onClick={() => setPartial((p) => !p)}
          className="ml-auto min-h-[44px] rounded-[9px] px-2 text-xs font-semibold text-acc md:min-h-[32px]"
        >
          {partial ? 'Fechar câmbio' : 'Editar câmbio'}
        </button>
      </div>
      {mode === 'fixado' && stored === 'aberto' && (
        <p className="mt-1 text-[11.5px] text-acc">Informe a que dólar foi fixado; até lá conta como aberto.</p>
      )}
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-mut">
        <span data-testid="fx-effective" className="num font-semibold text-tx">
          {effectiveFxText(value, fx)}
        </span>
        {stored === 'aberto' && <span>· exposto ao dólar</span>}
        {followsDefault && <span>· segue o dólar padrão dos seus custos em US$</span>}
      </p>
      {partial && (
        <div className="mt-2">
          <FxPairFields
            value={value}
            onChange={onChange}
            pctLabel={`Já fixado (${label})`}
            rateLabel={`A que dólar fixou (${label})`}
            pctText="parte fixada"
            rateText="a que dólar"
            missingText="Informe a que dólar fixou para usar esse percentual."
          />
          <p className="mt-1 text-[11px] text-mut">O restante fica aberto, no dólar de mercado.</p>
        </div>
      )}
    </div>
  )
}
