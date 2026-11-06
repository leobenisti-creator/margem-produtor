import { screen, within } from '@testing-library/react'
import type { Action } from '../state/types'
import { renderWithStore } from '../test/storeHarness'
import { MiniDre } from './MiniDre'

vi.setConfig({ testTimeout: 20000 })
beforeEach(() => localStorage.clear())

/** "R$ 1.234,56" / "−R$ ..." to a number. */
function num(text: string | null): number {
  const t = (text ?? '')
    .replace(/[^\d,−-]/g, '')
    .replace(',', '.')
    .replace('−', '-')
  return Number(t)
}

// 1.000 ha x 60 sc/ha = 60.000 sc
const FARM: Action[] = [
  { type: 'setInput', key: 'areaHa', value: 1000 },
  { type: 'setInput', key: 'yieldScHa', value: 60 },
]
const usdSale = (extra: object): Action => ({
  type: 'addSale',
  partial: { volume: 20000, volumeUnit: 'sc', price: 26, priceCurrency: 'USD', ...extra },
})

async function revenue(sale: Action | null): Promise<number> {
  const view = await renderWithStore(<MiniDre />, [...FARM, ...(sale ? [sale] : [])])
  const v = num(within(screen.getByTestId('mini-dre')).getByTestId('dre-revenue').textContent)
  view.unmount()
  return v
}

describe('DRE: a US$ sale with the dollar open follows the dollar of the scenario (audit E1)', () => {
  it('the dollar saved with the sale does not change the revenue: 5,00 or 5,50 saved give the same DRE', async () => {
    const a = await revenue(usdSale({ dollar: null, marketDollar: 5.0 }))
    const b = await revenue(usdSale({ dollar: null, marketDollar: 5.5 }))
    expect(a).toBeCloseTo(b, 6)
  })

  it('a typed (fixed) dollar is different from an open one: it does not follow the scenario', async () => {
    const open = await revenue(usdSale({ dollar: null, marketDollar: 5.0 }))
    const fixed = await revenue(usdSale({ dollar: 5.0 }))
    // the seed dollar is above 5,00: the open sale is worth more than the one fixed at 5,00
    expect(open).toBeGreaterThan(fixed)
    // 20.000 sc x US$ 26 x (seed dollar 5,4998 - 5,00) / 60.000 sc = R$ 4,33 per sack
    const diff = open - fixed
    expect(diff).toBeCloseTo(((5.4998 - 5.0) * 26 * 20000) / 60000, 1)
  })

  it('an R$ sale is not touched', async () => {
    const base = await revenue(null)
    const brl = await revenue({
      type: 'addSale',
      partial: { volume: 20000, volumeUnit: 'sc', price: 150, priceCurrency: 'BRL' },
    })
    expect(Number.isFinite(base) && Number.isFinite(brl)).toBe(true)
    expect(brl).not.toBe(base)
  })
})
