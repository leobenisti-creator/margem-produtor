import type { MarketSnapshot } from '../data/types'
import type { CropId } from '../engine/crops'
import { brlToUsd, usdToBrl } from '../engine/units'
import { fmtBrl, fmtUsd } from './format'

export type Currency = 'BRL' | 'USD'

export type ComparisonPosition = 'acima' | 'abaixo' | 'proximo'

export interface Comparison {
  /** Text after "Em outras praças (sem frete):" in the display currency. */
  text: string
  /** Largest gap between a comparison price and the farm price, as a fraction of the farm price (null when unknown). */
  gap: number | null
  /** Where the other prices sit relative to the farm price (within 2 % counts as "proximo"); null when unknown. */
  position: ComparisonPosition | null
}

const usable = (fx: number) => Number.isFinite(fx) && fx > 0

/**
 * B3 and Cepea quotes beside the farm price (spec §7: display only). Both are converted to the
 * display currency with the scenario dollar; the conversion is shown so no one mistakes it for a
 * quote. Soja's B3 SJC is quoted in US$, milho's B3 CCM in R$.
 */
export function buildComparison(
  snapshot: MarketSnapshot,
  crop: CropId,
  currency: Currency,
  fx: number,
  farmPriceBrl: number | null,
  /** The dollar was typed in the ticker: the conversion says "dólar manual" (#9). */
  fxManual = false,
): Comparison {
  const b3 = snapshot.b3[crop]
  const cepea = snapshot.cepea[crop]
  const b3Usd = b3.unit.startsWith('US$')
  const label = crop === 'soja' ? 'B3 SJC' : 'B3 CCM'
  const cepeaLabel = crop === 'soja' ? 'Cepea Paranaguá' : 'Cepea'
  const b3Brl = Number.isFinite(b3.value) ? (b3Usd ? (usable(fx) ? usdToBrl(b3.value, fx) : null) : b3.value) : null
  const cepeaBrl = Number.isFinite(cepea.value) ? cepea.value : null
  const dolar = fxManual ? 'dólar manual' : 'dólar'

  let b3Text: string
  let cepeaText: string
  if (currency === 'BRL') {
    b3Text = b3Usd
      ? b3Brl === null
        ? `${label} ${fmtUsd(b3.value)}`
        : `${label} ≈ ${fmtBrl(b3Brl)} (${fmtUsd(b3.value)} × ${dolar})`
      : `${label} ${fmtBrl(b3.value)}`
    cepeaText = `${cepeaLabel} ${fmtBrl(cepeaBrl)}`
  } else {
    b3Text = b3Usd
      ? `${label} ${fmtUsd(b3.value)}`
      : b3Brl !== null && usable(fx)
        ? `${label} ≈ ${fmtUsd(brlToUsd(b3Brl, fx))} (${fmtBrl(b3Brl)} ÷ ${dolar})`
        : `${label} ${fmtBrl(b3Brl)}`
    cepeaText =
      cepeaBrl !== null && usable(fx)
        ? `${cepeaLabel} ≈ ${fmtUsd(brlToUsd(cepeaBrl, fx))} (${fmtBrl(cepeaBrl)} ÷ ${dolar})`
        : `${cepeaLabel} ${fmtBrl(cepeaBrl)}`
  }

  let gap: number | null = null
  let position: ComparisonPosition | null = null
  if (farmPriceBrl !== null && Number.isFinite(farmPriceBrl) && farmPriceBrl > 0) {
    const known = [b3Brl, cepeaBrl].filter((v): v is number => v !== null)
    for (const v of known) {
      const g = Math.abs(v - farmPriceBrl) / farmPriceBrl
      if (gap === null || g > gap) gap = g
    }
    if (known.length > 0) {
      position = known.every((v) => v > farmPriceBrl * 1.02)
        ? 'acima'
        : known.every((v) => v < farmPriceBrl * 0.98)
          ? 'abaixo'
          : 'proximo'
    }
  }
  return { text: `${b3Text} · ${cepeaText}`, gap, position }
}

/** Above this gap the tile shows an inline "why" button (P1-2). */
export const COMPARISON_GAP_HINT = 0.25
