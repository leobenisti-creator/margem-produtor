import { useId, type ReactNode } from 'react'
import type { LeverRow, StressRow, TargetReport } from '../../engine/targetReport'
import { useStore } from '../../state/StoreProvider'
import { DocumentOverlay } from '../DocumentOverlay'
import { fmtNum } from '../format'
import { TargetControl } from '../TargetControl'
import {
  LEVER_NAME,
  STATUS_TEXT,
  actions,
  leverValue,
  moveText,
  pct1,
  signedPct,
  signedPp,
  summaryBullets,
  verdictTitle,
  type Money,
} from './targetText'
import { useTargetReport } from './useTargetReport'

const card = 'rounded-[12px] border border-line bg-card p-3.5'
const h3 = 'text-[13px] font-bold'
const note = 'mt-2 text-[11.5px] leading-snug text-mut'

function Section({ id, title, children, lead }: { id: string; title: string; children: ReactNode; lead?: ReactNode }) {
  const hid = useId()
  return (
    <section id={id} aria-labelledby={hid} className={`${card}`} data-testid={id}>
      <h3 id={hid} className={h3}>
        {title}
      </h3>
      {lead && <p className="mt-1 text-[12px] leading-snug text-mut">{lead}</p>}
      <div className="mt-2.5">{children}</div>
    </section>
  )
}

const TONE = {
  acima: { text: 'text-bar-pos', fill: 'bg-bar-pos', ring: 'border-bar-pos' },
  'na-meta': { text: 'text-gold', fill: 'bg-acc', ring: 'border-acc' },
  abaixo: { text: 'text-bar-neg', fill: 'bg-bar-neg', ring: 'border-bar-neg' },
} as const

const DOT: Record<StressRow['status'], string> = {
  meta: 'bg-bar-pos',
  perto: 'bg-acc',
  longe: 'bg-bar-neg',
  prejuizo: 'bg-bar-neg',
  indefinido: 'bg-line-strong',
}

// ─────────────────────────────────────── 1 · the verdict ───────────────────────────────────────

function Gauge({ margin, target, tone }: { margin: number; target: number; tone: keyof typeof TONE }) {
  const top = Math.max(Math.abs(margin), target, 0.01) * 1.18
  const at = (v: number) => `${Math.min(100, Math.max(0, (v / top) * 100))}%`
  return (
    <div aria-hidden="true" data-testid="gauge" className="relative mt-3 mb-5 h-3 rounded-full bg-bar-track">
      <div className={`absolute inset-y-0 left-0 rounded-full ${TONE[tone].fill}`} style={{ width: at(Math.max(0, margin)) }} />
      <div className="absolute -top-1 bottom-[-4px] w-0.5 bg-tx" style={{ left: at(target) }} />
      <span
        className="num absolute top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[10.5px] font-semibold text-tx"
        style={{ left: at(target) }}
      >
        meta {fmtNum(target * 100, 1)}%
      </span>
    </div>
  )
}

function Tile({ title, value, sub, tone }: { title: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-[10px] bg-surface2 p-2.5">
      <div className="text-[11px] text-mut">{title}</div>
      <b className={`num mt-0.5 block text-[17px] leading-tight ${tone ?? ''}`}>{value}</b>
      {sub && <div className="num mt-0.5 text-[11px] text-mut">{sub}</div>}
    </div>
  )
}

function Verdict({ r, m }: { r: TargetReport; m: Money }) {
  const v = r.verdict
  const tone = TONE[v.status]
  return (
    <section
      id="meta-veredito"
      aria-labelledby="meta-veredito-t"
      data-testid="meta-veredito"
      className={`rounded-[12px] border-2 bg-card p-3.5 ${tone.ring}`}
    >
      <small className="text-[11px] font-semibold uppercase tracking-[0.08em] text-mut">Hoje, contra a meta</small>
      <h3 id="meta-veredito-t" className={`mt-0.5 text-[20px] font-extrabold leading-tight ${tone.text}`}>
        {verdictTitle(r)}
      </h3>
      <p className="num mt-0.5 text-[12.5px] text-mut">
        margem de {pct1(v.marginPct)} {r.base === 'custo' ? 'do custo' : 'da receita'} · meta de {fmtNum(r.target * 100, 1)}%
      </p>
      {v.marginPct !== null && <Gauge margin={v.marginPct} target={r.target} tone={v.status} />}
      <div className="grid gap-2 sm:grid-cols-3">
        <Tile
          title="Sua margem"
          value={`${m.brl(v.marginPerSc)}/sc`}
          sub={`${m.compact(v.marginTotal)} na safra`}
        />
        <Tile
          title="O que a meta pede"
          value={`${m.brl(v.targetPerSc)}/sc`}
          sub={`${m.compact(v.targetTotal)} na safra`}
        />
        <Tile
          title={v.slackTotal >= 0 ? 'Folga sobre a meta' : 'Falta para a meta'}
          value={`${m.brl(Math.abs(v.slackPerSc))}/sc`}
          sub={`${m.compact(Math.abs(v.slackTotal))} na safra`}
          tone={v.slackTotal >= 0 ? 'text-bar-pos' : 'text-bar-neg'}
        />
      </div>
    </section>
  )
}

