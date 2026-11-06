import type { Cell, Matrix } from '../engine/matrix'
import { fmtMoney, fmtNum, fmtPct } from './format'
import { fmtMarginPct, fmtSignedMoney } from './fmtExtra'
import { cellMoney, fmtFx, moneyText, symbol, type Currency } from './matrixFormat'
import { MarginBasePill } from './MarginBasePill'

const base = 'rounded-[14px] border border-line bg-card px-3 py-[13px] sm:px-[15px]'
const small = 'block text-[11px] font-medium text-mut lg:text-xs'
const big = 'num my-0.5 block whitespace-nowrap text-[16px] font-bold leading-[1.15] tracking-tight sm:text-[18px] lg:text-[22px]'
const sub = 'block text-[11px] text-mut lg:text-[11.5px]'

function Extreme({
  testId,
  title,
  cell,
  currency,
}: {
  testId: string
  title: string
  cell: Cell | null
  currency: Currency
}) {
  const sym = symbol(currency)
  return (
    <div data-testid={testId} className={base}>
      <small className={small}>{title}</small>
      <b className={big}>{cell ? `${sym} ${moneyText(cell.priceBrl, cell.fx, currency)}` : '—'}</b>
      <span className={sub}>
        {cell ? (
          <>
            margem {fmtMarginPct(cell.marginPct)}
            {/* the per-ha figure only from sm: three tiles share one row below it */}
            <span className="hidden sm:inline">
              {' · '}
              {fmtSignedMoney(cellMoney(cell.marginPerHa, cell.fx, currency), currency, 0)}/ha
            </span>
          </>
        ) : (
          '—'
        )}
      </span>
    </div>
  )
}

export function MatrixKpis({
  matrix,
  currency,
  target,
  current,
}: {
  matrix: Matrix | null
  currency: Currency
  /** Null = no target set: the fourth card counts negative-margin cells instead. */
  target: number | null
  /**
   * Active scenario: price already in the display currency, and its margin. `blend` is set only
   * while "Considerar já vendido" is on and something is sold: the margin shown is then the blended
   * one, and the label says so (sold share + sold price, display currency).
   */
  current: {
    price: number | null
    marginPct: number | null
    cbotUsc: number
    fx: number
    blend?: { soldPct: number; soldPrice: number | null }
  }
}) {
  const flat = matrix ? matrix.cells.flat() : []
  let best: Cell | null = null
  let worst: Cell | null = null
  for (const c of flat) {
    if (best === null || c.priceBrl > best.priceBrl) best = c
    if (worst === null || c.priceBrl < worst.priceBrl) worst = c
  }
  const known = flat.some((c) => c.marginPct !== null)
  const floor = target === null ? 0 : target
  const below = flat.filter((c) => c.marginPct !== null && c.marginPct < floor).length
  const share = flat.length > 0 ? below / flat.length : 0

  return (
    <div className="grid grid-cols-3 gap-2.5 lg:grid-cols-4 lg:gap-3">
      <div
        data-testid="kpi-atual"
        className="col-span-3 rounded-[14px] bg-gradient-to-br from-g8 to-card border border-line px-[15px] py-[13px] text-tx lg:col-span-1"
      >
        <small className="block text-xs font-medium text-mut">Cenário atual</small>
        <b className="num my-0.5 block whitespace-nowrap text-[32px] font-bold leading-[1.1] tracking-[-0.02em] lg:text-[36px]">
          {current.price === null ? '—' : `${symbol(currency)} ${fmtNum(current.price, 2)}`}
          <span className="text-sm font-normal"> /sc</span>
        </b>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-mut">
          <span className="num">
            {current.blend
              ? `margem blendada ${fmtMarginPct(current.marginPct)} (${fmtPct(current.blend.soldPct, 0)} vendido a ${fmtMoney(current.blend.soldPrice, currency)})`
              : `margem ${fmtMarginPct(current.marginPct)}`}
          </span>
          <MarginBasePill />
          <span className="num">
            · CBOT {fmtNum(current.cbotUsc, 2)} · dólar {fmtFx(current.fx)}
          </span>
        </span>
      </div>
      <Extreme testId="kpi-melhor" title="Melhor célula da grade" cell={best} currency={currency} />
      <Extreme testId="kpi-pior" title="Pior célula da grade" cell={worst} currency={currency} />
      <div data-testid="kpi-abaixo" className={base}>
        <small className={small}>
          {target === null ? 'Células com margem negativa' : 'Células abaixo da meta'}
        </small>
        <b className={big}>{known ? `${below} de ${flat.length}` : '—'}</b>
        <span className={sub}>{known ? `${fmtNum(share * 100, 0)}% dos cenários` : '—'}</span>
      </div>
    </div>
  )
}
