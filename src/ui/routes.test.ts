import { parseRoute, routeHref, ROUTES, tabFor, VENDAS_HREF } from './routes'

describe('routes', () => {
  it('lists the four tabs in order with canonical hrefs', () => {
    expect(ROUTES.map((r) => [r.id, r.label, r.href])).toEqual([
      ['inicio', 'Início', '#/inicio'],
      ['simulador', 'Lavoura e custos', '#/simulador'],
      ['comercializacao', 'Comercialização', '#/comercializacao'],
      ['resultados', 'Resultados financeiros', '#/resultados'],
    ])
  })

  it('parses each canonical hash', () => {
    expect(parseRoute('#/inicio')).toBe('inicio')
    expect(parseRoute('#/simulador')).toBe('simulador')
    expect(parseRoute('#/comercializacao')).toBe('comercializacao')
    expect(parseRoute('#/resultados')).toBe('resultados')
  })

  it('the legacy Análise link (#/comercializacao?analise=1) is the Resultados', () => {
    expect(parseRoute('#/comercializacao?analise=1')).toBe('resultados')
    expect(parseRoute('#/comercializacao')).toBe('comercializacao')
  })

  it('#/preco highlights the Lavoura e custos tab; VENDAS_HREF is the Comercialização', () => {
    expect(tabFor('preco')).toBe('simulador')
    expect(tabFor('resultados')).toBe('resultados')
    expect(VENDAS_HREF).toBe('#/comercializacao')
  })

  it('#/preco is a route but not a tab', () => {
    expect(parseRoute('#/preco')).toBe('preco')
    expect(ROUTES.map((r) => r.id)).not.toContain('preco')
    expect(routeHref('preco')).toBe('#/preco')
    expect(routeHref('simulador')).toBe('#/simulador')
  })

  it('ignores everything after a "?" in the hash', () => {
    expect(parseRoute('#/resultados?analise=1')).toBe('resultados')
    expect(parseRoute('#/comercializacao?vendas=1')).toBe('comercializacao')
    expect(parseRoute('#/preco?x=1')).toBe('preco')
    expect(parseRoute('#/simulador?')).toBe('simulador')
    expect(parseRoute('#/nada?analise=1')).toBe('inicio')
  })

  it('falls back to inicio for an empty or unknown hash', () => {
    expect(parseRoute('')).toBe('inicio')
    expect(parseRoute('#/qualquer')).toBe('inicio')
    expect(parseRoute('#')).toBe('inicio')
  })
})
