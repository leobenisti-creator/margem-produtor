import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Accum, Barrier, HedgeAsset, HedgeKind, HedgeOp, OpStatus } from '../engine/hedge'
import { addTradingDays, endDateForMonth, fixingDates, tradingDaysUntil } from '../engine/calendar'
import { fmtBrl, fmtDateBr } from './format'
import { NumberField } from './NumberField'
import { Segmented } from './Segmented'
import type { HedgeOpPatch } from '../state/types'

const caption = 'mb-0.5 block text-xs font-medium text-mut'
const textInput =
  'min-h-[44px] w-full rounded-[9px] border border-line-strong bg-surface2 px-2.5 text-base font-semibold outline-none focus:border-acc md:min-h-[38px] md:text-sm'
const dateInput =
  'min-h-[44px] w-full rounded-[9px] border border-line-strong bg-surface2 px-2.5 text-base font-semibold outline-none focus:border-acc md:min-h-[38px] md:text-sm'

// ───────────────────────────────────────── type of the operation ─────────────────────────────────────────

export type OpTypeId =
  'futuro' | 'put' | 'call' | 'put-ko' | 'put-ki' | 'call-ko' | 'call-ki' | 'accumulator-fc' | 'accumulator-ko'

const TYPE_LABEL: Record<OpTypeId, string> = {
  futuro: 'Futuro',
  put: 'Put',
  call: 'Call',
  'put-ko': 'Put com knock-out',
  'put-ki': 'Put com knock-in',
  'call-ko': 'Call com knock-out',
  'call-ki': 'Call com knock-in',
  'accumulator-fc': 'Accumulator floor/ceiling',
  'accumulator-ko': 'Accumulator com knock-out',
}

const DOLLAR_TYPES: OpTypeId[] = ['futuro', 'put', 'call']
const GRAIN_TYPES: OpTypeId[] = [
  'futuro',
  'put',
  'call',
  'put-ko',
  'put-ki',
  'call-ko',
  'call-ki',
  'accumulator-fc',
  'accumulator-ko',
]

/** The menu entry that describes this operation. */
export function opTypeId(op: Pick<HedgeOp, 'kind' | 'barrier'>): OpTypeId {
  if (op.kind === 'futuro') return 'futuro'
  if (op.kind === 'accumulator') return op.barrier ? 'accumulator-ko' : 'accumulator-fc'
  if (!op.barrier) return op.kind
  return `${op.kind}-${op.barrier.type}` as OpTypeId
}

export const opTypeLabel = (op: Pick<HedgeOp, 'kind' | 'barrier'>): string => TYPE_LABEL[opTypeId(op)]

/** Patch that turns an operation into the chosen type (the barrier price stays empty until typed). */
export function opTypePatch(id: OpTypeId, cur: Pick<HedgeOp, 'barrier'>): HedgeOpPatch {
  const kind = id.split('-')[0] as HedgeKind
  const type = id.endsWith('-ko') ? 'ko' : id.endsWith('-ki') ? 'ki' : null
  if (type === null) return { kind, barrier: null }
  const dir = cur.barrier?.dir ?? (kind === 'call' ? 'alta' : 'baixa')
  return { kind, barrier: { type, price: cur.barrier?.price ?? 0, dir } }
}

