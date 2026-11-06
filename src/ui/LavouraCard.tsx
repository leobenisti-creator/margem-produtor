import { useState } from 'react'
import { barterProblem, grossProductionOf, productionOf } from '../engine/production'
import { useStore } from '../state/StoreProvider'
import { validateInput } from '../state/reducer'
import { scHaToTHa, tHaToScHa } from '../engine/units'
import { Card } from './Card'
import { FobMarketPrice } from './FobMarketPrice'
import { FobSelect } from './FobSelect'
import { NumberField } from './NumberField'
import { fmtNum } from './format'
import { UnitNumberField } from './UnitNumberField'
import { useResult } from './useResult'

const YIELD_UNITS = [
  { id: 'scHa', label: 'sc/ha' },
  { id: 'tHa', label: 't/ha' },
]

/**
 * "Realizou operação barter": the sacks of this crop delivered to the reseller. They leave the crop, so the production
 * used by every calculation is area × productivity less these sacks. A plain input: it persists immediately. Costs stay
 * as typed, so the producer is asked to leave out the inputs he pays with these sacks.
 */
function BarterBlock() {
  const { state, dispatch } = useStore()
  const barter = state.barterSc[state.crop]
  const gross = grossProductionOf(state.inputs)
  const net = productionOf(state.inputs)
  const [open, setOpen] = useState(barter > 0)
  const hasGross = Number.isFinite(gross) && gross > 0
  const over = barter > 0 && hasGross && barter > gross

  if (!open && barter <= 0) {
    return (
      <div className="mt-2.5">
        <button
          type="button"
          data-testid="barter-open"
          onClick={() => setOpen(true)}
          className="min-h-[44px] rounded-[9px] border border-line-strong px-3 text-xs font-semibold text-mut hover:text-tx md:min-h-[38px]"
        >
          Realizou operação barter
        </button>
      </div>
    )
  }

  return (
    <div data-testid="barter-block" className="mt-2.5 max-w-sm">
      <NumberField
        label="Sacas que você vai entregar à revendedora (barter)"
        unit="sc"
        value={barter}
        maxDecimals={0}
        validate={(v) => barterProblem(v, gross)}
        onCommit={(v) => dispatch({ type: 'setBarterSc', value: v })}
        helper="Digite o custo da lavoura sem os insumos que você vai pagar com essas sacas."
      />
      {barter > 0 && hasGross && (
        <p data-testid="barter-confirm" className="num mt-1 text-[12.5px] font-semibold text-tx">
          Produção para as contas: {fmtNum(net, 0)} sc (de {fmtNum(gross, 0)} sc)
        </p>
      )}
      {over && (
        <p data-testid="barter-over" className="mt-1 text-[11.5px] font-semibold text-acc">
          As sacas do barter passam da produção da lavoura (a área ou a produtividade foi reduzida?): a produção para as
          contas fica em 0.
        </p>
      )}
      <button
        type="button"
        data-testid="barter-clear"
        onClick={() => {
          dispatch({ type: 'setBarterSc', value: 0 })
          setOpen(false)
        }}
        className="mt-1 min-h-[44px] text-xs font-semibold text-mut underline underline-offset-2 hover:text-tx md:min-h-[32px]"
      >
        Remover barter
      </button>
    </div>
  )
}

export function LavouraCard() {
  const { state, dispatch } = useStore()
  const { farmInputs, areaUnit } = useResult()
  const inT = areaUnit === 'tHa'

  return (
    <Card n={1} title="Sua lavoura">
      <div className="grid gap-2.5 sm:grid-cols-3">
        <div data-tour="praca">
          <label htmlFor="ponto-fob" className="mb-0.5 block text-xs font-medium text-mut">
            Praça
          </label>
          <FobSelect
            id="ponto-fob"
            className="min-h-[44px] w-full rounded-[9px] border border-line-strong bg-surface2 px-2 text-base font-semibold md:min-h-[38px] md:text-sm"
          />
        </div>
        <div data-tour="area">
          <NumberField
            label="Área plantada"
            unit="ha"
            value={farmInputs.areaHa}
            validate={(v) => validateInput('areaHa', v)}
            onCommit={(v) => dispatch({ type: 'setInput', key: 'areaHa', value: v })}
          />
        </div>
        <div data-tour="produtividade">
          <UnitNumberField
            label="Produtividade"
            units={YIELD_UNITS}
            unit={areaUnit}
            convert={(v, from, to) => (from === to ? v : to === 'tHa' ? scHaToTHa(v) : tHaToScHa(v))}
            onUnitChange={(next) => dispatch({ type: 'setAreaUnit', unit: next as 'scHa' | 'tHa' })}
            value={inT ? scHaToTHa(farmInputs.yieldScHa) : farmInputs.yieldScHa}
            validate={(v) => validateInput('yieldScHa', inT ? tHaToScHa(v) : v)}
            onCommit={(v) =>
              dispatch({
                type: 'setInput',
                key: 'yieldScHa',
                value: inT ? tHaToScHa(v) : v,
              })
            }
          />
        </div>
      </div>
      <BarterBlock key={state.crop} />
      <FobMarketPrice key={`${state.fobId}-${state.crop}`} />
    </Card>
  )
}
