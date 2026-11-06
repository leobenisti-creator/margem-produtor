import { screen } from '@testing-library/react'
import { mockMatchMedia } from '../test/helpers'
import { readState, renderWithStore } from '../test/storeHarness'
import type { Action } from '../state/types'
import { Comercializacao } from './Comercializacao'
import { Simulador } from './Simulador'
import { Resultados } from './Resultados'

vi.setConfig({ testTimeout: 20000 })

beforeEach(() => {
  localStorage.clear()
  mockMatchMedia(true)
})

// A brand-new visitor: nothing typed, nothing prefilled.
const EMPTY = { base: [] as Action[] }

const noBrokenNumbers = () => {
  const text = document.body.textContent ?? ''
  expect(text).not.toMatch(/NaN|Infinity|undefined/)
}

describe('the empty app (nothing typed) renders without NaN', () => {
  it('starts with zeros in the store', async () => {
    await renderWithStore(<Simulador />, [], EMPTY)
    const s = readState()
    expect([s.inputs.areaHa, s.inputs.yieldScHa, s.inputs.costPerHaBrl, s.inputs.freightBrlPerSc]).toEqual([0, 0, 0, 0])
  })

  it('Lavoura e custos: single total', async () => {
    await renderWithStore(<Simulador />, [], EMPTY)
    noBrokenNumbers()
    expect(screen.getByTestId('page-simulador')).toBeInTheDocument()
    expect(screen.getByTestId('farm-custo')).toBeInTheDocument()
    expect(screen.getByTestId('farm-maior')).toHaveTextContent('informe o custo')
    expect(document.body.textContent).not.toMatch(/IMEA|média da região/)
  })

  it('Lavoura e custos: by category', async () => {
    await renderWithStore(<Simulador />, [{ type: 'setCostMode', mode: 'categorias' }], EMPTY)
    noBrokenNumbers()
    expect(screen.getAllByTestId('cost-row')).toHaveLength(8)
  })

  it('Lavoura e custos: milho and another point change nothing in the empty fields', async () => {
    await renderWithStore(
      <Simulador />,
      [
        { type: 'setCrop', crop: 'milho' },
        { type: 'setFob', fobId: 'sorriso' },
      ],
      EMPTY,
    )
    noBrokenNumbers()
    const s = readState()
    expect([s.inputs.areaHa, s.inputs.yieldScHa, s.inputs.costPerHaBrl, s.inputs.freightBrlPerSc]).toEqual([0, 0, 0, 0])
  })

  it('Comercialização', async () => {
    await renderWithStore(<Comercializacao />, [], EMPTY)
    noBrokenNumbers()
    expect(screen.getByTestId('comercializacao-kpis')).toBeInTheDocument()
  })

  it('Comercialização with a sale and an operation typed over an empty farm', async () => {
    await renderWithStore(
      <Comercializacao />,
      [
        { type: 'addSale', partial: { volume: 1000, volumeUnit: 'sc', price: 150, priceCurrency: 'BRL' } },
        { type: 'addHedgeOp', partial: { asset: 'soja', kind: 'futuro', side: 'vendido', qty: 100000, strike: 1300 } },
      ],
      EMPTY,
    )
    noBrokenNumbers()
  })

  it('Resultados', async () => {
    await renderWithStore(<Resultados />, [], EMPTY)
    noBrokenNumbers()
  })
})
