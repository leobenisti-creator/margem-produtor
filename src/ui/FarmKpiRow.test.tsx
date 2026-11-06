import { screen, within } from '@testing-library/react'
import { mockMatchMedia } from '../test/helpers'
import { CROPS } from '../engine/crops'
import { scenarioBasisUsc } from '../state/basis'
import { readState, renderWithStore } from '../test/storeHarness'
import type { Action } from '../state/types'
import { CostUnitProvider } from './costUnit'
import { CustoCard } from './CustoCard'
import { FarmKpiRow } from './FarmKpiRow'

vi.setConfig({ testTimeout: 20000 })

beforeEach(() => {
  localStorage.clear()
  mockMatchMedia(true)
})

const FARM: Action[] = [
  { type: 'setInput', key: 'areaHa', value: 1000 },
  { type: 'setInput', key: 'yieldScHa', value: 60 },
]

describe('FarmKpiRow (Lavoura e custos)', () => {
  it('shows what is open, the total cost per sack and per ha, the biggest cost and the basis with the farm price', async () => {
    await renderWithStore(<FarmKpiRow />, [...FARM, { type: 'setCostMode', mode: 'categorias' }])
    expect(screen.getByTestId('farm-aberto')).toHaveTextContent('Dólar em aberto')
    expect(screen.queryByText(/Produção da safra/)).toBeNull()
    const custo = screen.getByTestId('farm-custo')
    expect(custo).toHaveTextContent('Custo total')
    expect(custo).toHaveTextContent('por saca')
    expect(custo).toHaveTextContent('/ha')
    const maior = screen.getByTestId('farm-maior')
    expect(maior).toHaveTextContent(/\d+% do custo total/)
    expect(maior).toHaveTextContent('/sc')
    expect(screen.getByTestId('farm-basis')).toHaveTextContent('Basis')
    expect(screen.getByTestId('farm-preco')).toHaveTextContent(/Preço na fazenda R\$ [\d.]+,\d\d \/sc/)
  })

  it('per saca = cost per ha ÷ yield (no margin card here)', async () => {
    await renderWithStore(<FarmKpiRow />, [...FARM, { type: 'setInput', key: 'costPerHaBrl', value: 6000 }])
    expect(screen.getByTestId('farm-custo')).toHaveTextContent('R$ 100,00')
    expect(screen.getByTestId('farm-custo')).toHaveTextContent('R$ 6.000,00 /ha')
    expect(screen.queryByText(/Margem bruta/)).toBeNull()
  })

  it('the biggest cost follows the producer: an opened category counts as the sum of its items', async () => {
    await renderWithStore(<FarmKpiRow />, [
      ...FARM,
      { type: 'setCostMode', mode: 'categorias' },
      { type: 'setCostItem', itemId: 'defensivos.herbicida', patch: { mode: 'valor', valueBrlHa: 9000 } },
    ])
    expect(screen.getByTestId('farm-maior')).toHaveTextContent('Defensivos')
    expect(screen.getByTestId('farm-maior')).not.toHaveTextContent('média da região')
  })

  it('single total: there is no split of the producer, so no biggest cost and no regional reference', async () => {
    await renderWithStore(<FarmKpiRow />, FARM)
    expect(screen.getByTestId('farm-maior')).toHaveTextContent('detalhe o custo por categoria')
    expect(screen.getByTestId('farm-maior')).not.toHaveTextContent('média da região')
  })

  it('nothing typed: the card asks for the cost', async () => {
    await renderWithStore(<FarmKpiRow />, [], { base: [] })
    expect(screen.getByTestId('farm-maior')).toHaveTextContent('informe o custo')
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/)
  })

  it('without a yield the dashes appear, never NaN', async () => {
    await renderWithStore(<FarmKpiRow />, [{ type: 'setInput', key: 'yieldScHa', value: 0 }])
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/)
  })

  it('the big number of the last card is the basis = farm price − CBOT price, the farm price sits smaller below', async () => {
    await renderWithStore(<FarmKpiRow />, FARM)
    const st = readState()
    const crop = CROPS[st.crop]
    const fx = st.overrides.fx ?? 5.4998
    const premium = scenarioBasisUsc(st)
    const expected =
      (premium / 100) * crop.bushelsPerSack * fx - st.inputs.freightBrlPerSc - st.inputs.portFeesBrlPerSc
    const shown = screen.getByTestId('farm-basis-value').textContent ?? ''
    const num = Number(shown.replace('−', '-').replace(/[^\d,-]/g, '').replace(',', '.'))
    expect(num).toBeCloseTo(expected, 1)
    expect(screen.getByTestId('farm-basis')).toHaveTextContent(/US¢\/bu/)
    expect(screen.getByTestId('farm-basis')).toHaveTextContent('por saca')
  })

  it('writes a negative basis with the real minus sign before the symbol (−R$ 3,63), never "R$ -3,63"', async () => {
    await renderWithStore(<FarmKpiRow />, FARM)
    const shown = screen.getByTestId('farm-basis-value').textContent ?? ''
    expect(shown).not.toMatch(/R\$ -/)
    if (shown.includes('−')) expect(shown.startsWith('−R$')).toBe(true)
  })

  it('without a usable dollar the basis is a dash, never NaN', async () => {
    await renderWithStore(<FarmKpiRow />, FARM, { fx: 0 })
    expect(screen.getByTestId('farm-basis-value')).toHaveTextContent('—')
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/)
  })
})

