/** Tonnes per 60 kg sack. */
export const SACK_TON = 0.06

/**
 * Parses a number typed in pt-BR style ("4.200,50") or plain style ("4200.5").
 * Returns null when the text is not an unambiguous number.
 */
export function parseDecimalPtBr(raw: string): number | null {
  const text = raw
    .trim()
    .replace(/^(-?)\s*(R\$|US\$|\$)\s*/i, '$1')
    .trim()
  if (text === '') return null

  const hasDot = text.includes('.')
  const hasComma = text.includes(',')
  let normalized: string

  if (hasDot && hasComma) {
    if (text.lastIndexOf(',') > text.lastIndexOf('.')) {
      if (!/^-?\d{1,3}(\.\d{3})*,\d+$/.test(text)) return null
      normalized = text.replace(/\./g, '').replace(',', '.')
    } else {
      if (!/^-?\d{1,3}(,\d{3})*\.\d+$/.test(text)) return null
      normalized = text.replace(/,/g, '')
    }
  } else if (hasComma) {
    if (!/^-?\d+,\d+$/.test(text)) return null
    normalized = text.replace(',', '.')
  } else if (hasDot) {
    if (/^-?\d+\.\d{1,2}$/.test(text)) {
      normalized = text
    } else if (/^-?0\.\d+$/.test(text)) {
      // "0.500" can only be a decimal (a thousands group never starts with 0): 0,5, not 500.
      normalized = text
    } else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(text)) {
      normalized = text.replace(/\./g, '')
    } else {
      return null
    }
  } else {
    if (!/^-?\d+$/.test(text)) return null
    normalized = text
  }

  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

function assertFx(fx: number): void {
  if (!(fx > 0)) throw new RangeError('fx must be greater than 0')
}

export function brlToUsd(brl: number, fx: number): number {
  assertFx(fx)
  return brl / fx
}

export function usdToBrl(usd: number, fx: number): number {
  assertFx(fx)
  return usd * fx
}

export function scHaToTHa(sc: number): number {
  return sc * SACK_TON
}

export function tHaToScHa(t: number): number {
  return t / SACK_TON
}

export function freightPerTonToPerSc(brlPerTon: number): number {
  return brlPerTon * SACK_TON
}
