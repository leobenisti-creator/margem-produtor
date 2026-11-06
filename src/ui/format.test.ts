import { fmtBrl, fmtDateBr, fmtMoney, fmtNum, fmtPct, fmtUsd } from './format'

describe('format', () => {
  it('fmtBrl formats 1234.5 as "R$ 1.234,50" and null as "—"', () => {
    expect(fmtBrl(1234.5)).toBe('R$ 1.234,50')
    expect(fmtBrl(null)).toBe('—')
    expect(fmtBrl(NaN)).toBe('—')
  })
  it('fmtUsd formats with US$', () => {
    expect(fmtUsd(1234.5)).toBe('US$ 1.234,50')
    expect(fmtUsd(null)).toBe('—')
  })
  it('fmtPct takes a fraction', () => {
    expect(fmtPct(0.4)).toBe('40%')
    expect(fmtPct(0.4567, 1)).toBe('45,7%')
    expect(fmtPct(null)).toBe('—')
  })
  it('fmtNum and fmtMoney', () => {
    expect(fmtNum(1241.25, 2)).toBe('1.241,25')
    expect(fmtNum(5.4998, 4)).toBe('5,4998')
    expect(fmtNum(undefined as unknown as number, 2)).toBe('—')
    expect(fmtMoney(10, 'BRL')).toBe('R$ 10,00')
    expect(fmtMoney(10, 'USD')).toBe('US$ 10,00')
  })
  it('fmtDateBr converts ISO to dd/mm/aaaa', () => {
    expect(fmtDateBr('2026-10-26')).toBe('26/10/2026')
  })

  it('normalizes negative zero and bad dates', () => {
    expect(fmtNum(-0.001, 2)).toBe('0,00')
    expect(fmtBrl(-0.004)).toBe('R$ 0,00')
    expect(fmtPct(-0.00001, 0)).toBe('0%')
    expect(fmtNum(-1.5, 1)).toBe('-1,5')
    expect(fmtDateBr('lixo')).toBe('—')
  })
})