describe('FarmKpiRow: maior custo back on the single total', () => {
  it('keeps the producer’s own split after switching to Total, and drops it when a total is typed', async () => {
    const { user } = await renderWithStore(<CostUnitProvider><FarmKpiRow /><CustoCard /></CostUnitProvider>, [
      ...FARM,
      { type: 'setCostMode', mode: 'categorias' },
      { type: 'setCostItem', itemId: 'defensivos.herbicida', patch: { mode: 'valor', valueBrlHa: 9000 } },
    ])
    await user.click(screen.getByRole('radio', { name: 'Total' }))
    expect(screen.getByTestId('farm-maior')).toHaveTextContent('Defensivos')
    expect(screen.getByTestId('farm-maior')).not.toHaveTextContent('média da região')
    const field = screen.getByRole('textbox', { name: 'Custo por hectare' })
    await user.clear(field)
    await user.type(field, '5000')
    await user.tab()
    expect(screen.getByTestId('farm-maior')).toHaveTextContent('detalhe o custo por categoria')
  })
})

describe('FarmKpiRow: card do que está em aberto', () => {
  const open = (extra: Action[] = []) =>
    renderWithStore(<FarmKpiRow />, [...FARM, { type: 'setCostMode', mode: 'categorias' }, ...extra])
  const usd = (pct: number, rate: number): Action => ({
    type: 'setGroupTotal',
    group: 'sementes',
    value: { usd: { amountUsdHa: 100, boughtPct: pct, boughtRate: rate } },
  })

  it('nothing in US$ and nothing budgeted: says so, in plain words', async () => {
    await open()
    expect(screen.getByTestId('aberto-dolar')).toHaveTextContent('Nada em aberto no dólar')
    expect(screen.getByTestId('aberto-orcado')).toHaveTextContent('Nenhum custo orçado')
  })

  it('a US$ cost with the dollar open: its share of the cost and the absolute amount per ha and on the area', async () => {
    await open([usd(0, 0)])
    const box = screen.getByTestId('aberto-dolar')
    // 100 US$/ha at the market dollar is R$ ~550/ha of ~R$ 6.5k
    expect(box).toHaveTextContent(/^Dólar em aberto\d+(,\d)?%R\$ [\d.,]+\/ha/)
    expect(box).toHaveTextContent(/R\$ [\d,.]+ mil na safra/)
    expect(box).not.toHaveTextContent('Nada em aberto')
  })

  it('US$ costs all fixed: "Todos os custos em dólar estão fechados"', async () => {
    await open([usd(1, 5)])
    expect(screen.getByTestId('aberto-dolar')).toHaveTextContent('Todos os custos em dólar estão fechados')
  })

  it('a partly fixed cost counts only its open part', async () => {
    await open([usd(0.5, 5)])
    // 50 US$ open × 5,4998 ≈ R$ 275/ha
    expect(screen.getByTestId('aberto-dolar')).toHaveTextContent(/R\$ 27\d,\d\d\/ha/)
  })

  it('budgeted costs: their share and amount; unmarking them brings the plain message back', async () => {
    const { user } = await renderWithStore(
      <CostUnitProvider>
        <FarmKpiRow />
        <CustoCard />
      </CostUnitProvider>,
      [...FARM, { type: 'setCostMode', mode: 'categorias' }, { type: 'setGroupTotal', group: 'sementes', value: { totalBrlHa: 1000 } }],
    )
    await user.click(within(screen.getByTestId('group-sementes')).getByRole('radio', { name: 'Orçado' }))
    const box = screen.getByTestId('aberto-orcado')
    expect(box).toHaveTextContent(/^Orçado\d+(,\d)?%R\$ 1\.000,00\/ha/)
    expect(box).toHaveTextContent(/R\$ 1,00 mi na safra/)
    await user.click(within(screen.getByTestId('group-sementes')).getByRole('radio', { name: 'Realizado' }))
    expect(screen.getByTestId('aberto-orcado')).toHaveTextContent('Nenhum custo orçado')
  })

  it('on the single Total the cost is frozen in R$: no dollar is open there, and nothing is budgeted', async () => {
    await renderWithStore(<FarmKpiRow />, FARM)
    expect(screen.getByTestId('aberto-dolar')).toHaveTextContent('Nada em aberto no dólar')
    expect(screen.getByTestId('aberto-orcado')).toHaveTextContent('Nenhum custo orçado')
  })
})
