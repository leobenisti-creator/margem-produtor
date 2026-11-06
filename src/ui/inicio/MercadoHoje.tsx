import type { Quote } from '../../data/types'
import { CROPS } from '../../engine/crops'
import { computeResult } from '../../engine/calc'
import type { DailyPoint } from '../../engine/history'
import { useStore } from '../../state/StoreProvider'
import { fmtDateBr, fmtDayMonth, fmtNum } from '../format'
import { FOB_POINTS, shortFobLabel } from '../../data/fobPoints'
import { CountUp, Lift, Parallax, Reveal, Stagger, StaggerItem } from './motion'
import { shortSources } from '../Ticker'
import { PHOTOS } from './photos'
import { Eyebrow, PhotoCaption, PhotoImg, Screen, Veil, panelClass } from './shared'
import { MARKET_UNAVAILABLE, type LiveExample } from './useLiveExample'

interface CardDef {
  label: string
  /** One plain sentence: what this price is. */
  hint: string
  quote: Quote | undefined
  format: (n: number) => string
  /** Daily history of this very quote from the provider; absent = no chart (a series is never invented). */
  history?: DailyPoint[]
}

const fin = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)

const SPARK_POINTS = 60

/** The last points of a provider series: finite and positive, sorted by date; null with fewer than 2 points. */
export function sparkSeries(series: DailyPoint[] | undefined): DailyPoint[] | null {
  if (!series) return null
  const pts = series
    .filter((p) => Number.isFinite(p.settle) && p.settle > 0 && typeof p.date === 'string')
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-SPARK_POINTS)
  return pts.length >= 2 ? pts : null
}

