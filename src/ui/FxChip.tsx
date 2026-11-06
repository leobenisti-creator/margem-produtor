import { useEffect, useState } from 'react'
import { effectiveFx } from '../engine/calc'
import { validateFxPair } from '../state/costs'
import { fmtNum } from './format'
import { NumberField } from './NumberField'

export interface FxPair {
  boughtPct: number
  boughtRate: number
}

/**
 * Two linked fields (fraction 0..1 shown as %, rate R$/US$). A pair is reported only when valid:
 * a bought % without its dollar is held locally (never stored) until the dollar is typed.
 */
export function FxPairFields({
  value,
  onChange,
  pctLabel,
  rateLabel,
  pctText,
  rateText,
  missingText = 'Informe a que dólar comprou para usar esse percentual.',
}: {
  value: FxPair
  onChange: (v: FxPair) => void
  /** Accessible names of the two inputs (unique on the page). */
  pctLabel: string
  rateLabel: string
  /** Visible text before each field. */
  pctText: string
  rateText: string
  /** Shown while a % is typed without its dollar. */
  missingText?: string
}) {
  const [draft, setDraft] = useState<FxPair>(value)
  useEffect(() => {
    setDraft({ boughtPct: value.boughtPct, boughtRate: value.boughtRate })
  }, [value.boughtPct, value.boughtRate])

  const commit = (next: FxPair) => {
    setDraft(next)
    if (!validateFxPair(next.boughtPct, next.boughtRate)) onChange(next)
  }
  const missingRate = draft.boughtPct > 0 && !(draft.boughtRate > 0)

  return (
    <div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 sm:grid-cols-[auto_minmax(0,110px)_auto_minmax(0,120px)]">
        <span className="text-[12px] text-mut">{pctText}</span>
        <NumberField
          label={pctLabel}
          labelHidden
          unit="%"
          value={draft.boughtPct * 100}
          validate={(v) => (v < 0 || v > 100 ? 'O percentual deve estar entre 0% e 100%.' : null)}
          onCommit={(v) => commit({ boughtPct: v / 100, boughtRate: draft.boughtRate })}
        />
        <span className="text-[12px] text-mut">{rateText}</span>
        <NumberField
          label={rateLabel}
          labelHidden
          unit="R$/US$"
          maxDecimals={4}
          value={draft.boughtRate}
          validate={(v) => (v < 0 || (v === 0 && draft.boughtPct > 0) ? 'O dólar deve ser maior que zero.' : null)}
          onCommit={(v) => commit({ boughtPct: draft.boughtPct, boughtRate: v })}
        />
      </div>
      {missingRate && <p className="mt-1 text-[11.5px] text-acc">{missingText}</p>}
    </div>
  )
}

/** Effective dollar text: 0% = "do dia", 100% = "travado", else the blend. */
export function effectiveFxText(v: FxPair, fx: number): string {
  if (v.boughtPct === 0) return Number.isFinite(fx) && fx > 0 ? `do dia · ${fmtNum(fx, 4)}` : 'do dia · —'
  const eff = effectiveFx(v.boughtPct, v.boughtRate, fx)
  if (v.boughtPct === 1) return `travado · ${fmtNum(eff, 4)}`
  return `dólar efetivo hoje · ${fmtNum(Number.isFinite(eff) ? eff : null, 4)}`
}

/**
 * Dollar of one US$ cost: "já comprado __%" and "a que dólar __", plus the effective dollar of
 * today (0% = "do dia"). `fx` is today's market dollar.
 */
export function FxChip({
  value,
  onChange,
  fx,
  label,
}: {
  value: FxPair & { followDefault?: boolean }
  onChange: (v: FxPair) => void
  fx: number
  /** Name of the cost, used in the accessible names. */
  label: string
}) {
  return (
    <div role="group" aria-label={`Dólar de ${label}`} className="mt-2 rounded-[10px] border border-line bg-surface2 px-2.5 py-2">
      <FxPairFields
        value={value}
        onChange={onChange}
        pctLabel={`Já comprado (${label})`}
        rateLabel={`A que dólar (${label})`}
        pctText="já comprado"
        rateText="a que dólar"
      />
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-mut">
        <span data-testid="fx-effective" className="num font-semibold text-tx">
          {effectiveFxText(value, fx)}
        </span>
        {value.followDefault && <span>· segue o dólar padrão dos seus custos em US$</span>}
      </p>
    </div>
  )
}
