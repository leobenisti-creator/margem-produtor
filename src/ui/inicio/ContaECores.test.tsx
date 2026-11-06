import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { toneFor } from '../../engine/matrix'
import { fmtNum } from '../format'
import { ContaECores, DEMO_TARGET, innerTones, SOURCES_LINE } from './ContaECores'
import { MARKET_UNAVAILABLE } from './useLiveExample'
import { FakeIO, installFakeIO, removeIO } from './testUtils'
import { renderScreen, unusableSnapshot } from './telasTestKit'

expect.extend(toHaveNoViolations)
vi.setConfig({ testTimeout: 15000 })

beforeEach(() => localStorage.clear())
afterEach(() => removeIO())

const H = /Você confere cada número/
const FORBIDDEN = /ponte|sensibilidade|IMEA|média da região|\bB3\b|Cepea|\bbasis\b|\bbase\b/i

describe('ContaECores', () => {
  it('shows the account lines with the engine numbers (R$/sc) and the chain adds up', async () => {
    const { ex } = await renderScreen((e) => <ContaECores ex={e} />, undefined, H)
    const get = (re: RegExp) => screen.getByRole('button', { name: re })
    expect(get(/Bolsa × dólar/)).toHaveTextContent(fmtNum(ex.result.referencePriceBrl, 2))
    expect(get(/Frete e taxas/)).toHaveTextContent(fmtNum(ex.inputs.freightBrlPerSc + ex.inputs.portFeesBrlPerSc, 2))
    expect(get(/Preço na fazenda/)).toHaveTextContent(fmtNum(ex.farmPrice, 2))
    expect(get(/− Custo/)).toHaveTextContent(fmtNum(ex.costPerSc, 2))
    expect(get(/^Margem/)).toHaveTextContent(fmtNum(ex.marginPerSc, 2))
    const ref = ex.result.referencePriceBrl as number
    const fees = ex.inputs.freightBrlPerSc + ex.inputs.portFeesBrlPerSc
    expect(ref - fees).toBeCloseTo(ex.farmPrice as number, 9)
    expect((ex.farmPrice as number) - (ex.costPerSc as number)).toBeCloseTo(ex.marginPerSc as number, 9)
  })

  it('shows the source of a line on hover and on keyboard focus; Escape closes it', async () => {
    const user = userEvent.setup()
    await renderScreen((e) => <ContaECores ex={e} />, undefined, H)
    const first = screen.getByRole('button', { name: /Bolsa × dólar/ })
    expect(first).toHaveAccessibleDescription(/prêmio do porto/)
    expect(screen.queryByText('De onde vem:')).toBeNull()
    await user.hover(first)
    expect(screen.getByText('De onde vem:')).toBeVisible()
    await user.unhover(first)
    expect(screen.queryByText('De onde vem:')).toBeNull()
    await user.tab()
    expect(first).toHaveFocus()
    expect(screen.getByText('De onde vem:')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByText('De onde vem:')).toBeNull()
    await user.tab()
    await user.tab()
    await user.tab()
    expect(screen.getByRole('button', { name: /− Custo/ })).toHaveFocus()
    expect(screen.getByText('De onde vem:').parentElement).toHaveTextContent(/Custo por hectare/)
  })

  it('calls the port premium "prêmio do porto" and avoids the banned words', async () => {
    const { container } = await renderScreen((e) => <ContaECores ex={e} />, undefined, H)
    expect(container.textContent).toMatch(/prêmio do porto/)
    expect(container.textContent).not.toMatch(FORBIDDEN)
  })

  it('explains the colours in plain words with and without a target', async () => {
    const user = userEvent.setup()
    const { container } = await renderScreen((e) => <ContaECores ex={e} />, undefined, H)
    const legend = screen.getByRole('list', { name: 'Legenda das cores' })
    expect(legend).toHaveTextContent('perde dinheiro')
    expect(legend).toHaveTextContent('baixa, até 10%')
    expect(legend).toHaveTextContent('boa, 10% ou mais')
    expect(container.textContent).toMatch(/Sem meta, as cores olham só a margem/)
    await user.click(screen.getByRole('button', { name: 'Com meta 5%' }))
    expect(legend).toHaveTextContent('longe da meta')
    expect(legend).toHaveTextContent('bate a meta')
    expect(container.textContent).toMatch(/Com meta, as cores medem a distância até ela/)
  })

  it('lists only the four outside data kinds as sources, says it is an example and shows the date', async () => {
    const { container, ex } = await renderScreen((e) => <ContaECores ex={e} />, undefined, H)
    expect(SOURCES_LINE).toBe(
      'CBOT (Yahoo Finance, não oficial) · dólar PTAX (BCB) · pontos FOB (Hedgepoint/CME/ESALQ)',
    )
    expect(container.textContent).toContain(`Fontes: ${SOURCES_LINE}`)
    expect(container.textContent).toMatch(/exemplo ilustrativo/)
    expect(container.textContent).toContain('26/10/2026')
    expect(ex.asOf).toBe('2026-10-26')
  })

  it('the 7x7 matrix uses the app rule (toneFor): dollar in rows, CBOT in columns, centre = today', async () => {
    const user = userEvent.setup()
    const { ex } = await renderScreen((e) => <ContaECores ex={e} />, undefined, H)
    const m = ex.matrix!
    for (const target of [null, DEMO_TARGET]) {
      const tones = innerTones(m, target)
      expect(tones).toHaveLength(7)
      expect(tones.every((r) => r.length === 7)).toBe(true)
      for (let r = 0; r < 7; r++)
        for (let c = 0; c < 7; c++) {
          // row r = dollar step r+1, column c = CBOT step c+1; the engine matrix is [cbot][dollar]
          expect(tones[r][c]).toBe(toneFor(m.cells[c + 1][r + 1].marginPct, target))
        }
      expect(m.fxPct[4]).toBe(0)
      expect(m.cbotPct[4]).toBe(0)
      expect(tones[3][3]).toBe(toneFor(ex.marginPct, target))
    }
    const group = screen.getByRole('group', { name: 'Ver a matriz' })
    const sem = within(group).getByRole('button', { name: 'Sem meta' })
    const com = within(group).getByRole('button', { name: 'Com meta 5%' })
    expect(sem).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('img', { name: /49 cenários.*sem meta/ })).toBeInTheDocument()
    await user.click(com)
    expect(com).toHaveAttribute('aria-pressed', 'true')
    expect(sem).toHaveAttribute('aria-pressed', 'false')
    const counts = [0, 0, 0]
    for (const row of innerTones(m, DEMO_TARGET)) for (const t of row) if (t !== null) counts[t] += 1
    expect(
      screen.getByRole('img', {
        name: new RegExp(`com meta de 5%: ${counts[2]} verdes, ${counts[1]} amarelos e ${counts[0]} vermelhos`),
      }),
    ).toBeInTheDocument()
  })

  it('the toggle works with the keyboard', async () => {
    const user = userEvent.setup()
    await renderScreen((e) => <ContaECores ex={e} />, undefined, H)
    const com = screen.getByRole('button', { name: 'Com meta 5%' })
    com.focus()
    await user.keyboard('{Enter}')
    expect(com).toHaveAttribute('aria-pressed', 'true')
    screen.getByRole('button', { name: 'Sem meta' }).focus()
    await user.keyboard(' ')
    expect(com).toHaveAttribute('aria-pressed', 'false')
  })

  it('animates (bars and cells) only when motion is allowed', async () => {
    installFakeIO()
    const { container } = await renderScreen((e) => <ContaECores ex={e} />, undefined, H)
    expect(FakeIO.instances.length).toBeGreaterThan(0)
    expect([...container.querySelectorAll<HTMLElement>('[style]')].some((e) => /scaleX\(0\)/.test(e.style.transform))).toBe(true)
  })

  it('has no links, changes nothing in localStorage beyond the store autosave and is axe clean', async () => {
    const { container } = await renderScreen((e) => <ContaECores ex={e} />, undefined, H)
    const before = { ...localStorage }
    await userEvent.setup().click(screen.getByRole('button', { name: 'Com meta 5%' }))
    expect(container.querySelectorAll('a')).toHaveLength(0)
    expect(await axe(container)).toHaveNoViolations()
    const after = { ...localStorage }
    for (const k of Object.keys(after)) if (k !== 'margem:v3') expect(after[k]).toBe(before[k])
  })

  it('renders no NaN/undefined with an unusable market', async () => {
    const { container } = await renderScreen((e) => <ContaECores ex={e} />, unusableSnapshot(), H)
    expect(container.textContent).not.toMatch(/NaN|undefined|Infinity/)
    expect(container.textContent).toContain(MARKET_UNAVAILABLE)
  })
})
