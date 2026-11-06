import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { bottomInset, findAnchor, firstFocusable, scrollTargetIntoView } from './dom'
import { balloonWidth, placeBalloon, sameBox, toBox, type Box } from './position'
import { BALLOON_STEPS } from './steps'
import { btn, primary, secondary } from './styles'
import { Dots } from './Welcome'

/** How long a missing target is waited for (content still rendering) before its step is skipped. */
export const MISSING_GRACE_MS = 400
const PAD = 4
const DEFAULT_H = 190

interface Geo {
  target: Box | null
  h: number
  vw: number
  vh: number
  inset: number
  /** Indices of the steps whose target is on the page right now. */
  present: number[]
}

const sameGeo = (a: Geo, b: Geo) =>
  sameBox(a.target, b.target) &&
  a.h === b.h &&
  a.vw === b.vw &&
  a.vh === b.vh &&
  a.inset === b.inset &&
  a.present.length === b.present.length &&
  a.present.every((v, i) => v === b.present[i])

const EMPTY: Geo = { target: null, h: 0, vw: 0, vh: 0, inset: 0, present: [] }

/**
 * Non-modal balloons anchored to the real fields. The target stays fully usable (the highlight and the dim backdrop
 * ignore the pointer). Steps whose target is missing are skipped. `onIndex` lets the parent remember where the visitor was.
 */
