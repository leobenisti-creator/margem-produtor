import { screen, within } from '@testing-library/react'
import { renderWithStore } from '../test/storeHarness'
import { FertilizerPanel } from './FertilizerPanel'

// Heavy whole-panel test: under CPU load (default workers) it can pass 5 s.
vi.setConfig({ testTimeout: 15000 })

beforeEach(() => localStorage.clear())

describe('FertilizerPanel', () => {
  it('nutrient mode: P₂O₅ 90 with MAP gives 173 kg/ha and credits 19 kg of N', async () => {
    const { user } = await renderWithStore(<FertilizerPanel itemId="adubacao.macro" />)
    expect(screen.getByRole('radio', { name: 'Pelos nutrientes (N-P-K)' })).toBeChecked()
    const p = screen.getByLabelText('P₂O₅ (kg/ha)')
    await user.clear(p)
    await user.type(p, '90')
    await user.tab()
    const map = screen.getByTestId('suggest-map')
    expect(map).toHaveTextContent('MAP 11-52-00')
    expect(map).toHaveTextContent('173 kg/ha')
    expect(screen.getByTestId('n-credit')).toHaveTextContent('19 kg/ha de N')
  })

  it('N already delivered by MAP is not bought twice; only the missing N becomes urea', async () => {
    const { user } = await renderWithStore(<FertilizerPanel itemId="adubacao.macro" />)
    for (const [label, v] of [
      ['N (kg/ha)', '20'],
      ['P₂O₅ (kg/ha)', '90'],
    ] as const) {
      const f = screen.getByLabelText(label)
      await user.clear(f)
      await user.type(f, v)
      await user.tab()
    }
    expect(screen.getByTestId('n-credit')).toHaveTextContent(/Faltam 1 kg/)
    expect(screen.getByTestId('suggest-ureia')).toHaveTextContent('2 kg/ha')
  })

  it('takes the suggestion to the product table with empty prices', async () => {
    const { user } = await renderWithStore(<FertilizerPanel itemId="adubacao.macro" />)
    const p = screen.getByLabelText('P₂O₅ (kg/ha)')
    await user.clear(p)
    await user.type(p, '90')
    await user.tab()
    await user.click(screen.getByRole('button', { name: 'Levar para a tabela de produtos' }))
    expect(screen.getByRole('radio', { name: 'Por produto' })).toBeChecked()
    const r = screen.getAllByTestId('product-row')[0]
    expect(within(r).getByLabelText('Produto 1')).toHaveValue('map')
    expect(within(r).getByLabelText('Dose do produto 1')).toHaveValue('173,08')
    expect(within(r).getByLabelText('Preço do produto 1')).toHaveValue('')
  })

  it('corretivos and micronutrientes open straight in "por produto"', async () => {
    await renderWithStore(<FertilizerPanel itemId="adubacao.corretivos" />)
    expect(screen.queryByRole('radio', { name: 'Pelos nutrientes (N-P-K)' })).toBeNull()
    expect(screen.getAllByTestId('product-row')).toHaveLength(1)
  })
})
