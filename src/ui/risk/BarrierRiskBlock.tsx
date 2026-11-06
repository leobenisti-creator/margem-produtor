import { touchedHedgeDeltaBrl } from '../../engine/barrierRisk'
import { productionOf } from '../../engine/production'
import { partsAt, type RiskCtx } from '../../engine/riskSim'
import { fmtNum, fmtPct } from '../format'
import { useBarrierRisk } from '../useBarrierRisk'
import { useSales } from '../useSales'
import { moveText, type RiskFmt } from './riskText'

const usc = (n: number) => `${fmtNum(n, 0)} US¢/bu`
const sc = (n: number) => `${fmtNum(n, 0)} sc`

/** CBOT moves (% of today's price) at which the margin with and without the touch is compared. */
const COMPARE_MOVES = [0, -10, -20] as const

/**
 * "Proteção e barreira" (CBOT): how much of the crop is covered today, how much only until a knock-out barrier is
 * touched, what is left uncovered if it is, and what the touch would cost in margin per sack at some final prices. Also
 * the calls sold, which cap the gain. The worst case: the barrier counts as touched at any moment, even if the price
 * comes back. null when the crop has no barrier operation and no call sold.
 */
export function BarrierRiskBlock({ ctx, fmt }: { ctx: RiskCtx; fmt: RiskFmt }) {
  const view = useBarrierRisk()
  const { summary } = useSales()
  if (view === null) return null
  const { atRisk, caps, split, cbotToday } = view
  const spec = ctx.inputs.hedge
  const production = productionOf(ctx.inputs)
  const base = Math.max(0, production - Math.min(summary.soldSc, production))
  const openNow = Math.max(0, base - split.totalSc)
  const openTouched = Math.max(0, base - split.firmSc)
  const pct = (v: number) => fmtPct(production > 0 ? v / production : 0, 0)

  const rows =
    atRisk.length > 0 && spec !== undefined && production > 0
      ? COMPARE_MOVES.flatMap((m) => {
          const parts = partsAt(ctx, 'cbot', m, true)
          if (parts === null) return []
          const level = cbotToday * (1 + m / 100)
          const asRead = parts.margin / parts.productionSc
          const delta = touchedHedgeDeltaBrl(spec, level, ctx.base.fx) / parts.productionSc
          return delta < -0.005 ? [{ move: m, level, asRead, touched: asRead + delta, delta }] : []
        })
      : []

  return (
    <div data-testid="risk-bloco-barreira">
      {atRisk.length > 0 && (
        <>
          <p className="mb-2 text-[13px] text-mut">
            Parte da sua proteção na bolsa vale só enquanto a CBOT não tocar a barreira. Se tocar, em qualquer momento, o que
            falta é perdido, mesmo que o preço volte.
          </p>
          <ul aria-label="Onde a proteção acaba" className="mb-3 grid gap-1 text-[13px]">
            {atRisk.map((r) => (
              <li key={r.id} data-testid={`risk-barreira-${r.id}`}>
                {r.kind === 'accumulator' ? (
                  <>Accumulator: vende a {usc(r.strikeUsc)}</>
                ) : (
                  <>Put: protege abaixo de {usc(r.strikeUsc)}</>
                )}
                , <b>até a CBOT {r.dir === 'alta' ? 'subir' : 'cair'} a {usc(r.barrierUsc)}</b>{' '}
                <span className="num text-mut">({moveText('cbot', r.distancePct * 100)} sobre hoje)</span>. Depois do toque, essas{' '}
                <span className="num">{sc(r.sc - r.guaranteedSc)}</span> ficam sem proteção.
              </li>
            ))}
          </ul>
          <table className="w-full border-collapse text-[12.5px]">
            <caption className="sr-only">Cobertura da bolsa hoje e se a barreira for tocada</caption>
            <thead>
              <tr className="text-[11px] font-medium text-mut">
                <th scope="col" className="py-1 text-left font-medium">
                  Sacas
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Hoje
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Se a barreira for tocada
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-line" data-testid="risk-cob-firme">
                <th scope="row" className="py-1.5 text-left font-normal">
                  Cobertas com firmeza
                </th>
                <td className="num py-1.5 text-right">
                  {sc(split.firmSc)} <span className="text-mut">({pct(split.firmSc)})</span>
                </td>
                <td className="num py-1.5 text-right">
                  {sc(split.firmSc)} <span className="text-mut">({pct(split.firmSc)})</span>
                </td>
              </tr>
              <tr className="border-t border-line" data-testid="risk-cob-barreira">
                <th scope="row" className="py-1.5 text-left font-normal">
                  Cobertas só até a barreira
                </th>
                <td className="num py-1.5 text-right">
                  {sc(split.barrierSc)} <span className="text-mut">({pct(split.barrierSc)})</span>
                </td>
                <td className="num py-1.5 text-right text-bar-neg">0 sc</td>
              </tr>
              <tr className="border-t border-line font-semibold" data-testid="risk-cob-aberto">
                <th scope="row" className="py-1.5 text-left font-semibold">
                  Sem cobertura na bolsa
                </th>
                <td className="num py-1.5 text-right">
                  {sc(openNow)} <span className="font-normal text-mut">({pct(openNow)})</span>
                </td>
                <td className="num py-1.5 text-right text-bar-neg">
                  {sc(openTouched)} <span className="font-normal text-mut">({pct(openTouched)})</span>
                </td>
              </tr>
            </tbody>
          </table>
          {rows.length > 0 ? (
            <div className="mt-3">
              <p className="mb-1 text-[13px] text-mut">
                Margem por saca se a barreira for tocada e a CBOT terminar a safra em:
              </p>
              <table data-testid="risk-barreira-tabela" className="w-full border-collapse text-[12.5px]">
                <caption className="sr-only">Margem por saca com e sem o toque na barreira</caption>
                <thead>
                  <tr className="text-[11px] font-medium text-mut">
                    <th scope="col" className="py-1 text-left font-medium">
                      CBOT no fim
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      Sem tocar
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      Se tocar
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      Diferença
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.move} className="border-t border-line">
                      <th scope="row" className="num py-1.5 text-left font-normal">
                        {usc(r.level)} <span className="text-mut">({r.move === 0 ? 'hoje' : moveText('cbot', r.move)})</span>
                      </th>
                      <td className="num py-1.5 text-right">{fmt.money(r.asRead)}/sc</td>
                      <td className="num py-1.5 text-right">{fmt.money(r.touched)}/sc</td>
                      <td className="num py-1.5 text-right font-semibold text-bar-neg">{fmt.signedMoney(r.delta)}/sc</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p data-testid="risk-barreira-sem-perda" className="mt-2.5 text-[12.5px] text-mut">
              Com a CBOT a até 20% abaixo de hoje, a proteção ainda não pagaria nada: tocar a barreira não mudaria a margem
              nesses preços.
            </p>
          )}
        </>
      )}
      {caps.length > 0 && (
        <div className={atRisk.length > 0 ? 'mt-3.5 border-t border-line pt-3' : ''}>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-mut">Limite de ganho</h4>
          <ul aria-label="Calls vendidas" className="grid gap-1 text-[13px]">
            {caps.map((c) => (
              <li key={c.id} data-testid={`risk-limite-${c.id}`}>
                Call vendida: acima de <b className="num">{usc(c.strikeUsc)}</b> a alta não aumenta o seu ganho em{' '}
                <span className="num">{sc(c.sc)}</span>
                <span className="num text-mut"> ({moveText('cbot', c.distancePct * 100)} sobre hoje)</span>.
                {c.barrier && (
                  <span className="text-mut">
                    {' '}
                    O limite acaba se a CBOT {c.barrier.dir === 'alta' ? 'subir' : 'cair'} a {usc(c.barrier.price)}.
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
