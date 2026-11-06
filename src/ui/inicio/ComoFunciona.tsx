import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { ArrowDown, ArrowRight, Info } from 'lucide-react'
import { fmtNum } from '../format'
import { PHOTOS, type PhotoDef } from './photos'
import { DUR, EASE_OUT, Lift, Parallax, Reveal, Stagger, StaggerItem, markPlayed, useFirstTime } from './motion'
import { Eyebrow, PhotoCaption, PhotoImg, Screen } from './shared'
import type { LiveExample } from './useLiveExample'

interface Step {
  title: string
  badge?: string
  photo: PhotoDef
  faz: ReactNode
  mostra: ReactNode
  importa: ReactNode
  nota?: ReactNode
}

/** The three steps, in the order of the app. The numbers in "Por que importa" come from the engine example. */
export function steps(ex: LiveExample): Step[] {
  const y = ex.why.yieldUpCostDropPerSc
  const share = ex.why.adubacaoShare
  const fx = ex.why.fxUpMarginPerSc
  const margin = ex.marginPerSc
  return [
    {
      title: 'Lavoura e custos',
      badge: 'Obrigatório',
      photo: PHOTOS.passo1,
      faz: 'Escolha a praça. Digite sua área, sua produtividade e seus custos.',
      mostra: 'O custo de cada saca e o preço da sua fazenda. Os campos começam vazios: o número é seu.',
      importa: [
        y === null
          ? 'A produtividade muda o custo de cada saca.'
          : `No exemplo ilustrativo, 3 sc/ha a mais baixam o custo em R$ ${fmtNum(y, 2)} por saca.`,
        share === null ? 'A adubação é um dos maiores custos.' : `A adubação pesa ${fmtNum(share * 100, 0)}% do custo.`,
      ].join(' '),
      nota: 'Quer mais precisão? Detalhe a adubação produto por produto.',
    },
    {
      title: 'Comercialização',
      badge: 'Depois dos custos',
      photo: PHOTOS.passo2,
      faz: 'Diga quanto já vendeu, a que preço e a que dólar. Registre também suas operações na bolsa.',
      mostra: 'Quanto da safra já tem preço fechado e quanto ainda depende do mercado.',
      importa:
        fx === null
          ? 'O dólar mexe direto na parte que ainda não foi vendida.'
          : `No exemplo ilustrativo, R$ 0,25 a mais no dólar sobem a margem em R$ ${fmtNum(fx, 2)} por saca, na parte ainda não vendida.`,
    },
    {
      title: 'Resultados financeiros',
      photo: PHOTOS.passo3,
      faz: 'Escolha um cenário de CBOT (a bolsa de Chicago), dólar e basis.',
      mostra: 'Quanto sobra por saca, por hectare e na área toda, com a conta aberta.',
      importa:
        margin === null
          ? 'A margem de cada cenário aparece de uma vez, na mesma tela.'
          : `No exemplo ilustrativo, a margem de hoje é de R$ ${fmtNum(margin, 2)} por saca. A matriz mostra o que muda se o mercado mexer.`,
    },
  ]
}

/** A line between two steps that draws itself: horizontal in the gap on wide screens, vertical on phones. */
function Connector({ id, delay }: { id: string; delay: number }) {
  // Draws itself only the first time it is seen in the visit; otherwise the full line, at once.
  const play = useFirstTime(id, false)
  const t = { duration: DUR.base, ease: EASE_OUT, delay }
  const view = { once: true, amount: 0.6 } as const
  const done = () => markPlayed(id)
  return (
    <>
      <span
        aria-hidden="true"
        data-testid="connector"
        className="pointer-events-none absolute left-full top-24 z-10 hidden h-0 w-8 items-center md:flex"
      >
        {play ? (
          <motion.span
            className="block h-px w-full origin-left bg-gold"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={view}
            onViewportEnter={done}
            transition={t}
          />
        ) : (
          <span className="block h-px w-full bg-gold" />
        )}
        <ArrowRight size={14} className="absolute -right-0.5 text-gold" />
      </span>
      <span
        aria-hidden="true"
        data-testid="connector"
        className="pointer-events-none absolute left-1/2 top-full z-10 flex h-8 w-0 -translate-x-1/2 justify-center md:hidden"
      >
        {play ? (
          <motion.span
            className="block h-full w-px origin-top bg-gold"
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={view}
            onViewportEnter={done}
            transition={t}
          />
        ) : (
          <span className="block h-full w-px bg-gold" />
        )}
        <ArrowDown size={14} className="absolute -bottom-1 text-gold" />
      </span>
    </>
  )
}

