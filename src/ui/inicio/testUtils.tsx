import { act, render, screen } from '@testing-library/react'
import seed from '../../data/seed-2026-10-26.json'
import type { MarketDataProvider, MarketSnapshot } from '../../data/types'
import { StoreProvider } from '../../state/StoreProvider'
import { Inicio } from '../../pages/Inicio'

export const seedSnapshot = () => structuredClone(seed.snapshot) as MarketSnapshot

/** IntersectionObserver double: records observed elements so a test can report entries. */
export class FakeIO {
  static instances: FakeIO[] = []
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds: number[] = []
  elements: Element[] = []
  constructor(public cb: IntersectionObserverCallback) {
    FakeIO.instances.push(this)
  }
  observe(el: Element) {
    this.elements.push(el)
  }
  unobserve(el: Element) {
    this.elements = this.elements.filter((e) => e !== el)
  }
  disconnect() {
    this.elements = []
  }
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

export function installFakeIO() {
  FakeIO.instances = []
  ;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIO
}

export function removeIO() {
  delete (globalThis as unknown as { IntersectionObserver?: unknown }).IntersectionObserver
}

/** Reports `el` entering (or leaving) the view to every observer watching it. */
export function fireIntersection(el: Element, isIntersecting = true) {
  for (const io of [...FakeIO.instances]) {
    if (!io.elements.includes(el)) continue
    const entry = {
      target: el,
      isIntersecting,
      intersectionRatio: isIntersecting ? 1 : 0,
    } as unknown as IntersectionObserverEntry
    act(() => io.cb([entry], io as unknown as IntersectionObserver))
  }
}

export function mockReducedMotion(reduce: boolean) {
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

export async function renderInicio(snapshot: MarketSnapshot = seedSnapshot()) {
  const provider: MarketDataProvider = { getSnapshot: () => Promise.resolve(snapshot) }
  const view = render(
    <StoreProvider provider={provider}>
      <Inicio />
    </StoreProvider>,
  )
  const page = await screen.findByTestId('page-inicio')
  return { ...view, page }
}
