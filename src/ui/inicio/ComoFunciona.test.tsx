import { screen, within } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { fmtNum } from '../format'
import { ComoFunciona, steps } from './ComoFunciona'
import { FakeIO, installFakeIO, removeIO } from './testUtils'
import { renderScreen, unusableSnapshot } from './telasTestKit'

expect.extend(toHaveNoViolations)
vi.setConfig({ testTimeout: 15000 })

beforeEach(() => localStorage.clear())
afterEach(() => removeIO())

const H = /Como funciona em três passos/

describe('ComoFunciona', () => {
  it('shows the three steps in the new order with badges, photos and the three lines', async () => {
    await renderScreen((ex) => <ComoFunciona ex={ex} />, undefined, H)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    const titles = items.map((li) => within(li).getByRole('heading', { level: 3 }).textContent)
    expect(titles).toEqual(['Passo 1: Lavoura e custos', 'Passo 2: Comercialização', 'Passo 3: Resultados financeiros'])
    expect(within(items[0]).getByText('Obrigatório')).toBeInTheDocument()
    expect(within(items[1]).getByText('Depois dos custos')).toBeInTheDocument()
    expect(items[2].textContent).not.toMatch(/Obrigatório|Depois dos custos/)
    items.forEach((li, i) => {
      expect(within(li).getByRole('img').getAttribute('src')).toMatch(new RegExp(`passo${i + 1}\\.jpg$`))
      for (const t of ['Você faz:', 'O app mostra:', 'Por que importa:']) expect(li.textContent).toContain(t)
    })
  })

  it('"Por que importa" numbers are the engine numbers of the example', async () => {
    const { ex } = await renderScreen((e) => <ComoFunciona ex={e} />, undefined, H)
    const items = screen.getAllByRole('listitem')
    expect(items[0].textContent).toContain(`R$ ${fmtNum(ex.why.yieldUpCostDropPerSc, 2)} por saca`)
    expect(items[0].textContent).toContain('exemplo ilustrativo')
    expect(items[0].textContent).toContain(`${fmtNum((ex.why.adubacaoShare as number) * 100, 0)}% do custo`)
    expect(items[1].textContent).toContain(`R$ ${fmtNum(ex.why.fxUpMarginPerSc, 2)} por saca`)
    expect(items[2].textContent).toContain(`R$ ${fmtNum(ex.marginPerSc, 2)} por saca`)
    expect(steps(ex)).toHaveLength(3)
  })

  it('has the informative strip with no button and no link at all', async () => {
    const { container } = await renderScreen((ex) => <ComoFunciona ex={ex} />, undefined, H)
    expect(
      screen.getByText(
        'Comece por Lavoura e custos: as outras páginas só abrem depois dela. Seus dados ficam salvos neste navegador.',
      ),
    ).toBeInTheDocument()
    expect(container.querySelectorAll('a, button')).toHaveLength(0)
    expect(container.textContent).not.toMatch(/sua conta|IMEA|média da região|B3|Cepea|ponte|sensibilidade/i)
  })

  it('has real photos with alt text and size, and a connector between steps (two, drawn)', async () => {
    const { container } = await renderScreen((ex) => <ComoFunciona ex={ex} />, undefined, H)
    for (const img of screen.getAllByRole('img')) {
      expect(img.getAttribute('alt')).toBeTruthy()
      expect(Number(img.getAttribute('width'))).toBeGreaterThan(0)
      expect(Number(img.getAttribute('height'))).toBeGreaterThan(0)
    }
    // one wide + one phone connector for each of the two gaps
    expect(container.querySelectorAll('[data-testid="connector"]')).toHaveLength(4)
  })

  it('animates the cards only when motion is allowed (they start hidden then)', async () => {
    installFakeIO()
    const { container } = await renderScreen((ex) => <ComoFunciona ex={ex} />, undefined, H)
    expect(FakeIO.instances.length).toBeGreaterThan(0)
    const lis = [...container.querySelectorAll<HTMLElement>('li')]
    expect(lis.some((l) => l.style.opacity === '0')).toBe(true)
    expect(container.querySelectorAll('[data-testid="connector"] span.origin-left, [data-testid="connector"] span.origin-top')).toHaveLength(4)
  })

  it('writes nothing to localStorage and is axe clean', async () => {
    const { container } = await renderScreen((ex) => <ComoFunciona ex={ex} />, undefined, H)
    const set = vi.spyOn(Storage.prototype, 'setItem')
    expect(await axe(container)).toHaveNoViolations()
    // the store autosaves its own key; the screen must write nothing else
    expect(set.mock.calls.filter(([k]) => k !== 'margem:v3')).toEqual([])
    set.mockRestore()
  })

  it('renders no NaN/undefined with an unusable market', async () => {
    const { container } = await renderScreen((ex) => <ComoFunciona ex={ex} />, unusableSnapshot(), H)
    expect(container.textContent).not.toMatch(/NaN|undefined|Infinity/)
  })
})
