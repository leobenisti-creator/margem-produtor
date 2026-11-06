import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StoreProvider, useStore } from '../state/StoreProvider'
import { CropCurrencyControls } from '../ui/TopBar'
import { Ticker } from '../ui/Ticker'
import { Simulador } from './Simulador'
import { KpiRow } from '../ui/KpiRow'
import { computeResult } from '../engine/calc'
import { CROPS } from '../engine/crops'
import { staticProvider } from '../data/staticProvider'
import { fmtBrl } from '../ui/format'
import { App } from '../App'
import { SimulacaoComMeta } from '../test/storeHarness'
import { LEGACY_EXAMPLE, legacyState, mockMatchMedia, seedState } from '../test/helpers'
import { axe, toHaveNoViolations } from 'jest-axe'


// Mounts whole pages (axe/keyboard): under a full parallel run a test can pass the default 5 s.
/** Opens the FOB editor (premium, freight to the port, port fees). */
async function openFobEditor(user: ReturnType<typeof userEvent.setup>) {
  // The editor opens by itself when a point is chosen; only open it when it is folded.
  const b = screen.queryByRole('button', { name: 'Editar' })
  if (b) await user.click(b)
}

async function switchYieldToTonnes(user: ReturnType<typeof userEvent.setup>) {
  // The unit lives in the Produtividade field: click it, then pick t/ha (the typed number is converted).
  await user.click(screen.getByRole('button', { name: /^Trocar unidade \(sc\/ha\)$/ }))
  await user.click(screen.getByRole('menuitem', { name: 'Mudar para t/ha' }))
}

vi.setConfig({ testTimeout: 15000 })

expect.extend(toHaveNoViolations)

function Probe() {
  const { state } = useStore()
  return <output data-testid="inputs">{JSON.stringify(state.inputs)}</output>
}

