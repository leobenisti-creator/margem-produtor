/**
 * One-shot focus request across a hash navigation: the matrix legend asks for the margin-target
 * control, the Simulador consumes it once it is mounted and opens the meta dialog on it.
 * Module state, never persisted; consuming clears it so a later visit does not steal focus.
 */
export type FocusTarget = 'meta'

let pending: FocusTarget | null = null

export function requestFocus(target: FocusTarget) {
  pending = target
}

/** Read without consuming (tests, diagnostics). */
export function peekFocusRequest(): FocusTarget | null {
  return pending
}

export function consumeFocusRequest(): FocusTarget | null {
  const t = pending
  pending = null
  return t
}

/** Focuses the control for `target` inside `root` (or the hero tile when it is missing). Returns what got focus. */
export function focusTarget(target: FocusTarget, root: ParentNode = document): HTMLElement | null {
  const el =
    target === 'meta'
      ? root.querySelector<HTMLElement>('#meta-de-margem [role="switch"]')
      : null
  const fallback = document.querySelector<HTMLElement>('[data-testid="kpi-margem"]')
  const pick = el ?? fallback
  if (!pick) return null
  if (typeof pick.scrollIntoView === 'function') pick.scrollIntoView({ block: 'center' })
  pick.focus()
  return pick
}
