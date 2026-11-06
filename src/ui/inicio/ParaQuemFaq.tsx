import { useRef, useState, type KeyboardEvent } from 'react'
import { PHOTOS } from './photos'
import { FadeSwap, Parallax, Reveal } from './motion'
import { CtaLink, Eyebrow, PhotoCaption, PhotoImg, Screen, Veil, panelClass } from './shared'

/** One sentence per profile: what each one gets from the same open calculation. Nothing here claims more than the app does. */
export const PROFILES: { id: string; label: string; text: string }[] = [
  {
    id: 'produtor',
    label: 'Produtor',
    text: 'Veja quanto sobra por saca antes de vender e o que acontece com a sua margem se o dólar ou a CBOT mexerem.',
  },
  {
    id: 'consultor',
    label: 'Consultor',
    text: 'Mostre ao seu cliente a conta aberta, linha a linha, e o que precisa acontecer para ele bater a meta dele.',
  },
  {
    id: 'banco',
    label: 'Banco',
    text: 'Confira a margem da safra com os números que o produtor informa e veja quantos cenários de mercado ela aguenta.',
  },
  {
    id: 'cooperativa',
    label: 'Cooperativa',
    text: 'Dê ao cooperado uma conta aberta, que ele mesmo confere com os próprios números.',
  },
]

const PANEL_ID = 'perfil-panel'

function Profiles() {
  const [active, setActive] = useState(0)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const go = (i: number) => {
    const n = (i + PROFILES.length) % PROFILES.length
    setActive(n)
    refs.current[n]?.focus()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(active + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(active - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(PROFILES.length - 1)
    else return
    e.preventDefault()
  }
  const current = PROFILES[active]
  return (
    <div className="mt-6">
      <p className="mb-3 text-sm text-mut">A mesma conta aberta serve a cada um de um jeito:</p>
      <div role="tablist" aria-label="Para quem" onKeyDown={onKey} className="flex flex-wrap gap-2">
        {PROFILES.map((p, i) => (
          <button
            key={p.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`perfil-tab-${p.id}`}
            aria-selected={i === active}
            aria-controls={PANEL_ID}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            className={`min-h-[44px] rounded-full border px-5 text-sm font-semibold transition-colors ${
              i === active ? 'border-gold bg-acc text-accink' : 'border-line-strong bg-card text-tx hover:text-gold'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={PANEL_ID}
        aria-labelledby={`perfil-tab-${current.id}`}
        className="mt-4 rounded-2xl border border-line bg-card p-5 text-base leading-relaxed text-tx sm:p-6 sm:text-lg"
      >
        <FadeSwap id={current.id}>
          <p>{current.text}</p>
        </FadeSwap>
      </div>
    </div>
  )
}

export function ParaQuemFaq() {
  return (
    <Screen id="duvidas" labelledBy="duvidas-title">
      <div className={`${panelClass} min-h-[86svh]`}>
        <div className="absolute inset-0 overflow-hidden">
          <Parallax>
            <PhotoImg photo={PHOTOS.final} />
          </Parallax>
        </div>
        <Veil />
        <PhotoCaption text={PHOTOS.final.caption} className="hidden md:inline-block md:left-auto md:right-3" />

        <div className="relative z-10 p-5 sm:p-8 md:max-w-[56%] lg:p-12">
          <Reveal id="paraquem.cabecalho">
            <Eyebrow>Para quem</Eyebrow>
            <h2
              id="duvidas-title"
              tabIndex={-1}
              className="text-balance text-[26px] font-extrabold leading-tight sm:text-[36px]"
            >
              Feito para quem decide a venda da safra
            </h2>
          </Reveal>
          <Reveal id="paraquem.perfis" delay={0.1}>
            <Profiles />
          </Reveal>
          <Reveal id="paraquem.cta" delay={0.2} className="mt-8">
            <CtaLink glow />
          </Reveal>
        </div>
      </div>
    </Screen>
  )
}
