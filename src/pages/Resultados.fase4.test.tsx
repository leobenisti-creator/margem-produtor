import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fobUsdPerSc, portFeesBrlPerTon, referencePriceBrl } from '../engine/calc'
import { CROPS } from '../engine/crops'
import { StoreProvider, useStore } from '../state/StoreProvider'
import { LEGACY_EXAMPLE, seedState } from '../test/helpers'
import { Resultados } from './Resultados'

vi.setConfig({ testTimeout: 15000 })

let api: ReturnType<typeof useStore>
function Grab() {
  api = useStore()
  return null
}

async function setup() {
  const user = userEvent.setup()
  render(
    <StoreProvider>
      <Resultados />
      <Grab />
    </StoreProvider>,
  )
  await screen.findByTestId('page-resultados')
  return user
}

beforeEach(() => {
  localStorage.clear()
  seedState(LEGACY_EXAMPLE, false)
})

describe('engine: fobUsdPerSc / portFeesBrlPerTon', () => {
  it('FOB in US$/sc = (CBOT + basis) ÷ 100 × bushels per sack, and ties to the reference price at any dollar', () => {
    const s = { cbotUsc: 1000, basisUsc: 60, fx: 5 }
    expect(fobUsdPerSc(CROPS.soja, s)).toBeCloseTo(10.6 * CROPS.soja.bushelsPerSack, 10)
    expect(fobUsdPerSc(CROPS.soja, s) * s.fx).toBeCloseTo(referencePriceBrl(CROPS.soja, s), 10)
  })
  it('port fees: 6 R$/sc = 100 R$/t', () => {
    expect(portFeesBrlPerTon({ portFeesBrlPerSc: 6 })).toBeCloseTo(100, 10)
  })
})

describe('Comercialização: mini DRE, Formação do preço, vendas inline', () => {
  it('the mini DRE is always there and follows the chosen scenario', async () => {
    await setup()
    const before = within(screen.getByTestId('mini-dre')).getAllByTestId('dre-value').map((e) => e.textContent)
    expect(before.length).toBeGreaterThanOrEqual(2)
    act(() => api.dispatch({ type: 'applyScenario', cbotUsc: api.state.overrides.cbotUsc ?? 1300, fx: 6.5 }))
    const after = within(screen.getByTestId('mini-dre')).getAllByTestId('dre-value').map((e) => e.textContent)
    expect(after).not.toEqual(before)
  })

  it('the DRE sits below the matrix, follows the ONE unit button of the page: R$/sc, R$/ha, R$ total', async () => {
    const user = await setup()
    const dre = screen.getByTestId('mini-dre')
    expect(screen.getByTestId('card-matriz').compareDocumentPosition(dre) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // no unit button of its own any more
    expect(within(dre).queryByRole('button', { name: /^Unidade/ })).toBeNull()
    const vals = () => within(dre).getAllByTestId('dre-value').map((e) => e.textContent)
    const sc = vals()
    const unit = () => screen.getByRole('button', { name: /^Unidade de todos os valores:/ })
    expect(unit()).toHaveAccessibleName('Unidade de todos os valores: R$/sc')
    await user.click(unit())
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual(['R$/sc', 'R$/ha', 'R$ total'])
    await user.click(screen.getByRole('radio', { name: 'R$/ha' }))
    const ha = vals()
    expect(ha).not.toEqual(sc)
    await user.click(unit())
    await user.click(screen.getByRole('radio', { name: 'R$ total' }))
    const total = vals()
    expect(total).not.toEqual(ha)
    await user.click(unit())
    await user.click(screen.getByRole('radio', { name: 'R$/sc' }))
    expect(vals()).toEqual(sc)
  })
})
