import { useId, useMemo, useState } from 'react'
import { CROPS } from '../../engine/crops'
import { analyzeTarget, type Lever, type LeverResult, type TargetAnalysis } from '../../engine/targetAnalysis'
import { fmtNum, fmtPct } from '../format'
import { PHOTOS } from './photos'
import { FadeSwap, GrowBar, Parallax, Reveal, Stagger, StaggerItem } from './motion'
import { Eyebrow, PhotoCaption, PhotoImg, Screen, Veil, panelClass } from './shared'
import { MARKET_UNAVAILABLE, type LiveExample } from './useLiveExample'

export const META_MIN = 0
export const META_MAX = 15
export const META_STEP = 0.5
export const META_DEFAULT = 5

const CROP = CROPS.soja

/**
 * The target analysis of the example for a target in percent (0 to 15): the same engine entry point and the same
 * 9×9 matrix the Resultados page uses (`analyzeTarget` over `buildMatrix`), only with this target on the farm inputs.
 */
export function analysisForTarget(ex: LiveExample, targetPct: number): TargetAnalysis | null {
  if (ex.matrix === null) return null
  try {
    return analyzeTarget(CROP, ex.scenario, { ...ex.inputs, targetMargin: targetPct / 100 }, ex.matrix)
  } catch {
    return null
  }
}

type Row = { lever: Lever; label: string; format: (v: number) => string }

/** Below the target: what has to happen, each lever on its own. */
const NEEDS: Row[] = [
  { lever: 'preco', label: 'O preço na fazenda precisa chegar a', format: (v) => `R$ ${fmtNum(v, 2)}/sc` },
  { lever: 'produtividade', label: 'A produtividade precisa chegar a', format: (v) => `${fmtNum(v, 1)} sc/ha` },
  { lever: 'custo', label: 'O custo precisa cair para', format: (v) => `R$ ${fmtNum(v, 0)}/ha` },
]
/** At or above the target: what worries and how far each driver can go (minimum dollar, minimum CBOT, maximum cost). */
const WORRIES: Row[] = [
  { lever: 'dolar', label: 'O dólar pode cair até', format: (v) => `R$ ${fmtNum(v, 2)}` },
  { lever: 'cbot', label: 'A CBOT pode cair até', format: (v) => `${fmtNum(v, 1)} US¢/bu` },
  { lever: 'custo', label: 'O custo pode subir até', format: (v) => `R$ ${fmtNum(v, 0)}/ha` },
]

function headline(a: TargetAnalysis, targetPct: number): string {
  const t = fmtNum(targetPct, 1)
  if (a.gapPp === null) return `Meta de ${t}%`
  if (a.status === 'na-meta') return `Hoje, o exemplo está na meta de ${t}%.`
  return `Hoje, o exemplo fica ${fmtNum(a.gapPp, 1)} pontos de margem ${a.status} da meta de ${t}%.`
}

