/** Pure geometry for the tour balloons (plain DOM rects, no library). All numbers are CSS px in viewport coordinates. */

export interface Box {
  top: number
  left: number
  width: number
  height: number
}

export interface Placement {
  /** `below`/`above` the target with an arrow; `over` when neither side fits (no arrow, pinned to the bottom). */
  side: 'below' | 'above' | 'over'
  top: number
  left: number
  /** Arrow centre, measured from the balloon's left edge (kept inside the rounded corners). */
  arrowLeft: number
}

export interface PlaceInput {
  target: Box
  balloon: { w: number; h: number }
  viewport: { w: number; h: number }
  /** Space between the target and the balloon (room for the arrow). */
  gap?: number
  /** Minimum distance from the viewport edges. */
  margin?: number
  /** Space taken at the bottom by fixed chrome (the bottom navigation on phones). */
  bottomInset?: number
  /** Half-width of the arrow, so it never leaves the balloon's rounded corner. */
  arrowHalf?: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))

/** Balloon width: 320 px, shrunk so it always fits a 375 px phone with a margin on each side. */
export function balloonWidth(viewportW: number, margin = 12, max = 320): number {
  return Math.max(0, Math.min(max, viewportW - margin * 2))
}

/**
 * Where to put a balloon next to a target: below if it fits, else above, else whichever side has more room
 * (clamped inside the viewport). Horizontally it is centred on the target and clamped to the viewport.
 */
export function placeBalloon({
  target,
  balloon,
  viewport,
  gap = 12,
  margin = 12,
  bottomInset = 0,
  arrowHalf = 10,
}: PlaceInput): Placement {
  const floor = viewport.h - bottomInset
  const spaceBelow = floor - (target.top + target.height) - gap - margin
  const spaceAbove = target.top - gap - margin
  const left = clamp(target.left + target.width / 2 - balloon.w / 2, margin, viewport.w - balloon.w - margin)
  const centre = target.left + target.width / 2 - left
  const arrowLeft = clamp(centre, arrowHalf + 8, balloon.w - arrowHalf - 8)

  if (spaceBelow >= balloon.h) {
    return { side: 'below', top: target.top + target.height + gap, left, arrowLeft }
  }
  if (spaceAbove >= balloon.h) {
    return { side: 'above', top: target.top - gap - balloon.h, left, arrowLeft }
  }
  // Neither side fits (a very tall target or a very short viewport): pin to the bottom, no arrow.
  return { side: 'over', top: clamp(floor - balloon.h - margin, margin, floor), left, arrowLeft }
}

export function sameBox(a: Box | null, b: Box | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
}

/** Rounds a DOMRect-like to whole pixels so sub-pixel jitter does not retrigger renders. */
export function toBox(r: { top: number; left: number; width: number; height: number }): Box {
  return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) }
}
