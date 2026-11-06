import { useState } from 'react'
import { inputsAtPrice } from '../engine/calc'
import { useStore } from '../state/StoreProvider'
import { validateInput } from '../state/reducer'
import { COST_GROUP_SECTIONS } from '../data/costItems'
import { COST_CATEGORY_IDS } from '../data/types'
import { Card } from './Card'
import { CostGroup } from './CostGroup'
import { groupTodayBrlHa, todayCostBrlHa } from './costView'
import { effectiveFxText, FxPairFields } from './FxChip'
import { fmtMoney } from './format'
import { CostUnitProvider, useCostUnit } from './costUnit'
import { NumberField } from './NumberField'
import { UnitPicker } from './UnitNumberField'
import { Segmented } from './Segmented'
import { UsdNote } from './UsdNote'
import { useResult } from './useResult'

const TOTAL_BLOCKED_NOTE =
  'Não dá para somar os custos em US$/sacas agora: o dólar ou o preço de hoje está indisponível.'

/** Validation message for a converted amount; null BRL means the dollar cannot convert it. */
function checkMoney(key: string, brl: number | null): string | null {
  return brl === null ? 'Dólar indisponível.' : validateInput(key, brl)
}

/** "Dólar dos meus custos em US$": the default for every US$ cost without its own dollar. */
function CostFxDefaultControl() {
  const { state, dispatch, snapshot } = useStore()
  const fx = snapshot.fx.value // today's market dollar
  return (
    <div className="mt-3 rounded-[10px] border border-line bg-surface2 px-3 py-2.5">
      <p className="mb-1.5 text-[12px] font-semibold">Dólar padrão dos meus custos em US$</p>
      <FxPairFields
        value={state.costFxDefault}
        onChange={(v) => dispatch({ type: 'setCostFxDefault', value: v })}
        pctLabel="Já comprado (padrão dos custos em US$)"
        rateLabel="A que dólar (padrão dos custos em US$)"
        pctText="já comprado"
        rateText="a que dólar"
      />
      <p className="mt-1.5 text-[11.5px] text-mut">
        <span className="num font-semibold text-tx">{effectiveFxText(state.costFxDefault, fx)}</span> · vale para todo
        custo em US$ que não tiver o seu próprio dólar. Na matriz, a parte não comprada acompanha o dólar de cada
        coluna.
      </p>
    </div>
  )
}

export function CustoCard() {
  return (
    <CostUnitProvider>
      <CustoCardBody />
    </CostUnitProvider>
  )
}

function CustoCardBody() {
  const { state, dispatch } = useStore()
  const { farmInputs, currency, toDisplay, fromDisplayMoney, usdBlocked, scenario, result, fx } = useResult()
  const cu = useCostUnit()
  const whole = todayCostBrlHa(farmInputs, fx, result.farmPriceBrl)
  // The bars show each group as a share of the whole cost: the sum of the groups, so the shares add up to 100%.
  const groupsTotal = COST_CATEGORY_IDS.reduce(
    (sum, g) => sum + (groupTodayBrlHa(state, g, fx, result.farmPriceBrl) ?? 0),
    0,
  )
  // Same check as the reducer's setCostMode('total'): US$/sc-ha costs need today's dollar and price.
  const needsMarket = state.inputs.costUsd.length > 0 || state.inputs.costScHa > 0
  const wholeToday = needsMarket
    ? inputsAtPrice(state.inputs, scenario.fx, result.farmPriceBrl ?? Number.NaN).costPerHaBrl
    : 0
  const canTotal = !needsMarket || (Number.isFinite(wholeToday) && wholeToday >= 0)
  const [triedTotal, setTriedTotal] = useState(false)
  const showBlocked = triedTotal && state.costMode === 'categorias' && !canTotal

  return (
    <Card
      n={2}
      title="Custo de produção"
      right={
        <Segmented
          ariaLabel="Modo do custo"
          value={state.costMode}
          options={[
            { value: 'total', label: 'Total' },
            { value: 'categorias', label: 'Por categoria' },
          ]}
          onChange={(mode) => {
            setTriedTotal(mode === 'total')
            // Today's dollar and farm price value the US$ costs and the sc/ha rent in the single total.
            dispatch({
              type: 'setCostMode',
              mode,
              fx: scenario.fx,
              farmPriceBrl: result.farmPriceBrl,
            })
          }}
        />
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[12px] text-mut">
        <span>Custos em</span>
        <UnitPicker
          units={cu.units}
          unit={cu.unitId}
          title="Unidade de todos os custos deste card"
          canPick={cu.canPick}
          onPick={cu.setUnit}
        />
        {!cu.canPick('t') && <span>(informe a produtividade para ver por tonelada ou por saca)</span>}
      </div>
      <div data-tour="custo">
        {state.costMode === 'total' ? (
          <>
            <NumberField
              label={cu.fieldLabel}
              unit={cu.unitLabel}
              value={cu.show(toDisplay(farmInputs.costPerHaBrl)) ?? 0}
              disabled={usdBlocked}
              validate={(v) => checkMoney('costPerHaBrl', fromDisplayMoney(cu.toPerHa(v)))}
              onCommit={(v) => {
                const brl = fromDisplayMoney(cu.toPerHa(v))
                if (brl !== null)
                  dispatch({
                    type: 'setInput',
                    key: 'costPerHaBrl',
                    value: brl,
                  })
              }}
            />
            <p className="mt-1.5 text-[11.5px] text-mut">
              Quer mais precisão? Escolha “Por categoria” para ver os 8 grupos, abrir os itens e detalhar a adubação.
            </p>
          </>
        ) : (
          <div className="grid gap-3">
            {COST_GROUP_SECTIONS.map((sec) => (
              <section key={sec.id} aria-labelledby={`custo-sec-${sec.id}`}>
                <h3
                  id={`custo-sec-${sec.id}`}
                  className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-acc"
                >
                  {sec.label}
                </h3>
                {sec.groups.map((g) => (
                  <CostGroup key={g} group={g} totalBrlHa={groupsTotal} />
                ))}
              </section>
            ))}
            <div className="flex items-center justify-between font-bold">
              <span>Total</span>
              <span data-testid="cost-total" className="num text-g7">
                {fmtMoney(cu.show(toDisplay(whole)), currency)} /{cu.suffix}
              </span>
            </div>
            {/* Each US$ cost now has its own dollar; the old shared default only shows for data saved with one. */}
            {(state.costFxDefault.boughtPct > 0 || state.costFxDefault.boughtRate > 0) && <CostFxDefaultControl />}
          </div>
        )}
      </div>
      {showBlocked && (
        <p role="status" className="mt-2 text-[12px] text-danger">
          {TOTAL_BLOCKED_NOTE}
        </p>
      )}
      {usdBlocked && <UsdNote />}
    </Card>
  )
}
