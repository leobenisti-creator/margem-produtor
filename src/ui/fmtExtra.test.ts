import { fmtCompactMoney, fmtLoose, fmtMarginPct, fmtSignedMoney } from './fmtExtra'

describe('fmtMarginPct (R25: one decimal below 100%, none from 100%)', () => {
  it('keeps the decimal that a target comparison needs', () => {
    expect(fmtMarginPct(0.1552)).toBe('15,5%')
    expect(fmtMarginPct(0.4)).toBe('40,0%')
    expect(fmtMarginPct(0.05)).toBe('5,0%')
    expect(fmtMarginPct(-0.037)).toBe('-3,7%')
  })
  it('drops decimals at 100% and above, and prints a dash for null/NaN', () => {
    expect(fmtMarginPct(1)).toBe('100%')
    expect(fmtMarginPct(1.234)).toBe('123%')
    expect(fmtMarginPct(null)).toBe('—')
    expect(fmtMarginPct(NaN)).toBe('—')
  })
})

describe('fmtSignedMoney (sign before the symbol, pt-BR)', () => {
  it('prints −R$ 227 for a negative value and R$ 1.173 for a positive one', () => {
    expect(fmtSignedMoney(-227.14, 'BRL', 0)).toBe('−R$ 227')
    expect(fmtSignedMoney(1173.4, 'BRL', 0)).toBe('R$ 1.173')
    expect(fmtSignedMoney(-3.5, 'USD', 2)).toBe('−US$ 3,50')
    expect(fmtSignedMoney(null, 'BRL', 0)).toBe('—')
  })
})

describe('helpers', () => {
  it('fmtLoose and fmtCompactMoney', () => {
    expect(fmtLoose(1000)).toBe('1.000')
    expect(fmtLoose(60.4)).toBe('60,40')
    expect(fmtCompactMoney(1_170_000, 'BRL')).toBe('R$ 1,17 mi')
  })
})
