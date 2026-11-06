import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Matrix, MatrixView, Tone } from '../engine/matrix'
import { fmtNum } from './format'
import {
  cellAriaLabel,
  cellTexts,
  fmtAxisPct,
  fmtFx,
  sameAxisValue,
  toneSituation,
  type Currency,
} from './matrixFormat'

/**
 * Traffic light, same classes with or without a target: 0 red, 1 amber, 2 green (engine/matrix toneFor);
 * an unknown margin (null) is a neutral grey cell.
 */
const TONE_BG = ['bg-tone0', 'bg-tone1', 'bg-tone2'] as const
export const toneClass = (tone: Tone) => (tone === null ? 'bg-tonena' : TONE_BG[tone])

/** Fades the right edge while there is more to scroll; re-evaluated on scroll, resize and whenever `key` (the grid) changes. */
function useScrollFade(ref: React.RefObject<HTMLDivElement | null>, key: unknown): boolean {
  const [more, setMore] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 2)
    update()
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null
    ro?.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      ro?.disconnect()
    }
  }, [ref, key])
  return more
}

const N = 9

/**
 * Frontier of the target: for each cell, the right/bottom edges where the neighbour falls on the
 * other side of "meets the target" (tone 2). Empty without a target.
 */
function frontier(m: Matrix, target: number | null): string[][] {
  return m.cells.map((row, r) =>
    row.map((cell, c) => {
      // An unknown margin is on neither side: no edge touches it.
      if (target === null || cell.tone === null) return ''
      const ok = cell.tone === 2
      const edges: string[] = []
      const differs = (n: Tone) => n !== null && ok !== (n === 2)
      if (c < row.length - 1 && differs(row[c + 1].tone)) edges.push('right')
      if (r < m.cells.length - 1 && differs(m.cells[r + 1][c].tone)) edges.push('bottom')
      return edges.join(' ')
    }),
  )
}

