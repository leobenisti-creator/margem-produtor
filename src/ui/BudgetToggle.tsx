/**
 * "Realizado | Orçado": a deliberately small, low-key switch. Realizado (already incurred) is the default;
 * Orçado marks a budgeted amount. Informational: it feeds the budgeted/realized share under the cost chart.
 */
export function BudgetToggle({
  budgeted,
  onChange,
  label,
  disabled,
  title,
}: {
  /** null = mixed (a group opened into items: each item has its own). */
  budgeted: boolean | null
  onChange: (next: boolean) => void
  /** Name of the cost, for the accessible name. */
  label: string
  disabled?: boolean
  title?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`Situação de ${label}`}
      title={title}
      className="inline-flex items-center gap-0.5 text-[10.5px]"
    >
      {([false, true] as const).map((b) => {
        const on = b === budgeted
        return (
          <button
            key={String(b)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => !on && onChange(b)}
            className={`min-h-[44px] rounded-[5px] px-1.5 md:min-h-[22px] ${
              on
                ? 'bg-surface2 font-semibold text-tx'
                : 'text-mut hover:text-tx disabled:cursor-not-allowed disabled:hover:text-mut'
            }`}
          >
            {b ? 'Orçado' : 'Realizado'}
          </button>
        )
      })}
    </div>
  )
}
