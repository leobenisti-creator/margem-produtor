import { useStore } from '../state/StoreProvider'
import { validateInput } from '../state/reducer'
import type { Quote } from '../data/types'
import type { OverrideKey } from '../state/types'
import { CROPS } from '../engine/crops'
import { EditableValue } from './EditableValue'
import { EmptyState } from './EmptyState'
import { fmtBrl, fmtDateBr, fmtNum, fmtUsd } from './format'

function b3Text(q: Quote): string {
  return q.unit.startsWith('US$') ? `${fmtUsd(q.value)}/sc` : `${fmtBrl(q.value)}/sc`
}

/** Short, deduplicated source names, e.g. "Yahoo (não oficial), BCB, B3". */
export function shortSources(quotes: Quote[]): string {
  const names = quotes.map((q) => {
    const part = q.source.includes(':') ? q.source.split(':').slice(1).join(':').trim() : q.source
    const clean = part.replace(/\s*\((?!não oficial)[^)]*\)/g, '').trim()
    const first = clean.split(/\s+/)[0]
    if (/^[A-Z0-9]{2,}$/.test(first)) return first
    // "Yahoo Finance (não oficial)" -> "Yahoo (não oficial)"; "Cepea, soja Paranaguá" -> "Cepea"
    const m = clean.match(/^([^\s,]+)(?:\s+[^\s,(]+)*?\s*(\(não oficial\))?(?:,.*)?$/)
    return m ? [m[1], m[2]].filter(Boolean).join(' ') : clean
  })
  return [...new Set(names)].join(', ')
}

/** A source flagged "a confirmar" (seed basis: digitised weekly point, no reference contract). */
export function isUnconfirmed(q: Quote): boolean {
  return /a confirmar/i.test(q.source)
}

/** Latest closing date among the shown quotes (basis keeps its own date). */
export function latestAsOf(quotes: Quote[]): string {
  return quotes.map((q) => q.asOf).sort().at(-1) ?? ''
}

const positive = (n: number) => Number.isFinite(n) && n > 0

export function Ticker() {
  const { state, dispatch, snapshot, scenario } = useStore()
  const { crop, overrides } = state
  const cbot = snapshot.cbotUsc[crop]
  const fx = snapshot.fx
  const b3 = snapshot.b3[crop]
  const b3Label = crop === 'soja' ? 'B3 SJC' : 'B3 CCM'

  const kindOf = (key: OverrideKey, q: Quote) => (overrides[key] !== undefined ? 'manual' : q.kind)
  const commit = (key: OverrideKey) => (v: number | null) =>
    dispatch({ type: 'override', key, value: v })
  const validator = (key: OverrideKey) => (v: number) => validateInput(key, v)

  // The base is no longer shown here: it comes from the ponto FOB (Sua lavoura).
  const sources = [cbot, fx, b3].map((q) => q.source).join(' · ')
  const shown = [cbot, fx, b3]
  const latest = latestAsOf(shown) || cbot.asOf

  // Below lg: two rows (quotes scroll, caption static). At lg: one row; the quote group scrolls,
  // the caption never shrinks or clips (P1-1).
  return (
    <section
      aria-label={`Cotações de ${CROPS[crop].label}`}
      className="flex flex-wrap items-center gap-x-5 gap-y-1 bg-g9 px-4 py-2 text-xs text-tx md:px-[18px] lg:flex-nowrap"
    >
      <div
        data-testid="ticker-quotes"
        className="scrollbar-none flex min-w-0 basis-full items-center gap-5 overflow-x-auto whitespace-nowrap lg:flex-1 lg:basis-auto"
      >
      <EditableValue
        label="CBOT"
        value={scenario.cbotUsc}
        unit="US¢/bu"
        kind={kindOf('cbotUsc', cbot)}
        format={(n) => fmtNum(n, 2)}
        missing={!positive(scenario.cbotUsc)}
        validate={validator('cbotUsc')}
        onCommit={commit('cbotUsc')}
      />
      <span className="inline-flex items-center gap-1.5">
        <span>{b3Label}</span>
        {Number.isFinite(b3.value) ? (
          <em className="font-semibold not-italic text-tx">{b3Text(b3)}</em>
        ) : (
          <EmptyState inline title="Aguardando" hint="sem cotação" />
        )}
      </span>
      <EditableValue
        label="Dólar PTAX"
        value={scenario.fx}
        kind={kindOf('fx', fx)}
        format={(n) => fmtNum(n, 4)}
        missing={!positive(scenario.fx)}
        validate={validator('fx')}
        onCommit={commit('fx')}
      />
      </div>
      <span
        className="basis-full shrink-0 whitespace-nowrap text-[11px] text-mut lg:ml-auto lg:basis-auto lg:text-xs"
        title={sources}
      >
        Fechamento {fmtDateBr(latest)} · {shortSources(shown)}
      </span>
    </section>
  )
}
