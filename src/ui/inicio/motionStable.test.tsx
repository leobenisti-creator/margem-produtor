import { act, cleanup, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { CountUp, Lift, Reveal, Stagger, StaggerItem } from './motion'
import { FakeIO, installFakeIO, removeIO } from './testUtils'
import { resetMotionSession } from './session'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetMotionSession()
  localStorage.setItem('margem:motion', 'once')
})
beforeAll(() => installFakeIO())
afterAll(() => removeIO())
afterEach(() => {
  cleanup()
  ;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIO
})

let bump: () => void = () => {}
function Host() {
  const [n, setN] = useState(0)
  bump = () => setN((v) => v + 1)
  return (
    <div>
      <output data-testid="n">{n}</output>
      <Reveal id="estavel.reveal" as="section">
        <p data-testid="reveal-child">revela</p>
      </Reveal>
      <Stagger id="estavel.stagger" as="ul" role="list" ariaLabel="Itens">
        <StaggerItem as="li">um</StaggerItem>
        <StaggerItem as="li">dois</StaggerItem>
      </Stagger>
      <Lift as="article">
        <p>cartão</p>
      </Lift>
      <CountUp id="estavel.contagem" value={10} format={(v) => String(Math.round(v))} />
    </div>
  )
}

describe('the motion components keep their DOM nodes when a parent re-renders', () => {
  it('Reveal, Stagger, StaggerItem and Lift are not unmounted and mounted again (that would restart the entrance)', () => {
    render(<Host />)
    const reveal = screen.getByTestId('reveal-child').parentElement
    const list = screen.getByRole('list', { name: 'Itens' })
    const items = [...list.children]
    const card = screen.getByText('cartão').parentElement
    expect(reveal).not.toBeNull()
    for (let i = 0; i < 3; i++) act(() => bump())
    expect(screen.getByTestId('n')).toHaveTextContent('3')
    expect(screen.getByTestId('reveal-child').parentElement).toBe(reveal)
    expect(screen.getByRole('list', { name: 'Itens' })).toBe(list)
    expect([...list.children]).toEqual(items)
    expect(screen.getByText('cartão').parentElement).toBe(card)
  })
})
