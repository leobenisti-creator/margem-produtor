import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toneFor, type Tone } from '../engine/matrix'
import { farmBasisBrlSc } from '../engine/scenarioMatrix'
import { ALL_FIXED, marginParts } from '../engine/sensitivity'
import { useStore } from '../state/StoreProvider'
import { fmtDateBr, fmtNum } from './format'
import { fmtCompactMoney, fmtMarginPct, fmtSignedMoney } from './fmtExtra'
import { fmtFx } from './matrixFormat'
import { PickButton } from './PickButton'
import { ValueSwap } from './resultsMotion'
import { inResultsUnit, unitLabel, useResultsUnit, type ResultsUnit } from './resultsUnit'
import { useResult } from './useResult'
import { useResultadosBase } from './useResultadosBase'

const sameValue = (a: number, b: number) => Math.abs(a - b) < 1e-9

const signedPct = (now: number, base: number): string | null => {
  if (!(base > 0) || !Number.isFinite(now)) return null
  const p = now / base - 1
  return `${p < 0 ? '−' : '+'}${fmtNum(Math.abs(p) * 100, 1)}%`
}

export interface HeroData {
  /** Margin of the chosen scenario with everything fixed (R$, whole crop); null while something is missing. */
  margin: number | null
  /** Margin % in the producer's base (receita or custo). */
  pct: number | null
  tone: Tone
  productionSc: number | null
  /** What moved against today's market, in words ("CBOT 1.117 (−10,0%)"); empty = today. */
  changes: string[]
}

/**
 * The numbers of the answer at the top: the same margin the matrix shows in its centre-of-attention cell (engine
 * `marginParts` with everything fixed), its traffic light (engine `toneFor`, against the target when one is set) and
 * what the chosen scenario changed against today's market.
 */
export function useHeroData(): HeroData {
  const { crop, today, chosen, basisSimulated, inputs, tranches } = useResultadosBase()
  return useMemo(() => {
    const parts = marginParts(crop, chosen, inputs, tranches, ALL_FIXED)
    const margin = parts?.margin ?? null
    const base = inputs.marginBase === 'custo' ? parts?.cost : parts?.revenue
    const pct = margin !== null && base !== undefined && base > 0 ? margin / base : null
    const changes: string[] = []
    if (!sameValue(chosen.cbotUsc, today.cbotUsc)) {
      const m = signedPct(chosen.cbotUsc, today.cbotUsc)
      changes.push(`CBOT ${fmtNum(chosen.cbotUsc, 0)}${m ? ` (${m})` : ''}`)
    }
    if (!sameValue(chosen.fx, today.fx)) {
      const m = signedPct(chosen.fx, today.fx)
      changes.push(`dólar ${fmtFx(chosen.fx)}${m ? ` (${m})` : ''}`)
    }
    if (basisSimulated) {
      // The simulated basis against the one in use today (Lavoura e custos), in R$/sc at the dollar of the scenario.
      const market = farmBasisBrlSc(crop, { ...chosen, basisUsc: today.basisUsc }, inputs)
      const mine = farmBasisBrlSc(crop, chosen, inputs)
      if (market !== null && mine !== null && Math.abs(mine - market) >= 0.005) {
        const d = mine - market
        changes.push(`basis ${d < 0 ? '−' : '+'}R$ ${fmtNum(Math.abs(d), 2)}/sc`)
      }
    }
    return {
      margin,
      pct,
      tone: toneFor(pct, inputs.targetMargin),
      productionSc: parts?.productionSc ?? null,
      changes,
    }
  }, [crop, today, chosen, basisSimulated, inputs, tranches])
}

/** The margin in the page unit and the top currency, as the big number reads it ("−R$ 12,34", "R$ 2.800.000"). */
function useHeroValue(data: HeroData) {
  const { inputs } = useResultadosBase()
  const { currency, toDisplay } = useResult()
  const { unit } = useResultsUnit()
  const v = data.margin === null ? null : inResultsUnit(data.margin, unit, data.productionSc ?? Number.NaN, inputs.areaHa)
  const shown = toDisplay(v)
  return { unit, shown, text: fmtSignedMoney(shown, currency, unit === 'total' ? 0 : 2) }
}

const SMALL: Record<ResultsUnit, string> = { sc: 'por saca', ha: 'por hectare', total: 'na safra toda' }
const SUFFIX: Record<ResultsUnit, string> = { sc: '/sc', ha: '/ha', total: '' }

