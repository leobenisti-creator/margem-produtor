import { useState } from 'react'
import { referencePriceBrl } from '../engine/calc'
import { OUTRO_FOB_ID } from '../data/fobPoints'
import { fobBasisUsc } from '../state/basis'
import { useStore } from '../state/StoreProvider'
import { fmtMoney } from './format'
import { FreightFields } from './FreightFields'
import { useResult } from './useResult'

/**
 * Under the FOB selector: the estimated market price of the chosen point (not a live quote) and the premium,
 * freight to the port and port fees to adjust. Most people edit them, so they open as soon as a point is chosen
 * (the component remounts per point); "Usar preço de mercado" drops the premium override and folds them away,
 * "Editar" brings them back. The formula is unchanged.
 */
export function FobMarketPrice() {
  const { state, dispatch } = useStore()
  const { crop, scenario, currency, toDisplay } = useResult()
  const [open, setOpen] = useState(true)
  // Market price at the point's own premium (no override), with the scenario's CBOT and dollar.
  const market = toDisplay(referencePriceBrl(crop, { ...scenario, basisUsc: fobBasisUsc(state) }))
  const edited = state.overrides.basisUsc !== undefined
  // "Outro" has no market price to compare with: just the three numbers to type.
  if (state.fobId === OUTRO_FOB_ID) {
    return (
      <div className="mt-3 rounded-[10px] border border-line bg-surface2 px-3 py-2.5">
        <FreightFields />
      </div>
    )
  }
  return (
    <div className="mt-3 rounded-[10px] border border-line bg-surface2 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px]">
          <span className="text-mut">Preço de mercado (estimado): </span>
          <b data-testid="fob-market-price" className="num">
            {fmtMoney(market, currency)}/sc
          </b>
          <span className="block text-[11px] text-mut">
            Estimativa com a bolsa e o dólar do cenário e o prêmio da praça — não é cotação ao vivo.
          </span>
        </p>
        <div className="flex items-center gap-2">
          {open ? (
            <button
              type="button"
              onClick={() => {
                if (edited) dispatch({ type: 'override', key: 'basisUsc', value: null })
                setOpen(false)
              }}
              className="inline-flex min-h-[44px] items-center rounded-full border border-line-strong px-3 text-[12px] font-semibold md:min-h-[32px]"
            >
              Usar preço de mercado
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex min-h-[44px] items-center rounded-full border border-g7 px-3 text-[12px] font-semibold text-g7 md:min-h-[32px]"
            >
              Editar
            </button>
          )}
        </div>
      </div>
      {open && <FreightFields />}
    </div>
  )
}
