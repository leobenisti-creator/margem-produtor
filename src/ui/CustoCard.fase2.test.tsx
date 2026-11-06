import { act, screen, within } from '@testing-library/react'
import { mockMatchMedia } from '../test/helpers'
import { readState, renderWithStore } from '../test/storeHarness'
import type { Action } from '../state/types'
import { CostSummary } from './CostSummary'
import { CostUnitProvider } from './costUnit'
import { CustoCard } from './CustoCard'

vi.setConfig({ testTimeout: 20000 })

const FX = 5.4998 // the market dollar of the test snapshot
const CATS: Action[] = [
  { type: 'setInput', key: 'yieldScHa', value: 60 },
  { type: 'setCostMode', mode: 'categorias' },
]

async function open(actions: Action[] = CATS) {
  const { user } = await renderWithStore(
    <CostUnitProvider>
      <CustoCard />
      <CostSummary />
    </CostUnitProvider>,
    actions,
  )
  return user
}

const group = (id: string) => screen.getByTestId(`group-${id}`)

beforeEach(() => {
  localStorage.clear()
  mockMatchMedia(true)
})

describe('Custo: moeda e câmbio por grupo', () => {
  it('a group starts in R$; switching to US$ converts at the market dollar and starts open (exposed)', async () => {
    const user = await open([...CATS, { type: 'setGroupTotal', group: 'sementes', value: { totalBrlHa: 550 } }])
    const g = group('sementes')
    expect(within(g).getByRole('radio', { name: 'R$' })).toBeChecked()
    await user.click(within(g).getByRole('radio', { name: 'US$' }))
    const st = readState().costGroups.sementes
    expect(st.totalUsd?.amountUsdHa).toBeCloseTo(550 / FX, 1)
    expect(st.totalUsd).toMatchObject({ boughtPct: 0, boughtRate: 0 })
    expect(within(g).getByTestId('fx-effective')).toHaveTextContent('do dia')
    expect(within(g).getByText(/exposto ao dólar/)).toBeInTheDocument()
    expect(readState().inputs.costUsd).toHaveLength(1)
  })

  it('fixing the dollar needs the rate; typing it stores 100% at that rate, and R$ comes back at the fixed dollar', async () => {
    const user = await open([
      ...CATS,
      { type: 'setGroupTotal', group: 'sementes', value: { usd: { amountUsdHa: 100, boughtPct: 0, boughtRate: 0 } } },
    ])
    const g = group('sementes')
    await user.click(within(g).getByRole('radio', { name: 'Câmbio fixado' }))
    expect(readState().costGroups.sementes.totalUsd).toMatchObject({ boughtPct: 0 })
    expect(within(g).getByText(/Informe a que dólar foi fixado/)).toBeInTheDocument()
    const rate = within(g).getByLabelText('A que dólar (Sementes)')
    await user.type(rate, '5,2')
    await user.tab()
    expect(readState().costGroups.sementes.totalUsd).toMatchObject({ amountUsdHa: 100, boughtPct: 1, boughtRate: 5.2 })
    expect(within(g).getByTestId('fx-effective')).toHaveTextContent('travado')
    await user.click(within(g).getByRole('radio', { name: 'R$' }))
    expect(readState().costGroups.sementes.totalUsd).toBeNull()
    expect(readState().costGroups.sementes.totalBrlHa).toBeCloseTo(520, 1)
  })

  it('"Editar câmbio" opens the partial split; "Câmbio aberto" resets it', async () => {
    const user = await open([
      ...CATS,
      { type: 'setGroupTotal', group: 'sementes', value: { usd: { amountUsdHa: 100, boughtPct: 0, boughtRate: 0 } } },
    ])
    const g = group('sementes')
    await user.click(within(g).getByRole('button', { name: 'Editar câmbio' }))
    const pct = within(g).getByLabelText('Já fixado (Sementes)')
    await user.clear(pct)
    await user.type(pct, '40')
    await user.tab()
    const rate = within(g).getByLabelText('A que dólar fixou (Sementes)')
    await user.clear(rate)
    await user.type(rate, '5')
    await user.tab()
    expect(readState().costGroups.sementes.totalUsd).toMatchObject({ boughtPct: 0.4, boughtRate: 5 })
    await user.click(within(g).getByRole('radio', { name: 'Câmbio aberto' }))
    expect(readState().costGroups.sementes.totalUsd).toMatchObject({ boughtPct: 0, boughtRate: 0 })
  })

  it('the cost unit button still applies to a US$ group (US$/t)', async () => {
    const user = await open([
      ...CATS,
      { type: 'setGroupTotal', group: 'sementes', value: { usd: { amountUsdHa: 360, boughtPct: 0, boughtRate: 0 } } },
    ])
    await user.click(screen.getAllByRole('button', { name: 'Trocar unidade (R$/ha)' })[0])
    await user.click(screen.getByRole('menuitem', { name: 'Mudar para R$/t' }))
    expect(within(group('sementes')).getByRole('textbox', { name: 'Sementes' })).toHaveValue('100')
    expect(readState().costGroups.sementes.totalUsd?.amountUsdHa).toBe(360)
  })
})

