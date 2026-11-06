import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { App } from './App'
import { mockMatchMedia, seedState } from './test/helpers'
import { SimulacaoComMeta } from './test/storeHarness'

// Mounts whole pages (axe/keyboard): under a full parallel run a test can pass the default 5 s.
vi.setConfig({ testTimeout: 15000 })

expect.extend(toHaveNoViolations)

// jsdom has no layout, so colour contrast cannot be computed here: it is covered
// token by token in src/styles/contrast.test.ts.
const check = (el: Element) => axe(el, { rules: { 'color-contrast': { enabled: false } } })

async function boot(hash = '') {
  window.location.hash = hash
  const view = render(<App />)
  await screen.findByRole('main')
  return view
}

beforeEach(() => {
  localStorage.clear()
  mockMatchMedia(true)
  window.location.hash = ''
})

describe('axe', () => {
  it('inicio has no axe violations', async () => {
    seedState()
    const { container } = await boot('#/inicio')
    expect(await screen.findByTestId('page-inicio')).toBeInTheDocument()
    expect(await check(container)).toHaveNoViolations()
  })

  it('mobile inicio has no axe violations', async () => {
    seedState()
    mockMatchMedia(false)
    const { container } = await boot('')
    expect(await screen.findByTestId('page-inicio')).toBeInTheDocument()
    expect(await check(container)).toHaveNoViolations()
  })

  it('simulador has no axe violations', async () => {
    seedState()
    const { container } = await boot('#/simulador')
    expect(await check(container)).toHaveNoViolations()
  })

  it('comercializacao has no axe violations', async () => {
    seedState()
    const { container } = await boot('#/comercializacao')
    expect(await check(container)).toHaveNoViolations()
  })

  it('resultados has no axe violations', async () => {
    seedState()
    const { container } = await boot('#/resultados')
    expect(await check(container)).toHaveNoViolations()
  })

  it('simulador in milho + US$ + categorias mode has no axe violations', async () => {
    seedState([
      { type: 'setCrop', crop: 'milho' },
      { type: 'setCurrency', currency: 'USD' },
      { type: 'setCostMode', mode: 'categorias' },
    ])
    const { container } = await boot('#/simulador')
    expect(within(screen.getByRole('radiogroup', { name: 'Moeda' })).getByRole('radio', { name: 'US$' })).toBeChecked()
    expect(await check(container)).toHaveNoViolations()
  })

  it('has no violations with the explain drawer open', async () => {
    seedState()
    const user = userEvent.setup()
    const { container } = await boot('#/simulador')
    await user.click(screen.getByRole('button', { name: /Como calculamos: custo por saca/ }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(await check(container)).toHaveNoViolations()
  })

  it('has no violations with the first-visit tour open', async () => {
    seedState([], false)
    const { container } = await boot('#/simulador')
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(await check(container)).toHaveNoViolations()
  })

  it('has no violations on mobile with the meta dialog open (the result sheet is gone)', async () => {
    seedState()
    mockMatchMedia(false)
    const user = userEvent.setup()
    const { container } = render(<SimulacaoComMeta />)
    await screen.findByRole('main')
    await user.click(screen.getByRole('button', { name: 'Definir meta de margem' }))
    expect(await screen.findByRole('dialog', { name: 'Meta de margem' })).toBeInTheDocument()
    expect(await check(container)).toHaveNoViolations()
  })

  it.each([true, false])('#/preco has no axe violations (wide = %s)', async (wide) => {
    seedState([{ type: 'setTargetMargin', value: 0.15 }])
    mockMatchMedia(wide)
    const { container } = await boot('#/preco')
    expect(await screen.findByTestId('page-preco')).toBeInTheDocument()
    expect(await check(container)).toHaveNoViolations()
  })

  it('mobile comercializacao has no axe violations', async () => {
    seedState()
    mockMatchMedia(false)
    const { container } = await boot('#/comercializacao')
    expect(await check(container)).toHaveNoViolations()
  })

  it('mobile resultados has no axe violations', async () => {
    seedState()
    mockMatchMedia(false)
    const { container } = await boot('#/resultados')
    expect(await check(container)).toHaveNoViolations()
  })
})
