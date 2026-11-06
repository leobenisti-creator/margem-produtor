import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { groupOfItem } from '../data/costItems'
import {
  CUSTOM_PRODUCT_ID,
  FERTILIZERS,
  exchangeRatio,
  type Fertilizer,
  rowCostPerHa,
  scPerTon,
  type DoseUnit,
  type PriceUnit,
  type ProductRow,
} from '../engine/products'
import { effectiveFx } from '../engine/calc'
import { copyRow } from '../state/costs'
import { effectiveFxText } from './FxChip'
import { useStore } from '../state/StoreProvider'
import { CellNumber } from './CellNumber'
import { fmtNum } from './format'
import { fmtCompactMoney } from './fmtExtra'
import { useResult } from './useResult'

export type ProductKind = 'adubo' | 'defensivo'

const selectCls =
  'min-h-[44px] w-full min-w-0 rounded-[9px] border border-line-strong bg-surface2 px-2 text-sm font-semibold disabled:text-mut md:min-h-[38px]'
const btn = 'min-h-[44px] rounded-[9px] border px-3 text-xs font-semibold md:min-h-[38px]'

const PRICE_UNITS: { value: PriceUnit; label: string }[] = [
  { value: 't', label: 'por t' },
  { value: 'kg', label: 'por kg' },
  { value: 'L', label: 'por L' },
  { value: 'ha', label: 'por ha' },
]
const DOSE_UNITS: DoseUnit[] = ['kg', 't', 'L']

export function blankRow(kind: ProductKind, id: string): ProductRow {
  return kind === 'adubo'
    ? { id, productId: null, name: '', dose: 0, doseUnit: 'kg', price: 0, priceUnit: 't', currency: 'BRL', applications: 1 }
    : { id, productId: null, name: '', dose: 0, doseUnit: 'L', price: 0, priceUnit: 'L', currency: 'BRL', applications: 1 }
}

const usable = (n: number) => Number.isFinite(n) && n > 0

/**
 * R$ per tonne of the product for the "sc/t" exchange; null when not priced per t/kg. The freight
 * is added only on rows priced per t, exactly like the row cost (`rowCostPerHa`).
 */
function perTonBrl(r: ProductRow, fx: number, freight: number): number | null {
  if (!usable(r.price) || (r.priceUnit !== 't' && r.priceUnit !== 'kg')) return null
  const rate = r.currency === 'USD' ? fx : 1
  if (!usable(rate)) return null
  if (r.priceUnit === 'kg') return r.price * rate * 1000
  return r.price * rate + (freight > 0 ? freight : 0)
}

/** Select value of a created formula ("custom:<name>"). */
export const formulaId = (name: string) => `custom:${name}`

/** Formulas carried by stored rows (so a reopened panel still offers them). */
export function formulasFromRows(rows: ProductRow[] | null | undefined): Fertilizer[] {
  const out: Fertilizer[] = []
  for (const r of rows ?? []) {
    if (r.productId === CUSTOM_PRODUCT_ID && r.custom && !out.some((f) => f.id === formulaId(r.name))) {
      out.push({ id: formulaId(r.name), name: r.name, ...r.custom })
    }
  }
  return out
}

/** Tonnes per ha the freight applies to (rows priced per t, dose by mass). */
function freightTons(r: ProductRow): number {
  if (r.priceUnit !== 't' || r.doseUnit === 'L' || !usable(r.dose) || !usable(r.price)) return 0
  return r.doseUnit === 't' ? r.dose : r.dose / 1000
}

/** Splits the rows into the item's R$ part and US$ part (R$/ha and US$/ha). */
export function splitRows(rows: ProductRow[], freight: number): { brl: number; usd: number; priced: number } {
  let brl = 0
  let usd = 0
  let priced = 0
  for (const r of rows) {
    if (r.currency === 'BRL') {
      const c = rowCostPerHa(r, 1, freight)
      if (c !== null) {
        brl += c
        priced++
      }
    } else {
      const c = rowCostPerHa(r, 1, 0)
      if (c !== null) {
        usd += c
        priced++
        brl += freightTons(r) * (freight > 0 ? freight : 0)
      }
    }
  }
  return { brl, usd, priced }
}

/**
 * Product table of an Adubação or Defensivos item: price unit per row (t, kg, L, ha), currency
 * per row, optional freight R$/t, exchange in sc/t and sc/ha. Prices are never pre-filled.
 */
