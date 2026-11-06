import type { ReactNode } from 'react'
import type { RiskDriver, ZeroPoint } from '../../engine/riskSim'
import { fmtNum } from '../format'
import { THE, levelText } from './riskText'

/** "Folga": the distance from today to the zero, in the unit of the driver. */
function slackText(d: RiskDriver, z: ZeroPoint): string {
  const dir = z.move < 0 ? 'abaixo' : 'acima'
  const v = d === 'basis' ? `R$ ${fmtNum(z.slack, 2)}/sc` : `${fmtNum(z.slack, 1)}%`
  return `${v} ${dir} de hoje`
}

function Ruler({ driver, zero, today }: { driver: RiskDriver; zero: ZeroPoint; today: number | null }) {
  // Zero and today at fixed spots on a short line: the green stretch is the room before the margin turns negative.
  const zeroLeft = zero.move < 0
  const mk = (left: string, name: string, level: number | null) => (
    <div className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-center text-[11px]" style={{ left }}>
      <i className="mx-auto block h-[30px] w-0.5 bg-tx" />
      <span className="mt-0.5 block">
        {name}
        <br />
        <b className="num">{levelText(driver, level)}</b>
      </span>
    </div>
  )
  return (
    <div aria-hidden="true" data-testid="risk-ruler" className="relative mx-1 mt-1.5 h-[62px]">
      <div className="absolute inset-x-0 top-5 h-1.5 overflow-hidden rounded bg-bar-track">
        <div className="absolute inset-y-0 bg-bar-pos" style={{ left: '12%', right: '12%' }} />
        <div className="absolute inset-y-0 bg-bar-neg" style={zeroLeft ? { left: 0, width: '12%' } : { right: 0, width: '12%' }} />
      </div>
      {mk(zeroLeft ? '12%' : '88%', 'zera', zero.level)}
      {mk(zeroLeft ? '88%' : '12%', 'hoje', today)}
    </div>
  )
}

/** "Onde a margem zera": the driver value that takes the margin to zero, the room left and a ruler. */
export function ZeroBlock({
  driver,
  zero,
  zeroNoLocks,
  today,
}: {
  driver: RiskDriver
  /** With the producer's fixings; null when the margin never reaches zero in the range. */
  zero: ZeroPoint | null
  zeroNoLocks: ZeroPoint | null
  today: number | null
}) {
  const the = THE[driver]
  let main: ReactNode
  if (zero === null) {
    main = <>A margem não chega a zero dentro da faixa calculada para {the}.</>
  } else if (zero.fromNegative) {
    main = (
      <>
        Sua margem já está negativa hoje. Ela volta a zero com {the} a <b className="num text-tx">{levelText(driver, zero.level)}</b>
        {' '}
        (<span className="num">{slackText(driver, zero)}</span>).
      </>
    )
  } else {
    main = (
      <>
        Sua margem zera com {the} a <b className="num text-tx">{levelText(driver, zero.level)}</b>. Folga:{' '}
        <b className="num text-tx">{slackText(driver, zero)}</b>.
      </>
    )
  }
  const differs = zero !== null && zeroNoLocks !== null && Math.abs(zeroNoLocks.move - zero.move) > 1e-6
  return (
    <div>
      <p data-testid="risk-zero-text" className="text-[13px] text-mut">
        {main}
        {differs && (
          <>
            {' '}
            Sem nada travado ela zeraria com {the} a <span className="num">{levelText(driver, zeroNoLocks.level)}</span>.
          </>
        )}
      </p>
      {zero !== null && <Ruler driver={driver} zero={zero} today={today} />}
    </div>
  )
}
