import { useEffect, useRef, useState } from 'react'
import { parseDecimalPtBr } from '../engine/units'
import { fmtField } from './fmtExtra'

/**
 * Compact numeric input for the product table. Empty text means 0; with `emptyWhenZero` a 0 is
 * shown as an empty field (prices are never pre-filled). Invalid or negative text is flagged and
 * not reported.
 */
export function CellNumber({
  label,
  value,
  onChange,
  unit,
  emptyWhenZero = false,
  maxDecimals = 2,
  disabled = false,
  placeholder,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  unit?: string
  emptyWhenZero?: boolean
  maxDecimals?: number
  disabled?: boolean
  placeholder?: string
}) {
  const show = (v: number) => (emptyWhenZero && v === 0 ? '' : fmtField(v, maxDecimals))
  const [text, setText] = useState(() => show(value))
  const [bad, setBad] = useState(false)
  const focused = useRef(false)
  const last = useRef(value)

  useEffect(() => {
    if (Object.is(last.current, value)) return
    last.current = value
    if (focused.current) {
      const t = text.trim()
      if ((t === '' ? 0 : parseDecimalPtBr(t)) === value) return
    }
    setText(show(value))
    setBad(false)
  }, [value])

  function change(next: string) {
    setText(next)
    const t = next.trim()
    if (t === '') {
      setBad(false)
      last.current = 0
      onChange(0)
      return
    }
    const v = parseDecimalPtBr(t)
    if (v === null || v < 0) {
      setBad(!/^[\d.,]*$/.test(t) || v !== null)
      return
    }
    setBad(false)
    last.current = v
    onChange(v)
  }

  return (
    <span
      className={`flex min-h-[44px] items-center gap-1 rounded-[9px] border bg-surface2 px-2 md:min-h-[38px] ${
        bad ? 'border-danger' : 'border-line-strong focus-within:border-acc'
      }`}
    >
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        aria-invalid={bad || undefined}
        disabled={disabled}
        placeholder={placeholder}
        value={disabled ? '—' : text}
        onFocus={() => {
          focused.current = true
        }}
        onBlur={() => {
          focused.current = false
          if (!bad) setText(show(last.current))
        }}
        onChange={(e) => change(e.target.value)}
        className="num min-h-[44px] w-full min-w-0 bg-transparent text-base font-semibold outline-none placeholder:font-normal placeholder:text-mut disabled:text-mut md:min-h-[36px] md:text-sm"
      />
      {unit && <span className="shrink-0 text-[11px] text-mut">{unit}</span>}
    </span>
  )
}
