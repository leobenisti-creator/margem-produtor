import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { type CostCategoryId } from '../data/types'
import { effectiveYieldScHa } from '../engine/production'
import { useStore } from '../state/StoreProvider'
import { Card } from './Card'
import {
  categoriesInEffect,
  categorySlices,
  costCurrencyMix,
  costSlices,
  sliceTooltip,
  statusTotals,
  type CostSlice,
  type SliceTooltip,
} from './costBreakdown'
import { useCostUnit } from './costUnit'
import { fmtMoney, fmtPct } from './format'
import { useResult } from './useResult'

/** One hue per cost group (tokens --cat1..8, checked in contrast.test); the items of a group share its hue. */
const GROUP_COLOR: Record<CostCategoryId, string> = {
  sementes: 'var(--cat1)',
  fertilizantes: 'var(--cat2)',
  defensivos: 'var(--cat3)',
  operacoes: 'var(--cat4)',
  maoDeObra: 'var(--cat5)',
  arrendamento: 'var(--cat6)',
  financeiro: 'var(--cat7)',
  outros: 'var(--cat8)',
}

// Donut geometry (viewBox 0 0 400 400): a thick ring so the percentage fits inside each slice.
const CX = 200
const CY = 200
const R_OUT = 188
const R_IN = 108
const R_LABEL = (R_OUT + R_IN) / 2
const GAP = 0.008 // rad trimmed from each side of a slice
const MIN_LABEL_SHARE = 0.035

/** Fill of each slice: its group hue, lighter for the 2nd, 3rd... slice of the same group so neighbours differ. */
function fills(slices: CostSlice[]): string[] {
  const seen = new Map<CostCategoryId, number>()
  return slices.map((s) => {
    const n = seen.get(s.group) ?? 0
    seen.set(s.group, n + 1)
    const mix = Math.min(0.55, n * 0.18)
    return `color-mix(in srgb, ${GROUP_COLOR[s.group]}, var(--mixto) ${Math.round(mix * 100)}%)`
  })
}

const pt = (r: number, a: number) => [CX + r * Math.cos(a), CY + r * Math.sin(a)] as const

/** A ring segment from angle a0 to a1 (radians, clockwise from the top). */
function ringPath(a0: number, a1: number): string {
  // A full circle cannot be one arc: draw it as two halves.
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    const [ox0, oy0] = pt(R_OUT, a0)
    const [ox1, oy1] = pt(R_OUT, a0 + Math.PI)
    const [ix0, iy0] = pt(R_IN, a0)
    const [ix1, iy1] = pt(R_IN, a0 + Math.PI)
    return (
      `M${ox0} ${oy0} A${R_OUT} ${R_OUT} 0 1 1 ${ox1} ${oy1} A${R_OUT} ${R_OUT} 0 1 1 ${ox0} ${oy0} Z ` +
      `M${ix0} ${iy0} A${R_IN} ${R_IN} 0 1 0 ${ix1} ${iy1} A${R_IN} ${R_IN} 0 1 0 ${ix0} ${iy0} Z`
    )
  }
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [ox0, oy0] = pt(R_OUT, a0)
  const [ox1, oy1] = pt(R_OUT, a1)
  const [ix1, iy1] = pt(R_IN, a1)
  const [ix0, iy0] = pt(R_IN, a0)
  return `M${ox0} ${oy0} A${R_OUT} ${R_OUT} 0 ${large} 1 ${ox1} ${oy1} L${ix1} ${iy1} A${R_IN} ${R_IN} 0 ${large} 0 ${ix0} ${iy0} Z`
}

const STATUS_TEXT = { orcado: 'orçado', realizado: 'realizado' } as const

interface Active {
  id: string
  x: number
  y: number
}

