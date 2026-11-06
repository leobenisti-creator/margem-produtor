import { useRef, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { PhotoDef } from './photos'
import { VEIL_CAPTION, VEIL_SIDE, VEIL_UNIFORM } from './overlay'
import { useFirstTime } from './session'
import { useJourneyState } from '../useJourneyState'
import { JourneyDialog } from './JourneyDialog'

/**
 * True when entrance/scroll animations may run: motion allowed and IntersectionObserver present.
 * Otherwise (reduced motion, jsdom, old browsers) everything renders in its final, visible state.
 */
export function useMotionOk(): boolean {
  const reduced = useReducedMotion()
  return !reduced && typeof IntersectionObserver !== 'undefined'
}

export const SIMULADOR_HREF = '#/simulador'
export const CTA_LABEL = 'Descobrir minha margem →'

export function scrollToSection(id: string, smooth: boolean) {
  const el = document.getElementById(id)
  el?.scrollIntoView?.({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
}

const ctaClass =
  'inline-flex min-h-[44px] items-center justify-center rounded-full bg-acc px-5 text-sm font-extrabold text-accink transition-[background-color,transform] duration-200 hover:bg-mint motion-safe:hover:-translate-y-0.5'

/**
 * Primary button of the page; `glow` adds a slow pulse (3 times, then still: WCAG 2.2.2) on the final screen.
 * It always opens a dialog (never navigates by itself): "fill Lavoura e custos first" while the farm or costs are
 * missing (see `journeyOf`), "Bem-vindo de volta" once they are filled. The dialogs only read the store.
 */
export function CtaLink({ glow = false, className = '' }: { glow?: boolean; className?: string }) {
  const ok = useMotionOk()
  const firstGlow = useFirstTime(glow ? 'cta-glow' : undefined)
  const journey = useJourneyState()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const cls = `${ctaClass} ${className}`
  const pulse = {
    animate: {
      boxShadow: [
        '0 0 0 0 rgba(232,176,74,0)',
        '0 0 28px 4px rgba(232,176,74,0.45)',
        '0 0 0 0 rgba(232,176,74,0)',
      ],
    },
    transition: { duration: 3.2, repeat: 2, ease: 'easeInOut' as const },
  }
  const glowing = glow && ok && firstGlow

  const props = {
    type: 'button' as const,
    ref,
    className: cls,
    'aria-haspopup': 'dialog' as const,
    onClick: () => setOpen(true),
  }
  return (
    <>
      {glowing ? (
        <motion.button {...props} {...pulse}>
          {CTA_LABEL}
        </motion.button>
      ) : (
        <button {...props}>{CTA_LABEL}</button>
      )}
      {open && <JourneyDialog journey={journey} onClose={() => setOpen(false)} returnFocus={() => ref.current} />}
    </>
  )
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">
      <i aria-hidden="true" className="inline-block h-px w-8 bg-gold" />
      {children}
    </p>
  )
}

/** A photo `<img>`: real size attributes, lazy unless `priority`. */
export function PhotoImg({
  photo,
  priority = false,
  className = '',
}: {
  photo: PhotoDef
  priority?: boolean
  className?: string
}) {
  return (
    <img
      src={photo.src}
      width={photo.width}
      height={photo.height}
      alt={photo.alt}
      decoding="async"
      {...(priority ? { fetchPriority: 'high' as const } : { loading: 'lazy' as const })}
      className={`h-full w-full object-cover ${className}`}
    />
  )
}

export function PhotoCaption({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute bottom-3 left-3 z-20 rounded-full px-2.5 py-1 text-[11px] text-tx ${className}`}
      style={{ background: VEIL_CAPTION }}
    >
      {text}
    </span>
  )
}

/** Veil over a full-bleed photo: uniform on mobile, left-to-right gradient from md. */
export function Veil({ uniformAlways = false }: { uniformAlways?: boolean }) {
  return (
    <>
      <div
        aria-hidden="true"
        className={`absolute inset-0 z-[1] ${uniformAlways ? '' : 'md:hidden'}`}
        style={{ background: VEIL_UNIFORM }}
      />
      {!uniformAlways && (
        <div aria-hidden="true" className="absolute inset-0 z-[1] hidden md:block" style={{ background: VEIL_SIDE }} />
      )}
    </>
  )
}

/** Full-height screen of the Início with scroll-snap alignment. */
export function Screen({
  id,
  labelledBy,
  children,
  className = '',
}: {
  id: string
  labelledBy: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`flex min-h-[100svh] snap-start flex-col justify-center py-5 md:py-8 ${className}`}
    >
      {children}
    </section>
  )
}

export const panelClass = 'relative overflow-hidden rounded-2xl border border-line bg-bg'
