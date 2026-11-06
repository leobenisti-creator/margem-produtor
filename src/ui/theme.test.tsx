import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { StoreProvider } from '../state/StoreProvider'
import { AppShell } from './AppShell'
import { NavBar } from './NavBar'
import {
  THEME_KEY,
  applyTheme,
  getStoredTheme,
  resetThemeCache,
  setStoredTheme,
  themeForRoute,
} from './theme'

expect.extend(toHaveNoViolations)

const root = document.documentElement

beforeEach(() => {
  localStorage.clear()
  root.removeAttribute('data-theme')
  root.classList.remove('theme-anim')
  resetThemeCache()
})

describe('theme storage', () => {
  it('defaults to escuro and has its own key', () => {
    expect(THEME_KEY).toBe('margem:tema')
    expect(getStoredTheme()).toBe('escuro')
  })

  it('reads a saved claro / escuro and ignores anything else', () => {
    localStorage.setItem(THEME_KEY, 'claro')
    expect(getStoredTheme()).toBe('claro')
    localStorage.setItem(THEME_KEY, 'escuro')
    expect(getStoredTheme()).toBe('escuro')
    for (const junk of ['light', 'CLARO', '', '1', '{"a":1}']) {
      localStorage.setItem(THEME_KEY, junk)
      expect(getStoredTheme()).toBe('escuro')
    }
  })

  it('is tolerant: a throwing localStorage reads as escuro and writing does not throw', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(getStoredTheme()).toBe('escuro')
    expect(() => setStoredTheme('claro')).not.toThrow()
    get.mockRestore()
    set.mockRestore()
  })

  it('writes only its own key, never the saved scenario', () => {
    localStorage.setItem('margem:v3', 'SCENARIO')
    setStoredTheme('claro')
    expect(localStorage.getItem(THEME_KEY)).toBe('claro')
    expect(localStorage.getItem('margem:v3')).toBe('SCENARIO')
    expect(localStorage.length).toBe(2)
  })
})

describe('applyTheme / themeForRoute', () => {
  it('puts data-theme on <html> and updates the browser theme colour', () => {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.content = '#0b0c0d'
    document.head.appendChild(meta)
    applyTheme('claro')
    expect(root).toHaveAttribute('data-theme', 'light')
    expect(meta.content).toBe('#ffffff')
    applyTheme('escuro')
    expect(root).toHaveAttribute('data-theme', 'dark')
    expect(meta.content).toBe('#0b0c0d')
    meta.remove()
  })

  it('cross-fades only when asked, and clears the fade class afterwards', () => {
    vi.useFakeTimers()
    applyTheme('claro')
    expect(root.classList.contains('theme-anim')).toBe(false)
    applyTheme('escuro', true)
    expect(root.classList.contains('theme-anim')).toBe(true)
    vi.advanceTimersByTime(300)
    expect(root.classList.contains('theme-anim')).toBe(false)
    vi.useRealTimers()
  })

  it('forces dark on the Início only', () => {
    expect(themeForRoute('inicio', 'claro')).toBe('escuro')
    expect(themeForRoute('inicio', 'escuro')).toBe('escuro')
    for (const r of ['simulador', 'comercializacao', 'resultados', 'preco'] as const) {
      expect(themeForRoute(r, 'claro')).toBe('claro')
      expect(themeForRoute(r, 'escuro')).toBe('escuro')
    }
  })
})

describe('inline script in index.html (no flash of the wrong theme)', () => {
  const html = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8')
  const code = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? ''

  function run(stored: string | null, hash: string, throws = false) {
    const attrs: Record<string, string> = {}
    const meta = { content: '#0b0c0d', setAttribute: (_k: string, v: string) => (meta.content = v) }
    const fakeDoc = {
      documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) },
      querySelector: () => meta,
    }
    const fakeStore = {
      getItem: (k: string) => {
        if (throws) throw new Error('blocked')
        return k === 'margem:tema' ? stored : null
      },
    }
    new Function('document', 'location', 'localStorage', code)(fakeDoc, { hash }, fakeStore)
    return { theme: attrs['data-theme'], meta: meta.content }
  }

  it('is a plain synchronous script in <head>, before the app bundle', () => {
    expect(code).toContain('margem:tema')
    const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'))
    expect(head).toContain('<script>')
    expect(head).not.toMatch(/<script[^>]*(async|defer|type="module")/)
  })

  it('applies the saved light theme on the inner pages', () => {
    for (const hash of ['#/simulador', '#/comercializacao?x=1', '#/resultados', '#/preco']) {
      expect(run('claro', hash)).toEqual({ theme: 'light', meta: '#ffffff' })
    }
  })

  it('stays dark on the Início (any empty or unknown hash too), whatever was saved', () => {
    for (const hash of ['', '#/inicio', '#/', '#/qualquer-coisa']) {
      expect(run('claro', hash).theme).toBe('dark')
    }
  })

  it('is dark by default, for junk values and when storage throws', () => {
    expect(run(null, '#/simulador').theme).toBe('dark')
    expect(run('escuro', '#/simulador').theme).toBe('dark')
    expect(run('light', '#/simulador').theme).toBe('dark')
    expect(run('claro', '#/simulador', true).theme).toBe('dark')
  })
})

