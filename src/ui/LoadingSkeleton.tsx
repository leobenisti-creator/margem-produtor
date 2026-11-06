/** Grey placeholder of the KPI row and three cards while the quotes load (spec §9, P3-6). Reduced motion stops the pulse globally. */
export function LoadingSkeleton() {
  const block = 'rounded-[14px] border border-line bg-card'
  return (
    <div role="status" aria-label="Carregando" className="grid animate-pulse gap-3.5 p-4 md:px-[18px]">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 lg:gap-3">
        <div data-skeleton className="col-span-2 h-[100px] rounded-[14px] bg-surface2 sm:col-span-3 lg:col-span-1" />
        <div data-skeleton className={`${block} col-span-2 h-[100px] sm:col-span-1`} />
        <div data-skeleton className={`${block} h-[100px]`} />
        <div data-skeleton className={`${block} h-[100px]`} />
      </div>
      <div className="grid items-start gap-3.5 lg:grid-cols-[1.55fr_1fr]">
        <div className="grid gap-3.5">
          <div data-skeleton className={`${block} h-[146px]`} />
          <div data-skeleton className={`${block} h-[265px]`} />
          <div data-skeleton className={`${block} h-[200px]`} />
        </div>
        <div data-skeleton className={`${block} hidden h-[460px] lg:block`} />
      </div>
      <span className="sr-only">Carregando as cotações…</span>
    </div>
  )
}
