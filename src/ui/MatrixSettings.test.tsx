import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StoreProvider } from '../state/StoreProvider'
import { MatrixSettings, stepErrors } from './MatrixSettings'
import { YieldSelector, yieldFactorLabel } from './YieldSelector'

beforeEach(() => localStorage.clear())

describe('stepErrors', () => {
  it('accepts the default and pt-BR decimals', () => {
    expect(stepErrors(['2,5', '5', '10', '20'])).toEqual(['', '', '', ''])
    expect(stepErrors(['1.5', '3', '7,25', '99'])).toEqual(['', '', '', ''])
  })

  it('names each problem in Portuguese', () => {
    expect(stepErrors(['', '5', '10', '20'])[0]).toBe('Digite um número.')
    expect(stepErrors(['abc', '5', '10', '20'])[0]).toBe('Digite um número.')
    expect(stepErrors(['0', '5', '10', '20'])[0]).toBe('O passo tem que ser maior que 0%.')
    expect(stepErrors(['-1', '5', '10', '20'])[0]).toBe('O passo tem que ser maior que 0%.')
    expect(stepErrors(['2,5', '5', '10', '100'])[3]).toBe('O passo tem que ser menor que 100%.')
    expect(stepErrors(['2,5', '5', '5', '20'])[2]).toBe('Cada passo tem que ser maior que o anterior (5%).')
  })
})

describe('MatrixSettings / YieldSelector', () => {
  it('the trigger is a 44 px button that opens a labelled modal dialog; Fechar closes it and returns focus', async () => {
    const user = userEvent.setup()
    render(
      <StoreProvider>
        <MatrixSettings />
      </StoreProvider>,
    )
    const open = await screen.findByRole('button', { name: /ajustar variações/i })
    expect(open.className).toContain('min-h-[44px]')
    expect(open).toHaveAttribute('aria-expanded', 'false')
    await user.click(open)
    const dialog = screen.getByRole('dialog', { name: 'Variações da matriz' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByLabelText('Passo 1 (%)')).toHaveFocus()
    expect(screen.getByLabelText('Passo 1 (%)')).toHaveValue('2,5')
    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(open).toHaveFocus()
  })

  it('yield selector offers −10% / base / +10%', async () => {
    render(
      <StoreProvider>
        <YieldSelector />
      </StoreProvider>,
    )
    const group = await screen.findByRole('radiogroup', { name: 'Produtividade da matriz' })
    expect([...group.querySelectorAll('[role="radio"]')].map((r) => r.textContent)).toEqual(['−10%', 'base', '+10%'])
    expect(screen.getByRole('radio', { name: 'base' })).toHaveAttribute('aria-checked', 'true')
    expect(yieldFactorLabel(0.9)).toBe('−10%')
    expect(yieldFactorLabel(1.1)).toBe('+10%')
    expect(yieldFactorLabel(1)).toBe('base')
  })
})
