import { useEffect, useId, useRef, useState, type PointerEvent } from 'react'
import { SIM_RANGE, type CurvePt, type RiskDriver, type ZeroPoint } from '../../engine/riskSim'
import { fmtNum } from '../format'
import { AXIS_LABEL, THE, levelText, moveText, tickText, type RiskFmt } from './riskText'

/** Width used until the container is measured (and where nothing can be measured, e.g. in tests). */
const FALLBACK_W = 640
const L = 50
const R = 16
const T = 22
const B = 38

const fill = (v: string) => ({ fill: `var(${v})` })
const stroke = (v: string) => ({ stroke: `var(${v})` })
/** A halo behind the text so it stays legible over the lines and the tints. */
const halo = { stroke: 'var(--card)', strokeWidth: 3.5, paintOrder: 'stroke' as const, strokeLinejoin: 'round' as const }

/** Round tick values for a vertical range. */
export function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min
  if (!(span > 0)) return [min]
  const raw = span / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const r = raw / mag
  const step = (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * mag
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v)
  return out
}

export interface ChartValue {
  withLocks: number
  noLocks: number
}

/** The width of an element, followed as it resizes; `FALLBACK_W` while it cannot be measured. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(FALLBACK_W)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => {
      const next = Math.round(el.getBoundingClientRect().width)
      if (next > 0) setW((cur) => (cur === next ? cur : next))
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** Legend sample of a line: the same stroke the chart uses for it. */
function Swatch({ dashed, color }: { dashed?: boolean; color: string }) {
  return (
    <svg aria-hidden="true" width="26" height="10" viewBox="0 0 26 10" className="shrink-0">
      <line
        x1="1.5"
        x2="24.5"
        y1="5"
        y2="5"
        style={stroke(color)}
        strokeWidth={dashed ? 2 : 3}
        strokeLinecap="round"
        strokeDasharray={dashed ? '5 4' : undefined}
      />
    </svg>
  )
}

/**
 * "A faixa inteira": the margin per sack against the ABSOLUTE value of the driver, with the producer's fixings (gold,
 * solid) and with nothing fixed (grey, dashed), named by a legend above the chart. Hand-drawn SVG drawn in real pixels
 * (it follows the width of its box, so the text keeps its size): green tint above zero, red below, the zero line, where
 * the margin zeroes, today, the simulated move and a reading box under the pointer. Tap/click sets the simulation there.
 */
