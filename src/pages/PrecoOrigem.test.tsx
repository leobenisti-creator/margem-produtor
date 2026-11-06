import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { App } from '../App'
import { StoreProvider } from '../state/StoreProvider'
import { ExplainDrawer, ExplainProvider } from '../ui/ExplainDrawer'
import { Ticker } from '../ui/Ticker'
import { CropCurrencyControls } from '../ui/TopBar'
import { LEGACY_EXAMPLE, mockMatchMedia, seedState } from '../test/helpers'
import type { Action } from '../state/types'
import { PrecoOrigem } from './PrecoOrigem'

// Mounts whole pages (axe): under a full parallel run a test can pass the default 5 s.
vi.setConfig({ testTimeout: 15000 })

expect.extend(toHaveNoViolations)

const PROVISIONAL = 'Bases por ponto FOB provisórias até a fonte de preços ser ligada.'

async function open(actions: Action[] = []) {
  seedState([...LEGACY_EXAMPLE, ...actions])
  const user = userEvent.setup()
  render(
    <StoreProvider>
      <ExplainProvider>
        <CropCurrencyControls />
        <Ticker />
        <PrecoOrigem />
        <ExplainDrawer />
      </ExplainProvider>
    </StoreProvider>,
  )
  await screen.findByTestId('page-preco')
  return user
}

const others = () => screen.getByTestId('outras-pracas')

beforeEach(() => {
  localStorage.clear()
  mockMatchMedia(true)
  window.location.hash = ''
})

