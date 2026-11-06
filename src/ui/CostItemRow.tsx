import { useRef, useState } from 'react'
import { allItemsOf } from '../data/costItems'
import type { CostCategoryId } from '../data/types'
import { effectiveFx } from '../engine/calc'
import { SC_HA_ITEM, freshItem } from '../state/costs'
import { useStore } from '../state/StoreProvider'
import type { CostItemPatch, ItemMode } from '../state/types'
import { hasDetail } from './costView'
import { DetailPanel } from './DetailPanel'
import { fmtMoney, fmtNum } from './format'
import { BudgetToggle } from './BudgetToggle'
import { CostFxChoice } from './CostFxChoice'
import { useCostUnit } from './costUnit'
import { NumberField } from './NumberField'
import { Segmented } from './Segmented'
import { useResult } from './useResult'

type Kind = 'BRL' | 'USD' | 'sc'

const usable = (n: number | null): n is number => n !== null && Number.isFinite(n) && n > 0
const round2 = (n: number) => Math.round(n * 100) / 100
const money = (v: number) => (v < 0 ? 'O valor não pode ser negativo.' : null)

/**
 * One item of an opened cost group: "meu valor" / "não uso" (default), a value field in R$/ha or US$/ha (sc/ha for Arrendamento),
 * the dollar chip on US$ values and "Detalhar ›" on Adubação and Defensivos items.
 */
