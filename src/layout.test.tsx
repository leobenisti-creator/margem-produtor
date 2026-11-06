import { render, screen } from '@testing-library/react'
import { StoreProvider } from './state/StoreProvider'
import { Simulador } from './pages/Simulador'
import { Comercializacao } from './pages/Comercializacao'
import { Resultados } from './pages/Resultados'
import { mockMatchMedia, removeMatchMedia, seedState } from './test/helpers'

function renderPage(page: 'simulador' | 'comercializacao' | 'resultados') {
  const Page = { simulador: Simulador, comercializacao: Comercializacao, resultados: Resultados }[page]
  return render(
    <StoreProvider>
      <Page />
    </StoreProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  seedState()
})

afterEach(() => removeMatchMedia())

describe('responsive layout branches', () => {
  it('renders the simulador when matchMedia is undefined (one column, no side panel since Feedback 1)', async () => {
    removeMatchMedia()
    expect(window.matchMedia).toBeUndefined()
    renderPage('simulador')
    expect(await screen.findByTestId('sim-form')).toBeInTheDocument()
    expect(screen.queryByTestId('result-panel')).toBeNull()
    expect(screen.queryByRole('button', { name: /Ver resultado completo/ })).toBeNull()
  })

  it('renders comercializacao when matchMedia is undefined', async () => {
    removeMatchMedia()
    renderPage('comercializacao')
    expect(await screen.findByTestId('page-comercializacao')).toBeInTheDocument()
  })

  it('renders resultados when matchMedia is undefined', async () => {
    removeMatchMedia()
    renderPage('resultados')
    expect(await screen.findByTestId('page-resultados')).toBeInTheDocument()
  })

  it.each([true, false])('the simulador has the same layout at any width (wide = %s): cards on top, no panel, no sheet', async (wide) => {
    mockMatchMedia(wide)
    renderPage('simulador')
    expect(await screen.findByTestId('farm-kpis')).toBeInTheDocument()
    expect(screen.getByTestId('sim-form')).toBeInTheDocument()
    expect(screen.queryByTestId('result-panel')).toBeNull()
    expect(screen.queryByRole('button', { name: /Ver resultado completo/ })).toBeNull()
    expect(screen.queryByRole('complementary', { name: 'Resultado' })).toBeNull()
  })
})
