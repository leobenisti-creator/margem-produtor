import { useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { RiskKey } from '../engine/exposure'
import { mapSegments, riskList } from '../engine/exposureView'
import { Card } from './Card'
import { NO_PRODUCTION_EXPOSURE_TEXT } from './ExposureCard'
import { fmtCompactMoney } from './fmtExtra'
import { fmtNum, fmtPct } from './format'
import { useExposure } from './useExposure'
import { useResult } from './useResult'

/** Colour per number of risks still open (Geral view). */
const OPEN_COLOR = ['var(--barpos)', 'var(--tone1)', 'var(--sev2)', 'var(--barneg)']
/** Text colour on each of those fills: the accent ink on the deep green/red, dark ink on the amber/orange (both themes). */
const OPEN_INK = ['var(--accink)', 'var(--ink)', 'var(--ink)', 'var(--accink)']
/** Legend names of the profiles, as the producer reads them. */
const GERAL_LABEL: Record<string, string> = {
  travado: 'Tudo travado',
  dolar: 'Só dólar aberto',
  basis: 'Só basis aberto',
  'basis-dolar': 'Basis e dólar abertos',
  'basis-cbot': 'Basis e CBOT abertos',
  tudo: 'Tudo aberto',
}

// Donut geometry (viewBox 0 0 400 400), same as the cost donut.
const CX = 200
const CY = 200
const R_OUT = 188
const R_IN = 108
const R_LABEL = (R_OUT + R_IN) / 2
const GAP = 0.008
const MIN_LABEL_SHARE = 0.07
const CARD_W = 280

const pt = (r: number, a: number) => [CX + r * Math.cos(a), CY + r * Math.sin(a)] as const

function ringPath(a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [ox0, oy0] = pt(R_OUT, a0)
  const [ox1, oy1] = pt(R_OUT, a1)
  const [ix1, iy1] = pt(R_IN, a1)
  const [ix0, iy0] = pt(R_IN, a0)
  return `M${ox0} ${oy0} A${R_OUT} ${R_OUT} 0 ${large} 1 ${ox1} ${oy1} L${ix1} ${iy1} A${R_IN} ${R_IN} 0 ${large} 0 ${ix0} ${iy0} Z`
}

const sc = (v: number) => `${fmtNum(v, 0)} sc`
const pctText = (p: number) => fmtPct(p, p > 0 && p < 0.1 ? 1 : 0)
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** What the chart, card and legend show for one slice. */
interface Item {
  key: string
  label: string
  sc: number
  pct: number
  brl: number | null
  color: string
  ink: string
  text: string
  aria: string
  /** Risks closed / open in these sacks. */
  closed?: RiskKey[]
  open?: RiskKey[]
}

interface At {
  key: string
  x: number
  y: number
}

function SliceCard({ item, at, money }: { item: Item; at: At; money: string }) {
  const vw = typeof window === 'undefined' ? 1024 : window.innerWidth
  const vh = typeof window === 'undefined' ? 768 : window.innerHeight
  const w = Math.min(CARD_W, vw - 16)
  const left = Math.max(8, Math.min(at.x - w / 2, vw - w - 8))
  const above = at.y > vh * 0.55
  const style: CSSProperties = above
    ? { left, top: at.y - 14, width: w, transform: 'translateY(-100%)' }
    : { left, top: at.y + 18, width: w }
  return (
    <div
      data-testid="mapa-cartao"
      role="presentation"
      style={style}
      className="pointer-events-none fixed z-50 rounded-[12px] border border-line-strong bg-card px-3.5 py-3 text-[12.5px] shadow-2xl"
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-[3px]"
          style={{ backgroundColor: item.color }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-bold leading-tight">{item.label}</p>
          <p className="num mt-1 text-[15px] font-bold">
            {sc(item.sc)} · {pctText(item.pct)}
          </p>
          <p className="num text-[12px] text-mut">≈ {money} a preço de hoje</p>
        </div>
      </div>
      {item.closed && item.open && (
        <p className="mt-2 text-[12px]">
          <span className="text-mut">Fechado: </span>
          {item.closed.length ? riskList(item.closed) : 'nada'}
          <br />
          <span className="text-mut">Aberto: </span>
          {item.open.length ? riskList(item.open) : 'nada'}
        </p>
      )}
      {item.text && <p className="mt-2 text-[11.5px] text-mut">{item.text}</p>}
    </div>
  )
}

/**
 * "Mapa da safra": a donut with the whole production split by how many risks (dollar, basis, CBOT) are still open.
 * Hover/focus a slice (or click it / its legend row) for a floating card with the sacks, the share and the value.
 */
export function SafraMap() {
  const { exp } = useExposure()
  const { result, currency, toDisplay } = useResult()
  const [active, setActive] = useState<At | null>(null) // under the pointer / focused
  const [pin, setPin] = useState<At | null>(null) // kept open by a click

  useEffect(() => {
    if (!pin) return
    const away = (e: Event) => {
      const el = e.target as Element | null
      if (!el?.closest?.('[data-testid="mapa-rosca"], [data-testid="mapa-legenda"]')) setPin(null)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [pin])
  // The card sits at screen coordinates: close it on Esc, scroll and resize so it never stays behind.
  const open = active !== null || pin !== null
  useEffect(() => {
    if (!open) return
    const close = () => {
      setActive(null)
      setPin(null)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', esc)
    window.addEventListener('scroll', close, { passive: true, capture: true })
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('keydown', esc)
      window.removeEventListener('scroll', close, { capture: true })
      window.removeEventListener('resize', close)
    }
  }, [open])

  if (!exp.ok) {
    return (
      <Card title="Mapa da safra" testId="card-mapa">
        <p data-testid="mapa-vazio" className="text-[13px] text-mut">
          {NO_PRODUCTION_EXPOSURE_TEXT}
        </p>
      </Card>
    )
  }

  const farmPrice = result.farmPriceBrl !== null && Number.isFinite(result.farmPriceBrl) ? result.farmPriceBrl : null
  const money = (brl: number | null) => fmtCompactMoney(brl === null ? null : toDisplay(brl), currency)
  const total = farmPrice === null ? null : exp.productionSc * farmPrice
  const allClosed = !exp.anyExposed
  const P = exp.productionSc

  const items: Item[] = mapSegments(exp, farmPrice).map((s) => ({
    key: s.key,
    label: GERAL_LABEL[s.key] ?? s.label,
    sc: s.sc,
    pct: s.pct,
    brl: s.brl,
    color: OPEN_COLOR[Math.min(3, s.open.length)],
    ink: OPEN_INK[Math.min(3, s.open.length)],
    text: s.text,
    aria: `${s.open.length ? `${cap(riskList(s.open))} em aberto` : 'Tudo travado'}: ${fmtNum(s.sc, 0)} sc, ${pctText(s.pct)} da safra`,
    closed: s.closed,
    open: s.open,
  }))

  // Centre text.
  const centreBig = pctText(items.find((i) => i.key === 'travado')?.pct ?? 0)
  const centreSmall = 'da safra travada'

  const shown = active ?? pin
  const item = shown ? (items.find((i) => i.key === shown.key) ?? null) : null

  const atEl = (el: Element, key: string): At => {
    const r = el.getBoundingClientRect()
    return { key, x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }
  const atPointer = (e: { clientX: number; clientY: number }, key: string): At => ({ key, x: e.clientX, y: e.clientY })
  const toggle = (at: At) => setPin((p) => (p?.key === at.key ? null : at))

  // Arcs, clockwise from the top.
  let angle = -Math.PI / 2
  const arcs = items.map((it) => {
    const a0 = angle
    angle += (P > 0 ? it.sc / P : 0) * Math.PI * 2
    return { it, a0, a1: angle }
  })

  return (
    <Card title="Mapa da safra" testId="card-mapa">
      <p data-testid="mapa-resumo" className="num text-[13px] font-semibold">
        {sc(P)} · {money(total)} <span className="font-normal text-mut">a preço de hoje</span>
      </p>
      <p className="mt-0.5 text-[11.5px] text-mut">
        Cada parte é um grupo de sacas, do verde (tudo fechado) ao vermelho (tudo em aberto).
      </p>
      {allClosed && <p className="mt-1.5 text-[12.5px] font-semibold">Tudo travado: nenhuma saca em risco</p>}

      <div className="relative mx-auto mt-3 aspect-square w-full max-w-[420px]" onMouseLeave={() => setActive(null)}>
        <svg
          data-testid="mapa-rosca"
          viewBox="0 0 400 400"
          role="group"
          aria-label="Mapa da safra"
          className="h-full w-full"
        >
          {arcs.map(({ it, a0, a1 }) => {
            const on = shown?.key === it.key
            const mid = (a0 + a1) / 2
            const [lx, ly] = pt(R_LABEL, mid)
            const pad = Math.min(GAP, (a1 - a0) / 4)
            const share = P > 0 ? it.sc / P : 0
            return (
              <g key={it.key} style={{ opacity: shown && !on ? 0.5 : 1, transition: 'opacity 120ms' }}>
                <path
                  data-testid={`mapa-fatia-${it.key}`}
                  d={ringPath(a0 + pad, a1 - pad)}
                  style={{ fill: it.color }}
                  stroke={on ? 'var(--tx)' : 'none'}
                  strokeWidth={on ? 3 : 0}
                  tabIndex={0}
                  role="img"
                  aria-label={it.aria}
                  className="cursor-pointer outline-none focus-visible:stroke-[var(--focus)] focus-visible:[stroke-width:4px]"
                  onMouseEnter={(e) => setActive(atPointer(e, it.key))}
                  onMouseMove={(e) => setActive(atPointer(e, it.key))}
                  onFocus={(e) => setActive(atEl(e.currentTarget, it.key))}
                  onBlur={() => setActive(null)}
                  onClick={(e) => toggle(atPointer(e, it.key))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggle(atEl(e.currentTarget, it.key))
                    }
                  }}
                />
                {share >= MIN_LABEL_SHARE && (
                  <text
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={it.ink}
                    className="pointer-events-none select-none"
                    style={{ fontSize: share < 0.1 ? 15 : 19, fontWeight: 700 }}
                  >
                    {pctText(share)}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
        <div
          data-testid="mapa-centro"
          className="pointer-events-none absolute inset-0 grid place-content-center text-center"
        >
          <span className="num text-[28px] font-bold leading-tight sm:text-[34px]">{centreBig}</span>
          <span className="text-[12px] text-mut">{centreSmall}</span>
        </div>
      </div>

      <table data-testid="mapa-legenda" aria-label="Partes da safra" className="mt-3 w-full text-left text-[12px]">
        <thead className="text-[11.5px] text-mut">
          <tr>
            <th scope="col" className="py-1 pr-2 font-medium">
              Parte da safra
            </th>
            <th scope="col" className="py-1 pr-2 text-right font-medium">
              Sacas
            </th>
            <th scope="col" className="py-1 pr-2 text-right font-medium">
              % da safra
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              Valor
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr
              key={it.key}
              data-testid={`mapa-linha-${it.key}`}
              className={`cursor-pointer border-t border-line ${shown?.key === it.key ? 'bg-surface2' : ''}`}
              onMouseEnter={(e) => setActive(atEl(e.currentTarget, it.key))}
              onMouseLeave={() => setActive(null)}
              onClick={(e) => toggle(atEl(e.currentTarget, it.key))}
            >
              <th scope="row" className="py-1.5 pr-2 font-normal">
                <button
                  type="button"
                  aria-pressed={pin?.key === it.key}
                  className="flex min-h-[44px] items-center gap-1.5 rounded-[4px] text-left outline-none md:min-h-0 focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                  onFocus={(e) => setActive(atEl(e.currentTarget, it.key))}
                  onBlur={() => setActive(null)}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggle(atEl(e.currentTarget, it.key))
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: it.color }}
                  />
                  {it.label}
                </button>
              </th>
              <td className="num py-1.5 pr-2 text-right">{fmtNum(it.sc, 0)}</td>
              <td className="num py-1.5 pr-2 text-right">{pctText(it.pct)}</td>
              <td className="num py-1.5 text-right">{money(it.brl)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {item &&
        shown &&
        // In the body so no transformed ancestor can shift a fixed-position card.
        createPortal(<SliceCard item={item} at={shown} money={money(item.brl)} />, document.body)}
    </Card>
  )
}
