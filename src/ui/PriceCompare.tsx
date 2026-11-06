import { useMemo } from 'react'
import { findFob, OUTRO_FOB_ID, shortFobLabel } from '../data/fobPoints'
import { effectiveFx, referencePriceBrl } from '../engine/calc'
import { ALL_FIXED, marginParts } from '../engine/sensitivity'
import { fobBasisUsc, scenarioBasisUsc } from '../state/basis'
import { useStore } from '../state/StoreProvider'
import { fmtCompactMoney, fmtSignedMoney } from './fmtExtra'
import { fmtMoney, fmtNum, fmtPct } from './format'
import { useResult } from './useResult'
import { useResultadosBase } from './useResultadosBase'

/** The pieces of the gap between the farm price and the praça's market price (R$/sc); they add up to the gap. */
export interface PriceGap {
  market: number
  farm: number
  /** farm − market */
  diff: number
  freight: number
  fees: number
  /** The producer's own premium (Lavoura e custos) against the praça's, in R$/sc (0 when none). */
  premium: number
  /** A basis simulated in Resultados, in R$/sc (0 when none). */
  sim: number
  /** Whatever is left: the locked dollar (the farm price uses the effective dollar, the market the scenario's). */
  dollar: number
}

/**
 * Farm price against the praça's estimated market price, both for the chosen scenario. The market price is what
 * `FobMarketPrice` shows (the engine's `referencePriceBrl` at the chosen CBOT and dollar and the point's own premium),
 * the farm price is the engine's `farmPriceBrl`. Null for the "Outro" point (no market price) or when unusable.
 */
export function usePriceGap(): PriceGap | null {
  const { state } = useStore()
  const { result, scenario, crop, farmInputs } = useResult()
  if (state.fobId === OUTRO_FOB_ID) return null
  const marketBasisUsc = fobBasisUsc(state)
  const market = referencePriceBrl(crop, { ...scenario, basisUsc: marketBasisUsc })
  const farm = result.farmPriceBrl
  if (!Number.isFinite(market) || farm === null || !Number.isFinite(farm)) return null
  const diff = farm - market
  const eff = effectiveFx(farmInputs.fxLockPct, farmInputs.fxLockRate, scenario.fx)
  const fx = Number.isFinite(eff) && eff > 0 ? eff : scenario.fx
  const perUsc = (crop.bushelsPerSack / 100) * fx
  const ownUsc = scenarioBasisUsc(state)
  const premium = Number.isFinite(ownUsc) ? (ownUsc - marketBasisUsc) * perUsc : 0
  const sim = state.overrides.simBasisUsc === undefined ? 0 : (scenario.basisUsc - ownUsc) * perUsc
  const freight = -farmInputs.freightBrlPerSc
  const fees = -farmInputs.portFeesBrlPerSc
  return { market, farm, diff, freight, fees, premium, sim, dollar: diff - freight - fees - premium - sim }
}

const sign = (n: number) => (n < 0 ? '−' : '+')

/**
 * "Seu preço contra o mercado da praça": a collapsed row under the DRE. Two bars (your farm price, the praça's
 * estimated market price), the difference in money per sack and %, what it means on the sacks not sold yet and why
 * the two differ (freight, port fees, an edited premium, a locked dollar).
 */
