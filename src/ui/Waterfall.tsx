import { fmtStepValue } from './explain'
import { fmtMoney, fmtPct } from './format'
import { useResult } from './useResult'

interface Row {
  label: string
  /** Segment in R$/sc on the 0..reference axis; null draws no bar. */
  from: number | null
  to: number | null
  /** Unsigned amount printed in the value column (the sign lives in the label). */
  value: number | null
  sign: '' | '+' | '−' | '='
  color: string
}

const POS = 'bg-bar-pos'
const NEG = 'bg-bar-neg'
const FINAL = 'bg-bar-final'

const sub = (a: number | null, b: number): number | null => (a === null ? null : a - b)
const abs = (n: number | null): number | null => (n === null ? null : Math.abs(n))

/**
 * Eight rows (R23): bolsa → + base → = referência → − frete → − taxas → = fazenda → − custo → = margem.
 * The base is drawn as the segment between bolsa and referência (green when a premium, red when a discount).
 */
export function Waterfall() {
  const { result, scenario, crop, farmInputs, currency, toDisplay } = useResult()
  // A locked sale adds an "effective dollar" step: the whole chain is then at that dollar, so it adds up.
  const eff = result.steps.find((st) => st.unit === 'R$/US$') ?? null
  const fxUsed = eff?.value ?? scenario.fx
  const ref = eff
    ? (result.steps.find((st) => st.label === 'Preço de referência')?.value ?? null)
    : result.referencePriceBrl
  const scale = ref !== null && ref > 0 ? ref : 1
  const freight = farmInputs.freightBrlPerSc
  const fees = farmInputs.portFeesBrlPerSc
  const farm = result.farmPriceBrl
  const cost = result.costPerSc
  const margin = result.marginPerSc
  const bolsa =
    ref === null || !(fxUsed > 0) || !Number.isFinite(scenario.cbotUsc)
      ? null
      : (scenario.cbotUsc / 100) * crop.bushelsPerSack * fxUsed
  const base = ref === null || bolsa === null ? null : ref - bolsa
  const afterFreight = sub(ref, freight)

  const rows: Row[] = [
    { label: eff ? 'Bolsa (CBOT × dólar efetivo)' : 'Bolsa (CBOT × dólar)', from: bolsa === null ? null : 0, to: bolsa, value: bolsa, sign: '', color: POS },
    {
      label: 'Prêmio do porto',
      from: bolsa,
      to: ref,
      value: abs(base),
      sign: base !== null && base < 0 ? '−' : '+',
      color: base !== null && base < 0 ? NEG : POS,
    },
    { label: 'Preço de referência', from: ref === null ? null : 0, to: ref, value: ref, sign: '=', color: POS },
    { label: 'Frete', from: afterFreight, to: ref, value: freight, sign: '−', color: NEG },
    { label: 'Taxas de porto/armazém', from: sub(afterFreight, fees), to: afterFreight, value: fees, sign: '−', color: NEG },
    { label: 'Preço na fazenda', from: farm === null ? null : 0, to: farm, value: farm, sign: '=', color: POS },
    {
      label: 'Custo',
      from: cost === null || farm === null ? null : farm - cost,
      to: cost === null ? null : farm,
      value: cost,
      sign: '−',
      color: NEG,
    },
    {
      label: 'Margem',
      from: margin === null ? null : 0,
      to: abs(margin),
      value: abs(margin),
      sign: margin !== null && margin < 0 ? '−' : '=',
      color: margin !== null && margin < 0 ? NEG : FINAL,
    },
  ]

  return (
    <>
    <div className="grid gap-1.5" role="list" aria-label="De onde vem o preço">
      {rows.map((r) => {
        let left = 0
        let width = 0
        if (r.from !== null && r.to !== null && Number.isFinite(r.from + r.to)) {
          const a = Math.min(Math.max(Math.min(r.from, r.to) / scale, 0), 1)
          const b = Math.min(Math.max(Math.max(r.from, r.to) / scale, 0), 1)
          left = a * 100
          width = Math.max(0, b - a) * 100
        }
        const total = r.sign === '=' || r.sign === ''
        return (
          <div
            key={r.label}
            role="listitem"
            className={`grid grid-cols-[minmax(110px,150px)_minmax(0,1fr)_auto] items-center gap-2 text-xs ${
              total ? 'font-semibold' : ''
            }`}
          >
            <span data-testid="wf-label" className="text-pretty">
              {r.sign ? `${r.sign} ${r.label}` : r.label}
            </span>
            <span className="relative h-4 rounded-md bg-bar-track" aria-hidden="true">
              <i
                className={`absolute inset-y-0 rounded-md ${r.color}`}
                style={{ left: `${left}%`, width: `${width}%` }}
              />
            </span>
            <b data-testid="wf-value" className="num min-w-[72px] whitespace-nowrap text-right">
              {fmtMoney(toDisplay(r.value), currency)}
            </b>
          </div>
        )
      })}
    </div>
    {eff && (
      <p data-testid="wf-fx" className="mt-1.5 text-[11px] text-mut">
        Dólar efetivo da venda: <b className="num text-tx">{fmtStepValue(eff, currency, scenario.fx)}</b> (
        {fmtPct(farmInputs.fxLockPct, 0)} do que está em aberto travado)
      </p>
    )}
    </>
  )
}
