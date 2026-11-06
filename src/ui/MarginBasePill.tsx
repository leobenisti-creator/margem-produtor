import type { KeyboardEvent } from 'react'
import { useStore } from '../state/StoreProvider'

const OPTIONS = [
  { value: 'receita', label: 'da receita' },
  { value: 'custo', label: 'do custo' },
] as const

/**
 * "Margem sobre a receita | sobre o custo" as a small pill inside the hero tile (R28): it only
 * changes the percentage, so it sits next to the number it affects. Radiogroup with roving tabindex.
 */
export function MarginBasePill() {
  const { state, dispatch } = useStore()
  const value = state.inputs.marginBase
  const set = (v: (typeof OPTIONS)[number]['value']) =>
    dispatch({ type: 'setInput', key: 'marginBase', value: v })

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const next = (index + dir + OPTIONS.length) % OPTIONS.length
    set(OPTIONS[next].value)
    e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
  }

  return (
    <span
      role="radiogroup"
      aria-label="Base da margem"
      // Visually a 32 px pill; below md each option's hit zone is 44 px tall (negative margins keep the line height).
      className="-my-1.5 inline-flex items-center rounded-full border border-line-strong px-0.5 align-middle md:my-0 md:py-0.5"
    >
      {OPTIONS.map((o, i) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => set(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className="group min-h-[44px] rounded-full px-0.5 text-[12px] leading-none md:min-h-[26px] md:px-0"
          >
            <span
              className={`inline-flex min-h-[28px] items-center rounded-full px-2.5 transition-[background-color,color] duration-[120ms] md:min-h-[22px] ${
                on ? 'bg-acc font-semibold text-accink' : 'text-mut group-hover:text-tx'
              }`}
            >
              {o.label}
            </span>
          </button>
        )
      })}
    </span>
  )
}
