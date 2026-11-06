import { act, render } from '@testing-library/react'
import { FIT_TOLERANCE, SNAP_THRESHOLD, snapTarget, useScreenSnap, type SnapSection } from './screenSnap'

const VH = 800
// Three screens that fit the window: [0,800) [800,1600) [1600,2400)
const S: SnapSection[] = [
  { top: 0, bottom: 800 },
  { top: 800, bottom: 1600 },
  { top: 1600, bottom: 2400 },
]

describe('snapTarget: the fifth of a screen', () => {
  it('the threshold is a fifth of the window', () => {
    expect(SNAP_THRESHOLD).toBe(0.2)
  })

  it('going down: with a fifth of the next screen showing it goes to the next screen', () => {
    // y = 160: 160 px (20%) of the next screen are visible
    expect(snapTarget(S, 160, VH, 'down')).toBe(800)
    expect(snapTarget(S, 300, VH, 'down')).toBe(800)
    expect(snapTarget(S, 960, VH, 'down')).toBe(1600)
  })

  it('going down: with less than a fifth it goes back to the screen it came from', () => {
    expect(snapTarget(S, 159, VH, 'down')).toBe(0)
    expect(snapTarget(S, 50, VH, 'down')).toBe(0)
    expect(snapTarget(S, 850, VH, 'down')).toBe(800)
  })

  it('going up: with a fifth of the previous screen showing it goes to the previous screen', () => {
    // y = 640: 160 px of the previous screen show at the top
    expect(snapTarget(S, 640, VH, 'up')).toBe(0)
    expect(snapTarget(S, 500, VH, 'up')).toBe(0)
    expect(snapTarget(S, 1440, VH, 'up')).toBe(800)
  })

  it('going up: with less than a fifth it goes back to the screen it came from', () => {
    expect(snapTarget(S, 641, VH, 'up')).toBe(800)
    expect(snapTarget(S, 750, VH, 'up')).toBe(800)
    expect(snapTarget(S, 1500, VH, 'up')).toBe(1600)
  })

  it('exactly on a screen: nothing to do', () => {
    expect(snapTarget(S, 0, VH, 'down')).toBeNull()
    expect(snapTarget(S, 800, VH, 'down')).toBeNull()
    expect(snapTarget(S, 800, VH, 'up')).toBeNull()
    expect(snapTarget(S, 1600, VH, 'up')).toBeNull()
  })

  it('the header above the first screen and the footer below the last are left alone', () => {
    const withHeader: SnapSection[] = [
      { top: 57, bottom: 857 },
      { top: 857, bottom: 1657 },
    ]
    expect(snapTarget(withHeader, 0, VH, 'down')).toBeNull()
    expect(snapTarget(withHeader, 1700, VH, 'down')).toBeNull()
    expect(snapTarget(withHeader, 1700, VH, 'up')).toBeNull()
    // scrolling down from the very top: after a fifth of the next screen shows, it goes on
    expect(snapTarget(withHeader, 57 + 160, VH, 'down')).toBe(857)
    expect(snapTarget(withHeader, 57 + 100, VH, 'down')).toBe(57)
  })

  it('a screen taller than the window is not touched while you read it, only at its edges', () => {
    const tall: SnapSection[] = [
      { top: 0, bottom: 800 },
      { top: 800, bottom: 2200 }, // 1400 px: taller than the window
      { top: 2200, bottom: 3000 },
    ]
    // in the middle of the tall screen: no line between screens in view
    expect(snapTarget(tall, 1200, VH, 'down')).toBeNull()
    expect(snapTarget(tall, 1200, VH, 'up')).toBeNull()
    // coming down into the tall one: a fifth of it shows -> its top
    expect(snapTarget(tall, 160, VH, 'down')).toBe(800)
    // near the bottom of the tall one, less than a fifth of the next one: stays (no jump back inside a long text)
    expect(snapTarget(tall, 1450, VH, 'down')).toBeNull()
    // a fifth of the next one shows: goes to it
    expect(snapTarget(tall, 1560, VH, 'down')).toBe(2200)
    // coming up from the one below into the tall one: a fifth of it shows -> its END (bottom at the window bottom)
    expect(snapTarget(tall, 2040, VH, 'up')).toBe(2200 - VH)
    // less than a fifth: back to the one below
    expect(snapTarget(tall, 2100, VH, 'up')).toBe(2200)
    // and when the one we came back from is the long one: back to ITS top, not left half-way
    expect(snapTarget(tall, 700, VH, 'up')).toBe(800)
  })

  it('a screen a bit taller than the window (padding, cards) still counts as one screen: no resting in its middle', () => {
    expect(FIT_TOLERANCE).toBe(1.2)
    const a: SnapSection[] = [
      { top: 0, bottom: 880 }, // 1.1 windows tall
      { top: 880, bottom: 1760 },
    ]
    // in the middle of the first one (no line in view yet) the page is left, but a little down it rests at its top again
    expect(snapTarget(a, 100, VH, 'down')).toBe(0)
    expect(snapTarget(a, 200, VH, 'down')).toBe(0)
    // with a fifth of the next screen showing it goes there
    expect(snapTarget(a, 240, VH, 'down')).toBe(880)
    expect(snapTarget(a, 760, VH, 'up')).toBe(880)
    expect(snapTarget(a, 600, VH, 'up')).toBe(0)
  })

  it('works with one screen or none', () => {
    expect(snapTarget([], 100, VH, 'down')).toBeNull()
    expect(snapTarget([S[0]], 100, VH, 'down')).toBeNull()
  })
})