// ─────────────────────────────────────── 2 · prices ───────────────────────────────────────

function PriceRuler({ points }: { points: { key: string; label: string; v: number; tone: string }[] }) {
  const vs = points.map((p) => p.v)
  const lo = Math.min(...vs) * 0.9
  const hi = Math.max(...vs) * 1.1
  const x = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`
  return (
    <div aria-hidden="true" data-testid="regua-precos" className="relative mx-2 mb-9 mt-5 h-1.5 rounded-full bg-bar-track">
      {points.map((p, i) => (
        <div key={p.key} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: x(p.v) }}>
          <i className={`block h-3.5 w-3.5 rounded-full border-2 border-card ${p.tone}`} />
          <span
            className={`num absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10.5px] font-semibold ${i % 2 === 0 ? 'top-4' : '-top-5'}`}
          >
            {p.label}
          </span>
        </div>
      ))}
    </div>
  )
}

function Prices({ r, m }: { r: TargetReport; m: Money }) {
  const { farmPrice, minPrice, breakEvenPrice, unsoldNeeded, unsoldSc } = r.prices
  const pts = [
    breakEvenPrice !== null && { key: 'eq', label: `equilíbrio ${m.brl(breakEvenPrice)}`, v: breakEvenPrice, tone: 'bg-bar-neg' },
    minPrice !== null && { key: 'min', label: `meta ${m.brl(minPrice)}`, v: minPrice, tone: 'bg-acc' },
    farmPrice !== null && { key: 'hoje', label: `hoje ${m.brl(farmPrice)}`, v: farmPrice, tone: 'bg-bar-pos' },
  ].filter((p): p is { key: string; label: string; v: number; tone: string } => p !== false)
  const diff = farmPrice !== null && minPrice !== null ? farmPrice - minPrice : null
  const row = 'flex items-baseline justify-between gap-3 border-t border-line py-1.5 first:border-t-0'
  return (
    <Section
      id="meta-precos"
      title="Preço: onde você está e o que a meta pede"
      lead="Por saca, na sua fazenda (já descontados frete e taxas de porto)."
    >
      {pts.length >= 2 && <PriceRuler points={pts} />}
      <dl className="text-[12.5px]">
        <div className={row}>
          <dt className="text-mut">Preço na fazenda hoje</dt>
          <dd className="num font-bold">{farmPrice === null ? '—' : `${m.brl(farmPrice)}/sc`}</dd>
        </div>
        <div className={row}>
          <dt className="text-mut">Preço mínimo para a meta (média da safra)</dt>
          <dd className="num font-bold" data-testid="meta-preco-minimo">
            {minPrice === null ? 'inatingível' : `${m.brl(minPrice)}/sc`}
          </dd>
        </div>
        {diff !== null && (
          <div className={row}>
            <dt className="text-mut">{diff >= 0 ? 'Folga do preço sobre o mínimo' : 'Falta de preço para o mínimo'}</dt>
            <dd className={`num font-bold ${diff >= 0 ? 'text-bar-pos' : 'text-bar-neg'}`}>
              {m.brl(Math.abs(diff))}/sc
              {minPrice !== null && minPrice > 0 && (
                <span className="font-normal text-mut"> ({signedPct((diff / minPrice) * 100)})</span>
              )}
            </dd>
          </div>
        )}
        <div className={row}>
          <dt className="text-mut">Ponto de equilíbrio (margem zero)</dt>
          <dd className="num font-bold">{breakEvenPrice === null ? '—' : `${m.brl(breakEvenPrice)}/sc`}</dd>
        </div>
        {unsoldSc > 0 && r.sales && (
          <div className={row}>
            <dt className="text-mut">
              Para as <span className="num">{fmtNum(unsoldSc, 0)} sc</span> ainda sem venda, o preço que fecha a meta
            </dt>
            <dd className="num font-bold" data-testid="meta-preco-aberto">
              {unsoldNeeded === null ? 'não chega só com o preço' : `${m.brl(unsoldNeeded)}/sc`}
            </dd>
          </div>
        )}
      </dl>
      {unsoldSc > 0 && r.sales && (
        <p className={note}>
          Com parte da safra já vendida, o preço que importa é o das sacas que ainda faltam: a conta mantém as suas vendas e
          operações como estão.
        </p>
      )}
    </Section>
  )
}

// ─────────────────────────────────────── 3 · how far each factor can go ───────────────────────────────────────

function Levers({ r, m }: { r: TargetReport; m: Money }) {
  const below = r.verdict.status === 'abaixo'
  const t = fmtNum(r.target * 100, 1)
  const cell = (l: LeverRow, key: 'toTarget' | 'toZero') => {
    const x = l[key]
    if (!x.reachable || x.value === null)
      return <span className="text-mut">{l.lever === 'basis' && r.prices.unsoldSc === 0 ? 'tudo já vendido' : 'não chega sozinho (±80%)'}</span>
    return (
      <>
        <b>{leverValue(l.lever, x.value, m)}</b> <span className="text-mut">({moveText(l, key, m)})</span>
      </>
    )
  }
  return (
    <Section
      id="meta-fatores"
      title={below ? 'O que, sozinho, levaria você à meta' : 'Até onde cada fator pode andar'}
      lead={
        below
          ? `Cada linha muda só um fator e mantém o resto como está hoje. A coluna "Meta de ${t}%" é o valor que fecha a meta.`
          : `Cada linha muda só um fator e mantém o resto. Em "Meta de ${t}%" a margem encosta na meta; em "Margem zero" ela some.`
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-[12.5px]" data-testid="meta-tabela-fatores">
          <caption className="sr-only">Valor de cada fator que leva a margem à meta e a zero</caption>
          <thead>
            <tr className="text-left text-[11px] text-mut">
              <th scope="col" className="py-1 font-medium">
                Fator
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Hoje
              </th>
              <th scope="col" className="py-1 pl-3 text-right font-medium">
                Meta de {t}%
              </th>
              <th scope="col" className="py-1 pl-3 text-right font-medium">
                Margem zero
              </th>
            </tr>
          </thead>
          <tbody>
            {r.levers.map((l) => (
              <tr key={l.lever} data-testid={`meta-fator-${l.lever}`} className="border-t border-line align-top">
                <th scope="row" className="py-1.5 text-left font-normal">
                  {LEVER_NAME[l.lever]}
                </th>
                <td className="num py-1.5 text-right">{leverValue(l.lever, l.current, m)}</td>
                <td className="num py-1.5 pl-3 text-right">{cell(l, 'toTarget')}</td>
                <td className="num py-1.5 pl-3 text-right">{cell(l, 'toZero')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={note}>
        Cada fator anda com os outros no valor de hoje. O basis é o preço da fazenda menos a CBOT (frete e taxas dentro) e
        só mexe nas sacas ainda sem venda; o custo é o total por hectare, com os custos em US$ no dólar de hoje.
      </p>
    </Section>
  )
}

// ─────────────────────────────────────── 4 · what weighs the most ───────────────────────────────────────

function Tornado({ r }: { r: TargetReport }) {
  const max = Math.max(0.01, ...r.sensitivity.flatMap((s) => [Math.abs(s.down.deltaPp ?? 0), Math.abs(s.up.deltaPp ?? 0)]))
  const bar = (pp: number | null, side: 'l' | 'r') => {
    const v = pp ?? 0
    // The bar takes at most 70% of its half so the number always fits beside it.
    const w = `${(Math.abs(v) / max) * 70}%`
    return (
      <div className={`flex items-center gap-1.5 ${side === 'l' ? 'flex-row-reverse' : ''}`}>
        <i
          className={`block h-3.5 rounded-[3px] ${v < 0 ? 'bg-bar-neg' : 'bg-bar-pos'}`}
          style={{ width: w, minWidth: v === 0 ? 0 : 2 }}
        />
        <span className={`num shrink-0 whitespace-nowrap text-[11px] font-semibold ${v < 0 ? 'text-bar-neg' : 'text-bar-pos'}`}>
          {pp === null ? '—' : signedPp(pp)}
        </span>
      </div>
    )
  }
  return (
    <Section
      id="meta-peso"
      title="O que mais pesa na sua margem"
      lead="O que acontece com a margem (em pontos percentuais) se cada fator ficar 10% menor ou 10% maior (o basis, R$ 5/sc menor ou maior). Quanto mais comprida a barra, mais ele pesa."
    >
      <div aria-hidden="true" className="mb-1 grid grid-cols-[1fr_6.5rem_1fr] text-[10.5px] text-mut">
        <span className="text-right">fator menor</span>
        <span />
        <span>fator maior</span>
      </div>
      <ul aria-label="Peso de cada fator na margem" className="grid gap-1.5" data-testid="meta-tornado">
        {r.sensitivity.map((s) => (
          <li key={s.id} data-testid={`meta-peso-${s.id}`} className="grid grid-cols-[1fr_6.5rem_1fr] items-center gap-1">
            {bar(s.down.deltaPp, 'l')}
            <span className="text-center text-[12px] font-semibold">{s.label}</span>
            {bar(s.up.deltaPp, 'r')}
          </li>
        ))}
      </ul>
      <p className={note}>
        Ordenado do que mais pesa para o que menos pesa. Para o custo, "menor" é bom: a barra verde fica no lado esquerdo.
      </p>
    </Section>
  )
}

// ─────────────────────────────────────── 5 · the grid ───────────────────────────────────────

function Grid({ r, onUse }: { r: TargetReport; onUse: (cbotUsc: number, fx: number) => void }) {
  const g = r.grid
  if (!g) return null
  const part = (n: number) => `${(n / g.total) * 100}%`
  const near = g.nearest
  return (
    <Section
      id="meta-matriz"
      title="A matriz contra a meta"
      lead="As 81 combinações de CBOT e dólar da matriz de Resultados, em torno do mercado de hoje."
    >
      <div aria-hidden="true" className="flex h-3.5 overflow-hidden rounded-full bg-bar-track">
        <i className="block bg-bar-pos" style={{ width: part(g.green) }} />
        <i className="block bg-acc" style={{ width: part(g.amber) }} />
        <i className="block bg-bar-neg" style={{ width: part(g.red) }} />
      </div>
      <ul aria-label="Cenários da matriz por faixa" className="num mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]" data-testid="meta-matriz-contagem">
        <li>
          <i aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] bg-bar-pos" />
          <b>{g.green}</b> batem a meta
        </li>
        <li>
          <i aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] bg-acc" />
          <b>{g.amber}</b> até 5 p.p. abaixo
        </li>
        <li>
          <i aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] bg-bar-neg" />
          <b>{g.red}</b> mais de 5 p.p. abaixo
        </li>
      </ul>
      {g.minPct !== null && g.maxPct !== null && (
        <p className="num mt-1.5 text-[12px] text-mut">
          A margem na matriz vai de {pct1(g.minPct)} a {pct1(g.maxPct)}.
        </p>
      )}
      {near && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-surface2 px-3 py-2">
          <p className="text-[12.5px]" data-testid="meta-matriz-perto">
            {near.kind === 'bate' ? 'O cenário mais perto de hoje que bate a meta: ' : 'O cenário mais perto de hoje que tira você da meta: '}
            <b className="num">
              CBOT {fmtNum(near.cbotUsc, 0)} US¢/bu ({near.cbotPct === 0 ? 'hoje' : signedPct(near.cbotPct)}) e dólar R${' '}
              {fmtNum(near.fx, 2)} ({near.fxPct === 0 ? 'hoje' : signedPct(near.fxPct)})
            </b>
            <span className="text-mut"> · margem de {pct1(near.marginPct)}</span>
          </p>
          <button
            type="button"
            onClick={() => onUse(near.cbotUsc, near.fx)}
            className="min-h-[44px] shrink-0 rounded-full border border-g7 px-4 text-xs font-bold text-g7 hover:bg-g7/10 md:min-h-[34px]"
          >
            Ver esse cenário
          </button>
        </div>
      )}
      {!near && (
        <p className="mt-2 text-[12px] text-mut">
          {r.verdict.status === 'abaixo'
            ? 'Nenhuma combinação da matriz bate a meta.'
            : 'Nenhuma combinação da matriz tira você da meta.'}
        </p>
      )}
    </Section>
  )
}

// ─────────────────────────────────────── 6 · stress ───────────────────────────────────────

function Stress({ r, m }: { r: TargetReport; m: Money }) {
  return (
    <Section
      id="meta-estresse"
      title="E se as coisas piorarem (ou melhorarem)?"
      lead="Cada linha muda o que está no nome e mantém o resto; os choques de 10% e 5% são uma escolha do app."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-[12.5px]" data-testid="meta-tabela-estresse">
          <caption className="sr-only">Margem em cada cenário de estresse</caption>
          <thead>
            <tr className="text-left text-[11px] text-mut">
              <th scope="col" className="py-1 font-medium">
                Cenário
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Margem
              </th>
              <th scope="col" className="py-1 pl-3 text-right font-medium">
                Por saca
              </th>
              <th scope="col" className="py-1 pl-3 text-right font-medium">
                Contra a meta de {fmtNum(r.target * 100, 1)}%
              </th>
            </tr>
          </thead>
          <tbody>
            {r.stress.map((s) => (
              <tr key={s.id} data-testid={`meta-estresse-${s.id}`} className="border-t border-line">
                <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                  {s.label}
                </th>
                <td className="num py-1.5 text-right font-semibold">{pct1(s.marginPct)}</td>
                <td className="num py-1.5 pl-3 text-right">{s.marginPerSc === null ? '—' : `${m.brl(s.marginPerSc)}/sc`}</td>
                <td className="whitespace-nowrap py-1.5 pl-3 text-right">
                  <span className="inline-flex items-center gap-1.5">
                    <i aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${DOT[s.status]}`} />
                    {STATUS_TEXT[s.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

// ─────────────────────────────────────── 7 · sales and operations ───────────────────────────────────────

function Sales({ r, m }: { r: TargetReport; m: Money }) {
  const s = r.sales
  const h = r.hedge
  return (
    <Section
      id="meta-vendas"
      title="Suas vendas e operações contra a meta"
      lead={
        s
          ? 'Cada venda comparada com o preço mínimo para fechar a meta (média da safra).'
          : 'Você ainda não registrou vendas: toda a safra está no preço de mercado.'
      }
    >
      {s && (
        <>
          <p className="num text-[12.5px]" data-testid="meta-vendas-resumo">
            Vendido: <b>{fmtNum(s.soldPct * 100, 0)}%</b> da safra (<b>{fmtNum(s.soldSc, 0)} sc</b>)
            {s.avgPriceBrl !== null && (
              <>
                , a <b>{m.brl(s.avgPriceBrl)}/sc</b> em média
              </>
            )}
            .
          </p>
          <ul aria-label="Vendas contra o preço mínimo" className="mt-2 divide-y divide-line text-[12.5px]">
            {s.tranches.map((t, i) => (
              <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5" data-testid={`meta-venda-${t.id}`}>
                <span>
                  Venda {i + 1} · <span className="num">{fmtNum(t.sc, 0)} sc</span> a <span className="num">{m.brl(t.priceBrl)}/sc</span>
                </span>
                {t.vsMinBrl !== null && (
                  <b className={`num ${t.vsMinBrl >= 0 ? 'text-bar-pos' : 'text-bar-neg'}`}>
                    {t.vsMinBrl >= 0 ? 'acima' : 'abaixo'} do mínimo em {m.brl(Math.abs(t.vsMinBrl))}/sc
                  </b>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {h && (
        <p className="num mt-2.5 rounded-[10px] bg-surface2 px-3 py-2 text-[12.5px]" data-testid="meta-hedge">
          Operações em bolsa: <b className={h.brl >= 0 ? 'text-bar-pos' : 'text-bar-neg'}>{m.signed(h.brl, 0)}</b> ({m.signed(h.perSc)}/sc).
          {h.pctWithout !== null && h.gapWithoutPp !== null && (
            <>
              {' '}
              Sem elas a margem seria <b>{pct1(h.pctWithout)}</b> ({signedPp(h.gapWithoutPp)} da meta).
            </>
          )}
        </p>
      )}
      {!s && !h && (
        <p className="text-[12.5px] text-mut">
          Registre as vendas e as operações na Comercialização: elas entram nesta análise e mostram quanto da meta já está
          travado.
        </p>
      )}
    </Section>
  )
}

// ─────────────────────────────────────── 8 · what to do ───────────────────────────────────────

function Actions({ r, m }: { r: TargetReport; m: Money }) {
  const a = actions(r, m)
  if (a.hands.length === 0 && a.market.length === 0) return null
  return (
    <Section id="meta-acoes" title={a.title}>
      <div className="grid gap-3 sm:grid-cols-2">
        {a.hands.length > 0 && (
          <div>
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-mut">Está nas suas mãos</h4>
            <ul className="grid gap-1.5 text-[12.5px]" data-testid="meta-acoes-maos">
              {a.hands.map((t) => (
                <li key={t} className="rounded-[8px] bg-surface2 px-2.5 py-1.5">
                  {t}
                </li>
              ))}
            </ul>
          </div>
        )}
        {a.market.length > 0 && (
          <div>
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-mut">Depende do mercado</h4>
            <ul className="grid gap-1.5 text-[12.5px]" data-testid="meta-acoes-mercado">
              {a.market.map((t) => (
                <li key={t} className="rounded-[8px] bg-surface2 px-2.5 py-1.5">
                  {t}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  )
}

// ─────────────────────────────────────── the document ───────────────────────────────────────

/**
 * "Análise da meta": one document laid over the Resultados page, the whole story of the margin target for the scenario on
 * screen. The target itself is set at the top; below it, the verdict, a plain-language summary, the price, how far each
 * factor can go, what weighs the most, the matrix against the target, stress scenarios, the sales and what to do.
 */
export function TargetOverlay({
  onClose,
  returnFocus,
}: {
  onClose: () => void
  returnFocus?: () => HTMLElement | null
}) {
  const { dispatch } = useStore()
  const { report, money, custom } = useTargetReport()

  function use(cbotUsc: number, fx: number) {
    dispatch({ type: 'applyScenario', cbotUsc, fx })
    onClose()
  }

  return (
    <DocumentOverlay
      title="Análise da meta de margem"
      kicker="Resultados"
      onClose={onClose}
      returnFocus={returnFocus}
      testId="mais-meta"
      wide
    >
      <div className={card} data-testid="meta-controle">
        <TargetControl />
      </div>
      {report === null ? (
        <EmptyState />
      ) : (
        <>
          <p className="text-[11.5px] text-mut" data-testid="meta-cenario">
            {custom
              ? 'Cenário analisado: o que você escolheu na matriz (a grade e os cenários de estresse partem dele).'
              : 'Cenário analisado: o mercado de hoje.'}{' '}
            Valores provisórios do último fechamento, não ao vivo.
          </p>
          <Verdict r={report} m={money} />
          <Section id="meta-resumo" title="Em resumo">
            <ul className="grid gap-1.5 text-[12.5px] leading-snug" data-testid="meta-resumo-lista">
              {summaryBullets(report, money).map((t) => (
                <li key={t} className="flex gap-2">
                  <i aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-acc" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </Section>
          <Prices r={report} m={money} />
          <Levers r={report} m={money} />
          <Tornado r={report} />
          <Grid r={report} onUse={use} />
          <Stress r={report} m={money} />
          <Sales r={report} m={money} />
          <Actions r={report} m={money} />
          <p className={note}>
            A margem é calculada sobre {report.base === 'custo' ? 'o custo' : 'a receita'}. Na matriz, verde é margem na meta ou acima, amarelo é até 5 p.p. abaixo dela e vermelho é mais que
            isso. A análise usa o que você registrou: vendas, operações em bolsa e custos.
          </p>
        </>
      )}
    </DocumentOverlay>
  )
}

function EmptyState() {
  return (
    <div className={card} data-testid="meta-sem-meta">
      <h3 className={h3}>Defina uma meta para ver a análise completa</h3>
      <ul className="mt-2 grid gap-1 text-[12.5px] text-mut">
        <li>· Se você está acima ou abaixo da meta, em pontos percentuais e em reais.</li>
        <li>· O preço mínimo da saca e a folga que você tem sobre ele.</li>
        <li>· Até onde CBOT, dólar, basis e custo podem andar.</li>
        <li>· O que mais pesa na sua margem e como ela reage a cenários de estresse.</li>
        <li>· Quantas combinações da matriz batem a meta e como as suas vendas se saem.</li>
      </ul>
      <p className={note}>Ligue a meta acima e digite o percentual de margem que você quer alcançar.</p>
    </div>
  )
}