/** The card that follows the pointer over a slice: the category, its cost and share, and its items when opened. */
function Tooltip({
  tip,
  at,
  colors,
  money,
  perSc,
}: {
  tip: SliceTooltip
  at: { x: number; y: number }
  colors: Map<string, string>
  money: (brlHa: number) => string
  perSc: (brlHa: number) => string
}) {
  const W = 340
  const vw = typeof window === 'undefined' ? 1024 : window.innerWidth
  const vh = typeof window === 'undefined' ? 768 : window.innerHeight
  const left = Math.max(8, Math.min(at.x + 16, vw - W - 8))
  const above = at.y > vh * 0.55
  const style: CSSProperties = above
    ? { left, top: at.y - 14, width: W, transform: 'translateY(-100%)' }
    : { left, top: at.y + 18, width: W }
  const dot = (id: string) => (
    <span aria-hidden="true" className="mt-1 h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: colors.get(id) }} />
  )
  return (
    <div
      data-testid="cost-tooltip"
      role="presentation"
      style={style}
      className="pointer-events-none fixed z-50 rounded-[12px] border border-line-strong bg-card px-3.5 py-3 text-[12.5px] shadow-2xl"
    >
      <div className="flex items-start gap-2">
        {dot(tip.group)}
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold leading-tight">{tip.title}</p>
          <p className="num mt-1 text-[13px]">
            <b>{perSc(tip.brlHa)}</b>
            <span className="text-mut"> · {money(tip.brlHa)}</span>
          </p>
          <p className="mt-0.5 text-mut">
            <b className="num text-tx">{fmtPct(tip.shareTotal, 1)}</b> do custo total
          </p>
        </div>
      </div>
      {tip.items ? (
        <div className="mt-2.5 border-t border-line pt-2">
          <p className="mb-1 grid grid-cols-[minmax(0,1fr)_86px_44px_48px] gap-x-2 text-[10.5px] text-mut">
            <span>Itens da categoria</span>
            <span className="text-right">por saca</span>
            <span className="text-right">da cat.</span>
            <span className="text-right">do total</span>
          </p>
          <ul className="grid gap-1">
            {tip.items.map((it) => (
              <li
                key={it.id}
                className="grid grid-cols-[minmax(0,1fr)_86px_44px_48px] items-start gap-x-2 rounded-[6px] px-1 py-0.5"
              >
                <span className="flex min-w-0 items-start gap-1.5">
                  {dot(it.id)}
                  <span className="min-w-0">
                    {it.label}
                    {it.status === 'orcado' && <span className="ml-1 text-[10px] font-normal text-mut">orçado</span>}
                  </span>
                </span>
                <span className="num whitespace-nowrap text-right">{perSc(it.brlHa)}</span>
                <span className="num text-right text-mut">{fmtPct(it.shareGroup, 0)}</span>
                <span className="num text-right text-mut">{fmtPct(it.shareTotal, 1)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-mut">
          Abra a categoria em “Custo de produção” para ver os itens aqui.
        </p>
      )}
    </div>
  )
}

/**
 * "Para onde vai o custo": a big donut with one slice per cost category (items opened inside a category are not
 * slices), each printing its percentage, and the legend below. Hovering, clicking or focusing a slice floats a card
 * over everything with that category's cost per sack, its share of the whole cost and, when the category was opened,
 * every item with its share of the category and of the total. A click keeps the card open until the next click/Esc.
 */
export function CostSummary() {
  const { state } = useStore()
  const { currency, toDisplay, fx, result, farmInputs } = useResult()
  const cu = useCostUnit()
  const [active, setActive] = useState<Active | null>(null) // under the pointer / focused
  const [pin, setPin] = useState<Active | null>(null) // kept open by a click or tap
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!pin) return
    const away = (e: Event) => {
      const el = e.target as Element | null
      if (!el?.closest?.('[data-testid="cost-donut"], [data-testid="cost-legend"]')) setPin(null)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPin(null)
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [pin])
  // The card is placed on screen at the pointer, so it must not stay behind when the page scrolls or resizes.
  const open = active !== null || pin !== null
  useEffect(() => {
    if (!open) return
    const close = () => {
      setActive(null)
      setPin(null)
    }
    window.addEventListener('scroll', close, { passive: true, capture: true })
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, { capture: true })
      window.removeEventListener('resize', close)
    }
  }, [open])
  const items = costSlices(state, fx, result.farmPriceBrl)
  // The chart and its legend only have the categories; the items live inside each category's card.
  const slices = categorySlices(items)
  const totals = statusTotals(items)
  const mix = costCurrencyMix(state, fx, result.farmPriceBrl)
  // While the cost is what the producer typed in the categories (also back on "Total", as their sum); a total typed
  // straight into the single field has nothing to split, so the chart goes away.
  if (!categoriesInEffect(state) || slices.length === 0 || !(totals.totalBrlHa > 0)) return null

  const colors = slices.map((s) => GROUP_COLOR[s.group])
  // Colours of the card: each item in its category's hue (lighter for the next ones), the category in the pure hue.
  const itemColors = fills(items)
  const colorOf = new Map<string, string>(items.map((s, i) => [s.id, itemColors[i]]))
  for (const s of slices) colorOf.set(s.group, GROUP_COLOR[s.group])
  const yieldSc = effectiveYieldScHa(farmInputs)
  const showMoney = (v: number | null) => fmtMoney(v === null ? null : toDisplay(v), currency)
  const money = (brlHa: number) => `${showMoney(brlHa)}/ha`
  const perSc = (brlHa: number) => (yieldSc > 0 ? `${showMoney(brlHa / yieldSc)}/sc` : '—')
  const unitMoney = (brlHa: number) => `${fmtMoney(cu.show(toDisplay(brlHa)), currency)}/${cu.suffix}`
  const order = slices.map((_, i) => i).sort((a, b) => slices[b].brlHa - slices[a].brlHa)

  let angle = -Math.PI / 2
  const arcs = slices.map((s, i) => {
    const share = s.brlHa / totals.totalBrlHa
    const a0 = angle
    angle += share * Math.PI * 2
    return { i, share, a0, a1: angle }
  })
  const top = order.slice(0, 3).map((i) => `${slices[i].label} ${fmtPct(slices[i].brlHa / totals.totalBrlHa, 0)}`)
  // Hovering wins over a pinned card; with nothing under the pointer the pinned one stays.
  const shownAt = active ?? pin
  const tip = shownAt ? sliceTooltip(items, shownAt.id as CostCategoryId) : null
  const dimmed = (group: CostCategoryId) => (shownAt && tip ? tip.group !== group : false)

  const point = (e: { clientX: number; clientY: number }, id: string) => setActive({ id, x: e.clientX, y: e.clientY })
  const toggle = (e: { clientX: number; clientY: number }, id: string) =>
    setPin((p) => (p?.id === id ? null : { id, x: e.clientX, y: e.clientY }))
  const atElement = (el: Element, id: string) => {
    const r = el.getBoundingClientRect()
    setActive({ id, x: r.left + r.width / 2, y: r.top + r.height / 2 })
  }
  const label = (s: CostSlice, share: number) =>
    `${s.label}: ${fmtPct(share, 1)} do custo total, ${perSc(s.brlHa)}`

  return (
    <Card title="Para onde vai o custo" testId="cost-summary">
      <div ref={box} onMouseLeave={() => setActive(null)}>
        <div className="relative mx-auto aspect-square w-full max-w-[420px]">
          <svg
            data-testid="cost-donut"
            viewBox="0 0 400 400"
            role="group"
            aria-label={`Divisão do custo: ${top.join(', ')}`}
            className="h-full w-full"
          >
            {arcs.map((a) => {
              const s = slices[a.i]
              const on = shownAt?.id === s.id
              const mid = (a.a0 + a.a1) / 2
              const [lx, ly] = pt(R_LABEL, mid)
              const pad = Math.min(GAP, (a.a1 - a.a0) / 4)
              return (
                <g key={s.id} style={{ opacity: dimmed(s.group) ? 0.4 : 1, transition: 'opacity 120ms' }}>
                  <path
                    data-testid={`slice-${s.id}`}
                    d={ringPath(a.a0 + pad, a.a1 - pad)}
                    fill={colors[a.i]}
                    fillRule="evenodd"
                    stroke={on ? 'var(--tx)' : 'none'}
                    strokeWidth={on ? 3 : 0}
                    tabIndex={0}
                    role="img"
                    aria-label={label(s, a.share)}
                    className="cursor-pointer outline-none focus-visible:stroke-[var(--focus)] focus-visible:[stroke-width:4px]"
                    onMouseEnter={(e) => point(e, s.id)}
                    onMouseMove={(e) => point(e, s.id)}
                    onFocus={(e) => atElement(e.currentTarget, s.id)}
                    onBlur={() => setActive(null)}
                    onClick={(e) => toggle(e, s.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        const r = e.currentTarget.getBoundingClientRect()
                        toggle({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }, s.id)
                      }
                    }}
                  />
                  {a.share >= MIN_LABEL_SHARE && (
                    <text
                      data-testid={`slice-pct-${s.id}`}
                      x={lx}
                      y={ly}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="var(--accink)"
                      className="pointer-events-none select-none"
                      style={{ fontSize: a.share < 0.07 ? 15 : 19, fontWeight: 700 }}
                    >
                      {fmtPct(a.share, a.share < 0.1 ? 1 : 0)}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
          <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
            <span className="text-[12px] text-mut">custo total</span>
            <span data-testid="cost-donut-total" className="num text-[22px] font-bold leading-tight sm:text-[26px]">
              {fmtMoney(cu.show(toDisplay(totals.totalBrlHa)), currency)}
            </span>
            <span className="text-[12px] text-mut">
              por {cu.suffix === 'ha' ? 'hectare' : cu.suffix === 't' ? 'tonelada' : 'saca'}
            </span>
          </div>
        </div>

        <div className="mt-4">
          <ul data-testid="cost-legend" className="grid gap-x-5 gap-y-1.5 sm:grid-cols-2">
            {order.map((i) => {
              const s = slices[i]
              const on = shownAt?.id === s.id
              return (
                <li
                  key={s.id}
                  onMouseEnter={(e) => point(e, s.id)}
                  onMouseMove={(e) => point(e, s.id)}
                  onClick={(e) => toggle(e, s.id)}
                  className={`flex cursor-pointer items-center gap-2 rounded-[6px] px-1.5 py-0.5 text-[12.5px] ${on ? 'bg-surface2' : ''}`}
                  style={{ opacity: dimmed(s.group) ? 0.5 : 1 }}
                >
                  <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: colors[i] }} />
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
                  <span className="num w-12 text-right text-mut">{fmtPct(s.brlHa / totals.totalBrlHa, 1)}</span>
                  <span className="num min-w-[104px] whitespace-nowrap text-right">{unitMoney(s.brlHa)}</span>
                </li>
              )
            })}
          </ul>
          <p className="mt-1.5 text-[11px] text-mut">
            Passe o mouse ou clique numa parte do gráfico para ver o custo por saca, quanto ela pesa no total e, se você
            abriu a categoria, cada item dela.
          </p>
        </div>
      </div>
      {tip &&
        shownAt &&
        // In the body so no transformed ancestor (page animations) can shift a fixed-position card.
        createPortal(
          <Tooltip tip={tip} at={shownAt} colors={colorOf} money={money} perSc={perSc} />,
          document.body,
        )}
      {state.costMode === 'categorias' && mix.share.usdOpen > 0 && (
        <p
          data-testid="open-dollar"
          role="note"
          className="mt-3 rounded-[10px] border border-warn-line bg-bg px-3 py-2 text-[12.5px] text-tx"
        >
          <b className="num">{fmtPct(mix.share.usdOpen, mix.share.usdOpen < 0.1 ? 1 : 0)}</b> do seu custo está com o
          dólar em aberto: sobe ou desce com o câmbio.
        </p>
      )}
      {totals.hasBudgeted && (
        <div data-testid="budget-share" className="mt-3 border-t border-dashed border-line pt-2">
          <p className="mb-1 text-[12px]">
            {(['orcado', 'realizado'] as const)
              .filter((k) => totals.brlHa[k] > 0)
              .map((k) => `${fmtPct(totals.share[k], 0)} ${STATUS_TEXT[k]}`)
              .join(' · ')}
          </p>
          <div className="flex h-2 overflow-hidden rounded-[5px] bg-bar-track" aria-hidden="true">
            <div className="bg-acc" style={{ width: `${totals.share.orcado * 100}%` }} />
            <div className="bg-bar-pos" style={{ width: `${totals.share.realizado * 100}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-mut">
            Orçado = valor previsto; realizado = já gasto. Só para acompanhamento, não muda o resultado.
          </p>
        </div>
      )}
    </Card>
  )
}
