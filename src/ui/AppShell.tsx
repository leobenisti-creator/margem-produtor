import type { ReactNode } from 'react'
import { BottomNav } from './BottomNav'
import { ExplainDrawer, ExplainProvider } from './ExplainDrawer'
import { Footer } from './Footer'
import { NavBar } from './NavBar'
import { Ticker } from './Ticker'
import { PageTitle } from './TopBar'
import { Tour } from './Tour'
import type { Route } from './routes'
import { useAppliedTheme } from './theme'

/**
 * Top NavBar (no left sidebar), then on the tabs the page h1 and the market
 * ticker (on #/preco only the h1); Início brings its own heading and market strip. BottomNav carries
 * the tabs below md.
 */
export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  // Início is always dark; the other pages show the producer's saved theme (src/ui/theme.ts).
  useAppliedTheme(route)
  return (
    <ExplainProvider>
      <div className="flex min-h-screen flex-col bg-bg pb-14 text-tx md:pb-0">
        <NavBar route={route} />
        {route !== 'inicio' && (
          <>
            <PageTitle route={route} />
            {/* #/preco is read-only (opened in a new tab): no ticker, so an old tab never edits the saved state. */}
            {route !== 'preco' && <Ticker />}
          </>
        )}
        <main tabIndex={-1} className="flex-1 px-4 py-4 outline-none md:px-[18px] [&>*]:mx-auto [&>*]:max-w-[1280px]">
          {children}
        </main>
        <Footer />
        <BottomNav route={route} />
        <ExplainDrawer />
        {route === 'simulador' && <Tour />}
      </div>
    </ExplainProvider>
  )
}
