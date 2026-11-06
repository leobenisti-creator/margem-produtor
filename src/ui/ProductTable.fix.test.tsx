import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fmtNum } from './format'
import { engineToday, readState, renderWithStore } from '../test/storeHarness'
import { ProductTable } from './ProductTable'

// Heavy whole-panel test: under CPU load (default workers) it can pass 5 s.
vi.setConfig({ testTimeout: 15000 })

beforeEach(() => localStorage.clear())

async function fill(user: ReturnType<typeof userEvent.setup>, el: HTMLElement, text: string) {
  await user.clear(el)
  if (text) await user.type(el, text)
}

describe('ProductTable (Fix round 1)', () => {
  it('sc/t has no freight on a row priced per kg (consistent with the row cost)', async () => {
    const { user } = await renderWithStore(<ProductTable itemId="adubacao.micro" kind="adubo" />)
    const r = screen.getAllByTestId('product-row')[0]
    await user.selectOptions(within(r).getByLabelText('Unidade do preço do produto 1'), 'kg')
    await fill(user, within(r).getByLabelText('Dose do produto 1'), '2')
    await fill(user, within(r).getByLabelText('Preço do produto 1'), '10')
    await fill(user, screen.getByLabelText('Frete até a fazenda (R$/t)'), '150')
    expect(within(r).getByTestId('row-cost')).toHaveTextContent('R$ 20')
    const farm = (await engineToday(readState())).result.farmPriceBrl as number
    expect(within(r).getByTestId('row-sct')).toHaveTextContent(fmtNum(10000 / farm, 1))
  })

  it('US$ rows are valued at the effective dollar of the item (bought share and rate, today market)', async () => {
    const { user } = await renderWithStore(<ProductTable itemId="adubacao.macro" kind="adubo" />, [
      {
        type: 'setCostItem',
        itemId: 'adubacao.macro',
        patch: { mode: 'valor', usd: { amountUsdHa: 1, boughtPct: 0.5, boughtRate: 5 } },
      },
      { type: 'applyScenario', cbotUsc: 1300, fx: 6 },
    ])
    const eff = 0.5 * 5 + 0.5 * 5.4998
    const r = screen.getAllByTestId('product-row')[0]
    await user.selectOptions(within(r).getByLabelText('Produto 1'), 'kcl')
    await fill(user, within(r).getByLabelText('Dose do produto 1'), '100')
    await fill(user, within(r).getByLabelText('Preço do produto 1'), '600')
    await user.selectOptions(within(r).getByLabelText('Moeda do produto 1'), 'USD')
    expect(screen.getByTestId('detail-total')).toHaveTextContent(`R$ ${fmtNum(60 * eff, 0)}/ha`)
    expect(screen.getByTestId('detail-fx')).toHaveTextContent('dólar efetivo hoje · 5,2499')
  })

  it('the item freight can still be cleared through the reducer', async () => {
    await renderWithStore(<ProductTable itemId="adubacao.macro" kind="adubo" />, [
      { type: 'setCostItem', itemId: 'adubacao.macro', patch: { mode: 'valor', valueBrlHa: 10, freightBrlTon: 150 } },
      { type: 'setCostItem', itemId: 'adubacao.macro', patch: { freightBrlTon: null } },
    ])
    expect(readState().costGroups.fertilizantes.items['adubacao.macro'].freightBrlTon).toBeUndefined()
  })
})
