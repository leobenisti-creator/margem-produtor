import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NumberField, type NumberFieldProps } from './NumberField'

export interface UnitOption {
  id: string
  label: string
}

/**
 * The clickable unit: the current unit label opens the other option(s); picking one calls `onPick`.
 * `canPick` greys out an option that cannot be used right now (e.g. no yield to divide by).
 */
export function UnitPicker({
  units,
  unit,
  title,
  disabled,
  canPick = () => true,
  onPick,
}: {
  units: UnitOption[]
  unit: string
  /** Hover text, e.g. the name of the field the unit belongs to. */
  title?: string
  disabled?: boolean
  canPick?: (id: string) => boolean
  onPick: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  const current = units.find((u) => u.id === unit) ?? units[0]
  const others = units.filter((u) => u.id !== current.id)

  useEffect(() => {
    if (!open) return
    const away = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <span ref={box} className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Trocar unidade (${current.label})`}
        title={title}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-[44px] items-center gap-0.5 rounded-[6px] px-1 text-xs text-acc md:min-h-[32px] hover:bg-surface hover:underline disabled:cursor-not-allowed disabled:text-mut"
      >
        {current.label}
        <ChevronDown aria-hidden="true" size={12} strokeWidth={1.75} />
      </button>
      {open && (
        <span
          role="menu"
          aria-label="Outras unidades"
          className="absolute right-0 top-full z-20 mt-1 grid min-w-full gap-0.5 rounded-[9px] border border-line-strong bg-card p-1 shadow-lg"
        >
          {others.map((u) => {
            const ok = canPick(u.id)
            return (
              <button
                key={u.id}
                type="button"
                role="menuitem"
                aria-label={`Mudar para ${u.label}`}
                disabled={!ok}
                title={ok ? undefined : 'Sem dados para converter agora.'}
                onClick={() => {
                  setOpen(false)
                  onPick(u.id)
                }}
                className="min-h-[44px] whitespace-nowrap rounded-[6px] px-2 text-left md:min-h-[36px] text-xs font-semibold text-tx hover:bg-surface2 disabled:cursor-not-allowed disabled:text-mut"
              >
                {u.label}
              </button>
            )
          })}
        </span>
      )}
    </span>
  )
}

export interface UnitNumberFieldProps extends Omit<NumberFieldProps, 'unit'> {
  units: UnitOption[]
  /** Id of the unit `value` is expressed in. */
  unit: string
  /** The same quantity in another unit; null when it cannot be converted right now (no dollar, no yield...). */
  convert: (value: number, from: string, to: string) => number | null
  /**
   * The user picked another unit. `converted` is the current value in the new unit (null if it cannot be
   * converted): the owner stores the new unit AND this number, so the amount never changes, only its unit.
   */
  onUnitChange: (next: string, converted: number | null) => void
}

/**
 * A NumberField whose unit is clickable: the unit label opens the other option(s), and choosing one
 * converts the number already typed (it never just swaps the label).
 */
export function UnitNumberField({ units, unit, convert, onUnitChange, value, disabled, ...field }: UnitNumberFieldProps) {
  const current = units.find((u) => u.id === unit) ?? units[0]
  const picker = (
    <UnitPicker
      units={units}
      unit={current.id}
      title={`${field.label}: trocar a unidade`}
      disabled={disabled}
      canPick={(id) => convert(value, current.id, id) !== null}
      onPick={(id) => onUnitChange(id, convert(value, current.id, id))}
    />
  )
  return <NumberField {...field} value={value} disabled={disabled} unit={picker} />
}
