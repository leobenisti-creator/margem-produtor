import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('renders title and hint', () => {
    render(<EmptyState title="Sem dados" hint="Tente depois" />)
    expect(screen.getByText('Sem dados')).toBeInTheDocument()
    expect(screen.getByText('Tente depois')).toBeInTheDocument()
  })

  it('renders an optional action that works', async () => {
    const onClick = vi.fn()
    render(<EmptyState title="Falhou" hint="x" action={{ label: 'Tentar de novo', onClick }} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('inline variant keeps title and hint in one readable string', () => {
    render(<EmptyState inline title="Aguardando" hint="digite o valor no lápis" />)
    expect(screen.getByText('Aguardando — digite o valor no lápis')).toBeInTheDocument()
  })
})
