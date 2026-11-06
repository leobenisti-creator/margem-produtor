import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useRef, type ReactNode } from 'react'
import { staticProvider } from '../data/staticProvider'
import type { MarketDataProvider } from '../data/types'
import { computeResult } from '../engine/calc'
import type { MarketHistory } from '../engine/history'
import { CROPS } from '../engine/crops'
import { StoreProvider, useStore } from '../state/StoreProvider'
import { scenarioBasisUsc } from '../state/basis'
import type { Action, AppState } from '../state/types'
import { MotionConfig } from 'motion/react'
import { Simulador } from '../pages/Simulador'
import { AppShell } from '../ui/AppShell'
import { LEGACY_EXAMPLE, seedState } from './helpers'

/**
 * The Simulação inside the app shell WITH the margin-target button (it is off the real page until it gets its
 * new place): lets the meta dialog keep its keyboard, focus and a11y coverage.
 */
export function SimulacaoComMeta() {
  return (
    <MotionConfig reducedMotion="user">
      <StoreProvider>
        <AppShell route="simulador">
          <Simulador showMeta />
        </AppShell>
      </StoreProvider>
    </MotionConfig>
  )
}

/**
 * Applies actions inside the running session. A sale or an operation that is not saved yet is never written to the
 * browser, so a test cannot seed it through the storage: it is added here, after the store is up.
 */
function LiveActions({ actions }: { actions: Action[] }) {
  const { dispatch } = useStore()
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    actions.forEach(dispatch)
  }, [actions, dispatch])
  return null
}

const isUnsaved = (a: Action): boolean =>
  (a.type === 'addHedgeOp' || a.type === 'addSale') && (a.partial as { saved?: boolean } | undefined)?.saved === false

/** Prints the whole store state (read back with `readState`). */
export function StateProbe() {
  const { state } = useStore()
  return <output data-testid="state-probe">{JSON.stringify(state)}</output>
}

export function readState(): AppState {
  return JSON.parse(screen.getByTestId('state-probe').textContent ?? '{}') as AppState
}

/**
 * Seeds the store with `actions` and renders `ui` inside it, plus a state probe. `opts.base` runs
 * first: by default the pre-FOB example farm (LEGACY_EXAMPLE); pass [] to start at the FOB default.
 */
export async function renderWithStore(
  ui: ReactNode,
  actions: Action[] = [],
  opts: { fx?: number; base?: Action[]; history?: MarketHistory; today?: string } = {},
) {
  // The ones marked `saved: false` are added live (after mount), the rest are seeded through the storage.
  seedState([...(opts.base ?? LEGACY_EXAMPLE), ...actions.filter((a) => !isUnsaved(a))])
  const live = actions.filter(isUnsaved)
  let provider: MarketDataProvider = staticProvider
  if (opts.fx !== undefined || opts.history !== undefined || opts.today !== undefined) {
    const s = await staticProvider.getSnapshot()
    if (opts.fx !== undefined) s.fx.value = opts.fx
    if (opts.history !== undefined) s.history = opts.history
    if (opts.today !== undefined) s.today = opts.today
    provider = { getSnapshot: () => Promise.resolve(s) }
  }
  const user = userEvent.setup()
  const view = render(
    <StoreProvider provider={provider}>
      {ui}
      <StateProbe />
      {live.length > 0 && <LiveActions actions={live} />}
    </StoreProvider>,
  )
  await screen.findByTestId('state-probe')
  // Wait until the live actions are in (the tests read the screen right after this returns).
  if (live.length > 0) {
    await waitFor(() => {
      const st = readState()
      const have = st.hedgeOps.filter((o) => o.saved === false).length + st.sales.filter((t) => t.saved === false).length
      expect(have).toBe(live.length)
    })
  }
  return { user, ...view }
}

/** Today's engine result for a stored state at the seed market (no overrides). */
export async function engineToday(state: AppState) {
  const snap = await staticProvider.getSnapshot()
  const scenario = {
    cbotUsc: state.overrides.cbotUsc ?? snap.cbotUsc[state.crop].value,
    basisUsc: scenarioBasisUsc(state),
    fx: state.overrides.fx ?? snap.fx.value,
  }
  return { scenario, snap, result: computeResult(CROPS[state.crop], scenario, state.inputs) }
}