describe('Custo: orçado × realizado', () => {
  it('defaults to realizado; switching a group marks it budgeted and shows the share', async () => {
    const user = await open()
    expect(screen.queryByTestId('budget-share')).toBeNull()
    const g = group('sementes')
    expect(within(g).getByRole('radio', { name: 'Realizado' })).toBeChecked()
    await user.click(within(g).getByRole('radio', { name: 'Orçado' }))
    expect(readState().costGroups.sementes.budgeted).toBe(true)
    const share = screen.getByTestId('budget-share')
    expect(share).toHaveTextContent(/% orçado/)
    expect(share).toHaveTextContent(/% realizado/)
    await user.click(within(g).getByRole('radio', { name: 'Realizado' }))
    expect(readState().costGroups.sementes.budgeted).toBeUndefined()
    expect(screen.queryByTestId('budget-share')).toBeNull()
  })

  it('an item typed by the producer can be budgeted; an item not used has no switch', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: 'Abrir Defensivos' }))
    await user.click(screen.getByRole('button', { name: 'some pelos itens' }))
    const herb = screen.getByTestId('item-defensivos.herbicida')
    expect(within(herb).queryByRole('radiogroup', { name: /Situação de/ })).toBeNull()
    await user.click(within(herb).getByRole('radio', { name: 'meu valor' }))
    const field = within(herb).getByLabelText('Valor de Herbicidas')
    await user.clear(field)
    await user.type(field, '500')
    await user.tab()
    await user.click(within(herb).getByRole('radio', { name: 'Orçado' }))
    expect(readState().costGroups.defensivos.items['defensivos.herbicida'].budgeted).toBe(true)
    expect(screen.getByTestId('budget-share')).toBeInTheDocument()
  })
})

describe('Custo: total e pizza', () => {
  it('shows the whole cost and a legend with the filled slices (percent and value)', async () => {
    await open()
    const box = screen.getByTestId('cost-summary')
    expect(within(box).getByTestId('cost-donut-total')).toHaveTextContent(/R\$/)
    const legend = within(box).getByTestId('cost-legend')
    expect(legend.querySelectorAll('li').length).toBeGreaterThanOrEqual(4)
    expect(legend).toHaveTextContent('%')
    expect(within(box).getByTestId('cost-donut')).toHaveAccessibleName(/Divisão do custo/)
  })

  it('items opened inside a category are NOT slices nor legend rows of the chart; only the category is', async () => {
    const user = await open([
      ...CATS,
      { type: 'setCostItem', itemId: 'defensivos.herbicida', patch: { mode: 'valor', valueBrlHa: 900 } },
    ])
    expect(screen.getByTestId('slice-defensivos')).toBeInTheDocument()
    expect(screen.queryByTestId('slice-defensivos.herbicida')).toBeNull()
    const legend = screen.getByTestId('cost-legend')
    expect(legend).toHaveTextContent('Defensivos')
    expect(legend).not.toHaveTextContent(/Herbicidas|Fungicidas|Inseticidas/)
    expect(legend.querySelectorAll('li').length).toBeLessThanOrEqual(8)
    expect(screen.queryByRole('button', { name: /Ver todos/ })).toBeNull()
    // they only show up inside the category's card
    await user.hover(screen.getByTestId('slice-defensivos'))
    expect(screen.getByTestId('cost-tooltip')).toHaveTextContent('Herbicidas')
  })

  it('is hidden in the single-total mode', async () => {
    await open([{ type: 'setInput', key: 'yieldScHa', value: 60 }])
    expect(screen.queryByTestId('cost-summary')).toBeNull()
  })
})

