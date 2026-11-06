import { useId, type ReactNode } from 'react'
import { type FactorExposure } from '../engine/exposure'
import { Card } from './Card'
import { fmtNum, fmtPct } from './format'
import { useResult } from './useResult'
import { useExposure } from './useExposure'

export const NO_PRODUCTION_EXPOSURE_TEXT = 'Informe área e produtividade'

function reading(f: FactorExposure, production: number): string {
  if (!f.exposed) return 'Protegido'
  return f.coverSc <= 0 && f.openSc >= production * 0.995 ? 'Tudo em aberto' : 'Parcialmente protegido'
}

const PROFILE_TONE: Record<string, string> = {
  travado: 'bg-bar-pos',
  dolar: 'bg-tone2',
  basis: 'bg-acc',
  'basis-dolar': 'bg-tone3',
  'basis-cbot': 'bg-tone4',
  tudo: 'bg-bar-neg',
}

const sc = (v: number) => `${fmtNum(v, 0)} sc`

function Bar({ openPct }: { openPct: number }) {
  const open = Math.min(1, Math.max(0, openPct)) * 100
  return (
    <div aria-hidden="true" className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-bar-pos">
      <div className="h-full bg-bar-neg" style={{ width: `${open}%` }} />
    </div>
  )
}

function Row({
  testId,
  label,
  f,
  production,
  children,
}: {
  testId: string
  label: string
  f: FactorExposure
  production: number
  children?: ReactNode
}) {
  const text = reading(f, production)
  return (
    <li data-testid={testId} className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-[13px] font-semibold">{label}</span>
        <span className="num text-[13px] font-bold">
          {sc(f.openSc)} <span className="font-normal text-mut">em aberto</span>
        </span>
      </div>
      <Bar openPct={f.pct} />
      <p className="num mt-1 text-[11.5px] text-mut">
        {text} · {fmtPct(f.pct, f.pct < 0.1 ? 1 : 0)} da produção
        {f.scPerHa !== null && <> · {fmtNum(f.scPerHa, 1)} sc/ha</>}
      </p>
      {f.floorSc > 0 && (
        <p className="num mt-0.5 text-[11.5px] text-mut">
          dos quais {sc(f.floorSc)} com piso de put (protege da queda e mantém a alta)
        </p>
      )}
      {children}
    </li>
  )
}

