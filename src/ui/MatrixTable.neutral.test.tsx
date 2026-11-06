import { render, screen, within } from '@testing-library/react'
import { renderWithStore } from '../test/storeHarness'
import { buildMatrix, okCount, type Matrix } from '../engine/matrix'
import { CROPS } from '../engine/crops'
import type { FarmInputs } from '../engine/calc'
import { MatrixTable } from './MatrixTable'
import { MatrixKpis } from './MatrixKpis'

const inputs: FarmInputs = {
  areaHa: 1000,
  yieldScHa: 60.4,
  costPerHaBrl: 6383.44,
  freightBrlPerSc: 0,
  portFeesBrlPerSc: 0,
  soldPct: 0,
  soldAvgPriceBrl: 0,
  targetMargin: 0.15,
  marginBase: 'receita',
  costUsd: [],
  fxLockPct: 0,
  fxLockRate: 0,
  costScHa: 0,
}
const today = { cbotUsc: 1241.25, basisUsc: 61.7, fx: 5.4998 }
const opts = { stepsPct: [2.5, 5, 10, 20] as const, yieldFactor: 1, includeSold: false }

/** A real grid whose left half (columns 0-4) has an unknown margin. */
function halfUnknown(): Matrix {
  const m = buildMatrix(CROPS.soja, today, inputs, opts)
  return {
    ...m,
    cells: m.cells.map((row) =>
      row.map((c, k) =>
        k <= 4 ? { ...c, marginPct: null, marginPerSc: null, marginPerHa: null, marginTotal: null, tone: null } : c,
      ),
    ),
  }
}

describe('MatrixTable: neutral cells for an unknown margin', () => {
  it('null tone is neutral, named "margem indisponível"; the frontier never borders an unknown cell', () => {
    const m = halfUnknown()
    render(
      <MatrixTable
        matrix={m}
        view="margemPct"
        currency="BRL"
        active={{ cbotUsc: today.cbotUsc, fx: today.fx }}
        caption="grade"
        onPick={() => {}}
        target={0.15}
      />,
    )
    const buttons = within(screen.getByRole('table')).getAllByRole('button')
    buttons.forEach((b, i) => {
      const col = i % 9
      if (col <= 4) {
        expect(b.getAttribute('data-tone')).toBe('na')
        expect(b.className).toContain('bg-tonena')
        expect(b.getAttribute('aria-label')).toMatch(/margem indisponível$/)
        // no frontier between an unknown cell and anything else
        expect(b.getAttribute('data-frontier') ?? '').not.toContain('right')
      } else {
        expect(['0', '1', '2']).toContain(b.getAttribute('data-tone'))
      }
    })
  })

  it('counts ignore unknown cells: okCount and the "abaixo" KPI only count known margins', async () => {
    const m = halfUnknown()
    const known = m.cells.flat().filter((c) => c.marginPct !== null)
    expect(known).toHaveLength(36)
    expect(okCount(m, 0.15)).toBe(known.filter((c) => c.tone === 2).length)
    expect(okCount(m, null)).toBe(known.filter((c) => (c.marginPct as number) >= 0).length)
    await renderWithStore(<MatrixKpis matrix={m} currency="BRL" target={null} current={{ price: 1, marginPct: null, cbotUsc: 1, fx: 1 }} />)
    const negatives = known.filter((c) => (c.marginPct as number) < 0).length
    expect(screen.getByTestId('kpi-abaixo')).toHaveTextContent(`${negatives} de 81`)
    expect(negatives).toBeLessThan(known.length)
  })

  it('the KPI shows "—" when no margin is known', async () => {
    const m = halfUnknown()
    const none: Matrix = { ...m, cells: m.cells.map((row) => row.map((c) => ({ ...c, marginPct: null, tone: null }))) }
    await renderWithStore(<MatrixKpis matrix={none} currency="BRL" target={null} current={{ price: 1, marginPct: null, cbotUsc: 1, fx: 1 }} />)
    expect(screen.getByTestId('kpi-abaixo')).toHaveTextContent('—')
    expect(screen.getByTestId('kpi-abaixo').textContent).not.toMatch(/\d+ de/)
  })
})
