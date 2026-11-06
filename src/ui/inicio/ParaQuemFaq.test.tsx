import sharedSrc from './shared.tsx?raw'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { ParaQuemFaq, PROFILES } from './ParaQuemFaq'
import { CTA_LABEL } from './shared'
import { FakeIO, installFakeIO, removeIO } from './testUtils'
import { renderScreen } from './telasTestKit'

expect.extend(toHaveNoViolations)
vi.setConfig({ testTimeout: 15000 })

beforeEach(() => localStorage.clear())
afterEach(() => removeIO())

const H = /Feito para quem decide a venda da safra/

describe('ParaQuemFaq', () => {
  it('has the title, the final photo and four profile tabs with one sentence each', async () => {
    const { container } = await renderScreen(() => <ParaQuemFaq />, undefined, H)
    expect(container.querySelector('img')?.getAttribute('src')).toMatch(/final\.jpg$/)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Produtor', 'Consultor', 'Banco', 'Cooperativa'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent(PROFILES[0].text)
    for (const p of PROFILES) expect(p.text.match(/\./g)).toHaveLength(1)
  })

  it('has no FAQ, no footer and none of the banned words', async () => {
    const { container } = await renderScreen(() => <ParaQuemFaq />, undefined, H)
    expect(container.textContent).not.toMatch(/HEDGEPOINT|Material indicativo|Dúvidas|Preciso detalhar|Fontes:/i)
    expect(container.textContent).not.toMatch(/ponte|sensibilidade|IMEA|média da região|\bB3\b|Cepea/i)
    expect(container.querySelector('[aria-expanded]')).toBeNull()
  })

  it('tabs work with click and arrow/Home/End keys (roving tabindex) and the panel follows', async () => {
    const user = userEvent.setup()
    await renderScreen(() => <ParaQuemFaq />, undefined, H)
    const tabs = screen.getAllByRole('tab')
    await user.click(tabs[2])
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent(PROFILES[2].text)
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Banco')
    expect(tabs[0]).toHaveAttribute('tabindex', '-1')
    await user.keyboard('{ArrowRight}')
    expect(tabs[3]).toHaveAttribute('aria-selected', 'true')
    expect(tabs[3]).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{End}')
    expect(tabs[3]).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Home}')
    expect(tabs[0]).toHaveFocus()
  })

  it('has no links to internal pages: the only action is the CTA button', async () => {
    const { container } = await renderScreen(() => <ParaQuemFaq />, undefined, H)
    expect(container.querySelectorAll('a')).toHaveLength(0)
    expect(screen.getAllByRole('button', { name: CTA_LABEL })).toHaveLength(1)
  })

  it('the CTA glow is finite (3 pulses, then still: WCAG 2.2.2)', async () => {
    installFakeIO()
    await renderScreen(() => <ParaQuemFaq />, undefined, H)
    expect(FakeIO.instances.length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: CTA_LABEL })).toBeInTheDocument()
    // Pulse declared once in CtaLink: repeat 2 = 3 plays, never Infinity. (Under reduced motion see telasReduced.)
    expect(sharedSrc.includes('repeat: 2,')).toBe(true)
    expect(sharedSrc.includes('Infinity')).toBe(false)
  })

  it('changes nothing in localStorage beyond the store autosave and is axe clean', async () => {
    const { container } = await renderScreen(() => <ParaQuemFaq />, undefined, H)
    const before = { ...localStorage }
    await userEvent.setup().click(screen.getAllByRole('tab')[1])
    expect(await axe(container)).toHaveNoViolations()
    const after = { ...localStorage }
    for (const k of Object.keys(after)) if (k !== 'margem:v3') expect(after[k]).toBe(before[k])
  })
})