export function RiskChart({
  driver,
  points,
  half,
  fmt,
  zero,
  simMove,
  valueAt,
  onPick,
}: {
  driver: RiskDriver
  /** Margin per sack in R$ (converted here to the display currency). */
  points: CurvePt[]
  half: number
  fmt: RiskFmt
  /** Where the margin (with the fixings) is zero; null when never. */
  zero: ZeroPoint | null
  simMove: number
  /** Exact margin per sack in R$ at a move (the engine), for the cursor box. */
  valueAt: (move: number) => ChartValue | null
  /** Clicked/tapped move, already snapped to the slider step. */
  onPick: (move: number) => void
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const svgRef = useRef<SVGSVGElement>(null)
  const [boxRef, W] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const H = W < 480 ? 240 : 280
  const PLOT_W = W - L - R
  const PLOT_H = H - T - B

  const A = points.map((p) => (p.withLocks === null ? null : fmt.conv(p.withLocks)))
  const Bn = points.map((p) => (p.noLocks === null ? null : fmt.conv(p.noLocks)))
  const vals = [...A, ...Bn, 0].filter((v): v is number => v !== null && Number.isFinite(v))
  let lo = Math.min(...vals)
  let hi = Math.max(...vals)
  const pad = (hi - lo > 0 ? hi - lo : Math.max(1, Math.abs(hi))) * 0.1
  lo -= pad
  hi += pad
  const X = (m: number) => L + ((m + half) / (2 * half)) * PLOT_W
  const Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * PLOT_H
  const y0 = Y(0)

  const linePts = (arr: (number | null)[]) =>
    arr
      .flatMap((v, i) => (v === null ? [] : [`${X(points[i].move).toFixed(1)},${Y(v).toFixed(1)}`]))
      .join(' ')
  const okA = A.filter((v): v is number => v !== null)
  const firstIdx = A.findIndex((v) => v !== null)
  const lastIdx = A.length - 1 - [...A].reverse().findIndex((v) => v !== null)
  const area =
    okA.length > 1
      ? `M${X(points[firstIdx].move).toFixed(1)} ${y0.toFixed(1)} ` +
        A.flatMap((v, i) => (v === null ? [] : [`L${X(points[i].move).toFixed(1)} ${Y(v).toFixed(1)}`])).join(' ') +
        ` L${X(points[lastIdx].move).toFixed(1)} ${y0.toFixed(1)} Z`
      : ''

  const yTicks = niceTicks(lo, hi, W < 480 ? 4 : 5)
  const tickDigits = yTicks.length > 1 && Math.abs(yTicks[1] - yTicks[0]) < 1 ? 1 : 0
  const xTicks = W < 480 ? [-half, 0, half] : [-half, -half / 2, 0, half / 2, half]
  const levelOf = (m: number) => points.find((p) => Math.abs(p.move - m) < 1e-9)?.level ?? null

  // The cursor: the pointer while hovering, otherwise the simulated move (when it is not today and fits the chart).
  const simInside = simMove !== 0 && Math.abs(simMove) <= half + 1e-9
  const cursorMove = hover ?? (simInside ? simMove : null)
  const cur = cursorMove === null ? null : valueAt(cursorMove)

  const t0 = points[Math.floor(points.length / 2)]
  const today = t0?.withLocks ?? null

  const moveFromEvent = (e: PointerEvent | { clientX: number }): number | null => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r || !(r.width > 0)) return null
    const x = ((e.clientX - r.left) / r.width) * W
    return Math.max(-half, Math.min(half, ((x - L) / PLOT_W) * 2 * half - half))
  }
  const snap = (m: number) => {
    const { min, max, step } = SIM_RANGE[driver]
    return Math.max(min, Math.min(max, Math.round(m / step) * step)) + 0
  }

  const zeroInside = zero !== null && Math.abs(zero.move) <= half
  const zeroX = zeroInside ? X(zero.move) : 0
  const zeroAnchor = zeroX > W - 100 ? 'end' : zeroX < L + 60 ? 'start' : 'middle'

  const summary = (() => {
    const f = points[0]
    const l = points[points.length - 1]
    const per = (v: number | null) => (v === null ? '—' : `${fmt.money(v)}/sc`)
    return (
      `Margem por saca em função de ${THE[driver]}, de ${levelText(driver, f.level)} a ${levelText(driver, l.level)}. ` +
      `Hoje: ${per(today)} com suas travas e ${per(t0?.noLocks ?? null)} sem nada travado. ` +
      (zeroInside && zero
        ? `A margem zera com ${THE[driver]} a ${levelText(driver, zero.level)}.`
        : 'A margem não chega a zero dentro desta faixa.')
    )
  })()

  const boxW = 178
  const boxX = cursorMove === null ? 0 : Math.max(L, Math.min(X(cursorMove) - boxW / 2, W - R - boxW))

  return (
    <div className="grid gap-2">
      <ul data-testid="risk-legenda" className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-mut">
        <li className="flex items-center gap-2">
          <Swatch color="--gold" />
          <span className="text-tx">Com suas travas</span>
        </li>
        <li className="flex items-center gap-2">
          <Swatch color="--mut" dashed />
          <span>Sem nada travado</span>
        </li>
      </ul>
      <div ref={boxRef} className="relative touch-pan-y">
        <svg
          ref={svgRef}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={summary}
          data-testid="risk-chart"
          className="block h-auto w-full cursor-crosshair select-none"
          onPointerMove={(e) => setHover(moveFromEvent(e))}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => {
            const m = moveFromEvent(e)
            if (m === null) return
            setHover(null)
            onPick(snap(m))
          }}
        >
          <defs>
            <clipPath id={`${uid}up`}>
              <rect x={L} y={T} width={PLOT_W} height={Math.max(0, y0 - T)} />
            </clipPath>
            <clipPath id={`${uid}dn`}>
              <rect x={L} y={y0} width={PLOT_W} height={Math.max(0, H - B - y0)} />
            </clipPath>
            <linearGradient id={`${uid}gu`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--barpos)' }} stopOpacity={0.05} />
              <stop offset="100%" style={{ stopColor: 'var(--barpos)' }} stopOpacity={0.28} />
            </linearGradient>
            <linearGradient id={`${uid}gd`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--barneg)' }} stopOpacity={0.3} />
              <stop offset="100%" style={{ stopColor: 'var(--barneg)' }} stopOpacity={0.06} />
            </linearGradient>
          </defs>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} style={stroke('--line')} strokeWidth={1} strokeOpacity={0.8} />
              <text x={L - 8} y={Y(t) + 3.5} textAnchor="end" fontSize={10.5} style={fill('--mut')}>
                {fmtNum(t, tickDigits)}
              </text>
            </g>
          ))}
          {xTicks.map((m) => (
            <text
              key={m}
              x={X(m)}
              y={H - B + 16}
              textAnchor={m === -half ? 'start' : m === half ? 'end' : 'middle'}
              fontSize={10.5}
              fontWeight={m === 0 ? 700 : 400}
              style={fill(m === 0 ? '--tx' : '--mut')}
            >
              {levelOf(m) === null ? '' : tickText(driver, levelOf(m) as number)}
            </text>
          ))}
          <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" fontSize={10.5} style={fill('--mut')}>
            {AXIS_LABEL[driver]}
          </text>
          <text x={L} y={12} fontSize={10.5} style={fill('--mut')}>
            {`Margem (${fmt.cur === 'USD' ? 'US$' : 'R$'} por saca)`}
          </text>
          {area !== '' && (
            <>
              <path d={area} fill={`url(#${uid}gu)`} clipPath={`url(#${uid}up)`} />
              <path d={area} fill={`url(#${uid}gd)`} clipPath={`url(#${uid}dn)`} data-testid="risk-area-neg" />
            </>
          )}
          <line
            data-testid="risk-zero-line"
            x1={L}
            x2={W - R}
            y1={y0}
            y2={y0}
            style={stroke('--tx')}
            strokeOpacity={0.5}
            strokeDasharray="3 4"
            strokeWidth={1}
          />
          <polyline
            data-testid="risk-line-sem"
            fill="none"
            style={stroke('--mut')}
            strokeWidth={1.8}
            strokeDasharray="5 4"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={linePts(Bn)}
          />
          <polyline
            data-testid="risk-line-com"
            fill="none"
            style={stroke('--gold')}
            strokeWidth={2.8}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={linePts(A)}
          />
          <line x1={X(0)} x2={X(0)} y1={T} y2={H - B} style={stroke('--tx')} strokeOpacity={0.55} strokeWidth={1} strokeDasharray="2 3" data-testid="risk-hoje" />
          {today !== null && (
            <circle cx={X(0)} cy={Y(today)} r={4.5} style={{ ...fill('--gold'), ...stroke('--card') }} strokeWidth={2} />
          )}
          <text x={X(0) + 6} y={T + 9} fontSize={10.5} fontWeight={700} style={{ ...fill('--tx'), ...halo }}>
            hoje
          </text>
          {zeroInside && zero && (
            <g data-testid="risk-zero-marker">
              <circle cx={zeroX} cy={y0} r={4.5} strokeWidth={2} style={{ ...fill('--card'), ...stroke('--barneg') }} />
              <text x={zeroX} y={y0 - 10} textAnchor={zeroAnchor} fontSize={11} fontWeight={700} style={{ ...fill('--barneg'), ...halo }}>
                {`zera em ${levelText(driver, zero.level)}`}
              </text>
            </g>
          )}
          {cursorMove !== null && cur !== null && (
            <g data-testid="risk-cursor" pointerEvents="none">
              <line
                x1={X(cursorMove)}
                x2={X(cursorMove)}
                y1={T}
                y2={H - B}
                style={stroke('--tx')}
                strokeOpacity={hover !== null ? 0.4 : 0.8}
                strokeWidth={1.2}
              />
              <circle cx={X(cursorMove)} cy={Y(fmt.conv(cur.noLocks))} r={3.5} strokeWidth={1.8} style={{ ...fill('--card'), ...stroke('--mut') }} />
              <circle cx={X(cursorMove)} cy={Y(fmt.conv(cur.withLocks))} r={5} strokeWidth={2} style={{ ...fill('--gold'), ...stroke('--card') }} />
              <g transform={`translate(${boxX} ${T + 2})`}>
                <rect width={boxW} height={46} rx={8} style={{ ...fill('--card'), ...stroke('--linestrong') }} strokeWidth={0.8} />
                <text x={9} y={15} fontSize={11} fontWeight={700} style={fill('--tx')}>
                  {levelText(driver, levelOfMove(points, cursorMove))}
                  <tspan fontWeight={400} style={fill('--mut')}>{` (${cursorMove === 0 ? 'hoje' : moveText(driver, cursorMove)})`}</tspan>
                </text>
                <text x={9} y={29} fontSize={10.5} style={fill('--gold')}>
                  {`Com travas: ${fmt.money(cur.withLocks)}/sc`}
                </text>
                <text x={9} y={41} fontSize={10.5} style={fill('--mut')}>
                  {`Sem travas: ${fmt.money(cur.noLocks)}/sc`}
                </text>
              </g>
            </g>
          )}
        </svg>
      </div>
      <details className="rounded-[10px] border border-line text-[12.5px]">
        <summary className="flex min-h-[44px] cursor-pointer items-center px-3 text-mut md:min-h-[38px]">Ver os números</summary>
        <div className="max-h-72 overflow-auto px-3 pb-2">
          <table data-testid="risk-chart-table" className="w-full border-collapse">
            <caption className="sr-only">Margem por saca ao longo da faixa de {THE[driver]}</caption>
            <thead>
              <tr className="text-[11px] text-mut">
                <th scope="col" className="py-1 text-left font-medium">
                  {AXIS_LABEL[driver]}
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Com suas travas
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Sem nada travado
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.move} className="border-t border-line">
                  <th scope="row" className="num py-1 text-left font-normal">
                    {levelText(driver, p.level)}
                    <span className="text-mut">{p.move === 0 ? ' (hoje)' : ` (${moveText(driver, p.move)})`}</span>
                  </th>
                  <td className="num py-1 text-right">{p.withLocks === null ? '—' : fmt.money(p.withLocks)}</td>
                  <td className="num py-1 text-right">{p.noLocks === null ? '—' : fmt.money(p.noLocks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

function levelOfMove(points: CurvePt[], move: number): number | null {
  // Linear in the move: interpolate the level between the two neighbouring points.
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (move >= a.move - 1e-9 && move <= b.move + 1e-9 && a.level !== null && b.level !== null) {
      return a.level + ((b.level - a.level) * (move - a.move)) / (b.move - a.move)
    }
  }
  return null
}
