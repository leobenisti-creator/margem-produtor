import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StoreProvider, useStore } from '../state/StoreProvider'
import { staticProvider } from '../data/staticProvider'
import { Ticker } from './Ticker'

function Probe() {
  const { scenario, dispatch } = useStore()
  return (
    <>
      <output data-testid="fx">{scenario.fx}</output>
      <button onClick={() => dispatch({ type: 'setCrop', crop: 'milho' })}>milho</button>
    </>
  )
}

async function setup() {
  const user = userEvent.setup()
  const view = render(
    <StoreProvider>
      <Ticker />
      <Probe />
    </StoreProvider>,
  )
  await screen.findByTestId('fx')
  return { user, ...view }
}

beforeEach(() => {
  localStorage.clear()
})

describe('Ticker', () => {
  it('shows "Fechamento 26/10/2026" and never the text AUTO or ao vivo', async () => {
    const { container } = await setup()
    expect(screen.getByText(/Fechamento 26\/10\/2026/)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/AUTO/)
    expect(container.textContent).not.toMatch(/ao vivo/i)
  })

  it('shows CBOT, B3 SJC and PTAX for soja', async () => {
    await setup()
    expect(screen.getByText('1.241,25')).toBeInTheDocument()
    expect(screen.getByText('B3 SJC')).toBeInTheDocument()
    expect(screen.getByText('US$ 27,36/sc')).toBeInTheDocument()
    expect(screen.getByText('5,4998')).toBeInTheDocument()
  })

  it('no longer shows the base nor its pencil (the base comes from the ponto FOB)', async () => {
    const { container } = await setup()
    expect(screen.queryByTestId('ticker-base')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar Base' })).not.toBeInTheDocument()
    expect(screen.queryByText('61,70')).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/Base/)
    // Only CBOT and Dólar PTAX stay editable.
    expect(screen.getAllByRole('button', { name: /^Editar / })).toHaveLength(2)
  })

  it('follows the selected crop (milho: CCM in R$)', async () => {
    const { user } = await setup()
    await user.click(screen.getByRole('button', { name: 'milho' }))
    expect(screen.getByText('B3 CCM')).toBeInTheDocument()
    expect(screen.getByText('R$ 66,89/sc')).toBeInTheDocument()
    expect(screen.getByText('455,00')).toBeInTheDocument()
  })

  it('editing fx to 0 shows an inline error and keeps 5,4998', async () => {
    const { user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Editar Dólar PTAX' }))
    const input = screen.getByRole('textbox', { name: /Dólar PTAX/ })
    await user.clear(input)
    await user.type(input, '0{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('maior que zero')
    expect(screen.getByTestId('fx')).toHaveTextContent('5.4998')
    await user.keyboard('{Escape}')
    expect(screen.getByText('5,4998')).toBeInTheDocument()
    expect(screen.queryByText('manual')).not.toBeInTheDocument()
  })

  it('editing fx to 5,6 shows the manual badge, and restaurar brings it back', async () => {
    const { user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Editar Dólar PTAX' }))
    const input = screen.getByRole('textbox', { name: /Dólar PTAX/ })
    await user.clear(input)
    await user.type(input, '5,6{Enter}')
    expect(screen.getByTestId('fx')).toHaveTextContent('5.6')
    expect(screen.getByText('manual')).toBeInTheDocument()
    expect(screen.getByText('5,6000')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Editar Dólar PTAX' }))
    await user.click(screen.getByRole('button', { name: 'restaurar' }))
    expect(screen.getByTestId('fx')).toHaveTextContent('5.4998')
    expect(screen.queryByText('manual')).not.toBeInTheDocument()
  })

  it('rejects non numeric text for CBOT and keeps the value', async () => {
    const { user } = await setup()
    await user.click(screen.getByRole('button', { name: 'Editar CBOT' }))
    const input = screen.getByRole('textbox', { name: /CBOT/ })
    await user.clear(input)
    await user.type(input, 'abc{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('Informe um número válido.')
    await user.keyboard('{Escape}')
    expect(screen.getByText('1.241,25')).toBeInTheDocument()
  })

  it('edit controls have 44px touch targets on mobile and 16px input text', async () => {
    const { user } = await setup()
    const pencil = screen.getByRole('button', { name: 'Editar CBOT' })
    expect(pencil.className).toContain('min-h-[44px]')
    expect(pencil.className).toContain('min-w-[44px]')
    await user.click(pencil)
    const input = screen.getByRole('textbox', { name: /CBOT/ })
    expect(input.className).toContain('min-h-[44px]')
    expect(input.className).toContain('text-base')
    expect(screen.getByRole('button', { name: 'Aplicar' }).className).toContain('min-h-[44px]')
    await user.clear(input)
    await user.type(input, '1300{Enter}')
    await user.click(screen.getByRole('button', { name: 'Editar CBOT' }))
    const restore = screen.getByRole('button', { name: 'restaurar' })
    expect(restore.className).toContain('min-h-[44px]')
    expect(restore.className).toContain('min-w-[44px]')
  })

  it('caption shows the latest asOf of cbot/fx/b3 (not basis) and visible sources', async () => {
    const snap = await staticProvider.getSnapshot()
    const mocked = structuredClone(snap)
    mocked.fx.asOf = '2026-10-27'
    mocked.basisUsc.soja.asOf = '2026-10-30'
    render(
      <StoreProvider provider={{ getSnapshot: async () => mocked }}>
        <Ticker />
      </StoreProvider>,
    )
    const caption = await screen.findByText(/^Fechamento/)
    expect(caption).toHaveTextContent('Fechamento 27/10/2026')
    expect(caption).toHaveTextContent('Yahoo (não oficial), BCB, B3')
    expect(caption.getAttribute('title')).toContain('PTAX: BCB Olinda')
    expect(caption.getAttribute('title')).not.toMatch(/Basis/)
  })

  it('keeps the caption out of the scrolling quote row, so it never clips (P1-1)', async () => {
    await setup()
    const caption = screen.getByText(/^Fechamento/)
    const quotes = screen.getByTestId('ticker-quotes')
    expect(quotes).not.toContainElement(caption)
    expect(quotes.className).toMatch(/overflow-x-auto/)
    expect(caption.className).toMatch(/shrink-0/)
    expect(caption.className).toMatch(/whitespace-nowrap/)
    // below lg the caption is its own row (basis-full), at lg it sits at the end of the single row
    expect(caption.className).toMatch(/basis-full/)
    expect(caption.className).toMatch(/lg:basis-auto/)
  })
})
