import { gatesEnabled } from './gates'
import { routeHref, routePath } from '../ui/routes'

/**
 * Every direct URL leads to Início: when the app loads with any hash other than Início's, the location is replaced
 * once (replaceState, so Back does not loop). An empty hash is left alone (the router canonicalizes it to Início).
 * Only with the gates on, so the site owner can reload any page in `npm run dev`. Call once, before the first render;
 * a hash typed later, with the app open, is not a boot and is never redirected. Returns whether it redirected.
 */
export function redirectToInicioOnBoot(
  win: Pick<Window, 'location' | 'history'> = window,
  enabled: boolean = gatesEnabled(),
): boolean {
  if (!enabled) return false
  const hash = win.location.hash
  if (hash === '' || hash === '#' || routePath(hash) === routeHref('inicio')) return false
  try {
    win.history.replaceState(null, '', routeHref('inicio'))
    return true
  } catch {
    return false
  }
}
