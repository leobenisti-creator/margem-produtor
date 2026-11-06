import type { CropId } from '../engine/crops'
import type { DataKind, MarketSnapshot, Quote } from './types'

/**
 * Contract of a `MarketSnapshot`, as the UI parses it. Every provider (the static seed today, the
 * API tomorrow) must satisfy it; `snapshotContractViolations` lists what is wrong, one line each,
 * so the test can print it. See README "Contrato do provedor".
 *
 * Unit strings are exact: Ticker and comparison branch on them (b3 `US$/sc` vs `R$/sc`).
 */
export const EXPECTED_UNITS = {
  cbotUsc: 'USc/bu',
  fx: 'R$/US$',
  /** Premium (positive) or discount (negative) over the CBOT, in the same US¢/bu. */
  basisUsc: 'USc/bu',
  b3: { soja: 'US$/sc', milho: 'R$/sc' } as Record<CropId, string>,
  cepea: { soja: 'R$/sc', milho: 'R$/sc' } as Record<CropId, string>,
} as const

const KINDS: readonly DataKind[] = ['fechamento', 'ao_vivo', 'manual']
const CROPS: readonly CropId[] = ['soja', 'milho']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function quoteViolations(path: string, q: unknown, unit: string): string[] {
  if (q === null || typeof q !== 'object') return [`${path}: missing quote (got ${String(q)})`]
  const v = q as Partial<Quote>
  const out: string[] = []
  if (typeof v.value !== 'number' || !Number.isFinite(v.value)) {
    out.push(`${path}: value must be a finite number (got ${String(v.value)})`)
  }
  if (v.unit !== unit) out.push(`${path}: unit must be '${unit}' (got '${String(v.unit)}')`)
  if (typeof v.asOf !== 'string' || !ISO_DATE.test(v.asOf)) {
    out.push(`${path}: asOf must be an ISO date YYYY-MM-DD (got '${String(v.asOf)}')`)
  }
  if (!KINDS.includes(v.kind as DataKind)) {
    out.push(`${path}: kind must be one of ${KINDS.join(' | ')} (got '${String(v.kind)}')`)
  }
  if (typeof v.source !== 'string' || !/\S/.test(v.source)) {
    out.push(`${path}: source must be a non-empty string`)
  }
  return out
}

/** Empty array = the snapshot honours the contract. */
export function snapshotContractViolations(snap: MarketSnapshot): string[] {
  const s = snap as unknown as Record<string, Record<string, unknown> | undefined>
  const out: string[] = []
  out.push(...quoteViolations('fx', s.fx, EXPECTED_UNITS.fx))
  for (const crop of CROPS) {
    out.push(...quoteViolations(`cbotUsc.${crop}`, s.cbotUsc?.[crop], EXPECTED_UNITS.cbotUsc))
    out.push(...quoteViolations(`b3.${crop}`, s.b3?.[crop], EXPECTED_UNITS.b3[crop]))
    out.push(...quoteViolations(`cepea.${crop}`, s.cepea?.[crop], EXPECTED_UNITS.cepea[crop]))
    out.push(...quoteViolations(`basisUsc.${crop}`, s.basisUsc?.[crop], EXPECTED_UNITS.basisUsc))
  }
  return out
}
