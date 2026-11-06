import { render, screen } from '@testing-library/react'
import { StoreProvider } from '../state/StoreProvider'
import { staticProvider } from '../data/staticProvider'
import { Footer } from './Footer'

beforeEach(() => {
  localStorage.clear()
})

describe('Footer', () => {
  it('keeps the legal line verbatim and adds the closing date with the sources (P3-8)', async () => {
    render(
      <StoreProvider>
        <Footer />
      </StoreProvider>,
    )
    expect(
      await screen.findByText('Material educacional e indicativo. Não constitui recomendação.'),
    ).toBeInTheDocument()
    const data = screen.getByText(/^Preços de fechamento de 26\/10\/2026/)
    expect(data).toHaveTextContent(
      'fontes: Yahoo (não oficial), BCB, B3, Cepea',
    )
    // Feedback 1: the base comes from the ponto FOB now; the old base source is gone from the footer.
    expect(data.textContent).not.toMatch(/base|Hedgepoint|ESALQ|a confirmar/)
    expect(data.textContent).not.toMatch(/AUTO|ao vivo/i)
    // moved here from the retired Sidebar
    expect(screen.getByText('Visitante · dados só neste navegador')).toBeInTheDocument()
  })

  it('#5 never names the snapshot basis source, whatever it says', async () => {
    const mocked = structuredClone(await staticProvider.getSnapshot())
    mocked.basisUsc.soja.source = 'Basis Paranaguá: Hedgepoint/CME/ESALQ, relatório semanal'
    render(
      <StoreProvider provider={{ getSnapshot: async () => mocked }}>
        <Footer />
      </StoreProvider>,
    )
    const data = await screen.findByText(/^Preços de fechamento/)
    expect(data).toHaveTextContent('Cepea')
    expect(data.textContent).not.toMatch(/IMEA/)
    expect(data.textContent).not.toMatch(/Hedgepoint|a confirmar/)
  })
})
