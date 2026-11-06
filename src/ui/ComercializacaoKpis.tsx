import { fmtNum, fmtPct } from './format'
import { fmtCompactMoney } from './fmtExtra'
import { useBarrierRisk } from './useBarrierRisk'
import { useExposure } from './useExposure'
import { useResult } from './useResult'

const card = 'relative overflow-hidden rounded-[14px] border border-line bg-card px-[15px] py-[13px]'
const small = 'block text-[11px] font-medium text-mut lg:text-xs'
const big = 'num my-0.5 block whitespace-nowrap text-[18px] font-bold leading-[1.15] tracking-tight lg:text-[22px]'
const sub = 'block text-[11px] text-mut lg:text-[11.5px]'

/** A thin bar showing the share of the production (red = open, green = protected). */
function ShareBar({ pct, closed = false }: { pct: number; closed?: boolean }) {
  const w = Math.min(1, Math.max(0, pct)) * 100
  return (
    <div aria-hidden="true" className="mt-1.5 flex h-1 w-full overflow-hidden rounded-full bg-bar-track">
      <div className={`h-full ${closed ? 'bg-bar-pos' : 'bg-bar-neg'}`} style={{ width: `${w}%` }} />
    </div>
  )
}

/**
 * Top of the Comercialização tab, four readings of the crop, each in % of the crop, sacks and money (at today's farm
 * price): how much is protected (price, basis and dollar all closed), how much is 100% exposed (all three open), how
 * much is exposed to the dollar and how much is exposed to the basis.
 */
export function ComercializacaoKpis() {
  const { exp } = useExposure()
  const barrier = useBarrierRisk()
  const dependsOnBarrier = (barrier?.split.barrierSc ?? 0) > 0
  const { result, currency, toDisplay } = useResult()
  const ok = exp.ok
  const production = ok ? exp.productionSc : 0
  const price = result.farmPriceBrl
  const profile = (key: string) => (ok ? (exp.profiles.find((p) => p.key === key)?.sc ?? 0) : 0)
  const share = (sc: number) => (production > 0 ? sc / production : 0)
  const pctText = (sc: number) => fmtPct(share(sc), share(sc) > 0 && share(sc) < 0.1 ? 1 : 0)
  // Sacks and their value at today's farm price: "36.000 sc · R$ 5,3 mi".
  const amount = (sc: number) =>
    `${fmtNum(sc, 0)} sc · ${price !== null && price > 0 ? fmtCompactMoney(toDisplay(sc * price), currency) : '—'}`

  const protectedSc = profile('travado')
  const fullSc = profile('tudo')
  const dollarSc = ok ? exp.dollar.openSc : 0
  const basisSc = ok ? exp.basis.openSc : 0
  const costsNote =
    ok && exp.dollar.costsUsd > 0
      ? exp.dollar.costsSc === null
        ? 'custos em US$ abertos sem preço para converter'
        : `líquido dos custos em US$: ${fmtNum(exp.dollar.netSc ?? 0, 0)} sc`
      : null
  const empty = 'informe área e produtividade'

  return (
    <div data-testid="comercializacao-kpis" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3">
      <div data-testid="com-fechado" className={card}>
        <small className={small}>Safra protegida</small>
        <b className={big}>{ok ? pctText(protectedSc) : '—'}</b>
        <span className={`${sub} num`}>{ok ? amount(protectedSc) : empty}</span>
        <span className={sub}>{ok ? 'preço, basis e dólar travados' : ' '}</span>
        {ok && dependsOnBarrier && (
          <span data-testid="com-fechado-barreira" className={`${sub} text-gold`}>
            parte depende de barreira: veja o aviso abaixo
          </span>
        )}
        {ok && <ShareBar pct={share(protectedSc)} closed />}
      </div>
      <div data-testid="com-completo" className={card}>
        <small className={small}>100% exposta</small>
        <b className={big}>{ok ? pctText(fullSc) : '—'}</b>
        <span className={`${sub} num`}>{ok ? amount(fullSc) : empty}</span>
        <span className={sub}>{ok ? 'basis, CBOT e dólar em aberto' : ' '}</span>
        {ok && <ShareBar pct={share(fullSc)} />}
      </div>
      <div data-testid="com-dolar" className={card}>
        <small className={small}>Exposta ao dólar</small>
        <b className={big}>{ok ? pctText(dollarSc) : '—'}</b>
        <span className={`${sub} num`}>{ok ? amount(dollarSc) : empty}</span>
        <span className={sub}>{ok ? (costsNote ?? 'receita em dólar em aberto') : ' '}</span>
        {ok && <ShareBar pct={share(dollarSc)} />}
      </div>
      <div data-testid="com-basis" className={card}>
        <small className={small}>Exposta ao basis</small>
        <b className={big}>{ok ? pctText(basisSc) : '—'}</b>
        <span className={`${sub} num`}>{ok ? amount(basisSc) : empty}</span>
        <span className={sub}>{ok ? 'sacas ainda sem venda' : ' '}</span>
        {ok && <ShareBar pct={share(basisSc)} />}
      </div>
    </div>
  )
}
