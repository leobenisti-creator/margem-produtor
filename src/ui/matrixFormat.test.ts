import { fmtAxisPct, lockedCostShare, toneSituation } from './matrixFormat'

describe('matrixFormat helpers', () => {
  it('fmtAxisPct prints sign, comma and a true minus', () => {
    expect(fmtAxisPct(2.5)).toBe('+2,5%')
    expect(fmtAxisPct(-20)).toBe('−20%')
    expect(fmtAxisPct(0)).toBe('0%')
    expect(fmtAxisPct(12.345)).toBe('+12,35%')
  })

  it('toneSituation follows the colour rule with and without a target', () => {
    expect(toneSituation(0, null)).toBe('margem negativa')
    expect(toneSituation(1, null)).toBe('margem baixa')
    expect(toneSituation(2, null)).toBe('margem boa')
    expect(toneSituation(2, 0.2)).toBe('bate a meta')
    expect(toneSituation(1, 0.2)).toBe('até 5 p.p. abaixo da meta')
    expect(toneSituation(0, 0.2)).toBe('mais de 5 p.p. abaixo da meta')
  })

  it('lockedCostShare: bought US$ at its rate over today total cost', () => {
    // R$ 1000 fixed + US$ 100 of which half bought at 5 (250) and half at today 6 (300)
    const s = lockedCostShare({ costPerHaBrl: 1000, costUsd: [{ usdPerHa: 100, boughtPct: 0.5, boughtRate: 5 }] }, 6)
    expect(s).toBeCloseTo(250 / 1550, 10)
    expect(lockedCostShare({ costPerHaBrl: 1000, costUsd: [] }, 6)).toBe(0)
    expect(lockedCostShare({ costPerHaBrl: 0, costUsd: [] }, 6)).toBeNull()
    expect(lockedCostShare({ costPerHaBrl: 1000, costUsd: [] }, 0)).toBeNull()
  })
})
