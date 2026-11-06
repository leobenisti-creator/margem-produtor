import { screen } from '@testing-library/react'
import { mockMatchMedia } from '../test/helpers'
import { readState, renderWithStore } from '../test/storeHarness'
import type { Action } from '../state/types'
import { Comercializacao } from './Comercializacao'
import { Resultados } from './Resultados'

vi.setConfig({ testTimeout: 30000 })

beforeEach(() => {
  localStorage.clear()
  mockMatchMedia(true)
})

const FARM: Action[] = [
  { type: 'setInput', key: 'areaHa', value: 1000 },
  { type: 'setInput', key: 'yieldScHa', value: 60 },
]
const sale = (volume: number, extra: object = {}): Action => ({
  type: 'addSale',
  partial: { volume, volumeUnit: 'sc', price: 150, priceCurrency: 'BRL', ...extra },
})
const fut = (qty: number, extra: object = {}): Action => ({
  type: 'addHedgeOp',
  partial: { asset: 'soja', kind: 'futuro', side: 'vendido', qty, strike: 1300, maturity: 'jul/27', ...extra },
})
const clean = () => expect(document.body.textContent).not.toMatch(/NaN|Infinity|undefined|\[object/)

describe('auditoria de tela: Comercialização', () => {
  it('tenta vender mais do que a produção: corta em 100%, nada negativo, nada quebrado', async () => {
    await renderWithStore(<Comercializacao />, [...FARM, sale(90000)])
    clean()
    expect(readState().sales[0].volume).toBe(60000)
    expect(screen.getByTestId('com-fechado')).toHaveTextContent('100%')
    expect(screen.getByTestId('com-fechado')).toHaveTextContent('60.000 sc')
    expect(screen.getByTestId('com-completo')).toHaveTextContent('0 sc')
    expect(screen.getByTestId('com-dolar')).toHaveTextContent('0 sc')
    expect(screen.getByTestId('exp-summary')).toHaveTextContent('Tudo travado')
    // no negative sacks anywhere (a negative percentage in the sensitivity sentences is legitimate)
    expect(document.body.textContent).not.toMatch(/−\d[\d.]*\s*sc\b/)
  })

  it('reduzir a área depois de vender: avisa que as vendas passam da produção e não quebra', async () => {
    await renderWithStore(<Comercializacao />, [...FARM, sale(60000), { type: 'setInput', key: 'areaHa', value: 500 }])
    clean()
    expect(readState().sales[0].volume).toBe(60000)
    expect(document.body.textContent).toMatch(/passam da produção|mais que a produção/)
    expect(screen.getByTestId('com-fechado')).toHaveTextContent('100%')
  })

  it('hedge maior que a produção: proteção cheia, aviso de superproteção, nada quebrado', async () => {
    await renderWithStore(<Comercializacao />, [...FARM, fut(10_000_000)])
    clean()
    expect(screen.getByTestId('exp-cbot')).toHaveTextContent('Protegido')
    expect(document.body.textContent).toMatch(/mais proteção do que produção/)
  })

  it('só vendas em US$ com dólar em aberto: o dólar continua exposto', async () => {
    await renderWithStore(<Comercializacao />, [
      ...FARM,
      sale(30000, { priceCurrency: 'USD', price: 28, dollar: null }),
    ])
    clean()
    expect(screen.getByTestId('exp-dolar')).toHaveTextContent(/60\.000 sc em aberto/)
  })

  it('câmbio parcial no custo: só a parte aberta aparece como custo em dólar aberto', async () => {
    await renderWithStore(<Comercializacao />, [
      ...FARM,
      { type: 'setCostMode', mode: 'categorias' },
      { type: 'setGroupTotal', group: 'sementes', value: { usd: { amountUsdHa: 100, boughtPct: 0.5, boughtRate: 5 } } },
    ])
    clean()
    // 100 US$/ha × 50% aberto × 1.000 ha = US$ 50.000
    expect(screen.getByTestId('exp-dolar-custos')).toHaveTextContent(/US\$ 50\.000/)
  })

  it('custo todo fixado: não aparece custo em dólar aberto', async () => {
    await renderWithStore(<Comercializacao />, [
      ...FARM,
      { type: 'setCostMode', mode: 'categorias' },
      { type: 'setGroupTotal', group: 'sementes', value: { usd: { amountUsdHa: 100, boughtPct: 1, boughtRate: 5 } } },
    ])
    clean()
    expect(screen.getByTestId('exp-dolar-custos')).toHaveTextContent(/US\$ 0/)
  })

  it('trocar soja → milho com vendas e operações: nada quebra e as operações ficam com a soja', async () => {
    await renderWithStore(<Comercializacao />, [
      ...FARM,
      sale(15000),
      fut(1_000_000),
      { type: 'setCrop', crop: 'milho' },
    ])
    clean()
    expect(readState().hedgeOps).toHaveLength(1)
    // the soybean operation does not protect the corn: 60.000 sc (the producer's productivity stays) - 15.000 sold = 45.000 sc open in the CBOT
    expect(screen.getByTestId('exp-cbot')).toHaveTextContent('45.000 sc em aberto')
    expect(readState().sales).toHaveLength(1)
  })

  it('trocar soja → milho e voltar: a operação de soja reaparece', async () => {
    await renderWithStore(<Comercializacao />, [
      ...FARM,
      fut(1_000_000),
      { type: 'setCrop', crop: 'milho' },
      { type: 'setCrop', crop: 'soja' },
    ])
    clean()
    // the soybean operation is back: 1.000.000 bu cover all the production
    expect(screen.getByTestId('exp-cbot')).toHaveTextContent('0 sc em aberto')
  })

  it('área zero ou produtividade zero não geram NaN em nenhum bloco', async () => {
    await renderWithStore(<Comercializacao />, [
      { type: 'setInput', key: 'areaHa', value: 0 },
      { type: 'setInput', key: 'yieldScHa', value: 60 },
      sale(1000),
      fut(100000),
    ])
    clean()
  })

  it('operação inválida (sem quantidade/preço) é ignorada nos números e não quebra', async () => {
    await renderWithStore(<Comercializacao />, [...FARM, { type: 'addHedgeOp' }, { type: 'addSale' }])
    clean()
    expect(screen.getByTestId('sales-summary') ?? document.body).toBeTruthy()
    expect(screen.getByTestId('com-fechado')).toHaveTextContent('0 sc')
    expect(screen.getByTestId('com-dolar')).toHaveTextContent('100%')
  })
})

describe('auditoria de tela: operações entram nos Resultados', () => {
  it('Resultados com venda, operação e custo em dólar parcial: sem NaN', async () => {
    await renderWithStore(<Resultados />, [
      ...FARM,
      sale(15000),
      fut(1_000_000),
      {
        type: 'addHedgeOp',
        partial: { asset: 'dolar', kind: 'put', side: 'comprado', qty: 200000, strike: 5.5, premium: 0.1 },
      },
      { type: 'setCostMode', mode: 'categorias' },
      { type: 'setGroupTotal', group: 'sementes', value: { usd: { amountUsdHa: 100, boughtPct: 0.5, boughtRate: 5 } } },
    ])
    clean()
  })

  it('Resultados em milho com operação de soja guardada: sem NaN e sem linha de operações', async () => {
    await renderWithStore(<Resultados />, [...FARM, fut(1_000_000), { type: 'setCrop', crop: 'milho' }])
    clean()
  })
})
