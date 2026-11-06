import { ChangePulse } from './resultsMotion'
import { Fragment } from 'react'
import { COST_CATEGORY_IDS, COST_CATEGORY_LABELS } from '../data/types'
import { CROPS } from '../engine/crops'
import { hedgeBreakdown } from '../engine/hedge'
import { productionOf } from '../engine/production'
import { trancheSc, trancheBrlAt } from '../engine/sales'
import { useStore } from '../state/StoreProvider'
import { categoriesInEffect } from './costBreakdown'
import { groupTodayBrlHa, todayCostBrlHa } from './costView'
import { fmtMoney, fmtNum } from './format'
import { fmtMarginPct, fmtSignedMoney } from './fmtExtra'
import { PriceCompare } from './PriceCompare'
import { useResultsUnit } from './resultsUnit'
import { useResult } from './useResult'
import { useSales } from './useSales'

interface Line {
  key: string
  label: string
  /** Total in R$ for the whole farm (the unit switch divides it). */
  total: number | null
  tone: 'pos' | 'neg'
  detail?: string
}

/**
 * Always-visible mini DRE of the chosen scenario (the active matrix cell): revenue (each sale already made, then
 * the open volume at the scenario price) → costs (by category) → result. The unit is the page's (per sack, per
 * hectare or the whole crop, see resultsUnit); money follows the top currency. Ends with the collapsed comparison of
 * the farm price against the praça's market price.
 */
