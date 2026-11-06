import { useMemo, type ReactNode } from 'react'
import { SIM_RANGE, marginPct, simulate, type RiskCtx, type RiskDriver } from '../../engine/riskSim'
import { NumberField } from '../NumberField'
import { THE, UNIT_LABEL, levelText, moveText, pctText, type RiskFmt } from './riskText'

const btn = 'min-h-[44px] rounded-[9px] border border-line-strong px-3 text-xs font-semibold text-tx md:min-h-[38px]'

function Tile({ title, children, sub }: { title: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-[12px] bg-surface2 p-2.5">
      <div className="text-[11px] text-mut">{title}</div>
      <div className="num mt-0.5 text-[17px] font-bold">{children}</div>
      {sub}
    </div>
  )
}

const tone = (n: number) => (n < 0 ? 'text-bar-neg' : 'text-bar-pos')

/** One bar under a tile: its width is the size of the change (relative to the biggest of the two), solid or dashed. */
function Bar({ value, max, dashed }: { value: number; max: number; dashed?: boolean }) {
  const w = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0
  const cls = dashed
    ? value < 0
      ? 'border-[1.5px] border-dashed border-bar-neg'
      : 'border-[1.5px] border-dashed border-bar-pos'
    : value < 0
      ? 'bg-bar-neg'
      : 'bg-bar-pos'
  return (
    <div
      aria-hidden="true"
      style={{ width: `${w}%` }}
      className={`mt-1.5 h-3 rounded-[5px] ${cls}`}
    />
  )
}

/** "E se {o dólar} mexer?": the slider, the number next to it and the live result (with and without the fixings). */
export function SimBlock({
  ctx,
  driver,
  move,
  onMove,
  fmt,
}: {
  ctx: RiskCtx
  driver: RiskDriver
  move: number
  onMove: (v: number) => void
  fmt: RiskFmt
}) {
  const range = SIM_RANGE[driver]
  const sim = useMemo(() => simulate(ctx, driver, move), [ctx, driver, move])
  const the = THE[driver]
  const P = sim?.withLocks.today.productionSc ?? 0
  const label = `Mudança em ${the}`
  const pctBase = ctx.inputs.marginBase
  const pctWord = pctBase === 'custo' ? 'do custo' : 'da receita'

  let body: ReactNode
  if (sim === null) {
    body = (
      <p role="status" data-testid="risk-sim-erro" className="text-[13px] text-mut">
        Não é possível calcular com {the} nesse valor. Escolha uma mudança menor.
      </p>
    )
  } else {
    const w = sim.withLocks
    const n = sim.noLocks
    const maxD = Math.max(Math.abs(w.delta), Math.abs(n.delta), 1)
    const sc = (brl: number) => fmt.money(brl / P)
    const row = (name: string, today: number, at: number, hl = false) => (
      <tr key={name} className={hl ? 'bg-surface2 font-bold' : ''}>
        <th scope="row" className="py-1.5 pr-1 text-left font-normal">
          {hl ? <b>{name}</b> : name}
        </th>
        <td className="num py-1.5 text-right">{sc(today)}</td>
        <td className="num py-1.5 text-right">{sc(at)}</td>
        <td className={`num py-1.5 text-right ${name === 'Custo' ? '' : tone(at - today)}`}>{fmt.signedMoney((at - today) / P)}</td>
      </tr>
    )
    body = (
      <>
        <p data-testid="risk-sim-line" className="text-[13px] text-mut">
          {move === 0 ? (
            <>
              Hoje: {the} a <b className="num text-tx">{levelText(driver, sim.level)}</b>.
            </>
          ) : (
            <>
              {the[0].toUpperCase() + the.slice(1)} a <b className="num text-tx">{levelText(driver, sim.level)}</b> (
              {moveText(driver, move)} em relação a hoje).
            </>
          )}
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <Tile
            title="Sua margem nesse cenário"
            sub={
              <div className="num mt-px text-[11px] text-mut">
                {pctText(marginPct(w.at, pctBase))} {pctWord} · {fmt.compact(w.at.margin)}
              </div>
            }
          >
            <span data-testid="risk-sim-margin">{sc(w.at.margin)}</span>/sc
          </Tile>
          <Tile
            title="Mudança com suas travas"
            sub={<Bar value={w.delta} max={maxD} />}
          >
            <span data-testid="risk-sim-with" className={tone(w.delta)}>
              {fmt.signedCompact(w.delta)}
            </span>
          </Tile>
          <Tile title="Mudança sem nada travado" sub={<Bar value={n.delta} max={maxD} dashed />}>
            <span data-testid="risk-sim-without" className="text-mut">
              {fmt.signedCompact(n.delta)}
            </span>
          </Tile>
        </div>
        <p data-testid="risk-sim-lock" className="text-[11.5px] text-mut">
          A trava vale <b className="num text-tx">{fmt.signedCompact(sim.lockValue)}</b> neste cenário (positivo = protege;
          negativo = ganho que você deixa de ter).
        </p>
        <table className="w-full border-collapse text-[12.5px]">
          <caption className="sr-only">Por saca: preço, receita, custo e margem, hoje, no cenário simulado e a diferença</caption>
          <thead>
            <tr className="text-[11px] font-medium text-mut">
              <th scope="col" className="py-1 text-left font-medium">
                Por saca
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Hoje
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Nesse cenário
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Diferença
              </th>
            </tr>
          </thead>
          <tbody className="[&_td]:border-t [&_td]:border-line [&_th]:border-t [&_th]:border-line">
            <tr data-testid="risk-sim-preco">
              <th scope="row" className="py-1.5 pr-1 text-left font-normal">
                Preço
              </th>
              <td className="num py-1.5 text-right">{fmt.money(w.today.farmPrice)}</td>
              <td className="num py-1.5 text-right">{fmt.money(w.at.farmPrice)}</td>
              <td className={`num py-1.5 text-right ${tone(w.at.farmPrice - w.today.farmPrice)}`}>
                {fmt.signedMoney(w.at.farmPrice - w.today.farmPrice)}
              </td>
            </tr>
            {row('Receita', w.today.revenue, w.at.revenue)}
            {row('Custo', w.today.cost, w.at.cost)}
            {row('Margem', w.today.margin, w.at.margin, true)}
          </tbody>
        </table>
      </>
    )
  }

  return (
    <div className="grid gap-2.5">
      <p className="text-[13px] text-mut">Arraste a barra ou digite quanto quer supor. Vale só para esta simulação.</p>
      <input
        type="range"
        aria-label={label}
        min={range.min}
        max={range.max}
        step={range.step}
        value={move}
        onChange={(e) => onMove(Number(e.target.value))}
        className="h-11 w-full accent-[var(--gold)]"
      />
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <span className="num text-[11.5px] text-mut">
          {moveText(driver, range.min)} ← <b className="text-tx">hoje</b> → {moveText(driver, range.max)}
        </span>
        <div className="flex items-end gap-2">
          <div className="w-[130px]">
            <NumberField
              label={`Quanto supor (${UNIT_LABEL[driver]})`}
              labelHidden
              value={move}
              unit={UNIT_LABEL[driver]}
              min={range.min}
              max={range.max}
              onCommit={(v) => onMove(Math.min(range.max, Math.max(range.min, v)))}
            />
          </div>
          <button type="button" onClick={() => onMove(0)} className={btn}>
            zerar
          </button>
        </div>
      </div>
      <div className="grid gap-2.5">{body}</div>
    </div>
  )
}
