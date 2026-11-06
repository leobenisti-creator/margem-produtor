import { useEffect, useState } from 'react'

export interface RailSection {
  id: string
  title: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Moves focus to the heading that labels a section (headings carry tabIndex -1), without jumping the scroll. */
function focusSectionHeading(id: string) {
  const labelledBy = document.getElementById(id)?.getAttribute('aria-labelledby')
  const heading = labelledBy ? document.getElementById(labelledBy) : null
  heading?.focus({ preventScroll: true })
}

/**
 * Index of the section crossing the middle of the viewport, and whether the first section (capa)
 * has left the view. Without IntersectionObserver: the first section, capa in view.
 */
export function useActiveSection(
  ids: readonly string[],
  edgeId: string = ids[0] ?? '',
): { active: number; pastFirst: boolean } {
  const [active, setActive] = useState(0)
  const [pastFirst, setPastFirst] = useState(false)
  const key = ids.join('|')
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const list = key.split('|')
    const els = list.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => e !== null)
    const mid = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const i = list.indexOf((e.target as HTMLElement).id)
          if (i >= 0) setActive(i)
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    for (const el of els) mid.observe(el)
    const first = els.find((e) => e.id === edgeId) ?? els[0]
    const edge = new IntersectionObserver((entries) => {
      for (const e of entries) setPastFirst(!e.isIntersecting)
    })
    if (first) edge.observe(first)
    return () => {
      mid.disconnect()
      edge.disconnect()
    }
  }, [key, edgeId])
  return { active, pastFirst }
}

/** Fixed dots at the right with the `01/07` counter; each dot scrolls to its screen. */
export function ScrollRail({
  sections,
  active,
  onGo,
}: {
  sections: readonly RailSection[]
  active: number
  onGo: (index: number) => void
}) {
  return (
    <nav
      aria-label="Telas do Início"
      className="fixed right-3 top-1/2 z-30 hidden -translate-y-1/2 flex-col items-center gap-1 rounded-full border border-line bg-card px-0.5 py-2 md:flex"
    >
      <span className="num relative mb-1 text-[11px] font-semibold text-tx">
        {pad(active + 1)}/{pad(sections.length)}
      </span>
      {sections.map((s, i) => {
        const on = i === active
        return (
          <button
            key={s.id}
            type="button"
            aria-label={`Ir para tela ${i + 1}: ${s.title}`}
            aria-current={on ? 'step' : undefined}
            onClick={() => {
              onGo(i)
              focusSectionHeading(s.id)
            }}
            data-label={s.title}
            className="group relative flex h-6 w-6 items-center justify-center rounded-full after:pointer-events-none after:absolute after:right-full after:mr-3 after:whitespace-nowrap after:rounded-full after:border after:border-line after:bg-card after:px-2.5 after:py-1 after:text-[11px] after:text-tx after:opacity-0 after:transition-opacity after:duration-200 after:content-[attr(data-label)] hover:after:opacity-100 focus-visible:after:opacity-100"
          >
            <span
              aria-hidden="true"
              className={
                on
                  ? 'relative block h-3.5 w-1.5 rounded-full bg-acc'
                  : 'relative block h-1.5 w-1.5 rounded-full bg-line-strong transition-colors group-hover:bg-gold'
              }
            />
          </button>
        )
      })}
    </nav>
  )
}
