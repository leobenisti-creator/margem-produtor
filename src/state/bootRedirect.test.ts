import { redirectToInicioOnBoot } from './bootRedirect'
import { GATES_KEY } from './gates'

function fakeWin(hash: string) {
  const replaceState = vi.fn()
  return { win: { location: { hash }, history: { replaceState } } as unknown as Window, replaceState }
}

afterEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '#')
})

describe('redirectToInicioOnBoot', () => {
  it.each(['#/simulador', '#/comercializacao', '#/resultados?analise=1', '#/preco', '#/xyz'])(
    'sends %s to Início, once, with replaceState',
    (hash) => {
      const { win, replaceState } = fakeWin(hash)
      expect(redirectToInicioOnBoot(win, true)).toBe(true)
      expect(replaceState).toHaveBeenCalledTimes(1)
      expect(replaceState).toHaveBeenCalledWith(null, '', '#/inicio')
    },
  )

  it.each(['', '#', '#/inicio', '#/inicio?x=1'])('leaves %j alone', (hash) => {
    const { win, replaceState } = fakeWin(hash)
    expect(redirectToInicioOnBoot(win, true)).toBe(false)
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('does nothing with the gates off', () => {
    const { win, replaceState } = fakeWin('#/resultados')
    expect(redirectToInicioOnBoot(win, false)).toBe(false)
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('follows gatesEnabled() by default, rewrites the real location without a new history entry', () => {
    localStorage.setItem(GATES_KEY, 'off')
    window.history.replaceState(null, '', '#/resultados')
    expect(redirectToInicioOnBoot()).toBe(false)
    expect(window.location.hash).toBe('#/resultados')
    localStorage.setItem(GATES_KEY, 'on')
    const len = window.history.length
    expect(redirectToInicioOnBoot()).toBe(true)
    expect(window.location.hash).toBe('#/inicio')
    expect(window.history.length).toBe(len)
  })

  it('in-app navigation after boot is not redirected (the redirect only runs at boot)', () => {
    localStorage.setItem(GATES_KEY, 'on')
    window.history.replaceState(null, '', '#/simulador')
    redirectToInicioOnBoot()
    window.location.hash = '#/comercializacao'
    expect(window.location.hash).toBe('#/comercializacao')
  })
})
