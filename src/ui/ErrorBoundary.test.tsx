import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBoundary } from './ErrorBoundary'

function Boom(): never {
  throw new Error('boom')
}

describe('ErrorBoundary', () => {
  it('shows the Portuguese fallback with a reload button when a child throws', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const reload = vi.fn()
    render(
      <ErrorBoundary onReload={reload}>
        <Boom />
      </ErrorBoundary>,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Algo deu errado ao carregar esta página. Recarregue para tentar de novo.')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Recarregar' }))
    expect(reload).toHaveBeenCalledTimes(1)
    err.mockRestore()
  })

  it('renders the children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>ok</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('ok')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
