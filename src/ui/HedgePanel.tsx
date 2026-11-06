import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { fixingDates, todayIso } from '../engine/calendar'
import { CROPS } from '../engine/crops'
import {
  hedgeOpMoney,
  hedgeOpProblem,
  LOT_SIZE,
  lotSizeOf,
  opStatus,
  opsForCrop,
  type HedgeAsset,
  type HedgeOp,
  type HedgeSide,
  type HedgeSpec,
} from '../engine/hedge'
import type { Scenario } from '../engine/calc'
import { applyHedgePatch } from '../state/hedge'
import { useStore } from '../state/StoreProvider'
import type { HedgeOpPatch } from '../state/types'
import { Card } from './Card'
import { DocumentOverlay } from './DocumentOverlay'
import { fmtBrl, fmtNum } from './format'
import {
  AccumFields,
  BarrierFields,
  CloseFields,
  DateFields,
  MoreOptions,
  OpTypeMenu,
  StatusLine,
  opTypePatch,
} from './HedgeOpExtras'
import { NumberField } from './NumberField'
import { Segmented } from './Segmented'
import { useExposure } from './useExposure'
import { useHedgeSpec } from './useHedgeSpec'
import { useResult } from './useResult'

const SIDE_OPTIONS: { value: HedgeSide; label: string }[] = [
  { value: 'vendido', label: 'Vendido' },
  { value: 'comprado', label: 'Comprado' },
]
const FX_MODES = [
  { value: 'aberto', label: 'Aberto' },
  { value: 'fixado', label: 'Fixado' },
]
type FxMode = 'aberto' | 'fixado'

const caption = 'mb-0.5 block text-xs font-medium text-mut'

/** Number with up to 1 decimal, no trailing zeros ("83,3", "5"). */
function short(n: number): string {
  const s = fmtNum(n, 1)
  return s.includes(',') ? s.replace(/,?0+$/, '') : s
}
/** "5 mi", "83,3 mil" or "750". */
function compact(n: number): string {
  if (n >= 1e6) return `${short(n / 1e6)} mi`
  if (n >= 1e3) return `${short(n / 1e3)} mil`
  return short(n)
}
/** Price with no trailing zeros ("1.250", "1.250,5"). */
function plain(n: number): string {
  const s = fmtNum(n, 2)
  return s.includes(',') ? s.replace(/,?0+$/, '') : s
}
/** Dollar rate with at least 2 decimals ("5,40", "5,4998"). */
function rate(n: number): string {
  return fmtNum(n, 4).replace(/(,\d{2}\d*?)0+$/, '$1')
}

/** One plain-language line for a valid operation. */
export function hedgeSummary(op: HedgeOp, bushelsPerSack: number): string {
  const soja = op.asset === 'soja'
  const what = soja ? 'CBOT' : 'dólar'
  const protects = (op.kind === 'futuro' && op.side === 'vendido') || (op.kind === 'put' && op.side === 'comprado')
  const gains = (op.kind === 'futuro' && op.side === 'comprado') || (op.kind === 'call' && op.side === 'comprado')
  const lots = op.qty / lotSizeOf(op)
  const lotsText = `${short(lots)} ${lots === 1 ? 'lote' : 'lotes'}`
  const qty = soja
    ? `${lotsText} (${compact(op.qty / bushelsPerSack)} sc, ${compact(op.qty)} bu)`
    : `${lotsText} (US$ ${compact(op.qty)})`
  const amount = soja ? `${compact(op.qty / bushelsPerSack)} sc` : `US$ ${compact(op.qty)}`
  const effect = protects
    ? op.kind === 'futuro' && !soja
      ? `trava o dólar de ${amount}`
      : `protege o ${what} de ${amount}`
    : gains
      ? `ganha se o ${what} subir`
      : 'recebe o prêmio e assume o risco'
  const price = soja ? `${plain(op.strike)} US¢/bu` : `R$ ${rate(op.strike)}`
  const side = op.side === 'vendido' ? 'Vendido' : 'Comprado'
  if (op.kind === 'futuro') return `${side} ${qty} a ${price} — ${effect}`
  const barrier = op.barrier
    ? `, ${op.barrier.type === 'ko' ? 'knock-out' : 'knock-in'} em ${plain(op.barrier.price)} US¢/bu (de ${op.barrier.dir})`
    : ''
  if (op.kind === 'accumulator') {
    const perFixing = `${lotsText} por fixing (${compact(op.qty / bushelsPerSack)} sc, ${compact(op.qty)} bu)`
    const floor = !op.barrier && op.floorLevel !== undefined ? `, piso ${plain(op.floorLevel)} US¢/bu` : ''
    const kind = op.barrier ? 'Accumulator com knock-out' : 'Accumulator floor/ceiling'
    return `${kind} vendido ${perFixing}, nível de melhoria ${price}${floor}${barrier} — vende a ${price} a cada fixing (no piso, se o mercado fechar nele ou abaixo)`
  }
  const prem = soja ? `${plain(op.premium)} US¢/bu` : `R$ ${rate(op.premium)}`
  const kind = op.kind === 'put' ? 'Put' : 'Call'
  return `${kind} ${op.side} ${qty}, strike ${price}, prêmio ${prem}${barrier} — ${effect}`
}

