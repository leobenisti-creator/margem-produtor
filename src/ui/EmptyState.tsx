export interface EmptyStateAction {
  label: string
  onClick: () => void
}

/**
 * Placeholder for missing data or a failed load. `inline` renders a single
 * "title — hint" run of text that fits inside the ticker.
 */
export function EmptyState({
  title,
  hint,
  action,
  inline = false,
}: {
  title: string
  hint: string
  action?: EmptyStateAction
  inline?: boolean
}) {
  if (inline) {
    return (
      <span className="text-acc">
        {title} — {hint}
      </span>
    )
  }
  return (
    <div className="mx-auto my-10 grid max-w-sm gap-2 rounded-[14px] border border-line bg-card p-5 text-center">
      <p className="text-[15px] font-bold">{title}</p>
      <p className="text-sm text-mut">{hint}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mx-auto min-h-[44px] rounded-[9px] border border-g7 bg-g7 px-4 text-sm font-semibold text-accink hover:bg-mint"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
