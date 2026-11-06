import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StoreProvider, useStore } from '../state/StoreProvider'
import { Simulador } from './Simulador'
import { LEGACY_EXAMPLE, mockMatchMedia, seedState } from '../test/helpers'
import type { Action } from '../state/types'

type Store = ReturnType<typeof useStore>
let api: Store
function Grab() {
  api = useStore()
  return null
}
const target = () => api.state.inputs.targetMargin

async function open(page: 'simulador', actions: Action[] = []) {
  seedState([...LEGACY_EXAMPLE, ...actions])
  const user = userEvent.setup()
  render(
    <StoreProvider>
      <Simulador showMeta />
      <Grab />
    </StoreProvider>,
  )
  await screen.findByTestId(`page-${page}`)
  return user
}

beforeEach(() => {
  localStorage.clear()
  mockMatchMedia(true)
})

describe('Simulador without a target (default)', () => {
  // Feedback 1: the target control lives in the "Definir meta de margem" dialog under the result cards.
  async function openMeta(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: /^(Definir meta de margem|Meta: \d+%)$/ }))
    return screen.getByRole('dialog', { name: 'Meta de margem' })
  }

  it('opens with only the final margin: no target UI, no meta text, no minimum price', async () => {
    const user = await open('simulador')
    expect(target()).toBeNull()
    expect(screen.queryByRole('switch', { name: /meta de margem/i })).toBeNull()
    expect(screen.getByRole('button', { name: 'Definir meta de margem' })).toBeInTheDocument()
    expect(screen.queryByTestId('min-price')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /preço mínimo/i })).not.toBeInTheDocument()
    const dialog = await openMeta(user)
    const sw = within(dialog).getByRole('switch', { name: 'Definir meta de margem' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    expect(sw.className).toContain('min-h-[44px]')
    expect(screen.queryByRole('switch', { name: /opcional/i })).toBeNull()
    expect(within(dialog).getByText('Sem meta: o app mostra só a margem final.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Meta de margem (%)')).not.toBeInTheDocument()
    expect(within(dialog).queryByTestId('min-price')).not.toBeInTheDocument()
    expect(dialog.textContent).not.toMatch(/Preço mínimo|inatingível/)
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/)
  })

  it('turning the switch on reveals the field at 15% and shows the meta on the button', async () => {
    const user = await open('simulador')
    const dialog = await openMeta(user)
    await user.click(within(dialog).getByRole('switch', { name: /definir meta de margem/i }))
    expect(within(dialog).getByRole('switch', { name: /definir meta de margem/i })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(target()).toBe(0.15)
    expect(screen.getByLabelText('Meta de margem (%)')).toHaveValue('15')
    expect(screen.queryByText(/Sem meta:/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Meta: 15%' })).toBeInTheDocument()
    expect(within(dialog).getByTestId('min-price')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /preço mínimo/i })).toBeInTheDocument()
  })

  it('typing a target updates it; 100% on revenue is "inatingível"', async () => {
    const user = await open('simulador', [{ type: 'setTargetMargin', value: 0.15 }])
    const dialog = await openMeta(user)
    const field = within(dialog).getByLabelText('Meta de margem (%)')
    await user.clear(field)
    await user.type(field, '20')
    await user.tab()
    expect(target()).toBeCloseTo(0.2, 10)
    await user.clear(field)
    await user.type(field, '100')
    await user.tab()
    expect(within(dialog).getByTestId('min-price')).toHaveTextContent('inatingível')
  })

  it('turning the switch off sets null and hides everything again', async () => {
    const user = await open('simulador', [{ type: 'setTargetMargin', value: 0.2 }])
    const dialog = await openMeta(user)
    expect(within(dialog).getByRole('switch', { name: /definir meta/i })).toHaveAttribute('aria-checked', 'true')
    await user.click(within(dialog).getByRole('switch', { name: /definir meta/i }))
    expect(target()).toBeNull()
    expect(screen.queryByLabelText('Meta de margem (%)')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Definir meta de margem' })).toBeInTheDocument()
    expect(screen.queryByTestId('min-price')).not.toBeInTheDocument()
  })

  it('the switch toggles with the keyboard', async () => {
    const user = await open('simulador')
    const dialog = await openMeta(user)
    expect(within(dialog).getByRole('switch', { name: /definir meta/i })).toHaveFocus()
    await user.keyboard(' ')
    expect(target()).toBe(0.15)
    await user.keyboard('{Enter}')
    expect(target()).toBeNull()
  })

  it('a target saved earlier is restored with the switch on', async () => {
    const user = await open('simulador', [{ type: 'setTargetMargin', value: 0.3 }])
    expect(screen.getByRole('button', { name: 'Meta: 30%' })).toBeInTheDocument()
    await openMeta(user)
    expect(screen.getByLabelText('Meta de margem (%)')).toHaveValue('30')
  })

  it('on a narrow screen the same dialog carries the target control (no result sheet)', async () => {
    mockMatchMedia(false)
    const user = await open('simulador')
    expect(screen.queryByRole('button', { name: /ver resultado/i })).toBeNull()
    const dialog = await openMeta(user)
    expect(within(dialog).queryByTestId('min-price')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('switch', { name: 'Definir meta de margem' })).toBeInTheDocument()
  })
})
