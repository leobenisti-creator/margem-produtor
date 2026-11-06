import { screen, within } from '@testing-library/react'
import { findFob, shortFobLabel } from '../data/fobPoints'
import { farmPriceBrl, referencePriceBrl } from '../engine/calc'
import { CROPS } from '../engine/crops'
import { ALL_FIXED, marginParts } from '../engine/sensitivity'
import { fobBasisUsc } from '../state/basis'
import type { Action } from '../state/types'
import { engineToday, readState, renderWithStore } from '../test/storeHarness'
import { fmtCompactMoney } from './fmtExtra'
import { fmtMoney, fmtPct } from './format'
import { MiniDre } from './MiniDre'
import { PriceCompare } from './PriceCompare'

vi.setConfig({ testTimeout: 20000 })
beforeEach(() => localStorage.clear())

// 1.000 ha x 60 sc/ha = 60.000 sc; Paranaguá (the default FOB point), no legacy "Outro".
const FARM: Action[] = [
  { type: 'setInput', key: 'areaHa', value: 1000 },
  { type: 'setInput', key: 'yieldScHa', value: 60 },
  { type: 'setInput', key: 'freightBrlPerSc', value: 20 },
  { type: 'setInput', key: 'portFeesBrlPerSc', value: 8 },
]
const render = (extra: Action[] = []) => renderWithStore(<PriceCompare />, [...FARM, ...extra], { base: [] })

describe('PriceCompare: your price against the praça market price', () => {
  it('is a collapsed row named after the praça', async () => {
    await render()
    const row = screen.getByTestId('price-compare')
    expect(row).not.toHaveAttribute('open')
    const praca = shortFobLabel(findFob(readState().fobId)!)
    expect(row).toHaveTextContent(`Seu preço contra o mercado da praça · ${praca}`)
  })

  it('farm price = engine farmPriceBrl, market = the FOB estimate (referencePriceBrl at the point premium); diff in R$/sc and %', async () => {
    await render()
    const { scenario, snap } = await engineToday(readState())
    const crop = CROPS.soja
    const st = readState()
    const farm = farmPriceBrl(crop, scenario, st.inputs)
    const market = referencePriceBrl(crop, { ...scenario, basisUsc: fobBasisUsc(st) })
    expect(snap.cbotUsc.soja.value).toBe(scenario.cbotUsc)
    const box = screen.getByTestId('price-compare')
    expect(within(box).getByTestId('cmp-farm')).toHaveTextContent(`${fmtMoney(farm, 'BRL')}/sc`)
    expect(within(box).getByTestId('cmp-market')).toHaveTextContent(`${fmtMoney(market, 'BRL')}/sc`)
    const diff = farm - market
    expect(diff).toBeCloseTo(-28, 8) // freight 20 + fees 8
    expect(within(box).getByTestId('cmp-diff')).toHaveTextContent(
      `−R$ ${fmtMoney(Math.abs(diff), 'BRL').slice(3)}/sc (−${fmtPct(Math.abs(diff / market), 1)})`,
    )
    // what it means on the sacks not sold yet (nothing sold: the whole crop)
    const unsold = marginParts(crop, scenario, st.inputs, st.sales, ALL_FIXED)!.unsoldSc
    expect(unsold).toBe(60000)
    expect(within(box).getByTestId('cmp-unsold')).toHaveTextContent(`−${fmtCompactMoney(Math.abs(diff * unsold), 'BRL')}`)
  })

  it('explains the gap by freight and port fees, which add up to the difference; no premium line without an edit', async () => {
    await render()
    const box = screen.getByTestId('cmp-explain')
    expect(within(box).getByTestId('cmp-frete')).toHaveTextContent('−R$ 20,00/sc')
    expect(within(box).getByTestId('cmp-taxas')).toHaveTextContent('−R$ 8,00/sc')
    expect(within(box).queryByTestId('cmp-premio')).toBeNull()
    expect(within(box).queryByTestId('cmp-dolar')).toBeNull()
    expect(box).not.toHaveTextContent('o mercado da praça não muda')
  })

  it('a simulated basis is its own line and the text says the praça market does not change with it', async () => {
    const probe = await render()
    const { scenario } = await engineToday(readState())
    const up = fobBasisUsc(readState()) + 10 // +10 US¢/bu over the point's premium
    probe.unmount()
    await render([{ type: 'setSimBasis', value: up }])
    const st = readState()
    const crop = CROPS.soja
    const box = screen.getByTestId('price-compare')
    const move = (10 / 100) * crop.bushelsPerSack * scenario.fx
    const diff =
      farmPriceBrl(crop, { ...scenario, basisUsc: up }, st.inputs) -
      referencePriceBrl(crop, { ...scenario, basisUsc: fobBasisUsc(st) })
    expect(diff).toBeCloseTo(-28 + move, 8)
    expect(within(box).getByTestId('cmp-sim')).toHaveTextContent(`+R$ ${fmtMoney(move, 'BRL').slice(3)}/sc`)
    expect(within(box).queryByTestId('cmp-premio')).toBeNull()
    expect(box).toHaveTextContent('o mercado da praça não muda com isso')
    expect(within(box).getByTestId('cmp-diff')).toHaveTextContent(fmtMoney(Math.abs(diff), 'BRL').slice(3))
  })

  it('a premium of your own (Lavoura e custos) is told apart from a simulation', async () => {
    const probe = await render()
    const { scenario } = await engineToday(readState())
    const own = fobBasisUsc(readState()) - 5
    probe.unmount()
    await render([{ type: 'override', key: 'basisUsc', value: own }])
    const box = screen.getByTestId('price-compare')
    const move = (-5 / 100) * CROPS.soja.bushelsPerSack * scenario.fx
    expect(within(box).getByTestId('cmp-premio')).toHaveTextContent(`−R$ ${fmtMoney(Math.abs(move), 'BRL').slice(3)}/sc`)
    expect(within(box).queryByTestId('cmp-sim')).toBeNull()
    expect(box).toHaveTextContent('O prêmio que você informou é diferente do da praça')
    expect(box).not.toHaveTextContent('o mercado da praça não muda')
  })

  it('follows the chosen scenario: the market price moves with the CBOT and the dollar of the cenário', async () => {
    await render([{ type: 'applyScenario', cbotUsc: 1117.125, fx: 5.2 }])
    const st = readState()
    const { scenario } = await engineToday(st)
    expect(scenario.cbotUsc).toBe(1117.125)
    const market = referencePriceBrl(CROPS.soja, { ...scenario, basisUsc: fobBasisUsc(st) })
    expect(screen.getByTestId('cmp-market')).toHaveTextContent(`${fmtMoney(market, 'BRL')}/sc`)
    expect(screen.getByTestId('cmp-farm')).toHaveTextContent(`${fmtMoney(farmPriceBrl(CROPS.soja, scenario, st.inputs), 'BRL')}/sc`)
  })

  it('is omitted for the "Outro" FOB point (no market price)', async () => {
    await renderWithStore(<PriceCompare />, [...FARM, { type: 'setFob', fobId: 'outro' }], { base: [] })
    expect(screen.queryByTestId('price-compare')).toBeNull()
  })

  it('lives inside the DRE card', async () => {
    await renderWithStore(<MiniDre />, FARM, { base: [] })
    expect(within(screen.getByTestId('mini-dre')).getByTestId('price-compare')).toBeInTheDocument()
  })
})
