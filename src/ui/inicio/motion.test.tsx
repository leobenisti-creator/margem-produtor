import { render, screen } from '@testing-library/react'
import { mockReducedMotion, removeIO } from './testUtils'
import { CountUp, DrawRule, useFirstTime, FadeSwap, GrowBar, Lift, Parallax, Reveal, Stagger, StaggerItem } from './motion'

// Own file: motion caches the reduced-motion preference per module, so it is set before any render.
mockReducedMotion(true)
afterEach(() => removeIO())

describe('motion kit with prefers-reduced-motion', () => {
  it('renders everything in its final, visible state (no opacity 0, no transforms)', () => {
    render(
      <div>
        <Reveal as="section">
          <p>revela</p>
        </Reveal>
        <Stagger as="ul" role="list" ariaLabel="Itens">
          <StaggerItem as="li">um</StaggerItem>
          <StaggerItem as="li">dois</StaggerItem>
        </Stagger>
        <Parallax>
          <img alt="foto" src="x.jpg" />
        </Parallax>
        <FadeSwap id="a">
          <p>painel</p>
        </FadeSwap>
        <Lift>
          <p>cartão</p>
        </Lift>
        <CountUp value={12.5} format={(n) => `R$ ${n.toFixed(2)}`} />
        <DrawRule />
        <div data-testid="barra" className="h-2 w-40">
          <GrowBar ratio={0.4} />
        </div>
      </div>,
    )
    for (const t of ['revela', 'um', 'dois', 'painel', 'cartão']) expect(screen.getByText(t)).toBeVisible()
    expect(screen.getByRole('list', { name: 'Itens' })).toBeInTheDocument()
    expect(screen.getByAltText('foto')).toBeVisible()
    expect(screen.getByText('R$ 12.50')).toBeVisible()
    const bar = screen.getByTestId('barra').firstElementChild as HTMLElement
    expect(bar.style.width).toBe('40%')
    for (const el of document.body.querySelectorAll<HTMLElement>('*')) {
      expect(el.style.opacity === '' || Number(el.style.opacity) === 1).toBe(true)
      expect(el.style.transform === '' || el.style.transform === 'none').toBe(true)
    }
  })

  it('clamps the bar ratio to 0..1', () => {
    render(
      <div>
        <div data-testid="a">
          <GrowBar ratio={2} />
        </div>
        <div data-testid="b">
          <GrowBar ratio={-1} />
        </div>
      </div>,
    )
    expect((screen.getByTestId('a').firstElementChild as HTMLElement).style.width).toBe('100%')
    expect((screen.getByTestId('b').firstElementChild as HTMLElement).style.width).toBe('0%')
  })

  it('writes nothing to storage and useFirstTime is false', () => {
    localStorage.setItem('margem:motion', 'once')
    function P() {
      return <p>{useFirstTime('k.reduzido') ? 'toca' : 'parado'}</p>
    }
    render(
      <div>
        <P />
        <Reveal id="r.reduzido">x</Reveal>
      </div>,
    )
    expect(screen.getByText('parado')).toBeInTheDocument()
    expect(sessionStorage.getItem('margem:animacoes-vistas')).toBeNull()
    expect(Object.keys(localStorage)).toEqual(['margem:motion'])
  })
})
