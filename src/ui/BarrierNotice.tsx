import type { BarrierRisk, CallCap } from '../engine/barrierRisk'
import { Card } from './Card'
import { fmtCompactMoney } from './fmtExtra'
import { fmtDateBr, fmtNum, fmtPct } from './format'
import { useBarrierRisk } from './useBarrierRisk'
import { useResult } from './useResult'

const signedPct = (p: number) => `${p < 0 ? '−' : '+'}${fmtNum(Math.abs(p) * 100, 1)}%`
const usc = (n: number) => `${fmtNum(n, 0)} US¢/bu`
const sc = (n: number) => `${fmtNum(n, 0)} sc`

const KIND: Record<BarrierRisk['kind'], string> = { put: 'Put', call: 'Call', accumulator: 'Accumulator' }

/** What the operation gives, in one clause. */
function gives(r: BarrierRisk): string {
  if (r.kind === 'accumulator') return `vende a ${usc(r.strikeUsc)}`
  return `protege abaixo de ${usc(r.strikeUsc)}`
}

/** "sobe até" / "cai até": the way the CBOT has to go to touch the barrier. */
const way = (r: BarrierRisk) => (r.dir === 'alta' ? 'subir' : 'cair')

function RiskItem({ r, cbotToday }: { r: BarrierRisk; cbotToday: number }) {
  return (
    <li data-testid={`barreira-${r.id}`} className="py-2.5 first:pt-0 last:pb-0">
      <p className="text-[13px] font-semibold">
        {KIND[r.kind]} com knock-out · <span className="num">{sc(r.sc)}</span> · {gives(r)}
      </p>
      <p className="mt-0.5 text-[12.5px]">
        A proteção acaba se a CBOT {way(r)} até <b className="num">{usc(r.barrierUsc)}</b>{' '}
        <span className="num text-mut">
          ({signedPct(r.distancePct)} sobre hoje, {usc(cbotToday)})
        </span>
        .
      </p>
      {r.kind === 'accumulator' && r.guaranteedSc > 0 && (
        <p className="num mt-0.5 text-[11.5px] text-mut">
          {sc(r.guaranteedSc)} dos fixings garantidos continuam valendo mesmo com o toque.
        </p>
      )}
      {r.beyondToday && (
        <p className="mt-0.5 text-[11.5px] text-gold">
          A CBOT de hoje já passou desse nível, mas o histórico não registra o toque: confira a data do toque na operação.
        </p>
      )}
    </li>
  )
}

function DoneItem({ r }: { r: BarrierRisk }) {
  if (r.type === 'ko' && r.state === 'derrubada')
    return (
      <li data-testid={`barreira-${r.id}`} className="py-1.5 text-[12.5px] text-mut">
        {KIND[r.kind]} com knock-out derrubado{r.hitDate ? ` em ${fmtDateBr(r.hitDate)}` : ''}: já não protege.
      </li>
    )
  return (
    <li data-testid={`barreira-${r.id}`} className="py-1.5 text-[12.5px] text-mut">
      {KIND[r.kind]} com knock-in: só passa a valer se a CBOT {way(r)} até <span className="num">{usc(r.barrierUsc)}</span>{' '}
      ({signedPct(r.distancePct)} sobre hoje).
    </li>
  )
}

function CapItem({ c, cbotToday }: { c: CallCap; cbotToday: number }) {
  return (
    <li data-testid={`limite-${c.id}`} className="py-2.5 first:pt-0 last:pb-0">
      <p className="text-[13px] font-semibold">
        Call vendida · <span className="num">{sc(c.sc)}</span> · limita o seu ganho acima de {usc(c.strikeUsc)}
      </p>
      <p className="mt-0.5 text-[12.5px]">
        {c.distancePct <= 0 ? (
          <>A CBOT ({usc(cbotToday)}) já está acima desse nível: a alta não aumenta mais o seu ganho nessas sacas.</>
        ) : (
          <>
            Se a CBOT passar desse nível, a alta não aumenta o seu ganho nessas sacas{' '}
            <span className="num text-mut">({signedPct(c.distancePct)} sobre hoje)</span>.
          </>
        )}
      </p>
      {c.barrier && (
        <p className="num mt-0.5 text-[11.5px] text-mut">
          Esse limite acaba se a CBOT {c.barrier.dir === 'alta' ? 'subir' : 'cair'} até {usc(c.barrier.price)}.
        </p>
      )}
    </li>
  )
}

/**
 * "Proteção com barreira": warns the producer that part of what protects him lasts only while the CBOT does not touch a
 * knock-out barrier (the worst case: touching at any moment ends it, even if the price comes back), and lists the calls
 * sold that cap his gain. Nothing is shown without such operations.
 */
export function BarrierNotice() {
  const view = useBarrierRisk()
  const { currency, toDisplay } = useResult()
  if (view === null) return null
  const { risks, atRisk, caps, split, cbotToday, loss } = view
  const others = risks.filter((r) => !r.atRisk && (r.covers || r.type === 'ki'))
  if (atRisk.length === 0 && others.length === 0 && caps.length === 0) return null
  return (
    <Card title="Proteção com barreira" testId="aviso-barreira">
      {atRisk.length > 0 && (
        <>
          <p data-testid="barreira-resumo" className="text-[12.5px]">
            {split.barrierSc > 0 && (
              <>
                <b className="num">{fmtPct(split.barrierShare, 0)}</b> da sua cobertura na CBOT (
                <span className="num">{sc(split.barrierSc)}</span>) depende de barreira.{' '}
              </>
            )}
            A barreira vale em qualquer momento: se a CBOT tocar o nível, a proteção do que falta acaba, mesmo que o preço
            volte a cair depois.
          </p>
          <ul aria-label="Operações com barreira" className="mt-2.5 divide-y divide-line">
            {atRisk.map((r) => (
              <RiskItem key={r.id} r={r} cbotToday={cbotToday} />
            ))}
          </ul>
          {loss && (
            <p data-testid="barreira-perda" className="num mt-2.5 rounded-[10px] bg-surface2 px-3 py-2 text-[12.5px]">
              Se a barreira for tocada e a CBOT terminar em <b>{usc(loss.cbotUsc)}</b> ({signedPct(loss.pct)} sobre hoje),
              você deixa de receber cerca de <b>{fmtCompactMoney(toDisplay(-loss.brl), currency)}</b>.
            </p>
          )}
        </>
      )}
      {others.length > 0 && (
        <ul aria-label="Outras operações com barreira" className={`divide-y divide-line ${atRisk.length > 0 ? 'mt-3' : ''}`}>
          {others.map((r) => (
            <DoneItem key={r.id} r={r} />
          ))}
        </ul>
      )}
      {caps.length > 0 && (
        <div className={atRisk.length > 0 || others.length > 0 ? 'mt-3 border-t border-line pt-3' : ''}>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-mut">Limite de ganho</h3>
          <ul aria-label="Calls vendidas" className="divide-y divide-line">
            {caps.map((c) => (
              <CapItem key={c.id} c={c} cbotToday={cbotToday} />
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
