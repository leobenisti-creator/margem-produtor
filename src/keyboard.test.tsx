import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import { mockMatchMedia, seedState } from './test/helpers'
import { SimulacaoComMeta } from './test/storeHarness'

// Mounts whole pages (axe/keyboard): under a full parallel run a test can pass the default 5 s.
vi.setConfig({ testTimeout: 15000 })

const INTERACTIVE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

beforeEach(() => {
  localStorage.clear()
  mockMatchMedia(true)
  window.location.hash = '#/simulador'
  seedState()
})

describe('keyboard', () => {
  it('Tab reaches every interactive control of the simulador, in DOM order', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await screen.findByRole('main')

    // Radio groups use roving tabindex: only the checked radio sits in the Tab sequence.
    const all = Array.from(container.querySelectorAll<HTMLElement>(INTERACTIVE))
    for (const el of all) expect(el.tabIndex).toBeLessThanOrEqual(0)
    const expected = all.filter((el) => el.tabIndex >= 0)
    expect(expected.length).toBeGreaterThan(20)

    const visited: Element[] = []
    for (let i = 0; i < expected.length; i++) {
      await user.tab()
      visited.push(document.activeElement!)
    }
    expect(visited).toEqual(expected)
  }, 15000)

  it('has no positive tabindex anywhere, including dialogs', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await screen.findByRole('main')
    await user.click(screen.getByRole('button', { name: /Como calculamos: custo por saca/ }))
    await screen.findByRole('dialog')
    for (const el of container.querySelectorAll('[tabindex]')) {
      expect(Number(el.getAttribute('tabindex'))).toBeLessThanOrEqual(0)
    }
  })

  it('the meta dialog traps Tab and Shift+Tab, Esc closes and returns focus to its button (mobile)', async () => {
    mockMatchMedia(false)
    seedState([{ type: 'setTargetMargin', value: 0.15 }])
    const user = userEvent.setup()
    render(<SimulacaoComMeta />)
    await screen.findByRole('main')
    const trigger = screen.getByRole('button', { name: 'Meta: 15%' })
    await user.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Meta de margem' })

    const n = dialog.querySelectorAll(INTERACTIVE).length
    expect(n).toBeGreaterThan(0)
    // one full lap plus two steps: the focus must wrap inside the dialog, never leak out
    for (let i = 0; i < n + 2; i++) {
      await user.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
    for (let i = 0; i < n + 2; i++) {
      await user.tab({ shift: true })
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
  })
})

describe('nested dialogs (meta dialog > explain drawer)', () => {
  async function openBoth() {
    mockMatchMedia(false)
    seedState([{ type: 'setTargetMargin', value: 0.15 }])
    const user = userEvent.setup()
    render(<SimulacaoComMeta />)
    await screen.findByRole('main')
    await user.click(screen.getByRole('button', { name: 'Meta: 15%' }))
    const sheet = await screen.findByRole('dialog', { name: 'Meta de margem' })
    const info = within(sheet).getAllByRole('button', { name: /Como calculamos/ })[0]
    await user.click(info)
    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(2))
    const dialogs = screen.getAllByRole('dialog')
    expect(dialogs).toHaveLength(2)
    return { user, sheet, info, drawer: dialogs.find((d) => d !== sheet)! }
  }

  it('Esc closes only the drawer, focus returns to the "i" inside the sheet; a second Esc closes the sheet', async () => {
    const { user, sheet, info, drawer } = await openBoth()
    await user.keyboard('{Escape}')
    expect(drawer).not.toBeInTheDocument()
    expect(sheet).toBeInTheDocument()
    expect(info).toHaveFocus()
    expect(document.body.style.overflow).toBe('hidden')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })

  it('Tab and Shift+Tab cycle inside the drawer only', async () => {
    const { user, sheet, drawer } = await openBoth()
    const n = drawer.querySelectorAll(INTERACTIVE).length
    for (let i = 0; i < n + 2; i++) {
      await user.tab()
      expect(drawer).toContainElement(document.activeElement as HTMLElement)
    }
    for (let i = 0; i < n + 2; i++) {
      await user.tab({ shift: true })
      expect(drawer).toContainElement(document.activeElement as HTMLElement)
    }
    expect(sheet).toBeInTheDocument()
  })
})
