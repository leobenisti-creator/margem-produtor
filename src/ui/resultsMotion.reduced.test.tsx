import { render, screen } from '@testing-library/react'
import { ChangePulse, ValueSwap } from './resultsMotion'

// Own file: motion caches the reduced-motion preference per module, so it is set before any render.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})

describe('the Resultados motion with prefers-reduced-motion', () => {
  it('ChangePulse: nothing moves even when the signature changes', () => {
    const { rerender } = render(
      <ChangePulse signature="a" testId="p">
        <p>x</p>
      </ChangePulse>,
    )
    rerender(
      <ChangePulse signature="b" testId="p">
        <p>x</p>
      </ChangePulse>,
    )
    const el = screen.getByTestId('p')
    expect(el.style.opacity).toBe('')
    expect(el.style.transform).toBe('')
  })

  it('ValueSwap: the new value just appears, fully visible at once', () => {
    const { rerender } = render(<ValueSwap text="1" testId="v" />)
    rerender(<ValueSwap text="2" testId="v" />)
    const el = screen.getByTestId('v')
    expect(el).toHaveTextContent('2')
    expect(Number(el.style.opacity === '' ? 1 : el.style.opacity)).toBe(1)
  })
})
