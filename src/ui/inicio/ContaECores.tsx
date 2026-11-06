import { useState } from 'react'
import { motion } from 'motion/react'
import { toneFor, type Matrix } from '../../engine/matrix'
import { useStore } from '../../state/StoreProvider'
import { fmtDateBr, fmtNum } from '../format'
import { latestAsOf } from '../Ticker'
import { PHOTOS } from './photos'
import { FadeSwap, GrowBar, Parallax, Reveal, Stagger, StaggerItem, markPlayed, useFirstTime } from './motion'
import { Eyebrow, PhotoCaption, PhotoImg, Screen, Veil, panelClass } from './shared'
import { MARKET_UNAVAILABLE, type LiveExample } from './useLiveExample'

const TONE_BG = ['bg-tone0', 'bg-tone1', 'bg-tone2'] as const
/** Target of the "Com meta" view of the matrix. */
export const DEMO_TARGET = 0.05
/** Steps of the 9×9 grid kept in the 7×7 view: indices 1..7 (±10%, ±5%, ±2,5% and today). */
const INNER = [1, 2, 3, 4, 5, 6, 7] as const

/** The only data that comes from outside the app (the rest is the visitor's own, here an illustrative example). */
export const SOURCES_LINE = 'CBOT (Yahoo Finance, não oficial) · dólar PTAX (BCB) · pontos FOB (Hedgepoint/CME/ESALQ)'

interface Line {
  label: string
  /** One plain sentence on what the line means. */
  gloss: string
  /** Where the number comes from (tooltip). */
  source: string
  value: number | null
  kind: 'pos' | 'neg' | 'total' | 'sub'
  /** Bar position and size on the staircase, as fractions (0 to 1) of the first line. */
  from: number
  size: number
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)

function buildLines(ex: LiveExample): Line[] {
  const ref = ex.result.referencePriceBrl
  const fees = ex.inputs.freightBrlPerSc + ex.inputs.portFeesBrlPerSc
  const farm = ex.farmPrice
  const cost = ex.costPerSc
  const margin = ex.marginPerSc
  const unit = ref !== null && ref > 0 ? ref : null
  const frac = (n: number | null) => (unit === null || n === null ? 0 : clamp01(n / unit))
  const premium = 'prêmio do porto'
  const costFrom = farm !== null && cost !== null ? clamp01((farm - cost) / (unit ?? 1)) : 0
  const farmFrac = frac(farm)
  return [
    {
      label: 'Bolsa × dólar',
      gloss: 'O que a saca vale no porto, em reais.',
      source: `CBOT (Yahoo Finance, não oficial) mais o ${premium}, convertidos em reais pelo dólar PTAX (BCB). O prêmio do porto vem do ponto FOB (Hedgepoint/CME/ESALQ).`,
      value: ref,
      kind: 'pos',
      from: 0,
      size: unit === null ? 0 : 1,
    },
    {
      label: '− Frete e taxas',
      gloss: 'O que custa levar a saca até o porto.',
      source: 'Frete da praça até o porto mais as taxas do porto, em R$ por saca. No exemplo são valores ilustrativos; no app, são os seus.',
      value: ref === null ? null : fees,
      kind: 'neg',
      from: unit === null ? 0 : clamp01((unit - fees) / unit),
      size: frac(fees),
    },
    {
      label: '= Preço na fazenda',
      gloss: 'O que a saca vale na sua porteira.',
      source: 'Bolsa × dólar menos frete e taxas.',
      value: farm,
      kind: 'sub',
      from: 0,
      size: farmFrac,
    },
    {
      label: '− Custo',
      gloss: 'O que custa produzir cada saca.',
      source: 'Custo por hectare do exemplo ilustrativo dividido pela produtividade. No app, são os seus custos e a sua produtividade.',
      value: cost,
      kind: 'neg',
      from: costFrom,
      size: Math.max(0, farmFrac - costFrom),
    },
    {
      label: 'Margem',
      gloss: 'O que sobra para você em cada saca.',
      source: 'Preço na fazenda menos o custo, por saca.',
      value: margin,
      kind: 'total',
      from: 0,
      size: frac(margin === null ? null : Math.abs(margin)),
    },
  ]
}

