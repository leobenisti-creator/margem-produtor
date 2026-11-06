import { Fragment, useEffect, useId, useState } from 'react'
import { motion } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import { useStore } from '../../state/StoreProvider'
import { fmtDateBr, fmtNum } from '../format'
import { Parallax, Reveal, markPlayed, usePlayOnce } from './motion'
import { PHOTOS } from './photos'
import { CtaLink, Eyebrow, PhotoImg, Veil, Screen, panelClass } from './shared'
import { exampleMarginAt, marketUsable, type LiveExample } from './useLiveExample'

const TITLE_WORDS: { w: string; acc: boolean }[] = [
  { w: 'Saiba', acc: false },
  { w: 'quanto', acc: false },
  { w: 'sobra', acc: false },
  { w: 'por', acc: true },
  { w: 'saca', acc: true },
  { w: 'antes', acc: false },
  { w: 'de', acc: false },
  { w: 'vender.', acc: false },
]

/** Slider spans around the closing: dólar ±R$ 0,30 (step R$ 0,01), CBOT soja ±US¢ 120 (step 1). */
export const FX_SPAN_CENTS = 30
export const CBOT_SPAN_USC = 120

/** Indexes match engine/matrix toneFor (0 red, 1 amber, 2 green). */
const TONE_TEXT = ['text-tone0', 'text-tone1', 'text-tone2'] as const
const TONE_WORD = ['negativa', 'baixa', 'boa'] as const

