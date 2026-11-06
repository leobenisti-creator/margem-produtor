import { screen } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { mockMatchMedia } from '../test/helpers'
import { renderWithStore } from '../test/storeHarness'
import type { Action } from '../state/types'
import { ExposureCard } from './ExposureCard'

expect.extend(toHaveNoViolations)
vi.setConfig({ testTimeout: 20000 })

beforeEach(() => {
  localStorage.clear()
  mockMatchMedia(true)
})

// 100 ha x 100 sc/ha = 10.000 sc.
const FARM: Action[] = [
  { type: 'setInput', key: 'areaHa', value: 100 },
  { type: 'setInput', key: 'yieldScHa', value: 100 },
]

describe('ExposureCard', () => {
  it('default: everything open, 100% of the production in each factor', async () => {
    await renderWithStore(<ExposureCard />, FARM)
    expect(screen.getByTestId('card-exposicao')).toHaveTextContent('Exposição')
    expect(screen.getByTestId('exp-summary')).toHaveTextContent('Hoje você está exposto a: basis, CBOT e dólar')
    for (const id of ['exp-basis', 'exp-cbot', 'exp-dolar']) {
      const row = screen.getByTestId(id)
      expect(row).toHaveTextContent('10.000 sc')
      expect(row).toHaveTextContent('Tudo em aberto')
      expect(row).toHaveTextContent('100% da produção')
      expect(row).toHaveTextContent('100,0 sc/ha')
    }
  })

  it('a sale reduces the open sacks', async () => {
    await renderWithStore(<ExposureCard />, [
      ...FARM,
      { type: 'addSale', partial: { volume: 4000, volumeUnit: 'sc', price: 120, priceCurrency: 'BRL' } },
    ])
    expect(screen.getByTestId('exp-basis')).toHaveTextContent('6.000 sc')
    expect(screen.getByTestId('exp-basis')).toHaveTextContent('Parcialmente protegido')
    expect(screen.getByTestId('exp-basis')).toHaveTextContent('60% da produção')
  })

  it('everything sold: all locked', async () => {
    await renderWithStore(<ExposureCard />, [
      ...FARM,
      { type: 'addSale', partial: { volume: 10000, volumeUnit: 'sc', price: 120, priceCurrency: 'BRL' } },
    ])
    expect(screen.getByTestId('exp-summary')).toHaveTextContent('Tudo travado')
    expect(screen.getByTestId('exp-cbot')).toHaveTextContent('Protegido')
  })

  it('operations: a soy future covers CBOT only and a put shows the floor note', async () => {
    await renderWithStore(<ExposureCard />, [
      ...FARM,
      { type: 'addHedgeOp', partial: { asset: 'soja', kind: 'futuro', side: 'vendido', qty: 2204.6, strike: 1100 } },
      {
        type: 'addHedgeOp',
        partial: { asset: 'soja', kind: 'put', side: 'comprado', qty: 2204.6, strike: 1100, premium: 30 },
      },
    ])
    expect(screen.getByTestId('exp-cbot')).toHaveTextContent('8.000 sc')
    expect(screen.getByTestId('exp-cbot')).toHaveTextContent('dos quais 1.000 sc com piso de put')
    expect(screen.getByTestId('exp-basis')).toHaveTextContent('10.000 sc')
    expect(screen.getByTestId('exp-dolar')).toHaveTextContent('10.000 sc')
  })

  it('open US$ cost in categorias mode shows costs and a negative net', async () => {
    await renderWithStore(<ExposureCard />, [
      ...FARM,
      { type: 'setCostMode', mode: 'categorias' },
      {
        type: 'setGroupTotal',
        group: 'sementes',
        value: { usd: { amountUsdHa: 100, boughtPct: 0, boughtRate: 0 } },
      },
      { type: 'addSale', partial: { volume: 10000, volumeUnit: 'sc', price: 120, priceCurrency: 'BRL' } },
    ])
    // 100 US$/ha x 100 ha = US$ 10.000 of open costs, revenue dollar fully closed: net is negative.
    expect(screen.getByTestId('exp-dolar-custos')).toHaveTextContent('US$ 10.000')
    expect(screen.getByTestId('exp-dolar-liquido')).toHaveTextContent('−')
    expect(screen.getByTestId('exp-dolar')).toHaveTextContent('posição contrária')
  })

  it('Total mode freezes the cost in R$: no open US$ costs', async () => {
    await renderWithStore(<ExposureCard />, [
      ...FARM,
      { type: 'setCostMode', mode: 'categorias' },
      {
        type: 'setGroupTotal',
        group: 'sementes',
        value: { usd: { amountUsdHa: 100, boughtPct: 0, boughtRate: 0 } },
      },
      { type: 'setCostMode', mode: 'total', fx: 5.5, farmPriceBrl: 120 },
    ])
    expect(screen.getByTestId('exp-dolar-custos')).toHaveTextContent('US$ 0')
    expect(screen.getByTestId('exp-dolar-liquido')).toHaveTextContent('10.000 sc')
  })

  it('no production: asks for area and yield', async () => {
    await renderWithStore(<ExposureCard />, [{ type: 'setInput', key: 'areaHa', value: 0 }])
    expect(screen.getByTestId('exp-summary')).toHaveTextContent('Informe área e produtividade')
    expect(screen.queryByTestId('exp-basis')).toBeNull()
  })

  it('has no axe violations', async () => {
    const { container } = await renderWithStore(<ExposureCard />, [
      ...FARM,
      { type: 'addSale', partial: { volume: 4000, volumeUnit: 'sc', price: 120, priceCurrency: 'BRL' } },
    ])
    expect(await axe(container)).toHaveNoViolations()
  })

  it('headline: total open with pills, and the profile block with its table', async () => {
    await renderWithStore(<ExposureCard />, [
      ...FARM,
      { type: 'addSale', partial: { volume: 4000, volumeUnit: 'sc', price: 120, priceCurrency: 'BRL' } },
      { type: 'addHedgeOp', partial: { asset: 'soja', kind: 'futuro', side: 'vendido', qty: 6613.8, strike: 1100 } },
    ])
    const head = screen.getByTestId('exp-total-aberto')
    expect(head).toHaveTextContent('Em aberto no total')
    expect(head).toHaveTextContent('6.000 sc')
    expect(head).toHaveTextContent('60% da produção')
    expect(head).toHaveTextContent('60,0 sc/ha')
    expect(head).toHaveTextContent('Basis 60%')
    expect(head).toHaveTextContent('CBOT 30%')
    expect(head).toHaveTextContent('Dólar 60%')
    expect(screen.getByTestId('exp-perfis')).toHaveTextContent(
      'assumimos que as proteções recaem sobre as mesmas sacas',
    )
    expect(screen.getByTestId('exp-perfil-travado')).toHaveTextContent('Tudo travado')
    expect(screen.getByTestId('exp-perfil-travado')).toHaveTextContent('4.000')
    expect(screen.getByTestId('exp-perfil-basis-dolar')).toHaveTextContent('3.000')
    expect(screen.getByTestId('exp-perfil-tudo')).toHaveTextContent('3.000')
    expect(screen.getByTestId('exp-perfil-tudo')).toHaveTextContent('30%')
  })
})