function mockDesktop(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

async function setup() {
  const user = userEvent.setup()
  render(
    <StoreProvider>
      <CropCurrencyControls />
      <Ticker />
      <Simulador kpis={<KpiRow />} showMeta />
      <Probe />
    </StoreProvider>,
  )
  await screen.findByTestId('page-simulador')
  return user
}

function inputs(): Record<string, number | string> {
  return JSON.parse(screen.getByTestId('inputs').textContent ?? '{}')
}

async function typeInto(
  user: ReturnType<typeof userEvent.setup>,
  label: string | RegExp,
  text: string,
) {
  const field = screen.getByLabelText(label)
  await user.clear(field)
  if (text) await user.type(field, text)
  await user.tab()
}

beforeEach(() => {
  localStorage.clear()
  // Pre-FOB example farm (Centro-Sul at the Paranaguá base); tour still unseen like a first visit.
  seedState(LEGACY_EXAMPLE, false)
  // jsdom has no matchMedia: the page falls back to the desktop layout.
  // @ts-expect-error resetting the stub between tests
  delete window.matchMedia
})

describe('Simulador', () => {
  it('opens already calculated with example data', async () => {
    await setup()
    const snap = await staticProvider.getSnapshot()
    const init = legacyState(snap)
    const r = computeResult(
      CROPS.soja,
      { cbotUsc: snap.cbotUsc.soja.value, basisUsc: snap.basisUsc.soja.value, fx: snap.fx.value },
      init.inputs,
    )
    const hero = screen.getByTestId('kpi-margem')
    const price = screen.getByTestId('kpi-preco')
    const cost = screen.getByTestId('kpi-custo')
    expect(hero).toHaveTextContent(fmtBrl(r.marginPerSc))
    expect(price).toHaveTextContent(fmtBrl(r.farmPriceBrl))
    expect(cost).toHaveTextContent(fmtBrl(r.costPerSc))
    const num = (el: HTMLElement) => {
      const m = /R\$ (-?[\d.]+,\d{2})/.exec(el.textContent ?? '')
      return Number((m?.[1] ?? 'x').replace(/\./g, '').replace(',', '.'))
    }
    expect(num(hero)).toBeCloseTo(num(price) - num(cost), 1)
  })

  it('numeric fields are tappable: 44px min-height on the input and the wrapper focuses it', async () => {
    const user = await setup()
    const input = screen.getByLabelText('Área plantada')
    expect(input.className).toContain('min-h-[44px]')
    await user.click(input.parentElement as HTMLElement)
    expect(input).toHaveFocus()
  })

  it('typing 4.200,50 in cost updates cost per sack', async () => {
    const user = await setup()
    await typeInto(user, 'Custo por hectare', '4.200,50')
    const kpi = screen.getByTestId('kpi-custo')
    expect(kpi).toHaveTextContent('R$ 69,54')
    expect(kpi).toHaveTextContent('R$ 4.200,50 /ha')
  })

  it('switching to Por categoria shows eight category rows summing to the total', async () => {
    const user = await setup()
    await user.click(screen.getByRole('radio', { name: 'Por categoria' }))
    const rows = screen.getAllByTestId('cost-row')
    expect(rows).toHaveLength(8)
    const sum = rows.reduce((acc, row) => {
      const input = within(row).getByRole('textbox') as HTMLInputElement
      return acc + Number(input.value.replace(/\./g, '').replace(',', '.'))
    }, 0)
    const totalText = screen.getByTestId('cost-total').textContent ?? ''
    const total = Number(totalText.replace(/[^\d,]/g, '').replace(',', '.'))
    expect(Math.abs(sum - total)).toBeLessThan(0.5)
    expect(total).toBeGreaterThan(1000)
  })

  it('empty productivity shows em dash and no NaN in the document', async () => {
    const user = await setup()
    await typeInto(user, 'Produtividade', '')
    expect(screen.getByTestId('kpi-margem')).toHaveTextContent('—')
    expect(screen.getByTestId('kpi-custo')).toHaveTextContent('—')
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/)
    expect(inputs().yieldScHa).toBe(0)
  })

  it('currency US$ shows US$ symbols on KPIs', async () => {
    const user = await setup()
    await user.click(screen.getByRole('radio', { name: 'US$' }))
    expect(screen.getByTestId('kpi-margem')).toHaveTextContent('US$')
    expect(screen.getByTestId('kpi-preco')).toHaveTextContent('US$')
    expect(screen.getByTestId('kpi-custo')).toHaveTextContent('US$')
    expect(screen.getByTestId('kpi-total')).toHaveTextContent('US$')
  })

  it('margin base switch changes the hero percentage', async () => {
    const user = await setup()
    const hero = screen.getByTestId('kpi-margem')
    expect(hero).toHaveTextContent('da receita')
    const before = hero.textContent
    // R28: the toggle is a pill inside the hero tile, not in the top bar
    const group = within(hero).getByRole('radiogroup', { name: 'Base da margem' })
    await user.click(within(group).getByRole('radio', { name: 'do custo' }))
    expect(hero).toHaveTextContent('do custo')
    expect(within(group).getByRole('radio', { name: 'do custo' })).toBeChecked()
    expect(hero.textContent).not.toBe(before)
  })

  it('a rejected t/ha yield restores the stored sc/ha through the same conversion', async () => {
    const user = await setup()
    await switchYieldToTonnes(user)
    await typeInto(user, 'Produtividade', '4')
    expect(inputs().yieldScHa).toBeCloseTo(4 / 0.06, 6)
    await typeInto(user, 'Produtividade', '-4')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(inputs().yieldScHa).toBeCloseTo(4 / 0.06, 6)
  })

  it('typing the yield one character at a time moves the margin KPI before any blur', async () => {
    const user = await setup()
    const field = screen.getByLabelText('Produtividade')
    const hero = screen.getByTestId('kpi-margem')
    await user.clear(field)
    let last = hero.textContent
    const seen = new Set<string | null>()
    for (const ch of '72') {
      await user.type(field, ch)
      expect(field).toHaveFocus() // no blur
      expect(hero.textContent).not.toBe(last)
      last = hero.textContent
      seen.add(last)
    }
    expect(seen.size).toBe(2)
    expect(inputs().yieldScHa).toBe(72)
    expect(field).toHaveValue('72')
  })

  it('keeps the caret text as typed while the total margin follows each keystroke', async () => {
    const user = await setup()
    const field = screen.getByLabelText('Área plantada')
    const total = screen.getByTestId('kpi-total')
    await user.clear(field)
    await user.type(field, '2')
    const after2 = total.textContent
    await user.type(field, '.')
    expect(field).toHaveValue('2.')
    expect(total.textContent).toBe(after2) // incomplete text: nothing recomputed, no error
    expect(screen.queryByRole('alert')).toBeNull()
    await user.type(field, '500')
    expect(field).toHaveValue('2.500')
    expect(inputs().areaHa).toBe(2500)
    expect(total.textContent).not.toBe(after2)
  })

  it('per-category costs update the total on every keystroke', async () => {
    const user = await setup()
    await user.click(screen.getByRole('radio', { name: 'Por categoria' }))
    const row = screen.getAllByTestId('cost-row')[0]
    const input = within(row).getByRole('textbox')
    const total = screen.getByTestId('cost-total')
    await user.clear(input)
    const empty = total.textContent
    await user.type(input, '9')
    const nine = total.textContent
    expect(nine).not.toBe(empty)
    await user.type(input, '9')
    expect(total.textContent).not.toBe(nine)
    expect(input).toHaveFocus()
  })

  it('the price tile no longer carries the other-markets note (moved to #/preco)', async () => {
    const user = await setup()
    expect(screen.getByTestId('kpi-preco')).not.toHaveTextContent(/outras praças/)
    await user.click(screen.getByRole('radio', { name: 'Milho' }))
    expect(screen.getByTestId('kpi-preco')).not.toHaveTextContent(/outras praças/)
    expect(screen.queryByRole('button', { name: /Por que os preços em outras praças/ })).toBeNull()
  })

  it('the margin-base pill moves with the arrow keys and keeps a 44 px hit zone below md (fix 2)', async () => {
    const user = await setup()
    const hero = screen.getByTestId('kpi-margem')
    const receita = within(hero).getByRole('radio', { name: 'da receita' })
    const custo = within(hero).getByRole('radio', { name: 'do custo' })
    receita.focus()
    await user.keyboard('{ArrowRight}')
    expect(custo).toBeChecked()
    expect(custo).toHaveFocus()
    expect(inputs().marginBase).toBe('custo')
    await user.keyboard('{ArrowLeft}')
    expect(receita).toBeChecked()
    expect(receita).toHaveFocus()
    expect(inputs().marginBase).toBe('receita')
    // roving tabindex: only the checked option is in the Tab sequence
    expect(receita).toHaveAttribute('tabindex', '0')
    expect(custo).toHaveAttribute('tabindex', '-1')
    expect(receita.className).toMatch(/min-h-\[44px\]/)
    expect(receita.className).toMatch(/md:min-h-\[26px\]/)
  })

  it('tile numbers never wrap (R28)', async () => {
    await setup()
    for (const id of ['kpi-margem', 'kpi-preco', 'kpi-custo', 'kpi-total']) {
      const b = within(screen.getByTestId(id)).getByText(/^R\$/, { selector: 'b' })
      expect(b.className).toMatch(/whitespace-nowrap/)
      expect(b.className).toMatch(/\bnum\b/)
    }
  })

  it('in t/ha mode the total-margin sub-line uses t/ha and t (B1)', async () => {
    const user = await setup()
    expect(screen.getByTestId('kpi-total')).toHaveTextContent('1.000 ha × 60,40 sc/ha = 60.400 sc')
    await switchYieldToTonnes(user)
    expect(screen.getByTestId('kpi-total')).toHaveTextContent('1.000 ha × 3,62 t/ha = 3.624 t')
    expect(screen.getByTestId('kpi-total')).not.toHaveTextContent('sc/ha')
  })

  it('hero margin prints one decimal (R25) and the hero number is larger than the other tiles (P2-2)', async () => {
    await setup()
    const hero = screen.getByTestId('kpi-margem')
    expect(hero).toHaveTextContent(/\d+,\d%/)
    expect(within(hero).getByRole('radio', { name: 'da receita' })).toBeChecked()
    const heroNum = within(hero).getByText(/^R\$/, { selector: 'b' })
    const priceNum = within(screen.getByTestId('kpi-preco')).getByText(/^R\$/, { selector: 'b' })
    expect(heroNum.className).toMatch(/text-\[32px\]/)
    expect(priceNum.className).not.toMatch(/text-\[32px\]/)
    // eyebrows are sentence case, not uppercase (P3-1)
    expect(within(hero).getByText('Margem bruta / saca').className).not.toMatch(/uppercase/)
  })

  it('freight per ton and port fees are stored as R$ per sack', async () => {
    const user = await setup()
    await openFobEditor(user)
    await typeInto(user, /Frete até o porto/, '500')
    expect(inputs().freightBrlPerSc).toBeCloseTo(30, 6)
    expect(screen.getByTestId('freight-derived')).toHaveTextContent('R$ 30,00/sc')
    // Port fees open in R$/t (100 R$/t = 6 R$/sc) and switch to R$/sc on demand.
    await typeInto(user, 'Taxas de porto/armazém', '100')
    expect(inputs().portFeesBrlPerSc).toBeCloseTo(6, 6)
    // Clicking the unit offers R$/sc and converts the number (100 R$/t = 6 R$/sc).
    await user.click(screen.getByTitle('Unidade do prêmio, do frete e das taxas'))
    await user.click(screen.getByRole('menuitem', { name: 'Mudar para R$/sc' }))
    expect(screen.getByLabelText('Taxas de porto/armazém')).toHaveValue('6')
    expect(inputs().portFeesBrlPerSc).toBeCloseTo(6, 6)
    await typeInto(user, 'Taxas de porto/armazém', '6,5')
    expect(inputs().portFeesBrlPerSc).toBe(6.5)
  })

  it('#2 a point never changes the freight; at zero the page asks for it', async () => {
    const NOTE = 'Informe o seu frete até o porto: sem ele, a conta não desconta frete.'
    const user = await setup()
    await openFobEditor(user)
    expect(screen.queryByText(NOTE)).toBeNull()
    await typeInto(user, /Frete até o porto/, '0')
    expect(inputs().freightBrlPerSc).toBe(0)
    expect(screen.getByText(NOTE)).toBeInTheDocument()
    for (const point of ['cascavel', 'sorriso']) {
      await user.selectOptions(screen.getByLabelText('Praça'), point)
      expect(inputs().freightBrlPerSc).toBe(0)
      expect(screen.getByLabelText(/Frete até o porto/)).toHaveValue('0')
    }
  })

  it('#2 a freight the user typed survives a change of point', async () => {
    const NOTE = 'Informe o seu frete até o porto: sem ele, a conta não desconta frete.'
    const user = await setup()
    await openFobEditor(user)
    await typeInto(user, /Frete até o porto/, '500')
    await user.selectOptions(screen.getByLabelText('Praça'), 'cascavel')
    expect(inputs().freightBrlPerSc).toBeCloseTo(30, 6)
    expect(screen.getByLabelText(/Frete até o porto/)).toHaveValue('500')
    expect(screen.queryByText(NOTE)).toBeNull()
  })

  it('shows the app-default chip on port fees until they change', async () => {
    const user = await setup()
    await openFobEditor(user)
    expect(screen.getByText('padrão do app')).toBeInTheDocument()
    await typeInto(user, 'Taxas de porto/armazém', '100')
    expect(screen.queryByText('padrão do app')).not.toBeInTheDocument()
  })

  it('in US$ mode a typed cost is converted at the current dollar and stored in R$', async () => {
    const user = await setup()
    await user.click(screen.getByRole('radio', { name: 'US$' }))
    await typeInto(user, 'Custo por hectare', '1.000')
    expect(inputs().costPerHaBrl).toBeCloseTo(1000 * 5.4998, 4)
  })

  it('t/ha productivity converts back to sc/ha', async () => {
    const user = await setup()
    await switchYieldToTonnes(user)
    await typeInto(user, 'Produtividade', '4')
    expect(inputs().yieldScHa).toBeCloseTo(4 / 0.06, 6)
  })

  it('there is no regional suggestion chip: the productivity is only what the producer types', async () => {
    const user = await setup()
    expect(screen.queryByRole('button', { name: /usar média/i })).toBeNull()
    expect(screen.queryByText(/média da região/)).toBeNull()
    await typeInto(user, 'Produtividade', '50')
    expect(inputs().yieldScHa).toBe(50)
    await switchYieldToTonnes(user)
    expect(screen.queryByRole('button', { name: /usar média/i })).toBeNull()
  })

  it('category rows are compact: field labelled by aria-label, no reference helper (P2-1)', async () => {
    const user = await setup()
    await user.click(screen.getByRole('radio', { name: 'Por categoria' }))
    const row = screen.getAllByTestId('cost-row')[0]
    const input = within(row).getByRole('textbox', { name: 'Sementes' })
    expect(input).toBeInTheDocument()
    expect(within(row).queryByText('Sementes', { selector: 'label' })).toBeNull()
    expect(row).not.toHaveTextContent(/Referência da região/)
    expect(row.textContent).not.toMatch(/ref\. /)
  })

  it('the Lavoura e custos page has neither the sales card nor the dollar lock of the open volume', async () => {
    await setup()
    expect(screen.queryByRole('heading', { name: /Preço e venda/ })).toBeNull()
    expect(screen.queryByLabelText('Dólar travado da venda')).toBeNull()
    expect(screen.queryByText(/Dólar já travado do que está em aberto/)).toBeNull()
    expect(screen.queryByTestId('sales-summary')).toBeNull()
    expect(screen.queryByRole('switch', { name: /meta de margem/i })).toBeNull()
  })

  it('rejects text that is not a number and keeps the previous value', async () => {
    const user = await setup()
    await typeInto(user, 'Área plantada', 'abc')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(inputs().areaHa).toBe(1000)
  })

  it('milho keeps what the producer typed and shows no IMEA or regional note', async () => {
    const user = await setup()
    await user.click(screen.getByRole('radio', { name: 'Milho' }))
    expect(inputs().areaHa).toBe(1000)
    expect(screen.queryByText(/IMEA/)).not.toBeInTheDocument()
    expect(screen.queryByText(/média regional|média da região/)).not.toBeInTheDocument()
  })

  it('announces the margin politely when it changes (the side panel is gone)', async () => {
    await setup()
    const live = screen.getByTestId('result-live')
    expect(live).toHaveAttribute('aria-live', 'polite')
    expect(live).toHaveTextContent(/^Margem bruta por saca R\$ /)
  })
})