function ContaBars({ ex }: { ex: LiveExample }) {
  const lines = buildLines(ex)
  const [tip, setTip] = useState<number | null>(null)
  const baseId = 'conta-fonte'
  return (
    <div className="h-full rounded-2xl border border-line bg-card p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-mut">A conta, em R$ por saca</p>
      <p className="mt-1 text-xs text-mut">Exemplo ilustrativo · {ex.regionLabel}</p>
      <ul className="mt-4 grid gap-1" onKeyDown={(e) => e.key === 'Escape' && setTip(null)}>
        {lines.map((l, i) => {
          const negativeMargin = l.kind === 'total' && (l.value ?? 0) < 0
          const fill =
            l.kind === 'neg' || negativeMargin ? 'bg-bar-neg' : l.kind === 'total' ? 'bg-bar-pos' : 'bg-bar-final'
          const valueClass =
            l.kind === 'neg' || negativeMargin ? 'text-danger' : l.kind === 'total' ? 'text-bar-pos' : 'text-tx'
          const id = `${baseId}-${i}`
          return (
            <li key={l.label} className={`relative ${l.kind === 'total' ? 'mt-1 border-t border-line pt-2' : ''}`}>
              <button
                type="button"
                aria-describedby={id}
                onMouseEnter={() => setTip(i)}
                onMouseLeave={() => setTip((t) => (t === i ? null : t))}
                onFocus={() => setTip(i)}
                onBlur={() => setTip((t) => (t === i ? null : t))}
                className="block min-h-[44px] w-full rounded-md py-1.5 text-left"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className={`text-sm ${l.kind === 'total' || l.kind === 'sub' ? 'font-bold text-tx' : 'text-tx'}`}>
                    {l.label}
                  </span>
                  <b className={`num text-base ${valueClass}`}>{fmtNum(l.value, 2)}</b>
                </span>
                <span className="mt-0.5 block text-xs text-mut">{l.gloss}</span>
                <span aria-hidden="true" className="mt-1.5 block h-2 overflow-hidden rounded-full bg-bar-track">
                  <span className="block h-full" style={{ marginLeft: `${l.from * 100}%`, width: `${l.size * 100}%` }}>
                    <GrowBar id={`conta.escada.${i}`} ratio={1} delay={0.22 * i} className={`rounded-full ${fill}`} />
                  </span>
                </span>
              </button>
              <span
                id={id}
                role="tooltip"
                className={
                  tip === i
                    ? 'absolute inset-x-0 top-full z-20 mt-1 rounded-lg border border-line-strong bg-g9 px-3 py-2 text-xs text-tx shadow-lg'
                    : 'sr-only'
                }
              >
                {tip === i && <span className="font-semibold">De onde vem: </span>}
                {l.source}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-xs text-mut">Toque, passe o mouse ou use a tecla Tab numa linha para ver de onde vem o número.</p>
    </div>
  )
}

/** Tone of every cell of the 7×7 view: dollar in the rows, CBOT in the columns. Pure, the app's own rule. */
export function innerTones(m: Matrix, target: number | null): (0 | 1 | 2 | null)[][] {
  return INNER.map((fxI) => INNER.map((cbotI) => toneFor(m.cells[cbotI][fxI].marginPct, target)))
}

const pctLabel = (p: number) => `${p > 0 ? '+' : ''}${fmtNum(p, Number.isInteger(p) ? 0 : 1)}%`

const LEGEND_PLAIN = ['perde dinheiro', 'baixa, até 10%', 'boa, 10% ou mais'] as const
const LEGEND_TARGET = ['longe da meta', 'perto da meta', 'bate a meta'] as const

function MiniMatrix({ ex }: { ex: LiveExample }) {
  const [withTarget, setWithTarget] = useState(false)
  // The cells fade in diagonally only the first time they are seen in the visit; the toggle never replays it.
  const play = useFirstTime('conta.matriz', false)
  const m = ex.matrix
  if (m === null) {
    return (
      <div className="h-full rounded-2xl border border-line bg-card p-5 sm:p-6">
        <p className="text-sm text-mut">{MARKET_UNAVAILABLE}</p>
      </div>
    )
  }
  const target = withTarget ? DEMO_TARGET : null
  const tones = innerTones(m, target)
  const counts = [0, 0, 0]
  for (const row of tones) for (const t of row) if (t !== null) counts[t] += 1
  const targetText = fmtNum(DEMO_TARGET * 100, 0)
  const legend = withTarget ? LEGEND_TARGET : LEGEND_PLAIN
  const toggle = (on: boolean, label: string) => (
    <button
      type="button"
      aria-pressed={withTarget === on}
      onClick={() => setWithTarget(on)}
      className={`min-h-[44px] rounded-full border px-4 text-sm font-semibold transition-colors ${
        withTarget === on ? 'border-gold bg-acc text-accink' : 'border-line-strong text-tx hover:text-gold'
      }`}
    >
      {label}
    </button>
  )
  return (
    <div className="h-full rounded-2xl border border-line bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-mut">49 cenários do mercado</p>
        <div role="group" aria-label="Ver a matriz" className="flex gap-2">
          {toggle(false, 'Sem meta')}
          {toggle(true, `Com meta ${targetText}%`)}
        </div>
      </div>
      <p className="mt-3 text-xs text-mut">
        Cada quadrado é um jeito de o dólar e a CBOT amanhecerem. O quadrado com borda é o mercado de hoje.
      </p>
      <div className="mt-3 grid grid-cols-[2.75rem_1fr] gap-x-1.5">
        <span aria-hidden="true" className="self-end pb-1 text-right text-[10px] font-semibold uppercase text-mut">
          Dólar
        </span>
        <div aria-hidden="true">
          <p className="mb-1 text-center text-[10px] font-semibold uppercase text-mut">CBOT</p>
          <div className="grid grid-cols-7 gap-[3px] text-center text-[10px] text-mut">
            {INNER.map((c) => (
              <span key={c} className="num">
                {pctLabel(m.cbotPct[c])}
              </span>
            ))}
          </div>
        </div>
        <div aria-hidden="true" className="mt-1 grid grid-rows-7 gap-[3px] text-right text-[10px] text-mut">
          {INNER.map((r) => (
            <span key={r} className="num flex items-center justify-end">
              {pctLabel(m.fxPct[r])}
            </span>
          ))}
        </div>
        <div
          role="img"
          aria-label={`Matriz de 49 cenários de dólar × CBOT do exemplo, ${withTarget ? `com meta de ${targetText}%` : 'sem meta'}: ${counts[2]} verdes, ${counts[1]} amarelos e ${counts[0]} vermelhos.`}
          className="mt-1 grid grid-cols-7 gap-[3px]"
        >
          {tones.flatMap((row, r) =>
            row.map((t, c) => {
              const centre = r === 3 && c === 3
              const cls = `block aspect-square rounded-[3px] transition-colors duration-150 ${
                t === null ? 'bg-tonena' : TONE_BG[t]
              } ${centre ? 'ring-2 ring-tx' : ''}`
              return play ? (
                <motion.i
                  key={`${r}-${c}`}
                  className={cls}
                  initial={{ opacity: 0.12 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  onViewportEnter={() => markPlayed('conta.matriz')}
                  transition={{ duration: 0.3, delay: ((r + c) / 12) * 0.9 }}
                />
              ) : (
                <i key={`${r}-${c}`} className={cls} />
              )
            }),
          )}
        </div>
      </div>
      <ul aria-label="Legenda das cores" className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-tx">
        {legend.map((text, i) => (
          <li key={i}>
            <i aria-hidden="true" className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-sm ${TONE_BG[i]}`} />
            {text}
          </li>
        ))}
      </ul>
      <FadeSwap id={withTarget ? 'com' : 'sem'} className="mt-3">
        <p className="text-sm text-mut">
          {withTarget
            ? `Com meta, as cores medem a distância até ela: verde bate a meta de ${targetText}%, amarelo fica até 5 pontos abaixo e vermelho fica mais longe.`
            : 'Sem meta, as cores olham só a margem: vermelho perde dinheiro, amarelo ganha pouco e verde ganha bem.'}
        </p>
      </FadeSwap>
    </div>
  )
}

export function ContaECores({ ex }: { ex: LiveExample }) {
  const { snapshot } = useStore()
  const asOf = latestAsOf([snapshot.cbotUsc.soja, snapshot.fx]) || ex.asOf
  return (
    <Screen id="conta" labelledBy="conta-title">
      <div className={`${panelClass} min-h-[80svh]`}>
        <div className="absolute inset-0 overflow-hidden">
          <Parallax>
            <PhotoImg photo={PHOTOS.conta} />
          </Parallax>
        </div>
        <Veil uniformAlways />
        <PhotoCaption text={PHOTOS.conta.caption} className="left-auto right-3" />
        <div className="relative z-10 p-5 sm:p-8 lg:p-12">
          <Reveal id="conta.cabecalho">
            <Eyebrow>A conta aberta e as cores</Eyebrow>
            <h2
              id="conta-title"
              tabIndex={-1}
              className="max-w-[24ch] text-balance text-[26px] font-extrabold leading-tight sm:text-[34px]"
            >
              Você confere cada número e vê o que o mercado pode fazer
            </h2>
            <p className="mt-3 max-w-[62ch] text-pretty text-sm text-mut sm:text-base">
              À esquerda, a conta de uma saca, passo a passo. À direita, o que acontece com ela quando o dólar e a CBOT
              mudam.
            </p>
          </Reveal>
          <Stagger id="conta.cartoes" className="mt-6 grid gap-5 lg:grid-cols-2" gap={0.14}>
            <StaggerItem>
              <ContaBars ex={ex} />
            </StaggerItem>
            <StaggerItem>
              <MiniMatrix ex={ex} />
            </StaggerItem>
          </Stagger>
          <p className="mt-5 text-xs text-mut">
            Fontes: {SOURCES_LINE}. Custos e fazenda são seus; aqui, um exemplo ilustrativo com cotações de{' '}
            {fmtDateBr(asOf)} (valores do último fechamento, não ao vivo).
          </p>
        </div>
      </div>
    </Screen>
  )
}
