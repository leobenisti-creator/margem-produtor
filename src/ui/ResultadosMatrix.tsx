import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import type { FarmInputs } from '../engine/calc'
import type { CropConfig } from '../engine/crops'
import type { Tone } from '../engine/matrix'
import {
  buildScenarioMatrix,
  evaluateScenario,
  farmBasisBrlSc,
  heldAxis,
  matrixBaseScenario,
  premiumForFarmBasis,
  stepsFromSize,
  type MatrixAxis,
  type MatrixCell,
  type ScenarioMatrix,
} from '../engine/scenarioMatrix'
import { validateInput } from '../state/reducer'
import { useStore } from '../state/StoreProvider'
import type { ResultSteps } from '../state/types'
import { motion, useReducedMotion } from 'motion/react'
import { Card } from './Card'
import { ChangePulse, RING_TRANSITION } from './resultsMotion'
import { fmtNum } from './format'
import { fmtCompactMoney, fmtLoose, fmtMarginPct, fmtSignedMoney } from './fmtExtra'
import { fmtAxisPct, fmtFx, toneSituation, type Currency } from './matrixFormat'
import { NumberField } from './NumberField'
import { useResultadosBase } from './useResultadosBase'
import { useResult } from './useResult'
import { useResultsUnit, type ResultsUnit } from './resultsUnit'

/** What the CSV export prints: the margin % or the farm price. */
export type MatrixValue = 'pct' | 'price'
type AxesKey = 'cbot-dolar' | 'basis-dolar' | 'cbot-basis'

const N = 9
const CENTRE = 4

const AXES: Record<AxesKey, { row: MatrixAxis; col: MatrixAxis; name: string }> = {
  'cbot-dolar': { row: 'cbot', col: 'dolar', name: 'CBOT × Dólar' },
  'basis-dolar': { row: 'basis', col: 'dolar', name: 'Basis × Dólar' },
  'cbot-basis': { row: 'cbot', col: 'basis', name: 'CBOT × Basis' },
}

const AXIS_NAME: Record<MatrixAxis, string> = { cbot: 'CBOT', dolar: 'Dólar', basis: 'Basis' }
/** How the held driver is named in a sentence ("Alterar dólar", "Voltar ao dólar de mercado"). */
const HELD_NAME: Record<MatrixAxis, string> = { cbot: 'CBOT', dolar: 'dólar', basis: 'basis' }

const TONE_BG = ['bg-tone0', 'bg-tone1', 'bg-tone2'] as const
const toneClass = (tone: Tone) => (tone === null ? 'bg-tonena' : TONE_BG[tone])

const same = (a: number, b: number) => Math.abs(a - b) < 1e-6

// Tailwind has no 560px breakpoint: the phone layout below it is the one of the prototype.
const PHONE_HIDE = 'hidden min-[560px]:inline'

