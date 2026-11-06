import { motion, useAnimationControls, useReducedMotion } from 'motion/react'
import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Quiet motion for the Resultados financeiros page: a detail that makes a change noticeable, never a show. It only runs when
 * something the producer changed moves the numbers (a basis, the axes, a step, the target, another cell), never when the
 * page opens, and not at all with prefers-reduced-motion. Everything is short (about a third of a second) and ends in the
 * exact final state, so nothing can stay half-faded.
 */

export const SOFT_EASE = [0.22, 1, 0.36, 1] as const
const SOFT = { duration: 0.34, ease: SOFT_EASE }

/**
 * A block that gives one short pulse (a small fade and lift) each time `signature` changes. The first render is not a
 * change. Use a string made of the things that change what the block shows.
 */
export function ChangePulse({
  signature,
  children,
  className = '',
  from = 0.55,
  y = 5,
  testId,
}: {
  signature: string
  children: ReactNode
  className?: string
  /** Opacity the pulse starts from. */
  from?: number
  /** Pixels the block rises from. */
  y?: number
  testId?: string
}) {
  const reduced = useReducedMotion()
  const controls = useAnimationControls()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (reduced) return
    void controls.start({ opacity: [from, 1], y: [y, 0], transition: SOFT })
  }, [signature, reduced, controls, from, y])
  return (
    <motion.div animate={controls} className={className} data-testid={testId}>
      {children}
    </motion.div>
  )
}

/**
 * Text that changes: the new value slides in softly from below. The first render and a reduced-motion preference show it
 * as is. Keyed by the text itself, so only a different value moves.
 */
export function ValueSwap({ text, className = '', testId }: { text: string; className?: string; testId?: string }) {
  const reduced = useReducedMotion()
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
  }, [])
  const animateIn = mounted.current && !reduced
  return (
    <motion.span
      key={text}
      data-testid={testId}
      className={`inline-block ${className}`}
      initial={animateIn ? { opacity: 0.35, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={SOFT}
    >
      {text}
    </motion.span>
  )
}

/** Layout transition of the ring that marks the chosen cell, so it glides from one cell to the next. */
export const RING_TRANSITION = { type: 'spring', stiffness: 520, damping: 38, mass: 0.7 } as const