function TitleWords({ ok }: { ok: boolean }) {
  return (
    <h1
      id="capa-title"
      tabIndex={-1}
      className="text-balance text-[34px] font-extrabold leading-[1.05] tracking-[-0.015em] sm:text-[46px] lg:text-[60px]"
    >
      {TITLE_WORDS.map(({ w, acc }, i) => (
        <Fragment key={i}>
          {ok ? (
            <motion.span
              className={`inline-block ${acc ? 'text-gold' : ''}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.15 + i * 0.07, ease: 'easeOut' }}
            >
              {w}
            </motion.span>
          ) : (
            <span className={acc ? 'text-gold' : undefined}>{w}</span>
          )}
          {i < TITLE_WORDS.length - 1 ? ' ' : ''}
        </Fragment>
      ))}
    </h1>
  )
}

/** "Exemplo ao vivo": the margin per sack recomputed in memory by the engine as the two sliders move. */
function ExampleCard({ ex }: { ex: LiveExample }) {
  const uid = useId()
  const usable = marketUsable(ex.scenario)
  const [fxCents, setFxCents] = useState(0)
  const [cbotDelta, setCbotDelta] = useState(0)
  const fx = ex.scenario.fx + fxCents / 100
  const cbot = ex.scenario.cbotUsc + cbotDelta
  const at = usable ? exampleMarginAt(ex, fx, cbot) : null
  const marginPerSc = at ? at.marginPerSc : ex.marginPerSc
  const farmPrice = at ? at.farmPrice : ex.farmPrice
  const tone = at ? at.tone : null
  const fxText = `R$ ${fmtNum(fx, 2)}`
  const cbotText = `US¢ ${fmtNum(cbot, 2)}`

  return (
    <div
      data-testid="capa-exemplo"
      className="w-full max-w-[380px] rounded-2xl border border-line bg-card p-5 shadow-2xl md:w-[34%] md:min-w-[280px]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
        <div>
          <p className="text-sm font-extrabold text-tx">Exemplo ao vivo</p>
          <p className="text-xs text-mut">{ex.regionLabel}</p>
        </div>
        <span className="rounded-full border border-warn-line px-2 py-0.5 text-[11px] text-gold">mexa nos controles</span>
      </div>
      <p className="mt-4" role="status" data-testid="capa-margem">
        <b
          data-tone={tone === null ? 'na' : String(tone)}
          className={`num text-[40px] font-extrabold leading-none ${tone === null ? 'text-tx' : TONE_TEXT[tone]}`}
        >
          {marginPerSc === null ? '—' : `R$ ${fmtNum(marginPerSc, 2)}`}
        </b>{' '}
        <span className="text-sm text-mut">por saca de margem</span>
        {tone !== null && <span className="sr-only"> (margem {TONE_WORD[tone]})</span>}
      </p>
      {usable ? (
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label htmlFor={`${uid}-fx`} className="flex items-baseline justify-between text-xs text-mut">
              <span>Dólar</span>
              <span className="num font-semibold text-tx">{fxText}</span>
            </label>
            <input
              id={`${uid}-fx`}
              type="range"
              min={-FX_SPAN_CENTS}
              max={FX_SPAN_CENTS}
              step={1}
              value={fxCents}
              aria-valuetext={fxText}
              onChange={(e) => setFxCents(Number(e.target.value))}
              className="block h-11 w-full cursor-pointer accent-gold"
            />
          </div>
          <div>
            <label htmlFor={`${uid}-cbot`} className="flex items-baseline justify-between text-xs text-mut">
              <span>Bolsa de Chicago (CBOT soja)</span>
              <span className="num font-semibold text-tx">{cbotText}</span>
            </label>
            <input
              id={`${uid}-cbot`}
              type="range"
              min={-CBOT_SPAN_USC}
              max={CBOT_SPAN_USC}
              step={1}
              value={cbotDelta}
              aria-valuetext={cbotText}
              onChange={(e) => setCbotDelta(Number(e.target.value))}
              className="block h-11 w-full cursor-pointer accent-gold"
            />
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-mut">Dólar ou CBOT indisponível: sem simulação agora.</p>
      )}
      <p className="mt-4 border-t border-line pt-3 text-xs text-mut">
        Preço na fazenda <span className="num text-tx">R$ {fmtNum(farmPrice, 2)}</span> · custo{' '}
        <span className="num text-tx">R$ {fmtNum(ex.costPerSc, 2)}</span> por saca
      </p>
      <p className="mt-2 text-[11px] leading-snug text-mut">
        Exemplo ilustrativo, não é a sua fazenda.{' '}
        {ex.stale ? `Calculado com o fechamento de ${fmtDateBr(ex.asOf)}.` : 'Calculado com os dados de hoje.'}
      </p>
    </div>
  )
}

export function Capa({ ex }: { ex: LiveExample }) {
  const play = usePlayOnce('capa-title')
  useEffect(() => markPlayed('capa-title'), [])
  const { snapshot } = useStore()
  const cbot = snapshot.cbotUsc.soja
  const fx = snapshot.fx
  const premio = snapshot.basisUsc.soja

  return (
    <Screen id="capa" labelledBy="capa-title">
      <div className={`${panelClass} flex min-h-[88svh] flex-col`}>
        <div className="absolute inset-0 overflow-hidden">
          <Parallax range={6}>
            <PhotoImg photo={PHOTOS.capa} priority />
          </Parallax>
        </div>
        <Veil />

        <div className="relative z-10 flex flex-1 flex-col justify-center gap-8 p-5 sm:p-8 md:flex-row md:items-center md:justify-between lg:p-14">
          <div className="max-w-[660px] md:max-w-[56%]">
            <Reveal id="capa-eyebrow" delay={0.05} y={12}>
              <Eyebrow>Margem do produtor · Soja e milho</Eyebrow>
            </Reveal>
            <TitleWords ok={play} />
            <Reveal id="capa-sub" delay={0.7} y={14}>
              <p className="mt-5 max-w-[46ch] text-pretty text-base leading-relaxed text-mut sm:text-lg">
                Junte o custo, o preço do dia e o dólar numa conta só. Você vê cada linha e sabe o que sobra em cada saca.
              </p>
            </Reveal>
            <Reveal id="capa-cta" delay={0.85} y={14} className="mt-7">
              <CtaLink />
            </Reveal>
          </div>

          <Reveal id="capa-exemplo" delay={0.6} y={28} className="md:flex md:justify-end">
            <ExampleCard ex={ex} />
          </Reveal>
        </div>

        <p className="relative z-10 flex items-center justify-center gap-1.5 pb-3 text-xs text-mut">
          Role para ver como funciona
          <ChevronDown size={14} aria-hidden="true" />
        </p>

        <div className="relative z-10 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-line bg-g9 px-5 py-3 text-xs text-mut sm:px-8 lg:px-14">
          {ex.stale ? (
            <span className="font-semibold text-gold">Fechamento {fmtDateBr(ex.asOf)}</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-semibold text-bar-pos">
              <i aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-bar-pos" />
              AO VIVO
            </span>
          )}
          <span>
            CBOT <b className="num text-tx">{fmtNum(cbot.value, 2)}</b>
          </span>
          <span>
            Dólar <b className="num text-tx">{fmtNum(fx.value, 4)}</b>
          </span>
          <span>
            Prêmio do porto <b className="num text-tx">{fmtNum(premio.value, 2)}</b>
          </span>
        </div>
      </div>
    </Screen>
  )
}
