import { Lock } from 'lucide-react'
import { useId } from 'react'
import { Logo } from './Logo'
import { StepBadge, STEPS } from './navIcons'
import { tabFor, tabsFor, type Route } from './routes'
import { CropCurrencyControls, ThemeToggle } from './TopBar'
import { usePageLocks } from './usePageLocks'

/**
 * Top bar: at the left the logo (it takes you to the Início) with the theme switch beside it; in the middle the pages of
 * the app (Início only while on the Início); at the right end of the screen the compact crop and currency selectors. Below md the pages
 * move to the BottomNav and the bar keeps the left and the right ends.
 */
export function NavBar({ route }: { route: Route }) {
  const { isLocked, reason } = usePageLocks()
  const reasonId = useId()
  return (
    <header className="border-b border-line bg-card">
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 px-4 py-2 md:grid-cols-[1fr_auto_1fr] md:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <a
            href="#/inicio"
            aria-label="Hedgepoint, ir ao Início"
            className="inline-flex min-h-[36px] shrink-0 items-center rounded-[8px] px-0.5"
          >
            <Logo />
          </a>
          <ThemeToggle disabled={route === 'inicio'} />
        </div>
        <nav aria-label="Navegação principal" className="hidden self-stretch md:flex">
          <ul className="flex items-stretch gap-1">
            {tabsFor(route).map((r) => {
              const on = r.id === tabFor(route)
              const step = STEPS[r.id]
              const lock = isLocked(r.id)
              return (
                <li key={r.id} className="flex flex-col">
                  <a
                    href={r.href}
                    aria-current={on ? 'page' : undefined}
                    aria-disabled={lock ? 'true' : undefined}
                    aria-describedby={lock ? `${reasonId}-${r.id}` : undefined}
                    onClick={lock ? (e) => e.preventDefault() : undefined}
                    className={`inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 text-[13px] ${
                      on ? 'border-gold font-semibold text-tx' : 'border-transparent text-mut hover:text-tx'
                    } ${lock ? 'cursor-not-allowed' : ''}`}
                  >
                    {step !== undefined && <StepBadge step={step} on={on} />}
                    {r.label}
                    {lock && <Lock aria-hidden="true" size={13} strokeWidth={1.75} className="shrink-0" />}
                  </a>
                  {lock && (
                    <span id={`${reasonId}-${r.id}`} className="max-w-[11rem] px-2.5 pb-1 text-[11px] leading-tight text-mut">
                      {reason}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="flex min-w-0 justify-end">
          <CropCurrencyControls />
        </div>
      </div>
    </header>
  )
}
