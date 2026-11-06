import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StoreProvider, useStore } from '../state/StoreProvider'
import { CropCurrencyControls, PageTitle, ThemeToggle } from './TopBar'

function Probe() {
  const { state } = useStore()
  return (
    <output data-testid="probe">
      {state.crop}|{state.currency}|{state.areaUnit}|{state.inputs.marginBase}
    </output>
  )
}

async function setup() {
  const user = userEvent.setup()
  render(
    <StoreProvider>
      <CropCurrencyControls />
      <ThemeToggle disabled={false} />
      <Probe />
    </StoreProvider>,
  )
  await screen.findByTestId('probe')
  return user
}

beforeEach(() => {
  localStorage.clear()
})

describe('TopBar', () => {
  it('toggles currency and dispatches', async () => {
    const user = await setup()
    expect(screen.getByTestId('probe')).toHaveTextContent('soja|BRL|scHa|receita')
    await user.click(screen.getByRole('radio', { name: 'US$' }))
    expect(screen.getByTestId('probe')).toHaveTextContent('soja|USD|scHa|receita')
    expect(screen.getByRole('radio', { name: 'US$' })).toHaveAttribute('aria-checked', 'true')
  })

  it('crop selector shows only Soja and Milho', async () => {
    const user = await setup()
    const group = screen.getByRole('radiogroup', { name: 'Cultura' })
    const labels = Array.from(group.querySelectorAll('[role="radio"]')).map((e) => e.textContent)
    expect(labels).toEqual(['Soja', 'Milho'])
    await user.click(screen.getByRole('radio', { name: 'Milho' }))
    expect(screen.getByTestId('probe')).toHaveTextContent('milho|')
  })

  it('has no area-unit toggle any more (it lives in the Produtividade field); the margin base is in the hero tile (R28)', async () => {
    await setup()
    expect(screen.queryByRole('radio', { name: 't/ha' })).toBeNull()
    expect(screen.queryByRole('radiogroup', { name: 'Unidade de área' })).toBeNull()
    expect(screen.queryByRole('radiogroup', { name: 'Base da margem' })).toBeNull()
    expect(screen.queryByText('Margem', { selector: 'span' })).toBeNull()
  })

  it('has only the crop and currency selectors, no captions and no copy-link button', async () => {
    await setup()
    expect(screen.queryByRole('button', { name: /Salvar cenário/ })).toBeNull()
    expect(screen.getByRole('radiogroup', { name: 'Cultura' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Moeda' })).toBeInTheDocument()
    for (const caption of ['Cultura', 'Moeda']) expect(screen.queryByText(caption, { selector: 'span' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copiar link do app' })).toBeNull()
  })

  it('the selectors are the compact size', async () => {
    await setup()
    for (const r of screen.getAllByRole('radio')) expect(r.className).toContain('text-[11px]')
  })

  it('the page title (h1) moved out of the bar into PageTitle, with crop and region', async () => {
    await setup()
    expect(screen.queryByRole('heading')).toBeNull()
    render(
      <StoreProvider>
        <PageTitle route="comercializacao" />
      </StoreProvider>,
    )
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      /^Comercialização · Soja · \S/,
    )
  })
})

describe('TopBar theme toggle', () => {
  it('is a button that says what a click does, and is disabled on the Início', async () => {
    await setup()
    expect(screen.getByRole('button', { name: 'Mudar para o tema claro' })).toBeEnabled()
    render(<ThemeToggle disabled />)
    expect(screen.getAllByRole('button', { name: 'Mudar para o tema claro' })[1]).toBeDisabled()
  })
})
