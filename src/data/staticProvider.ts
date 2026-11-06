import seed from './seed-2026-10-26.json'
import type { MarketDataProvider, MarketSnapshot } from './types'

const snapshot = seed.snapshot as MarketSnapshot

export const staticProvider: MarketDataProvider = {
  getSnapshot: () => Promise.resolve(structuredClone(snapshot)),
}
