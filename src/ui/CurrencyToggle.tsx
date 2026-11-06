type Currency = 'BRL' | 'USD'

/** Small R$ | US$ switch for one cost (group rows are tight, so it is smaller than `Segmented`). */
export function CurrencyToggle({
  value,
  onChange,
  ariaLabel,
  disabled,
  title,
}: {
  /** null = no single currency (a group opened into items: each item has its own). */
  value: Currency | null
  onChange: (next: Currency) => void
  ariaLabel: string
  /** Disables both options; `title` says why. */
  disabled?: boolean
  title?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      title={title}
      className="inline-flex rounded-[7px] border border-line-strong bg-bg p-px"
    >
      {(['BRL', 'USD'] as const).map((c) => {
        const on = c === value
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={c === 'BRL' ? 'R$' : 'US$'}
            disabled={disabled}
            onClick={() => !on && onChange(c)}
            className={`min-h-[44px] min-w-[36px] rounded-[6px] px-2 text-[11px] md:min-h-[26px] ${
              on ? 'bg-acc font-bold text-accink' : 'text-mut hover:text-tx disabled:cursor-not-allowed'
            }`}
          >
            {c === 'BRL' ? 'R$' : 'US$'}
          </button>
        )
      })}
    </div>
  )
}
