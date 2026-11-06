import { animate, motion, useReducedMotion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export { useReducedMotion }

/** Environments without IntersectionObserver (old browsers, jsdom) skip the entrance animation. */
const canObserve = () => typeof IntersectionObserver !== 'undefined'

/** Fade + 8 px rise when the block first enters the viewport; renders plain under reduced motion. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  if (reduced || !canObserve()) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.35, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

/** Counts 0 -> value when it is (or enters) the view; shows the final formatted value at once under reduced motion. */
export function CountUp({
  value,
  format = (v: number) => String(v),
  duration = 0.8,
}: {
  value: number
  format?: (v: number) => string
  duration?: number
}) {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)
  // `null` = show the final value (not started / not animating); a number = current counting frame.
  const [shown, setShown] = useState<number | null>(null)
  const [running, setRunning] = useState(false)
  // Decided before paint: already in view -> start from 0 in the same frame; otherwise keep the final
  // value until the element enters the view, then jump straight to 0 (never final -> 0 -> counting).
  useLayoutEffect(() => {
    const el = ref.current
    if (reduced || !el || !canObserve()) return
    const start = () => {
      setShown(0)
      setRunning(true)
    }
    const r = el.getBoundingClientRect()
    if (r.top < window.innerHeight && r.bottom >= 0) {
      start()
      return
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        start()
        io.disconnect()
      }
    })
    io.observe(el)
    return () => io.disconnect()
  }, [reduced])
  useEffect(() => {
    if (reduced || !running) return
    const controls = animate(0, value, { duration, ease: 'easeOut', onUpdate: setShown })
    return () => controls.stop()
  }, [reduced, running, value, duration])
  const current = reduced || shown === null ? value : shown
  return (
    <span ref={ref} className="num">
      {format(current)}
    </span>
  )
}