describe('Custo: grupos em modo itens ficam alinhados com os demais', () => {
  it('every group shows the currency and situation switches; a group opened into items has them disabled', async () => {
    await open([...CATS, { type: 'setCostGroupMode', group: 'sementes', mode: 'itens' }])
    for (const id of ['sementes', 'fertilizantes', 'defensivos', 'operacoes', 'maoDeObra', 'arrendamento', 'financeiro', 'outros']) {
      const g = group(id)
      expect(within(g).getAllByRole('radiogroup', { name: /^Moeda de / }).length).toBeGreaterThanOrEqual(1)
      expect(within(g).getAllByRole('radiogroup', { name: /^Situação de / }).length).toBeGreaterThanOrEqual(1)
    }
    const sem = group('sementes')
    expect(within(sem).getByRole('radio', { name: 'US$' })).toBeDisabled()
    expect(within(sem).getByRole('radio', { name: 'R$' })).not.toBeChecked()
    expect(within(sem).getByRole('radio', { name: 'Orçado' })).toBeDisabled()
    expect(within(group('fertilizantes')).getByRole('radio', { name: 'US$' })).toBeEnabled()
  })
})

describe('Custo: o gráfico é um card à parte', () => {
  it('the cost card itself holds no chart; the chart card exists only in "Por categoria"', async () => {
    await renderWithStore(<CustoCard />, CATS)
    expect(screen.queryByTestId('cost-summary')).toBeNull()
    expect(screen.queryByTestId('cost-legend')).toBeNull()
  })
})

describe('Custo: aviso de dólar em aberto no card do gráfico', () => {
  it('nothing about currency by default; only a cost with the dollar open shows the share, and fixing it hides the notice', async () => {
    const user = await open()
    expect(screen.queryByTestId('currency-mix')).toBeNull()
    expect(screen.queryByTestId('open-dollar')).toBeNull()
    expect(document.body.textContent).not.toMatch(/Todo o custo está em R\$/)
    await user.click(within(group('sementes')).getByRole('radio', { name: 'US$' }))
    const note = screen.getByTestId('open-dollar')
    expect(note).toHaveTextContent(/% do seu custo está com o dólar em aberto/)
    expect(note).not.toHaveTextContent(/em R\$|fixado/)
    await user.click(within(group('sementes')).getByRole('radio', { name: 'Câmbio fixado' }))
    await user.type(within(group('sementes')).getByLabelText('A que dólar (Sementes)'), '5,2')
    await user.tab()
    expect(screen.queryByTestId('open-dollar')).toBeNull()
  })

  it('a partly fixed cost counts only its open part', async () => {
    await open([
      ...CATS,
      { type: 'setGroupTotal', group: 'sementes', value: { usd: { amountUsdHa: 100, boughtPct: 0.5, boughtRate: 5 } } },
    ])
    // open part = 50 US$ × 5,4998 ≈ R$ 275 of the ~R$ 6.5k cost: about 4%
    expect(screen.getByTestId('open-dollar')).toHaveTextContent(/^\s*4[,.]\d%/)
  })
})

