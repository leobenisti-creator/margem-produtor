import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fmtNum } from './format'
import { engineToday, readState, renderWithStore } from '../test/storeHarness'
import { ProductTable } from './ProductTable'

// Heavy whole-panel test: under CPU load (default workers) it can pass 5 s.
vi.setConfig({ testTimeout: 15000 })

beforeEach(() => localStorage.clear())

type User = ReturnType<typeof userEvent.setup>

async function fill(user: User, el: HTMLElement, text: string) {
  await user.clear(el)
  if (text) await user.type(el, text)
}

/** Fills the first product row with MAP 173 kg at 4.200 R$/t and a freight of 150 R$/t. */
async function mapRow(user: User) {
  const r = screen.getAllByTestId('product-row')[0]
  await user.selectOptions(within(r).getByLabelText('Produto 1'), 'map')
  await fill(user, within(r).getByLabelText('Dose do produto 1'), '173')
  await fill(user, within(r).getByLabelText('Preço do produto 1'), '4.200')
  await fill(user, screen.getByLabelText('Frete até a fazenda (R$/t)'), '150')
  return r
}

describe('ProductTable', () => {
  it('price fields are never pre-filled; an empty price costs "—", nothing invented', async () => {
    await renderWithStore(<ProductTable itemId="adubacao.macro" kind="adubo" />)
    const r = screen.getAllByTestId('product-row')[0]
    expect(within(r).getByLabelText('Preço do produto 1')).toHaveValue('')
    expect(within(r).getByTestId('row-cost')).toHaveTextContent('—')
    expect(screen.getByTestId('detail-total')).toHaveTextContent('—')
    expect(screen.getByRole('button', { name: 'Usar no meu custo' })).toBeDisabled()
  })

  it('MAP 173 kg at 4.200/t + freight 150 = R$ 753/ha; sc/t and sc/ha use the farm price', async () => {
    const { user } = await renderWithStore(<ProductTable itemId="adubacao.macro" kind="adubo" />)
    const r = await mapRow(user)
    expect(within(r).getByTestId('row-cost')).toHaveTextContent('R$ 753')
    const { result } = await engineToday(readState())
    const farm = result.farmPriceBrl as number
    expect(within(r).getByTestId('row-sct')).toHaveTextContent(fmtNum(4350 / farm, 1))
    expect(screen.getByTestId('detail-total')).toHaveTextContent('R$ 753/ha')
    expect(screen.getByTestId('detail-sc')).toHaveTextContent(`${fmtNum(752.55 / farm, 1)} sc/ha`)
    expect(screen.getByTestId('detail-area')).toHaveTextContent('R$ 752,6 mil')
    expect(screen.queryByTestId('detail-share')).toBeNull()
  })

  it('"Usar no meu custo" puts R$ rows in the R$ part and US$ rows in the US$ part', async () => {
    const onDone = vi.fn()
    const { user } = await renderWithStore(<ProductTable itemId="adubacao.macro" kind="adubo" onDone={onDone} />)
    await mapRow(user)
    await user.click(screen.getByRole('button', { name: 'Adicionar produto' }))
    const r2 = screen.getAllByTestId('product-row')[1]
    await user.selectOptions(within(r2).getByLabelText('Produto 2'), 'kcl')
    await fill(user, within(r2).getByLabelText('Dose do produto 2'), '100')
    await fill(user, within(r2).getByLabelText('Preço do produto 2'), '600')
    await user.selectOptions(within(r2).getByLabelText('Moeda do produto 2'), 'USD')
    await user.click(screen.getByRole('button', { name: 'Usar no meu custo' }))
    const item = readState().costGroups.fertilizantes.items['adubacao.macro']
    expect(item.mode).toBe('valor')
    // R$ part: MAP 752,55 + the freight of the US$ KCl row (0,1 t × 150)
    expect(item.valueBrlHa).toBeCloseTo(752.55 + 15, 6)
    expect(item.usd?.amountUsdHa).toBeCloseTo(60, 6)
    expect(item.rows).toHaveLength(2)
    expect(item.freightBrlTon).toBe(150)
    expect(readState().inputs.costUsd).toEqual([{ usdPerHa: 60, boughtPct: 0, boughtRate: 0 }])
    expect(onDone).toHaveBeenCalled()
  })

  it('has no "Voltar à média da região" button (there is no regional average)', async () => {
    await renderWithStore(<ProductTable itemId="adubacao.macro" kind="adubo" />, [
      { type: 'setCostItem', itemId: 'adubacao.macro', patch: { mode: 'valor', valueBrlHa: 10 } },
    ])
    expect(screen.queryByRole('button', { name: /média da região/ })).toBeNull()
  })

  it('defensivos default to a price per litre with applications', async () => {
    const { user } = await renderWithStore(<ProductTable itemId="defensivos.fungicida" kind="defensivo" />)
    const r = screen.getAllByTestId('product-row')[0]
    await fill(user, within(r).getByLabelText('Nome do produto 1'), 'Fungicida X')
    await fill(user, within(r).getByLabelText('Dose do produto 1'), '0,5')
    await fill(user, within(r).getByLabelText('Preço do produto 1'), '120')
    await fill(user, within(r).getByLabelText('Aplicações do produto 1'), '3')
    expect(within(r).getByLabelText('Unidade do preço do produto 1')).toHaveValue('L')
    expect(within(r).getByTestId('row-cost')).toHaveTextContent('R$ 180')
  })
})