export function PriceCompare() {
  const { state } = useStore()
  const { crop, chosen, inputs, tranches } = useResultadosBase()
  const { currency, toDisplay } = useResult()
  const gap = usePriceGap()
  const unsold = useMemo(
    () => marginParts(crop, chosen, inputs, tranches, ALL_FIXED)?.unsoldSc ?? null,
    [crop, chosen, inputs, tranches],
  )
  if (gap === null) return null
  const point = findFob(state.fobId)
  const praca = point ? shortFobLabel(point) : 'praça'
  const top = Math.max(gap.farm, gap.market, 1e-9)
  const width = (n: number) => `${Math.min(Math.max(n / top, 0), 1) * 100}%`
  const tone = gap.diff < 0 ? 'text-danger' : 'text-tx'
  const money = (n: number) => fmtMoney(toDisplay(n), currency)
  const signedMoney = (n: number) => `${sign(n)}${money(Math.abs(n))}`
  const diffPct = gap.market > 0 ? gap.diff / gap.market : null
  const onUnsold = unsold === null ? null : gap.diff * unsold
  const parts: Array<{ key: string; label: string; value: number }> = [
    { key: 'frete', label: 'Frete até o porto', value: gap.freight },
    { key: 'taxas', label: 'Taxas de porto e armazém', value: gap.fees },
    ...(Math.abs(gap.premium) >= 0.005 ? [{ key: 'premio', label: 'Prêmio informado por você', value: gap.premium }] : []),
    ...(Math.abs(gap.sim) >= 0.005 ? [{ key: 'sim', label: 'Basis simulado nesta tela', value: gap.sim }] : []),
    ...(Math.abs(gap.dollar) >= 0.005 ? [{ key: 'dolar', label: 'Dólar travado', value: gap.dollar }] : []),
  ]
  return (
    <details data-testid="price-compare" className="group mt-3 border-t border-line">
      <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-2.5 text-[13px] text-mut [&::-webkit-details-marker]:hidden">
        <span>
          <b className="font-semibold text-tx">Seu preço contra o mercado da praça</b> · {praca}
        </span>
        <svg aria-hidden viewBox="0 0 10 6" className="h-1.5 w-2.5 shrink-0 transition-transform group-open:rotate-180">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="grid gap-2.5 pb-3.5">
        <div className="grid gap-1.5" aria-hidden="false">
          <div>
            <div className="flex justify-between gap-2 text-xs">
              <span>Preço na sua fazenda</span>
              <b data-testid="cmp-farm" className="num">
                {money(gap.farm)}/sc
              </b>
            </div>
            <span className="relative mt-1 block h-2.5 rounded-md bg-bar-track" aria-hidden="true">
              <i className="absolute inset-y-0 left-0 rounded-md bg-g7" style={{ width: width(gap.farm) }} />
            </span>
          </div>
          <div>
            <div className="flex justify-between gap-2 text-xs">
              <span>
                Preço de mercado em {praca} <span className="text-mut">(estimado)</span>
              </span>
              <b data-testid="cmp-market" className="num">
                {money(gap.market)}/sc
              </b>
            </div>
            <span className="relative mt-1 block h-2.5 rounded-md bg-bar-track" aria-hidden="true">
              <i className="absolute inset-y-0 left-0 rounded-md bg-line-strong" style={{ width: width(gap.market) }} />
            </span>
          </div>
        </div>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[13px]">
          <dt className="text-mut">Diferença</dt>
          <dd data-testid="cmp-diff" className={`num text-right font-semibold ${tone}`}>
            {fmtSignedMoney(toDisplay(gap.diff), currency)}/sc
            {diffPct !== null && ` (${diffPct < 0 ? '−' : '+'}${fmtPct(Math.abs(diffPct), 1)})`}
          </dd>
          <dt className="text-mut">Na parte ainda a vender</dt>
          <dd data-testid="cmp-unsold" className={`num text-right font-semibold ${tone}`}>
            {onUnsold === null ? '—' : `${onUnsold < 0 ? '−' : ''}${fmtCompactMoney(toDisplay(Math.abs(onUnsold)), currency)}`}
          </dd>
        </dl>
        {unsold !== null && (
          <p className="num text-[11px] text-mut">
            Ainda a vender: {fmtNum(unsold, 0)} sc (o que já foi vendido tem preço fechado).
          </p>
        )}
        <div data-testid="cmp-explain" className="grid gap-1 rounded-[10px] bg-surface2 px-3 py-2.5 text-[12px]">
          <p className="text-mut">
            O preço de mercado é o FOB estimado da praça, com o prêmio dela. O seu é esse valor menos o que você paga
            para levar a soja até o porto:
          </p>
          {parts.map((p) => (
            <div key={p.key} className="flex justify-between gap-2">
              <span>{p.label}</span>
              <span data-testid={`cmp-${p.key}`} className="num font-semibold">
                {signedMoney(p.value)}/sc
              </span>
            </div>
          ))}
          <div className="flex justify-between gap-2 border-t border-line pt-1 font-semibold">
            <span>Diferença</span>
            <span className="num">{signedMoney(gap.diff)}/sc</span>
          </div>
          {state.overrides.simBasisUsc !== undefined && (
            <p className="text-mut">Você simulou o basis nesta tela; o mercado da praça não muda com isso.</p>
          )}
          {Math.abs(gap.premium) >= 0.005 && (
            <p className="text-mut">O prêmio que você informou é diferente do da praça; o mercado usa o da praça.</p>
          )}
          {Math.abs(gap.dollar) >= 0.005 && (
            <p className="text-mut">
              O preço da sua fazenda usa o dólar com a parte travada; o de mercado usa o dólar do cenário.
            </p>
          )}
        </div>
      </div>
    </details>
  )
}