describe('Simulador redesign (Task 9): cost groups, Detalhar', () => {
  const kpiCost = () => screen.getByTestId('kpi-custo').textContent
  async function categorias(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('radio', { name: 'Por categoria' }))
  }

  it('groups sit in Insumos / Operação / Estrutura e financeiro and "Fertilizantes" never appears', async () => {
    const user = await setup()
    await categorias(user)
    for (const name of ['Insumos', 'Operação', 'Estrutura e financeiro']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    }
    await user.click(screen.getByRole('button', { name: 'Abrir Adubação' }))
    await user.click(screen.getByRole('button', { name: 'Detalhar Macronutrientes' }))
    expect(screen.getAllByText('Adubação').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/Fertilizantes/)
  })

  it('typing only a group total moves the cost per sack', async () => {
    const user = await setup()
    await categorias(user)
    const before = kpiCost()
    await typeInto(user, 'Defensivos', '2.000')
    expect(kpiCost()).not.toBe(before)
  })

  it('an item has no "média da região" option (Seguro da produção)', async () => {
    const user = await setup()
    await categorias(user)
    await user.click(screen.getByRole('button', { name: 'Abrir Financeiro / seguro' }))
    const row = screen.getByTestId('item-financeiro.seguroProducao')
    expect(within(row).queryByRole('radio', { name: 'média da região' })).toBeNull()
  })

  it('Detalhar → MAP 173 kg at 4.200/t + frete 150 → Usar no meu custo, then the item holds the detailed value', async () => {
    const user = await setup()
    await categorias(user)
    const before = kpiCost()
    await user.click(screen.getByRole('button', { name: 'Abrir Adubação' }))
    await user.click(screen.getByRole('button', { name: 'Detalhar Macronutrientes' }))
    const dialog = screen.getByRole('dialog', { name: 'Detalhar Macronutrientes' })
    await user.click(within(dialog).getByRole('radio', { name: 'Por produto' }))
    const r = within(dialog).getAllByTestId('product-row')[0]
    await user.selectOptions(within(r).getByLabelText('Produto 1'), 'map')
    for (const [label, v] of [
      ['Dose do produto 1', '173'],
      ['Preço do produto 1', '4.200'],
    ] as const) {
      await user.clear(within(r).getByLabelText(label))
      await user.type(within(r).getByLabelText(label), v)
    }
    await user.type(within(dialog).getByLabelText('Frete até a fazenda (R$/t)'), '150')
    expect(within(r).getByTestId('row-cost')).toHaveTextContent('R$ 753')
    await user.click(within(dialog).getByRole('button', { name: 'Usar no meu custo' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(kpiCost()).not.toBe(before)
    const macro = within(screen.getByTestId('item-adubacao.macro'))
    expect(macro.getByRole('radio', { name: 'meu valor' })).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Detalhar Macronutrientes' }))
    expect(screen.queryByRole('button', { name: 'Voltar à média da região' })).toBeNull()
  })

  it('item states change the group total and the result', async () => {
    const user = await setup()
    await categorias(user)
    await user.click(screen.getByRole('button', { name: 'Abrir Defensivos' }))
    const fung = () => within(screen.getByTestId('item-defensivos.fungicida'))
    // first touch puts the group in items mode (sum of the items the producer typed)
    await user.click(fung().getByRole('radio', { name: 'meu valor' }))
    await typeInto(user, 'Valor de Fungicidas', '450')
    const before = kpiCost()
    await user.click(fung().getByRole('radio', { name: 'não uso' }))
    expect(kpiCost()).not.toBe(before)
    await user.click(fung().getByRole('radio', { name: 'meu valor' }))
    expect(kpiCost()).toBe(before)
  })
})

describe('Simulador route a11y (Task 9)', () => {
  it('has no axe violations with a group open and the detail panel open', async () => {
    mockMatchMedia(true)
    seedState([...LEGACY_EXAMPLE, { type: 'setCostMode', mode: 'categorias' }, { type: 'setTargetMargin', value: 0.1 }])
    window.location.hash = '#/simulador'
    const user = userEvent.setup()
    const { container } = render(<App />)
    await screen.findByTestId('page-simulador')
    const check = () => axe(container, { rules: { 'color-contrast': { enabled: false } } })
    await user.click(screen.getByRole('button', { name: 'Abrir Adubação' }))
    expect(await check()).toHaveNoViolations()
    await user.click(screen.getByRole('button', { name: 'Detalhar Macronutrientes' }))
    expect(await check()).toHaveNoViolations()
    window.location.hash = ''
  })
})

describe('Simulador with US$ and no usable dollar (Task 9)', () => {
  it('group totals and item values are disabled and nothing is stored', async () => {
    const snap = await staticProvider.getSnapshot()
    snap.fx.value = 0
    const user = userEvent.setup()
    render(
      <StoreProvider provider={{ getSnapshot: () => Promise.resolve(snap) }}>
        <CropCurrencyControls />
        <Simulador />
        <Probe />
      </StoreProvider>,
    )
    await screen.findByTestId('page-simulador')
    await user.click(screen.getByRole('radio', { name: 'US$' }))
    await user.click(screen.getByRole('radio', { name: 'Por categoria' }))
    await user.click(screen.getByRole('button', { name: 'Abrir Sementes' }))
    const row = screen.getByTestId('item-sementes.cultura')
    await user.click(within(row).getByRole('radio', { name: 'meu valor' }))
    const before = inputs()
    expect(screen.getByRole('textbox', { name: 'Sementes' })).toBeDisabled()
    const field = within(row).getByLabelText('Valor de Semente da cultura')
    expect(field).toBeDisabled()
    await user.type(field, '9{Enter}')
    expect(inputs()).toEqual(before)
  })
})


describe('Simulação limpa (Feedback 1)', () => {
  const metaButton = () => screen.getByRole('button', { name: /^(Definir meta de margem|Meta: \d+%)$/ })

  it('shows no cascade, no exposição/equilíbrio, no target analysis and no right column', async () => {
    await setup()
    const page = screen.getByTestId('page-simulador')
    expect(within(page).queryByRole('list', { name: 'De onde vem o preço' })).toBeNull()
    expect(within(page).queryByTestId('break-even')).toBeNull()
    expect(within(page).queryByTestId('blended')).toBeNull()
    expect(within(page).queryByTestId('target-analysis')).toBeNull()
    expect(within(page).queryByTestId('result-panel')).toBeNull()
    expect(within(page).queryByRole('complementary')).toBeNull()
    expect(page.textContent).not.toMatch(/Exposição|Ponto de equilíbrio/)
    expect(within(page).queryByRole('button', { name: 'Como calculamos' })).toBeNull()
    // the form is one centred column
    const form = screen.getByTestId('sim-form')
    expect(form.className).toMatch(/max-w-\[880px\]/)
    expect(form.className).toMatch(/mx-auto/)
    expect(form.className).not.toMatch(/grid-cols/)
  })

  it('has the slim button row under the cards with the exact labels', async () => {
    await setup()
    const row = screen.getByTestId('sim-actions')
    expect(within(row).getByRole('button', { name: 'Definir meta de margem' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Formação do preço da fazenda' })).toBeInTheDocument()
    expect(within(row).queryByRole('link', { name: /De onde vem o preço/ })).toBeNull()
    // "Análise" only with a target
    expect(within(row).queryByRole('link', { name: 'Análise' })).toBeNull()
    // the row sits right under the result cards, before the form
    const kpis = screen.getByTestId('kpi-total')
    expect(kpis.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(row.compareDocumentPosition(screen.getByTestId('sim-form')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('"Formação do preço da fazenda" opens the same document on top of the page and closes again', async () => {
    const user = await setup()
    expect(screen.queryByTestId('price-formation-overlay')).toBeNull()
    const btn = screen.getByRole('button', { name: 'Formação do preço da fazenda' })
    expect(btn).toHaveAttribute('aria-haspopup', 'dialog')
    await user.click(btn)
    const dialog = screen.getByRole('dialog', { name: 'Formação do preço da fazenda' })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByTestId('pf-final')).toHaveTextContent(/R\$/)
    await user.click(screen.getByRole('button', { name: 'Fechar Formação do preço da fazenda' }))
    expect(screen.queryByTestId('price-formation-overlay')).toBeNull()
    expect(btn).toHaveFocus()
  })

  it('the real page (no meta button, new cards) has neither "Definir meta de margem" nor "De onde vem o preço"', async () => {
    render(
      <StoreProvider>
        <Simulador />
      </StoreProvider>,
    )
    await screen.findByTestId('page-simulador')
    expect(screen.queryByRole('button', { name: /meta de margem|Meta: /i })).toBeNull()
    expect(screen.queryByRole('link', { name: /De onde vem o preço/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Formação do preço da fazenda' })).toBeInTheDocument()
  })

  it('has no "Análise" link on this tab, with or without a target (the analysis lives in Resultados)', async () => {
    seedState([...LEGACY_EXAMPLE, { type: 'setTargetMargin', value: 0.2 }])
    await setup()
    expect(within(screen.getByTestId('sim-actions')).queryByRole('link', { name: 'Análise' })).toBeNull()
    expect(metaButton()).toHaveTextContent('Meta: 20%')
  })

  it('the meta dialog turns the target on, validates the %, and the button reads "Meta: X%"', async () => {
    const user = await setup()
    await user.click(metaButton())
    const dialog = screen.getByRole('dialog', { name: 'Meta de margem' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    const sw = within(dialog).getByRole('switch', { name: 'Definir meta de margem' })
    expect(sw).toHaveFocus()
    expect(sw).toHaveAttribute('aria-checked', 'false')
    await user.click(sw)
    expect(inputs().targetMargin).toBe(0.15)
    const field = within(dialog).getByLabelText('Meta de margem (%)')
    expect(field).toHaveValue('15')
    expect(within(dialog).getByTestId('min-price')).toHaveTextContent(/R\$ \d/)
    // invalid: negative → inline error, nothing stored
    await user.clear(field)
    await user.type(field, '-5')
    expect(within(dialog).getByRole('alert')).toBeInTheDocument()
    expect(inputs().targetMargin).toBe(0.15)
    await user.clear(field)
    await user.type(field, '22')
    expect(inputs().targetMargin).toBeCloseTo(0.22, 10)
    await user.click(within(dialog).getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(metaButton()).toHaveTextContent('Meta: 22%')
    expect(metaButton()).toHaveFocus()
    expect(screen.getByTestId('kpi-margem')).toHaveTextContent(/meta 22% [✓✗]/)
  })

  it('the meta dialog turns the target off again, traps Tab and closes on Esc', async () => {
    seedState([...LEGACY_EXAMPLE, { type: 'setTargetMargin', value: 0.15 }])
    const user = await setup()
    const trigger = metaButton()
    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Meta de margem' })
    // like the SidePanel's, the backdrop is hidden from assistive tech
    expect(screen.getByTestId('meta-backdrop')).toHaveAttribute('aria-hidden', 'true')
    const n = dialog.querySelectorAll('button, input, a[href]').length
    for (let i = 0; i < n + 2; i++) {
      await user.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
    await user.click(within(dialog).getByRole('switch', { name: 'Definir meta de margem' }))
    expect(inputs().targetMargin).toBeNull()
    expect(within(dialog).queryByLabelText('Meta de margem (%)')).toBeNull()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveTextContent('Definir meta de margem')
    expect(within(screen.getByTestId('sim-actions')).queryByRole('link', { name: 'Análise' })).toBeNull()
  })

  it('at 375 px the first input comes right after the cards and the button row (no sheet, no panel)', async () => {
    mockDesktop(false)
    await setup()
    expect(screen.queryByRole('button', { name: /ver resultado/i })).toBeNull()
    expect(screen.queryByTestId('result-panel')).toBeNull()
    const page = screen.getByTestId('page-simulador')
    const firstField = page.querySelector('input, select, textarea') as HTMLElement
    expect(firstField).toBe(screen.getByLabelText('Praça'))
    // only the four result tiles and one row of actions precede the first card
    const form = screen.getByTestId('sim-form')
    const before = Array.from(page.children).filter(
      (el) => el.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(before.map((el) => el.getAttribute('data-testid'))).toEqual(['kpi-row', 'sim-actions'])
    // no "outras praças" line making the price tile taller on a phone
    expect(screen.getByTestId('kpi-preco')).not.toHaveTextContent(/outras praças/)
  })

  it('has no axe violations with the meta dialog open', async () => {
    mockMatchMedia(true)
    seedState([...LEGACY_EXAMPLE, { type: 'setTargetMargin', value: 0.1 }])
    const user = userEvent.setup()
    const { container } = render(<SimulacaoComMeta />)
    await screen.findByTestId('page-simulador')
    const check = () => axe(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(await check()).toHaveNoViolations()
    await user.click(screen.getByRole('button', { name: 'Meta: 10%' }))
    await screen.findByRole('dialog', { name: 'Meta de margem' })
    expect(await check()).toHaveNoViolations()
    window.location.hash = ''
  })
})
