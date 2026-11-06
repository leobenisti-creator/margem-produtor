import { Lock } from 'lucide-react'
import { useId } from 'react'
import { ROUTES, tabFor, tabsFor, type Route } from './routes'
import { RouteIcon, StepBadge, STEPS } from './navIcons'
import { usePageLocks } from './usePageLocks'

/**
 * Phone tabs. While Comercialização and Resultados are locked their reason is written in a one-line caption above the tabs (the tab labels
 * are too small to carry it), and the tab points to that caption with `aria-describedby`.
 */
export function BottomNav({ route }: { route: Route }) {
  const { isLocked, reason } = usePageLocks()
  const reasonId = useId()
  const tabs = tabsFor(route)
  const lockedLabels = ROUTES.filter((r) => isLocked(r.id)).map((r) => r.label)
  const anyLocked = lockedLabels.length > 0
  return (
    <nav
      aria-label="Navegação inferior"
      className={`fixed inset-x-0 bottom-0 z-20 grid border-t border-line bg-g8 md:hidden ${tabs.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}
    >
      {anyLocked && (
        <p
          id={reasonId}
          className="col-span-full flex items-center justify-center gap-1.5 border-b border-line px-3 py-1 text-center text-[12px] leading-tight text-mut"
        >
          <Lock aria-hidden="true" size={12} strokeWidth={1.75} className="shrink-0" />
          <span>
            {lockedLabels.join(' e ')} · {reason}
          </span>
        </p>
      )}
      {tabs.map((r) => {
        const on = r.id === tabFor(route)
        const step = STEPS[r.id]
        const lock = isLocked(r.id)
        return (
          <a
            key={r.id}
            href={r.href}
            aria-current={on ? 'page' : undefined}
            aria-disabled={lock ? 'true' : undefined}
            aria-describedby={lock ? reasonId : undefined}
            onClick={lock ? (e) => e.preventDefault() : undefined}
            className={`relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 px-1 text-center text-[12px] leading-tight ${
              on ? 'font-semibold text-mint' : 'text-mut'
            } ${lock ? 'cursor-not-allowed' : ''}`}
          >
            {on && <i aria-hidden="true" className="absolute inset-x-6 top-0 block h-0.5 rounded-b bg-mint" />}
            <span className="relative inline-flex">
              <RouteIcon route={r.id} />
              {lock && (
                <Lock
                  aria-hidden="true"
                  size={11}
                  strokeWidth={2}
                  className="absolute -right-2 -top-1 rounded-full bg-g8 text-mut"
                />
              )}
            </span>
            <span className="inline-flex items-center gap-1">
              {step !== undefined && <StepBadge step={step} on={on} />}
              <span>{r.label}</span>
            </span>
          </a>
        )
      })}
    </nav>
  )
}
