import { act, screen, within } from '@testing-library/react'
import { renderWithStore } from '../test/storeHarness'
import { MiniDre } from './MiniDre'
import { ResultsUnitProvider, useResultsUnit } from './resultsUnit'

vi.setConfig({ testTimeout: 15000 })

/** "R$ 1.234,56" / "−R$ ..." / "R$ −1,2" to a number. */
function num(text: string | null): number {
  const t = (text ?? '').replace(/[^\d,−-]/g, '').replace(',', '.').replace('−', '-')
  return Number(t)
}

const op = { asset: 'soja', kind: 'futuro', side: 'vendido', qty: 200000, strike: 1500, maturity: 'jul/27' } as const

beforeEach(() => localStorage.clear())

describe('MiniDre with market operations', () => {
  it('shows nothing about operations without a hedge', async () => {
    await renderWithStore(<MiniDre />)
    const dre = screen.getByTestId('mini-dre')
    expect(within(dre).queryByText(/Lucro\/prejuízo das operações financeiras/)).toBeNull()
    expect(within(dre).queryAllByTestId('dre-hedge-op')).toHaveLength(0)
  })

  it('an incomplete operation changes nothing', async () => {
    await renderWithStore(<MiniDre />, [{ type: 'addHedgeOp' }])
    expect(within(screen.getByTestId('mini-dre')).queryByText(/Lucro\/prejuízo das operações financeiras/)).toBeNull()
  })

  it('adds the line, expanded per operation, inside Receita total and the result', async () => {
    const base = await renderWithStore(<MiniDre />)
    const rev0 = num(within(screen.getByTestId('mini-dre')).getByTestId('dre-revenue').textContent)
    const res0 = num(within(screen.getByTestId('mini-dre')).getByTestId('dre-result').textContent)
    base.unmount()

    await renderWithStore(<MiniDre />, [{ type: 'addHedgeOp', partial: { ...op } }])
    const dre = screen.getByTestId('mini-dre')
    expect(within(dre).getByText(/Lucro\/prejuízo das operações financeiras/)).toBeInTheDocument()
    expect(within(dre).getByText((t) => t.includes('Soja · futuro vendido · jul/27'))).toBeInTheDocument()
    const lines = within(dre).getAllByTestId('dre-value')
    const opLine = num(within(dre).getAllByTestId('dre-hedge-op')[0].textContent)
    expect(opLine).not.toBe(0)

    const rev = num(within(dre).getByTestId('dre-revenue').textContent)
    const costs = num(within(dre).getByTestId('dre-costs').textContent)
    const res = num(within(dre).getByTestId('dre-result').textContent)
    // Receita total − Custos = Resultado still holds, and the revenue moved by the operation's result
    expect(rev - costs).toBeCloseTo(res, 1)
    expect(rev - rev0).toBeCloseTo(opLine, 1)
    expect(res - res0).toBeCloseTo(opLine, 1)
    // the "Resultado das operações" row carries the same amount as its single operation
    const total = lines.map((e) => num(e.textContent))
    expect(total).toContain(opLine)
  })

  it('follows the unit switch (per hectare)', async () => {
    let setUnit: ReturnType<typeof useResultsUnit>['setUnit'] = () => {}
    function Probe() {
      setUnit = useResultsUnit().setUnit
      return null
    }
    await renderWithStore(
      <ResultsUnitProvider>
        <Probe />
        <MiniDre />
      </ResultsUnitProvider>,
      [{ type: 'addHedgeOp', partial: { ...op } }],
    )
    const dre = screen.getByTestId('mini-dre')
    const perSc = num(within(dre).getAllByTestId('dre-hedge-op')[0].textContent)
    act(() => setUnit('ha'))
    const perHa = num(within(dre).getAllByTestId('dre-hedge-op')[0].textContent)
    expect(perHa / perSc).toBeCloseTo(60.4, 1) // 60,4 sc per hectare in the example farm
  })
})