function StepCard({ s, n, last }: { s: Step; n: number; last: boolean }) {
  return (
    <StaggerItem as="li" className="relative">
      <Lift className="h-full">
        <div className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-card">
          <div className="relative h-44 shrink-0 overflow-hidden sm:h-48">
            <Parallax>
              <PhotoImg photo={s.photo} />
            </Parallax>
            <PhotoCaption text={s.photo.caption} />
          </div>
          <div className="flex flex-1 flex-col p-5">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-acc text-sm font-extrabold text-accink"
              >
                {n}
              </span>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-tx">
                  <span className="sr-only">Passo {n}: </span>
                  {s.title}
                </h3>
                {s.badge && (
                  <span className="mt-1 inline-block rounded-full border border-gold px-2.5 py-0.5 text-[11px] font-semibold text-gold">
                    {s.badge}
                  </span>
                )}
              </div>
            </div>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="inline font-semibold text-tx">Você faz: </dt>
                <dd className="inline text-mut">{s.faz}</dd>
              </div>
              <div className="border-t border-line pt-3">
                <dt className="inline font-semibold text-tx">O app mostra: </dt>
                <dd className="inline text-mut">{s.mostra}</dd>
              </div>
              <div className="border-t border-line pt-3">
                <dt className="inline font-semibold text-tx">Por que importa: </dt>
                <dd className="num inline text-gold">{s.importa}</dd>
              </div>
            </dl>
            {s.nota && <p className="mt-4 rounded-lg border border-warn-line px-3 py-2 text-sm text-tx">{s.nota}</p>}
          </div>
        </div>
      </Lift>
      {!last && <Connector id={`comofunciona.conector.${n}`} delay={0.3 + 0.1 * n} />}
    </StaggerItem>
  )
}

export function ComoFunciona({ ex }: { ex: LiveExample }) {
  const list = steps(ex)
  return (
    <Screen id="como-funciona" labelledBy="como-title">
      <div className="rounded-2xl border border-line bg-bg p-5 sm:p-8 lg:p-12">
        <Reveal id="comofunciona.cabecalho">
          <Eyebrow>Como funciona</Eyebrow>
          <h2 id="como-title" tabIndex={-1} className="text-balance text-[28px] font-extrabold leading-tight sm:text-4xl">
            Como funciona em três passos
          </h2>
          <p className="mt-3 max-w-[60ch] text-pretty text-base text-mut sm:text-lg">
            Siga a ordem. Cada passo usa o que você preencheu no anterior.
          </p>
        </Reveal>
        <Stagger id="comofunciona.passos" as="ol" gap={0.14} className="mt-8 grid gap-8 md:grid-cols-3">
          {list.map((s, i) => (
            <StepCard key={s.title} s={s} n={i + 1} last={i === list.length - 1} />
          ))}
        </Stagger>
        <Reveal id="comofunciona.aviso" className="mt-8">
          <p className="flex items-start gap-3 rounded-xl border border-line bg-card px-5 py-4 text-sm text-tx sm:text-base">
            <Info aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-gold" />
            <span>
              Comece por Lavoura e custos: as outras páginas só abrem depois dela. Seus dados ficam salvos neste
              navegador.
            </span>
          </p>
        </Reveal>
      </div>
    </Screen>
  )
}
