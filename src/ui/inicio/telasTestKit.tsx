import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import type { MarketDataProvider, MarketSnapshot } from '../../data/types'
import { StoreProvider } from '../../state/StoreProvider'
import { seedSnapshot } from './testUtils'
import { buildLiveExample, type LiveExample } from './useLiveExample'

/** Renders one screen of the Início inside the real store (as the page does) and waits for the store to load. */
export async function renderScreen(
  ui: (ex: LiveExample) => ReactElement,
  snapshot: MarketSnapshot = seedSnapshot(),
  waitFor: RegExp = /./,
) {
  const provider: MarketDataProvider = { getSnapshot: () => Promise.resolve(snapshot) }
  const ex = buildLiveExample(snapshot)
  const view = render(<StoreProvider provider={provider}>{ui(ex)}</StoreProvider>)
  await screen.findByRole('heading', { level: 2, name: waitFor })
  return { ...view, ex }
}

export function unusableSnapshot(): MarketSnapshot {
  const s = seedSnapshot()
  s.fx.value = 0
  return s
}