/** The "Tipo" button: Futuro by default; a click lists the other types (barriers and accumulators only for grains). */
export function OpTypeMenu({
  n,
  asset,
  op,
  onPick,
}: {
  n: number
  asset: HedgeAsset
  op: Pick<HedgeOp, 'kind' | 'barrier'>
  onPick: (id: OpTypeId) => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const current = opTypeId(op)
  const list = asset === 'dolar' ? DOLLAR_TYPES : GRAIN_TYPES

  useEffect(() => {
    if (!open) return
    const away = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div ref={box} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Tipo da operação ${n}: ${TYPE_LABEL[current]}`}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[9px] border border-acc bg-bg px-3 text-xs font-bold text-acc md:min-h-[32px]"
      >
        {TYPE_LABEL[current]}
        <ChevronDown aria-hidden="true" size={14} strokeWidth={1.75} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={`Tipos de operação ${n}`}
          className="absolute left-0 top-full z-20 mt-1 grid min-w-[220px] gap-0.5 rounded-[9px] border border-line-strong bg-card p-1 shadow-lg"
        >
          {list.map((id) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              aria-label={`Mudar para ${TYPE_LABEL[id]}`}
              aria-current={id === current ? 'true' : undefined}
              onClick={() => {
                setOpen(false)
                if (id !== current) onPick(id)
              }}
              className={`min-h-[40px] whitespace-nowrap rounded-[6px] px-2.5 text-left text-xs font-semibold hover:bg-surface2 ${
                id === current ? 'text-acc' : 'text-tx'
              }`}
            >
              {TYPE_LABEL[id]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ───────────────────────────────────────────── dates ─────────────────────────────────────────────

/**
 * A date field. A half-typed date makes the browser report '' for a moment: that must not erase the stored date, so
 * only a complete date is saved while typing and an empty field is cleared when it is left empty.
 */
function DateInput({
  label,
  value,
  onCommit,
  type = 'date',
}: {
  label: string
  value: string | undefined
  onCommit: (v: string | null) => void
  /** 'month' for the maturity month (YYYY-MM). */
  type?: 'date' | 'month'
}) {
  // What the field shows is a local draft: the browser reports '' while a date is half typed, and a controlled value
  // would give the old date back in the middle of the typing.
  const [draft, setDraft] = useState(value ?? '')
  useEffect(() => setDraft(value ?? ''), [value])
  return (
    <input
      type={type}
      aria-label={label}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value)
        if (e.target.value !== '') onCommit(e.target.value)
      }}
      onBlur={(e) => {
        if (draft === '' && !e.target.validity.badInput && value !== undefined) onCommit(null)
      }}
      className={dateInput}
    />
  )
}

/**
 * The dates, in the order the producer gives them. Accumulator: start date, contract month, end date, business days.
 * Anything else: contract month, end date, business days (a barrier option also asks for the date of the operation,
 * because the barrier is watched from it; the others have it, optional, under "Mais opções").
 * The end date follows from the month (28th of the month before) and the business days count follows from the end date
 * (CBOT trading days, from today); the producer can change any of the three.
 */
export function DateFields({
  n,
  op,
  today,
  onPatch,
}: {
  n: number
  op: HedgeOp
  /** ISO date of today (the business days are counted from it). */
  today: string
  onPatch: (p: HedgeOpPatch) => void
}) {
  const accumulator = op.kind === 'accumulator'
  const daysLeft = op.maturityDate ? tradingDaysUntil(today, op.maturityDate) : 0
  return (
    <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
      {accumulator && (
        <div>
          <span className={caption} aria-hidden="true">
            Data de início
          </span>
          <DateInput label={`Data da operação ${n}`} value={op.startDate} onCommit={(v) => onPatch({ startDate: v })} />
        </div>
      )}
      <div>
        <span className={caption} aria-hidden="true">
          Mês de vencimento
        </span>
        <DateInput
          type="month"
          label={`Mês de vencimento da operação ${n}`}
          value={op.maturityMonth ?? op.maturityDate?.slice(0, 7)}
          // The end date follows from the month (the 28th of the month before); the producer can still edit it.
          onCommit={(v) =>
            onPatch(
              v === null ? { maturityMonth: null, maturityDate: null } : { maturityMonth: v, maturityDate: endDateForMonth(v) },
            )
          }
        />
        {op.maturityMonth === undefined && op.maturityDate === undefined && op.maturity.trim() !== '' && (
          <p className="mt-1 text-[11.5px] text-mut">Vencimento antigo: {op.maturity}. Escolha o mês.</p>
        )}
      </div>
      <div>
        <span className={caption} aria-hidden="true">
          Data final
        </span>
        <DateInput
          label={`Vencimento da operação ${n}`}
          value={op.maturityDate}
          onCommit={(v) => onPatch({ maturityDate: v })}
        />
        <p className="mt-1 text-[11.5px] text-mut">Vem do mês de vencimento (dia 28 do mês anterior); edite se for outra.</p>
      </div>
      <div>
        <span className={caption} aria-hidden="true">
          Dias úteis até o vencimento
        </span>
        <NumberField
          label={`Dias úteis até o vencimento da operação ${n}`}
          labelHidden
          unit="dias"
          maxDecimals={0}
          min={0}
          commitOn="blur"
          value={daysLeft}
          validate={(v) => (Number.isInteger(v) ? null : 'Informe um número inteiro de dias.')}
          onCommit={(v) => {
            if (!Number.isInteger(v) || v < 0 || v === daysLeft) return
            const end = addTradingDays(today, v)
            if (end) onPatch({ maturityDate: end })
          }}
        />
        <p className="mt-1 text-[11.5px] text-mut">Pregões do CBOT, de hoje até a data final. Edite para mover a data final.</p>
      </div>
      {!accumulator && op.barrier !== undefined && (
        <div>
          <span className={caption} aria-hidden="true">
            Data da operação (a barreira vale a partir dela)
          </span>
          <DateInput label={`Data da operação ${n}`} value={op.startDate} onCommit={(v) => onPatch({ startDate: v })} />
        </div>
      )}
    </div>
  )
}

/**
 * The end of the operation before its maturity. Accumulator: "Encerrar operação"; futures and options: "Operação
 * liquidada". The button opens the date (today, editable) and what was received or paid; "Desfazer" takes it back.
 */
export function CloseFields({
  n,
  op,
  today,
  onPatch,
}: {
  n: number
  op: HedgeOp
  /** ISO date of today: the closing date a click starts with. */
  today: string
  onPatch: (p: HedgeOpPatch) => void
}) {
  const accumulator = op.kind === 'accumulator'
  if (!op.closedDate) {
    return (
      <div className="mt-2.5">
        <button
          type="button"
          aria-label={`${accumulator ? 'Encerrar' : 'Marcar como liquidada a'} operação ${n}`}
          onClick={() => onPatch({ closedDate: today })}
          className="min-h-[44px] rounded-[9px] border border-line px-3 text-xs text-mut hover:text-tx md:min-h-[32px]"
        >
          {accumulator ? 'Encerrar operação' : 'Operação liquidada'}
        </button>
      </div>
    )
  }
  const priceUnit = op.asset === 'soja' ? 'US¢/bu' : 'R$/US$'
  const decimals = op.asset === 'soja' ? 2 : 4
  const option = op.kind === 'put' || op.kind === 'call'
  return (
    <div className="mt-2.5 rounded-[10px] border border-line bg-surface2 px-2.5 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-bold">{accumulator ? 'Operação encerrada' : 'Operação liquidada'}</p>
        <button
          type="button"
          aria-label={`Desfazer ${accumulator ? 'o encerramento' : 'a liquidação'} da operação ${n}`}
          onClick={() => onPatch({ closedDate: null, closePrice: null, closeValueUsd: null })}
          className="min-h-[44px] rounded-[7px] px-2 text-[11.5px] text-mut hover:text-tx hover:underline md:min-h-[28px]"
        >
          Desfazer
        </button>
      </div>
      <div className="mt-1.5 grid gap-2.5 sm:grid-cols-2">
        <div>
          <span className={caption} aria-hidden="true">
            {accumulator ? 'Dia do encerramento' : 'Dia da liquidação'}
          </span>
          <DateInput
            label={`Encerrada em da operação ${n}`}
            value={op.closedDate}
            onCommit={(v) => onPatch({ closedDate: v })}
          />
        </div>
        <div>
          {accumulator ? (
            <>
              <span className={caption} aria-hidden="true">
                Valor recebido (+) ou pago (−) para encerrar
              </span>
              <NumberField
                label={`Valor recebido ou pago ao encerrar da operação ${n}`}
                labelHidden
                unit="US$"
                maxDecimals={2}
                value={op.closeValueUsd ?? 0}
                onCommit={(v) => onPatch({ closeValueUsd: v === 0 ? null : v })}
              />
            </>
          ) : option ? (
            <>
              <span className={caption} aria-hidden="true">
                {op.side === 'comprado' ? 'Prêmio recebido ao liquidar a opção' : 'Prêmio pago para liquidar a opção'}
              </span>
              <NumberField
                label={`Prêmio de encerramento da operação ${n}`}
                labelHidden
                unit={priceUnit}
                maxDecimals={decimals}
                value={op.closePrice ?? 0}
                min={0}
                onCommit={(v) => onPatch({ closePrice: v > 0 ? v : null })}
              />
            </>
          ) : (
            <>
              <span className={caption} aria-hidden="true">
                Preço de liquidação
              </span>
              <NumberField
                label={`Preço de encerramento da operação ${n}`}
                labelHidden
                unit={priceUnit}
                maxDecimals={decimals}
                value={op.closePrice ?? 0}
                min={0}
                onCommit={(v) => onPatch({ closePrice: v > 0 ? v : null })}
              />
            </>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-[11.5px] text-mut">
        {accumulator
          ? 'Positivo: o banco pagou você para encerrar. Negativo: você pagou. Os fixings até o dia do encerramento contam normalmente; os seguintes foram cancelados.'
          : option
            ? 'O resultado é o prêmio da liquidação menos o prêmio da abertura. Em branco: vale só o valor intrínseco do dia (sem valor do tempo).'
            : 'O resultado é a diferença entre o preço da operação e este preço. Em branco: vale o preço de settle do dia, do histórico.'}
      </p>
    </div>
  )
}

/** The optional fields: hidden behind a button because most operations do not need them. */
export function MoreOptions({ n, op, onPatch }: { n: number; op: HedgeOp; onPatch: (p: HedgeOpPatch) => void }) {
  const used =
    op.contract !== undefined ||
    (op.startDate !== undefined && op.kind !== 'accumulator' && op.barrier === undefined) ||
    op.costBrl !== undefined ||
    op.barrierHitDate !== undefined ||
    op.accum?.guaranteed !== undefined
  const [open, setOpen] = useState(used)
  return (
    <div className="mt-2.5">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${open ? 'Menos' : 'Mais'} opções da operação ${n}`}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-[44px] items-center gap-1 rounded-[9px] border border-line px-3 text-xs text-mut hover:text-tx md:min-h-[32px]"
      >
        {open ? 'Menos opções' : 'Mais opções'}
        <ChevronDown aria-hidden="true" size={14} strokeWidth={1.75} className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
          {op.kind !== 'accumulator' && op.barrier === undefined && (
            <div>
              <span className={caption} aria-hidden="true">
                Data da operação (opcional)
              </span>
              <DateInput
                label={`Data da operação ${n}`}
                value={op.startDate}
                onCommit={(v) => onPatch({ startDate: v })}
              />
            </div>
          )}
          <div>
            <span className={caption} aria-hidden="true">
              Contrato (opcional)
            </span>
            <input
              type="text"
              autoComplete="off"
              maxLength={24}
              placeholder="ex.: SK26"
              aria-label={`Contrato da operação ${n}`}
              value={op.contract ?? ''}
              onChange={(e) => onPatch({ contract: e.target.value === '' ? null : e.target.value })}
              className={textInput}
            />
          </div>
          <div>
            <span className={caption} aria-hidden="true">
              Corretagem e taxas (opcional)
            </span>
            <NumberField
              label={`Corretagem e taxas da operação ${n}`}
              labelHidden
              unit="R$"
              maxDecimals={2}
              min={0}
              value={op.costBrl ?? 0}
              onCommit={(v) => onPatch({ costBrl: v > 0 ? v : null })}
              helper="Total pago uma vez; entra na margem como custo da operação."
            />
          </div>
          {op.barrier && (
            <div>
              <span className={caption} aria-hidden="true">
                Barreira atingida em (opcional)
              </span>
              <DateInput
                label={`Barreira atingida em da operação ${n}`}
                value={op.barrierHitDate}
                onCommit={(v) => onPatch({ barrierHitDate: v })}
              />
              <p className="mt-1 text-[11.5px] text-mut">
                Em branco: o app confere sozinho pelo histórico. Preencha só se a corretora informou outra data.
              </p>
            </div>
          )}
          {op.kind === 'accumulator' && (
            <div>
              <span className={caption} aria-hidden="true">
                Fixings garantidos (opcional)
              </span>
              <NumberField
                label={`Fixings garantidos da operação ${n}`}
                labelHidden
                unit="fixings"
                maxDecimals={0}
                min={0}
                value={op.accum?.guaranteed ?? 0}
                validate={(v) => (Number.isInteger(v) ? null : 'Informe um número inteiro.')}
                onCommit={(v) => {
                  if (!op.accum || !Number.isInteger(v)) return
                  const { guaranteed, ...rest } = op.accum
                  void guaranteed
                  onPatch({ accum: v > 0 ? { ...rest, guaranteed: v } : rest })
                }}
                helper="Os primeiros fixings contam mesmo se a barreira cair antes."
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────── barrier ────────────────────────────────────────────

export function BarrierFields({
  n,
  barrier,
  onChange,
}: {
  n: number
  barrier: Barrier
  onChange: (b: Barrier) => void
}) {
  return (
    <div className="mt-2.5 rounded-[10px] border border-line bg-surface2 px-2.5 py-2">
      <p className="text-[12px] font-bold">
        {barrier.type === 'ko' ? 'Barreira de knock-out' : 'Barreira de knock-in'}
      </p>
      <div className="mt-1.5 grid gap-2.5 sm:grid-cols-2">
        <div>
          <span className={caption} aria-hidden="true">
            {barrier.type === 'ko' ? 'Nível de knock-out (barreira)' : 'Nível de knock-in (barreira)'}
          </span>
          <NumberField
            label={`Nível de ${barrier.type === 'ko' ? 'knock-out' : 'knock-in'} da operação ${n}`}
            labelHidden
            unit="US¢/bu"
            maxDecimals={2}
            value={barrier.price}
            min={0}
            onCommit={(v) => onChange({ ...barrier, price: v })}
          />
        </div>
        <div>
          <span className={caption} aria-hidden="true">
            Direção
          </span>
          <Segmented
            ariaLabel={`Direção da barreira da operação ${n}`}
            value={barrier.dir}
            options={[
              { value: 'alta', label: 'De alta' },
              { value: 'baixa', label: 'De baixa' },
            ]}
            onChange={(dir) => onChange({ ...barrier, dir })}
          />
        </div>
      </div>
      <p className="mt-1.5 text-[11.5px] text-mut">
        {barrier.type === 'ko'
          ? 'Se o preço de settle tocar a barreira, a operação cai e só o prêmio fica.'
          : 'A operação só passa a valer depois que o preço de settle tocar a barreira.'}{' '}
        O app confere sozinho pelo histórico de preços, a partir da data da operação.
      </p>
    </div>
  )
}

// ────────────────────────────────────────── accumulator ──────────────────────────────────────────

const WEEKDAYS = [
  { value: '1', label: 'Seg' },
  { value: '2', label: 'Ter' },
  { value: '3', label: 'Qua' },
  { value: '4', label: 'Qui' },
  { value: '5', label: 'Sex' },
]

export function AccumFields({
  n,
  accum,
  status,
  startDate,
  endDate,
  onChange,
}: {
  n: number
  accum: Accum
  status: OpStatus | null
  startDate?: string
  endDate?: string
  onChange: (a: Accum) => void
}) {
  // The fixings the schedule gives, on CBOT trading days (the first and the last are shown so the producer can check).
  const dates = startDate && endDate ? fixingDates(startDate, endDate, accum.frequency, accum.day) : []
  const withDay = (frequency: Accum['frequency']): Accum => {
    const { day, ...rest } = accum
    void day
    return { ...rest, frequency }
  }
  return (
    <div className="mt-2.5 rounded-[10px] border border-line bg-surface2 px-2.5 py-2">
      <p className="text-[12px] font-bold">Fixings do accumulator</p>
      <div className="mt-1.5 grid gap-2.5 sm:grid-cols-2">
        <div>
          <span className={caption} aria-hidden="true">
            Frequência
          </span>
          <Segmented
            ariaLabel={`Frequência dos fixings da operação ${n}`}
            value={accum.frequency}
            // Weekly or monthly; the daily schedule of older saves stays selectable only while it is the one in use.
            options={[
              ...(accum.frequency === 'diario' ? [{ value: 'diario' as const, label: 'Diário' }] : []),
              { value: 'semanal' as const, label: 'Semanal' },
              { value: 'mensal' as const, label: 'Mensal' },
            ]}
            onChange={(f) => onChange(withDay(f))}
          />
        </div>
        {accum.frequency === 'semanal' && (
          <div>
            <span className={caption} aria-hidden="true">
              Dia da semana do fixing
            </span>
            <Segmented
              ariaLabel={`Dia da semana do fixing da operação ${n}`}
              value={String(accum.day ?? 0)}
              options={WEEKDAYS}
              onChange={(d) => onChange({ ...accum, day: Number(d) })}
            />
            {accum.day === undefined && (
              <p className="mt-1 text-[11.5px] text-mut">Sem escolha: o dia da data da operação.</p>
            )}
          </div>
        )}
        {accum.frequency === 'mensal' && (
          <div>
            <span className={caption} aria-hidden="true">
              Dia do mês do fixing
            </span>
            <NumberField
              label={`Dia do mês do fixing da operação ${n}`}
              labelHidden
              unit="dia"
              maxDecimals={0}
              min={1}
              max={31}
              value={accum.day ?? 0}
              validate={(v) => (Number.isInteger(v) && v >= 1 && v <= 31 ? null : 'Informe um dia de 1 a 31.')}
              onCommit={(v) => Number.isInteger(v) && v >= 1 && v <= 31 && onChange({ ...accum, day: v })}
            />
          </div>
        )}
      </div>
      {status && status.fixingsTotal !== undefined && (
        <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
          <div>
            <span className={caption} aria-hidden="true">
              Fixings já feitos
            </span>
            <NumberField
              label={`Fixings já feitos da operação ${n}`}
              labelHidden
              unit={`de ${status.fixingsTotal}`}
              maxDecimals={0}
              min={0}
              value={status.fixingsDone ?? 0}
              validate={(v) => (Number.isInteger(v) ? null : 'Informe um número inteiro.')}
              onCommit={(v) => {
                if (!Number.isInteger(v) || v === (status.fixingsDone ?? 0)) return
                onChange({ ...accum, fixingsDone: v })
              }}
            />
          </div>
          {accum.fixingsDone !== undefined && (
            <div className="self-end">
              <button
                type="button"
                aria-label={`Contar os fixings pelas datas na operação ${n}`}
                onClick={() => {
                  const { fixingsDone, ...rest } = accum
                  void fixingsDone
                  onChange(rest)
                }}
                className="min-h-[44px] rounded-[9px] border border-line px-3 text-xs text-mut hover:text-tx md:min-h-[36px]"
              >
                Contar pelas datas
              </button>
            </div>
          )}
        </div>
      )}
      {dates.length > 0 && (
        <p data-testid={`accum-fixings-${n}`} className="num mt-1.5 text-[11.5px] font-semibold text-tx">
          {dates.length} {dates.length === 1 ? 'fixing' : 'fixings'}, de {fmtDateBr(dates[0])} a{' '}
          {fmtDateBr(dates[dates.length - 1])}.
        </p>
      )}
      <p className="mt-1.5 text-[11.5px] text-mut">
        Os fixings caem em dias de pregão do CBOT (calendário americano). O app conta pelas datas; você pode corrigir o
        número à mão.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────── status line ───────────────────────────────────────────

/** What happened to the operation (expired, closed, knocked out...) and the money already realized. */
export function StatusLine({
  n,
  op,
  status,
  realizedBrl,
  mtmBrl,
}: {
  n: number
  op: HedgeOp
  status: OpStatus
  realizedBrl: number
  /** What the part still open is worth at today's prices (R$); null when unknown. */
  mtmBrl: number | null
}) {
  const parts: string[] = []
  const end = status.endDate ? fmtDateBr(status.endDate) : null
  switch (status.state) {
    case 'vencida':
      parts.push(`Vencida${end ? ` em ${end}` : ''}: o resultado já está realizado e não protege mais.`)
      break
    case 'encerrada':
      parts.push(`Encerrada${end ? ` em ${end}` : ''}: o resultado já está realizado e não protege mais.`)
      break
    case 'derrubada':
      parts.push(
        `Derrubada${status.barrierDate ? ` em ${fmtDateBr(status.barrierDate)}` : ''}: a barreira foi atingida${
          op.kind === 'accumulator' ? ', os fixings seguintes foram cancelados' : ' e só o prêmio fica'
        }.`,
      )
      break
    case 'nao-ativada':
      parts.push('Knock-in ainda não atingido: a operação não vale; só o prêmio conta.')
      break
    default:
      if (status.barrierHit === false) parts.push('Barreira ainda não atingida.')
  }
  if (status.fixingsTotal !== undefined) {
    parts.push(
      `Fixings: ${status.fixingsDone ?? 0} de ${status.fixingsTotal} feitos, ${status.fixingsLeft ?? 0} a fazer.`,
    )
  }
  if (Math.abs(realizedBrl) >= 0.5) {
    parts.push(`Já realizado: ${realizedBrl < 0 ? '−' : ''}${fmtBrl(Math.abs(realizedBrl))}.`)
  }
  if (mtmBrl !== null && Math.abs(mtmBrl) >= 0.5 && status.state !== 'derrubada' && status.state !== 'nao-ativada') {
    const sold = op.side === 'vendido' && (op.kind === 'futuro' || op.kind === 'accumulator')
    parts.push(
      `A mercado hoje, a parte em aberto ${mtmBrl < 0 ? 'perde' : 'ganha'} ${fmtBrl(Math.abs(mtmBrl))}${
        sold && mtmBrl < 0
          ? ': o preço da operação está abaixo do mercado de hoje (já está na margem, compensado pela soja física, que vale mais)'
          : ''
      }.`,
    )
  }
  if (parts.length === 0 && status.notes.length === 0) return null
  return (
    <div data-testid={`hedge-status-${n}`} className="mt-2 rounded-[10px] border border-line px-2.5 py-2 text-[11.5px]">
      {parts.length > 0 && <p className="num font-semibold text-tx">{parts.join(' ')}</p>}
      {status.notes.map((t) => (
        <p key={t} className="mt-0.5 text-acc">
          {t}
        </p>
      ))}
    </div>
  )
}
