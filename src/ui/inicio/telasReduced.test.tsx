import { screen } from '@testing-library/react'
import { ComoFunciona } from './ComoFunciona'
import { OQueOAppFaz } from './OQueOAppFaz'
import { ContaECores } from './ContaECores'
import { ParaQuemFaq } from './ParaQuemFaq'
import { SuaMeta } from './SuaMeta'
import { installFakeIO, mockReducedMotion, removeIO } from './testUtils'
import { renderScreen } from './telasTestKit'

// Own file: motion caches the reduced-motion preference per module, so it is set before any render.
mockReducedMotion(true)

beforeEach(() => {
  localStorage.clear()
  // An IntersectionObserver exists, so only prefers-reduced-motion keeps the animations off.
  installFakeIO()
})
afterEach(() => removeIO())

const screens = [
  ['OQueOAppFaz', (ex: Parameters<typeof ComoFunciona>[0]['ex']) => <OQueOAppFaz ex={ex} />, /Do preço da bolsa/],
  ['ComoFunciona', (ex: Parameters<typeof ComoFunciona>[0]['ex']) => <ComoFunciona ex={ex} />, /Como funciona em três/],
  ['ContaECores', (ex: Parameters<typeof ComoFunciona>[0]['ex']) => <ContaECores ex={ex} />, /Você confere cada número/],
  ['SuaMeta', (ex: Parameters<typeof ComoFunciona>[0]['ex']) => <SuaMeta ex={ex} />, /Diga quanto quer ganhar/],
  ['ParaQuemFaq', () => <ParaQuemFaq />, /Feito para quem decide/],
] as const

describe('screens 4 to 7 with prefers-reduced-motion: reduce', () => {
  it.each(screens)('%s renders in its final state: no opacity, no transforms, no pulsing CTA', async (_n, ui, h) => {
    const { container } = await renderScreen(ui, undefined, h)
    for (const el of container.querySelectorAll<HTMLElement>('*')) {
      expect(el.style.opacity === '' || Number(el.style.opacity) === 1).toBe(true)
      expect(el.style.transform === '' || el.style.transform === 'none').toBe(true)
      expect(el.style.boxShadow).toBe('')
    }
    expect(screen.getByRole('heading', { level: 2, name: h })).toBeVisible()
  })
})
