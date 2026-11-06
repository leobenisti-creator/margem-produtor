import { balloonWidth, placeBalloon, sameBox, toBox } from './position'

const viewport = { w: 1000, h: 800 }
const balloon = { w: 300, h: 180 }
const box = (top: number, left: number, width = 200, height = 50) => ({ top, left, width, height })

describe('placeBalloon', () => {
  it('goes below the target when it fits, centred on the target', () => {
    const p = placeBalloon({ target: box(100, 400), balloon, viewport })
    expect(p.side).toBe('below')
    expect(p.top).toBe(100 + 50 + 12)
    expect(p.left).toBe(400 + 100 - 150)
    expect(p.arrowLeft).toBe(150)
  })

  it('flips above when there is no room below', () => {
    const p = placeBalloon({ target: box(650, 400), balloon, viewport })
    expect(p.side).toBe('above')
    expect(p.top).toBe(650 - 12 - 180)
  })

  it('respects the bottom inset (phone bottom navigation): flips above sooner', () => {
    const target = box(500, 400)
    expect(placeBalloon({ target, balloon, viewport }).side).toBe('below')
    expect(placeBalloon({ target, balloon, viewport, bottomInset: 120 }).side).toBe('above')
  })

  it('clamps horizontally inside the viewport and keeps the arrow on the target', () => {
    const left = placeBalloon({ target: box(100, 0, 100), balloon, viewport })
    expect(left.left).toBe(12)
    expect(left.arrowLeft).toBe(38) // target centre (50) - left (12)
    const right = placeBalloon({ target: box(100, 900, 100), balloon, viewport })
    expect(right.left).toBe(1000 - 300 - 12)
    expect(right.arrowLeft).toBe(950 - right.left)
  })

  it('keeps the arrow inside the balloon corners', () => {
    const p = placeBalloon({ target: box(100, 990, 10), balloon, viewport })
    expect(p.arrowLeft).toBeLessThanOrEqual(300 - 18)
    const q = placeBalloon({ target: box(100, 0, 4), balloon, viewport })
    expect(q.arrowLeft).toBeGreaterThanOrEqual(18)
  })

  it('pins to the bottom without an arrow when neither side fits (very tall target)', () => {
    const p = placeBalloon({ target: box(20, 100, 800, 760), balloon, viewport })
    expect(p.side).toBe('over')
    expect(p.top).toBe(800 - 180 - 12)
  })

  it('never leaves the viewport on a 375 x 667 phone', () => {
    const vp = { w: 375, h: 667 }
    const w = balloonWidth(vp.w)
    expect(w).toBe(320)
    for (const left of [0, 100, 300]) {
      for (const top of [10, 300, 600]) {
        const p = placeBalloon({ target: box(top, left, 120, 44), balloon: { w, h: 200 }, viewport: vp, bottomInset: 56 })
        expect(p.left).toBeGreaterThanOrEqual(12)
        expect(p.left + w).toBeLessThanOrEqual(vp.w - 12)
        expect(p.top).toBeGreaterThanOrEqual(12)
      }
    }
  })
})

describe('balloonWidth', () => {
  it('is 320 px on wide screens and shrinks on narrow ones', () => {
    expect(balloonWidth(1440)).toBe(320)
    expect(balloonWidth(320)).toBe(296)
    expect(balloonWidth(10)).toBe(0)
  })
})

describe('box helpers', () => {
  it('compares boxes and rounds rects', () => {
    expect(sameBox(box(1, 2), box(1, 2))).toBe(true)
    expect(sameBox(box(1, 2), box(1, 3))).toBe(false)
    expect(sameBox(null, null)).toBe(true)
    expect(sameBox(box(1, 2), null)).toBe(false)
    expect(toBox({ top: 1.4, left: 2.6, width: 3.5, height: 4.2 })).toEqual({ top: 1, left: 3, width: 4, height: 4 })
  })
})
