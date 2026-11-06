import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { CROPS } from '../../engine/crops'
import { buildMatrix, DEFAULT_STEPS_PCT, okCount } from '../../engine/matrix'
import { analyzeTarget } from '../../engine/targetAnalysis'
import { fmtNum } from '../format'
import { analysisForTarget, SuaMeta } from './SuaMeta'
import { MARKET_UNAVAILABLE } from './useLiveExample'
import { removeIO } from './testUtils'
import { renderScreen, unusableSnapshot } from './telasTestKit'

expect.extend(toHaveNoViolations)
vi.setConfig({ testTimeout: 15000 })

beforeEach(() => localStorage.clear())
afterEach(() => removeIO())

const H = /Diga quanto quer ganhar/
const slider = () => screen.getByRole('slider', { name: 'Meta de margem' }) as HTMLInputElement
const FORBIDDEN = /ponte|sensibilidade|IMEA|média da região|\bB3\b|Cepea/i

describe('SuaMeta', () => {
  it('has the copy and a labelled range input 0-15 step 0,5', async () => {
    const { container } = await renderScreen((e) => <SuaMeta ex={e} />, undefined, H)
    expect(container.textContent).toContain(
      'Arraste a meta e veja, num exemplo, o que precisaria acontecer para chegar lá. É só demonstração: nada aqui muda os seus dados.',
    )
    expect(container.textContent).not.toMatch(FORBIDDEN)
    const s = slider()
    expect(s.type).toBe('range')
    expect([s.min, s.max, s.step]).toEqual(['0', '15', '0.5'])
  })

  it('N de 81 equals the engine (9x9 matrix of Resultados + analyzeTarget) for several targets', async () => {
    const { ex } = await renderScreen((e) => <SuaMeta ex={e} />, undefined, H)
    const crop = CROPS.soja
    for (const t of [0, 2.5, 5, 7.5, 10, 12.5, 15]) {
      fireEvent.change(slider(), { target: { value: String(t) } })
      const inputs = { ...ex.inputs, targetMargin: t / 100 }
      // the grid exactly as the Resultados hook builds it (default steps, yield factor 1, sold included)
      const matrix = buildMatrix(crop, ex.scenario, inputs, {
        stepsPct: DEFAULT_STEPS_PCT,
        yieldFactor: 1,
        includeSold: true,
      })
      expect(matrix.cells.flat()).toHaveLength(81)
      const n = okCount(matrix, t / 100)
      expect(analyzeTarget(crop, ex.scenario, inputs, matrix)?.cellsOk).toBe(n)
      expect(analysisForTarget(ex, t)?.cellsOk).toBe(n)
      expect(screen.getByText(`${n} de 81 cenários da matriz batem a meta`)).toBeInTheDocument()
      expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', String(n))
    }
  })

  it('target above today shows what must happen; target below shows what worries and how far you go', async () => {
    const { ex } = await renderScreen((e) => <SuaMeta ex={e} />, undefined, H)
    expect((ex.marginPct as number) * 100).toBeLessThan(15)
    fireEvent.change(slider(), { target: { value: '15' } })
    expect(await screen.findByText('O que precisa acontecer')).toBeInTheDocument()
    expect(screen.getByText('O preço na fazenda precisa chegar a')).toBeInTheDocument()
    expect(screen.getByText('A produtividade precisa chegar a')).toBeInTheDocument()
    expect(screen.getByText('O custo precisa cair para')).toBeInTheDocument()
    const a = analysisForTarget(ex, 15)!
    const preco = a.levers.find((l) => l.lever === 'preco')!
    if (preco.reachable) expect(screen.getByText(`R$ ${fmtNum(preco.value, 2)}/sc`)).toBeInTheDocument()

    fireEvent.change(slider(), { target: { value: '0' } })
    expect(await screen.findByText('O que preocupa e quanto você aguenta')).toBeInTheDocument()
    expect(screen.getByText('O dólar pode cair até')).toBeInTheDocument()
    expect(screen.getByText('A CBOT pode cair até')).toBeInTheDocument()
    expect(screen.getByText('O custo pode subir até')).toBeInTheDocument()
    const b = analysisForTarget(ex, 0)!
    const fx = b.levers.find((l) => l.lever === 'dolar')!
    if (fx.reachable) expect(screen.getByText(`R$ ${fmtNum(fx.value, 2)}`)).toBeInTheDocument()
  })

  it('the headline says how far the example is from the target', async () => {
    const { ex } = await renderScreen((e) => <SuaMeta ex={e} />, undefined, H)
    fireEvent.change(slider(), { target: { value: '15' } })
    const a = analysisForTarget(ex, 15)!
    expect(a.status).toBe('abaixo')
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      `Hoje, o exemplo fica ${fmtNum(a.gapPp, 1)} pontos de margem abaixo da meta de 15,0%.`,
    )
  })

  it('the slider is focusable and labelled, follows its value, and the big readout updates', async () => {
    const user = userEvent.setup()
    await renderScreen((e) => <SuaMeta ex={e} />, undefined, H)
    const s = slider()
    // Arrow/Home/End keys are native to <input type="range"> (jsdom does not emulate them): it must be tabbable.
    await user.tab()
    expect(document.activeElement).toBe(s)
    expect(s.value).toBe('5')
    expect(s).toHaveAttribute('aria-valuetext', '5,0%')
    fireEvent.change(s, { target: { value: '5.5' } })
    expect(s.value).toBe('5.5')
    expect(s).toHaveAttribute('aria-valuetext', '5,5%')
    expect(screen.getByRole('status')).toHaveTextContent('5,5%')
  })

  it('has no links, no gauge animation without motion, changes nothing in localStorage beyond the store autosave and is axe clean', async () => {
    const { container } = await renderScreen((e) => <SuaMeta ex={e} />, undefined, H)
    const before = { ...localStorage }
    fireEvent.change(slider(), { target: { value: '9' } })
    expect(container.querySelectorAll('a')).toHaveLength(0)
    expect(container.querySelector('.transition-\\[width\\]')).toBeNull()
    expect(await axe(container)).toHaveNoViolations()
    const after = { ...localStorage }
    for (const k of Object.keys(after)) if (k !== 'margem:v3') expect(after[k]).toBe(before[k])
  })

  it('renders no NaN/undefined and no gauge with an unusable market', async () => {
    const { container } = await renderScreen((e) => <SuaMeta ex={e} />, unusableSnapshot(), H)
    expect(container.textContent).not.toMatch(/NaN|undefined|Infinity/)
    expect(container.textContent).toContain(MARKET_UNAVAILABLE)
    expect(screen.queryByText(/de 81 cenários/)).toBeNull()
    expect(screen.queryByRole('meter')).toBeNull()
  })
})