describe('#/preco "De onde vem o preço"', () => {
  it('shows the cascade, Como calculamos, the other markets, equilíbrio, exposição and the provisional note', async () => {
    const user = await open()
    const page = screen.getByTestId('page-preco')
    expect(within(page).getByRole('list', { name: 'De onde vem o preço' })).toBeInTheDocument()
    expect(within(page).getAllByRole('listitem')).toHaveLength(8)
    expect(others()).toHaveTextContent('Em outras praças (sem frete):')
    expect(within(page).getByRole('heading', { name: 'Ponto de equilíbrio' })).toBeInTheDocument()
    expect(within(page).getByTestId('break-even')).toBeInTheDocument()
    expect(within(page).getByRole('heading', { name: 'Exposição' })).toBeInTheDocument()
    expect(within(page).getByTestId('exposicao')).toHaveTextContent('Vendido 0%')
    expect(within(page).getByTestId('exposicao')).toHaveTextContent('Em aberto 100%')
    expect(within(page).getByText(PROVISIONAL)).toBeInTheDocument()
    await user.click(within(page).getByRole('button', { name: 'Como calculamos' }))
    expect(screen.getByRole('dialog', { name: 'Preço na fazenda' })).toBeInTheDocument()
  })

  it('"← Voltar à Simulação" goes back in the same tab', async () => {
    await open()
    const back = screen.getByRole('link', { name: '← Voltar à Simulação' })
    expect(back).toHaveAttribute('href', '#/simulador')
    expect(back).not.toHaveAttribute('target')
  })

  it('soja converts the B3 US$ quote to R$ with the scenario dollar; no why-button under 25%', async () => {
    await open()
    // 27,3644 US$/sc × 5,4998 = R$ 150,50
    expect(others()).toHaveTextContent(
      'Em outras praças (sem frete): B3 SJC ≈ R$ 150,50 (US$ 27,36 × dólar) · Cepea Paranaguá R$ 155,55',
    )
    expect(within(others()).queryByRole('button', { name: /outras praças/ })).toBeNull()
  })

  it('milho shows the CCM comparison with an inline why-button (gap > 25%)', async () => {
    const user = await open()
    await user.click(screen.getByRole('radio', { name: 'Milho' }))
    expect(others()).toHaveTextContent('Em outras praças (sem frete): B3 CCM R$ 66,89 · Cepea R$ 64,24')
    await user.click(within(others()).getByRole('button', { name: /Por que os preços em outras praças são maiores/ }))
    expect(screen.getByRole('dialog', { name: 'Preço na fazenda' })).toBeInTheDocument()
  })

  it('in US$ mode the comparison is converted to US$ too (B2)', async () => {
    const user = await open()
    await user.click(screen.getByRole('radio', { name: 'US$' }))
    expect(others()).toHaveTextContent('B3 SJC US$ 27,36 · Cepea Paranaguá ≈ US$ 28,28 (R$ 155,55 ÷ dólar)')
    expect(others()).not.toHaveTextContent('R$ 150,50')
  })

  it('names a manually edited dollar in the comparison conversion (#9)', async () => {
    const user = await open()
    await user.click(screen.getByRole('button', { name: 'Editar Dólar PTAX' }))
    const input = screen.getByRole('textbox', { name: /Dólar PTAX/ })
    await user.clear(input)
    await user.type(input, '5{Enter}')
    expect(others()).toHaveTextContent('B3 SJC ≈ R$ 136,82 (US$ 27,36 × dólar manual)')
  })

  it('the minimum price appears only with a target', async () => {
    await open()
    expect(screen.queryByTestId('min-price')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Como calculamos: preço mínimo' })).toBeNull()
  })

  it('with a target it shows the minimum price and its explanation', async () => {
    await open([{ type: 'setTargetMargin', value: 0.15 }])
    expect(screen.getByTestId('min-price')).toHaveTextContent(/R\$ \d/)
    expect(screen.getByText(/Preço mínimo p\/ meta 15%/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Como calculamos: preço mínimo' })).toBeInTheDocument()
  })

  it('a sale tranche moves the exposure bar and shows the blended margin', async () => {
    const user = await open([
      { type: 'addSale', partial: { volume: 30200, volumeUnit: 'sc', price: 140, priceCurrency: 'BRL' } },
    ])
    // 30.200 of 60.400 sc = 50%
    expect(screen.getByTestId('exposicao')).toHaveTextContent('Vendido 50%')
    expect(screen.getByTestId('exposicao')).toHaveTextContent('Em aberto 50%')
    expect(screen.getByTestId('blended')).toHaveTextContent(/%/)
    await user.click(screen.getByRole('button', { name: 'Como calculamos: margem blendada' }))
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Margem blendada' })).toBeVisible()
  })

  it('has no axe violations (inside the app shell)', async () => {
    seedState([...LEGACY_EXAMPLE, { type: 'setTargetMargin', value: 0.15 }])
    window.location.hash = '#/preco'
    const { container } = render(<App />)
    await screen.findByTestId('page-preco')
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })

  it('a new tab opens with the numbers saved by the Simulação (persisted state is read on load)', async () => {
    seedState(LEGACY_EXAMPLE)
    window.location.hash = '#/simulador'
    const user = userEvent.setup()
    const first = render(<App />)
    await screen.findByTestId('page-simulador')
    const field = screen.getByLabelText('Produtividade')
    await user.clear(field)
    await user.type(field, '50')
    const cost = within(screen.getByTestId('farm-custo')).getByText(/^R\$/, { selector: 'b' }).textContent
    // the state is saved after a short debounce; wait for it, as a second tab would find it on load
    await waitFor(() => expect(JSON.parse(localStorage.getItem('margem:v3') ?? '{}').inputs?.yieldScHa).toBe(50))
    first.unmount()
    act(() => {
      window.location.hash = '#/preco'
    })
    render(<App />)
    await screen.findByTestId('page-preco')
    const rows = within(screen.getByRole('list', { name: 'De onde vem o preço' })).getAllByRole('listitem')
    expect(within(rows[6]).getByTestId('wf-label')).toHaveTextContent('− Custo')
    expect(within(rows[6]).getByTestId('wf-value')).toHaveTextContent(cost ?? 'x')
  })
})
