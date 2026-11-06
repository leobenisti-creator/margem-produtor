import { render, screen } from '@testing-library/react'
import { App } from '../App'
import { mockMatchMedia, seedState } from '../test/helpers'
import { consumeFocusRequest, requestFocus } from './focusRequest'

beforeEach(() => {
  localStorage.clear()
  consumeFocusRequest()
})

describe('focus request (Meta · editar link)', () => {
  it('is consumed once', () => {
    requestFocus('meta')
    expect(consumeFocusRequest()).toBe('meta')
    expect(consumeFocusRequest()).toBeNull()
  })

  it('a later visit to the Simulação does not open the dialog again (request consumed)', async () => {
    seedState([{ type: 'setTargetMargin', value: 0.15 }])
    mockMatchMedia(true)
    requestFocus('meta')
    window.location.hash = '#/simulador'
    const view = render(<App />)
    await screen.findByRole('dialog', { name: 'Meta de margem' })
    view.unmount()
    render(<App />)
    await screen.findByTestId('page-simulador')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