export function ProductTable({
  itemId,
  kind,
  initialRows,
  onDone,
  rows: rowsProp,
  onRowsChange,
  freight: freightProp,
  onFreightChange,
  formulas = [],
}: {
  itemId: string
  kind: ProductKind
  initialRows?: ProductRow[]
  onDone?: () => void
  /** Controlled rows (the Adubação panel keeps them across its two modes). */
  rows?: ProductRow[]
  onRowsChange?: Dispatch<SetStateAction<ProductRow[]>>
  freight?: number
  onFreightChange?: (v: number) => void
  /** Formulas created in this panel ("Criar fórmula"). */
  formulas?: Fertilizer[]
}) {
  const { state, dispatch, snapshot } = useStore()
  const { result, farmInputs, usdBlocked } = useResult()
  const group = groupOfItem(itemId)
  const item = group ? state.costGroups[group].items[itemId] : undefined
  const seq = useRef(0)
  const nextId = () => `p-${Date.now().toString(36)}-${++seq.current}`
  const [innerRows, setInnerRows] = useState<ProductRow[]>(() => {
    const start = initialRows ?? item?.rows ?? null
    return start && start.length > 0 ? start.map(copyRow) : [blankRow(kind, nextId())]
  })
  const rows = rowsProp ?? innerRows
  const setRows = onRowsChange ?? setInnerRows
  const [custom, setCustom] = useState<Set<string>>(
    () => new Set(rows.filter((r) => r.productId === null && r.name !== '').map((r) => r.id)),
  )
  const [innerFreight, setInnerFreight] = useState(item?.freightBrlTon ?? 0)
  const freight = freightProp ?? innerFreight
  const setFreight = onFreightChange ?? setInnerFreight
  // US$ rows use this item's effective dollar: its bought share and rate (or the default) with
  // today's market dollar.
  const todayFx = snapshot.fx.value
  const pair = item?.usd ?? state.costFxDefault
  const fx = effectiveFx(pair.boughtPct, pair.boughtRate, todayFx)
  const allFormulas = [...formulas, ...formulasFromRows(rows).filter((f) => !formulas.some((g) => g.id === f.id))]
  const farm = result.farmPriceBrl

  const patch = (id: string, p: Partial<ProductRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)))
  /** Replaces the product of a row (built-in, created formula or a typed name). */
  const setProduct = (id: string, v: string) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.id !== id) return r
        const base: ProductRow = { ...r }
        delete base.custom
        const f = FERTILIZERS.find((x) => x.id === v)
        if (f) return { ...base, productId: f.id, name: f.name }
        const c = allFormulas.find((x) => x.id === v)
        if (c) return { ...base, productId: CUSTOM_PRODUCT_ID, name: c.name, custom: { n: c.n, p2o5: c.p2o5, k2o: c.k2o } }
        return { ...base, productId: null, name: '' }
      }),
    )

  const costs = rows.map((r) => rowCostPerHa(r, fx, freight))
  const priced = costs.filter((c): c is number => c !== null)
  const total = priced.length > 0 ? priced.reduce((a, b) => a + b, 0) : null
  const unpriced = rows.filter((r, i) => costs[i] === null && (r.dose > 0 || r.name !== '' || r.productId !== null)).length
  const sc = total === null || farm === null ? null : exchangeRatio(total, farm)

  function use() {
    const parts = splitRows(rows, freight)
    if (parts.priced === 0 || usdBlocked) return
    const own = item?.usd && !item.usd.followDefault ? { boughtPct: item.usd.boughtPct, boughtRate: item.usd.boughtRate } : {}
    dispatch({
      type: 'setCostItem',
      itemId,
      patch: {
        mode: 'valor',
        unit: 'ha',
        valueBrlHa: parts.brl,
        usd: parts.usd > 0 ? { amountUsdHa: parts.usd, ...own } : null,
        rows: rows.map(copyRow),
        freightBrlTon: freight,
      },
    })
    onDone?.()
  }

  return (
    <div className="grid gap-3">
      <p className="text-pretty text-[12px] text-mut">
        O app não tem fonte de preço de {kind === 'adubo' ? 'adubo' : 'defensivo'}: digite os seus preços.
      </p>
      <p data-testid="detail-fx" className="text-pretty text-[12px] text-mut">
        Linhas em US$ usam o dólar deste custo:{' '}
        <span className="num font-semibold text-tx">{effectiveFxText(pair, todayFx)}</span>.
      </p>
      <div className="sm:max-w-[60%]">
        <span className="mb-0.5 block text-xs font-medium text-mut">Frete e entrega até a fazenda (opcional)</span>
        <CellNumber
          label="Frete até a fazenda (R$/t)"
          unit="R$/t"
          value={freight}
          emptyWhenZero
          placeholder="opcional"
          disabled={usdBlocked}
          onChange={setFreight}
        />
      </div>

      <ol className="grid gap-2.5">
        {rows.map((r, i) => {
          const n = i + 1
          const cost = costs[i]
          const perTon = perTonBrl(r, fx, freight)
          const sct = perTon === null || farm === null ? null : scPerTon(perTon, farm)
          const isCustom = custom.has(r.id)
          const showDose = r.priceUnit !== 'ha'
          const showApps = kind === 'defensivo' || r.doseUnit === 'L'
          return (
            <li
              key={r.id}
              data-testid="product-row"
              className="grid gap-2 rounded-[10px] border border-line p-2.5"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                {kind === 'adubo' ? (
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    <select
                      aria-label={`Produto ${n}`}
                      className={selectCls}
                      value={
                        r.productId === CUSTOM_PRODUCT_ID ? formulaId(r.name) : (r.productId ?? (isCustom ? 'outro' : ''))
                      }
                      onChange={(e) => {
                        const v = e.target.value
                        setCustom((s) => {
                          const next = new Set(s)
                          if (v === 'outro') next.add(r.id)
                          else next.delete(r.id)
                          return next
                        })
                        setProduct(r.id, v)
                      }}
                    >
                      <option value="">Escolha o produto</option>
                      {FERTILIZERS.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                      {allFormulas.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} (fórmula própria)
                        </option>
                      ))}
                      <option value="outro">Outro produto (digite o nome)</option>
                    </select>
                    {isCustom && (
                      <input
                        type="text"
                        aria-label={`Nome do produto ${n}`}
                        value={r.name}
                        placeholder="ex.: calcário"
                        onChange={(e) => patch(r.id, { name: e.target.value })}
                        className={`${selectCls} font-normal`}
                      />
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    aria-label={`Nome do produto ${n}`}
                    value={r.name}
                    placeholder="nome do produto"
                    onChange={(e) => patch(r.id, { name: e.target.value })}
                    className={`${selectCls} font-normal`}
                  />
                )}
                {rows.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remover produto ${n}`}
                    onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
                    className={`${btn} min-w-[44px] border-line text-mut`}
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {showDose && (
                  <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_84px] gap-1 sm:col-span-1">
                    <CellNumber label={`Dose do produto ${n}`} value={r.dose} onChange={(v) => patch(r.id, { dose: v })} />
                    <select
                      aria-label={`Unidade da dose do produto ${n}`}
                      className={selectCls}
                      value={r.doseUnit}
                      onChange={(e) => patch(r.id, { doseUnit: e.target.value as DoseUnit })}
                    >
                      {DOSE_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}/ha
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_84px] gap-1 sm:col-span-1">
                  <CellNumber
                    label={`Preço do produto ${n}`}
                    value={r.price}
                    emptyWhenZero
                    placeholder="preço"
                    disabled={usdBlocked}
                    onChange={(v) => patch(r.id, { price: v })}
                  />
                  <select
                    aria-label={`Unidade do preço do produto ${n}`}
                    className={selectCls}
                    value={r.priceUnit}
                    onChange={(e) => patch(r.id, { priceUnit: e.target.value as PriceUnit })}
                  >
                    {PRICE_UNITS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
                <select
                  aria-label={`Moeda do produto ${n}`}
                  className={selectCls}
                  value={r.currency}
                  onChange={(e) => patch(r.id, { currency: e.target.value === 'USD' ? 'USD' : 'BRL' })}
                >
                  <option value="BRL">R$</option>
                  <option value="USD">US$</option>
                </select>
                {showApps && showDose && (
                  <CellNumber
                    label={`Aplicações do produto ${n}`}
                    unit="aplic."
                    maxDecimals={0}
                    value={r.applications}
                    onChange={(v) => patch(r.id, { applications: v })}
                  />
                )}
              </div>

              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[12px] text-mut">
                <span>
                  Por sc/t:{' '}
                  <b data-testid="row-sct" className="num text-tx">
                    {fmtNum(sct, 1)}
                  </b>
                </span>
                <span>
                  Custo:{' '}
                  <b data-testid="row-cost" className="num text-tx">
                    {cost === null ? '—' : `R$ ${fmtNum(cost, 0)}`}
                  </b>
                  {cost !== null && ' /ha'}
                </span>
              </div>
            </li>
          )
        })}
      </ol>

      <button
        type="button"
        onClick={() => setRows((rs) => [...rs, blankRow(kind, nextId())])}
        className={`${btn} justify-self-start border-line text-acc`}
      >
        <span aria-hidden="true">＋ </span>Adicionar produto
      </button>

      <dl className="grid gap-1 rounded-[10px] border border-line bg-card px-3 py-2 text-[13px]">
        <div className="flex justify-between gap-3">
          <dt>Custo do item</dt>
          <dd data-testid="detail-total" className="num font-bold">
            {total === null ? '—' : `R$ ${fmtNum(total, 0)}/ha`}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Custo da área ({fmtNum(farmInputs.areaHa, 0)} ha)</dt>
          <dd data-testid="detail-area" className="num">
            {total === null ? '—' : fmtCompactMoney(total * farmInputs.areaHa, 'BRL')}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Em sacas (a {farm === null ? '—' : `R$ ${fmtNum(farm, 2)}`})</dt>
          <dd data-testid="detail-sc" className="num">
            {sc === null ? '—' : `${fmtNum(sc, 1)} sc/ha`}
          </dd>
        </div>
      </dl>
      {unpriced > 0 && (
        <p className="text-[12px] text-acc">
          {unpriced === 1 ? '1 produto sem preço fica' : `${unpriced} produtos sem preço ficam`} de fora da conta.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={use}
          disabled={total === null || usdBlocked}
          className={`${btn} border-acc bg-acc text-accink disabled:border-line disabled:bg-surface2 disabled:text-mut`}
        >
          Usar no meu custo
        </button>
      </div>
    </div>
  )
}
