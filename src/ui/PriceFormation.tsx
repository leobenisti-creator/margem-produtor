import { useState, type ReactNode } from 'react'
import { effectiveFx, fobUsdPerSc, portFeesBrlPerTon, referencePriceBrl } from '../engine/calc'
import { SACK_TON } from '../engine/units'
import { scenarioBasisUsc } from '../state/basis'
import { useStore } from '../state/StoreProvider'
import { DocumentOverlay } from './DocumentOverlay'
import { fmtMoney, fmtNum, fmtUsd } from './format'
import { fmtFx } from './matrixFormat'
import { useResult } from './useResult'
import { useResultadosBase } from './useResultadosBase'

// A quiet detail control: small text, but still a 44px touch target on phones.
const unitBtn =
  'min-h-[44px] rounded-[7px] px-2 text-[11px] text-mut underline-offset-2 hover:text-tx hover:underline md:min-h-[28px]'

function Line({
  sign,
  label,
  value,
  detail,
  total,
  testId,
}: {
  sign: '' | '+' | '−' | '='
  label: string
  value: ReactNode
  detail?: ReactNode
  total?: boolean
  testId?: string
}) {
  const row = (
    <span className={`grid grid-cols-[minmax(110px,170px)_minmax(0,1fr)] items-center gap-2 ${total ? 'font-semibold' : ''}`}>
      <span>{sign ? `${sign} ${label}` : label}</span>
      <b data-testid={testId} className="num text-right">
        {value}
      </b>
    </span>
  )
  if (!detail) return <div className="py-1 text-xs">{row}</div>
  return (
    <details className="py-1 text-xs">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden" aria-label={`${label}: ver detalhe`}>
        {row}
      </summary>
      <p className="num mt-0.5 pl-1 text-[11.5px] text-mut">{detail}</p>
    </details>
  )
}

/**
 * "Formação do preço" of the active matrix cell (the chosen scenario): CBOT + premium × dollar = FOB, minus port
 * fees and freight = the farm price. Every price is in money per sack (the top currency); one small switch shows
 * them all in US¢/bu instead. The finer units (US$/sc, R$/t) sit behind each line's detail.
 */
export function PriceFormation() {
  const { result, scenario, crop, farmInputs, currency, toDisplay } = useResult()
  const [inCents, setInCents] = useState(false)
  // A locked sale puts the whole chain at the effective dollar (same reading as the Waterfall).
  const eff = result.steps.find((st) => st.unit === 'R$/US$') ?? null
  const fxUsed = eff?.value ?? scenario.fx
  const fob = eff ? (result.steps.find((st) => st.label === 'Preço de referência')?.value ?? null) : result.referencePriceBrl
  const bolsa = (scenario.cbotUsc / 100) * crop.bushelsPerSack * fxUsed
  const premium = fob === null || !Number.isFinite(bolsa) ? null : fob - bolsa
  const freight = farmInputs.freightBrlPerSc
  const fees = farmInputs.portFeesBrlPerSc
  const perSc = (brl: number | null) => `${fmtMoney(toDisplay(brl), currency)}/sc`
  const perT = (brl: number) => `${fmtMoney(toDisplay(brl / SACK_TON), currency)}/t`
  // A price in R$/sc as US¢/bu at the dollar the chain is computed with (the inverse of CBOT US¢/bu × bushels × dollar).
  const perBu = (brl: number | null) => {
    const c = brl === null ? Number.NaN : (brl / (crop.bushelsPerSack * fxUsed)) * 100
    return Number.isFinite(c) ? `${fmtNum(c, 2)} US¢/bu` : '—'
  }
  const price = (brl: number | null) => (inCents ? perBu(brl) : perSc(brl))
  const moneyUnit = `${currency === 'USD' ? 'US$' : 'R$'}/sc`
  const cents = scenario.cbotUsc + scenario.basisUsc
  return (
    <div data-testid="price-formation" className="rounded-[12px] border border-line bg-card px-3 py-2.5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[12.5px] font-bold">Formação do preço</h3>
        <button type="button" onClick={() => setInCents((v) => !v)} className={unitBtn}>
          {inCents ? `Ver em ${moneyUnit}` : 'Ver em US¢/bu'}
        </button>
      </div>
      <Line sign="" label="CBOT" value={inCents ? `${fmtNum(scenario.cbotUsc, 2)} US¢/bu` : perSc(bolsa)} />
      <Line
        sign="+"
        label="Prêmio do porto"
        testId="pf-premium"
        value={inCents ? `${fmtNum(scenario.basisUsc, 2)} US¢/bu` : perSc(premium)}
      />
      <Line sign="" label="Dólar" value={`${fmtFx(fxUsed)} R$/US$`} />
      <Line
        sign="="
        label="FOB"
        total
        testId="pf-fob"
        value={inCents ? `${fmtNum(cents, 2)} US¢/bu` : perSc(fob)}
        detail={`CBOT + prêmio = ${fmtNum(cents, 2)} US¢/bu · ${fmtUsd(fobUsdPerSc(crop, scenario))}/sc`}
      />
      <Line sign="−" label="Custo portuário" testId="pf-fees" value={price(fees)} detail={`${perT(fees)} (${fmtNum(portFeesBrlPerTon(farmInputs), 2)} R$/t)`} />
      <Line sign="−" label="Frete até o porto" testId="pf-freight" value={price(freight)} detail={perT(freight)} />
      <Line sign="=" label="Preço final na fazenda" total testId="pf-final" value={price(result.farmPriceBrl)} />
    </div>
  )
}

