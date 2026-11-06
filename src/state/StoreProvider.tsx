import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react'
import type { Scenario } from '../engine/calc'
import type { MarketDataProvider, MarketSnapshot } from '../data/types'
import { staticProvider } from '../data/staticProvider'
import { EmptyState } from '../ui/EmptyState'
import { LoadingSkeleton } from '../ui/LoadingSkeleton'
import { initialState, reducer } from './reducer'
import { loadState, mergeState, saveState } from './persist'
import { scenarioBasisUsc } from './basis'
import type { Action, AppState } from './types'

export const SAVE_DEBOUNCE_MS = 300

interface Store {
  state: AppState
  dispatch: Dispatch<Action>
  snapshot: MarketSnapshot
  scenario: Scenario
}

const StoreContext = createContext<Store | null>(null)

export function useStore(): Store {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore deve ser usado dentro de <StoreProvider>.')
  return ctx
}

function Inner({ snapshot, children }: { snapshot: MarketSnapshot; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, snapshot, (s) =>
    mergeState(initialState(s), loadState()),
  )

  const latest = useRef(state)
  latest.current = state

  useEffect(() => {
    const t = setTimeout(() => saveState(state), SAVE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [state])

  // Closing the tab or switching away within the debounce window must not lose the last edit.
  useEffect(() => {
    const flush = () => saveState(latest.current)
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [])

  const value = useMemo<Store>(() => {
    const { crop, overrides } = state
    const scenario: Scenario = {
      cbotUsc: overrides.cbotUsc ?? snapshot.cbotUsc[crop].value,
      // Resultados simulation ?? own-price override ?? typed base ("Outro") ?? FOB point base; snapshot.basisUsc is not used.
      basisUsc: overrides.simBasisUsc ?? scenarioBasisUsc(state),
      fx: overrides.fx ?? snapshot.fx.value,
    }
    return { state, dispatch, snapshot, scenario }
  }, [state, snapshot])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function StoreProvider({
  children,
  provider = staticProvider,
}: {
  children: ReactNode
  provider?: MarketDataProvider
}) {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    provider
      .getSnapshot()
      .then((s) => {
        if (!cancelled) {
          setFailed(false)
          setSnapshot(s)
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [provider, attempt])

  if (failed) {
    return (
      <div role="alert">
        <EmptyState
          title="Não foi possível carregar as cotações"
          hint="Verifique sua conexão e tente de novo. Seus dados digitados continuam salvos neste navegador."
          action={{
            label: 'Tentar de novo',
            onClick: () => {
              setFailed(false)
              setAttempt((n) => n + 1)
            },
          }}
        />
      </div>
    )
  }
  if (!snapshot) return <LoadingSkeleton />
  return <Inner snapshot={snapshot}>{children}</Inner>
}
