import { Calculator, Grid3x3, Handshake, Home } from 'lucide-react'
import type { TabRoute } from './routes'

const ICONS = { inicio: Home, simulador: Calculator, comercializacao: Handshake, resultados: Grid3x3 } as const

/** Journey step of each numbered tab (Início stays unnumbered). */
export const STEPS: Partial<Record<TabRoute, number>> = { simulador: 1, comercializacao: 2, resultados: 3 }

/** Small numbered circle shown beside a step label; decorative (the order is also the order of the tabs). */
export function StepBadge({ step, on }: { step: number; on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold leading-none ${
        on ? 'border-gold text-tx' : 'border-line text-mut'
      }`}
    >
      {step}
    </span>
  )
}

/** One icon per destination (Lucide, 20 px, stroke 1.75), always decorative beside its label. */
export function RouteIcon({ route, className = '' }: { route: TabRoute; className?: string }) {
  const Icon = ICONS[route]
  return <Icon aria-hidden="true" size={20} strokeWidth={1.75} className={`shrink-0 ${className}`} />
}
