import { screen, within } from '@testing-library/react'
import type userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { soldSummary } from '../engine/sales'
import { loadState, saveState } from '../state/persist'
import { salesProductionSc } from '../state/sales'
import type { Action } from '../state/types'
import { readState, renderWithStore } from '../test/storeHarness'
import { fmtBrl, fmtNum, fmtUsd } from './format'
import { SalesSection } from './SalesPanel'

vi.setConfig({ testTimeout: 20000 })
expect.extend(toHaveNoViolations)

type User = ReturnType<typeof userEvent.setup>

async function typeInto(user: User, label: string, v: string) {
  const f = screen.getByLabelText(label)
  await user.clear(f)
  if (v !== '') await user.type(f, v)
  await user.tab()
}

const sale = (partial: Record<string, unknown>): Action => ({ type: 'addSale', partial }) as Action
const BRL = sale({ volume: 6040, volumeUnit: 'sc', price: 130, priceCurrency: 'BRL' })
const draft = () => screen.getByRole('group', { name: 'Nova venda' })
const summaryText = () => screen.getByTestId('sales-summary').textContent ?? ''
const addButton = () => screen.getByRole('button', { name: 'Adicionar venda' })
const docButton = () => screen.getByRole('button', { name: 'Vendas já realizadas' })
const doc = () => within(screen.getByRole('dialog', { name: 'Vendas já realizadas' }))

/** Opens the draft, types the volume and the price and saves it. */
async function addSale(user: User, sc: string, price: string) {
  await user.click(addButton())
  await typeInto(user, 'Sacas vendidas (nova venda)', sc)
  await typeInto(user, 'Preço por saca (nova venda)', price)
  await user.click(screen.getByRole('button', { name: 'Salvar venda' }))
}

/** Switches the draft's price currency (R$ | US$ toggle); the typed price is converted. */
async function pickCurrency(user: User, to: 'R$' | 'US$') {
  await user.click(within(draft()).getByRole('radio', { name: to }))
}

function expectedSummary() {
  const s = readState()
  return soldSummary(s.sales, salesProductionSc(s))
}

beforeEach(() => localStorage.clear())

