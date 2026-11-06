import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import seed from '../../data/seed-2026-10-26.json'
import type { MarketDataProvider, MarketSnapshot } from '../../data/types'
import { StoreProvider } from '../../state/StoreProvider'
import { GATES_KEY } from '../../state/gates'
import { STORAGE_KEY } from '../../state/persist'
import type { Action } from '../../state/types'
import { LEGACY_EXAMPLE, seedState } from '../../test/helpers'
import { ALL_FIXED, marginParts } from '../../engine/sensitivity'
import { CTA_LABEL, CtaLink } from './shared'
import { useResultadosBase } from '../useResultadosBase'

expect.extend(toHaveNoViolations)
vi.setConfig({ testTimeout: 15000 })

const FILLED: Action[] = [
  ...LEGACY_EXAMPLE,
  { type: 'setInput', key: 'areaHa', value: 800 },
  { type: 'setInput', key: 'yieldScHa', value: 58 },
  { type: 'setInput', key: 'costPerHaBrl', value: 4800 },
  { type: 'addSale', partial: { volume: 8000, price: 120 } },
]

function Probe({ out }: { out: { perSc: number | null } }) {
  const { crop, today, inputs, tranches } = useResultadosBase()
  const p = marginParts(crop, today, inputs, tranches, ALL_FIXED)
  out.perSc = p && p.productionSc > 0 ? p.margin / p.productionSc : null
  return null
}

async function mount() {
  const snapshot = structuredClone(seed.snapshot) as MarketSnapshot
  const provider: MarketDataProvider = { getSnapshot: () => Promise.resolve(snapshot) }
  const out = { perSc: null as number | null }
  const view = render(
    <StoreProvider provider={provider}>
      <Probe out={out} />
      <main>
        <CtaLink />
      </main>
    </StoreProvider>,
  )
  const button = await screen.findByRole('button', { name: CTA_LABEL })
  return { ...view, button, out }
}

beforeEach(() => {
  localStorage.clear()
  window.location.hash = ''
})

describe('CtaLink + JourneyDialog: sem-custos', () => {
  beforeEach(() => {
    seedState([])
    localStorage.setItem(GATES_KEY, 'on') // the locked experience (the gates are off while developing)
  })

  it('opens a card, never navigates by itself', async () => {
    const user = userEvent.setup()
    const { button } = await mount()
    expect(button.tagName).toBe('BUTTON')
    await user.click(button)
    const dlg = screen.getByRole('dialog', { name: 'Primeiro, preencha Lavoura e custos' })
    expect(dlg).toHaveAttribute('aria-modal', 'true')
    expect(window.location.hash).toBe('')
    expect(within(dlg).getByText(/Para calcular a sua margem o app precisa da sua lavoura e do seu custo/)).toBeInTheDocument()
    expect(within(dlg).getByText('AGORA')).toBeInTheDocument()
    expect(within(dlg).getAllByText('Libera depois de preencher os custos')).toHaveLength(2)
    expect(within(dlg).getByText(/Depois de preencher, você libera as outras páginas/)).toBeInTheDocument()
    expect(within(dlg).getByText('Comercialização').closest('a')).toBeNull()
    expect(within(dlg).getByText('Resultados financeiros').closest('a')).toBeNull()
  })

  it('with the gates off (development) both pages are normal links', async () => {
    localStorage.setItem(GATES_KEY, 'off')
    const user = userEvent.setup()
    const { button } = await mount()
    await user.click(button)
    const dlg = screen.getByRole('dialog', { name: 'Primeiro, preencha Lavoura e custos' })
    expect(within(dlg).queryByText('Libera depois de preencher os custos')).toBeNull()
    expect(within(dlg).getByRole('link', { name: /Comercialização/ })).toHaveAttribute('href', '#/comercializacao')
    await user.click(within(dlg).getByRole('link', { name: /Resultados financeiros/ }))
    expect(window.location.hash).toBe('#/resultados')
  })

  it('"Ir para Lavoura e custos →" goes to #/simulador', async () => {
    const user = userEvent.setup()
    const { button } = await mount()
    await user.click(button)
    await user.click(screen.getByRole('link', { name: 'Ir para Lavoura e custos →' }))
    expect(window.location.hash).toBe('#/simulador')
  })

  it('Escape closes and focus returns to the button', async () => {
    const user = userEvent.setup()
    const { button } = await mount()
    await user.click(button)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(button).toHaveFocus()
  })

  it('has no axe violations and writes nothing to the store', async () => {
    const user = userEvent.setup()
    const { button, container } = await mount()
    const before = localStorage.getItem(STORAGE_KEY)
    await user.click(button)
    expect(await axe(document.body)).toHaveNoViolations()
    await user.keyboard('{Escape}')
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before)
    expect(container).toBeTruthy()
  })
})

describe('CtaLink + JourneyDialog: sem-custos with the farm filled', () => {
  it('with the farm only, Comercialização stays locked while the gates are on', async () => {
    localStorage.setItem(GATES_KEY, 'on')
    seedState([
      { type: 'setInput', key: 'areaHa', value: 800 },
      { type: 'setInput', key: 'yieldScHa', value: 58 },
    ])
    const user = userEvent.setup()
    const { button } = await mount()
    await user.click(button)
    expect(screen.getByText('Comercialização').closest('a')).toBeNull()
  })

  it('with the gates off Comercialização is a link to its page', async () => {
    localStorage.setItem(GATES_KEY, 'off')
    seedState([
      { type: 'setInput', key: 'areaHa', value: 800 },
      { type: 'setInput', key: 'yieldScHa', value: 58 },
    ])
    const user = userEvent.setup()
    const { button } = await mount()
    await user.click(button)
    const link = screen.getByRole('link', { name: /Comercialização/ })
    await user.click(link)
    expect(window.location.hash).toBe('#/comercializacao')
  })
})

describe('CtaLink + JourneyDialog: com-custos', () => {
  beforeEach(() => void seedState(FILLED))

  it('shows only the three pages to choose from (no summaries of the saved data)', async () => {
    const user = userEvent.setup()
    const { button } = await mount()
    await user.click(button)
    const dlg = screen.getByRole('dialog', { name: 'Bem-vindo de volta' })
    const links = within(dlg).getAllByRole('link')
    expect(links.map((l) => l.querySelector('.font-semibold')?.textContent)).toEqual([
      'Lavoura e custos',
      'Comercialização',
      'Resultados financeiros',
    ])
    // nothing read from the store: no numbers in the dialog
    expect(dlg.textContent).not.toMatch(/R\$|\d{2,}/)
  })

  it.each([
    ['Lavoura e custos', '#/simulador'],
    ['Comercialização', '#/comercializacao'],
    ['Resultados financeiros', '#/resultados'],
  ])('%s goes to %s', async (name, hash) => {
    const user = userEvent.setup()
    const { button } = await mount()
    await user.click(button)
    await user.click(screen.getByRole('link', { name: new RegExp(name) }))
    expect(window.location.hash).toBe(hash)
  })

  it('Escape closes, focus returns, axe clean, nothing written', async () => {
    const user = userEvent.setup()
    const { button } = await mount()
    const before = localStorage.getItem(STORAGE_KEY)
    await user.click(button)
    expect(await axe(document.body)).toHaveNoViolations()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(button).toHaveFocus()
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before)
  })
})
