import { useEffect, useId, useRef, useState } from 'react'
import type { SegmentedOption } from './Segmented'

/**
 * A choice that shows only the current option, as a button; clicking it opens the others. Picking one closes the menu.
 * The options are a radio group, so the choice stays readable by a screen reader and works with the arrow keys.
 */
export function PickButton<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  caption,
  emphasis = false,
}: {
  value: T
  options: SegmentedOption<T>[]
  onChange: (v: T) => void
  /** Name of the choice (the group), e.g. "Eixos da matriz". */
  ariaLabel: string
  /** Small context text before the button, e.g. "Valor em R$ embaixo ↓". */
  caption?: string
  /** The main choice of its area: larger and in the accent colour. */
  emphasis?: boolean
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const id = useId()
  const current = options.find((o) => o.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const away = (e: Event) => {
      if (e.target instanceof Node && box.current?.contains(e.target)) return
      setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      btn.current?.focus()
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  function onKey(e: React.KeyboardEvent<HTMLButtonElement>, i: number) {
    const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const radios = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    radios?.[(i + dir + options.length) % options.length]?.focus()
  }

  return (
    <div ref={box} className="relative flex items-center gap-2">
      {caption && (
        <span aria-hidden className={emphasis ? 'text-xs font-medium text-mut' : 'text-[11px] text-mut'}>
          {caption}
        </span>
      )}
      <button
        ref={btn}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`${ariaLabel}: ${current.label}`}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-[9px] border bg-bg font-semibold text-tx hover:border-acc ${
          emphasis
            ? 'border-g7 px-4 text-[13.5px] md:min-h-[40px]'
            : 'border-line-strong px-3 text-xs md:min-h-[32px]'
        }`}
      >
        <span>{current.label}</span>
        <svg aria-hidden viewBox="0 0 10 6" className={`h-1.5 w-2.5 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          id={id}
          role="radiogroup"
          aria-label={ariaLabel}
          className="absolute right-0 top-full z-20 mt-1 min-w-[8rem] whitespace-nowrap rounded-[10px] border border-line-strong bg-card p-1 shadow-2xl"
        >
          {options.map((o, i) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={o.value === value}
              onKeyDown={(e) => onKey(e, i)}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
                btn.current?.focus()
              }}
              className={`flex min-h-[44px] w-full items-center rounded-[7px] px-3 text-left text-xs md:min-h-[32px] ${
                o.value === value ? 'bg-g7/15 font-bold text-g7' : 'text-tx hover:bg-surface2'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
