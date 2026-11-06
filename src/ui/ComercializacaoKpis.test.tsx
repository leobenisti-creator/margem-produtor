import { screen } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import type { Action } from '../state/types'
import { renderWithStore } from '../test/storeHarness'
import { ComercializacaoKpis } from './ComercializacaoKpis'

vi.setConfig({ testTimeout: 20000 })
expect.extend(toHaveNoViolations)
beforeEach(() => localStorage.clear())

// 1.000 ha x 60 sc/ha = 60.000 sc
const FARM: Action[] = [
  { type: 'setInput', key: 'areaHa', value: 1000 },
  { type: 'setInput', key: 'yieldScHa', value: 60 },
]
const card = (id: string) => screen.getByTestId(id)

describe('ComercializacaoKpis: dólar, por completo, basis, fechado', () => {
  it('has the four cards in the order asked, each in % and in sacks', async () => {
    await renderWithStore(<ComercializacaoKpis />, FARM)
    const ids = ['com-fechado', 'com-completo', 'com-dolar', 'com-basis']
    const els = ids.map(card)
    for (let i = 0; i < els.length - 1; i++) {
      expect(els[i].compareDocumentPosition(els[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(card('com-fechado')).toHaveTextContent('Safra protegida')
    expect(card('com-completo')).toHaveTextContent('100% exposta')
    expect(card('com-dolar')).toHaveTextContent('Exposta ao dólar')
    expect(card('com-basis')).toHaveTextContent('Exposta ao basis')
  })

  it('nothing done: everything open, nothing closed', async () => {
    await renderWithStore(<ComercializacaoKpis />, FARM)
    for (const id of ['com-dolar', 'com-completo', 'com-basis']) {
      expect(card(id)).toHaveTextContent('100%')
      expect(card(id)).toHaveTextContent('60.000 sc')
    }
    expect(card('com-fechado')).toHaveTextContent('0 sc')
  })

  it('a sale in R$ closes price, basis and dollar of those sacks', async () => {
    await renderWithStore(<ComercializacaoKpis />, [
      ...FARM,
      { type: 'addSale', partial: { volume: 24000, volumeUnit: 'sc', price: 150, priceCurrency: 'BRL' } },
    ])
    expect(card('com-fechado')).toHaveTextContent('40%')
    expect(card('com-fechado')).toHaveTextContent('24.000 sc')
    expect(card('com-dolar')).toHaveTextContent('60%')
    expect(card('com-dolar')).toHaveTextContent('36.000 sc')
    expect(card('com-basis')).toHaveTextContent('36.000 sc')
    expect(card('com-completo')).toHaveTextContent('36.000 sc')
  })

  it('every card shows the value of its sacks at today price next to the sacks', async () => {
    await renderWithStore(<ComercializacaoKpis />, [
      ...FARM,
      { type: 'addSale', partial: { volume: 24000, volumeUnit: 'sc', price: 150, priceCurrency: 'BRL' } },
    ])
    expect(card('com-fechado')).toHaveTextContent(/24\.000 sc · R\$ [\d,]+ mi/)
    expect(card('com-dolar')).toHaveTextContent(/36\.000 sc · R\$ [\d,]+ mi/)
    expect(card('com-basis')).toHaveTextContent(/36\.000 sc · R\$ [\d,]+ mi/)
    expect(card('com-completo')).toHaveTextContent(/36\.000 sc · R\$ [\d,]+ mi/)
  })

  it('a sale in US$ with the dollar open closes the price but leaves the dollar exposed', async () => {
    await renderWithStore(<ComercializacaoKpis />, [
      ...FARM,
      {
        type: 'addSale',
        partial: { volume: 24000, volumeUnit: 'sc', price: 28, priceCurrency: 'USD', dollar: null, marketDollar: 5.5 },
      },
    ])
    expect(card('com-dolar')).toHaveTextContent('100%') // the 24.000 sc sold in US$ still follow the dollar
    expect(card('com-basis')).toHaveTextContent('36.000 sc')
    expect(card('com-fechado')).toHaveTextContent('0 sc')
  })

  it('the dollar card shows the net against open US$ costs when there are some', async () => {
    await renderWithStore(<ComercializacaoKpis />, [
      ...FARM,
      { type: 'setCostMode', mode: 'categorias' },
      { type: 'setGroupTotal', group: 'sementes', value: { usd: { amountUsdHa: 100, boughtPct: 0, boughtRate: 0 } } },
    ])
    expect(card('com-dolar')).toHaveTextContent(/líquido dos custos em US\$: [\d.]+ sc/)
  })

  it('a future covering the CBOT leaves the dollar and the basis open but not everything', async () => {
    await renderWithStore(<ComercializacaoKpis />, [
      ...FARM,
      { type: 'addHedgeOp', partial: { qty: 1_000_000, strike: 1300 } }, // 453.593 sc: covers all the CBOT
    ])
    expect(card('com-completo')).toHaveTextContent('0 sc')
    expect(card('com-dolar')).toHaveTextContent('60.000 sc')
    expect(card('com-basis')).toHaveTextContent('60.000 sc')
  })

  it('everything sold in R$ is completely closed', async () => {
    await renderWithStore(<ComercializacaoKpis />, [
      ...FARM,
      { type: 'addSale', partial: { volume: 60000, volumeUnit: 'sc', price: 150, priceCurrency: 'BRL' } },
    ])
    expect(card('com-fechado')).toHaveTextContent('100%')
    expect(card('com-fechado')).toHaveTextContent('60.000 sc')
    for (const id of ['com-dolar', 'com-completo', 'com-basis']) expect(card(id)).toHaveTextContent('0 sc')
  })

  it('without area and yield it asks for them instead of inventing numbers', async () => {
    await renderWithStore(<ComercializacaoKpis />, [
      { type: 'setInput', key: 'areaHa', value: 0 },
      { type: 'setInput', key: 'yieldScHa', value: 0 },
    ])
    for (const id of ['com-dolar', 'com-completo', 'com-basis', 'com-fechado']) {
      expect(card(id)).toHaveTextContent('informe área e produtividade')
      expect(card(id)).toHaveTextContent('—')
    }
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/)
  })

  it('small shares keep one decimal (0,5%), the percentages never pass 100%', async () => {
    await renderWithStore(<ComercializacaoKpis />, [
      ...FARM,
      { type: 'addSale', partial: { volume: 59700, volumeUnit: 'sc', price: 150, priceCurrency: 'BRL' } },
    ])
    expect(card('com-dolar')).toHaveTextContent('0,5%')
    expect(card('com-dolar')).toHaveTextContent('300 sc')
  })

  it('has no axe violations', async () => {
    const { container } = await renderWithStore(<ComercializacaoKpis />, FARM)
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })
})