/** Fades the right edge while there is more to scroll. */
function useScrollFade(ref: RefObject<HTMLDivElement | null>, key: unknown): boolean {
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

const signedBrl = (n: number, digits = 2) => {
  const abs = fmtNum(Math.abs(n), digits)
  return `${n < 0 ? '−' : n > 0 ? '+' : ''}R$ ${abs}`
}

interface HeadParts {
  pre: string
  num: string
  suf: string
  sub: string
}

/** Header of an axis point: the value in its unit and the move from today. */
function axisHeadParts(axis: MatrixAxis, value: number, delta: number): HeadParts {
  const isToday = delta === 0
  if (axis === 'cbot') return { pre: '', num: fmtLoose(value), suf: ' US¢/bu', sub: isToday ? 'hoje' : fmtAxisPct(delta) }
  if (axis === 'dolar') return { pre: 'R$ ', num: fmtFx(value), suf: '', sub: isToday ? 'hoje' : fmtAxisPct(delta) }
  return { pre: 'R$ ', num: fmtNum(value, 2), suf: '/sc', sub: isToday ? 'hoje' : signedBrl(delta) }
}

function axisHead(axis: MatrixAxis, value: number, delta: number): { main: string; sub: string } {
  const h = axisHeadParts(axis, value, delta)
  return { main: `${h.pre}${h.num}${h.suf}`, sub: h.sub }
}

const signedCompact = (n: number | null, currency: Currency) =>
  n === null || !Number.isFinite(n) ? '—' : n < 0 ? `−${fmtCompactMoney(-n, currency)}` : fmtCompactMoney(n, currency)

/** The amount a cell shows under the %, in the page unit (R$/sc, R$/ha or R$ total), in the top currency. */
function amountText(
  cell: MatrixCell,
  unit: ResultsUnit,
  currency: Currency,
  toDisplay: (brl: number | null) => number | null,
): string {
  const v = toDisplay(unit === 'sc' ? cell.perSc : unit === 'ha' ? cell.perHa : cell.total)
  if (v === null || !Number.isFinite(v)) return '—'
  if (unit === 'sc') return `${fmtSignedMoney(v, currency)}/sc`
  if (unit === 'ha') return `${signedCompact(v, currency)}/ha`
  return signedCompact(v, currency)
}

/** Margin % with no decimals (the phone grid has no room for them). */
function pctNoDecimals(p: number | null): string {
  if (p === null || !Number.isFinite(p)) return '—'
  return `${fmtNum(p * 100, 0)}%`
}

const csvNum = (n: number | null, digits = 2) =>
  n === null || !Number.isFinite(n) ? '' : n.toFixed(digits).replace('.', ',')

/** CSV (";" separated, pt-BR numbers) of the values shown in the grid. */
export function scenarioMatrixToCsv(
  m: ScenarioMatrix,
  value: MatrixValue,
  toDisplay: (brl: number | null) => number | null,
): string {
  const label = (axis: MatrixAxis, v: number, d: number) => {
    const h = axisHead(axis, v, d)
    return `${h.main} (${h.sub})`
  }
  const header = [
    `${AXIS_NAME[m.rowAxis]} \\ ${AXIS_NAME[m.colAxis]}`,
    ...m.colValues.map((v, c) => label(m.colAxis, v, m.colDelta[c])),
  ].join(';')
  const body = m.cells.map((row, r) =>
    [
      label(m.rowAxis, m.rowValues[r], m.rowDelta[r]),
      ...row.map((cell) =>
        value === 'pct'
          ? csvNum(cell.pct === null ? null : cell.pct * 100, 1)
          : csvNum(toDisplay(cell.priceBrl)),
      ),
    ].join(';'),
  )
  return [header, ...body].join('\n')
}

function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' }))
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

interface Hover {
  r: number
  c: number
  x: number
  y: number
}

/**
 * A quiet button that opens a small panel (a menu of choices or a field). Esc and a press outside close it; Tab moves
 * through the panel.
 */
function Popover({
  label,
  testId,
  panelTestId,
  panelLabel,
  align = 'left',
  emphasis = false,
  children,
}: {
  label: string
  testId?: string
  panelTestId?: string
  panelLabel: string
  align?: 'left' | 'right'
  emphasis?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const away = (e: Event) => {
      if (e.target instanceof Node && box.current?.contains(e.target)) return
      setOpen(false)
    }
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      btn.current?.focus()
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div ref={box} className="relative">
      <button
        ref={btn}
        type="button"
        data-testid={testId}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-[9px] border bg-bg px-3 text-xs font-semibold text-tx hover:border-acc md:min-h-[34px] ${
          emphasis ? 'border-g7' : 'border-line-strong'
        }`}
      >
        <span>{label}</span>
        <svg aria-hidden viewBox="0 0 10 6" className={`h-1.5 w-2.5 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          id={id}
          data-testid={panelTestId}
          role="group"
          aria-label={panelLabel}
          className={`absolute top-full z-20 mt-1 grid w-[min(20rem,calc(100vw-2rem))] gap-1 rounded-[10px] border border-line-strong bg-card p-2 shadow-2xl ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/** A radio group inside a popover (arrow keys move the focus, like the other quiet menus). */
function Choice<T extends string>({
  title,
  value,
  options,
  onChange,
}: {
  title: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const radios = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    radios?.[(i + dir + options.length) % options.length]?.focus()
  }
  return (
    <div role="radiogroup" aria-label={title} className="grid gap-0.5">
      <h3 className="px-2 pt-1 text-[10.5px] font-semibold uppercase tracking-wide text-mut">{title}</h3>
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onKeyDown={(e) => onKey(e, i)}
          onClick={() => onChange(o.value)}
          className={`flex min-h-[44px] w-full items-center rounded-[7px] px-3 text-left text-xs md:min-h-[32px] ${
            o.value === value ? 'bg-g7/15 font-bold text-g7' : 'text-tx hover:bg-surface2'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Legend({ target, onEditTarget }: { target: number | null; onEditTarget?: () => void }) {
  const dot = (tone: string) => <i aria-hidden className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] align-[-1px] ${tone}`} />
  const labels =
    target === null
      ? ['Perde', 'Margem baixa (até 10%)', 'Margem boa']
      : ['Mais de 5 p.p. abaixo da meta', 'Até 5 p.p. abaixo da meta', `Bate a meta de ${fmtMarginPct(target)}`]
  return (
    <div data-testid="matriz-legenda" className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-mut">
      <span>
        {dot('bg-tone0')}
        {labels[0]}
      </span>
      <span>
        {dot('bg-tone1')}
        {labels[1]}
      </span>
      <span>
        {dot('bg-tone2')}
        {labels[2]}
      </span>
      <span>contorno cheio = cenário mostrado</span>
      {target !== null && (
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={onEditTarget}
          className="inline-flex min-h-[44px] items-center font-semibold text-g7 underline underline-offset-2 md:min-h-0"
        >
          Meta: {fmtNum(target * 100, 0)}% · analisar
        </button>
      )}
    </div>
  )
}

const STEP_FIELDS: Array<{ key: keyof ResultSteps; name: string; unit: string }> = [
  { key: 'cbotPct', name: 'CBOT', unit: '%' },
  { key: 'fxPct', name: 'Dólar', unit: '%' },
  { key: 'basisBrl', name: 'Basis', unit: 'R$/sc' },
]

/** pt-BR message for a step that cannot be used; null when it can. */
function stepProblem(key: keyof ResultSteps, v: number): string | null {
  if (!(v > 0)) return 'O passo deve ser maior que zero.'
  if (key !== 'basisBrl' && !(v < 25)) return 'O passo deve ser menor que 25% (a matriz vai até 4 passos).'
  return null
}

export function ResultadosMatrix({
  headerAction,
  onEditTarget,
}: { headerAction?: ReactNode; onEditTarget?: () => void } = {}) {
  const { state, dispatch } = useStore()
  const { currency, toDisplay } = useResult()
  const { unit } = useResultsUnit()
  const { crop, today, chosen, custom, basisSimulated, inputs, tranches } = useResultadosBase()
  const [axesKey, setAxesKey] = useState<AxesKey>('cbot-dolar')
  const [valueSel, setValueSel] = useState<'margem' | 'price'>('margem')
  const [msg, setMsg] = useState('')
  const [hover, setHover] = useState<Hover | null>(null)
  const [focusPos, setFocusPos] = useState<{ r: number; c: number } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)

  const { row: rowAxis, col: colAxis } = AXES[axesKey]
  const held = heldAxis(rowAxis, colAxis)
  const steps = state.matrix.resultSteps
  const stepsPct = useMemo(() => ({ cbot: stepsFromSize(steps.cbotPct), dolar: stepsFromSize(steps.fxPct) }), [steps])
  const basisSteps = useMemo(() => stepsFromSize(steps.basisBrl), [steps.basisBrl])

  // The grid is centred on today's market; the driver that is on neither axis keeps the value the producer chose.
  const base = useMemo(() => matrixBaseScenario(today, chosen, held), [today, chosen, held])

  const built = useMemo<{ matrix: ScenarioMatrix | null; error: string | null }>(() => {
    try {
      const matrix = buildScenarioMatrix({
        crop,
        scenario: base,
        inputs,
        tranches,
        rowAxis,
        colAxis,
        lens: 'tudo',
        basisSteps,
        axisStepsPct: stepsPct,
      })
      const axisOk = [...matrix.rowValues, ...matrix.colValues].every((v) => Number.isFinite(v))
      if (!axisOk) return { matrix: null, error: 'Sem preço de CBOT ou dólar para montar a matriz.' }
      return { matrix, error: null }
    } catch {
      return { matrix: null, error: 'Sem preço de CBOT ou dólar para montar a matriz.' }
    }
  }, [crop, base, inputs, tranches, rowAxis, colAxis, stepsPct, basisSteps])
  const matrix = built.matrix
  const empty = matrix !== null && matrix.cells.every((row) => row.every((c) => c.total === null))

  const more = useScrollFade(scroller, matrix)

  // The floating card is placed on screen, so it must not stay behind when the page scrolls or resizes, or on Esc.
  const hoverOpen = hover !== null
  useEffect(() => {
    if (!hoverOpen) return
    const close = () => setHover(null)
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('scroll', close, { passive: true, capture: true })
    window.addEventListener('resize', close)
    document.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('scroll', close, { capture: true })
      window.removeEventListener('resize', close)
      document.removeEventListener('keydown', esc)
    }
  }, [hoverOpen])

  const target = inputs.targetMargin
  const priceMode = valueSel === 'price'
  const reducedMotion = useReducedMotion() ?? false
  // What the producer changed that rewrites the cells: the axes, the view, the target, the steps, the market the grid is
  // centred on and the numbers of its corners (so a new cost or sale also counts). Picking a cell is NOT one of them.
  const corner = (r: number, c: number) => matrix?.cells[r]?.[c]?.total ?? 'x'
  const pulseSignature = [
    axesKey,
    valueSel,
    target,
    steps.cbotPct,
    steps.fxPct,
    steps.basisBrl,
    base.cbotUsc,
    base.fx,
    base.basisUsc,
    corner(0, 0),
    corner(4, 4),
    corner(8, 8),
  ].join('|')

  // --- the held driver (the one that is on neither axis) ---
  const heldMarket = held === 'cbot' ? today.cbotUsc : held === 'dolar' ? today.fx : today.basisUsc
  const heldChosen = held === 'cbot' ? chosen.cbotUsc : held === 'dolar' ? chosen.fx : chosen.basisUsc
  const altered = !same(heldChosen, heldMarket)
  const marketBasisBrl = farmBasisBrlSc(crop, today, inputs)
  const chosenBasisBrl = farmBasisBrlSc(crop, chosen, inputs)
  const heldMarketText =
    held === 'cbot'
      ? `${fmtNum(today.cbotUsc, 2)} US¢/bu`
      : held === 'dolar'
        ? `R$ ${fmtFx(today.fx)}`
        : marketBasisBrl === null
          ? '—'
          : `${fmtSignedMoney(marketBasisBrl, 'BRL')}/sc`
  const heldField = held === 'cbot' ? chosen.cbotUsc : held === 'dolar' ? chosen.fx : (chosenBasisBrl ?? 0)
  const heldUnit = held === 'cbot' ? 'US¢/bu' : held === 'dolar' ? 'R$/US$' : 'R$/sc'

  function commitHeld(v: number) {
    if (held === 'cbot' || held === 'dolar') {
      const key = held === 'cbot' ? 'cbotUsc' : 'fx'
      dispatch({ type: 'override', key, value: same(v, heldMarket) ? null : v })
      return
    }
    // A typed basis (R$/sc, farm price - CBOT) is turned into the premium the engine uses, at the dollar shown.
    const premium = premiumForFarmBasis(crop, chosen, inputs, v)
    if (premium === null) return
    dispatch({ type: 'setSimBasis', value: same(premium, today.basisUsc) ? null : premium })
  }
  function validateHeld(v: number): string | null {
    if (held === 'cbot') return validateInput('cbotUsc', v)
    if (held === 'dolar') return validateInput('fx', v)
    return premiumForFarmBasis(crop, chosen, inputs, v) === null ? 'Sem preço de CBOT ou dólar para converter o basis.' : null
  }
  function backToMarket() {
    if (held === 'cbot') dispatch({ type: 'override', key: 'cbotUsc', value: null })
    else if (held === 'dolar') dispatch({ type: 'override', key: 'fx', value: null })
    else dispatch({ type: 'setSimBasis', value: null })
  }

  function pick(cell: MatrixCell) {
    const s = cell.scenario
    if (same(s.cbotUsc, today.cbotUsc) && same(s.fx, today.fx) && same(s.basisUsc, today.basisUsc)) {
      dispatch({ type: 'resetScenario' })
      return
    }
    dispatch({ type: 'applyScenario', cbotUsc: s.cbotUsc, fx: s.fx })
    dispatch({ type: 'setSimBasis', value: same(s.basisUsc, today.basisUsc) ? null : s.basisUsc })
  }

  function exportCsv() {
    if (!matrix) return
    try {
      download(
        `matriz-resultados-${crop.id}-${todayIso()}.csv`,
        scenarioMatrixToCsv(matrix, priceMode ? 'price' : 'pct', toDisplay),
      )
      setMsg('')
    } catch {
      setMsg('Não foi possível baixar a matriz neste navegador.')
    }
  }

  // The cell of the chosen scenario, when on the grid. With no scenario chosen the DRE shows today, which is the centre
  // cell: it is marked like any cell the producer picks.
  const fieldOf = (axis: MatrixAxis, s: { cbotUsc: number; fx: number; basisUsc: number }) =>
    axis === 'cbot' ? s.cbotUsc : axis === 'dolar' ? s.fx : s.basisUsc
  const chosenPos = ((): { r: number; c: number } | null => {
    if (!matrix) return null
    if (!(custom || basisSimulated)) return { r: CENTRE, c: CENTRE }
    for (let r = 0; r < matrix.cells.length; r++)
      for (let c = 0; c < matrix.cells[r].length; c++) {
        const s = matrix.cells[r][c].scenario
        if (same(fieldOf(rowAxis, s), fieldOf(rowAxis, chosen)) && same(fieldOf(colAxis, s), fieldOf(colAxis, chosen)))
          return { r, c }
      }
    return null
  })()
  const stop = focusPos ?? chosenPos ?? { r: CENTRE, c: CENTRE }

  // "Cenário mostrado": the chosen scenario worked out by the same function that builds the cells.
  const shown = useMemo(() => evaluateScenario(crop, chosen, inputs, tranches, 'tudo'), [crop, chosen, inputs, tranches])

  function onCellKey(e: KeyboardEvent<HTMLButtonElement>, r: number, c: number) {
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

  const axisAria = (axis: MatrixAxis, v: number, d: number) => {
    const h = axisHead(axis, v, d)
    const name = axis === 'dolar' ? 'dólar' : axis === 'cbot' ? 'CBOT' : 'basis'
    return `${name} ${h.main} (${h.sub})`
  }

  const valueName = priceMode ? 'Preço da fazenda' : 'Margem %'
  const unitText = unit === 'sc' ? 'R$/sc' : unit === 'ha' ? 'R$/ha' : 'R$ total'
  const head =
    'sticky left-0 z-[1] bg-card p-0.5 text-left text-[8.5px] font-semibold text-tx min-[560px]:p-1 min-[560px]:text-[12px]'
  const showTable = matrix !== null && !empty

  const sign = (n: number) => (n < 0 ? '−' : n > 0 ? '+' : '')
  const shownBasis = chosenBasisBrl === null ? '—' : `${sign(chosenBasisBrl)}R$ ${fmtNum(Math.abs(chosenBasisBrl), 2)}/sc`

  return (
    <Card title="E se o mercado mudar?" testId="card-matriz">
      {headerAction && (
        <div data-testid="matriz-acao" className="mb-3">
          {headerAction}
        </div>
      )}
      <p className="mb-2 text-xs text-mut">
        Toque num quadrado: o número lá em cima e a DRE abaixo passam a mostrar aquele cenário.
      </p>
      <div className="grid gap-2">
        <div data-testid="matriz-controles" className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span data-testid="matriz-cruzando" className="text-[13px]">
            <span className="text-mut">Cruzando</span> <b>{AXES[axesKey].name}</b>
          </span>
          <Popover
            key={held}
            label={`Alterar ${HELD_NAME[held]}`}
            testId="matriz-held-botao"
            panelTestId="matriz-held-painel"
            panelLabel={`Alterar o ${HELD_NAME[held]} usado na matriz`}
          >
            <h3 className="px-2 pt-1 text-[10.5px] font-semibold uppercase tracking-wide text-mut">
              {held === 'cbot' ? 'CBOT' : held === 'dolar' ? 'Dólar' : 'Basis'} de mercado hoje
            </h3>
            <p data-testid="matriz-held-mercado" className="num px-2 pb-1 text-[15px] font-bold">
              {heldMarketText}
            </p>
            <div className="px-2">
              <NumberField
                label="Usar outro valor"
                unit={heldUnit}
                value={heldField}
                maxDecimals={held === 'dolar' ? 4 : 2}
                validate={validateHeld}
                onCommit={commitHeld}
              />
            </div>
            <p className="px-2 pt-1 text-[11px] text-mut">
              Muda a matriz, o número de cima e a DRE desta tela. O que você digitou em Lavoura e custos não muda.
            </p>
          </Popover>
          {altered && (
            <button
              type="button"
              data-testid="matriz-voltar"
              onClick={backToMarket}
              className="min-h-[44px] rounded-[9px] px-2 text-xs font-semibold text-g7 underline underline-offset-2 md:min-h-[34px]"
            >
              Voltar ao {HELD_NAME[held]} de mercado
            </button>
          )}
          <div className="ml-auto">
            <Popover label="Ajustar" testId="matriz-ajustar" panelTestId="matriz-ajustar-painel" panelLabel="Ajustar a matriz" align="right" emphasis>
              <Choice
                title="Cruzar"
                value={axesKey}
                onChange={(k) => {
                  setAxesKey(k)
                  setHover(null)
                }}
                options={(Object.keys(AXES) as AxesKey[]).map((k) => ({ value: k, label: AXES[k].name }))}
              />
              <Choice
                title="Mostrar"
                value={valueSel}
                onChange={setValueSel}
                options={[
                  { value: 'margem', label: 'Margem' },
                  { value: 'price', label: 'Preço da fazenda' },
                ]}
              />
              <div role="group" aria-label="Tamanho do passo" className="grid gap-1.5 px-2 pt-1">
                <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-mut">
                  Tamanho do passo (cada quadrado)
                </h3>
                {STEP_FIELDS.map((f) => (
                  <NumberField
                    key={f.key}
                    label={`Passo do ${f.name}`}
                    unit={f.unit}
                    value={steps[f.key]}
                    validate={(v) => stepProblem(f.key, v)}
                    onCommit={(v) => dispatch({ type: 'setResultSteps', steps: { [f.key]: v } })}
                  />
                ))}
                <p className="text-[11px] text-mut">A matriz vai de −4 a +4 passos.</p>
              </div>
              {showTable && (
                <button
                  type="button"
                  data-testid="matriz-csv"
                  onClick={exportCsv}
                  className="mt-1 min-h-[44px] w-full rounded-[7px] border-t border-line px-3 text-left text-xs text-tx hover:bg-surface2 md:min-h-[32px]"
                >
                  Baixar CSV da matriz
                </button>
              )}
            </Popover>
          </div>
        </div>
        {msg && (
          <p role="alert" className="text-xs text-danger">
            {msg}
          </p>
        )}
      </div>

      <div className="mt-3">
        {built.error && (
          <p role="status" className="rounded-[10px] border border-line px-3 py-2 text-xs text-mut">
            {built.error}
          </p>
        )}
        {matrix && empty && (
          <p role="status" className="rounded-[10px] border border-line px-3 py-2 text-xs text-mut">
            Informe área e produtividade para ver a matriz.
          </p>
        )}
        {showTable && (
          <ChangePulse signature={pulseSignature} testId="matriz-pulso" from={0.6} y={3}>
            <div
              ref={scroller}
              data-testid="matriz-scroll"
              className="overflow-x-auto pb-1"
              style={
                more
                  ? ({ maskImage: 'linear-gradient(to right, black calc(100% - 24px), transparent)' } as CSSProperties)
                  : undefined
              }
            >
              <table
                ref={tableRef}
                data-testid="matriz-tabela"
                className="num w-full min-[560px]:min-w-[640px] border-separate border-spacing-[1px] text-center min-[560px]:border-spacing-0.5"
              >
                <caption className="sr-only">
                  Matriz de resultados: {AXIS_NAME[rowAxis]} nas linhas e {AXIS_NAME[colAxis]} nas colunas. {valueName}
                  {priceMode ? '' : `, com ${unitText} embaixo`}.
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className={`${head} whitespace-nowrap leading-tight`}>
                      <span className="block">{AXIS_NAME[rowAxis]} ↓</span>
                      <span className="block">{AXIS_NAME[colAxis]} →</span>
                    </th>
                    {matrix.colValues.map((v, c) => {
                      const h = axisHeadParts(colAxis, v, matrix.colDelta[c])
                      const isToday = c === CENTRE
                      return (
                        <th
                          key={c}
                          scope="col"
                          data-today={isToday ? 'true' : undefined}
                          className={`p-0.5 align-bottom text-[8.5px] font-semibold leading-tight min-[560px]:p-1 min-[560px]:text-[12px] ${isToday ? 'rounded-t-md bg-g7/10 text-g7' : 'text-tx'}`}
                        >
                          <span className="block whitespace-nowrap">
                            <span className={PHONE_HIDE}>{h.pre}</span>
                            {h.num}
                            <span className={PHONE_HIDE}>{h.suf}</span>
                          </span>
                          <small className={`block text-[8px] font-medium min-[560px]:text-[11px] ${isToday ? '' : 'text-mut'}`}>
                            {isToday ? '● hoje' : h.sub}
                          </small>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {matrix.cells.map((row, r) => {
                    const h = axisHeadParts(rowAxis, matrix.rowValues[r], matrix.rowDelta[r])
                    const todayRow = r === CENTRE
                    return (
                      <tr key={r}>
                        <th
                          scope="row"
                          data-today={todayRow ? 'true' : undefined}
                          className={`${head} whitespace-nowrap pr-1 leading-tight min-[560px]:pr-2 ${todayRow ? 'bg-g7/10 text-g7' : ''}`}
                        >
                          <span className="block">
                            <span className={PHONE_HIDE}>{h.pre}</span>
                            {h.num}
                            <span className={PHONE_HIDE}>{h.suf}</span>
                          </span>
                          <small className={`block text-[8px] font-medium min-[560px]:text-[11px] ${todayRow ? '' : 'text-mut'}`}>
                            {todayRow ? '● hoje' : h.sub}
                          </small>
                        </th>
                        {row.map((cell, c) => {
                          const isToday = r === CENTRE && c === CENTRE
                          const isChosen = chosenPos !== null && chosenPos.r === r && chosenPos.c === c
                          const priceFull = fmtSignedMoney(toDisplay(cell.priceBrl), currency)
                          const priceInt = (() => {
                            const v = toDisplay(cell.priceBrl)
                            return v === null ? '—' : fmtNum(v, 0)
                          })()
                          const main = priceMode ? priceFull : fmtMarginPct(cell.pct)
                          const mainPhone = priceMode ? priceInt : pctNoDecimals(cell.pct)
                          const sub = priceMode ? 'por saca' : amountText(cell, unit, currency, toDisplay)
                          const spoken = priceMode ? `${priceFull}/sc` : `${fmtMarginPct(cell.pct)}, ${sub}`
                          const label =
                            `${axisAria(rowAxis, matrix.rowValues[r], matrix.rowDelta[r])}, ` +
                            `${axisAria(colAxis, matrix.colValues[c], matrix.colDelta[c])}: ` +
                            `${valueName} ${spoken}; ${toneSituation(cell.tone, target)}` +
                            (isChosen ? '; cenário escolhido' : '')
                          return (
                            <td key={c} data-testid={isToday ? 'matriz-hoje' : undefined} className="relative p-0">
                              <button
                                type="button"
                                data-testid={`matriz-celula-${r}-${c}`}
                                data-r={r}
                                data-c={c}
                                data-tone={cell.tone ?? 'na'}
                                tabIndex={stop.r === r && stop.c === c ? 0 : -1}
                                aria-label={label}
                                aria-current={isChosen ? 'true' : undefined}
                                onClick={() => pick(cell)}
                                onFocus={(e) => {
                                  setFocusPos({ r, c })
                                  const b = e.currentTarget.getBoundingClientRect()
                                  setHover({ r, c, x: b.left + b.width / 2, y: b.top + b.height / 2 })
                                }}
                                onBlur={() => setHover(null)}
                                onMouseEnter={(e) => setHover({ r, c, x: e.clientX, y: e.clientY })}
                                onMouseMove={(e) => setHover({ r, c, x: e.clientX, y: e.clientY })}
                                onMouseLeave={() => setHover(null)}
                                onKeyDown={(e) => onCellKey(e, r, c)}
                                className={`num block min-h-[36px] w-full min-w-0 rounded-[5px] px-0 py-0.5 text-[9.5px] font-semibold leading-tight text-ink transition-[box-shadow,transform,background-color] duration-200 hover:ring-2 hover:ring-g7/40 active:scale-[0.98] min-[560px]:min-h-[44px] min-[560px]:min-w-[72px] min-[560px]:rounded-lg min-[560px]:px-1 min-[560px]:py-1.5 min-[560px]:text-[12.5px] ${toneClass(cell.tone)}`}
                              >
                                <span className="block min-[560px]:hidden">{mainPhone}</span>
                                <span className="hidden min-[560px]:block">{main}</span>
                                <small className="hidden text-[11px] font-medium opacity-90 min-[560px]:block">{sub}</small>
                              </button>
                              {isChosen && (
                                <motion.span
                                  layoutId="matriz-escolhida"
                                  transition={reducedMotion ? { duration: 0 } : RING_TRANSITION}
                                  data-testid="matriz-escolhida"
                                  aria-hidden="true"
                                  className="pointer-events-none absolute inset-0 rounded-[5px] ring-[2.5px] ring-tx ring-offset-1 ring-offset-card min-[560px]:rounded-lg"
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
          </ChangePulse>
        )}
        <p data-testid="matriz-cenario" className="num mt-2.5 text-[12.5px]">
          <span className="text-mut">Cenário mostrado:</span> <b>{fmtLoose(chosen.cbotUsc)} US¢</b> ·{' '}
          <b>R$ {fmtFx(chosen.fx)}</b> · basis <b>{shownBasis}</b> → margem{' '}
          <b>
            {shown.pct === null ? '—' : fmtMarginPct(shown.pct)} · {amountText(shown, unit, currency, toDisplay)}
          </b>
        </p>
        <Legend target={target} onEditTarget={onEditTarget} />
      </div>
      {showTable &&
        hover &&
        matrix.cells[hover.r]?.[hover.c] &&
        createPortal(
          <FloatingCard
            cell={matrix.cells[hover.r][hover.c]}
            at={hover}
            crop={crop}
            inputs={inputs}
            currency={currency}
            toDisplay={toDisplay}
          />,
          document.body,
        )}
    </Card>
  )
}

function FloatingCard({
  cell,
  at,
  crop,
  inputs,
  currency,
  toDisplay,
}: {
  cell: MatrixCell
  at: { x: number; y: number }
  crop: CropConfig
  inputs: FarmInputs
  currency: Currency
  toDisplay: (brl: number | null) => number | null
}) {
  const W = 300
  const vw = typeof window === 'undefined' ? 1024 : window.innerWidth
  const vh = typeof window === 'undefined' ? 768 : window.innerHeight
  const left = Math.max(8, Math.min(at.x + 16, vw - W - 8))
  const above = at.y > vh * 0.55
  const style: CSSProperties = above
    ? { left, top: at.y - 14, width: W, transform: 'translateY(-100%)' }
    : { left, top: at.y + 18, width: W }
  const money = (v: number | null) => fmtSignedMoney(toDisplay(v), currency)
  const p = cell.parts
  const basisBrl = farmBasisBrlSc(crop, cell.scenario, inputs)
  const lines: Array<[string, string, boolean?]> = p
    ? [
        ['Receita vendida', money(p.soldRevenue)],
        ['Receita do que está em aberto', money(p.unsoldRevenue)],
        ['Resultado das operações', money(p.hedge)],
        ['Receita total', money(p.revenue)],
        ['Custos', money(-p.cost)],
        ['Margem', money(p.margin), true],
      ]
    : []
  return (
    <div
      data-testid="matriz-cartao"
      role="tooltip"
      style={style}
      className="pointer-events-none fixed z-50 rounded-[12px] border border-line-strong bg-card px-3.5 py-3 text-[12.5px] shadow-2xl"
    >
      {p ? (
        <dl className="grid gap-1">
          {lines.map(([k, v, strong]) => (
            <div
              key={k}
              className={`flex justify-between gap-3 ${strong ? 'border-t border-line pt-1 font-bold' : ''}`}
            >
              <dt className={strong ? '' : 'text-mut'}>{k}</dt>
              <dd className="num whitespace-nowrap">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-mut">Sem dados para este cenário.</p>
      )}
      <div className="num mt-2 grid gap-0.5 border-t border-line pt-2 text-[11.5px] text-mut">
        <span>
          Preço da fazenda: {cell.priceBrl === null ? '—' : `${fmtSignedMoney(toDisplay(cell.priceBrl), currency)}/sc`}
        </span>
        <span>CBOT: {fmtLoose(cell.scenario.cbotUsc)} US¢/bu</span>
        <span>Dólar: R$ {fmtFx(cell.scenario.fx)}</span>
        <span>Basis: {basisBrl === null ? '—' : `${fmtSignedMoney(basisBrl, 'BRL')}/sc`}</span>
      </div>
    </div>
  )
}
