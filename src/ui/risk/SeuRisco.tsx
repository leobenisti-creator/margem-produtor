import { useMemo, useState, type ReactNode } from 'react'
import {
  CHART_HALF,
  RISK_DRIVERS,
  biggestLoss,
  cardDelta,
  levelAt,
  partsAt,
  riskCurve,
  simulate,
  zeroPoint,
  type RiskDriver,
} from '../../engine/riskSim'
import { productionOf } from '../../engine/production'
import { useStore } from '../../state/StoreProvider'
import { Card } from '../Card'
import { useBarrierRisk } from '../useBarrierRisk'
import { BarrierRiskBlock } from './BarrierRiskBlock'
import { BasisBlock, DollarBlock } from './DriverBlocks'
import { RiskChart } from './RiskChart'
import { RiskPicker, cardMoveText, type PickerCard } from './RiskPicker'
import { THE, makeFmt } from './riskText'
import { SimBlock } from './SimBlock'
import { useRiskBase } from './useRiskBase'
import { ZeroBlock } from './ZeroBlock'

/** The block specific to a driver; the CBOT has none of its own (its barriers are in "Proteção e barreira"). */
const SPECIFIC_TITLE: Partial<Record<RiskDriver, string>> = {
  dolar: 'O dólar nos dois lados',
  basis: 'De onde vem o seu basis',
}

function Block({ title, children, first = false }: { title: string; children: ReactNode; first?: boolean }) {
  return (
    <section className={first ? '' : 'mt-3.5 border-t border-line pt-3.5'}>
      <h3 className="mb-1.5 text-sm font-bold">{title}</h3>
      {children}
    </section>
  )
}

const NO_MOVE: Record<RiskDriver, number> = { dolar: 0, cbot: 0, basis: 0 }

/**
 * The "Seu risco" tab: what moves the margin of today's position (not the matrix scenario). Three comparable cards and,
 * for the chosen driver, the simulation, where the margin zeroes, the whole range and the driver's own numbers.
 * The simulated move of each driver is local to this tab (never stored).
 */
export function SeuRisco() {
  const ctx = useRiskBase()
  const { state } = useStore()
  const fmt = useMemo(() => makeFmt(state.currency, ctx.base.fx), [state.currency, ctx.base.fx])
  const [picked, setPicked] = useState<RiskDriver | null>(null)
  const [moves, setMoves] = useState<Record<RiskDriver, number>>(NO_MOVE)

  const barrier = useBarrierRisk()
  const production = productionOf(ctx.inputs)
  const computable = useMemo(() => simulate(ctx, 'dolar', 0) !== null, [ctx])
  const cards = useMemo<PickerCard[]>(
    () => RISK_DRIVERS.map((d) => ({ driver: d, delta: cardDelta(ctx, d), move: cardMoveText(d, ctx.base) })),
    [ctx],
  )
  const driver: RiskDriver = picked ?? biggestLoss(ctx) ?? 'dolar'
  const move = moves[driver]
  const setMove = (v: number) => setMoves((m) => ({ ...m, [driver]: v }))

  const zero = useMemo(() => zeroPoint(ctx, driver, true), [ctx, driver])
  const zeroNo = useMemo(() => zeroPoint(ctx, driver, false), [ctx, driver])
  const curve = useMemo(() => riskCurve(ctx, driver), [ctx, driver])
  const valueAt = useMemo(
    () => (m: number) => {
      const w = partsAt(ctx, driver, m, true)
      const n = partsAt(ctx, driver, m, false)
      return w === null || n === null
        ? null
        : { withLocks: w.margin / w.productionSc, noLocks: n.margin / n.productionSc }
    },
    [ctx, driver],
  )

  if (!(production > 0)) {
    return (
      <Card title="O que mexe na sua margem" testId="seu-risco">
        <p data-testid="risk-vazio" className="text-[13px] text-mut">
          Informe área e produtividade para ver o que mexe na sua margem.
        </p>
      </Card>
    )
  }
  if (!computable) {
    return (
      <Card title="O que mexe na sua margem" testId="seu-risco">
        <p data-testid="risk-vazio" className="text-[13px] text-mut">
          Sem preço de CBOT, dólar ou basis para calcular o risco da sua margem.
        </p>
      </Card>
    )
  }

  const the = THE[driver]
  return (
    <div data-testid="seu-risco" className="grid gap-3.5">
      <Card title="O que mexe na sua margem">
        <p className="mb-3 text-[13px] text-mut">
          Calculado sobre a sua posição de hoje (não muda com o cenário escolhido na matriz). Escolha um para ver por
          dentro.
        </p>
        <RiskPicker cards={cards} selected={driver} onSelect={setPicked} fmt={fmt} />
      </Card>
      <Card title={`Detalhe: ${the}`} testId="risk-detalhe">
        <Block first title={`E se ${the} mexer?`}>
          <SimBlock ctx={ctx} driver={driver} move={move} onMove={setMove} fmt={fmt} />
        </Block>
        <Block title="Onde a margem zera">
          <ZeroBlock driver={driver} zero={zero} zeroNoLocks={zeroNo} today={levelAt(ctx, driver, 0)} />
        </Block>
        <Block title="A faixa inteira">
          <p className="mb-2 text-[13px] text-mut">
            Sua margem por saca conforme {the} muda. Passe o dedo ou o mouse para ler; toque para levar a simulação até
            ali.
          </p>
          <RiskChart
            driver={driver}
            points={curve}
            half={CHART_HALF[driver]}
            fmt={fmt}
            zero={zero}
            simMove={move}
            valueAt={valueAt}
            onPick={setMove}
          />
        </Block>
        {driver === 'cbot' && barrier !== null && (
          <Block title="Proteção e barreira">
            <BarrierRiskBlock ctx={ctx} fmt={fmt} />
          </Block>
        )}
        {driver !== 'cbot' && (
          <Block title={SPECIFIC_TITLE[driver] ?? ''}>
            {driver === 'dolar' && <DollarBlock ctx={ctx} state={state} fmt={fmt} />}
            {driver === 'basis' && <BasisBlock ctx={ctx} fmt={fmt} />}
          </Block>
        )}
      </Card>
    </div>
  )
}