// ───────────────────────────────────────── the hook ─────────────────────────────────────────

function Screens() {
  useScreenSnap(['a', 'b', 'c'])
  return (
    <>
      <div id="a" />
      <div id="b" />
      <div id="c" />
    </>
  )
}

describe('useScreenSnap', () => {
  let scrollY = 0
  let scrollTo: ReturnType<typeof vi.fn>
  const tops: Record<string, number> = { a: 0, b: 800, c: 1600 }

  const setup = (opts: { width?: number; reduced?: boolean; y?: number } = {}) => {
    scrollY = opts.y ?? 0
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollY })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: VH })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: opts.width ?? 1200 })
    window.matchMedia = ((q: string) => ({
      matches: !!opts.reduced && q.includes('prefers-reduced-motion'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
    scrollTo = vi.fn()
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo
    for (const id of ['a', 'b', 'c']) {
      // set after render, see below
      void id
    }
    const view = render(<Screens />)
    for (const id of ['a', 'b', 'c']) {
      const el = document.getElementById(id) as HTMLElement
      el.getBoundingClientRect = () =>
        ({ top: tops[id] - scrollY, bottom: tops[id] + 800 - scrollY, left: 0, right: 0, width: 0, height: 800 }) as DOMRect
    }
    return view
  }
  const scrollEnds = (y: number) => {
    scrollY = y
    act(() => {
      window.dispatchEvent(new Event('scroll'))
      vi.advanceTimersByTime(200)
    })
  }

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
  })

  it('down: a fifth of the next screen showing glides to the next screen (smooth)', () => {
    setup()
    scrollEnds(180)
    expect(scrollTo).toHaveBeenCalledWith({ top: 800, behavior: 'smooth' })
  })

  it('down: less than a fifth glides back to the screen', () => {
    setup()
    scrollEnds(100)
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })

  it('up: a fifth of the previous screen showing glides up to it', () => {
    setup({ y: 800 })
    scrollEnds(620)
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })

  it('up: less than a fifth glides back down to where it was', () => {
    setup({ y: 800 })
    scrollEnds(700)
    expect(scrollTo).toHaveBeenCalledWith({ top: 800, behavior: 'smooth' })
  })

  it('resting exactly on a screen does nothing, and it does not fight its own glide', () => {
    setup()
    scrollEnds(180) // asks for 800
    expect(scrollTo).toHaveBeenCalledTimes(1)
    scrollEnds(500) // the glide in progress
    scrollEnds(800) // arrived
    expect(scrollTo).toHaveBeenCalledTimes(1)
    scrollEnds(800)
    expect(scrollTo).toHaveBeenCalledTimes(1)
  })

  it('does nothing with reduced motion or on a narrow window', () => {
    const a = setup({ reduced: true })
    scrollEnds(180)
    expect(scrollTo).not.toHaveBeenCalled()
    a.unmount()
    setup({ width: 500 })
    scrollEnds(180)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('stops listening on unmount', () => {
    const v = setup()
    v.unmount()
    scrollEnds(180)
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
