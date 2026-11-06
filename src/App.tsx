import { useEffect, useState } from 'react'
import { MotionConfig } from 'motion/react'
import { StoreProvider } from './state/StoreProvider'
import { AppShell } from './ui/AppShell'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { parseRoute, routeHref, routePath, type Route } from './ui/routes'
import { Simulador } from './pages/Simulador'
import { Comercializacao } from './pages/Comercializacao'
import { Resultados } from './pages/Resultados'
import { Inicio } from './pages/Inicio'
import { PrecoOrigem } from './pages/PrecoOrigem'

function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))
  useEffect(() => {
    // Empty/unknown hash: write the canonical route so "Compartilhar" copies a URL with it.
    // replaceState keeps the history clean (no extra Back step) and fires no hashchange.
    // A canonical route keeps its query (`#/resultados?analise=1` is read by the page).
    const sync = () => {
      const r = parseRoute(window.location.hash)
      const canonical = routeHref(r)
      if (routePath(window.location.hash) !== canonical) {
        try {
          // Keep the query only for a route that really was asked for: the legacy `#/comercializacao?analise=1`
          // lands on `#/resultados?analise=1`; an unknown path (landing on Início) drops its query.
          const q = window.location.hash.indexOf('?')
          const known = r !== 'inicio' || routePath(window.location.hash) === routeHref('inicio')
          window.history.replaceState(null, '', q === -1 || !known ? canonical : canonical + window.location.hash.slice(q))
        } catch {
          // Sandboxed frames or odd browsers may refuse; the route still works without the URL.
        }
      }
      setRoute(r)
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  return route
}

export function App() {
  const route = useHashRoute()
  return (
    <MotionConfig reducedMotion="user">
      <StoreProvider>
        <AppShell route={route}>
          <ErrorBoundary key={route}>
            {route === 'inicio' && <Inicio />}
            {route === 'simulador' && <Simulador />}
            {route === 'comercializacao' && <Comercializacao />}
            {route === 'resultados' && <Resultados />}
            {route === 'preco' && <PrecoOrigem />}
          </ErrorBoundary>
        </AppShell>
      </StoreProvider>
    </MotionConfig>
  )
}