/** The steps of the farm price of the chosen scenario, from the CBOT to the price on the farm. */
export interface PriceChain {
  /** The dollar the chain is computed with: the effective one when part of the dollar is locked. */
  fx: number
  /** US¢/bu of the CBOT, of the FOB point's own premium and of the producer's basis simulation (0 when none). */
  cbotUsc: number
  premiumUsc: number
  adjustUsc: number
  /** R$/sc steps. */
  bolsa: number
  premium: number
  adjust: number
  fob: number
  freight: number
  fees: number
  farm: number
  /** Farm price − bolsa: the producer's basis. */
  basis: number
}

/**
 * The chain behind the farm price of the chosen scenario. The final price is the engine's `farmPriceBrl` (through
 * `useResult`), the FOB is the engine's `referencePriceBrl` (at the premium in use); the other steps are the
 * same terms, split for reading: FOB − freight − fees + adjustment = the farm price.
 * `simulated`: the basis of the scenario is a simulation (an override of the FOB point's premium).
 */
export function usePriceChain(): { chain: PriceChain | null; simulated: boolean } {
  const { state } = useStore()
  const { result, scenario, crop, farmInputs } = useResult()
  const eff = effectiveFx(farmInputs.fxLockPct, farmInputs.fxLockRate, scenario.fx)
  const fx = Number.isFinite(eff) && eff > 0 ? eff : scenario.fx
  const farm = result.farmPriceBrl
  // The premium in use (Lavoura e custos) is the step "prêmio do porto"; a basis simulated in Resultados is the adjustment.
  const simulated = state.overrides.simBasisUsc !== undefined && Number.isFinite(scenarioBasisUsc(state))
  const premiumUsc = simulated ? scenarioBasisUsc(state) : scenario.basisUsc
  const adjustUsc = simulated ? scenario.basisUsc - premiumUsc : 0
  const perUsc = (crop.bushelsPerSack / 100) * fx
  const bolsa = scenario.cbotUsc * perUsc
  const premium = premiumUsc * perUsc
  const adjust = adjustUsc * perUsc
  // The FOB is at the premium in use; a basis simulation comes after it, as an adjustment.
  const fob = referencePriceBrl(crop, { cbotUsc: scenario.cbotUsc, basisUsc: premiumUsc, fx })
  if (farm === null || ![farm, bolsa, premium, adjust, fob].every(Number.isFinite)) return { chain: null, simulated }
  return {
    chain: {
      fx,
      cbotUsc: scenario.cbotUsc,
      premiumUsc,
      adjustUsc,
      bolsa,
      premium,
      adjust,
      fob,
      freight: farmInputs.freightBrlPerSc,
      fees: farmInputs.portFeesBrlPerSc,
      farm,
      basis: farm - bolsa,
    },
    simulated,
  }
}

function Step({
  label,
  value,
  how,
  testId,
  result = false,
}: {
  label: string
  value: string
  how?: ReactNode
  testId?: string
  result?: boolean
}) {
  return (
    <div
      className={
        result
          ? 'mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 rounded-[10px] bg-g7/15 px-2.5 py-3'
          : 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-t border-line py-2.5 first:border-t-0'
      }
    >
      <span className={result ? 'text-[13px] font-bold' : 'text-[13px]'}>{label}</span>
      <b data-testid={testId} className={`num text-right ${result ? 'text-[18px]' : 'font-semibold'}`}>
        {value}
      </b>
      {how && <span className="col-span-2 text-[11.5px] text-mut">{how}</span>}
    </div>
  )
}

/**
 * "Formação do preço da fazenda" as a document: the chosen scenario's farm price built step by step (CBOT, the
 * CBOT in reais, + port premium = FOB, − freight, − port fees, ± the producer's basis simulation = the price on the
 * farm) and the basis (farm price − bolsa). A switch shows every price in US¢/bu instead of money per sack.
 */
