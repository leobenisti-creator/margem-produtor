import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { CROPS } from '../engine/crops'
import { soldAvgPriceAt, trancheDollar, trancheProblem, trancheSc, type SaleTranche } from '../engine/sales'
import { useStore } from '../state/StoreProvider'
import type { SalePatch } from '../state/types'
import { CurrencyToggle } from './CurrencyToggle'
import { DocumentOverlay } from './DocumentOverlay'
import { effectiveFxText } from './FxChip'
import { fmtBrl, fmtMoney, fmtNum, fmtUsd } from './format'
import { NumberField } from './NumberField'
import { Segmented } from './Segmented'
import { useResult } from './useResult'
import { applySalePatch, saleRoomSc } from '../state/sales'
import { BARTER_TAKES_ALL_TEXT, lacksProduction, NO_PRODUCTION_TEXT, useSales } from './useSales'

const usable = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

/** Price per sack in the other currency at `fx` (R$/US$); null without a usable dollar. */
function convertPrice(v: number, from: string, to: string, fx: number | null): number | null {
  if (from === to) return v
  if (!usable(fx)) return null
  return to === 'USD' ? v / fx : v * fx
}
const caption = 'mb-0.5 block text-xs font-medium text-mut'
/** The engine's reason for a volume of 0 (same text, so the row can hold it until the field is touched). */
const VOLUME_PROBLEM = trancheProblem({
  id: '',
  volume: 0,
  volumeUnit: 'sc',
  price: 1,
  priceCurrency: 'BRL',
  dollar: null,
})

type FxMode = 'aberto' | 'fixado'

/**
 * The form of ONE sale: a new one ("Nova venda") or a saved one being edited ("Venda 2"). It works on a draft the
 * parent holds: nothing reaches the numbers until "Salvar".
 */
