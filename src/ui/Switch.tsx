/** Labelled on/off switch (role="switch"); the whole row is the 44px tap target. */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-[44px] w-full items-center gap-3 rounded-[9px] text-left md:min-h-[38px]"
    >
      {/* Off: white track with a 3:1 border and a dark thumb; on: green track with a white thumb. */}
      <span
        aria-hidden="true"
        className={`relative h-6 w-10 shrink-0 rounded-full border transition-[background-color,border-color] duration-150 ease-out ${
          checked ? 'border-acc bg-acc' : 'border-line-strong bg-surface2'
        }`}
      >
        <span
          className={`absolute top-[2px] h-[18px] w-[18px] rounded-full transition-[left,background-color] duration-150 ease-out ${
            checked ? 'left-[18px] bg-accink' : 'left-[2px] bg-line-strong'
          }`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold">{label}</span>
      </span>
    </button>
  )
}
