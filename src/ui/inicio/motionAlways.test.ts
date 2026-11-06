import { hasNotPlayed, markPlayed, motionMode, resetMotionSession } from './session'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetMotionSession()
})

describe('the Início animates always by default', () => {
  it('the default mode is "always", and an animation never counts as already played', () => {
    expect(motionMode()).toBe('always')
    markPlayed('capa.entrada')
    expect(hasNotPlayed('capa.entrada')).toBe(true)
    expect(sessionStorage.getItem('margem:animacoes-vistas')).toBeNull()
  })

  it('the opt-in "once" mode still plays each key one time per visit', () => {
    localStorage.setItem('margem:motion', 'once')
    expect(motionMode()).toBe('once')
    expect(hasNotPlayed('capa.entrada')).toBe(true)
    markPlayed('capa.entrada')
    expect(hasNotPlayed('capa.entrada')).toBe(false)
  })
})