describe('theme toggle in the top bar', () => {
  const toggle = () => screen.getByRole('button', { name: /Mudar para o tema/ })

  async function setup(route?: 'simulador' | 'inicio') {
    const user = userEvent.setup()
    render(
      <StoreProvider>
        <AppShell route={route ?? 'preco'}>
          <p>page</p>
        </AppShell>
      </StoreProvider>,
    )
    await screen.findByTestId('shell-controls')
    return user
  }

  it('starts dark, names the action, flips on click, applies and saves the choice', async () => {
    const user = await setup()
    expect(root).toHaveAttribute('data-theme', 'dark')
    expect(toggle()).toHaveAccessibleName('Mudar para o tema claro')
    await user.click(toggle())
    expect(root).toHaveAttribute('data-theme', 'light')
    expect(localStorage.getItem(THEME_KEY)).toBe('claro')
    expect(toggle()).toHaveAccessibleName('Mudar para o tema escuro')
    await user.click(toggle())
    expect(root).toHaveAttribute('data-theme', 'dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('escuro')
    expect(toggle()).toHaveAccessibleName('Mudar para o tema claro')
  })

  it('opens in the saved theme', async () => {
    localStorage.setItem(THEME_KEY, 'claro')
    resetThemeCache()
    await setup()
    expect(root).toHaveAttribute('data-theme', 'light')
    expect(toggle()).toHaveAccessibleName('Mudar para o tema escuro')
  })

  it('works from the keyboard (focus, Enter, Space) and keeps a compact touch target (36 px)', async () => {
    const user = await setup()
    toggle().focus()
    expect(toggle()).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(root).toHaveAttribute('data-theme', 'light')
    await user.keyboard(' ')
    expect(root).toHaveAttribute('data-theme', 'dark')
    expect(toggle().className).toMatch(/min-h-\[36px\]/)
    expect(toggle().className).toMatch(/min-w-\[36px\]/)
  })

  it('does not touch the saved scenario', async () => {
    localStorage.setItem('margem:v3', 'SCENARIO')
    const user = await setup()
    await user.click(toggle())
    expect(localStorage.getItem('margem:v3')).toBe('SCENARIO')
  })

  it('is disabled on the Início, which is always dark', async () => {
    localStorage.setItem(THEME_KEY, 'claro')
    resetThemeCache()
    await setup('inicio')
    expect(toggle()).toBeDisabled()
    expect(root).toHaveAttribute('data-theme', 'dark')
  })

  it('NavBar passes its route down: the toggle is disabled on inicio and enabled elsewhere', async () => {
    const { unmount } = render(
      <StoreProvider>
        <NavBar route="inicio" />
      </StoreProvider>,
    )
    await screen.findByTestId('shell-controls')
    expect(toggle()).toBeDisabled()
    unmount()
    render(
      <StoreProvider>
        <NavBar route="simulador" />
      </StoreProvider>,
    )
    await screen.findByTestId('shell-controls')
    expect(toggle()).toBeEnabled()
  })
})

describe('the Início forces dark and the saved choice returns on the other pages', () => {
  it('follows the route without changing what is saved', async () => {
    localStorage.setItem(THEME_KEY, 'claro')
    resetThemeCache()
    const tree = (route: 'inicio' | 'preco' | 'resultados') => (
      <StoreProvider>
        <AppShell route={route}>
          <p>x</p>
        </AppShell>
      </StoreProvider>
    )
    const { rerender } = render(tree('preco'))
    await screen.findByText('x')
    expect(root).toHaveAttribute('data-theme', 'light')
    rerender(tree('inicio'))
    expect(root).toHaveAttribute('data-theme', 'dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('claro')
    rerender(tree('resultados'))
    expect(root).toHaveAttribute('data-theme', 'light')
    expect(localStorage.getItem(THEME_KEY)).toBe('claro')
  })
})

describe('accessibility of the top bar in both themes', () => {
  it.each(['escuro', 'claro'] as const)('has no axe violations (%s)', async (theme) => {
    localStorage.setItem(THEME_KEY, theme)
    resetThemeCache()
    const { container } = render(
      <StoreProvider>
        <AppShell route="preco">
          <p>page</p>
        </AppShell>
      </StoreProvider>,
    )
    await screen.findByTestId('shell-controls')
    expect(root).toHaveAttribute('data-theme', theme === 'claro' ? 'light' : 'dark')
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })
})
