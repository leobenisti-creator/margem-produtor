import { GATES_KEY, gatesEnabled, lockReason, pageLocked, resultsLocked } from './gates'

beforeEach(() => localStorage.clear())

describe('gates', () => {
  it('are off by default in development (the tests run in dev mode) and the key overrides it', () => {
    expect(gatesEnabled()).toBe(false)
    localStorage.setItem(GATES_KEY, 'on')
    expect(gatesEnabled()).toBe(true)
    localStorage.setItem(GATES_KEY, 'off')
    expect(gatesEnabled()).toBe(false)
  })

  it('Resultados is locked only while the gates are on and the farm or the costs are missing', () => {
    const filled = { hasFarm: true, hasCosts: true }
    const noCosts = { hasFarm: true, hasCosts: false }
    expect(resultsLocked(noCosts)).toBe(false) // gates off: never blocked
    localStorage.setItem(GATES_KEY, 'on')
    expect(resultsLocked(noCosts)).toBe(true)
    expect(resultsLocked({ hasFarm: false, hasCosts: true })).toBe(true)
    expect(resultsLocked(filled)).toBe(false)
  })

  it('Comercialização and Resultados are locked together; Início and Lavoura e custos never', () => {
    const noCosts = { hasFarm: true, hasCosts: false }
    const filled = { hasFarm: true, hasCosts: true }
    for (const r of ['comercializacao', 'resultados']) expect(pageLocked(r, noCosts)).toBe(false) // gates off
    localStorage.setItem(GATES_KEY, 'on')
    for (const r of ['comercializacao', 'resultados']) {
      expect(pageLocked(r, noCosts)).toBe(true)
      expect(pageLocked(r, { hasFarm: false, hasCosts: false })).toBe(true)
      expect(pageLocked(r, filled)).toBe(false)
    }
    for (const r of ['inicio', 'simulador', 'preco']) expect(pageLocked(r, { hasFarm: false, hasCosts: false })).toBe(false)
  })

  it('says what is missing', () => {
    expect(lockReason({ missing: ['área', 'custo por hectare'] })).toBe('Falta: área, custo por hectare')
    expect(lockReason({ missing: [] })).toBe('Preencha Lavoura e custos primeiro')
  })
})