export function MatrixTable({
  matrix,
  view,
  currency,
  active,
  caption,
  onPick,
  target = null,
  nearest = null,
}: {
  matrix: Matrix
  view: MatrixView
  currency: Currency
  /** The scenario currently applied; its cell (when on the grid) is outlined. */
  active: { cbotUsc: number; fx: number }
  caption: string
  onPick: (cbotUsc: number, fx: number) => void
  /** Client's target: draws the white frontier between cells that meet it and cells that don't. */
  target?: number | null
  /** Green cell closest to today (engine/targetAnalysis): dashed outline. */
  nearest?: { row: number; col: number } | null
}) {
  const { row: todayRow, col: todayCol } = matrix.current
  const scroller = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const more = useScrollFade(scroller, matrix)
  const edges = frontier(matrix, target)

  // Roving tabindex: one tab stop in the grid; it starts on the active cell (else today's).
  let activeRow = -1
  let activeCol = -1
  matrix.cells.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (sameAxisValue(cell.cbotUsc, active.cbotUsc) && sameAxisValue(cell.fx, active.fx)) {
        activeRow = r
        activeCol = c
      }
    }),
  )
  const [focusPos, setFocusPos] = useState<{ r: number; c: number } | null>(null)
  const stop = focusPos ?? (activeRow >= 0 ? { r: activeRow, c: activeCol } : { r: todayRow, c: todayCol })

  function move(e: KeyboardEvent<HTMLButtonElement>, r: number, c: number) {
    let nr = r
    let nc = c
    switch (e.key) {
      case 'ArrowRight':
        nc = Math.min(N - 1, c + 1)
        break
      case 'ArrowLeft':
        nc = Math.max(0, c - 1)
        break
      case 'ArrowDown':
        nr = Math.min(N - 1, r + 1)
        break
      case 'ArrowUp':
        nr = Math.max(0, r - 1)
        break
      case 'Home':
        nc = 0
        if (e.ctrlKey) nr = 0
        break
      case 'End':
        nc = N - 1
        if (e.ctrlKey) nr = N - 1
        break
      default:
        return
    }
    e.preventDefault()
    setFocusPos({ r: nr, c: nc })
    tableRef.current?.querySelector<HTMLButtonElement>(`[data-r="${nr}"][data-c="${nc}"]`)?.focus()
  }

  const head = 'sticky left-0 z-[1] bg-card p-1 text-left text-[12px] font-semibold text-tx'
  const todayHead = 'text-g7'
  return (
    <div>
      <div
        ref={scroller}
        data-testid="matrix-scroll"
        className="-mx-1 overflow-x-auto px-1 pb-1"
        style={more ? { maskImage: 'linear-gradient(to right, #000 calc(100% - 24px), transparent)' } : undefined}
      >
        <table ref={tableRef} className="num w-full min-w-[640px] border-separate border-spacing-0.5 text-center text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th scope="col" className={`${head} whitespace-nowrap text-[11px] leading-tight`}>
                <span className="block">CBOT (US¢/bu) ↓</span>
                <span className="block">Dólar (R$/US$) →</span>
              </th>
              {matrix.fxCols.map((fx, c) => {
                const today = c === todayCol
                return (
                  <th
                    key={c}
                    scope="col"
                    data-today={today ? 'true' : undefined}
                    className={`p-1 align-bottom text-[12px] font-semibold leading-tight ${today ? `${todayHead} rounded-t-md bg-g7/10` : 'text-tx'}`}
                  >
                    <span className="block">{fmtFx(fx)}</span>
                    <small className={`block text-[11px] font-medium ${today ? '' : 'text-mut'}`}>
                      {today ? '● hoje' : fmtAxisPct(matrix.fxPct[c])}
                    </small>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {matrix.cells.map((row, r) => {
              const todayR = r === todayRow
              return (
                <tr key={r}>
                  <th
                    scope="row"
                    data-today={todayR ? 'true' : undefined}
                    className={`${head} whitespace-nowrap pr-2 leading-tight ${todayR ? `${todayHead} bg-g7/10` : ''}`}
                  >
                    <span className="block">{fmtNum(matrix.cbotRows[r], 2)}</span>
                    <small className={`block text-[11px] font-medium ${todayR ? '' : 'text-mut'}`}>
                      {todayR ? '● hoje' : fmtAxisPct(matrix.cbotPct[r])}
                    </small>
                  </th>
                  {row.map((cell, c) => {
                    const isActive = r === activeRow && c === activeCol
                    const isNear = nearest !== null && nearest.row === r && nearest.col === c
                    const edge = edges[r][c]
                    const t = cellTexts(cell, view, currency)
                    return (
                      <td key={c} className="relative p-0">
                        <button
                          type="button"
                          data-r={r}
                          data-c={c}
                          tabIndex={stop.r === r && stop.c === c ? 0 : -1}
                          aria-label={cellAriaLabel(cell, currency, view, {
                            cbotPct: matrix.cbotPct[r],
                            fxPct: matrix.fxPct[c],
                            situation:
                              toneSituation(cell.tone, target) +
                              (isNear ? ', cenário mais próximo de hoje que bate a meta' : ''),
                          })}
                          aria-current={isActive ? 'true' : undefined}
                          data-active={isActive ? 'true' : 'false'}
                          data-tone={cell.tone ?? 'na'}
                          data-frontier={edge || undefined}
                          data-nearest={isNear ? 'true' : undefined}
                          onClick={() => onPick(cell.cbotUsc, cell.fx)}
                          onFocus={() => setFocusPos({ r, c })}
                          onKeyDown={(e) => move(e, r, c)}
                          className={`num block min-h-[44px] w-full min-w-[64px] rounded-lg px-1 py-1.5 leading-tight text-ink transition-[box-shadow,transform] duration-100 hover:ring-2 hover:ring-g7/40 active:scale-[0.98] ${toneClass(cell.tone)} ${isActive ? 'font-bold ring-[2.5px] ring-tx ring-offset-1 ring-offset-card' : ''} ${isNear ? 'outline-dashed outline-2 outline-offset-1 outline-marker focus-visible:outline-[3px] focus-visible:outline-focus focus-visible:[outline-style:solid]' : ''}`}
                        >
                          <span className="block text-[13px] font-semibold">{t.main}</span>
                          <small className="hidden text-[11px] sm:block">{t.sub}</small>
                          <small className="block text-[11px] sm:hidden">{t.subCompact}</small>
                        </button>
                        {edge.includes('right') && (
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute -bottom-px -right-[2px] -top-px z-[2] w-[2px] bg-marker"
                          />
                        )}
                        {edge.includes('bottom') && (
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute -bottom-[2px] -left-px -right-px z-[2] h-[2px] bg-marker"
                          />
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-mut sm:hidden">Deslize para ver as outras colunas →</p>
    </div>
  )
}