export function PriceFormationOverlay({
  onClose,
  returnFocus,
}: {
  onClose: () => void
  returnFocus?: () => HTMLElement | null
}) {
  const { scenario, crop, currency, toDisplay } = useResult()
  const { custom, basisSimulated } = useResultadosBase()
  const { chain, simulated } = usePriceChain()
  const [inCents, setInCents] = useState(false)
  const moneySym = currency === 'USD' ? 'US$' : 'R$'
  const segBtn = (active: boolean) =>
    `min-h-[44px] px-3 text-[12.5px] md:min-h-[36px] ${active ? 'bg-surface2 font-bold text-tx' : 'text-mut'}`

  // A price in R$/sc as US¢/bu at the dollar the chain is computed with (the inverse of CBOT × bushels × dollar).
  const show = (brl: number | null) => {
    if (brl === null || !chain) return '—'
    if (!inCents) return `${fmtMoney(toDisplay(brl), currency)}/sc`
    const c = (brl / (crop.bushelsPerSack * chain.fx)) * 100
    return Number.isFinite(c) ? `${fmtNum(c, 2)} US¢/bu` : '—'
  }
  const scenarioText =
    custom || basisSimulated
      ? `No cenário: CBOT ${fmtNum(scenario.cbotUsc, 0)} US¢/bu · dólar R$ ${fmtFx(scenario.fx)}${simulated ? ' · basis simulado' : ''}`
      : 'Com os preços de hoje'

  return (
    <DocumentOverlay
      title="Formação do preço da fazenda"
      kicker="Cálculo"
      onClose={onClose}
      returnFocus={returnFocus}
      testId="price-formation-overlay"
    >
      {chain === null ? (
        <p className="text-mut">Sem preço de CBOT ou dólar para montar o cálculo.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <span className="text-[11.5px] text-mut">{scenarioText}</span>
            <div role="group" aria-label="Unidade do cálculo" className="inline-flex overflow-hidden rounded-[10px] border border-line">
              <button type="button" aria-pressed={!inCents} onClick={() => setInCents(false)} className={segBtn(!inCents)}>
                {moneySym}/sc
              </button>
              <button type="button" aria-pressed={inCents} onClick={() => setInCents(true)} className={segBtn(inCents)}>
                US¢/bu
              </button>
            </div>
          </div>
          <div data-testid="pf-steps">
            <Step
              label="Bolsa de Chicago (CBOT)"
              testId="pf-cbot"
              value={`${fmtNum(chain.cbotUsc, 2)} US¢/bu`}
              how="O preço na bolsa."
            />
            {!inCents && (
              <Step
                label={currency === 'USD' ? 'Bolsa em dólares' : 'Bolsa em reais'}
                testId="pf-bolsa"
                value={show(chain.bolsa)}
                how={`${fmtNum(chain.cbotUsc, 2)} US¢ ÷ 100 × ${fmtNum(crop.bushelsPerSack, 4)} bu por saca × dólar R$ ${fmtFx(chain.fx)}`}
              />
            )}
            <Step
              label="+ Prêmio do porto"
              testId="pf-premium"
              value={inCents ? `${fmtNum(chain.premiumUsc, 2)} US¢/bu` : show(chain.premium)}
              how="O que o porto paga a mais ou a menos que a bolsa."
            />
            <Step label="= Preço FOB (no navio)" testId="pf-fob" value={show(chain.fob)} />
            <Step label="− Frete até o porto" testId="pf-freight" value={show(chain.freight)} how="O frete que você informou." />
            <Step label="− Taxas de porto e armazém" testId="pf-fees" value={show(chain.fees)} />
            {simulated && (
              <Step
                label={`${chain.adjustUsc < 0 ? '−' : '+'} Seu ajuste de basis`}
                testId="pf-adjust"
                value={inCents ? `${fmtNum(Math.abs(chain.adjustUsc), 2)} US¢/bu` : show(Math.abs(chain.adjust))}
                how="Você alterou o basis nesta tela."
              />
            )}
            <Step
              result
              label="= Preço na sua fazenda"
              testId="pf-final"
              value={show(chain.farm)}
              how={
                <>
                  Basis (preço da fazenda − bolsa):{' '}
                  <b data-testid="pf-basis" className="num">
                    {chain.basis < 0 ? '−' : ''}
                    {show(Math.abs(chain.basis))}
                  </b>
                </>
              }
            />
          </div>
        </>
      )}
    </DocumentOverlay>
  )
}