describe('Custo: gráfico grande com porcentagem e cartão ao passar o mouse', () => {
  it('prints the percentage inside each slice and the legend comes below the chart', async () => {
    await open()
    const donut = screen.getByTestId('cost-donut')
    const sem = screen.getByTestId('slice-pct-sementes')
    expect(sem.textContent).toMatch(/^\d+(,\d)?%$/)
    expect(donut.contains(sem)).toBe(true)
    // legend follows the donut in the document
    const legend = screen.getByTestId('cost-legend')
    expect(donut.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // the ring is large: it fills the card width up to a generous cap
    expect(donut.closest('div')?.className).toMatch(/max-w-\[420px\]/)
  })

  it('hovering a slice of a category kept as one total shows its cost per sack, per ha and share of the total; leaving hides it', async () => {
    const user = await open()
    expect(screen.queryByTestId('cost-tooltip')).toBeNull()
    await user.hover(screen.getByTestId('slice-sementes'))
    const tip = screen.getByTestId('cost-tooltip')
    expect(tip).toHaveTextContent('Sementes')
    expect(tip).toHaveTextContent(/R\$ [\d.,]+\/sc/)
    expect(tip).toHaveTextContent(/R\$ [\d.,]+\/ha/)
    expect(tip).toHaveTextContent(/\d+,\d% do custo total/)
    expect(tip).toHaveTextContent('Abra a categoria')
    // it floats above everything: rendered in the body, outside the card
    expect(screen.getByTestId('cost-summary').contains(tip)).toBe(false)
    await user.unhover(screen.getByTestId('slice-sementes'))
    await user.unhover(screen.getByTestId('cost-donut'))
    expect(screen.queryByTestId('cost-tooltip')).toBeNull()
  })

  it('an opened category lists all its items with the share of the category and of the total, by hovering the category', async () => {
    const user = await open([
      ...CATS,
      { type: 'setCostItem', itemId: 'defensivos.herbicida', patch: { mode: 'valor', valueBrlHa: 900 } },
      { type: 'setCostItem', itemId: 'defensivos.fungicida', patch: { mode: 'valor', valueBrlHa: 600 } },
    ])
    await user.hover(screen.getByTestId('slice-defensivos'))
    const tip = screen.getByTestId('cost-tooltip')
    expect(tip).toHaveTextContent('Defensivos')
    expect(tip).toHaveTextContent('Itens da categoria')
    expect(tip).toHaveTextContent('Herbicidas')
    expect(tip).toHaveTextContent('Fungicidas')
    expect(tip).toHaveTextContent('da cat.')
    expect(tip).toHaveTextContent('do total')
    const rows = within(tip).getAllByRole('listitem')
    expect(rows.length).toBeGreaterThanOrEqual(2)
    // 900 of (900 + 600 + the rest of the group at the regional average): each row prints two percentages
    for (const r of rows) expect(r.textContent).toMatch(/\d+%.*\d+,\d%/)
    // moving to another category shows that one instead
    await user.hover(screen.getByTestId('slice-sementes'))
    expect(screen.getByTestId('cost-tooltip')).toHaveTextContent('Sementes')
    expect(screen.getByTestId('cost-tooltip')).not.toHaveTextContent('Herbicidas')
  })

  it('keyboard: a slice is focusable, names its share and cost, and focusing it shows the card', async () => {
    await open()
    const slice = screen.getByTestId('slice-sementes')
    expect(slice).toHaveAttribute('tabindex', '0')
    expect(slice).toHaveAccessibleName(/Sementes: \d+,\d% do custo total, R\$ [\d.,]+\/sc/)
    act(() => slice.focus())
    expect(await screen.findByTestId('cost-tooltip')).toHaveTextContent('Sementes')
    act(() => slice.blur())
    expect(screen.queryByTestId('cost-tooltip')).toBeNull()
  })

  it('hovering a legend row shows the same card', async () => {
    const user = await open()
    const row = within(screen.getByTestId('cost-legend')).getByText('Defensivos').closest('li') as HTMLElement
    await user.hover(row)
    expect(screen.getByTestId('cost-tooltip')).toHaveTextContent('Defensivos')
  })
})

describe('Custo: o gráfico depende de ter digitado nas categorias, não da aba aberta', () => {
  const totalField = () => screen.getByRole('textbox', { name: 'Custo por hectare' })
  const digits = (t: string) => t.replace(/[^\d,]/g, '')

  it('typed categories → back on "Total": the chart stays and the total is the sum of what was typed', async () => {
    const user = await open([
      ...CATS,
      { type: 'setGroupTotal', group: 'sementes', value: { totalBrlHa: 1000 } },
      { type: 'setGroupTotal', group: 'defensivos', value: { totalBrlHa: 2000 } },
    ])
    const inChart = digits(screen.getByTestId('cost-donut-total').textContent ?? '')
    await user.click(screen.getByRole('radio', { name: 'Total' }))
    // the single field now holds the sum of every typed cost, and the chart is still there with the same total
    expect(screen.getByTestId('cost-summary')).toBeInTheDocument()
    expect(digits((totalField() as HTMLInputElement).value)).toBe(inChart)
    expect(digits(screen.getByTestId('cost-donut-total').textContent ?? '')).toBe(inChart)
    expect(screen.getByTestId('slice-sementes')).toBeInTheDocument()
    expect(screen.getByTestId('slice-defensivos')).toBeInTheDocument()
  })

  it('what was typed in an opened category is saved: Total and back keeps its items and the chart', async () => {
    const user = await open([
      ...CATS,
      { type: 'setCostItem', itemId: 'defensivos.herbicida', patch: { mode: 'valor', valueBrlHa: 900 } },
    ])
    await user.click(screen.getByRole('radio', { name: 'Total' }))
    expect(screen.getByTestId('slice-defensivos')).toBeInTheDocument()
    await user.hover(screen.getByTestId('slice-defensivos'))
    expect(screen.getByTestId('cost-tooltip')).toHaveTextContent('Herbicidas')
    await user.unhover(screen.getByTestId('slice-defensivos'))
    await user.click(screen.getByRole('radio', { name: 'Por categoria' }))
    expect(readState().costGroups.defensivos.items['defensivos.herbicida']).toMatchObject({ mode: 'valor', valueBrlHa: 900 })
    expect(screen.getByTestId('slice-defensivos')).toBeInTheDocument()
  })

  it('a total typed straight into the single field makes the chart (and the biggest cost) go away', async () => {
    const user = await open([...CATS, { type: 'setGroupTotal', group: 'sementes', value: { totalBrlHa: 1000 } }])
    await user.click(screen.getByRole('radio', { name: 'Total' }))
    expect(screen.getByTestId('cost-summary')).toBeInTheDocument()
    const field = totalField()
    await user.clear(field)
    await user.type(field, '5000')
    await user.tab()
    expect(screen.queryByTestId('cost-summary')).toBeNull()
    expect(readState().inputs.costPerHaBrl).toBe(5000)
  })

  it('never visited the categories: no chart on the single total', async () => {
    await open([{ type: 'setInput', key: 'yieldScHa', value: 60 }])
    expect(screen.queryByTestId('cost-summary')).toBeNull()
  })

  it('the open-dollar notice is about a cost that really floats, so it stays out once frozen on "Total"', async () => {
    const user = await open([
      ...CATS,
      { type: 'setGroupTotal', group: 'sementes', value: { usd: { amountUsdHa: 100, boughtPct: 0, boughtRate: 0 } } },
    ])
    expect(screen.getByTestId('open-dollar')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Total' }))
    expect(screen.getByTestId('cost-summary')).toBeInTheDocument()
    expect(screen.queryByTestId('open-dollar')).toBeNull()
  })
})

describe('Custo: clique fixa o cartão', () => {
  it('a click keeps the category card open after the pointer leaves; another click on it, Esc or a click elsewhere closes it', async () => {
    const user = await open([
      ...CATS,
      { type: 'setCostItem', itemId: 'defensivos.herbicida', patch: { mode: 'valor', valueBrlHa: 900 } },
    ])
    const slice = screen.getByTestId('slice-defensivos')
    await user.click(slice)
    await user.unhover(slice)
    await user.unhover(screen.getByTestId('cost-donut'))
    expect(screen.getByTestId('cost-tooltip')).toHaveTextContent('Herbicidas')
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('cost-tooltip')).toBeNull()
    // click again then click the same slice: toggles off
    await user.click(slice)
    await user.unhover(slice)
    await user.unhover(screen.getByTestId('cost-donut'))
    expect(screen.getByTestId('cost-tooltip')).toBeInTheDocument()
    await user.click(slice)
    await user.unhover(slice)
    await user.unhover(screen.getByTestId('cost-donut'))
    expect(screen.queryByTestId('cost-tooltip')).toBeNull()
    // a click outside the chart closes a pinned card
    await user.click(slice)
    await user.unhover(slice)
    await user.unhover(screen.getByTestId('cost-donut'))
    expect(screen.getByTestId('cost-tooltip')).toBeInTheDocument()
    await user.click(document.body)
    expect(screen.queryByTestId('cost-tooltip')).toBeNull()
  })

  it('Enter on a focused slice pins the card for keyboard users', async () => {
    const user = await open()
    const slice = screen.getByTestId('slice-sementes')
    act(() => slice.focus())
    await user.keyboard('{Enter}')
    act(() => slice.blur())
    expect(screen.getByTestId('cost-tooltip')).toHaveTextContent('Sementes')
  })
})

describe('Custo: o cartão não fica para trás quando a página rola', () => {
  it('scrolling closes both a hovered and a pinned card', async () => {
    const user = await open()
    await user.hover(screen.getByTestId('slice-sementes'))
    expect(screen.getByTestId('cost-tooltip')).toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(screen.queryByTestId('cost-tooltip')).toBeNull()
    await user.click(screen.getByTestId('slice-sementes'))
    await user.unhover(screen.getByTestId('slice-sementes'))
    expect(screen.getByTestId('cost-tooltip')).toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(screen.queryByTestId('cost-tooltip')).toBeNull()
  })
})