export function Balloons({
  startIndex,
  onIndex,
  onFinish,
}: {
  startIndex: number
  onIndex: (i: number) => void
  onFinish: () => void
}) {
  const [idx, setIdx] = useState(Math.min(Math.max(startIndex, 0), BALLOON_STEPS.length - 1))
  const [geo, setGeo] = useState<Geo>(EMPTY)
  const balloonRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const dir = useRef<1 | -1>(1)
  const step = BALLOON_STEPS[idx]
  const uid = useId()
  const titleId = `${uid}-t`
  const bodyId = `${uid}-b`

  const measure = useCallback(() => {
    const el = findAnchor(BALLOON_STEPS[idx].anchor)
    const present = BALLOON_STEPS.map((s, i) => (findAnchor(s.anchor) ? i : -1)).filter((i) => i >= 0)
    const next: Geo = {
      target: el ? toBox(el.getBoundingClientRect()) : null,
      h: balloonRef.current?.offsetHeight ?? 0,
      vw: window.innerWidth,
      vh: window.innerHeight,
      inset: bottomInset(),
      present,
    }
    setGeo((prev) => (sameGeo(prev, next) ? prev : next))
  }, [idx])

  // Measure after every render (the balloon's own height changes with its text), then watch the page.
  useLayoutEffect(measure)
  useEffect(() => {
    onIndex(idx)
  }, [idx, onIndex])

  useEffect(() => {
    let raf = 0
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    const mo = typeof MutationObserver === 'function' ? new MutationObserver(schedule) : null
    mo?.observe(document.body, { childList: true, subtree: true })
    const target = findAnchor(step.anchor)
    const ro = typeof ResizeObserver === 'function' && target ? new ResizeObserver(schedule) : null
    if (ro && target) ro.observe(target)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
      mo?.disconnect()
      ro?.disconnect()
    }
  }, [measure, step.anchor])

  const hasTarget = geo.target !== null

  // Skip a step whose target does not come back within the grace period.
  useEffect(() => {
    if (hasTarget) return
    const t = window.setTimeout(() => {
      if (findAnchor(BALLOON_STEPS[idx].anchor)) return measure()
      let n = idx + dir.current
      while (n >= 0 && n < BALLOON_STEPS.length && !findAnchor(BALLOON_STEPS[n].anchor)) n += dir.current
      if (n < 0) {
        // Nothing before: continue forward instead.
        dir.current = 1
        n = idx + 1
        while (n < BALLOON_STEPS.length && !findAnchor(BALLOON_STEPS[n].anchor)) n++
      }
      if (n >= BALLOON_STEPS.length) onFinish()
      else setIdx(n)
    }, MISSING_GRACE_MS)
    return () => window.clearTimeout(t)
  }, [hasTarget, idx, measure, onFinish])

  // A step opens: bring its target into view and move focus to the balloon's main button.
  useEffect(() => {
    if (!hasTarget) return
    const el = findAnchor(BALLOON_STEPS[idx].anchor)
    if (el) scrollTargetIntoView(el)
    primaryRef.current?.focus({ preventScroll: true })
    // Only when the step (or its target appearing) changes, never on every re-measure.
  }, [idx, hasTarget])

  const pos = geo.present.indexOf(idx)
  const prevIdx = [...geo.present].reverse().find((i) => i < idx)
  const nextIdx = geo.present.find((i) => i > idx)
  const go = (to: number | undefined, d: 1 | -1) => {
    dir.current = d
    if (to === undefined) onFinish()
    else setIdx(to)
  }

  // Escape skips; Tab flows balloon -> field (and back) even though the balloon sits at the end of the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return
        e.preventDefault()
        onFinish()
        return
      }
      if (e.key !== 'Tab') return
      const box = balloonRef.current
      const target = findAnchor(BALLOON_STEPS[idx].anchor)
      if (!box || !target) return
      const active = document.activeElement
      const items = Array.from(box.querySelectorAll<HTMLElement>('button:not([disabled])'))
      const field = firstFocusable(target)
      if (!e.shiftKey && active === items[items.length - 1] && field) {
        e.preventDefault()
        field.focus()
      } else if (e.shiftKey && field && active === field && items.length) {
        e.preventDefault()
        items[items.length - 1].focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [idx, onFinish])

  // Leaving the tour while focus sits in the balloon would drop it on <body>: hand it to <main>.
  useEffect(() => {
    const box = balloonRef.current
    return () => {
      const a = document.activeElement
      if (a === document.body || (box && box.contains(a))) {
        const main = document.querySelector<HTMLElement>('main')
        main?.focus({ preventScroll: true })
      }
    }
  }, [])

  const w = balloonWidth(geo.vw || window.innerWidth)
  const placement = geo.target
    ? placeBalloon({
        target: geo.target,
        balloon: { w, h: geo.h || DEFAULT_H },
        viewport: { w: geo.vw, h: geo.vh },
        bottomInset: geo.inset,
      })
    : null
  const total = geo.present.length
  const last = nextIdx === undefined
  const announce = geo.target ? `Passo ${pos + 1} de ${total}: ${step.title}` : ''

  return (
    <>
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
      {geo.target && placement && (
        <>
          <div
            aria-hidden="true"
            data-testid="tour-highlight"
            className="pointer-events-none fixed z-40 rounded-[12px] outline outline-2 outline-g7"
            style={{
              top: geo.target.top - PAD,
              left: geo.target.left - PAD,
              width: geo.target.width + PAD * 2,
              height: geo.target.height + PAD * 2,
              boxShadow: '0 0 0 100vmax color-mix(in srgb, black 40%, transparent)',
            }}
          />
          <div
            ref={balloonRef}
            role="dialog"
            aria-modal="false"
            aria-labelledby={titleId}
            aria-describedby={bodyId}
            data-testid="tour-balloon"
            data-side={placement.side}
            className="fixed z-50 rounded-xl border border-line-strong bg-bg p-3 shadow-xl"
            style={{ top: placement.top, left: placement.left, width: w }}
          >
            {placement.side !== 'over' && (
              <span
                aria-hidden="true"
                className={`absolute block h-3 w-3 rotate-45 border-line-strong bg-bg ${
                  placement.side === 'below' ? '-top-1.5 border-l border-t' : '-bottom-1.5 border-b border-r'
                }`}
                style={{ left: placement.arrowLeft - 6 }}
              />
            )}
            <div className="mb-1.5 flex items-center gap-2 text-xs text-mut">
              <Dots count={total} index={Math.max(pos, 0)} />
              <span>
                Passo {pos + 1} de {total}
              </span>
            </div>
            <h2 id={titleId} className="text-[15px] font-bold">
              {step.title}
            </h2>
            <p id={bodyId} className="mt-1 text-pretty text-sm text-mut">
              {step.body}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={onFinish} className={secondary}>
                Pular tour
              </button>
              <span className="flex gap-2">
                {prevIdx !== undefined && (
                  <button type="button" onClick={() => go(prevIdx, -1)} className={secondary}>
                    Voltar
                  </button>
                )}
                <button
                  ref={primaryRef}
                  type="button"
                  onClick={() => go(nextIdx, 1)}
                  className={`${btn} ${primary}`}
                >
                  {last ? 'Concluir' : 'Próximo'}
                </button>
              </span>
            </div>
          </div>
        </>
      )}
    </>
  )
}
