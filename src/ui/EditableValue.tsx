import { Pencil } from 'lucide-react'
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { DataKind } from '../data/types'
import { parseDecimalPtBr } from '../engine/units'
import { EmptyState } from './EmptyState'

export function EditableValue({
  label,
  value,
  unit,
  kind,
  onCommit,
  validate,
  format = (n) => String(n).replace('.', ','),
  note,
  missing = false,
}: {
  label: string
  value: number
  unit?: string
  kind: DataKind
  /** `null` means "restaurar" (drop the manual value). */
  onCommit: (v: number | null) => void
  validate?: (v: number) => string | null
  format?: (v: number) => string
  /** Small inline note, e.g. "base de 21/10". */
  note?: string
  /** No usable quote: show "Aguardando" instead of the number; the pencil stays usable. */
  missing?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const errId = useId()
  const pencil = useRef<HTMLButtonElement>(null)
  const manual = kind === 'manual'

  function open() {
    setText(missing || !Number.isFinite(value) ? '' : String(value).replace('.', ','))
    setError(null)
    setEditing(true)
  }

  function close() {
    setEditing(false)
    setError(null)
    pencil.current?.focus()
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const n = parseDecimalPtBr(text)
    if (n === null) {
      setError('Informe um número válido.')
      return
    }
    const msg = validate?.(n) ?? null
    if (msg) {
      setError(msg)
      return
    }
    onCommit(n)
    close()
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <span>{label}</span>
      {missing ? (
        <EmptyState inline title="Aguardando" hint="digite o valor no lápis" />
      ) : (
        <>
          <em className="font-semibold not-italic text-tx">{format(value)}</em>
          {unit ? <span className="text-mut">{unit}</span> : null}
          {note ? <span className="text-mut">{note}</span> : null}
        </>
      )}
      {manual ? (
        <span className="rounded-full bg-mint/20 px-1.5 text-[11px] text-mint">manual</span>
      ) : null}
      <button
        ref={pencil}
        type="button"
        aria-label={`Editar ${label}`}
        aria-expanded={editing}
        onClick={() => (editing ? close() : open())}
        className="grid min-h-[44px] min-w-[44px] place-items-center rounded text-mut hover:text-tx md:h-6 md:min-h-0 md:w-6 md:min-w-0"
      >
          <Pencil aria-hidden="true" size={14} strokeWidth={1.75} />
      </button>
      {editing ? (
        <form onSubmit={submit} onKeyDown={onKeyDown} className="inline-flex shrink-0 items-center gap-1.5">
          <input
            autoFocus
            type="text"
            inputMode="decimal"
            aria-label={`${label} (novo valor)`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errId : undefined}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-[44px] w-24 rounded border border-line bg-card px-2 py-1 text-base text-tx md:min-h-0 md:text-xs"
          />
          <button type="submit" className="min-h-[44px] min-w-[44px] rounded bg-mint px-2 py-1 text-xs font-semibold text-accink md:min-h-0 md:min-w-0">
            Aplicar
          </button>
          {manual ? (
            <button
              type="button"
              onClick={() => {
                onCommit(null)
                close()
              }}
              className="min-h-[44px] min-w-[44px] rounded border border-line-strong px-2 py-1 text-xs text-tx md:min-h-0 md:min-w-0"
            >
              restaurar
            </button>
          ) : null}
          {error ? (
            <span id={errId} role="alert" className="text-xs text-danger">
              {error}
            </span>
          ) : null}
        </form>
      ) : null}
    </span>
  )
}
