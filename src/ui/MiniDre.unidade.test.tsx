import { act, screen, within } from '@testing-library/react'
import type { Action } from '../state/types'
import { renderWithStore } from '../test/storeHarness'
import { fmtSignedMoney } from './fmtExtra'
import { MiniDre } from './MiniDre'
import { ResultsUnitProvider, useResultsUnit, type ResultsUnit } from './resultsUnit'

vi.setConfig({ testTimeout: 20000 })
beforeEach(() => localStorage.clear())

/** "R$ 1.234,56" / "−R$ ..." to a number. */
function num(text: string | null): number {
  const t = (text ?? '')
    .replace(/[^\d,−-]/g, '')
    .replace(',', '.')
    .replace('−', '-')
  return Number(t)
}

// 1.000 ha x 60 sc/ha = 60.000 sc
const FARM: Action[] = [
  { type: 'setInput', key: 'areaHa', value: 1000 },
  { type: 'setInput', key: 'yieldScHa', value: 60 },
]

let setUnit: (u: ResultsUnit) => void
function Probe() {
  setUnit = useResultsUnit().setUnit
  return null
}

async function dreIn(unit: ResultsUnit) {
  const view = await renderWithStore(
    <ResultsUnitProvider>
      <Probe />
      <MiniDre />
    </ResultsUnitProvider>,
    FARM,
  )
  act(() => setUnit(unit))
  const dre = screen.getByTestId('mini-dre')
  const get = (id: string) => num(within(dre).getByTestId(id).textContent)
  const summary = within(dre).getByText(/^margem /).textContent ?? ''
  const out = { dre, revenue: get('dre-revenue'), costs: get('dre-costs'), result: get('dre-result'), summary }
  return { ...out, unmount: view.unmount }
}

describe('MiniDre reads the unit of the page', () => {
  it('has no unit button of its own', async () => {
    const { dre } = await dreIn('sc')
    expect(within(dre).queryByRole('button')).toBeNull()
  })

  it('per sack, per hectare and the whole crop are the same amounts divided by 60.000 sc, 1.000 ha and 1', async () => {
    const sc = await dreIn('sc')
    expect(sc.revenue - sc.costs).toBeCloseTo(sc.result, 1)
    expect(sc.summary.endsWith('/sc')).toBe(true)
    sc.unmount()
    localStorage.clear()

    const ha = await dreIn('ha')
    expect(ha.revenue).toBeCloseTo(sc.revenue * 60, 0) // 60 sc/ha
    expect(ha.costs).toBeCloseTo(sc.costs * 60, 0)
    expect(ha.summary.endsWith('/ha')).toBe(true)
    ha.unmount()
    localStorage.clear()

    const total = await dreIn('total')
    // the whole crop is rounded to the real, so allow that against the cent-precise per-sack figures
    expect(total.revenue).toBeCloseTo(sc.revenue * 60000, -3)
    expect(total.costs).toBeCloseTo(sc.costs * 60000, -3)
    expect(total.revenue - total.costs).toBeCloseTo(total.result, 0)
    // no "/unit" after the amount and no cents
    expect(total.summary).toMatch(/· −?R\$ [\d.]+$/)
    expect(within(total.dre).getByTestId('dre-result')).toHaveTextContent(fmtSignedMoney(total.result, 'BRL', 0))
    // the unit of the page decides, not a state of the DRE: switching it back gives the per-sack numbers again
    act(() => setUnit('sc'))
    expect(num(within(total.dre).getByTestId('dre-result').textContent)).toBeCloseTo(sc.result, 2)
  })
})
