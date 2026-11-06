import { render, screen } from '@testing-library/react'
import { StoreProvider } from './StoreProvider'

describe('StoreProvider loading state (P3-6)', () => {
  it('shows a skeleton of the KPI row and cards, announced as "Carregando", never NaN', () => {
    render(
      <StoreProvider provider={{ getSnapshot: () => new Promise(() => {}) }}>
        <p>conteúdo</p>
      </StoreProvider>,
    )
    const status = screen.getByRole('status', { name: 'Carregando' })
    expect(status.querySelectorAll('[data-skeleton]').length).toBeGreaterThanOrEqual(4)
    expect(status.className).toMatch(/animate-pulse/)
    expect(screen.queryByText('conteúdo')).toBeNull()
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/)
  })
})
