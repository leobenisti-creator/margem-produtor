import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react'
import { animate, motion, useMotionValue, useTransform, type Variants } from 'motion/react'
import { useMotionOk } from './shared'
import { markPlayed, motionMode, useFirstTime } from './session'

export { useFirstTime, markPlayed, markLandingSeen, resetMotionSession } from './session'

/**
 * The motion language of the Início, in one place so every screen moves the same way.
 *
 * THE RULE (see `session.ts`): by default every entrance (Reveal, Stagger, GrowBar, CountUp, DrawRule) plays EVERY time its
 * block comes into view, scrolling down or back up. The opt-in 'once' mode (`localStorage['margem:motion'] = 'once'`) plays each
 * one a single time per visit instead. Give a component a stable `id` to key it in the
 * session registry; without one it plays only on the very first visit of the landing. Hover lift is the only motion
 * that reacts to the pointer instead of playing by itself. There is no scroll-linked or looping motion.
 *
 * Everything renders in its final, visible state when motion is not allowed (reduced motion, no IntersectionObserver)
 * or when it already played, so nothing is ever hidden because an animation did not run.
 */

/** Soft deceleration: fast start, gentle landing. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const
export const DUR = { fast: 0.25, base: 0.6, slow: 0.9 } as const
/** The viewport rule: a bit before the element is fully in view; it replays on every entry unless the 'once' mode is on. */
const viewport = () => ({ once: motionMode() === 'once', amount: 0.2 }) as const

const motionCache = new Map<ElementType, typeof motion.div>()

/**
 * One motion component per tag, created once. `motion.create` inside a render would hand React a NEW component type on every
 * render, so the whole subtree would unmount and mount again each time something above re-renders (the animation would
 * restart from its hidden state and the once-per-visit rule would break).
 */
function motionTag(tag: ElementType) {
  let c = motionCache.get(tag)
  if (!c) {
    c = motion.create(tag as 'div')
    motionCache.set(tag, c)
  }
  return c
}

/** True when this component should animate its entrance now: motion allowed and not played before. */
export function usePlayOnce(id?: string): boolean {
  // Recorded by the component when the animation really starts (enters the view), not at mount.
  return useFirstTime(id, false)
}

/** Fade + rise when the block enters the view. `as` picks the tag (default div). */
export function Reveal({
  children,
  delay = 0,
  y = 24,
  as = 'div',
  className = '',
  id,
}: {
  children: ReactNode
  delay?: number
  y?: number
  as?: ElementType
  className?: string
  /** Stable key in the visit registry (plays once per visit). */
  id?: string
}) {
  const play = usePlayOnce(id)
  const Tag = as
  if (!play) return <Tag className={className}>{children}</Tag>
  const M = motionTag(Tag)
  return (
    <M
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={viewport()}
      onViewportEnter={() => markPlayed(id)}
      transition={{ duration: DUR.base, ease: EASE_OUT, delay }}
    >
      {children}
    </M>
  )
}

const staggerParent = (gap: number, delay: number): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
})
const staggerChild = (y: number): Variants => ({
  hidden: { opacity: 0, y },
  show: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE_OUT } },
})

/**
 * A group whose `StaggerItem` children come in one after the other when the group enters the view. The group decides
 * (once per session); a `StaggerItem` of a group that does not animate is static by itself.
 */
export function Stagger({
  children,
  gap = 0.09,
  delay = 0,
  as = 'div',
  className = '',
  role,
  ariaLabel,
  id,
}: {
  children: ReactNode
  gap?: number
  delay?: number
  as?: ElementType
  className?: string
  role?: string
  ariaLabel?: string
  id?: string
}) {
  const play = usePlayOnce(id)
  const Tag = as
  const a11y = { ...(role ? { role } : {}), ...(ariaLabel ? { 'aria-label': ariaLabel } : {}) }
  if (!play) {
    return (
      <Tag className={className} {...a11y}>
        {children}
      </Tag>
    )
  }
  const M = motionTag(Tag)
  return (
    <M
      className={className}
      variants={staggerParent(gap, delay)}
      initial="hidden"
      whileInView="show"
      viewport={viewport()}
      onViewportEnter={() => markPlayed(id)}
      {...a11y}
    >
      {children}
    </M>
  )
}

/** One item of a `Stagger` (same tag rules). Without a parent that animates it renders plain, visible. */
export function StaggerItem({
  children,
  y = 22,
  as = 'div',
  className = '',
  role,
}: {
  children: ReactNode
  y?: number
  as?: ElementType
  className?: string
  role?: string
}) {
  const ok = useMotionOk()
  const Tag = as
  if (!ok) {
    return (
      <Tag className={className} {...(role ? { role } : {})}>
        {children}
      </Tag>
    )
  }
  const M = motionTag(Tag)
  // Variants only act under an animating `Stagger`; elsewhere this is a plain element.
  return (
    <M className={className} variants={staggerChild(y)} {...(role ? { role } : {})}>
      {children}
    </M>
  )
}