function HedgeRow({
  op,
  n,
  bushelsPerSack,
  spec,
  scenario,
  today,
  todayDate,
  onPatch,
  onSave,
  saveLabel,
  saveAria,
  onLeave,
  leaveLabel,
  leaveAria,
  unsaved = false,
}: {
  op: HedgeOp
  n: number
  bushelsPerSack: number
  spec: HedgeSpec | undefined
  scenario: Scenario
  /** Today's market (CBOT of the crop and dollar), null when unusable. */
  today: { cbotUsc: number; fx: number } | null
  /** ISO date of today (business days and the closing date start from it). */
  todayDate: string
  onPatch: (p: HedgeOpPatch) => void
  /** "Salvar operação" (a new one) or "Salvar alterações" (a saved one being edited). */
  onSave: () => void
  saveLabel: string
  saveAria: string
  /** Removes the new operation ("Remover") or leaves the edit ("Cancelar"). */
  onLeave: () => void
  leaveLabel: string
  leaveAria: string
  /** A new operation: counts in the numbers but is not kept until it is saved. */
  unsaved?: boolean
}) {
  const soja = op.asset === 'soja'
  const { state } = useStore()
  // The crop's own CBOT ("Soja (CBOT)", "Milho (CBOT)"); the stored asset id stays 'soja' for the crop's contracts.
  const assetOptions: { value: HedgeAsset; label: string }[] = [
    { value: 'soja', label: `${CROPS[state.crop].label} (CBOT)` },
    { value: 'dolar', label: 'Dólar' },
  ]
  const [fxMode, setFxMode] = useState<FxMode>(op.fxFixed !== null ? 'fixado' : 'aberto')
  const fixado = soja && (fxMode === 'fixado' || op.fxFixed !== null)
  const problem = hedgeOpProblem(op)
  const option = op.kind === 'put' || op.kind === 'call'
  const accumulator = op.kind === 'accumulator'
  const priceName = op.kind === 'futuro' ? 'Preço' : accumulator ? 'Nível de melhoria' : 'Strike'
  const lotSize = lotSizeOf(op)
  // The accumulator is typed as TOTAL lots; the app divides them by the fixings of the schedule.
  const fixingsCount =
    accumulator && op.accum && op.startDate && op.maturityDate
      ? fixingDates(op.startDate, op.maturityDate, op.accum.frequency, op.accum.day).length
      : 0
  const lotsShown = accumulator
    ? (op.accum?.totalLots ?? (fixingsCount > 0 ? (op.qty * fixingsCount) / lotSize : 0))
    : op.qty / lotSize
  const [editingLot, setEditingLot] = useState(false)
  const status = spec && !problem ? opStatus(op, spec) : null
  const realizedBrl = spec && !problem ? hedgeOpMoney(op, spec, scenario.cbotUsc, scenario.fx).realizedBrl : 0
  // The part still open valued at today's market (not at the scenario the producer may have changed).
  const mtmBrl = spec && !problem && today ? hedgeOpMoney(op, spec, today.cbotUsc, today.fx).projectedBrl : null
  const priceUnit = soja ? 'US¢/bu' : 'R$/US$'
  const priceDecimals = soja ? 2 : 4

  return (
    <fieldset data-hedge-id={op.id} className="rounded-[12px] border border-line bg-card px-3 pb-3 pt-1">
      <legend className="px-1 text-[12px] font-bold">Operação {n}</legend>
      {unsaved && (
        <p className="mb-1 text-[11.5px] font-semibold text-acc">
          Ainda não salva: já conta nos números, mas só fica guardada depois de “Salvar operação”.
        </p>
      )}
      <div className="grid gap-2.5 sm:grid-cols-3">
        <div>
          <span className={caption} aria-hidden="true">
            Ativo
          </span>
          <Segmented
            ariaLabel={`Ativo da operação ${n}`}
            value={op.asset}
            options={assetOptions}
            onChange={(asset) => {
              if (asset === op.asset) return
              // Units differ (bushels x US$): start the numbers over instead of reinterpreting them.
              setFxMode('aberto')
              onPatch({ asset, qty: 0, strike: 0, premium: 0, fxFixed: null })
            }}
          />
        </div>
        <div>
          <span className={caption} aria-hidden="true">
            Tipo
          </span>
          <OpTypeMenu n={n} asset={op.asset} op={op} onPick={(id) => onPatch(opTypePatch(id, op))} />
        </div>
        <div>
          <span className={caption} aria-hidden="true">
            Lado
          </span>
          {accumulator ? (
            <p className="pt-2 text-xs font-bold">Vendido (o accumulator é sempre do lado vendido)</p>
          ) : (
            <Segmented
              ariaLabel={`Lado da operação ${n}`}
              value={op.side}
              options={SIDE_OPTIONS}
              onChange={(side) => onPatch({ side })}
            />
          )}
        </div>
      </div>

      <DateFields n={n} op={op} today={todayDate} onPatch={onPatch} />

      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
        <div>
          <span className={caption} aria-hidden="true">
            {accumulator ? 'Quantidade total (lotes)' : 'Quantidade (lotes)'}
          </span>
          <NumberField
            key={`qty-${op.asset}`}
            label={`Quantidade da operação ${n}`}
            labelHidden
            unit="lotes"
            // The accumulator total may be fractional: it also follows from the lots per fixing the producer types.
            maxDecimals={accumulator ? 2 : 0}
            // The stored number stays in bushels / US$: only the typed number is in lots.
            value={lotsShown}
            min={0}
            validate={(v) => (accumulator || Number.isInteger(v) ? null : 'Informe um número inteiro de lotes.')}
            onCommit={(v) =>
              onPatch(
                accumulator
                  ? { accum: { ...(op.accum ?? { frequency: 'semanal' }), totalLots: v } }
                  : { qty: v * lotSize },
              )
            }
          />
          <p data-testid={`hedge-lot-${n}`} className="num mt-1 text-[11.5px] text-mut">
            {soja
              ? `1 lote = ${fmtNum(lotSize, 0)} bu (≈ ${fmtNum(lotSize / bushelsPerSack, 0)} sc)`
              : `1 lote = US$ ${fmtNum(lotSize, 0)}`}
            {op.qty > 0 &&
              !accumulator &&
              (soja
                ? ` · total ${fmtNum(op.qty, 0)} bu (≈ ${fmtNum(op.qty / bushelsPerSack, 0)} sc)`
                : ` · total US$ ${fmtNum(op.qty, 0)}`)}
            {op.qty > 0 &&
              accumulator &&
              fixingsCount > 0 &&
              ` · ${fixingsCount} fixings: ${plain(op.qty / lotSize)} ${op.qty / lotSize === 1 ? 'lote' : 'lotes'} por fixing (≈ ${fmtNum(op.qty / bushelsPerSack, 0)} sc, ${fmtNum(op.qty, 0)} bu)`}
          </p>
          {accumulator && fixingsCount > 0 && (
            <div className="mt-1.5">
              <span className={caption} aria-hidden="true">
                Lotes por fixing (calculado; edite se for outro)
              </span>
              <NumberField
                label={`Lotes por fixing da operação ${n}`}
                labelHidden
                unit="lotes"
                maxDecimals={2}
                value={op.qty / lotSize}
                min={0}
                // Typing it fixes the quantity per fixing; the total then follows from the number of fixings.
                onCommit={(v) => {
                  const { totalLots, ...rest } = op.accum ?? { frequency: 'semanal' as const }
                  void totalLots
                  onPatch({ qty: v * lotSize, accum: rest })
                }}
              />
            </div>
          )}
          <div className="mt-1">
            {!editingLot && (
              <button
                type="button"
                aria-label={`Editar tamanho do contrato da operação ${n}`}
                onClick={() => setEditingLot(true)}
                className="min-h-[44px] rounded-[6px] px-1 text-[11.5px] font-semibold text-acc hover:underline md:min-h-[36px]"
              >
                {op.lotSize !== undefined ? 'Tamanho do contrato editado: alterar' : 'Editar tamanho do contrato'}
              </button>
            )}
            {editingLot && (
              <div className="rounded-[10px] border border-line bg-surface2 px-2.5 py-2">
                <span className={caption} aria-hidden="true">
                  Tamanho do contrato
                </span>
                <NumberField
                  label={`Tamanho do contrato da operação ${n}`}
                  labelHidden
                  unit={soja ? 'bu' : 'US$'}
                  maxDecimals={0}
                  value={lotSize}
                  validate={(v) => (v > 0 ? null : 'O tamanho do contrato deve ser maior que zero.')}
                  // The number of lots stays; the total follows the new contract size.
                  onCommit={(v) => v > 0 && onPatch({ lotSize: v, qty: (op.qty / lotSize) * v })}
                />
                <p className="mt-1 text-[11.5px] text-mut">
                  {soja
                    ? 'Padrão CBOT: 5.000 bu. Digite outro tamanho para contrato mini ou de balcão.'
                    : 'Padrão B3: US$ 50.000 (cheio) ou US$ 10.000 (mini). Em NDF ou balcão, digite o valor do seu contrato.'}
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {op.lotSize !== undefined && (
                    <button
                      type="button"
                      aria-label={`Voltar ao tamanho padrão do contrato da operação ${n}`}
                      onClick={() => onPatch({ lotSize: null, qty: (op.qty / lotSize) * LOT_SIZE[op.asset] })}
                      className="min-h-[44px] rounded-[6px] border border-line px-2 text-[11.5px] text-mut hover:text-tx md:min-h-[36px]"
                    >
                      Voltar ao padrão
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Fechar a edição do tamanho do contrato da operação ${n}`}
                    onClick={() => setEditingLot(false)}
                    className="min-h-[44px] rounded-[6px] border border-line px-2 text-[11.5px] text-mut hover:text-tx md:min-h-[36px]"
                  >
                    Pronto
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div>
          <span className={caption} aria-hidden="true">
            {priceName}
          </span>
          <NumberField
            label={`${priceName} da operação ${n}`}
            labelHidden
            unit={priceUnit}
            maxDecimals={priceDecimals}
            value={op.strike}
            min={0}
            onCommit={(v) => onPatch({ strike: v })}
          />
        </div>
        {accumulator && !op.barrier && (
          <div>
            <span className={caption} aria-hidden="true">
              Nível piso
            </span>
            <NumberField
              label={`Nível piso da operação ${n}`}
              labelHidden
              unit={priceUnit}
              maxDecimals={priceDecimals}
              value={op.floorLevel ?? 0}
              min={0}
              onCommit={(v) => onPatch({ floorLevel: v > 0 ? v : null })}
              helper="Abaixo do nível de melhoria e do mercado. Se o mercado fechar no piso ou abaixo, a venda do período sai no piso; acima dele, sai no nível de melhoria."
            />
          </div>
        )}
        {op.barrier && (
          <div className="sm:col-span-2">
            <BarrierFields n={n} barrier={op.barrier} onChange={(barrier) => onPatch({ barrier })} />
          </div>
        )}
        {(option || accumulator) && (
          <div>
            <span className={caption} aria-hidden="true">
              {accumulator
                ? `${op.premiumDir === 'recebido' ? 'Prêmio recebido' : 'Prêmio pago'} (por bushel, sobre o contrato todo)`
                : `${op.side === 'comprado' ? 'Prêmio pago' : 'Prêmio recebido'} (por unidade)`}
            </span>
            <NumberField
              label={`Prêmio da operação ${n}`}
              labelHidden
              unit={priceUnit}
              maxDecimals={priceDecimals}
              value={op.premium}
              min={0}
              onCommit={(v) => onPatch({ premium: v })}
            />
            {accumulator && (
              <div className="mt-1.5">
                <Segmented
                  ariaLabel={`Prêmio pago ou recebido da operação ${n}`}
                  value={op.premiumDir ?? 'pago'}
                  options={[
                    { value: 'pago', label: 'Pago por você' },
                    { value: 'recebido', label: 'Recebido por você' },
                  ]}
                  onChange={(premiumDir) => onPatch({ premiumDir })}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {accumulator && op.accum && (
        <AccumFields
          n={n}
          accum={op.accum}
          status={status}
          startDate={op.startDate}
          endDate={op.maturityDate}
          onChange={(accum) => onPatch({ accum })}
        />
      )}

      <CloseFields n={n} op={op} today={todayDate} onPatch={onPatch} />

      {soja && (
        <div className="mt-2.5">
          <span className={caption} aria-hidden="true">
            Dólar da operação
          </span>
          <Segmented
            ariaLabel={`Dólar da operação ${n}`}
            value={fixado ? 'fixado' : 'aberto'}
            options={FX_MODES}
            onChange={(m) => {
              setFxMode(m as FxMode)
              // Open: the result follows the market dollar. Fixed: stored only once a rate above 0 is typed.
              if (m === 'aberto' && op.fxFixed !== null) onPatch({ fxFixed: null })
            }}
          />
          {fixado && (
            <div className="mt-2 max-w-[260px]">
              <NumberField
                label={`Dólar fixado da operação ${n}`}
                labelHidden
                unit="R$/US$"
                maxDecimals={4}
                value={op.fxFixed ?? 0}
                min={0}
                onCommit={(v) => onPatch({ fxFixed: v > 0 ? v : null })}
                helper={
                  op.fxFixed === null
                    ? 'Informe o dólar fixado; até lá o resultado segue o dólar de mercado.'
                    : undefined
                }
              />
            </div>
          )}
          <p className="mt-1 text-[11.5px] text-mut">
            Aberto: o resultado acompanha o dólar de mercado. Fixado: trava também o dólar das mesmas sacas.
          </p>
        </div>
      )}

      <MoreOptions n={n} op={op} onPatch={onPatch} />

      {status && <StatusLine n={n} op={op} status={status} realizedBrl={realizedBrl} mtmBrl={mtmBrl} />}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p
          data-testid={`hedge-reason-${n}`}
          aria-live="polite"
          className={`text-[11.5px] ${problem ? 'text-acc' : 'text-mut'}`}
        >
          {problem ?? hedgeSummary(op, bushelsPerSack)}
        </p>
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
            disabled={problem !== null}
            aria-label={saveAria}
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

const STATE_LABEL: Record<string, string> = {
  aberta: 'Em aberto',
  vencida: 'Vencida',
  encerrada: 'Encerrada',
  derrubada: 'Derrubada',
  'nao-ativada': 'Não ativada',
}

const ghostButton = 'min-h-[44px] rounded-[9px] border border-g7 px-3 text-xs font-semibold text-g7 md:min-h-[38px]'
const quietButton =
  'min-h-[44px] rounded-[9px] border border-line px-3 text-xs text-mut hover:text-tx md:min-h-[36px]'

/** What the operations do for the crop: how many, how much they cover, what they already earned and earn at today's market. */
function OpsSummaryBox({ ops }: { ops: HedgeOp[] }) {
  const { state, snapshot } = useStore()
  const spec = useHedgeSpec()
  const { scenario } = useResult()
  const { exp } = useExposure()
  const valid = ops.filter((o) => hedgeOpProblem(o) === null)
  if (!spec || valid.length === 0) return null
  const open = valid.filter((o) => opStatus(o, spec).state === 'aberta').length
  const realized = valid.reduce((sum, o) => sum + hedgeOpMoney(o, spec, scenario.cbotUsc, scenario.fx).realizedBrl, 0)
  const cbotToday = snapshot.cbotUsc[state.crop]?.value
  const fxToday = snapshot.fx.value
  const market =
    Number.isFinite(cbotToday) && cbotToday > 0 && Number.isFinite(fxToday) && fxToday > 0
      ? valid.reduce((sum, o) => sum + hedgeOpMoney(o, spec, cbotToday, fxToday).projectedBrl, 0)
      : null
  const money = (v: number) => `${v < 0 ? '−' : ''}${fmtBrl(Math.abs(v))}`
  return (
    <div className="rounded-[12px] border border-line bg-card px-3 py-2.5" aria-live="polite">
      <p data-testid="hedge-summary" className="num text-[13px] font-bold">
        {valid.length} {valid.length === 1 ? 'operação' : 'operações'} · {open} em aberto
        {exp.ok && exp.cbot.coverSc > 0 && ` · protege ${fmtNum(exp.cbot.coverSc, 0)} sc no CBOT`}
        {exp.ok && exp.dollar.coverSc > 0 && ` · ${fmtNum(exp.dollar.coverSc, 0)} sc no dólar`}
      </p>
      <p className="num mt-0.5 text-[11.5px] text-mut">
        Já realizado: {money(realized)}
        {market !== null && ` · a mercado hoje, a parte em aberto: ${money(market)}`}
      </p>
    </div>
  )
}

/**
 * The document of the saved operations ("Operações salvas"), laid over the page: one line per operation with its
 * state. An operation can be edited (the change only counts after "Salvar alterações") or removed (after a confirmation).
 */
function HedgeDocument({
  saved,
  onClose,
  returnFocus,
}: {
  saved: HedgeOp[]
  onClose: () => void
  returnFocus: () => HTMLElement | null
}) {
  const { state, dispatch, snapshot } = useStore()
  const spec = useHedgeSpec()
  const { scenario } = useResult()
  const bushelsPerSack = CROPS[state.crop].bushelsPerSack
  const [editing, setEditing] = useState<HedgeOp | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const cbotToday = snapshot.cbotUsc[state.crop]?.value
  const fxToday = snapshot.fx.value
  const todayMarket =
    Number.isFinite(cbotToday) && cbotToday > 0 && Number.isFinite(fxToday) && fxToday > 0
      ? { cbotUsc: cbotToday, fx: fxToday }
      : null
  const todayDate = snapshot.today ?? todayIso()
  const order = (o: HedgeOp) => (hedgeOpProblem(o) === null && spec ? opStatus(o, spec).state : 'aberta')
  // Open ones first; the closed, expired and knocked-out ones below. The number is the creation order.
  const numbered = saved.map((op, i) => ({ op, n: i + 1, st: order(op) }))
  const sorted = [...numbered.filter((x) => x.st === 'aberta'), ...numbered.filter((x) => x.st !== 'aberta')]

  return (
    <DocumentOverlay title="Operações salvas" kicker="Operações em bolsa" onClose={onClose} returnFocus={returnFocus} testId="hedge-document">
      <OpsSummaryBox ops={saved} />
      {saved.length === 0 && (
        <p className="rounded-[12px] border border-dashed border-line-strong px-3 py-3 text-mut">
          Nenhuma operação salva. Feche este documento e use “Adicionar operação”.
        </p>
      )}
      <ol className="grid gap-2.5">
        {sorted.map(({ op, n, st }) => {
          if (editing?.id === op.id) {
            return (
              <li key={op.id}>
                <HedgeRow
                  op={editing}
                  n={n}
                  bushelsPerSack={bushelsPerSack}
                  spec={spec}
                  scenario={scenario}
                  today={todayMarket}
                  todayDate={todayDate}
                  onPatch={(patch) => setEditing((cur) => (cur ? (applyHedgePatch(cur, patch) ?? cur) : cur))}
                  saveLabel="Salvar alterações"
                  saveAria={`Salvar alterações da operação ${n}`}
                  onSave={() => {
                    dispatch({ type: 'replaceHedgeOp', op: editing })
                    setEditing(null)
                  }}
                  leaveLabel="Cancelar"
                  leaveAria={`Cancelar a edição da operação ${n}`}
                  onLeave={() => setEditing(null)}
                />
              </li>
            )
          }
          const problem = hedgeOpProblem(op)
          return (
            <li
              key={op.id}
              data-hedge-id={op.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-line bg-card px-3 py-2.5"
            >
              <div className="min-w-0 flex-1 basis-60">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-bold">
                  <span>Operação {n}</span>
                  <span className="rounded-full bg-surface2 px-2 py-0.5 text-[10.5px] font-semibold text-mut">
                    {problem ? 'Incompleta' : (STATE_LABEL[st] ?? st)}
                  </span>
                </p>
                <p className="num mt-0.5 text-pretty text-[12.5px] text-tx">
                  {problem ? <span className="text-acc">{problem}</span> : hedgeSummary(op, bushelsPerSack)}
                </p>
              </div>
              {removing === op.id ? (
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Remover a operação ${n}?`}>
                  <span className="text-[12px] font-semibold">Remover esta operação?</span>
                  <button
                    type="button"
                    aria-label={`Confirmar a remoção da operação ${n}`}
                    onClick={() => {
                      dispatch({ type: 'removeHedgeOp', id: op.id })
                      setRemoving(null)
                    }}
                    className="min-h-[44px] rounded-[9px] border border-danger px-3 text-xs font-semibold text-danger md:min-h-[36px]"
                  >
                    Sim, remover
                  </button>
                  <button type="button" aria-label={`Manter a operação ${n}`} onClick={() => setRemoving(null)} className={quietButton}>
                    Não
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Editar operação ${n}`}
                    onClick={() => {
                      setRemoving(null)
                      setEditing({ ...op })
                    }}
                    className={quietButton}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    aria-label={`Remover operação ${n}`}
                    onClick={() => {
                      setEditing(null)
                      setRemoving(op.id)
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
        Para mudar uma operação, use Editar e depois Salvar alterações: sem salvar, nada muda nos números.
      </p>
    </DocumentOverlay>
  )
}

/**
 * The operations card of the Comercialização tab. Default: the summary and an "Adicionar operação" button with its
 * context. A new operation is a form on the page that already counts in the numbers while the app is open, but is
 * not kept: "Salvar operação" keeps it, and it then leaves the page and goes to the document "Operações salvas" (button
 * at the top right), where it can be edited or removed. Operations not saved are gone on the next visit.
 */
export function HedgePanel() {
  const { state, dispatch, snapshot } = useStore()
  const spec = useHedgeSpec()
  const cbotToday = snapshot.cbotUsc[state.crop]?.value
  const fxToday = snapshot.fx.value
  const todayMarket =
    Number.isFinite(cbotToday) && cbotToday > 0 && Number.isFinite(fxToday) && fxToday > 0
      ? { cbotUsc: cbotToday, fx: fxToday }
      : null
  const { scenario } = useResult()
  const todayDate = snapshot.today ?? todayIso()
  // Only the operations of the crop on screen (a soybean operation never settles corn).
  const ops = opsForCrop(state.hedgeOps, state.crop)
  const saved = ops.filter((o) => o.saved !== false)
  const unsaved = ops.filter((o) => o.saved === false)
  const bushelsPerSack = CROPS[state.crop].bushelsPerSack
  const [docOpen, setDocOpen] = useState(false)
  const formsBox = useRef<HTMLDivElement>(null)
  const addBtn = useRef<HTMLButtonElement>(null)
  const docBtn = useRef<HTMLButtonElement>(null)

  // A new form takes the focus on its first field; when a form leaves (saved or removed) the focus goes back to "Adicionar operação".
  const before = useRef(unsaved.length)
  useEffect(() => {
    const was = before.current
    before.current = unsaved.length
    if (unsaved.length > was) {
      const forms = formsBox.current?.querySelectorAll('fieldset')
      forms?.[forms.length - 1]?.querySelector<HTMLElement>('input, button')?.focus()
    } else if (unsaved.length < was) addBtn.current?.focus()
  }, [unsaved.length])

  const add = () => dispatch({ type: 'addHedgeOp', partial: { saved: false } })

  return (
    <Card title="Operações em bolsa (hedge)" testId="card-operacoes">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="min-w-0 flex-1 basis-60 text-pretty text-[12.5px] text-mut">
            Reporte aqui as operações que você já fez na bolsa: futuros, puts, calls e accumulators de soja ou milho
            (CBOT), e futuros, puts e calls de dólar, até a posição vir da API da corretora/banco. O que já aconteceu
            (fixings, vencimento, barreira) vem do histórico de preços e entra na margem como resultado realizado.
          </p>
          <button
            ref={docBtn}
            type="button"
            aria-haspopup="dialog"
            onClick={() => setDocOpen(true)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-[9px] border border-line-strong bg-card px-3 text-xs font-semibold text-tx hover:border-g7 md:min-h-[36px]"
          >
            Operações salvas
            <span
              aria-hidden="true"
              className="num grid min-w-[20px] place-items-center rounded-full bg-surface2 px-1.5 text-[11px] font-bold text-mut"
            >
              {saved.length}
            </span>
          </button>
        </div>

        <OpsSummaryBox ops={ops} />

        {unsaved.length > 0 && (
          <div ref={formsBox} className="grid gap-2.5">
            {unsaved.map((op, k) => {
              const n = saved.length + k + 1
              return (
                <HedgeRow
                  key={op.id}
                  op={op}
                  n={n}
                  unsaved
                  bushelsPerSack={bushelsPerSack}
                  spec={spec}
                  scenario={scenario}
                  today={todayMarket}
                  todayDate={todayDate}
                  onPatch={(patch) => dispatch({ type: 'updateHedgeOp', id: op.id, patch })}
                  saveLabel="Salvar operação"
                  saveAria={`Salvar operação ${n}`}
                  onSave={() => dispatch({ type: 'updateHedgeOp', id: op.id, patch: { saved: true } })}
                  leaveLabel="Remover"
                  leaveAria={`Remover operação ${n}`}
                  onLeave={() => dispatch({ type: 'removeHedgeOp', id: op.id })}
                />
              )
            })}
          </div>
        )}

        {ops.length === 0 ? (
          <div className="rounded-[12px] border border-dashed border-line-strong px-3 py-3.5">
            <p className="text-[13px] font-semibold text-tx">Nenhuma operação registrada ainda.</p>
            <p className="mt-0.5 text-mut">Se você já tem posição na bolsa, adicione a operação para ela entrar na conta.</p>
            <button ref={addBtn} type="button" className={`${ghostButton} mt-2.5`} onClick={add}>
              Adicionar operação
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-line bg-surface2 px-3 py-2.5">
            <p className="min-w-0 flex-1 basis-56 text-mut">
              {unsaved.length > 0
                ? 'Ela já conta nos números, mas só fica guardada depois de “Salvar operação”.'
                : 'Tem mais alguma operação? Adicione e ela entra na conta.'}
            </p>
            <button ref={addBtn} type="button" className={ghostButton} onClick={add}>
              Adicionar operação
            </button>
          </div>
        )}
        <p className="text-[11.5px] text-mut">Em breve: ler a posição direto da corretora/banco</p>
      </div>
      {docOpen && (
        <HedgeDocument saved={saved} onClose={() => setDocOpen(false)} returnFocus={() => docBtn.current} />
      )}
    </Card>
  )
}
