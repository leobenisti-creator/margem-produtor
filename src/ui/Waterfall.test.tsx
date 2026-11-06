import { render, screen, within } from '@testing-library/react'
import { StoreProvider } from '../state/StoreProvider'
import { staticProvider } from '../data/staticProvider'
import { computeResult } from '../engine/calc'
import { CROPS } from '../engine/crops'
import { LEGACY_EXAMPLE, legacyState, seedState } from '../test/helpers'
import { fmtBrl } from './format'
import { Waterfall } from './Waterfall'


async function setup() {
  seedState(LEGACY_EXAMPLE)
  render(
    <StoreProvider>
      <Waterfall />
    </StoreProvider>,
  )
  await screen.findByRole('list', { name: 'De onde vem o preço' })
  const snap = await staticProvider.getSnapshot()
  const init = legacyState(snap)
  const s = { cbotUsc: snap.cbotUsc.soja.value, basisUsc: snap.basisUsc.soja.value, fx: snap.fx.value }
  const r = computeResult(CROPS.soja, s, init.inputs)
  return { r, s, inputs: init.inputs }
}

beforeEach(() => {
  localStorage.clear()
})

describe('Waterfall (P2-3 / R23)', () => {
  it('has eight rows: bolsa, + base, = referência, − frete, − taxas, = fazenda, − custo, = margem', async () => {
    await setup()
    const labels = screen.getAllByRole('listitem').map((li) => within(li).getByTestId('wf-label').textContent)
    expect(labels).toEqual([
      'Bolsa (CBOT × dólar)',
      '+ Prêmio do porto',
      '= Preço de referência',
      '− Frete',
      '− Taxas de porto/armazém',
      '= Preço na fazenda',
      '− Custo',
      '= Margem',
    ])
  })

  it('prints the sign only in the label column; values are unsigned amounts that add up', async () => {
    const { r, s, inputs } = await setup()
    const rows = screen.getAllByRole('listitem')
    const value = (i: number) => within(rows[i]).getByTestId('wf-value').textContent ?? ''
    for (let i = 0; i < 8; i++) expect(value(i)).toMatch(/^R\$ [\d.]+,\d{2}$/)
    const bolsa = (s.cbotUsc / 100) * CROPS.soja.bushelsPerSack * s.fx
    expect(value(0)).toBe(fmtBrl(bolsa))
    expect(value(1)).toBe(fmtBrl((r.referencePriceBrl ?? 0) - bolsa))
    expect(value(2)).toBe(fmtBrl(r.referencePriceBrl))
    expect(value(3)).toBe(fmtBrl(inputs.freightBrlPerSc))
    expect(value(4)).toBe(fmtBrl(inputs.portFeesBrlPerSc))
    expect(value(5)).toBe(fmtBrl(r.farmPriceBrl))
    expect(value(6)).toBe(fmtBrl(r.costPerSc))
    expect(value(7)).toBe(fmtBrl(r.marginPerSc))
    expect(within(rows[3]).getByTestId('wf-value').className).toMatch(/num/)
  })

  it('uses the chart tokens: positive/"=" rows, negative rows and the final margin', async () => {
    await setup()
    const rows = screen.getAllByRole('listitem')
    const fill = (i: number) => rows[i].querySelector('i')?.className ?? ''
    expect(fill(0)).toMatch(/bg-bar-pos/)
    expect(fill(1)).toMatch(/bg-bar-pos/) // soja basis +61,7 is a premium
    expect(fill(3)).toMatch(/bg-bar-neg/)
    expect(fill(6)).toMatch(/bg-bar-neg/)
    expect(fill(7)).toMatch(/bg-bar-final/)
    expect(rows[0].querySelector('[aria-hidden="true"]')?.className).toMatch(/bg-bar-track/)
  })
})