function TrancheRow({
  t,
  title,
  ofRow,
  reason,
  onPatch,
  onSave,
  saveLabel,
  saveDisabled,
  onLeave,
  leaveLabel,
  leaveAria,
}: {
  t: SaleTranche
  /** "Nova venda" or "Venda 2". */
  title: string
  /** The same, for the field labels: "nova venda" or "venda 2". */
  ofRow: string
  reason: string | null
  onPatch: (p: SalePatch) => void
  onSave: () => void
  saveLabel: string
  saveDisabled: boolean
  /** Throws the draft away ("Remover" on a new sale) or leaves the edit ("Cancelar"). */
  onLeave: () => void
  leaveLabel: string
  leaveAria: string
}) {  const usd = t.priceCurrency === 'USD'
  // A sale without its own dollar uses today's market dollar (not a matrix scenario).
  const { state, snapshot } = useStore()
  const marketFx = snapshot.fx.value
  const bushelsPerSack = CROPS[state.crop].bushelsPerSack
  // The sales never pass the production: this row can hold at most what the others leave free.
  const { productionSc } = useSales()
  const room = saleRoomSc(state.sales, t.id, productionSc, bushelsPerSack)
  // A fresh row starts at volume 0: its volume error waits until the field is edited or left.
  const [volumeTouched, setVolumeTouched] = useState(false)
  const shown = reason === VOLUME_PROBLEM && !volumeTouched ? null : reason
  // "Câmbio fixado" chosen but the rate not typed yet: nothing is stored, the sale counts as open.
  const [wantsFixed, setWantsFixed] = useState(false)
  const fxMode: FxMode = t.dollar !== null || wantsFixed ? 'fixado' : 'aberto'
  const openFx = usable(t.marketDollar) ? t.marketDollar : marketFx
  return (
    <fieldset data-sale-id={t.id} className="rounded-[12px] border border-line-strong bg-card px-3 pb-3 pt-1">
      <legend className="px-1 text-[12px] font-bold">{title}</legend>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <div>
          <div className="flex items-center sm:min-h-[30px]">
            <span className={caption} aria-hidden="true">
              Sacas vendidas
            </span>
          </div>
          <div onBlur={() => setVolumeTouched(true)}>
            <NumberField
              label={`Sacas vendidas (${ofRow})`}
              labelHidden
              unit="sc"
              // Tranches saved in t or bu show (and are rewritten) in sacks.
              value={trancheSc(t, bushelsPerSack)}
              min={0}
              validate={(v) =>
                room !== null && v > room + 1e-9
                  ? `Não dá para vender mais que a produção: ${room > 0 ? `restam ${fmtNum(room, 0)} sc` : 'já está tudo vendido'}.`
                  : null
              }
              onCommit={(v) => {
                setVolumeTouched(true)
                onPatch({ volume: v, volumeUnit: 'sc' })
              }}
            />
          </div>
        </div>
        <div>
          <div className="mb-0.5 flex items-center justify-between gap-2">
            <span className="block text-xs font-medium text-mut" aria-hidden="true">
              Preço por saca
            </span>
            <CurrencyToggle
              ariaLabel={`Moeda do preço (${ofRow})`}
              value={t.priceCurrency}
              onChange={(cur) => {
                // The sale's own dollar converts R$ and US$; until it is typed, the market dollar does.
                const converted = convertPrice(t.price, t.priceCurrency, cur, trancheDollar(t) ?? marketFx)
                setWantsFixed(false)
                onPatch({
                  priceCurrency: cur,
                  ...(converted === null ? {} : { price: converted }),
                  // A US$ sale starts with the dollar open; today's market dollar is saved for the empty field.
                  ...(cur === 'USD'
                    ? {
                        dollar: null,
                        ...(!usable(t.marketDollar) && usable(marketFx) ? { marketDollar: marketFx } : {}),
                      }
                    : {}),
                })
              }}
            />
          </div>
          <NumberField
            label={`Preço por saca (${ofRow})`}
            labelHidden
            unit={usd ? 'US$/sc' : 'R$/sc'}
            value={t.price}
            min={0}
            onCommit={(v) => onPatch({ price: v })}
          />
        </div>
      </div>
      {usd && (
        <div
          role="group"
          aria-label={`Dólar da ${ofRow}`}
          className="mt-2.5 rounded-[10px] border border-line bg-surface2 px-2.5 py-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<FxMode>
              ariaLabel={`Câmbio (${ofRow})`}
              value={fxMode}
              options={[
                { value: 'aberto', label: 'Câmbio aberto' },
                { value: 'fixado', label: 'Câmbio fixado' },
              ]}
              onChange={(next) => {
                if (next === 'aberto') {
                  setWantsFixed(false)
                  onPatch({ dollar: null })
                } else if (t.dollar === null) {
                  setWantsFixed(true)
                }
              }}
            />
            {fxMode === 'fixado' && (
              <NumberField
                label={`A que dólar (${ofRow})`}
                labelHidden
                unit="R$/US$"
                maxDecimals={4}
                value={t.dollar ?? 0}
                validate={(v) => (v <= 0 ? 'O dólar deve ser maior que zero.' : null)}
                onCommit={(v) => {
                  if (v > 0) {
                    setWantsFixed(false)
                    onPatch({ dollar: v })
                  }
                }}
              />
            )}
          </div>
          {fxMode === 'fixado' && t.dollar === null && (
            <p className="mt-1 text-[11.5px] text-acc">Informe a que dólar foi fixado; até lá conta como aberto.</p>
          )}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-mut">
            <span data-testid="fx-effective" className="num font-semibold text-tx">
              {effectiveFxText(
                t.dollar === null ? { boughtPct: 0, boughtRate: 0 } : { boughtPct: 1, boughtRate: t.dollar },
                openFx ?? Number.NaN,
              )}
            </span>
            <span>
              {t.dollar === null
                ? '· câmbio aberto: segue o dólar de mercado e fica exposto'
                : '· câmbio fixado: não muda com o mercado'}
            </span>
          </p>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className={`text-[11.5px] ${shown ? 'text-acc' : 'text-mut'}`}>{shown ?? ''}</p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label={leaveAria}
            onClick={onLeave}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-[9px] border border-line px-3 text-xs text-mut hover:text-tx md:min-h-[36px]"
          >
            <X aria-hidden="true" size={16} strokeWidth={1.75} /> {leaveLabel}
          </button>
          <button
            type="button"
            disabled={saveDisabled}
            onClick={onSave}
            className="min-h-[44px] rounded-[9px] border border-g7 bg-g7/15 px-4 text-xs font-bold text-g7 enabled:hover:bg-g7/25 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-[36px]"
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </fieldset>
  )
}

/** Sold %, weighted price and the production notes (the same box in the Total and Detalhar views). */
function SalesSummaryBox() {
  const { tranches, productionSc, barterSc, grossProductionSc, summary } = useSales()
  const { currency, toDisplay, scenario, crop } = useResult()
  if (tranches.length === 0) return null
  // The average follows the currency toggle, like step 3 (US$ at the scenario dollar).
  // The average follows the dollar of the scenario for the US$ sales that left the dollar open.
  const avg = fmtMoney(toDisplay(soldAvgPriceAt(tranches, scenario.fx, crop.bushelsPerSack)), currency)
  const summaryText = `Vendido ${fmtNum(summary.soldPct * 100, 1)}% (${fmtNum(summary.soldSc, 0)} sc) · preço médio ${
    avg === '—' ? '—' : `${avg}/sc`
  }`
  return (
    <div className="rounded-[12px] border border-line bg-card px-3 py-2.5" aria-live="polite">
      <p data-testid="sales-summary" className="num text-[13px] font-bold">
        {summaryText}
      </p>
      {productionSc !== null && productionSc > 0 && (
        <p className="mt-0.5 text-[11.5px] text-mut">
          Produção estimada: {fmtNum(productionSc, 0)} sc{' '}
          {barterSc > 0 ? '(área × produtividade − barter).' : '(área × produtividade).'}
        </p>
      )}
      {lacksProduction(productionSc) ? (
        <p data-testid="sales-no-production" className="mt-1 text-[11.5px] font-semibold text-acc">
          {barterSc > 0 && grossProductionSc !== null ? BARTER_TAKES_ALL_TEXT : NO_PRODUCTION_TEXT}
        </p>
      ) : (
        summary.overProduction && (
          <p data-testid="sales-over" className="mt-1 text-[11.5px] font-semibold text-acc">
            As vendas passam da produção estimada (a área ou a produtividade foi reduzida?). Reduza as vendas: a conta
            usa 100% vendido.
          </p>
        )
      )}
      {!lacksProduction(productionSc) && !summary.overProduction && summary.soldPct >= 0.9999 && (
        <p data-testid="sales-full" className="mt-1 text-[11.5px] text-mut">
          100% da produção vendida: não dá para vender mais que isso.
        </p>
      )}
    </div>
  )
}

const ghostButton = 'min-h-[44px] rounded-[9px] border border-g7 px-3 text-xs font-semibold text-g7 md:min-h-[38px]'
const quietButton =
  'min-h-[44px] rounded-[9px] border border-line px-3 text-xs text-mut hover:text-tx md:min-h-[36px]'

/** The fields of a sale as a patch (for `addSale` / `updateSale`). */
function saleFields(t: SaleTranche): SalePatch {
  return {
    volume: t.volume,
    volumeUnit: t.volumeUnit,
    price: t.price,
    priceCurrency: t.priceCurrency,
    dollar: t.dollar,
    ...(t.marketDollar !== undefined ? { marketDollar: t.marketDollar } : {}),
  }
}

/** One line about a saved sale: "12.000 sc a R$ 130,00/sc" (US$: with its dollar, fixed or open). */
function saleLine(t: SaleTranche, bushelsPerSack: number): { main: string; fx: string | null } {
  const sc = `${fmtNum(trancheSc(t, bushelsPerSack), 0)} sc`
  if (t.priceCurrency === 'BRL') return { main: `${sc} a ${fmtBrl(t.price)}/sc`, fx: null }
  const fx = t.dollar !== null ? `dólar fixado a R$ ${fmtNum(t.dollar, 4)}` : 'dólar aberto (segue o mercado)'
  return { main: `${sc} a ${fmtUsd(t.price)}/sc`, fx }
}

/**
 * The document of the sales already reported ("Vendas já realizadas"), laid over the page: the summary and one line
 * per sale. A sale can be edited (the change only counts after "Salvar alterações") or removed (after a confirmation).
 */
function SalesDocument({ onClose, returnFocus }: { onClose: () => void; returnFocus: () => HTMLElement | null }) {
  const { state, dispatch } = useStore()
  const { tranches: all, summary } = useSales()
  // The sales not saved yet are still forms on the page: the document is the saved ones.
  const tranches = all.filter((t) => t.saved !== false)
  const bushelsPerSack = CROPS[state.crop].bushelsPerSack
  const [editing, setEditing] = useState<SaleTranche | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const reasons = new Map(summary.invalid.map((i) => [i.id, i.reason]))
  const editingProblem = editing ? trancheProblem(editing) : null

  return (
    <DocumentOverlay
      title="Vendas já realizadas"
      kicker="Vendas da safra"
      onClose={onClose}
      returnFocus={returnFocus}
      testId="sales-document"
    >
      <SalesSummaryBox />
      {tranches.length === 0 && (
        <p className="rounded-[12px] border border-dashed border-line-strong px-3 py-3 text-mut">
          Nenhuma venda salva. Feche este documento e use “Adicionar venda”.
        </p>
      )}
      <ol className="grid gap-2.5">
        {tranches.map((t, i) => {
          const n = i + 1
          if (editing?.id === t.id) {
            return (
              <li key={t.id}>
                <TrancheRow
                  t={editing}
                  title={`Venda ${n}`}
                  ofRow={`venda ${n}`}
                  reason={editingProblem}
                  onPatch={(p) => setEditing((cur) => (cur ? (applySalePatch(cur, p) ?? cur) : cur))}
                  saveLabel="Salvar alterações"
                  saveDisabled={editingProblem !== null}
                  onSave={() => {
                    dispatch({ type: 'updateSale', id: t.id, patch: saleFields(editing) })
                    setEditing(null)
                  }}
                  leaveLabel="Cancelar"
                  leaveAria={`Cancelar a edição da venda ${n}`}
                  onLeave={() => setEditing(null)}
                />
              </li>
            )
          }
          const line = saleLine(t, bushelsPerSack)
          const problem = reasons.get(t.id) ?? null
          return (
            <li
              key={t.id}
              data-sale-id={t.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-line bg-card px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="num text-[13px] font-semibold">
                  <span className="text-mut">Venda {n} · </span>
                  {line.main}
                </p>
                {line.fx && <p className="num mt-0.5 text-[11.5px] text-mut">{line.fx}</p>}
                {problem && <p className="mt-0.5 text-[11.5px] text-acc">Incompleta: {problem}</p>}
              </div>
              {removing === t.id ? (
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Remover a venda ${n}?`}>
                  <span className="text-[12px] font-semibold">Remover esta venda?</span>
                  <button
                    type="button"
                    aria-label={`Confirmar a remoção da venda ${n}`}
                    onClick={() => {
                      dispatch({ type: 'removeSale', id: t.id })
                      setRemoving(null)
                    }}
                    className="min-h-[44px] rounded-[9px] border border-danger px-3 text-xs font-semibold text-danger md:min-h-[36px]"
                  >
                    Sim, remover
                  </button>
                  <button type="button" aria-label={`Manter a venda ${n}`} onClick={() => setRemoving(null)} className={quietButton}>
                    Não
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Editar venda ${n}`}
                    onClick={() => {
                      setRemoving(null)
                      setEditing({ ...t })
                    }}
                    className={quietButton}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    aria-label={`Remover venda ${n}`}
                    onClick={() => {
                      setEditing(null)
                      setRemoving(t.id)
                    }}
                    className={quietButton}
                  >
                    Remover
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ol>
      <p className="text-[11.5px] text-mut">
        Para mudar uma venda, use Editar e depois Salvar alterações: sem salvar, nada muda nos números.
      </p>
    </DocumentOverlay>
  )
}

/**
 * The sales card of the Comercialização tab. Default: what was already sold (the summary) and an "Adicionar venda"
 * button with its context. A new sale is a form on the page that already counts in the numbers while the app is open,
 * but is not kept: "Salvar venda" keeps it, and it then leaves the page and goes to the document "Vendas já
 * realizadas" (button at the top right), where it can be edited or removed. Unsaved sales are gone on the next visit.
 */
export function SalesSection() {
  const { dispatch } = useStore()
  const { tranches, summary } = useSales()
  const [docOpen, setDocOpen] = useState(false)
  const addBtn = useRef<HTMLButtonElement>(null)
  const docBtn = useRef<HTMLButtonElement>(null)
  const formsBox = useRef<HTMLDivElement>(null)
  const unsaved = tranches.filter((t) => t.saved === false)
  const savedCount = tranches.length - unsaved.length
  const reasons = new Map(summary.invalid.map((i) => [i.id, i.reason]))

  // A new form takes the focus on its first field; when a form leaves (saved or removed) the focus goes back to "Adicionar venda".
  const before = useRef(unsaved.length)
  useEffect(() => {
    const was = before.current
    before.current = unsaved.length
    if (unsaved.length > was) {
      const forms = formsBox.current?.querySelectorAll('fieldset')
      forms?.[forms.length - 1]?.querySelector<HTMLInputElement>('input')?.focus()
    } else if (unsaved.length < was) addBtn.current?.focus()
  }, [unsaved.length])

  const add = () => dispatch({ type: 'addSale', partial: { saved: false } })

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 basis-60 text-pretty text-[12.5px] text-mut">
          Reporte aqui as vendas que você já fez da safra: sacas e preço por saca, em R$ ou US$. O % vendido e o preço
          médio entram na matriz e nos números da página.
        </p>
        <button
          ref={docBtn}
          type="button"
          aria-haspopup="dialog"
          onClick={() => setDocOpen(true)}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-[9px] border border-line-strong bg-card px-3 text-xs font-semibold text-tx hover:border-g7 md:min-h-[36px]"
        >
          Vendas já realizadas
          <span
            aria-hidden="true"
            className="num grid min-w-[20px] place-items-center rounded-full bg-surface2 px-1.5 text-[11px] font-bold text-mut"
          >
            {savedCount}
          </span>
        </button>
      </div>

      <SalesSummaryBox />

      {unsaved.length > 0 && (
        <div ref={formsBox} className="grid gap-2.5">
          {unsaved.map((t, k) => {
            const name = unsaved.length === 1 ? 'nova venda' : `nova venda ${k + 1}`
            const reason = reasons.get(t.id) ?? null
            return (
              <TrancheRow
                key={t.id}
                t={t}
                title={name.charAt(0).toUpperCase() + name.slice(1)}
                ofRow={name}
                reason={reason}
                onPatch={(patch) => dispatch({ type: 'updateSale', id: t.id, patch })}
                saveLabel="Salvar venda"
                saveDisabled={reason !== null}
                onSave={() => dispatch({ type: 'updateSale', id: t.id, patch: { saved: true } })}
                leaveLabel="Remover"
                leaveAria={`Remover ${name}`}
                onLeave={() => dispatch({ type: 'removeSale', id: t.id })}
              />
            )
          })}
        </div>
      )}

      {tranches.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-line-strong px-3 py-3.5">
          <p className="text-[13px] font-semibold text-tx">Você ainda não reportou nenhuma venda.</p>
          <p className="mt-0.5 text-mut">
            Se já vendeu parte da safra, adicione a venda: pode ser uma só, com o total, ou várias.
          </p>
          <button ref={addBtn} type="button" className={`${ghostButton} mt-2.5`} onClick={add}>
            Adicionar venda
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-line bg-surface2 px-3 py-2.5">
          <p className="min-w-0 flex-1 basis-56 text-mut">
            {unsaved.length > 0
              ? 'Ela já conta nos números, mas só fica guardada depois de “Salvar venda”.'
              : 'Fez mais alguma venda? Adicione e ela soma ao total acima.'}
          </p>
          <button ref={addBtn} type="button" className={ghostButton} onClick={add}>
            Adicionar venda
          </button>
        </div>
      )}

      {docOpen && <SalesDocument onClose={() => setDocOpen(false)} returnFocus={() => docBtn.current} />}
    </div>
  )
}
