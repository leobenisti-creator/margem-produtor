import { hashQuery } from './hashQuery'

describe('hashQuery', () => {
  it('returns the query after "?" in the hash', () => {
    const q = hashQuery('#/x?analise=1&a=2')
    expect(q.get('analise')).toBe('1')
    expect(q.get('a')).toBe('2')
    expect(q.get('vendas')).toBeNull()
  })

  it('is empty without a query (or without a hash)', () => {
    expect([...hashQuery('#/comercializacao').keys()]).toEqual([])
    expect([...hashQuery('').keys()]).toEqual([])
    expect([...hashQuery('#/comercializacao?').keys()]).toEqual([])
  })

  it('reads window.location.hash by default', () => {
    window.history.replaceState(null, '', '#/comercializacao?vendas=1')
    try {
      expect(hashQuery().get('vendas')).toBe('1')
    } finally {
      window.history.replaceState(null, '', '#')
    }
  })
})