/**
 * Kept so the screens still compile: photos no longer move with the scroll. A plain full-size wrapper
 * (`range` is ignored).
 */
export function Parallax({
  children,
  className = '',
}: {
  children: ReactNode
  /** Ignored: there is no scroll-linked motion any more. */
  range?: number
  className?: string
}) {
  return <div className={`h-full w-full ${className}`}>{children}</div>
}

/**
 * Tab panels: the new panel appears instantly, every time (no cross-fade, so switching back and forth never
 * replays anything). `id` only tells the panels apart.
 */
export function FadeSwap({ id, children, className = '' }: { id: string; children: ReactNode; className?: string }) {
  return (
    <div data-panel={id} className={className}>
      {children}
    </div>
  )
}

/** A card that lifts a few pixels on hover (reacts to the pointer; decorative, nothing depends on it). */
export function Lift({
  children,
  as = 'div',
  className = '',
}: {
  children: ReactNode
  as?: ElementType
  className?: string
}) {
  const ok = useMotionOk()
  const Tag = as
  if (!ok) return <Tag className={className}>{children}</Tag>
  const M = motionTag(Tag)
  return (
    <M className={className} whileHover={{ y: -4 }} transition={{ duration: DUR.fast, ease: EASE_OUT }}>
      {children}
    </M>
  )
}

/** A bar that grows from the left when it enters the view (once); `ratio` in 0..1. Final width otherwise. */
export function GrowBar({
  ratio,
  className = '',
  delay = 0,
  id,
}: {
  ratio: number
  className?: string
  delay?: number
  id?: string
}) {
  const play = usePlayOnce(id)
  const w = `${Math.min(Math.max(ratio, 0), 1) * 100}%`
  if (!play) return <span className={`block h-full ${className}`} style={{ width: w }} />
  return (
    <motion.span
      className={`block h-full origin-left ${className}`}
      style={{ width: w }}
      initial={{ scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={viewport()}
      onViewportEnter={() => markPlayed(id)}
      transition={{ duration: DUR.slow, ease: EASE_OUT, delay }}
    />
  )
}

function CountUpOn({
  id,
  value,
  format,
  className,
  from,
}: {
  id?: string
  value: number
  format: (n: number) => string
  className: string
  from: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  // Counts the entries into the view: each one runs the number again (once mode: only the first).
  const [entries, setEntries] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const once = motionMode() === 'once'
    const io = new IntersectionObserver(
      (list) => {
        if (list.some((e) => e.isIntersecting)) {
          setEntries((n) => n + 1)
          markPlayed(id)
          if (once) io.disconnect()
        }
      },
      { threshold: 0.6 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [id])
  const mv = useMotionValue(value)
  const text = useTransform(mv, (n) => format(n))
  const ran = useRef(0)
  useEffect(() => {
    // Each entry the number settles onto its value; a later change of the value alone just snaps.
    if (entries === 0 || ran.current === entries) {
      mv.set(value)
      return
    }
    ran.current = entries
    mv.set(from)
    const c = animate(mv, value, { duration: DUR.slow, ease: EASE_OUT })
    return () => c.stop()
  }, [entries, value, from, mv])
  return (
    <motion.span ref={ref} className={className}>
      {text}
    </motion.span>
  )
}

/**
 * A number that settles onto its value each time it comes into view (from `from`, default a tenth below the
 * value). Once per session per `id`. The text is the formatted final value when motion is off or it already played.
 */
export function CountUp({
  value,
  format,
  className = '',
  from,
  id,
}: {
  value: number
  format: (n: number) => string
  className?: string
  from?: number
  id?: string
}) {
  const play = usePlayOnce(id)
  if (!play || !Number.isFinite(value)) return <span className={className}>{format(value)}</span>
  return <CountUpOn id={id} value={value} format={format} className={className} from={from ?? value * 0.9} />
}

/** A thin rule that draws itself from the left when it enters the view (once). Plain full line otherwise. */
export function DrawRule({ className = '', delay = 0, id }: { className?: string; delay?: number; id?: string }) {
  const play = usePlayOnce(id)
  if (!play) return <div aria-hidden="true" className={`h-px w-full bg-line ${className}`} />
  return (
    <motion.div
      aria-hidden="true"
      className={`h-px w-full origin-left bg-line ${className}`}
      initial={{ scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={viewport()}
      onViewportEnter={() => markPlayed(id)}
      transition={{ duration: DUR.slow, ease: EASE_OUT, delay }}
    />
  )
}
