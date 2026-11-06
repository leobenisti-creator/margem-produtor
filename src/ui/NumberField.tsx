import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { parseDecimalPtBr } from '../engine/units'
import { fmtField } from './fmtExtra'

export interface NumberFieldProps {
  label: string
  value: number
  /** Text after the number, or a control (see UnitNumberField). */
  unit?: ReactNode
  onCommit: (v: number) => void
  validate?: (v: number) => string | null
  helper?: ReactNode
  min?: number
  max?: number
  /** Notified whenever the inline error appears or clears. */
  onErrorChange?: (message: string | null) => void
  /** Decimals shown in the field (default 2). */
  maxDecimals?: number
  /** Shows a dash and ignores typing and commits (e.g. USD without a usable dollar). */
  disabled?: boolean
  /** 'change' (default) commits live while typing (R16); 'blur' validates live but commits on blur/Enter only. */
  commitOn?: 'change' | 'blur'
  /** Compact rows: no visible <label>, the input carries the label as aria-label. */
  labelHidden?: boolean
}

/** Text that is not a number yet but could become one by typing more ("", "-", "4,", "R$"). */
const INCOMPLETE = /^\s*-?\s*(r\$?|u(s\$?)?|\$)?\s*-?[\d.,]*\s*$/i

const INVALID_NUMBER = 'Informe um número válido (ex.: 4.200,50).'

/**
 * Free-text number input (pt-BR or plain decimals), never masked.
 * Live: every keystroke whose text parses AND validates is committed at once, so results follow
 * the typing. The typed text is never rewritten while the field is focused; blur/Enter reformats
 * it and commits what is left (empty means 0). Incomplete text ("4,") neither commits nor errors;
 * clearly invalid text or a value rejected by validate shows the inline error and keeps the
 * previous committed value.
 */
export function NumberField({
  label,
  value,
  unit,
  onCommit,
  validate,
  helper,
  min,
  max,
  onErrorChange,
  maxDecimals = 2,
  disabled = false,
  commitOn = 'change',
  labelHidden = false,
}: NumberFieldProps) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(() => fmtField(value, maxDecimals))
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    onErrorChange?.(error)
  }, [error, onErrorChange])
  // The text last committed or synced from props; blur without edits is a no-op (avoids rounding drift).
  const settled = useRef(text)
  // The value the app currently holds for this field (display units): makes commits idempotent.
  const committed = useRef(value)
  // The value held when editing began (focus, or the last successful blur): a rejected final text restores it.
  const baseline = useRef(value)
  const focused = useRef(false)
  // True between a focus that selected the "0" placeholder and the mouseup of that same click.
  const keepSelection = useRef(false)
  // Set while our own live commit is propagating back through the value prop.
  const selfCommit = useRef(false)

  // Re-sync only when the value actually changes. Running on mount would overwrite text the user
  // typed before the first passive effects flushed (it also marked that edit as already settled).
  const lastValue = useRef(value)
  useEffect(() => {
    if (Object.is(lastValue.current, value)) return
    lastValue.current = value
    if (selfCommit.current) return // echo of our own keystroke: keep the typed text and committed value
    committed.current = value
    if (!focused.current) baseline.current = value
    if (focused.current) {
      // Another source changed the value mid-edit: only replace text that disagrees with it.
      const typed = parseDecimalPtBr(text)
      if (typed === null || typed === value) return
    }
    const next = fmtField(value, maxDecimals)
    setText(next)
    settled.current = next
    setError(null)
  }, [value])
  // Runs after every render, so the echo flag lives only for the render our commit causes.
  useEffect(() => {
    selfCommit.current = false
  })

  /** Error message for a parsed number, or null when it is acceptable. */
  function problem(parsed: number): string | null {
    const rangeError =
      min !== undefined && parsed < min
        ? `O valor mínimo é ${fmtField(min)}.`
        : max !== undefined && parsed > max
          ? `O valor máximo é ${fmtField(max)}.`
          : null
    return validate?.(parsed) ?? rangeError
  }

  function push(parsed: number) {
    if (Object.is(committed.current, parsed)) return
    committed.current = parsed
    selfCommit.current = true
    onCommit(parsed)
  }

  function handleChange(next: string) {
    setText(next)
    if (disabled) return
    const trimmed = next.trim()
    const parsed = trimmed === '' ? null : parseDecimalPtBr(trimmed)
    if (trimmed === '') {
      setError(null) // cleared on purpose: mid-edit, nothing to report (blur commits 0)
      return
    }
    if (parsed === null) {
      // Mid-edit: stay quiet (and keep any error already shown) unless it can never become a number.
      if (!INCOMPLETE.test(next)) setError(INVALID_NUMBER)
      return
    }
    const message = problem(parsed)
    setError(message)
    if (!message && commitOn === 'change') push(parsed)
  }

  function commit() {
    if (disabled || text === settled.current) return
    settled.current = text
    const trimmed = text.trim()
    const parsed = trimmed === '' ? 0 : parseDecimalPtBr(trimmed)
    if (parsed === null) {
      setError(INVALID_NUMBER)
      push(baseline.current) // rejected: results go back to the pre-edit value, text and error stay
      return
    }
    const message = problem(parsed)
    if (message) {
      setError(message)
      push(baseline.current)
      return
    }
    setError(null)
    const canonical = fmtField(parsed, maxDecimals)
    setText(canonical)
    settled.current = canonical
    push(parsed)
    baseline.current = parsed
  }

  const errId = `${id}-err`
  return (
    <div>
      {!labelHidden && (
        <label htmlFor={id} className="mb-0.5 block text-xs font-medium text-mut">
          {label}
        </label>
      )}
      <div
        onClick={() => inputRef.current?.focus()}
        className={`flex min-h-[44px] items-center justify-between gap-2 rounded-[9px] border bg-surface2 px-2.5 transition-[border-color,box-shadow] duration-150 ease-out md:min-h-[38px] ${
          error
            ? 'border-danger shadow-[inset_0_0_0_1px_var(--danger)]'
            : 'border-line-strong focus-within:border-acc focus-within:shadow-[inset_0_0_0_1px_var(--acc),0_0_0_3px_rgba(232,176,74,0.22)]'
        }`}
      >
        <input
          id={id}
          ref={inputRef}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={labelHidden ? label : undefined}
          value={disabled ? '—' : text}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={(e) => {
            focused.current = true
            baseline.current = committed.current
            // An empty "0" field is a placeholder: select it so the first keystroke replaces it
            // (otherwise typing 150 shows 0150). The mouseup that follows a click must not undo this.
            if (committed.current === 0) {
              keepSelection.current = true
              e.currentTarget.select()
            }
          }}
          onMouseUp={(e) => {
            if (keepSelection.current) e.preventDefault()
            keepSelection.current = false
          }}
          onBlur={() => {
            focused.current = false
            keepSelection.current = false
            commit()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
          }}
          className="num min-h-[44px] min-w-0 flex-1 bg-transparent text-base md:min-h-[38px] font-semibold outline-none disabled:cursor-not-allowed disabled:text-mut md:text-sm"
        />
        {unit && <span className="shrink-0 text-xs text-mut">{unit}</span>}
      </div>
      {error && (
        <p id={errId} role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
      {helper && <div className="text-pretty mt-1 text-[11.5px] leading-[1.45] text-mut">{helper}</div>}
    </div>
  )
}