describe('SalesSection: reportar vendas', () => {
  it('empty: says nothing was reported, with "Adicionar venda" and the saved-sales button at the top', async () => {
    await renderWithStore(<SalesSection />)
    expect(screen.getByText('Você ainda não reportou nenhuma venda.')).toBeInTheDocument()
    expect(addButton()).toBeInTheDocument()
    expect(docButton()).toHaveTextContent('0')
    expect(screen.queryByTestId('sales-summary')).toBeNull()
    expect(screen.queryByRole('radiogroup', { name: 'Modo das vendas' })).toBeNull() // no Total | Detalhar any more
  })

  it('a new sale counts in the numbers at once but is not kept until "Salvar venda"; saved, it leaves the page', async () => {
    const { user } = await renderWithStore(<SalesSection />)
    await user.click(addButton())
    expect(screen.getByLabelText('Sacas vendidas (nova venda)')).toHaveFocus()
    const save = screen.getByRole('button', { name: 'Salvar venda' })
    expect(save).toBeDisabled()
    await typeInto(user, 'Sacas vendidas (nova venda)', '10000')
    await typeInto(user, 'Preço por saca (nova venda)', '120')
    expect(save).toBeEnabled()
    // typed but not saved: it already counts while the app is open...
    expect(readState().sales).toHaveLength(1)
    expect(readState().sales[0]).toMatchObject({ volume: 10000, price: 120, saved: false })
    expect(summaryText()).toContain('(10.000 sc)')
    expect(docButton()).toHaveTextContent('0') // the document only has the saved ones
    // ...but it is not written to the browser: on the next visit it is gone
    saveState(readState())
    expect(loadState()?.sales).toEqual([])
    await user.click(save)
    expect(readState().sales).toHaveLength(1)
    expect(readState().sales[0]).toMatchObject({ volume: 10000, volumeUnit: 'sc', price: 120, priceCurrency: 'BRL' })
    expect(readState().sales[0].saved).toBeUndefined()
    saveState(readState())
    expect(loadState()?.sales).toHaveLength(1)
    expect(screen.queryByRole('group', { name: 'Nova venda' })).toBeNull() // the form is gone from the page
    expect(summaryText()).toContain('(10.000 sc)')
    expect(screen.getByText(/Fez mais alguma venda\?/)).toBeInTheDocument()
    expect(addButton()).toHaveFocus()
    expect(docButton()).toHaveTextContent('1')
  })

  it('"Remover" on a new sale takes it out of the numbers', async () => {
    const { user } = await renderWithStore(<SalesSection />)
    await user.click(addButton())
    await typeInto(user, 'Sacas vendidas (nova venda)', '500')
    await user.click(screen.getByRole('button', { name: 'Remover nova venda' }))
    expect(screen.queryByRole('group', { name: 'Nova venda' })).toBeNull()
    expect(readState().sales).toEqual([])
    expect(screen.getByText('Você ainda não reportou nenhuma venda.')).toBeInTheDocument()
  })

  it('an unsaved sale is not in the document and disappears if the app is closed; the saved ones stay', async () => {
    const { user } = await renderWithStore(<SalesSection />, [BRL])
    await addSale(user, '1000', '100') // saved
    await user.click(addButton())
    await typeInto(user, 'Sacas vendidas (nova venda)', '500')
    await typeInto(user, 'Preço por saca (nova venda)', '90')
    expect(readState().sales).toHaveLength(3)
    expect(docButton()).toHaveTextContent('2')
    await user.click(docButton())
    expect(screen.getByTestId('sales-document')).not.toHaveTextContent('500 sc')
    expect(doc().getAllByRole('listitem')).toHaveLength(2)
    saveState(readState())
    expect(loadState()?.sales?.map((t) => t.volume)).toEqual([6040, 1000])
  })

  it('saves a sale in R$ and one in US$ (dollar open, then fixed); the summary equals soldSummary', async () => {
    const { user } = await renderWithStore(<SalesSection />)
    await addSale(user, '10000', '120')
    await user.click(addButton())
    // sacks only, R$ by default, no dollar controls
    expect(within(draft()).queryByRole('button', { name: /Trocar unidade/ })).toBeNull()
    expect(within(draft()).getByRole('radio', { name: 'R$' })).toBeChecked()
    expect(within(draft()).queryByRole('radio', { name: 'Câmbio aberto' })).toBeNull()
    await pickCurrency(user, 'US$')
    await typeInto(user, 'Sacas vendidas (nova venda)', '5000')
    await typeInto(user, 'Preço por saca (nova venda)', '27,36')
    // US$ starts with the dollar open: the market dollar counts, so the sale is valid and exposed
    expect(within(draft()).getByRole('radio', { name: 'Câmbio aberto' })).toBeChecked()
    expect(within(draft()).getByTestId('fx-effective')).toHaveTextContent('do dia · 5,4998')
    expect(draft()).toHaveTextContent('segue o dólar de mercado')
    await user.click(within(draft()).getByRole('radio', { name: 'Câmbio fixado' }))
    await typeInto(user, 'A que dólar (nova venda)', '5,40')
    expect(within(draft()).getByTestId('fx-effective')).toHaveTextContent('travado · 5,4000')
    expect(readState().sales[1].saved).toBe(false) // counting, not kept yet
    await user.click(screen.getByRole('button', { name: 'Salvar venda' }))
    expect(readState().sales[1]).toMatchObject({ priceCurrency: 'USD', dollar: 5.4, volume: 5000 })
    const sum = expectedSummary()
    expect(sum.validTranches).toHaveLength(2)
    expect(sum.soldSc).toBe(15000)
    expect(summaryText()).toBe(
      `Vendido ${fmtNum(sum.soldPct * 100, 1)}% (${fmtNum(sum.soldSc, 0)} sc) · preço médio ${fmtBrl(sum.avgPriceBrl)}/sc`,
    )
    // weighted by hand: (10.000 × 120 + 5.000 × 27,36 × 5,40) / 15.000
    expect(sum.avgPriceBrl).toBeCloseTo((10000 * 120 + 5000 * 27.36 * 5.4) / 15000, 6)
    // the store follows: the effective sold share and price feed the engine
    expect(readState().inputs.soldPct).toBeCloseTo(sum.soldPct, 10)
    expect(readState().inputs.soldAvgPriceBrl).toBeCloseTo(sum.avgPriceBrl!, 10)
    expect(document.body.textContent).not.toMatch(/NaN|Infinity|undefined/)
  })

  it('"Câmbio aberto" goes back to the market dollar; a fixed rate of 0 or less is refused in Portuguese', async () => {
    const { user } = await renderWithStore(<SalesSection />)
    await user.click(addButton())
    await pickCurrency(user, 'US$')
    await typeInto(user, 'Sacas vendidas (nova venda)', '1000')
    await typeInto(user, 'Preço por saca (nova venda)', '20')
    await user.click(within(draft()).getByRole('radio', { name: 'Câmbio fixado' }))
    await typeInto(user, 'A que dólar (nova venda)', '5,2')
    await user.click(within(draft()).getByRole('radio', { name: 'Câmbio aberto' }))
    expect(within(draft()).queryByRole('alert')).toBeNull()
    await user.click(within(draft()).getByRole('radio', { name: 'Câmbio fixado' }))
    await typeInto(user, 'A que dólar (nova venda)', '-1')
    expect(within(draft()).getByText('O dólar deve ser maior que zero.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Salvar venda' }))
    expect(readState().sales[0].dollar).toBeNull() // open: the market dollar
    expect(readState().sales[0].marketDollar).toBeCloseTo(5.4998, 6)
  })

  it('never lets the sales pass the production: the typed excess is refused, 100% says so, and the sale can be removed', async () => {
    const { user } = await renderWithStore(<SalesSection />)
    const production = salesProductionSc(readState())!
    expect(production).toBeGreaterThan(0)
    await user.click(addButton())
    await typeInto(user, 'Sacas vendidas (nova venda)', String(Math.ceil(production) + 1000))
    expect(screen.getByText(/Não dá para vender mais que a produção/)).toBeInTheDocument()
    await typeInto(user, 'Sacas vendidas (nova venda)', String(Math.floor(production)))
    await typeInto(user, 'Preço por saca (nova venda)', '100')
    await user.click(screen.getByRole('button', { name: 'Salvar venda' }))
    expect(readState().sales.reduce((n, t) => n + t.volume, 0)).toBeLessThanOrEqual(production + 1e-6)
    expect(screen.queryByTestId('sales-over')).toBeNull()
    expect(screen.getByTestId('sales-full')).toHaveTextContent('100% da produção vendida')
    expect(summaryText()).toContain('Vendido 100,0%')
    // removing it, from the document of the saved sales
    await user.click(docButton())
    await user.click(doc().getByRole('button', { name: 'Remover venda 1' }))
    await user.click(doc().getByRole('button', { name: 'Confirmar a remoção da venda 1' }))
    expect(readState().sales).toEqual([])
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('sales-full')).toBeNull()
    expect(screen.getByText('Você ainda não reportou nenhuma venda.')).toBeInTheDocument()
  })

  it('a second sale only has what the saved ones left', async () => {
    const { user } = await renderWithStore(<SalesSection />, [
      { type: 'setInput', key: 'areaHa', value: 100 },
      { type: 'setInput', key: 'yieldScHa', value: 60 },
      sale({ volume: 5000, volumeUnit: 'sc', price: 100 }),
    ])
    await user.click(addButton())
    await typeInto(user, 'Sacas vendidas (nova venda)', '2000')
    expect(screen.getByText(/restam 1\.000 sc/)).toBeInTheDocument()
    await typeInto(user, 'Sacas vendidas (nova venda)', '1000')
    await typeInto(user, 'Preço por saca (nova venda)', '100')
    await user.click(screen.getByRole('button', { name: 'Salvar venda' }))
    expect(readState().sales[1].volume).toBe(1000)
    expect(screen.getByTestId('sales-full')).toBeInTheDocument()
  })

  it('without production (default start, no area × yield) asks for them instead of the over-production warning', async () => {
    const { user } = await renderWithStore(<SalesSection />, [], { base: [] })
    expect(salesProductionSc(readState()) ?? 0).toBe(0)
    await addSale(user, '1000', '100')
    expect(screen.queryByTestId('sales-over')).toBeNull()
    expect(screen.getByTestId('sales-no-production')).toHaveTextContent(
      'Informe área e produtividade para calcular o % vendido.',
    )
  })

  it('a new sale shows "Informe um volume maior que zero." only after its volume was edited or blurred', async () => {
    const { user } = await renderWithStore(<SalesSection />)
    await user.click(addButton())
    expect(screen.getByLabelText('Sacas vendidas (nova venda)')).toHaveFocus()
    expect(draft()).not.toHaveTextContent('Informe um volume maior que zero.')
    await user.tab()
    expect(draft()).toHaveTextContent('Informe um volume maior que zero.')
  })

  it('the summary follows the currency toggle (US$ with the scenario dollar)', async () => {
    const { user } = await renderWithStore(<SalesSection />, [{ type: 'setCurrency', currency: 'USD' }])
    await addSale(user, '1000', '110')
    const sum = expectedSummary()
    expect(summaryText()).toContain(`preço médio ${fmtUsd(sum.avgPriceBrl! / 5.4998)}/sc`)
    expect(summaryText()).not.toContain('R$')
  })

  it('the price converts between R$ and US$ (sale dollar, else the market dollar); the market dollar is kept', async () => {
    const { user } = await renderWithStore(<SalesSection />)
    await user.click(addButton())
    await typeInto(user, 'Sacas vendidas (nova venda)', '10000')
    // no sale dollar yet: the market dollar (5,4998) converts the price
    await typeInto(user, 'Preço por saca (nova venda)', '110')
    await pickCurrency(user, 'US$')
    expect(screen.getByLabelText('Preço por saca (nova venda)')).toHaveValue('20')
    // with the sale's own dollar typed, that one converts back
    await user.click(within(draft()).getByRole('radio', { name: 'Câmbio fixado' }))
    await typeInto(user, 'A que dólar (nova venda)', '5,00')
    await pickCurrency(user, 'R$')
    await user.click(screen.getByRole('button', { name: 'Salvar venda' }))
    expect(readState().sales[0]).toMatchObject({ priceCurrency: 'BRL', volumeUnit: 'sc', volume: 10000 })
    expect(readState().sales[0].price).toBeCloseTo((110 / 5.4998) * 5, 6)
  })

  it('has no axe violations: empty, a US$ draft (open and fixed) and the document of saved sales', async () => {
    const { user, container } = await renderWithStore(<SalesSection />)
    const check = () => axe(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(await check()).toHaveNoViolations()
    await user.click(addButton())
    await pickCurrency(user, 'US$')
    expect(await check()).toHaveNoViolations()
    await user.click(within(draft()).getByRole('radio', { name: 'Câmbio fixado' }))
    expect(await check()).toHaveNoViolations()
    await user.click(screen.getByRole('button', { name: 'Remover nova venda' }))
    await addSale(user, '1000', '100')
    await user.click(docButton())
    expect(await check()).toHaveNoViolations()
    await user.click(doc().getByRole('button', { name: 'Editar venda 1' }))
    expect(await check()).toHaveNoViolations()
  })
})

