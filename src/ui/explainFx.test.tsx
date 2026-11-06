import { render, screen, within } from '@testing-library/react'
import { computeResult, type FarmInputs } from '../engine/calc'
import { CROPS } from '../engine/crops'
import { staticProvider } from '../data/staticProvider'
import { initialState } from '../state/reducer'
import { StoreProvider } from '../state/StoreProvider'
import { findFob } from '../data/fobPoints'
import { seedState } from '../test/helpers'
import { buildExplanation, fmtStepValue, type ExplainContext } from './explain'
import { fmtBrl } from './format'
import { Waterfall } from './Waterfall'

beforeEach(() => localStorage.clear())

async function lockedCtx(currency: 'BRL' | 'USD' = 'BRL'): Promise<ExplainContext> {
  const snap = await staticProvider.getSnapshot()
  const farmInputs: FarmInputs = { ...initialState(snap).inputs, fxLockPct: 0.3, fxLockRate: 5.4 }
  const scenario = { cbotUsc: snap.cbotUsc.soja.value, basisUsc: findFob('paranagua')?.baseUsc.soja as number, fx: snap.fx.value }
  return {
    result: computeResult(CROPS.soja, scenario, farmInputs),
    farmInputs,
    scenario,
    crop: CROPS.soja,
    currency,
    fx: scenario.fx,
    marginBase: 'receita',
  }
}

describe('ExplainStep unit R$/US$ (carry from review)', () => {
  it('fmtStepValue prints a dollar rate as R$ x,xxxx/US$ and never converts it to US$', () => {
    const step = { label: 'Dólar efetivo', formula: '', value: 5.46986, unit: 'R$/US$' as const }
    expect(fmtStepValue(step, 'BRL', 5.5)).toBe('R$ 5,4699/US$')
    expect(fmtStepValue(step, 'USD', 5.5)).toBe('R$ 5,4699/US$')
    expect(fmtStepValue({ ...step, value: null }, 'BRL', 5.5)).toBe('—')
    expect(fmtStepValue({ ...step, unit: 'R$/sc', value: 100 }, 'BRL', 5.5)).toBe('R$ 100,00 /sc')
  })

  it('the farm price explanation shows the effective dollar of a locked sale', async () => {
    const ctx = await lockedCtx('USD')
    const ex = buildExplanation('precoFazenda', ctx)
    const eff = ctx.result.steps.find((s) => s.unit === 'R$/US$')
    expect(eff).toBeDefined()
    const line = ex.lines.find((l) => l.label === 'Dólar efetivo da venda')
    expect(line?.value).toMatch(/^R\$ \d,\d{4}\/US\$$/)
    expect(line?.formula).toContain('30%')
    expect(ex.lines.find((l) => l.label === 'Preço de referência')?.formula).toContain('dólar efetivo')
  })

  it('the waterfall adds up with a locked sale and names the effective dollar', async () => {
    seedState([{ type: 'setFxLock', pct: 0.3, rate: 5.4 }])
    render(
      <StoreProvider>
        <Waterfall />
      </StoreProvider>,
    )
    await screen.findByRole('list', { name: 'De onde vem o preço' })
    const ctx = await lockedCtx()
    const rows = screen.getAllByRole('listitem')
    const value = (i: number) => within(rows[i]).getByTestId('wf-value').textContent
    expect(within(rows[0]).getByTestId('wf-label')).toHaveTextContent('Bolsa (CBOT × dólar efetivo)')
    const ref = ctx.result.steps.find((s) => s.label === 'Preço de referência')?.value ?? null
    expect(value(2)).toBe(fmtBrl(ref))
    expect(value(5)).toBe(fmtBrl(ctx.result.farmPriceBrl))
    expect(screen.getByTestId('wf-fx')).toHaveTextContent(/Dólar efetivo da venda: R\$ \d,\d{4}\/US\$/)
  })
})
