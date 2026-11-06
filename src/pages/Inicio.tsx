import { useEffect } from 'react'
import { motion } from 'motion/react'
import { Logo } from '../ui/Logo'
import { Capa } from '../ui/inicio/Capa'
import { MercadoHoje } from '../ui/inicio/MercadoHoje'
import { OQueOAppFaz } from '../ui/inicio/OQueOAppFaz'
import { ComoFunciona } from '../ui/inicio/ComoFunciona'
import { ContaECores } from '../ui/inicio/ContaECores'
import { SuaMeta } from '../ui/inicio/SuaMeta'
import { ParaQuemFaq } from '../ui/inicio/ParaQuemFaq'
import { ScrollRail, useActiveSection, type RailSection } from '../ui/inicio/ScrollRail'
import { CtaLink, scrollToSection, useMotionOk } from '../ui/inicio/shared'
import { DUR, EASE_OUT, markLandingSeen, markPlayed, usePlayOnce } from '../ui/inicio/motion'
import { useScreenSnap } from '../ui/inicio/screenSnap'
import { useLiveExample } from '../ui/inicio/useLiveExample'

export const INICIO_SECTIONS: readonly RailSection[] = [
  { id: 'capa', title: 'Capa' },
  { id: 'mercado', title: 'Mercado de hoje' },
  { id: 'app-faz', title: 'O que o app faz' },
  { id: 'como-funciona', title: 'Como funciona' },
  { id: 'conta', title: 'A conta aberta' },
  { id: 'meta', title: 'Sua meta' },
  { id: 'duvidas', title: 'Para quem' },
]
const IDS = INICIO_SECTIONS.map((s) => s.id)
/** Slim fixed bar (logo + main button) once the capa is out of view; hidden on the last screen. */
function CtaBar() {
  const ok = usePlayOnce('cta-bar')
  useEffect(() => markPlayed('cta-bar'), [])
  const cls =
    'fixed inset-x-0 bottom-14 z-30 border-t border-line bg-g9 shadow-2xl md:bottom-0'
  const inner = (
    <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-4 py-2 md:px-[18px]">
      <Logo className="hidden sm:inline-flex" />
      <CtaLink className="w-full sm:w-auto" />
    </div>
  )
  if (!ok) {
    return (
      <div data-testid="cta-bar" className={cls}>
        {inner}
      </div>
    )
  }
  return (
    <motion.div
      data-testid="cta-bar"
      className={cls}
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      transition={{ duration: DUR.base, ease: EASE_OUT }}
    >
      {inner}
    </motion.div>
  )
}

/** Hairline that fades out at both ends, between two screens (decorative). */
function SectionDivider() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto h-px w-full max-w-[720px] bg-gradient-to-r from-transparent via-line-strong to-transparent"
    />
  )
}

export function Inicio() {
  const ex = useLiveExample()
  const ok = useMotionOk()
  useScreenSnap(IDS)
  // From here on, components without an id render static: every animation plays once per session.
  useEffect(() => markLandingSeen(), [])
  const { active, pastFirst } = useActiveSection(IDS)
  // Once the capa (first screen) has left the view, and not on the last screen.
  const showBar = pastFirst && active < IDS.length - 1

  return (
    <div data-testid="page-inicio" className="relative overflow-x-clip pb-16 md:pb-14">
      <Capa ex={ex} />
      <SectionDivider />
      <MercadoHoje ex={ex} />
      <SectionDivider />
      <OQueOAppFaz ex={ex} />
      <SectionDivider />
      <ComoFunciona ex={ex} />
      <SectionDivider />
      <ContaECores ex={ex} />
      <SectionDivider />
      <SuaMeta ex={ex} />
      <SectionDivider />
      <ParaQuemFaq />
      <ScrollRail sections={INICIO_SECTIONS} active={active} onGo={(i) => scrollToSection(IDS[i], ok)} />
      {showBar && <CtaBar />}
    </div>
  )
}
