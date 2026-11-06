import { normalizeBarter } from '../engine/production'
import { scHaToTHa } from '../engine/units'
import { fmtMoney, fmtNum } from './format'
import { fmtCompactMoney, fmtLoose, fmtMarginPct } from './fmtExtra'
import { ExplainButton } from './ExplainDrawer'
import { MarginBasePill } from './MarginBasePill'
import { todayCostBrlHa } from './costView'
import { useResult } from './useResult'

const btnPos = 'absolute right-0.5 top-0.5'
const base =
  'relative overflow-hidden rounded-[14px] border border-line bg-card px-[15px] py-[13px]'
// Eyebrow: sentence case, no tracking (P3-1). Below lg the three secondary tiles share one row.
const small = 'block pr-8 text-[11px] font-medium text-mut lg:text-xs'
const big = 'num my-0.5 block whitespace-nowrap text-[18px] font-bold leading-[1.15] tracking-tight lg:text-[22px]'
const sub = 'block text-[11px] text-mut lg:text-[11.5px]'

export function KpiRow() {
  const { result, farmInputs, currency, fx, areaUnit, toDisplay } = useResult()
  // Whole cost per ha today: the R$ part plus the US$ costs at their effective dollar and the sc/ha rent.
  const costHa = todayCostBrlHa(farmInputs, fx, result.farmPriceBrl)
  const money = (brl: number | null) => fmtMoney(toDisplay(brl), currency)

  const pct = fmtMarginPct(result.marginPct)
  const goal = farmInputs.targetMargin
  const meets = goal !== null && result.marginPct !== null && result.marginPct >= goal
  const inT = areaUnit === 'tHa'
  const yieldText = inT ? `${fmtLoose(scHaToTHa(farmInputs.yieldScHa))} t/ha` : `${fmtLoose(farmInputs.yieldScHa)} sc/ha`
  const productionText =
    result.productionSc === null
      ? '—'
      : inT
        ? `${fmtLoose(scHaToTHa(result.productionSc))} t`
        : `${fmtLoose(result.productionSc)} sc`

  const barter = normalizeBarter(farmInputs.barterSc)
  const barterText = inT ? `${fmtLoose(scHaToTHa(barter))} t` : `${fmtLoose(barter)} sc`

  return (
    <div data-testid="kpi-row" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 lg:gap-3">
      <div
        data-testid="kpi-margem"
        tabIndex={-1}
        className="relative col-span-2 overflow-hidden rounded-[14px] bg-gradient-to-br from-g8 to-card border border-line px-[15px] py-[13px] text-tx sm:col-span-3 lg:col-span-1"
      >
        <ExplainButton k="margem" label="margem por saca" className={`${btnPos} text-mut`} />
        <small className="block pr-8 text-xs font-medium text-mut">Margem bruta / saca</small>
        <b className="num my-0.5 block whitespace-nowrap text-[32px] font-bold leading-[1.1] tracking-[-0.02em] lg:text-[36px]">
          {money(result.marginPerSc)}
        </b>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-mut">
          <span className="num">{pct}</span>
          <MarginBasePill />
          {goal !== null && result.marginPct !== null && (
            <span>
              · meta {fmtNum(goal * 100, 0)}% {meets ? '✓' : '✗'}
            </span>
          )}
        </span>
      </div>
      <div data-testid="kpi-preco" className={`${base} col-span-2 sm:col-span-1`}>
        <ExplainButton k="precoFazenda" label="preço na fazenda" className={`${btnPos} text-mut`} />
        <small className={small}>Preço na fazenda hoje</small>
        <b className={big}>{money(result.farmPriceBrl)}</b>
        <span className={sub}>por saca · paridade de exportação</span>
      </div>
      <div data-testid="kpi-custo" className={base}>
        <ExplainButton k="custo" label="custo por saca" className={`${btnPos} text-mut`} />
        <small className={small}>Custo por saca</small>
        <b className={big}>{money(result.costPerSc)}</b>
        <span className={sub}>{money(costHa)} /ha</span>
      </div>
      <div data-testid="kpi-total" className={base}>
        <ExplainButton
          k="margemTotal"
          label="margem total da safra"
          className={`${btnPos} text-mut`}
        />
        <small className={small}>Margem total da safra</small>
        <b className={big}>{fmtCompactMoney(toDisplay(result.marginTotal), currency)}</b>
        <span className={sub}>
          {fmtLoose(farmInputs.areaHa)} ha × {yieldText}
          {barter > 0 && ` − ${barterText} de barter`} = {productionText}
        </span>
      </div>
    </div>
  )
}
