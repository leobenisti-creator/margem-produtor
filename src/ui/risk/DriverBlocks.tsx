import type { ReactNode } from 'react'
import { COST_CATEGORY_IDS, COST_CATEGORY_LABELS } from '../../data/types'
import {
  basisBreakdown,
  dollarSides,
  type RiskCtx,
} from '../../engine/riskSim'
import type { AppState } from '../../state/types'
import { fmtCompactMoney } from '../fmtExtra'
import { fmtNum } from '../format'
import { pctText, type RiskFmt } from './riskText'

function Kv({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[13px]">{children}</div>
}
const Row = ({ k, children, tone }: { k: string; children: ReactNode; tone?: string }) => (
  <>
    <span className="text-mut">{k}</span>
    <span className={`num text-right font-semibold ${tone ?? ''}`}>{children}</span>
  </>
)
const Rule = () => <div aria-hidden="true" className="col-span-2 my-0.5 border-t border-line" />
const Note = ({ children, testId }: { children: ReactNode; testId?: string }) => (
  <p data-testid={testId} className="mt-2.5 text-[12.5px] text-mut">
    {children}
  </p>
)
const tone = (n: number) => (n < 0 ? 'text-bar-neg' : 'text-bar-pos')

/** The cost groups that have at least one line quoted in US$ (only when the costs are filled by category). */
export function usdCostGroups(state: Pick<AppState, 'costMode' | 'costGroups'>): string[] {
  if (state.costMode !== 'categorias') return []
  const out: string[] = []
  for (const id of COST_CATEGORY_IDS) {
    const g = state.costGroups[id]
    const has =
      g.mode === 'total'
        ? g.totalUsd !== null && g.totalUsd.amountUsdHa > 0
        : Object.values(g.items).some((it) => it.mode === 'valor' && it.usd !== null && it.usd.amountUsdHa > 0)
    if (has) out.push(COST_CATEGORY_LABELS[id])
  }
  return out
}

const usd = (n: number) => fmtCompactMoney(n, 'USD')

/** "O dólar nos dois lados": it moves the revenue and also the cost. Only what the state has. */
export function DollarBlock({ ctx, state, fmt }: { ctx: RiskCtx; state: AppState; fmt: RiskFmt }) {
  const d = dollarSides(ctx)
  const groups = usdCostGroups(state)
  const fx = ctx.base.fx
  return (
    <div data-testid="risk-bloco-dolar">
      <p className="mb-2 text-[13px] text-mut">Ele mexe na receita e também no custo.</p>
      {d.hasUsdCost ? (
        <Kv>
          <Row k="Parte do custo que é em dólar">{pctText(d.usdShare, 0)}</Row>
          <Row k="Já comprado">
            {pctText(d.boughtPct, 0)} · {usd(d.usdBought)}
            {d.boughtAvgRate !== null && <> a R$ {fmtNum(d.boughtAvgRate, 2)}</>}
          </Row>
          {d.boughtAvgRate !== null && (
            <Row k="Dólar médio comprado contra o de hoje">
              R$ {fmtNum(d.boughtAvgRate, 2)} contra R$ {fmtNum(fx, 2)}
            </Row>
          )}
          <Row k="Ainda em aberto">
            {pctText(1 - d.boughtPct, 0)} · {usd(d.usdOpen)}
          </Row>
          {groups.length > 0 && (
            <>
              <Rule />
              <Row k="Categorias em dólar">{groups.join(', ')}</Row>
            </>
          )}
        </Kv>
      ) : (
        <p data-testid="risk-sem-custo-usd" className="text-[13px] text-mut">
          Você não informou custos em dólar: aqui o dólar mexe só na receita.
        </p>
      )}
      {d.plus !== null && (
        <div className="mt-2">
          <Kv>
            <Rule />
            <span className="col-span-2 text-mut">Cada R$ 0,10 a mais no dólar</span>
            <Row k="· receita" tone={tone(d.plus.revenue)}>
              {fmt.signedCompact(d.plus.revenue)}
            </Row>
            <Row k="· custo" tone={d.plus.cost > 0 ? 'text-bar-neg' : 'text-bar-pos'}>
              {fmt.signedCompact(-d.plus.cost)}
            </Row>
            <Row k="· no resultado" tone={tone(d.plus.margin)}>
              {fmt.signedCompact(d.plus.margin)}
            </Row>
          </Kv>
        </div>
      )}
    </div>
  )
}

/** "De onde vem o seu basis": premium - freight - port fees = basis, and what freight and fees are worth. */
export function BasisBlock({ ctx, fmt }: { ctx: RiskCtx; fmt: RiskFmt }) {
  const b = basisBreakdown(ctx)
  if (b === null) return <p className="text-[13px] text-mut">Sem preço para calcular o basis.</p>
  return (
    <div data-testid="risk-bloco-basis">
      <p className="mb-2 text-[13px] text-mut">
        Basis = preço da sua fazenda − bolsa. Ele só fecha na venda física: não existe operação de bolsa para ele.
      </p>
      <Kv>
        <Row k="Prêmio do porto">
          {fmt.money(b.premiumBrlSc)}/sc <span className="font-normal text-mut">({fmtNum(b.premiumUsc, 2)} US¢/bu)</span>
        </Row>
        <Row k="− Frete até o porto">{fmt.money(b.freight)}/sc</Row>
        <Row k="− Taxas de porto e armazém">{fmt.money(b.portFees)}/sc</Row>
        <Rule />
        <Row k="= Seu basis">
          <b>{fmt.money(b.basis)}/sc</b>
        </Row>
        <Rule />
        <Row k="Cada R$ 1,00/sc a menos de frete ou taxas" tone="text-bar-pos">
          {fmt.signedCompact(b.unsoldSc)}
        </Row>
      </Kv>
      <Note testId="risk-basis-nota">
        {b.unsoldSc > 0
          ? `O valor é só da parte ainda não vendida (${fmtNum(b.unsoldSc, 0)} sc): o que já foi vendido tem preço fechado.`
          : 'Toda a produção já foi vendida: o que já foi vendido tem preço fechado.'}
      </Note>
    </div>
  )
}