export function MiniDre() {
  const { state } = useStore()
  const { result, farmInputs, scenario, currency, toDisplay } = useResult()
  const { summary, productionSc } = useSales()
  const { unit: per } = useResultsUnit()

  const area = farmInputs.areaHa
  const price = result.farmPriceBrl
  // Net production of the farm inputs (barter out), so a simulated yield also moves the DRE.
  const simulated = productionOf(farmInputs)
  const production =
    Number.isFinite(simulated) && simulated > 0
      ? simulated
      : productionSc !== null && productionSc > 0
        ? productionSc
        : null
  // The whole crop divides by 1; per sack by the production, per hectare by the area.
  const denom =
    per === 'total'
      ? 1
      : production === null
        ? null
        : per === 'sc'
          ? production
          : area > 0
            ? area
            : null
  const perText = per === 'total' ? '' : `/${per}`
  const digits = per === 'total' ? 0 : 2
  const shown = (total: number | null) => (total === null || denom === null ? null : toDisplay(total / denom))

  // Revenue: every valid sale, one by one, then what is still open at the scenario's farm price.
  const bushels = CROPS[state.crop].bushelsPerSack
  const soldLines: Line[] = summary.validTranches.map((t, i) => {
    const sc = trancheSc(t, bushels)
    // A US$ sale with the dollar open follows the dollar of the scenario shown, like the margin curves do.
    const p = trancheBrlAt(t, scenario.fx)
    return {
      key: t.id,
      label: `Venda ${i + 1}`,
      total: p === null ? null : sc * p,
      tone: 'pos',
      detail: `${fmtNum(sc, 0)} sc a ${fmtMoney(toDisplay(p), currency)}/sc`,
    }
  })
  const soldSc = summary.validTranches.reduce((s, t) => s + trancheSc(t, bushels), 0)
  const openSc = production === null ? null : Math.max(production - soldSc, 0)
  const openLine: Line = {
    key: 'aberto',
    label: soldLines.length > 0 ? 'Em aberto' : 'Produção',
    total: openSc === null || price === null ? null : openSc * price,
    tone: 'pos',
    detail:
      openSc === null
        ? undefined
        : `${fmtNum(openSc, 0)} sc ao preço do cenário (${fmtMoney(toDisplay(price), currency)}/sc)`,
  }
  // Market operations (futures, options, accumulators) at the scenario, in two lines that only show when they are not
  // zero: the profit or loss (in the revenue) and the cost of the operations, premiums paid or received and fees (in
  // the costs). Each has one sub-line per operation.
  const hedgeParts = farmInputs.hedge ? hedgeBreakdown(farmInputs.hedge, scenario.cbotUsc, scenario.fx) : []
  const nonZero = (n: number) => Number.isFinite(n) && Math.abs(n) >= 0.005
  const resultParts = hedgeParts.filter((p) => nonZero(p.resultBrl))
  const costParts = hedgeParts.filter((p) => nonZero(p.premiumBrl))
  const hedgeResultSum = resultParts.reduce((s, p) => s + p.resultBrl, 0)
  /** Cost of the operations: positive = paid (premiums and fees), negative = premiums received. */
  const opsCost = -costParts.reduce((s, p) => s + p.premiumBrl, 0)
  const hedgeLine: Line | null =
    resultParts.length === 0
      ? null
      : {
          key: 'hedge',
          label: 'Lucro/prejuízo das operações financeiras',
          total: hedgeResultSum,
          tone: hedgeResultSum < 0 ? 'neg' : 'pos',
        }
  const hedgeSubLines: Line[] = resultParts.map((p) => ({
    key: `hedge-${p.id}`,
    label: p.label ?? p.id,
    total: p.resultBrl,
    tone: p.resultBrl < 0 ? 'neg' : 'pos',
  }))
  const opsCostLine: Line | null =
    costParts.length === 0
      ? null
      : {
          key: 'hedgecost',
          label:
            opsCost >= 0
              ? 'Custo das operações financeiras (prêmios e taxas)'
              : 'Prêmios recebidos nas operações financeiras',
          // A premium received reduces the costs: shown as a positive amount with a + sign.
          total: Math.abs(opsCost),
          tone: opsCost >= 0 ? 'neg' : 'pos',
        }
  const opsCostSubLines: Line[] = costParts.map((p) => ({
    key: `hedgecost-${p.id}`,
    label: p.label ?? p.id,
    total: Math.abs(p.premiumBrl),
    tone: p.premiumBrl < 0 ? 'neg' : 'pos',
    detail: p.premiumBrl < 0 ? 'pago' : 'recebido',
  }))
  const revenueLines = [...soldLines, openLine, ...(hedgeLine ? [hedgeLine] : [])]
  const revenue = revenueLines.every((l) => l.total !== null)
    ? revenueLines.reduce((s, l) => s + (l.total as number), 0)
    : null

  // Costs: by category when the farm detailed them, otherwise the single total; at the scenario dollar and price.
  const fx = scenario.fx
  const wholeHa = todayCostBrlHa(farmInputs, fx, price)
  // By category while the categories are what the producer typed; a single typed total is one line.
  const groupHa = !categoriesInEffect(state) ? [] : COST_CATEGORY_IDS.map((g) => ({ g, ha: groupTodayBrlHa(state, g, fx, price) }))
  const sumHa = groupHa.reduce((acc, x) => acc + (x.ha !== null && x.ha > 0 ? x.ha : 0), 0)
  const splitFactor = state.costMode === 'categorias' || sumHa <= 0 || wholeHa === null ? 1 : wholeHa / sumHa
  const catLines: Line[] = groupHa.flatMap(({ g, ha }) =>
    ha !== null && ha > 0
      ? [{ key: g, label: COST_CATEGORY_LABELS[g], total: ha * splitFactor * area, tone: 'neg' as const }]
      : [],
  )
  const productionLines: Line[] =
    catLines.length > 0
      ? catLines
      : [{ key: 'custo', label: 'Custo de produção', total: wholeHa === null ? null : wholeHa * area, tone: 'neg' }]
  const costLines: Line[] = [...productionLines, ...(opsCostLine ? [opsCostLine] : [])]
  const costs = wholeHa === null ? null : wholeHa * area + (opsCostLine ? opsCost : 0)
  const resultTotal = revenue === null || costs === null ? null : revenue - costs
  const marginPct = revenue !== null && revenue > 0 && resultTotal !== null ? resultTotal / revenue : null
  // What the result would be without the market operations (profit or loss and cost both out).
  const hasOps = hedgeLine !== null || opsCostLine !== null
  const revenueWithout = revenue === null ? null : revenue - (hedgeLine ? hedgeResultSum : 0)
  const resultWithout =
    revenueWithout === null || costs === null ? null : revenueWithout - (costs - (opsCostLine ? opsCost : 0))
  const marginWithout =
    revenueWithout !== null && revenueWithout > 0 && resultWithout !== null ? resultWithout / revenueWithout : null

  // What the producer changed that moves these numbers: the scenario, the unit, the currency, the crop and the result itself.
  const pulseSignature = [state.crop, per, currency, scenario.cbotUsc, scenario.fx, scenario.basisUsc, revenue, costs, resultTotal].join('|')
  const top = Math.max(revenue ?? 0, costs ?? 0, 1e-9)
  const bar = (total: number | null, tone: 'pos' | 'neg' | 'final') => {
    const w = total === null || !Number.isFinite(total) ? 0 : Math.min(Math.max(Math.abs(total) / top, 0), 1) * 100
    const color = tone === 'pos' ? 'bg-bar-pos' : tone === 'neg' ? 'bg-bar-neg' : 'bg-bar-final'
    return (
      <span className="relative h-3 rounded-md bg-bar-track" aria-hidden="true">
        <i
          className={`absolute inset-y-0 left-0 rounded-md transition-[width] duration-300 ease-out motion-reduce:transition-none ${color}`}
          style={{ width: `${w}%` }}
        />
      </span>
    )
  }
  const row = (l: Line, sign: string, testId = 'dre-value') => (
    <div
      key={l.key}
      role="listitem"
      className="grid grid-cols-[minmax(110px,190px)_minmax(0,1fr)_auto] items-center gap-2 text-xs"
    >
      <span className="text-pretty">
        {sign} {l.label}
        {l.detail && <span className="block text-[10.5px] text-mut">{l.detail}</span>}
      </span>
      {bar(l.total, l.tone)}
      <span
        data-testid={testId}
        className={`num min-w-[72px] whitespace-nowrap text-right${l.total !== null && l.total < 0 && l.key.startsWith('hedge') ? ' text-danger' : ''}`}
      >
        {fmtSignedMoney(shown(l.total), currency, digits)}
      </span>
    </div>
  )
  const totalRow = (label: string, total: number | null, tone: 'pos' | 'neg' | 'final', testId: string) => (
    <div
      role="listitem"
      className="grid grid-cols-[minmax(110px,190px)_minmax(0,1fr)_auto] items-center gap-2 border-t border-line pt-1 text-xs font-semibold"
    >
      <span>= {label}</span>
      {bar(total, tone)}
      <b data-testid={testId} className={`num min-w-[72px] whitespace-nowrap text-right${total !== null && total < 0 ? ' text-danger' : ''}`}>
        {fmtSignedMoney(shown(total), currency, digits)}
      </b>
    </div>
  )
  const heading = 'mt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-mut'

  return (
    <section
      data-testid="mini-dre"
      aria-label="Resultado do cenário"
      className="rounded-[14px] border border-line bg-card px-4 py-3"
    >
      <h2 className="text-base font-bold">De onde vem o resultado</h2>
      <p className="mb-2.5 text-[13px] text-mut">Receita menos custos no cenário mostrado.</p>
      {denom === null && (
        <p className="mb-1 text-[11.5px] text-acc">Informe área e produtividade para ver o resultado.</p>
      )}
      <ChangePulse signature={pulseSignature} testId="dre-pulso">
      <div className="grid gap-1.5" role="list" aria-label="DRE do cenário">
        <p className={heading}>Receita</p>
        {revenueLines.map((l) => (
          <Fragment key={l.key}>
            {row(l, '+')}
            {l.key === 'hedge' && hedgeSubLines.map((s) => row(s, '·', 'dre-hedge-op'))}
          </Fragment>
        ))}
        {totalRow('Receita total', revenue, 'pos', 'dre-revenue')}
        <p className={heading}>Custos</p>
        {costLines.map((l) => (
          <Fragment key={l.key}>
            {row(l, l.key === 'hedgecost' && opsCost < 0 ? '+' : '−')}
            {l.key === 'hedgecost' && opsCostSubLines.map((s) => row(s, '·', 'dre-hedge-cost'))}
          </Fragment>
        ))}
        {totalRow('Custos totais', costs, 'neg', 'dre-costs')}
        {totalRow(
          resultTotal !== null && resultTotal < 0 ? 'Prejuízo' : 'Resultado (margem bruta)',
          resultTotal,
          resultTotal !== null && resultTotal < 0 ? 'neg' : 'final',
          'dre-result',
        )}
      </div>
      <p className="num mt-1.5 text-[11.5px] text-mut">
        margem {fmtMarginPct(marginPct)} · {fmtSignedMoney(shown(resultTotal), currency, digits)}{perText}
      </p>
      {hasOps && (
        <p data-testid="dre-sem-operacoes" className="num mt-0.5 text-[11.5px] text-mut">
          sem as operações financeiras: margem {fmtMarginPct(marginWithout)} ·{' '}
          {fmtSignedMoney(shown(resultWithout), currency, digits)}{perText}
        </p>
      )}
      </ChangePulse>
      <PriceCompare />
    </section>
  )
}
