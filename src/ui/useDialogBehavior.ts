import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

let scrollLocks = 0
let savedOverflow = ''
let savedHtmlOverflow = ''

/** Scroll lock (body and html, so touch scrolling stops too) shared by every open dialog; the last one to close restores the original values. */
function lockScroll(): () => void {
  if (scrollLocks++ === 0) {
    savedOverflow = document.body.style.overflow
    savedHtmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
  }
  let released = false
  return () => {
    if (released) return
    released = true
    if (--scrollLocks === 0) {
      document.body.style.overflow = savedOverflow
      document.documentElement.style.overflow = savedHtmlOverflow
    }
  }
}

/** Open dialogs, bottom to top. Only the top-most one handles Esc and Tab. */
const dialogStack: object[] = []

/** Where focus goes on close: the explicit target, else what was focused before, else the caller's fallback, else <main>. */
function restoreFocus(
  explicit: HTMLElement | null | undefined,
  previous: Element | null,
  fallback?: () => HTMLElement | null,
) {
  const candidates: Array<Element | null | undefined> = [explicit, previous, fallback?.()]
  for (const c of candidates) {
    if (c instanceof HTMLElement && c !== document.body && c.isConnected) {
      c.focus()
      return
    }
  }
  const main = document.querySelector<HTMLElement>('main')
  if (main) {
    if (!main.hasAttribute('tabindex')) main.tabIndex = -1
    main.focus()
  }
}

/**
 * Modal behaviour: moves focus in on mount, traps Tab, closes on Esc, locks body
 * scroll, and on unmount returns focus to `returnFocusTo`, else to the element
 * that was focused before opening, else to the <main> region. A module-level stack makes
 * only the top-most dialog react to Esc/Tab, so nested dialogs close one at a time.
 */
export function useDialogBehavior(
  ref: RefObject<HTMLElement | null>,
  onEscape: () => void,
  returnFocusTo?: HTMLElement | null,
  /** Used when both `returnFocusTo` and the previously focused element have left the document. */
  fallback?: () => HTMLElement | null,
) {
  const escape = useRef(onEscape)
  const target = useRef(returnFocusTo)
  const fb = useRef(fallback)
  useEffect(() => {
    escape.current = onEscape
    target.current = returnFocusTo
    fb.current = fallback
  })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const items = () => Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE))
    const previous = document.activeElement
    const unlock = lockScroll()
    const entry = {}
    dialogStack.push(entry)
    const first = el.querySelector<HTMLElement>('[data-autofocus]') ?? items()[0] ?? el
    first.focus()

    const onKey = (e: KeyboardEvent) => {
      // A dialog opened on top of this one owns the keyboard until it closes.
      if (dialogStack[dialogStack.length - 1] !== entry) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        escape.current()
        return
      }
      if (e.key !== 'Tab') return
      const list = items()
      if (list.length === 0) {
        e.preventDefault()
        return
      }
      const firstEl = list[0]
      const lastEl = list[list.length - 1]
      const active = document.activeElement
      if (!el.contains(active)) {
        e.preventDefault()
        firstEl.focus()
      } else if (e.shiftKey && active === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
      e.stopPropagation()
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      const at = dialogStack.indexOf(entry)
      if (at >= 0) dialogStack.splice(at, 1)
      unlock()
      restoreFocus(target.current, previous, fb.current)
    }
  }, [ref])
}
