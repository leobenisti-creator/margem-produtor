import { useId, useState } from 'react'
import { allItemsOf } from '../data/costItems'
import { effectiveFx } from '../engine/calc'
import { COST_CATEGORY_LABELS, type CostCategoryId } from '../data/types'
import { validateInput } from '../state/reducer'
import { useStore } from '../state/StoreProvider'
import { BudgetToggle } from './BudgetToggle'
import { CostFxChoice } from './CostFxChoice'
import { CostItemRow } from './CostItemRow'
import { CurrencyToggle } from './CurrencyToggle'
import { groupTodayBrlHa } from './costView'
import { useCostUnit } from './costUnit'
import { NumberField } from './NumberField'
import { useResult } from './useResult'

const ITEMIZED_NOTE = 'Grupo aberto por itens: a moeda e o orçado/realizado são de cada item.'

/**
 * One of the eight cost groups: name, a total R$/ha field that works without
 * opening (typing it puts the group in total mode) and "Abrir ›" to see the items. The group keeps
 * one mode — total or itens — and switching never loses what was typed.
 */
export function CostGroup({ group, totalBrlHa }: { group: CostCategoryId; totalBrlHa?: number }) {
  const { state, dispatch, snapshot } = useStore()
  const { result, fx, toDisplay, fromDisplayMoney, usdBlocked } = useResult()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const label = COST_CATEGORY_LABELS[group]
  const g = state.costGroups[group]
  const cu = useCostUnit()
  const today = groupTodayBrlHa(state, group, fx, result.farmPriceBrl)
  const marketFx = snapshot.fx.value // today's market dollar: the open dollar
  const itemized = g.mode === 'itens'
  const usd = itemized ? null : g.totalUsd
  const usable = Number.isFinite(marketFx) && marketFx > 0
  const round2 = (n: number) => Math.round(n * 100) / 100
  const ownFx = usd && !usd.followDefault ? { boughtPct: usd.boughtPct, boughtRate: usd.boughtRate } : {}
  function chooseCurrency(next: 'BRL' | 'USD') {
    if (next === 'USD') {
      if (today === null || !usable) return
      // The current cost in R$ becomes US$ at today's dollar, and starts open (market dollar).
      dispatch({
        type: 'setGroupTotal',
        group,
        value: {
          usd: {
            amountUsdHa: round2(today / marketFx),
            boughtPct: 0,
            boughtRate: 0,
          },
        },
      })
    } else if (usd) {
      const eff = effectiveFx(usd.boughtPct, usd.boughtRate, marketFx)
      if (!Number.isFinite(eff)) return
      dispatch({
        type: 'setGroupTotal',
        group,
        value: { totalBrlHa: round2(usd.amountUsdHa * eff), usd: null },
      })
    }
  }
  // The bar is this group's share of the whole cost.
  const share = totalBrlHa && totalBrlHa > 0 && today !== null ? Math.min(100, Math.max(0, (today / totalBrlHa) * 100)) : 0

  return (
    <div data-testid={`group-${group}`}>
      <div
        data-testid="cost-row"
        className="grid grid-cols-[minmax(0,1fr)_minmax(104px,132px)_auto] items-center gap-x-2 gap-y-1 border-b border-dashed border-line py-1 sm:grid-cols-[minmax(120px,160px)_minmax(0,1fr)_132px_auto] sm:gap-x-3"
      >
        <div className="grid content-center gap-0.5">
          <span className="text-[13px] font-medium">{label}</span>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <CurrencyToggle
              ariaLabel={`Moeda de ${label}`}
              value={itemized ? null : usd ? 'USD' : 'BRL'}
              disabled={itemized || !usable || usdBlocked}
              title={itemized ? ITEMIZED_NOTE : undefined}
              onChange={chooseCurrency}
            />
            <BudgetToggle
              label={label}
              budgeted={itemized ? null : g.budgeted === true}
              disabled={itemized}
              title={itemized ? ITEMIZED_NOTE : undefined}
              onChange={(value) => dispatch({ type: 'setCostBudgeted', group, value })}
            />
          </div>
        </div>
        <div className="order-last col-span-3 sm:order-none sm:col-span-1">
          <div className="h-2 overflow-hidden rounded-[5px] bg-bar-track" aria-hidden="true">
            <div className="h-full bg-gradient-to-r from-g5 to-mint" style={{ width: `${share}%` }} />
          </div>
        </div>
        <NumberField
          label={label}
          labelHidden
          unit={usd ? cu.labelFor('US$') : cu.unitLabel}
          value={(usd ? cu.show(usd.amountUsdHa) : cu.show(toDisplay(today))) ?? 0}
          disabled={usdBlocked}
          validate={(v) => {
            if (usd) return v < 0 ? 'O valor não pode ser negativo.' : null
            const brl = fromDisplayMoney(cu.toPerHa(v))
            return brl === null ? 'Dólar indisponível.' : validateInput('category', brl)
          }}
          onCommit={(v) => {
            if (usd) {
              dispatch({
                type: 'setGroupTotal',
                group,
                value: { usd: { amountUsdHa: cu.toPerHa(v), ...ownFx } },
              })
              return
            }
            const brl = fromDisplayMoney(cu.toPerHa(v))
            if (brl !== null)
              dispatch({
                type: 'setGroupTotal',
                group,
                value: { totalBrlHa: brl, usd: null },
              })
          }}
        />
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${open ? 'Fechar' : 'Abrir'} ${label}`}
          onClick={() => setOpen((o) => !o)}
          className="min-h-[44px] whitespace-nowrap rounded-[9px] px-1.5 text-xs font-semibold text-acc md:min-h-[32px]"
        >
          {open ? 'Fechar ‹' : 'Abrir ›'}
        </button>
      </div>
      {usd && (
        <CostFxChoice
          label={label}
          fx={marketFx}
          value={usd}
          followsDefault={usd.followDefault}
          onChange={(p) =>
            dispatch({
              type: 'setGroupTotal',
              group,
              value: {
                usd: {
                  amountUsdHa: usd.amountUsdHa,
                  boughtPct: p.boughtPct,
                  boughtRate: p.boughtRate,
                },
              },
            })
          }
        />
      )}
      {open && (
        <div id={panelId} className="mb-2 rounded-b-[10px] border-x border-b border-line bg-surface2 px-3 pb-1 pt-2">
          {g.mode === 'total' ? (
            <p className="text-pretty text-[11.5px] text-mut">
              Usando o total digitado para o grupo. Mude um item, ou{' '}
              <button
                type="button"
                onClick={() => dispatch({ type: 'setCostGroupMode', group, mode: 'itens' })}
                className="min-h-[44px] font-semibold text-acc underline underline-offset-2 md:min-h-[28px]"
              >
                some pelos itens
              </button>
              .
            </p>
          ) : (
            <p className="text-pretty text-[11.5px] text-mut">
              Total do grupo = soma dos itens que você preencher; o que ficar em &quot;não uso&quot; conta zero.
            </p>
          )}
          {allItemsOf(group).map((it) => (
            <CostItemRow key={it.id} group={group} itemId={it.id} />
          ))}
        </div>
      )}
    </div>
  )
}
