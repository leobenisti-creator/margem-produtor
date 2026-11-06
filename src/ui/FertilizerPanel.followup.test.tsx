import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readState, renderWithStore } from '../test/storeHarness'
import { FertilizerPanel } from './FertilizerPanel'

// Heavy whole-panel test: under CPU load (default workers) it can pass 5 s.
vi.setConfig({ testTimeout: 15000 })

beforeEach(() => localStorage.clear())

type User = ReturnType<typeof userEvent.setup>

async function createFormula(user: User, name: string, n: string, p: string, k: string) {
  await user.click(screen.getByRole('button', { name: 'Criar fórmula' }))
  await user.type(screen.getByLabelText('Nome da fórmula'), name)
  for (const [label, v] of [
    ['N da fórmula (%)', n],
    ['P₂O₅ da fórmula (%)', p],
    ['K₂O da fórmula (%)', k],
  ] as const) {
    const f = screen.getByLabelText(label)
    await user.clear(f)
    await user.type(f, v)
  }
  await user.click(screen.getByRole('button', { name: 'Salvar fórmula' }))
}

describe('FertilizerPanel (Follow-up 1 / Fix round 1)', () => {
  it('creates a 04-30-10 formula that becomes a product (price empty) and counts in the N credit', async () => {
    const { user } = await renderWithStore(<FertilizerPanel itemId="adubacao.macro" />)
    await createFormula(user, '04-30-10', '4', '30', '10')
    await user.selectOptions(screen.getByLabelText('Adubo para o fósforo (P)'), 'custom:04-30-10')
    const p = screen.getByLabelText('P₂O₅ (kg/ha)')
    await user.clear(p)
    await user.type(p, '60')
    await user.tab()
    expect(screen.getByTestId('suggest-custom:04-30-10')).toHaveTextContent('200 kg/ha')
    expect(screen.getByTestId('n-credit')).toHaveTextContent('8 kg/ha de N')
    await user.click(screen.getByRole('radio', { name: 'Por produto' }))
    expect(screen.getByRole('button', { name: 'Criar fórmula' })).toBeInTheDocument()
    const r = screen.getAllByTestId('product-row')[0]
    await user.selectOptions(within(r).getByLabelText('Produto 1'), 'custom:04-30-10')
    expect(within(r).getByLabelText('Preço do produto 1')).toHaveValue('')
    await user.clear(within(r).getByLabelText('Dose do produto 1'))
    await user.type(within(r).getByLabelText('Dose do produto 1'), '200')
    await user.type(within(r).getByLabelText('Preço do produto 1'), '3.000')
    await user.click(screen.getByRole('button', { name: 'Usar no meu custo' }))
    const row = readState().costGroups.fertilizantes.items['adubacao.macro'].rows?.[0]
    expect(row).toMatchObject({ productId: 'custom', name: '04-30-10', custom: { n: 0.04, p2o5: 0.3, k2o: 0.1 } })
  })

  it('rejects contents that add up to more than 100%, and a content above 100%', async () => {
    const { user } = await renderWithStore(<FertilizerPanel itemId="adubacao.macro" />)
    await createFormula(user, 'Errada', '50', '40', '20')
    expect(screen.getByRole('alert')).toHaveTextContent('A soma dos teores não pode passar de 100%.')
    expect(screen.queryByRole('option', { name: 'Errada' })).toBeNull()
    const n = screen.getByLabelText('N da fórmula (%)')
    await user.clear(n)
    await user.type(n, '120')
    expect(screen.getAllByRole('alert').some((a) => /entre 0% e 100%/.test(a.textContent ?? ''))).toBe(true)
  })

  it('keeps unsaved product rows when switching modes and back', async () => {
    const { user } = await renderWithStore(<FertilizerPanel itemId="adubacao.macro" />)
    await user.click(screen.getByRole('radio', { name: 'Por produto' }))
    const r = screen.getAllByTestId('product-row')[0]
    await user.selectOptions(within(r).getByLabelText('Produto 1'), 'map')
    await user.type(within(r).getByLabelText('Preço do produto 1'), '4.200')
    await user.click(screen.getByRole('radio', { name: 'Pelos nutrientes (N-P-K)' }))
    await user.click(screen.getByRole('radio', { name: 'Por produto' }))
    const r2 = screen.getAllByTestId('product-row')[0]
    expect(within(r2).getByLabelText('Produto 1')).toHaveValue('map')
    expect(within(r2).getByLabelText('Preço do produto 1')).toHaveValue('4.200')
  })

  it('nutrient mode has no "Voltar à média da região" (no regional average)', async () => {
    await renderWithStore(<FertilizerPanel itemId="adubacao.macro" />, [
      { type: 'setCostItem', itemId: 'adubacao.macro', patch: { mode: 'valor', valueBrlHa: 5 } },
    ])
    expect(screen.getByRole('radio', { name: 'Pelos nutrientes (N-P-K)' })).toBeChecked()
    expect(screen.queryByRole('button', { name: /média da região/ })).toBeNull()
  })

  it('an "Outro produto" row keeps its typed name when reopened', async () => {
    await renderWithStore(<FertilizerPanel itemId="adubacao.corretivos" />, [
      {
        type: 'setCostItem',
        itemId: 'adubacao.corretivos',
        patch: {
          mode: 'valor',
          valueBrlHa: 270,
          rows: [
            { id: 'g', productId: null, name: 'Gesso', dose: 1.5, doseUnit: 't', price: 180, priceUnit: 't', currency: 'BRL', applications: 1 },
          ],
        },
      },
    ])
    const r = screen.getAllByTestId('product-row')[0]
    expect(within(r).getByLabelText('Produto 1')).toHaveValue('outro')
    expect(within(r).getByLabelText('Nome do produto 1')).toHaveValue('Gesso')
  })
})
