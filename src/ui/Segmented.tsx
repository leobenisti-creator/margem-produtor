import type { KeyboardEvent } from 'react'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  wrap = false,
  size = 'md',
}: {
  value: T
  options: SegmentedOption<T>[]
  onChange: (v: T) => void
  ariaLabel: string
  /** Below sm, lay the options out as a 2-column grid instead of a scrolling row (P1-5). */
  wrap?: boolean
  /** 'sm': the compact version of the top bar (smaller text, tighter buttons). */
  size?: 'md' | 'sm'
}) {
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const dir =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0
    if (!dir) return
    e.preventDefault()
    const nextIndex = (index + dir + options.length) % options.length
    onChange(options[nextIndex].value)
    const radios = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    radios?.[nextIndex]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`shrink-0 border border-line-strong bg-bg p-0.5 ${size === 'sm' ? 'rounded-[8px]' : 'rounded-[9px]'} ${
        wrap ? 'grid grid-cols-2 gap-0.5 sm:inline-flex sm:gap-0' : 'inline-flex'
      }`}
    >
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`whitespace-nowrap border transition-[background-color,color] duration-[120ms] ease-out ${
              size === 'sm'
                ? 'min-h-[36px] min-w-[36px] rounded-[6px] px-2 text-[11px] md:min-h-[26px] md:min-w-0'
                : 'min-h-[44px] min-w-[44px] rounded-[7px] px-2.5 text-xs sm:px-3 md:min-h-[32px] md:min-w-0'
            } ${
              on ? 'border-acc bg-acc font-bold text-accink' : 'border-transparent text-mut hover:text-tx'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
