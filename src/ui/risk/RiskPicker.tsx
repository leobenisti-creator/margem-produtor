import { useRef, type KeyboardEvent } from 'react'
import { RISK_DRIVERS, type RiskDriver } from '../../engine/riskSim'
import { fmtNum } from '../format'
import { NAME, type RiskFmt } from './riskText'

export interface PickerCard {
  driver: RiskDriver
  /** Margin change (R$, whole crop, with the producer's fixings) for the card's move; null when not computable. */
  delta: number | null
  /** The size of the move in words: "1% (R$ 0,05)", "1% (12 US¢)", "R$ 1,00/sc". */
  move: string
}

/** The three comparable cards, a radio group: the selected one shows its detail below. */
export function RiskPicker({
  cards,
  selected,
  onSelect,
  fmt,
}: {
  cards: PickerCard[]
  selected: RiskDriver
  onSelect: (d: RiskDriver) => void
  fmt: RiskFmt
}) {
  const refs = useRef<Partial<Record<RiskDriver, HTMLButtonElement | null>>>({})
  function onKey(e: KeyboardEvent, i: number) {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const next = RISK_DRIVERS[(i + dir + RISK_DRIVERS.length) % RISK_DRIVERS.length]
    onSelect(next)
    refs.current[next]?.focus()
  }
  return (
    <div role="group" aria-label="Escolha o que simular" className="grid gap-2 sm:grid-cols-3">
      {cards.map((c, i) => {
        const on = c.driver === selected
        return (
          <button
            key={c.driver}
            ref={(el) => {
              refs.current[c.driver] = el
            }}
            type="button"
            aria-pressed={on}
            tabIndex={on ? 0 : -1}
            data-testid={`risk-card-${c.driver}`}
            onClick={() => onSelect(c.driver)}
            onKeyDown={(e) => onKey(e, i)}
            className={`flex min-h-[84px] flex-col gap-1 rounded-[14px] border p-3 text-left ${
              on ? 'border-gold bg-surface2' : 'border-line bg-card'
            }`}
          >
            <span className="text-sm font-bold">{NAME[c.driver]}</span>
            <span
              data-testid={`risk-card-valor-${c.driver}`}
              className={`num text-[15px] font-bold ${c.delta === null ? 'text-mut' : c.delta < 0 ? 'text-bar-neg' : 'text-bar-pos'}`}
            >
              {c.delta === null ? '—' : fmt.signedCompact(c.delta)}
            </span>
            <span className="text-[11px] leading-tight text-mut">se cair {c.move}</span>
          </button>
        )
      })}
    </div>
  )
}

/** The size of each card's move in words (the dollar's 1% is R$ 0,05 at R$ 5,50; the CBOT's, 12 US¢ at 1.241). */
export function cardMoveText(d: RiskDriver, base: { fx: number; cbotUsc: number }): string {
  if (d === 'dolar') return `1% (R$ ${fmtNum(base.fx * 0.01, 2)})`
  if (d === 'cbot') return `1% (${fmtNum(base.cbotUsc * 0.01, 0)} US¢)`
  return 'R$ 1,00/sc'
}
