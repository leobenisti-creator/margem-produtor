import type { ReactNode } from 'react'

export function Card({
  n,
  title,
  right,
  children,
  testId,
}: {
  n?: number
  title: string
  right?: ReactNode
  children: ReactNode
  testId?: string
}) {
  return (
    <section data-testid={testId} className="min-w-0 rounded-[14px] border border-line bg-card px-4 py-[15px]">
      <h2 className="mb-2.5 flex flex-wrap items-center gap-2 text-[13.5px] font-bold">
        {n !== undefined && (
          <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-g7 text-[11px] text-accink">
            {n}
          </span>
        )}
        {title}
        {right && <span className="ml-auto text-[11px] font-normal text-mut sm:text-xs">{right}</span>}
      </h2>
      {children}
    </section>
  )
}
