import { act, render, screen, waitFor } from '@testing-library/react'
import { prefersReducedMotion } from 'motion-dom'
import { CountUp, Reveal } from './motion'

function mockReducedMotion(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

describe('motion helpers', () => {
  afterEach(() => {
    // @ts-expect-error restore the jsdom default (no matchMedia)
    delete window.matchMedia
  })

  it('reduced motion: CountUp shows the final formatted value at once', () => {
    mockReducedMotion(true)
    render(<CountUp value={19.42} format={(v) => v.toFixed(2).replace('.', ',')} />)
    expect(screen.getByText('19,42')).toBeInTheDocument()
  })

  it('reduced motion: Reveal renders children without opacity/transform styles', () => {
    mockReducedMotion(true)
    render(
      <Reveal className="x">
        <p>conteúdo</p>
      </Reveal>,
    )
    const wrapper = screen.getByText('conteúdo').parentElement as HTMLElement
    expect(wrapper.getAttribute('style') ?? '').not.toMatch(/opacity|transform/)
  })

  it('animated: both still render their content (never invisible forever)', async () => {
    mockReducedMotion(false)
    render(
      <>
        <Reveal delay={0.1}>
          <p>conteúdo</p>
        </Reveal>
        <CountUp value={7} />
      </>,
    )
    expect(screen.getByText('conteúdo')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('7')).toBeInTheDocument())
  })

  describe('CountUp without flicker (mocked IntersectionObserver)', () => {
    let cbs: IntersectionObserverCallback[] = []
    let rectTop = 0
    beforeEach(() => {
      // motion caches the reduced-motion preference once per module; reset it for these cases.
      prefersReducedMotion.current = false
      cbs = []
      class IO {
        constructor(cb: IntersectionObserverCallback) {
          cbs.push(cb)
        }
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return []
        }
      }
      vi.stubGlobal('IntersectionObserver', IO)
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
        () => ({ top: rectTop, bottom: rectTop + 20, left: 0, right: 10, width: 10, height: 20, x: 0, y: rectTop, toJSON: () => ({}) }) as DOMRect,
      )
    })
    afterEach(() => {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    })

    // Painted states = what the DOM holds when a task ends (the layout-effect re-render is flushed before paint).
    const watch = (el: HTMLElement) => {
      const seen: number[] = []
      const mo = new MutationObserver(() => seen.push(Number(el.textContent)))
      mo.observe(el, { childList: true, characterData: true, subtree: true })
      return { seen, stop: () => mo.disconnect() }
    }

    it('in view at mount: the first painted value is 0, then counts up to the final value', async () => {
      mockReducedMotion(false)
      rectTop = 0
      const { container } = render(<CountUp value={50} format={(v) => String(Math.round(v))} />)
      expect(container.textContent).toBe('0')
      const w = watch(container)
      await waitFor(() => expect(container.textContent).toBe('50'))
      w.stop()
      const all = [0, ...w.seen]
      for (let i = 1; i < all.length; i++) expect(all[i]).toBeGreaterThanOrEqual(all[i - 1])
    })

    it('out of view: keeps the final value, then goes straight to 0 when it enters the view', async () => {
      mockReducedMotion(false)
      rectTop = 5000
      const { container } = render(<CountUp value={50} format={(v) => String(Math.round(v))} />)
      expect(container.textContent).toBe('50')
      act(() => {
        for (const cb of cbs) cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
      })
      expect(container.textContent).toBe('0')
      const w = watch(container)
      await waitFor(() => expect(container.textContent).toBe('50'))
      w.stop()
      const all = [0, ...w.seen]
      for (let i = 1; i < all.length; i++) expect(all[i]).toBeGreaterThanOrEqual(all[i - 1])
    })
  })
})