/** Mini line chart of a real history (decorative numbers live in the card; the label tells the span). */
function Spark({ points }: { points: DailyPoint[] }) {
  const w = 100
  const h = 28
  const vals = points.map((p) => p.settle)
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const span = hi - lo || 1
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w
      const y = h - 2 - ((p.settle - lo) / span) * (h - 4)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
  return (
    <svg
      data-testid="mini-chart"
      role="img"
      aria-label={`Histórico: ${points.length} pregões, de ${fmtDateBr(points[0].date)} a ${fmtDateBr(points[points.length - 1].date)}`}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="mt-1 h-7 w-full"
    >
      <path d={d} fill="none" className="stroke-gold" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

const CROP = CROPS.soja
const signedBrlPerSc = (n: number) => `${n < 0 ? '−' : '+'}R$ ${fmtNum(Math.abs(n), 2)}/sc`

export interface MarketImpact {
  /** Change of the margin per sack (R$/sc) of the example farm with the dollar R$ 0,10 higher. */
  fxUpPerSc: number | null
  /** Change of the margin per sack (R$/sc) of the example farm with the CBOT US¢ 10 higher. */
  cbotUpPerSc: number | null
}

/**
 * What is measured: the example farm's `marginPerSc` (engine computeResult, R$/sc) in the live scenario
 * versus the same scenario with only the dollar +0,10 (or only the CBOT +10 US¢), same inputs.
 * Null when the market is unusable or the margin is unknown.
 */
export function marketImpact(ex: LiveExample): MarketImpact {
  const base = ex.result.marginPerSc
  const at = (patch: Partial<LiveExample['scenario']>): number | null => {
    const r = computeResult(CROP, { ...ex.scenario, ...patch }, ex.inputs).marginPerSc
    return fin(r) && fin(base) ? r - base : null
  }
  if (ex.matrix === null) return { fxUpPerSc: null, cbotUpPerSc: null }
  return {
    fxUpPerSc: at({ fx: ex.scenario.fx + 0.1 }),
    cbotUpPerSc: at({ cbotUsc: ex.scenario.cbotUsc + 10 }),
  }
}

const unitText = (u: string) => u.replace(/^USc/, 'US¢')

const usable = (q: Quote | undefined): q is Quote => q !== undefined && Number.isFinite(q.value)

function Value({ n, format, id }: { n: number; format: (n: number) => string; id: string }) {
  return (
    <b className="num block text-[26px] font-extrabold leading-tight text-tx">
      <CountUp id={id} value={n} format={format} />
    </b>
  )
}

function MarketCard({ def }: { def: CardDef }) {
  const q = def.quote
  const has = usable(q)
  // Every value is provisional (the last closing, not live): one note says so; only a missing quote is marked.
  const pending = !has ? 'a definir' : null
  const spark = has ? sparkSeries(def.history) : null
  return (
    <StaggerItem as="li" className="min-w-0">
      <Lift className="flex h-full flex-col gap-1 rounded-2xl border border-line bg-card p-4">
        <h3 className="text-xs font-semibold text-gold">{def.label}</h3>
        {has ? (
          <Value n={q.value} format={def.format} id={`mercado-${def.label}`} />
        ) : (
          <b className="num block text-[26px] font-extrabold text-tx">…</b>
        )}
        <p className="text-xs text-mut">
          {has && <span>{unitText(q.unit)}</span>}
          {pending && (
            <span className="ml-1 rounded-full border border-warn-line px-1.5 text-[11px] text-gold">{pending}</span>
          )}
        </p>
        <p className="text-xs leading-snug text-mut">{def.hint}</p>
        {has && (
          <p className="mt-auto pt-2 text-[11px] leading-snug text-mut">
            {shortSources([q])} · {fmtDateBr(q.asOf)}
          </p>
        )}
        {spark && <Spark points={spark} />}
      </Lift>
    </StaggerItem>
  )
}

/** The FOB points shown on the landing (soja): the reference port, a port of the north arc and a few praças. */
const FOB_SHOWN = ['paranagua', 'itaqui', 'sorriso', 'rondonopolis', 'rio-verde', 'dourados'] as const

function FobList() {
  const rows = FOB_SHOWN.map((id) => FOB_POINTS.find((p) => p.id === id)).filter(
    (p): p is NonNullable<typeof p> => p !== undefined && fin(p.baseUsc.soja),
  )
  return (
    <Reveal id="mercado-fob" delay={0.2} className="h-full">
      <div className="flex h-full flex-col rounded-2xl border border-line bg-card p-4" data-testid="pontos-fob">
        <h3 className="text-xs font-semibold text-gold">Pontos FOB · soja</h3>
        <p className="mt-1 text-xs leading-snug text-mut">
          FOB é o preço no navio: o prêmio que o porto paga sobre a bolsa. Cada praça tem o seu.
        </p>
        <ul aria-label="Pontos FOB" className="mt-3 divide-y divide-line">
          {rows.map((p) => (
            <li key={p.id} className="flex items-baseline justify-between gap-2 py-1.5 text-sm">
              <span className="text-tx">{shortFobLabel(p)}</span>
              <span className="num text-right font-semibold text-tx">
                {fmtNum(p.baseUsc.soja as number, 2)} <span className="text-xs font-normal text-mut">US¢/bu</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-auto pt-3 text-[11px] leading-snug text-mut">
          Pontos FOB: Hedgepoint/CME/ESALQ, relatório de 04/11/2026
        </p>
      </div>
    </Reveal>
  )
}

function ImpactLine({ label, n }: { label: string; n: number }) {
  return (
    <Reveal id={`mercado-impacto-r-${label}`} delay={0.1} className="min-w-0">
      <div className="border-l-2 border-gold pl-4">
        <p className="text-sm text-mut">{label}</p>
        <b
          className={`num block text-[34px] font-extrabold leading-tight sm:text-[40px] ${n < 0 ? 'text-danger' : 'text-bar-pos'}`}
        >
          <CountUp id={`mercado-impacto-${label}`} value={n} format={signedBrlPerSc} />
        </b>
      </div>
    </Reveal>
  )
}

export function MercadoHoje({ ex }: { ex: LiveExample }) {
  const { snapshot } = useStore()
  // Typed as possibly absent: an API snapshot may come without milho (shown "a definir").
  const milho: Quote | undefined = snapshot.cbotUsc.milho
  const hist = snapshot.history
  const impact = marketImpact(ex)
  const cards: CardDef[] = [
    {
      label: 'CBOT soja',
      hint: 'Preço da soja na bolsa de Chicago.',
      quote: snapshot.cbotUsc.soja,
      format: (n) => fmtNum(n, 2),
      history: hist?.cbotUsc?.soja,
    },
    {
      label: 'Dólar PTAX',
      hint: 'Dólar de referência do Banco Central.',
      quote: snapshot.fx,
      format: (n) => fmtNum(n, 4),
      history: hist?.fx,
    },
    {
      label: 'Prêmio do porto',
      hint: 'O que o porto paga a mais que a bolsa.',
      quote: snapshot.basisUsc.soja,
      format: (n) => fmtNum(n, 2),
    },
    {
      label: 'CBOT milho',
      hint: 'Preço do milho na bolsa de Chicago.',
      quote: milho,
      format: (n) => fmtNum(n, 2),
      history: hist?.cbotUsc?.milho,
    },
  ]

  return (
    <Screen id="mercado" labelledBy="mercado-title">
      <div className={`${panelClass} min-h-[80svh]`}>
        <div className="absolute inset-0 overflow-hidden">
          <Parallax range={5}>
            <PhotoImg photo={PHOTOS.mercado} />
          </Parallax>
        </div>
        <Veil uniformAlways />
        <PhotoCaption text={PHOTOS.mercado.caption} className="hidden md:inline-block md:left-auto md:right-3" />

        <div className="relative z-10 p-5 sm:p-8 lg:p-14">
          <Reveal id="mercado-titulo" y={12}>
            <Eyebrow>
              O mercado de hoje · {ex.stale ? `fechamento ${fmtDayMonth(ex.asOf)}` : `atualizado ${fmtDayMonth(ex.asOf)}`}
            </Eyebrow>
            <h2
              id="mercado-title"
              tabIndex={-1}
              className="max-w-[24ch] text-balance text-[28px] font-extrabold leading-[1.08] tracking-[-0.01em] sm:text-[40px] lg:text-[48px]"
            >
              O preço da soja mudou hoje. E a sua margem?
            </h2>
            <p className="mt-4 max-w-[58ch] text-pretty text-base leading-relaxed text-mut">
              Três preços formam o que chega à sua fazenda: a bolsa de Chicago, o dólar e o prêmio do porto. Eles mudam
              todo dia. Quando um mexe, a sua margem mexe junto.
            </p>
          </Reveal>

          <div className="mt-8 grid gap-3 lg:grid-cols-[1.5fr_1fr]">
            <Stagger id="mercado-cards" as="ul" ariaLabel="Cotações do mercado" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {cards.map((def) => (
                <MarketCard key={def.label} def={def} />
              ))}
            </Stagger>
            <FobList />
          </div>

          <div className="mt-8 border-t border-line pt-6" aria-label="O que isso muda na margem">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-gold">
              O que isso muda na sua margem · fazenda do exemplo, por saca
            </h3>
            {impact.fxUpPerSc === null || impact.cbotUpPerSc === null ? (
              <p className="mt-2 text-sm text-mut">{MARKET_UNAVAILABLE}</p>
            ) : (
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <ImpactLine label="Dólar +R$ 0,10" n={impact.fxUpPerSc} />
                <ImpactLine label="CBOT +US¢ 10" n={impact.cbotUpPerSc} />
              </div>
            )}
            <p className="mt-4 text-xs text-mut">Valores provisórios do último fechamento, não ao vivo.</p>
          </div>
        </div>
      </div>
    </Screen>
  )
}
