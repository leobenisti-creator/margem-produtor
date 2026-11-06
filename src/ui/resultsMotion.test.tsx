import { render, screen, waitFor } from '@testing-library/react'
import { ChangePulse, ValueSwap } from './resultsMotion'

function setReduced(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

describe('ChangePulse', () => {
  it('does nothing when it mounts: no opacity, no transform', () => {
    setReduced(false)
    render(
      <ChangePulse signature="a" testId="p">
        <p>conteúdo</p>
      </ChangePulse>,
    )
    const el = screen.getByTestId('p')
    expect(el.style.opacity).toBe('')
    expect(el.style.transform === '' || el.style.transform === 'none').toBe(true)
  })

  it('a different signature gives a short pulse and always ends in the exact final state', async () => {
    setReduced(false)
    const { rerender } = render(
      <ChangePulse signature="a" testId="p">
        <p>conteúdo</p>
      </ChangePulse>,
    )
    rerender(
      <ChangePulse signature="b" testId="p">
        <p>conteúdo</p>
      </ChangePulse>,
    )
    const el = screen.getByTestId('p')
    await waitFor(() => expect(Number(el.style.opacity)).toBe(1), { timeout: 3000 })
    await waitFor(() => expect(el.style.transform === '' || el.style.transform === 'none' || /translateY\(0(px)?\)/.test(el.style.transform)).toBe(true), {
      timeout: 3000,
    })
    expect(screen.getByText('conteúdo')).toBeVisible()
  })

  it('the same signature does not pulse again', async () => {
    setReduced(false)
    const { rerender } = render(
      <ChangePulse signature="a" testId="p">
        <p>x</p>
      </ChangePulse>,
    )
    rerender(
      <ChangePulse signature="a" testId="p">
        <p>y</p>
      </ChangePulse>,
    )
    expect(screen.getByTestId('p').style.opacity).toBe('')
  })
})

describe('ValueSwap', () => {
  it('shows the first value as is, and the new one after a change, visible in the end', async () => {
    setReduced(false)
    const { rerender } = render(<ValueSwap text="R$ 10,00" testId="v" />)
    expect(screen.getByTestId('v')).toHaveTextContent('R$ 10,00')
    expect(['', '1']).toContain(screen.getByTestId('v').style.opacity)
    rerender(<ValueSwap text="R$ 12,50" testId="v" />)
    const el = screen.getByTestId('v')
    expect(el).toHaveTextContent('R$ 12,50')
    await waitFor(() => expect(Number(el.style.opacity)).toBe(1), { timeout: 3000 })
  })
})
