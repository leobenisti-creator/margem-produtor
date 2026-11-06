import { render, screen } from '@testing-library/react'
import { fireIntersection, installFakeIO, removeIO } from './testUtils'
import { FadeSwap, Reveal, resetMotionSession, useFirstTime } from './motion'

const KEY = 'margem:animacoes-vistas'

function Probe({ k }: { k: string }) {
  const first = useFirstTime(k)
  return <p data-testid="p">{first ? 'toca' : 'parado'}</p>
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetMotionSession()
  installFakeIO()
})
afterEach(() => removeIO())

describe('plays once per visit (mode once)', () => {
  beforeEach(() => localStorage.setItem('margem:motion', 'once'))

  it('true the first time a key is requested, false on a remount; written once; localStorage untouched', () => {
    const a = render(<Probe k="capa.entrada" />)
    expect(screen.getByTestId('p')).toHaveTextContent('toca')
    a.rerender(<Probe k="capa.entrada" />)
    expect(screen.getByTestId('p')).toHaveTextContent('toca') // same mount keeps its answer
    a.unmount()
    const spy = vi.spyOn(Storage.prototype, 'setItem')
    render(<Probe k="capa.entrada" />)
    expect(screen.getByTestId('p')).toHaveTextContent('parado')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
    expect(JSON.parse(sessionStorage.getItem(KEY) as string)).toEqual(['capa.entrada'])
    expect(Object.keys(localStorage)).toEqual(['margem:motion'])
  })

  it('survives a fresh module load in the same tab (reload)', async () => {
    render(<Probe k="mercado.cartoes" />).unmount()
    vi.resetModules()
    const fresh = await import('./session')
    expect(fresh.hasNotPlayed('mercado.cartoes')).toBe(false)
    expect(fresh.hasNotPlayed('outra')).toBe(true)
  })

  it('ignores a corrupted stored value', () => {
    sessionStorage.setItem(KEY, '{nao e json')
    render(<Probe k="x" />)
    expect(screen.getByTestId('p')).toHaveTextContent('toca')
    resetMotionSession()
    sessionStorage.setItem(KEY, JSON.stringify([1, { a: 1 }, 'ok']))
    render(<Probe k="ok" />)
    expect(screen.getAllByTestId('p')[1]).toHaveTextContent('parado')
  })

  it('a second Reveal mount renders final state with no animation props', () => {
    const a = render(<Reveal id="t.reveal">oi</Reveal>)
    expect((a.container.firstElementChild as HTMLElement).style.opacity).toBe('0')
    expect(sessionStorage.getItem(KEY)).toBeNull() // not seen yet: not recorded
    fireIntersection(a.container.firstElementChild as Element)
    expect(JSON.parse(sessionStorage.getItem(KEY) as string)).toEqual(['t.reveal'])
    a.unmount()
    const b = render(<Reveal id="t.reveal">oi</Reveal>)
    const el = b.container.firstElementChild as HTMLElement
    expect(el.getAttribute('style')).toBeNull()
  })

  it('switching tab panels back and forth never animates', () => {
    const { rerender, container } = render(<FadeSwap id="a">um</FadeSwap>)
    rerender(<FadeSwap id="b">dois</FadeSwap>)
    rerender(<FadeSwap id="a">um</FadeSwap>)
    expect(container.firstElementChild?.getAttribute('style')).toBeNull()
  })
})

describe('mode', () => {
  it('development default replays every time', () => {
    render(<Probe k="d" />).unmount()
    render(<Probe k="d" />)
    expect(screen.getByTestId('p')).toHaveTextContent('toca')
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })

  it('margem:motion overrides both ways', () => {
    localStorage.setItem('margem:motion', 'once')
    render(<Probe k="o" />).unmount()
    render(<Probe k="o" />)
    expect(screen.getByTestId('p')).toHaveTextContent('parado')
    localStorage.setItem('margem:motion', 'always')
    render(<Probe k="o" />)
    expect(screen.getAllByTestId('p')[1]).toHaveTextContent('toca')
  })
})