function Pill({ data, baseWord }: { data: HeroData; baseWord: string }) {
  const { inputs } = useResultadosBase()
  const target = inputs.targetMargin
  let text: string
  let tone: Tone = data.tone
  if (data.pct === null || tone === null) {
    text = 'Margem indisponível'
    tone = null
  } else if (data.pct < 0) text = 'No prejuízo'
  else if (target === null) text = tone === 2 ? 'Margem boa' : 'Margem baixa'
  else text = tone === 2 ? 'Bate a meta' : tone === 1 ? 'Perto da meta' : 'Abaixo da meta'
  const Icon = tone === 2 ? TrendingUp : tone === 0 ? TrendingDown : Minus
  const bg = tone === null ? 'bg-tonena' : (['bg-tone0', 'bg-tone1', 'bg-tone2'] as const)[tone]
  return (
    <span
      data-testid="hero-pill"
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-bold text-accink transition-colors duration-300 motion-reduce:transition-none ${bg}`}
    >
      <Icon aria-hidden="true" size={14} strokeWidth={2.25} />
      {text}
      {data.pct !== null && (
        <span className="num font-bold">
          {' '}
          · {fmtMarginPct(data.pct)} {baseWord}
        </span>
      )}
    </span>
  )
}

/** "Cenário: Hoje" or "Cenário alterado: … · voltar a hoje". */
function ScenarioChip({ changes, onBack, compact = false }: { changes: string[]; onBack: () => void; compact?: boolean }) {
  if (changes.length === 0)
    return (
      <span data-testid={compact ? 'hero-slim-chip' : 'hero-chip'} className="text-[12px] text-mut">
        Cenário: <b className="font-semibold text-tx">Hoje</b>
      </span>
    )
  return (
    <span
      data-testid={compact ? 'hero-slim-chip' : 'hero-chip'}
      className="inline-flex flex-wrap items-center gap-x-2 text-[12px] text-mut"
    >
      <span>
        {compact ? 'Cenário alterado' : 'Cenário alterado:'}
        {!compact && <b className="font-semibold text-tx"> {changes.join(' · ')}</b>}
      </span>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-[44px] items-center font-semibold text-g7 underline underline-offset-2 md:min-h-[32px]"
      >
        voltar a hoje
      </button>
    </span>
  )
}

/**
 * The answer: the margin of the chosen scenario in big type (one unit for the page), its status, one plain sentence,
 * the trust line and the scenario chip with the way back to today. A slim bar with the number and the chip stays at
 * the top while this block is out of view. `actions` are small buttons at the bottom right of the card.
 */
export function ResultadosHero({ actions }: { actions?: ReactNode } = {}) {
  const { dispatch, snapshot } = useStore()
  const { crop, chosen, inputs } = useResultadosBase()
  const { currency, toDisplay } = useResult()
  const data = useHeroData()
  const { unit, setUnit } = useResultsUnit()
  const { text } = useHeroValue(data)
  const heroRef = useRef<HTMLElement>(null)
  const [stuck, setStuck] = useState(false)

  // The slim bar shows once the hero scrolls out of view (jsdom and old browsers have no IntersectionObserver).
  useEffect(() => {
    const el = heroRef.current
    if (!el || typeof IntersectionObserver !== 'function') return
    const io = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), { threshold: 0.05 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const back = () => dispatch({ type: 'resetScenario' })
  const baseWord = inputs.marginBase === 'custo' ? 'do custo' : 'da receita'
  const dateIso = snapshot.cbotUsc[crop.id].asOf
  const margin = data.margin
  const sentence =
    margin === null
      ? 'Informe área e produtividade para ver a margem da safra.'
      : `Com a bolsa a ${fmtNum(chosen.cbotUsc, 0)} US¢/bu e o dólar a R$ ${fmtFx(chosen.fx)}, depois de pagar todos os custos ${
          margin < 0 ? 'faltam' : 'sobram'
        } ${fmtCompactMoney(toDisplay(Math.abs(margin)), currency)} na safra.`

  return (
    <>
      <section
        ref={heroRef}
        data-testid="resultados-hero"
        aria-label="Sua margem"
        className="rounded-[18px] border border-line-strong bg-card px-4 pb-3.5 pt-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <ScenarioChip changes={data.changes} onBack={back} />
          <PickButton
            emphasis
            caption="Valores em"
            ariaLabel="Unidade de todos os valores"
            value={unit}
            onChange={setUnit}
            options={(['sc', 'ha', 'total'] as const).map((u) => ({ value: u, label: unitLabel(u, currency) }))}
          />
        </div>
        <p data-testid="hero-valor" className="num mb-2 mt-3.5 text-[clamp(40px,10vw,60px)] font-bold leading-none tracking-tight">
          <ValueSwap text={text} />
          <small className="ml-1.5 text-[0.36em] font-medium tracking-normal text-mut">{SMALL[unit]}</small>
        </p>
        <div>
          <Pill data={data} baseWord={baseWord} />
        </div>
        <p data-testid="hero-frase" className="mt-2.5 max-w-[58ch] text-[13.5px]">
          {sentence}
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1.5">
          <p data-testid="hero-confianca" className="min-w-0 flex-1 basis-56 text-[11.5px] text-mut">
            Margem bruta: antes de impostos, juros e perdas · Preços de {fmtDateBr(dateIso)}, não ao vivo
          </p>
          {actions && <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{actions}</div>}
        </div>
      </section>
      {stuck && (
        <div
          data-testid="hero-slim"
          className="fixed inset-x-0 top-0 z-30 border-b border-line bg-bg px-4 py-1.5"
        >
          <div className="mx-auto flex max-w-[820px] items-center justify-between gap-2.5 text-[13px]">
            <span>
              Margem{' '}
              <b className="num text-base">
                {text}
                {SUFFIX[unit]}
              </b>
            </span>
            <ScenarioChip changes={data.changes} onBack={back} compact />
          </div>
        </div>
      )}
    </>
  )
}