describe('SalesSection: Vendas já realizadas (documento por cima)', () => {
  it('lists every saved sale, with the dollar of the US$ ones, and closes with Esc giving the focus back', async () => {
    const { user } = await renderWithStore(<SalesSection />, [
      BRL,
      sale({ volume: 5000, volumeUnit: 'sc', price: 25, priceCurrency: 'USD', dollar: 5.4 }),
      sale({ volume: 1000, volumeUnit: 'sc', price: 20, priceCurrency: 'USD', marketDollar: 5.4998 }),
    ])
    // the page itself only has the summary: the sales live in the document
    expect(screen.queryByLabelText(/^Sacas vendidas/)).toBeNull()
    expect(docButton()).toHaveTextContent('3')
    await user.click(docButton())
    const d = screen.getByTestId('sales-document')
    expect(within(d).getByRole('heading', { name: 'Vendas já realizadas' })).toBeInTheDocument()
    expect(d).toHaveTextContent('6.040 sc a R$ 130,00/sc')
    expect(d).toHaveTextContent('5.000 sc a US$ 25,00/sc')
    expect(d).toHaveTextContent('dólar fixado a R$ 5,4000')
    expect(d).toHaveTextContent('1.000 sc a US$ 20,00/sc')
    expect(d).toHaveTextContent('dólar aberto')
    expect(within(d).getByTestId('sales-summary')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('sales-document')).toBeNull()
    expect(docButton()).toHaveFocus()
  })

  it('editing needs "Salvar alterações": cancelling keeps the sale, saving writes it', async () => {
    const { user } = await renderWithStore(<SalesSection />, [BRL])
    await user.click(docButton())
    await user.click(doc().getByRole('button', { name: 'Editar venda 1' }))
    expect(screen.getByLabelText('Sacas vendidas (venda 1)')).toHaveValue('6.040')
    await typeInto(user, 'Sacas vendidas (venda 1)', '3000')
    expect(readState().sales[0].volume).toBe(6040) // typed, not saved
    await user.click(doc().getByRole('button', { name: 'Cancelar a edição da venda 1' }))
    expect(readState().sales[0].volume).toBe(6040)
    expect(screen.getByTestId('sales-document')).toHaveTextContent('6.040 sc a R$ 130,00/sc')
    await user.click(doc().getByRole('button', { name: 'Editar venda 1' }))
    await typeInto(user, 'Preço por saca (venda 1)', '135')
    await user.click(doc().getByRole('button', { name: 'Salvar alterações' }))
    expect(readState().sales).toHaveLength(1)
    expect(readState().sales[0]).toMatchObject({ volume: 6040, price: 135 })
    expect(screen.getByTestId('sales-document')).toHaveTextContent('6.040 sc a R$ 135,00/sc')
    expect(screen.queryByRole('group', { name: 'Venda 1' })).toBeNull() // back to the line
  })

  it('a sale saved in toneladas shows its sacks when edited; saving writes sacks (sc)', async () => {
    const { user } = await renderWithStore(<SalesSection />, [
      sale({ volume: 600, volumeUnit: 't', price: 100, priceCurrency: 'BRL' }),
    ])
    await user.click(docButton())
    await user.click(doc().getByRole('button', { name: 'Editar venda 1' }))
    expect(screen.getByLabelText('Sacas vendidas (venda 1)')).toHaveValue('10.000')
    expect(readState().sales[0]).toMatchObject({ volume: 600, volumeUnit: 't' }) // not rewritten by looking
    await typeInto(user, 'Sacas vendidas (venda 1)', '12000')
    await user.click(doc().getByRole('button', { name: 'Salvar alterações' }))
    expect(readState().sales[0]).toMatchObject({ volume: 12000, volumeUnit: 'sc' })
  })

  it('removing asks for a confirmation on the same line; "Não" keeps the sale', async () => {
    const { user } = await renderWithStore(<SalesSection />, [BRL])
    await user.click(docButton())
    await user.click(doc().getByRole('button', { name: 'Remover venda 1' }))
    expect(screen.getByTestId('sales-document')).toHaveTextContent('Remover esta venda?')
    await user.click(doc().getByRole('button', { name: 'Manter a venda 1' }))
    expect(readState().sales).toHaveLength(1)
    await user.click(doc().getByRole('button', { name: 'Remover venda 1' }))
    await user.click(doc().getByRole('button', { name: 'Confirmar a remoção da venda 1' }))
    expect(readState().sales).toEqual([])
    expect(screen.getByTestId('sales-document')).toHaveTextContent('Nenhuma venda salva')
  })
})
