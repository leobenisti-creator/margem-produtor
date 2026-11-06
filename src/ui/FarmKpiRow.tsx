import { basisSummary } from '../engine/calc'
import { effectiveYieldScHa } from '../engine/production'
import { categoriesInEffect, costCurrencyMix, costSlices, largestCost, statusTotals } from './costBreakdown'
import { todayCostBrlHa } from './costView'
import { ExplainButton } from './ExplainDrawer'
import { fmtMoney, fmtNum, fmtPct } from './format'
import { fmtCompactMoney, fmtSignedMoney } from './fmtExtra'
import { useStore } from '../state/StoreProvider'
import { useResult } from './useResult'

const btnPos = 'absolute right-0.5 top-0.5'
const card = 'relative overflow-hidden rounded-[14px] border border-line bg-card px-[15px] py-[13px]'
const small = 'block pr-8 text-[11px] font-medium text-mut lg:text-xs'
const big = 'num my-0.5 block whitespace-nowrap text-[18px] font-bold leading-[1.15] tracking-tight lg:text-[22px]'
const sub = 'block text-[11px] text-mut lg:text-[11.5px]'

/** One half of the open-cost card: what it is, the share of the cost and the amount (per ha and on the whole area). */
function OpenLine({
  testId,
  tone,
  label,
  share,
  perHa,
  onArea,
  text,
}: {
  testId: string
  tone: 'open' | 'ok' | 'budget'
  label: string
  /** Fraction 0..1, or null when there is nothing to show (then `text` says it). */
  share: number | null
  perHa: string
  onArea: string
  text: string
}) {
  const dot = tone === 'open' ? 'bg-bar-neg' : tone === 'budget' ? 'bg-acc' : 'bg-bar-pos'
  return (
    <div data-testid={testId} className="py-1.5 first:pt-0 last:pb-0">
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-mut lg:text-xs">
        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        {label}
      </span>
      {share === null ? (
        <span className="mt-0.5 block text-[13px] font-semibold leading-snug lg:text-[14px]">{text}</span>
      ) : (
        <>
          <b className="num mt-0.5 block whitespace-nowrap text-[18px] font-bold leading-[1.15] tracking-tight lg:text-[20px]">
            {fmtPct(share, share < 0.1 ? 1 : 0)}
            <span className="ml-1.5 text-[12px] font-semibold text-mut lg:text-[12.5px]">{perHa}/ha</span>
          </b>
          <span className="num block text-[11px] text-mut lg:text-[11.5px]">{onArea} na safra</span>
        </>
      )}
    </div>
  )
}

/** What is still open in the cost: the part in US$ at the market dollar, and the part that is only budgeted. */
function OpenCostCard() {
  const { state } = useStore()
  const { result, farmInputs, currency, fx, toDisplay } = useResult()
  const items = costSlices(state, fx, result.farmPriceBrl)
  const mix = costCurrencyMix(state, fx, result.farmPriceBrl)
  // On the single "Total" the cost is frozen in R$, so nothing floats with the dollar there.
  const floats = state.costMode === 'categorias'
  const dollarOpenHa = floats ? mix.brlHa.usdOpen : 0
  const hasUsd = floats && mix.hasUsd
  const budget = categoriesInEffect(state) ? statusTotals(items) : null
  const budgetHa = budget?.brlHa.orcado ?? 0
  const area = farmInputs.areaHa > 0 ? farmInputs.areaHa : 0
  const perHa = (v: number) => fmtMoney(toDisplay(v), currency)
  const onArea = (v: number) => fmtCompactMoney(toDisplay(v * area), currency)
  return (
    <div data-testid="farm-aberto" className={`${card} divide-y divide-line`}>
      <OpenLine
        testId="aberto-dolar"
        tone={dollarOpenHa > 0 ? 'open' : 'ok'}
        label="Dólar em aberto"
        share={dollarOpenHa > 0 ? mix.share.usdOpen : null}
        perHa={perHa(dollarOpenHa)}
        onArea={onArea(dollarOpenHa)}
        text={hasUsd ? 'Todos os custos em dólar estão fechados' : 'Nada em aberto no dólar'}
      />
      <OpenLine
        testId="aberto-orcado"
        tone="budget"
        label="Orçado"
        share={budgetHa > 0 && budget ? budget.share.orcado : null}
        perHa={perHa(budgetHa)}
        onArea={onArea(budgetHa)}
        text="Nenhum custo orçado: tudo realizado"
      />
    </div>
  )
}

/**
 * Top of the Lavoura + Custos page: what is still open in the cost (dollar and budgeted), what it costs, the biggest
 * cost and the basis (farm price − CBOT price; the farm price itself sits smaller underneath).
 * (The margin cards live in Resultados.)
 */
export function FarmKpiRow() {
  const { state } = useStore()
  const { result, farmInputs, scenario, crop, currency, fx, toDisplay } = useResult()
  const money = (brl: number | null) => fmtMoney(toDisplay(brl), currency)
  const costHa = todayCostBrlHa(farmInputs, fx, result.farmPriceBrl)
  const yieldSc = effectiveYieldScHa(farmInputs)
  const basis = basisSummary(crop, scenario, farmInputs)
  const biggest = largestCost(state, fx, result.farmPriceBrl)
  const perSc = (brlHa: number) => (yieldSc > 0 ? brlHa / yieldSc : null)

  return (
    <div data-testid="farm-kpis" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3">
      <OpenCostCard />
      <div data-testid="farm-custo" className={card}>
        <ExplainButton k="custo" label="custo por saca" className={`${btnPos} text-mut`} />
        <small className={small}>Custo total</small>
        <b className={big}>{money(result.costPerSc)}</b>
        <span className={sub}>por saca</span>
        <span className={sub}>{money(costHa)} /ha</span>
      </div>
      <div data-testid="farm-maior" className={card}>
        <small className={small}>Maior custo</small>
        {biggest ? (
          <>
            <b className="my-0.5 block text-[16px] font-bold leading-[1.2] lg:text-[18px]">{biggest.label}</b>
            <span className={sub}>
              <span className="num">{fmtPct(biggest.share, 0)}</span> do custo total
            </span>
            <span className={`${sub} num`}>
              {money(perSc(biggest.brlHa))} /sc · {money(biggest.brlHa)} /ha
            </span>
          </>
        ) : (
          <>
            <b className={big}>—</b>
            <span className={sub}>
              {costHa !== null && costHa > 0 ? 'detalhe o custo por categoria' : 'informe o custo'}
            </span>
          </>
        )}
      </div>
      <div data-testid="farm-basis" className={card}>
        <ExplainButton k="precoFazenda" label="preço na fazenda" className={`${btnPos} text-mut`} />
        <small className={small}>Basis</small>
        <b data-testid="farm-basis-value" className={big}>
          {basis === null ? '—' : fmtSignedMoney(toDisplay(basis.brlPerSc), currency)}
        </b>
        <span className={sub}>
          por saca{basis === null ? '' : ` · ${fmtNum(basis.uscPerBu, 1).replace('-', '−')} US¢/bu`}
        </span>
        <span data-testid="farm-preco" className={`${sub} num`}>
          Preço na fazenda {money(result.farmPriceBrl)} /sc
        </span>
      </div>
    </div>
  )
}