export function CostItemRow({ group, itemId }: { group: CostCategoryId; itemId: string }) {
  const { state, dispatch, snapshot } = useStore()
  const { result, usdBlocked, currency, toDisplay } = useResult()
  // "Hoje" is today's market dollar (the snapshot), not a scenario clicked in the matrix.
  const fx = snapshot.fx.value
  const [detail, setDetail] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const item = state.costGroups[group].items[itemId] ?? freshItem()
  const label = allItemsOf(group).find((i) => i.id === itemId)?.label ?? itemId
  const farm = result.farmPriceBrl
  const isRent = itemId === SC_HA_ITEM
  const kind: Kind = item.unit === 'scHa' ? 'sc' : item.usd !== null && item.valueBrlHa === 0 ? 'USD' : 'BRL'
  const mixed = item.unit === 'ha' && item.usd !== null && item.valueBrlHa > 0
  const set = (patch: CostItemPatch) => dispatch({ type: 'setCostItem', itemId, patch })
  const cu = useCostUnit()
  // Per-ha amounts follow the card's cost unit: /ha, or /t once the producer switched it.
  const show = (brl: number) => `${fmtMoney(toDisplay(cu.show(brl)), currency)}/${cu.suffix}`
  const pair = item.usd ?? state.costFxDefault
  const effFx = effectiveFx(pair.boughtPct, pair.boughtRate, fx)
  // The rate a unit switch needs: the item's effective dollar (R$↔US$) or the farm price (R$↔sc).
  const canSwitch = !usdBlocked && (isRent ? usable(farm) : usable(effFx))
  // A new US$ cost starts open (the market dollar); an item that follows the default dollar keeps following it.
  const ownFx = !item.usd
    ? { boughtPct: 0, boughtRate: 0 }
    : item.usd.followDefault
      ? {}
      : { boughtPct: item.usd.boughtPct, boughtRate: item.usd.boughtRate }

  const modes: { value: ItemMode; label: string }[] = [
    { value: 'valor', label: 'meu valor' },
    { value: 'nao', label: 'não uso' },
  ]

  function chooseMode(mode: ItemMode) {
    set({ mode })
  }

  function chooseKind(next: Kind) {
    if (next === kind || !canSwitch) return
    if (next === 'USD') {
      // Keep the US$ part; the R$ part is converted at the item's effective dollar.
      const usd = item.valueBrlHa / effFx + (item.usd?.amountUsdHa ?? 0)
      set({ mode: 'valor', unit: 'ha', valueBrlHa: 0, usd: { amountUsdHa: round2(usd), ...ownFx } })
    } else if (next === 'sc') {
      set({ mode: 'valor', unit: 'scHa', usd: null, valueBrlHa: round2(item.valueBrlHa / (farm as number)) })
    } else if (kind === 'sc') {
      set({ mode: 'valor', unit: 'ha', usd: null, valueBrlHa: round2(item.valueBrlHa * (farm as number)) })
    } else {
      // Keep the R$ part; the US$ part is converted at the item's effective dollar.
      const brl = item.valueBrlHa + (item.usd ? item.usd.amountUsdHa * effFx : 0)
      set({ mode: 'valor', unit: 'ha', usd: null, valueBrlHa: round2(brl) })
    }
  }

  const kinds: { value: Kind; label: string }[] = isRent
    ? [
        { value: 'BRL', label: 'R$' },
        { value: 'sc', label: 'sc/ha' },
      ]
    : [
        { value: 'BRL', label: 'R$' },
        { value: 'USD', label: 'US$' },
      ]

  return (
    <div data-testid={`item-${itemId}`} className="grid gap-1.5 border-b border-dashed border-line py-2 last:border-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-[13px] font-medium">{label}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<ItemMode> ariaLabel={`Como contar ${label}`} value={item.mode} options={modes} onChange={chooseMode} />
        {item.mode === 'nao' && <span className="num text-xs text-mut">{show(0)}</span>}
        {item.mode === 'valor' && (
          <BudgetToggle
            label={label}
            budgeted={item.budgeted === true}
            onChange={(value) => dispatch({ type: 'setCostBudgeted', group, itemId, value })}
          />
        )}
        {hasDetail(itemId) && (
          <button
            ref={btnRef}
            type="button"
            aria-label={`Detalhar ${label}`}
            onClick={() => setDetail(true)}
            className="ml-auto min-h-[44px] rounded-[9px] border border-line px-3 text-xs font-semibold text-acc md:min-h-[32px]"
          >
            Detalhar ›
          </button>
        )}
      </div>
      {item.mode === 'valor' && (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2">
            <fieldset disabled={!canSwitch} className="m-0 min-w-0 border-0 p-0">
              <legend className="sr-only">Moeda de {label}</legend>
              <Segmented<Kind> ariaLabel={`Moeda de ${label}`} value={kind} options={kinds} onChange={chooseKind} />
            </fieldset>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
              {kind === 'sc' ? (
                <NumberField
                  label={`Valor de ${label} em sc/ha`}
                  labelHidden
                  unit="sc/ha"
                  value={item.valueBrlHa}
                  validate={money}
                  helper={usable(farm) ? `≈ ${show(item.valueBrlHa * farm)} hoje; muda com o preço de cada cenário` : undefined}
                  onCommit={(v) => set({ mode: 'valor', unit: 'scHa', valueBrlHa: v })}
                />
              ) : (
                <>
                  {(kind === 'BRL' || mixed) && (
                    <NumberField
                      label={`Valor de ${label}`}
                      labelHidden
                      unit={cu.labelFor('R$')}
                      value={cu.show(item.valueBrlHa) ?? 0}
                      disabled={usdBlocked}
                      validate={(v) => money(cu.toPerHa(v))}
                      onCommit={(v) => set({ mode: 'valor', valueBrlHa: cu.toPerHa(v) })}
                    />
                  )}
                  {(kind === 'USD' || mixed) && (
                    <NumberField
                      label={`Valor de ${label} em US$`}
                      labelHidden
                      unit={cu.labelFor('US$')}
                      value={cu.show(item.usd?.amountUsdHa ?? 0) ?? 0}
                      disabled={usdBlocked}
                      validate={(v) => money(cu.toPerHa(v))}
                      onCommit={(v) => set({ mode: 'valor', usd: { amountUsdHa: cu.toPerHa(v), ...ownFx } })}
                    />
                  )}
                </>
              )}
            </div>
          </div>
          {!canSwitch && (
            <p className="text-[11px] text-mut">
              {isRent
                ? 'Sem preço na fazenda utilizável: não dá para trocar a unidade agora.'
                : 'Sem dólar utilizável: não dá para trocar a unidade agora.'}
            </p>
          )}
          {item.rows && item.rows.length > 0 && (
            <p className="text-[11px] text-mut">
              Detalhado em {item.rows.length} {item.rows.length === 1 ? 'produto' : 'produtos'}
              {mixed && item.usd ? ` (R$ ${fmtNum(item.valueBrlHa, 0)} + US$ ${fmtNum(item.usd.amountUsdHa, 0)} por ha)` : ''}.
            </p>
          )}
          {item.usd && (
            <CostFxChoice
              label={label}
              fx={fx}
              value={item.usd}
              followsDefault={item.usd.followDefault}
              onChange={(p) => set({ usd: { amountUsdHa: item.usd?.amountUsdHa ?? 0, boughtPct: p.boughtPct, boughtRate: p.boughtRate } })}
            />
          )}
        </div>
      )}
      {detail && <DetailPanel itemId={itemId} trigger={btnRef.current} onClose={() => setDetail(false)} />}
    </div>
  )
}
