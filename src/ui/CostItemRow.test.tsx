import { screen, within } from '@testing-library/react'
import { readState, renderWithStore } from '../test/storeHarness'
import { CostItemRow } from './CostItemRow'

beforeEach(() => localStorage.clear())

const row = (id: string) => screen.getByTestId(`item-${id}`)

describe('CostItemRow', () => {
  it('an item offers only "meu valor" and "não uso" (no regional average), starting at "não uso"', async () => {
    await renderWithStore(<CostItemRow group="financeiro" itemId="financeiro.seguroProducao" />)
    const r = row('financeiro.seguroProducao')
    expect(within(r).queryByRole('radio', { name: 'média da região' })).toBeNull()
    expect(r).not.toHaveTextContent(/média da região/)
    expect(within(r).getAllByRole('radio')).toHaveLength(2)
    expect(within(r).getByRole('radio', { name: 'meu valor' })).toBeInTheDocument()
    expect(within(r).getByRole('radio', { name: 'não uso' })).toBeChecked()
  })

  it('the two states change the group total: não uso zeroes, meu valor sums the typed value', async () => {
    const { user } = await renderWithStore(<CostItemRow group="defensivos" itemId="defensivos.herbicida" />)
    const r = row('defensivos.herbicida')
    expect(within(r).getByRole('radio', { name: 'não uso' })).toBeChecked()

    await user.click(within(r).getByRole('radio', { name: 'meu valor' }))
    expect(readState().costGroups.defensivos.mode).toBe('itens')
    // Nothing typed yet: nothing jumps and nothing is prefilled.
    expect(readState().costCategories.defensivos).toBe(0)
    const field = within(r).getByLabelText('Valor de Herbicidas')
    await user.clear(field)
    await user.type(field, '500')
    await user.tab()
    expect(readState().costCategories.defensivos).toBeCloseTo(500, 6)

    await user.click(within(r).getByRole('radio', { name: 'não uso' }))
    expect(readState().costCategories.defensivos).toBe(0)
  })

  it('a US$ item shows the dollar chip and stores a US$ line', async () => {
    const { user } = await renderWithStore(<CostItemRow group="fertilizantes" itemId="adubacao.macro" />)
    const r = row('adubacao.macro')
    await user.click(within(r).getByRole('radio', { name: 'meu valor' }))
    await user.click(within(r).getByRole('radio', { name: 'US$' }))
    const field = within(r).getByLabelText('Valor de Macronutrientes em US$')
    await user.clear(field)
    await user.type(field, '195')
    await user.tab()
    expect(readState().costGroups.fertilizantes.items['adubacao.macro'].usd?.amountUsdHa).toBe(195)
    expect(readState().inputs.costUsd).toEqual([{ usdPerHa: 195, boughtPct: 0, boughtRate: 0 }])
    expect(within(r).getByTestId('fx-effective')).toHaveTextContent('do dia')
  })

  it('Arrendamento accepts sc/ha', async () => {
    const { user } = await renderWithStore(<CostItemRow group="arrendamento" itemId="arrendamento.valor" />)
    const r = row('arrendamento.valor')
    await user.click(within(r).getByRole('radio', { name: 'meu valor' }))
    await user.click(within(r).getByRole('radio', { name: 'sc/ha' }))
    const field = within(r).getByLabelText('Valor de Arrendamento em sc/ha')
    await user.clear(field)
    await user.type(field, '8')
    await user.tab()
    const item = readState().costGroups.arrendamento.items['arrendamento.valor']
    expect(item).toMatchObject({ mode: 'valor', unit: 'scHa', valueBrlHa: 8 })
    expect(readState().inputs.costScHa).toBe(8)
  })

  it('"Detalhar ›" only on Adubação and Defensivos items', async () => {
    await renderWithStore(
      <>
        <CostItemRow group="fertilizantes" itemId="adubacao.corretivos" />
        <CostItemRow group="defensivos" itemId="defensivos.fungicida" />
        <CostItemRow group="sementes" itemId="sementes.cultura" />
        <CostItemRow group="fertilizantes" itemId="adubacao.demais" />
      </>,
    )
    expect(within(row('adubacao.corretivos')).getByRole('button', { name: /Detalhar/ })).toBeInTheDocument()
    expect(within(row('defensivos.fungicida')).getByRole('button', { name: /Detalhar/ })).toBeInTheDocument()
    expect(within(row('sementes.cultura')).queryByRole('button', { name: /Detalhar/ })).toBeNull()
    expect(within(row('adubacao.demais')).queryByRole('button', { name: /Detalhar/ })).toBeNull()
  })
})