function Levers({ a, rows, empty }: { a: TargetAnalysis; rows: Row[]; empty: string }) {
  const lever = (l: Lever): LeverResult | undefined => a.levers.find((x) => x.lever === l)
  return (
    <dl className="mt-3">
      {rows.map((row) => {
        const r = lever(row.lever)
        return (
          <div
            key={row.lever}
            className="flex flex-col gap-0.5 border-t border-line py-3 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
          >
            <dt className="text-mut">{row.label}</dt>
            <dd className="num font-bold text-tx sm:text-right">
              {r && r.reachable && r.value !== null ? row.format(r.value) : empty}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

function Gauge({ n }: { n: number }) {
  return (
    <div className="mt-6">
      <p className="num text-base font-bold text-tx">{`${n} de 81 cenários da matriz batem a meta`}</p>
      <div
        role="meter"
        aria-label="Cenários da matriz que batem a meta"
        aria-valuemin={0}
        aria-valuemax={81}
        aria-valuenow={n}
        aria-valuetext={`${n} de 81 cenários`}
        className="mt-2 h-2.5 overflow-hidden rounded-full bg-bar-track"
      >
        {/* Grows once, the first time it is seen in the visit; later changes of the target move it at once. */}
        <GrowBar id="meta.medidor" ratio={n / 81} className="rounded-full bg-bar-pos" />
      </div>
      <p className="mt-2 text-xs text-mut">
        São 81 mercados possíveis: 9 preços do dólar e 9 da CBOT, de baixa a alta. É a mesma matriz da página de
        resultados.
      </p>
    </div>
  )
}

export function SuaMeta({ ex }: { ex: LiveExample }) {
  const [target, setTarget] = useState(META_DEFAULT)
  const sliderId = useId()
  const a = useMemo(() => analysisForTarget(ex, target), [ex, target])
  const below = a?.status === 'abaixo'
  return (
    <Screen id="meta" labelledBy="meta-title">
      <div className={`${panelClass} min-h-[80svh]`}>
        <div className="absolute inset-0 overflow-hidden">
          <Parallax>
            <PhotoImg photo={PHOTOS.meta} />
          </Parallax>
        </div>
        <Veil uniformAlways />
        <PhotoCaption text={PHOTOS.meta.caption} className="left-auto right-3" />
        <div className="relative z-10 p-5 sm:p-8 lg:p-12">
          <Reveal id="meta.cabecalho">
            <Eyebrow>Sua meta</Eyebrow>
            <h2
              id="meta-title"
              tabIndex={-1}
              className="max-w-[26ch] text-balance text-[26px] font-extrabold leading-tight sm:text-[34px]"
            >
              Diga quanto quer ganhar. O app diz o que falta.
            </h2>
            <p className="mt-3 max-w-[70ch] text-pretty text-sm text-mut sm:text-base">
              Arraste a meta e veja, num exemplo, o que precisaria acontecer para chegar lá. É só demonstração: nada
              aqui muda os seus dados.
            </p>
          </Reveal>

          <Stagger id="meta.cartoes" className="mt-6 grid gap-5 lg:grid-cols-2" gap={0.14}>
            <StaggerItem>
              <div className="h-full rounded-2xl border border-line bg-card p-5 sm:p-6">
                <div className="flex items-end justify-between gap-3">
                  <label htmlFor={sliderId} className="text-sm font-semibold text-tx">
                    Meta de margem
                  </label>
                  <output htmlFor={sliderId} className="num text-5xl font-extrabold leading-none text-gold">
                    {fmtNum(target, 1)}%
                  </output>
                </div>
                <input
                  id={sliderId}
                  type="range"
                  min={META_MIN}
                  max={META_MAX}
                  step={META_STEP}
                  value={target}
                  aria-valuetext={`${fmtNum(target, 1)}%`}
                  onChange={(e) => setTarget(Number(e.target.value))}
                  className="mt-4 block h-11 w-full cursor-pointer accent-gold"
                />
                <div aria-hidden="true" className="num flex justify-between text-[11px] text-mut">
                  <span>{META_MIN}%</span>
                  <span>5%</span>
                  <span>10%</span>
                  <span>{META_MAX}%</span>
                </div>
                <p className="mt-4 text-sm text-mut">
                  No exemplo ({ex.regionLabel}), a margem de hoje é{' '}
                  <b className="num text-tx">{fmtPct(ex.marginPct, 1)}</b> da receita.
                </p>
                {a !== null && <Gauge n={a.cellsOk} />}
              </div>
            </StaggerItem>

            <StaggerItem>
              <div className="h-full rounded-2xl border border-line bg-card p-5 sm:p-6">
                {a === null ? (
                  <p className="text-sm text-mut">{MARKET_UNAVAILABLE}</p>
                ) : (
                  <div aria-live="polite">
                    <h3 className="text-lg font-bold leading-snug text-tx">{headline(a, target)}</h3>
                    <FadeSwap id={below ? 'precisa' : 'preocupa'} className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-gold">
                        {below ? 'O que precisa acontecer' : 'O que preocupa e quanto você aguenta'}
                      </p>
                      <p className="mt-1 text-xs text-mut">
                        {below
                          ? 'Cada linha vale sozinha: as outras coisas ficam como estão.'
                          : 'Cada linha vale sozinha: até onde ela vai antes de a margem sair da meta. A CBOT é em centavos de dólar por bushel.'}
                      </p>
                      {below ? (
                        <Levers a={a} rows={NEEDS} empty="não chega só com isso" />
                      ) : (
                        <Levers a={a} rows={WORRIES} empty="aguenta tudo o que o app testa" />
                      )}
                    </FadeSwap>
                  </div>
                )}
              </div>
            </StaggerItem>
          </Stagger>
        </div>
      </div>
    </Screen>
  )
}
