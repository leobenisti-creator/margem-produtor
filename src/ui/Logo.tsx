/**
 * Provisional Hedgepoint mark (spec §4): a gold rotated-square outline plus the word in wide-tracked
 * bold. No image file; swapped for the official artwork later.
 */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Hedgepoint"
      className={`inline-flex shrink-0 items-center gap-2 text-[13px] font-extrabold tracking-[0.18em] text-tx ${className}`}
    >
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
        <rect
          x="4"
          y="4"
          width="10"
          height="10"
          rx="2"
          fill="none"
          stroke="var(--gold)"
          strokeWidth="2"
          transform="rotate(45 9 9)"
        />
      </svg>
      <span aria-hidden="true">HEDGEPOINT</span>
    </span>
  )
}
