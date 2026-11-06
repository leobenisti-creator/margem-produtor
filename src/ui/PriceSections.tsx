import { Info } from 'lucide-react'
import { scHaToTHa } from '../engine/units'
import { useStore } from '../state/StoreProvider'
import { Card } from './Card'
import { buildComparison, COMPARISON_GAP_HINT } from './comparison'
import { ExplainButton, useExplain } from './ExplainDrawer'
import { fmtMoney, fmtNum, fmtPct } from './format'
import { fmtLoose, fmtMarginPct } from './fmtExtra'
import { useResult } from './useResult'

/**
 * The pieces that left the Simulação in Feedback 1 (cascade button, other markets, equilíbrio,
 * exposição): they now live on `#/preco`; the minimum price also shows in the meta dialog.
 */

export function ComoCalculamosButton() {
  const { open } = useExplain()
  return (
    <button
      type="button"
      onClick={(e) => open('precoFazenda', e.currentTarget)}
      className="mt-2 min-h-[44px] rounded-[9px] border border-line bg-card px-4 text-xs font-semibold text-g7 md:min-h-[36px]"
    >
      Como calculamos
    </button>
  )
}

function WhyButton() {
  const { open } = useExplain()
  return (
    <button
      type="button"
      aria-label="Por que os preços em outras praças são maiores"
      onClick={(e) => open('precoFazenda', e.currentTarget)}
      className="ml-1 inline-grid h-11 w-11 shrink-0 place-items-center rounded-full align-middle text-g7 md:h-6 md:w-6"
    >
      <Info aria-hidden="true" size={16} strokeWidth={1.75} />
    </button>
  )
}

/** "Em outras praças (sem frete): B3 … · Cepea …" with the why-button when the gap passes 25 %. */
export function OtherMarketsNote() {
  const { snapshot, state } = useStore()
  const { result, crop, currency, fx } = useResult()
  const comparison = buildComparison(
    snapshot,
    crop.id,
    currency,
    fx,
    result.farmPriceBrl,
    state.overrides.fx !== undefined,
  )
  return (
    <p data-testid="outras-pracas" className="text-pretty text-[12px] text-mut">
      Em outras praças (sem frete): {comparison.text}
      {comparison.gap !== null && comparison.gap > COMPARISON_GAP_HINT && <WhyButton />}
    </p>
  )
}

/** "Preço mínimo p/ meta X%" (only with a target); "inatingível" when no price reaches it. */
export function MinPrice() {
  const { result, farmInputs, currency, toDisplay } = useResult()
  const goal = farmInputs.targetMargin
  if (goal === null) return null
  const unreachable = result.minPriceBrl === null && farmInputs.yieldScHa > 0 && goal > 0
  return (
    <div>
      <small className="flex items-center text-[11px] text-mut">
        Preço mínimo p/ meta {fmtNum(goal * 100, 0)}%
        <ExplainButton k="precoMinimo" label="preço mínimo" className="text-mut" />
      </small>
      <b data-testid="min-price" className="num block text-lg">
        {unreachable ? 'inatingível' : fmtMoney(toDisplay(result.minPriceBrl), currency)}
      </b>
    </div>
  )
}

/** Break-even price and yield, plus the minimum price when a target is set. */
export function BreakEvenCard() {
  const { result, farmInputs, currency, areaUnit, toDisplay } = useResult()
  const goal = farmInputs.targetMargin
  const beYield =
    result.breakEven.yieldScHa === null
      ? null
      : areaUnit === 'tHa'
        ? scHaToTHa(result.breakEven.yieldScHa)
        : result.breakEven.yieldScHa
  return (
    <Card title="Ponto de equilíbrio">
      <div className={`grid gap-2.5 ${goal === null ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <div>
          <small className="text-[11px] text-mut">Preço e produtividade que zeram a margem</small>
          <b data-testid="break-even" className="num block text-lg">
            {fmtMoney(toDisplay(result.breakEven.priceBrl), currency)}
            {' · '}
            {beYield === null ? '—' : `${fmtLoose(beYield)} ${areaUnit === 'tHa' ? 't/ha' : 'sc/ha'}`}
          </b>
        </div>
        <MinPrice />
      </div>
    </Card>
  )
}

/** Sold vs open bar and, once something is sold, the blended margin. */
export function ExposureCard() {
  const { result, farmInputs, currency, toDisplay } = useResult()
  const sold = Math.min(1, Math.max(0, farmInputs.soldPct))
  return (
    <Card title="Exposição">
      <div data-testid="exposicao">
        <div className="my-2 flex h-3.5 overflow-hidden rounded-lg" aria-hidden="true">
          <i className="block bg-g7" style={{ width: `${sold * 100}%` }} />
          <i className="block bg-bar-track" style={{ width: `${(1 - sold) * 100}%` }} />
        </div>
        <div className="flex gap-3 text-[11px] text-mut">
          <span>Vendido {fmtPct(sold, 0)}</span>
          <span>Em aberto {fmtPct(1 - sold, 0)}</span>
        </div>
      </div>
      {farmInputs.soldPct > 0 && (
        <p className="mt-2 text-[11px] text-mut">
          <ExplainButton k="blendada" label="margem blendada" className="float-right text-mut" />
          Margem “blendada” ({fmtPct(sold, 0)} a {fmtMoney(toDisplay(farmInputs.soldAvgPriceBrl), currency)} +{' '}
          {fmtPct(1 - sold, 0)} ao preço de hoje):{' '}
          <b data-testid="blended" className="text-g7">
            {fmtMarginPct(result.blendedMarginPct)}
          </b>
        </p>
      )}
    </Card>
  )
}