describe('CostItemRow unit switch (Fix round 1)', () => {
  const FX = 5.4998
  const mixed = {
    type: 'setCostItem' as const,
    itemId: 'adubacao.macro',
    patch: { mode: 'valor' as const, valueBrlHa: 100, usd: { amountUsdHa: 50, boughtPct: 0.5, boughtRate: 5 } },
  }
  const eff = 0.5 * 5 + 0.5 * FX

  it('a mixed item switched to US$ keeps its US$ part and converts the R$ part', async () => {
    const { user } = await renderWithStore(<CostItemRow group="fertilizantes" itemId="adubacao.macro" />, [mixed])
    await user.click(within(row('adubacao.macro')).getByRole('radio', { name: 'US$' }))
    const it = readState().costGroups.fertilizantes.items['adubacao.macro']
    expect(it.valueBrlHa).toBe(0)
    expect(it.usd?.amountUsdHa).toBeCloseTo(100 / eff + 50, 2)
    expect(it.usd).toMatchObject({ boughtPct: 0.5, boughtRate: 5 })
  })

  it('a US$ item switched to R$ keeps the R$ part and converts the US$ part at its effective dollar', async () => {
    const { user } = await renderWithStore(<CostItemRow group="fertilizantes" itemId="adubacao.macro" />, [
      mixed,
      { type: 'setCostItem', itemId: 'adubacao.macro', patch: { valueBrlHa: 0 } },
    ])
    await user.click(within(row('adubacao.macro')).getByRole('radio', { name: 'R$' }))
    const it = readState().costGroups.fertilizantes.items['adubacao.macro']
    expect(it.usd).toBeNull()
    expect(it.valueBrlHa).toBeCloseTo(50 * eff, 2)
  })

  it('without a usable dollar the R$/US$ switch is disabled and nothing is stored', async () => {
    const { user } = await renderWithStore(<CostItemRow group="fertilizantes" itemId="adubacao.macro" />, [mixed], { fx: 0 })
    const r = row('adubacao.macro')
    const usd = within(r).getByRole('radio', { name: 'US$' })
    expect(usd).toBeDisabled()
    const before = readState().costGroups
    await user.click(usd)
    expect(readState().costGroups).toEqual(before)
    expect(within(r).getByText(/não dá para trocar a unidade/)).toBeInTheDocument()
  })

  it('without a usable farm price the R$/sc switch of Arrendamento is disabled', async () => {
    const { user } = await renderWithStore(<CostItemRow group="arrendamento" itemId="arrendamento.valor" />, [
      { type: 'setCostItem', itemId: 'arrendamento.valor', patch: { mode: 'valor', valueBrlHa: 400 } },
    ], { fx: 0 })
    const sc = within(row('arrendamento.valor')).getByRole('radio', { name: 'sc/ha' })
    expect(sc).toBeDisabled()
    await user.click(sc)
    expect(readState().costGroups.arrendamento.items['arrendamento.valor']).toMatchObject({ unit: 'ha', valueBrlHa: 400 })
  })

  it('the dollar chip shows today’s market dollar even with a clicked scenario', async () => {
    await renderWithStore(<CostItemRow group="fertilizantes" itemId="adubacao.macro" />, [
      { type: 'setCostItem', itemId: 'adubacao.macro', patch: { mode: 'valor', usd: { amountUsdHa: 10 } } },
      { type: 'applyScenario', cbotUsc: 1300, fx: 6 },
    ])
    expect(within(row('adubacao.macro')).getByTestId('fx-effective')).toHaveTextContent('do dia · 5,4998')
  })
})
