import { describe, expect, it } from 'vitest'
import { CROPS } from './crops'
import {
  brlToUsd,
  freightPerTonToPerSc,
  parseDecimalPtBr,
  scHaToTHa,
  tHaToScHa,
  usdToBrl,
} from './units'

describe('parseDecimalPtBr', () => {
  it('parses pt-BR thousands and comma decimal', () => {
    expect(parseDecimalPtBr('4.200,50')).toBe(4200.5)
  })
  it('parses plain dot decimal', () => {
    expect(parseDecimalPtBr('4200.5')).toBe(4200.5)
  })
  it('parses comma only', () => {
    expect(parseDecimalPtBr('4200,5')).toBe(4200.5)
  })
  it('parses dot thousands only', () => {
    expect(parseDecimalPtBr('4.200')).toBe(4200)
    expect(parseDecimalPtBr('1.234.567')).toBe(1234567)
  })
  it('a leading zero before the dot is a decimal, never a thousands group (0.500 is 0,5)', () => {
    expect(parseDecimalPtBr('0.500')).toBe(0.5)
    expect(parseDecimalPtBr('0.125')).toBe(0.125)
    expect(parseDecimalPtBr('-0.250')).toBe(-0.25)
    expect(parseDecimalPtBr('1.500')).toBe(1500) // still pt-BR thousands
  })
  it('handles currency prefix, spaces and negatives', () => {
    expect(parseDecimalPtBr('  R$ 4.200,50 ')).toBe(4200.5)
    expect(parseDecimalPtBr('US$ 5,4998')).toBe(5.4998)
    expect(parseDecimalPtBr('-3,5')).toBe(-3.5)
  })
  it('returns null for empty and text', () => {
    expect(parseDecimalPtBr('')).toBeNull()
    expect(parseDecimalPtBr('   ')).toBeNull()
    expect(parseDecimalPtBr('abc')).toBeNull()
    expect(parseDecimalPtBr('1,2,3')).toBeNull()
    expect(parseDecimalPtBr('1.2345')).toBeNull()
    expect(parseDecimalPtBr('1.2.3')).toBeNull()
    expect(parseDecimalPtBr('1,2.3')).toBeNull()
  })
})

describe('unit conversions', () => {
  it('converts sc/ha to t/ha', () => {
    expect(scHaToTHa(60)).toBeCloseTo(3.6, 10)
    expect(tHaToScHa(3.6)).toBeCloseTo(60, 10)
  })
  it('freight 3 R$/t is 0.18 R$/sc', () => {
    expect(freightPerTonToPerSc(3)).toBeCloseTo(0.18, 10)
  })
  it('converts currency both ways', () => {
    expect(brlToUsd(11, 5.5)).toBeCloseTo(2, 10)
    expect(usdToBrl(2, 5.5)).toBeCloseTo(11, 10)
  })
  it('usd conversion rejects fx 0', () => {
    expect(() => brlToUsd(10, 0)).toThrow(RangeError)
    expect(() => usdToBrl(10, -1)).toThrow(RangeError)
  })
})

describe('CROPS', () => {
  it('CROPS factors are 2.20462 and 2.36218', () => {
    expect(CROPS.soja.bushelsPerSack).toBe(2.20462)
    expect(CROPS.milho.bushelsPerSack).toBe(2.36218)
    expect(CROPS.soja.color).toBe('#12634A')
    expect(CROPS.milho.color).toBe('#D1AE6C')
  })
})