/** "Exposição": what is still open in basis, CBOT and dollar (sacks, % of the production, sc/ha). */
export function ExposureCard() {
  const { farmInputs } = useResult()
  const { exp } = useExposure()
  const headId = useId()
  const profId = useId()
  const areaHa = farmInputs.areaHa

  if (!exp.ok) {
    return (
      <Card title="Exposição" testId="card-exposicao">
        <p data-testid="exp-summary" className="text-[13px] text-mut">
          {NO_PRODUCTION_EXPOSURE_TEXT}
        </p>
      </Card>
    )
  }

  const names = [exp.basis.exposed && 'basis', exp.cbot.exposed && 'CBOT', exp.dollar.exposed && 'dólar'].filter(
    Boolean,
  ) as string[]
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}` : names[0]
  const summary = exp.anyExposed ? `Hoje você está exposto a: ${list}` : 'Tudo travado'
  const d = exp.dollar
  const closedSc = exp.profiles.find((x) => x.key === 'travado')?.sc ?? 0
  const totalOpenSc = Math.max(0, exp.productionSc - closedSc)
  const pills: [string, FactorExposure][] = [
    ['Basis', exp.basis],
    ['CBOT', exp.cbot],
    ['Dólar', exp.dollar],
  ]

  return (
    <Card title="Exposição" testId="card-exposicao">
      <div role="group" aria-labelledby={headId}>
        <p id={headId} data-testid="exp-summary" className="mb-2.5 text-[13px] font-semibold">
          {summary}
        </p>
        <div data-testid="exp-total-aberto" className="mb-3 rounded-[10px] border border-line px-3 py-2">
          <p className="text-[11px] font-medium text-mut">Em aberto no total</p>
          <p className="num text-[18px] font-bold leading-tight">
            {sc(totalOpenSc)}
            <span className="ml-1.5 text-[12px] font-semibold text-mut">
              {fmtPct(totalOpenSc / exp.productionSc, 0)} da produção
              {areaHa > 0 && <> · {fmtNum(totalOpenSc / areaHa, 1)} sc/ha</>}
            </span>
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5 text-[11.5px]">
            {pills.map(([name, f]) => (
              <li key={name} className="num rounded-full border border-line px-2 py-0.5">
                {name} {fmtPct(f.pct, 0)}
              </li>
            ))}
          </ul>
        </div>
        <ul className="divide-y divide-line">
          <Row testId="exp-basis" label="Basis" f={exp.basis} production={exp.productionSc} />
          <Row testId="exp-cbot" label="CBOT" f={exp.cbot} production={exp.productionSc} />
          <Row testId="exp-dolar" label="Dólar" f={exp.dollar} production={exp.productionSc}>
            <>
              <dl className="mt-2 rounded-[10px] border border-line px-3 py-2 text-[12px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-mut">Receita em aberto</dt>
                  <dd className="num font-semibold">{sc(d.openSc)}</dd>
                </div>
                <div data-testid="exp-dolar-custos" className="flex flex-wrap justify-between gap-x-3">
                  <dt className="text-mut">Custos em US$ em aberto</dt>
                  <dd className="num font-semibold">
                    US$ {fmtNum(d.costsUsd, 0)}
                    {d.costsSc === null ? ' (sem preço em dólar para converter)' : ` · ${sc(d.costsSc)}`}
                  </dd>
                </div>
                <div data-testid="exp-dolar-liquido" className="flex flex-wrap justify-between gap-x-3">
                  <dt className="text-mut">Líquido</dt>
                  <dd className="num font-semibold">
                    {d.netSc === null
                      ? '—'
                      : `${d.netSc < 0 ? '−' : ''}${sc(Math.abs(d.netSc))} · ${fmtPct(d.netPct === null ? null : Math.abs(d.netPct), 1)}`}
                  </dd>
                </div>
              </dl>
              <p className="mt-1.5 text-[11.5px] text-mut">
                Custos em dólar em aberto são a posição contrária: se o dólar sobe, a receita aumenta e esses custos
                também. Líquido negativo significa mais custo do que receita exposta ao dólar.
              </p>
            </>
          </Row>
        </ul>
        <div data-testid="exp-perfis" className="mt-3 border-t border-line pt-3">
          <h3 id={profId} className="text-[12.5px] font-semibold">
            Perfil das sacas
          </h3>
          <div aria-hidden="true" className="mt-1.5 flex h-2.5 w-full overflow-hidden rounded-full bg-bar-track">
            {exp.profiles.map((x) => (
              <div
                key={x.key}
                className={`h-full ${PROFILE_TONE[x.key] ?? 'bg-bar-neg'}`}
                style={{ width: `${x.pct * 100}%` }}
              />
            ))}
          </div>
          <table aria-labelledby={profId} className="mt-2 w-full text-left text-[11.5px]">
            <thead className="text-mut">
              <tr>
                <th scope="col" className="py-0.5 pr-2 font-medium">
                  Perfil
                </th>
                <th scope="col" className="py-0.5 pr-2 text-right font-medium">
                  Sacas
                </th>
                <th scope="col" className="py-0.5 pr-2 text-right font-medium">
                  % da produção
                </th>
                <th scope="col" className="py-0.5 text-right font-medium">
                  sc/ha
                </th>
              </tr>
            </thead>
            <tbody>
              {exp.profiles.map((x) => (
                <tr key={x.key} data-testid={`exp-perfil-${x.key}`}>
                  <th scope="row" className="py-0.5 pr-2 font-normal">
                    <span
                      aria-hidden="true"
                      className={`mr-1.5 inline-block h-2 w-2 rounded-full ${PROFILE_TONE[x.key] ?? 'bg-bar-neg'}`}
                    />
                    {x.label}
                  </th>
                  <td className="num py-0.5 pr-2 text-right">{fmtNum(x.sc, 0)}</td>
                  <td className="num py-0.5 pr-2 text-right">{fmtPct(x.pct, x.pct < 0.1 ? 1 : 0)}</td>
                  <td className="num py-0.5 text-right">{areaHa > 0 ? fmtNum(x.sc / areaHa, 1) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1.5 text-[11.5px] text-mut">
            Premissa: sacas vendidas têm preço travado; no dólar, só vendas em US$ com dólar em aberto ficam expostas;
            assumimos que as proteções recaem sobre as mesmas sacas.
          </p>
        </div>
        {exp.notes.length > 0 && (
          <ul className="mt-2.5 space-y-0.5 border-t border-warn-line pt-2 text-[11.5px] text-mut">
            {exp.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
