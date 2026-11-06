/**
 * `simulador` is the "Lavoura e custos" tab (its id and `#/simulador` stay, only the label changed);
 * `resultados` is the old Comercialização (matrix, DRE, scenario); `comercializacao` is the new sales/hedge/exposure tab.
 */
export type Route = 'inicio' | 'simulador' | 'comercializacao' | 'resultados' | 'preco'

/** Routes shown as tabs (NavBar, BottomNav). `#/preco` is a page opened from the Simulação, not a tab. */
export type TabRoute = Exclude<Route, 'preco'>

export const ROUTES: { id: TabRoute; label: string; href: string }[] = [
  { id: 'inicio', label: 'Início', href: '#/inicio' },
  { id: 'simulador', label: 'Lavoura e custos', href: '#/simulador' },
  { id: 'comercializacao', label: 'Comercialização', href: '#/comercializacao' },
  { id: 'resultados', label: 'Resultados financeiros', href: '#/resultados' },
]

/**
 * The tabs the bars show on a route: the three pages of the app, and Início only while the producer is on the Início
 * (once he goes into the app it is gone from the bars; the logo takes him back).
 */
export function tabsFor(route: Route): typeof ROUTES {
  return route === 'inicio' ? ROUTES : ROUTES.filter((r) => r.id !== 'inicio')
}

/** The tab highlighted for a route: `#/preco` belongs to the Simulação (it is opened from there). */
export function tabFor(route: Route): TabRoute {
  return route === 'preco' ? 'simulador' : route
}

/** "De onde vem o preço" (Feedback 1): opened in a new tab from the Simulação. */
export const PRECO_HREF = '#/preco'

const HREFS: Record<Route, string> = {
  inicio: '#/inicio',
  simulador: '#/simulador',
  comercializacao: '#/comercializacao',
  resultados: '#/resultados',
  preco: PRECO_HREF,
}

/** The sales card now lives in the Comercialização tab (the matrix's "Minhas vendas" points here). */
export const VENDAS_HREF = HREFS.comercializacao

/** Canonical hash of a route, without query. */
export function routeHref(route: Route): string {
  return HREFS[route]
}

/** The route part of a hash: everything before the first "?" (`#/resultados?analise=1` → `#/resultados`). */
export function routePath(hash: string): string {
  const q = hash.indexOf('?')
  return q === -1 ? hash : hash.slice(0, q)
}

/**
 * Empty or unknown hash opens the Início page; a query after "?" is not part of the route (pages read it
 * themselves). Exception kept from before the tabs were reorganised: `#/comercializacao?analise=1` (the "Análise" link)
 * is the target analysis, which lives in the Resultados now.
 */
export function parseRoute(hash: string): Route {
  const path = routePath(hash)
  const route = (Object.keys(HREFS) as Route[]).find((r) => HREFS[r] === path) ?? 'inicio'
  if (route === 'comercializacao' && /[?&]analise=1(&|$)/.test(hash)) return 'resultados'
  return route
}
