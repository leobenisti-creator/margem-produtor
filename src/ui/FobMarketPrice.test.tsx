import { screen } from '@testing-library/react'
import type userEvent from '@testing-library/user-event'
import { computeResult, referencePriceBrl } from '../engine/calc'
import { CROPS } from '../engine/crops'
import { SACK_TON } from '../engine/units'
import { fobBasisUsc } from '../state/basis'
import type { Action } from '../state/types'
import { mockMatchMedia } from '../test/helpers'
import { readState, renderWithStore } from '../test/storeHarness'
import { CustoCard } from './CustoCard'
import { LavouraCard } from './LavouraCard'

vi.setConfig({ testTimeout: 15000 })

type User = ReturnType<typeof userEvent.setup>

async function open(actions: Action[] = []) {
  const { user } = await renderWithStore(<LavouraCard />, actions, { base: [] })
  return user
}

async function typeInto(user: User, label: string | RegExp, text: string) {
  const f = screen.getByLabelText(label)
  await user.clear(f)
  await user.type(f, text)
  await user.tab()
}

async function pick(user: User, to: string) {
  await user.click(screen.getByTitle('Unidade do prêmio, do frete e das taxas'))
  await user.click(screen.getByRole('menuitem', { name: `Mudar para ${to}` }))
}

beforeEach(() => {
  localStorage.clear()
  mockMatchMedia(true)
})

describe('FOB: preço de mercado estimado + Editar', () => {
  it('shows the estimated market price, labelled as not a live quote, with the editor already open', async () => {
    await open()
    const box = screen.getByTestId('fob-market-price')
    expect(box).toHaveTextContent(/^R\$ \d/)
    expect(box).toHaveTextContent('/sc')
    expect(screen.getByText(/não é cotação ao vivo/)).toBeInTheDocument()
    expect(screen.getByLabelText('Frete até o porto')).toBeInTheDocument()
    expect(screen.getByLabelText('Prêmio do porto')).toBeInTheDocument()
  })

  it('the three fields are open in R$/t from the start; folding and reopening keeps them', async () => {
    const user = await open()
    const before = readState()
    for (const l of ['Prêmio do porto', 'Frete até o porto', 'Taxas de porto/armazém']) {
      expect(screen.getByLabelText(l)).toBeInTheDocument()
    }
    expect(screen.getAllByTitle('Unidade do prêmio, do frete e das taxas')).toHaveLength(1)
    expect(screen.getByTitle('Unidade do prêmio, do frete e das taxas')).toHaveTextContent('R$/t')
    expect(readState().inputs).toEqual(before.inputs)
    expect(readState().overrides).toEqual(before.overrides)
    await user.click(screen.getByRole('button', { name: 'Usar preço de mercado' }))
    expect(screen.queryByLabelText('Frete até o porto')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    expect(screen.getByLabelText('Frete até o porto')).toBeInTheDocument()
  })

  it('the premium is stored in US¢/bu as the basis override, and "Usar preço de mercado" clears it and folds the fields', async () => {
    const user = await open()
    await typeInto(user, 'Prêmio do porto', '300') // R$ 300/t
    const o = readState().overrides.basisUsc
    expect(o).toBeDefined()
    // R$/t -> R$/sc -> US$/sc -> US¢/bu: round trip through the same factors the formula uses
    const crop = CROPS[readState().crop]
    expect(o).toBeCloseTo(((300 * SACK_TON) / (crop.bushelsPerSack * currentFx())) * 100, 6)
    expect(screen.getByTestId('premium-derived')).toHaveTextContent('US¢/bu')
    await user.click(screen.getByRole('button', { name: 'Usar preço de mercado' }))
    expect(readState().overrides.basisUsc).toBeUndefined()
    expect(screen.queryByLabelText('Prêmio do porto')).toBeNull()
  })

  it('one button switches the three fields to /sc together and converts what is shown', async () => {
    const user = await open()
    await typeInto(user, 'Frete até o porto', '500')
    await typeInto(user, 'Taxas de porto/armazém', '100')
    await typeInto(user, 'Prêmio do porto', '300')
    const before = readState()
    expect(before.inputs.freightBrlPerSc).toBeCloseTo(30, 6)
    await pick(user, 'R$/sc')
    expect(screen.getByLabelText('Frete até o porto')).toHaveValue('30')
    expect(screen.getByLabelText('Taxas de porto/armazém')).toHaveValue('6')
    expect(screen.getByLabelText('Prêmio do porto')).toHaveValue('18')
    // only the unit changes: nothing stored moved
    expect(readState().inputs).toEqual(before.inputs)
    expect(readState().overrides).toEqual(before.overrides)
    await typeInto(user, 'Frete até o porto', '31')
    expect(readState().inputs.freightBrlPerSc).toBe(31)
    await pick(user, 'R$/t')
    expect(screen.getByLabelText('Frete até o porto')).toHaveValue('516,67')
  })

  it('follows the top currency: US$/t, and the typed US$ is stored in R$/sc at the dollar', async () => {
    const user = await open([{ type: 'setCurrency', currency: 'USD' } as Action])
    expect(screen.getByTitle('Unidade do prêmio, do frete e das taxas')).toHaveTextContent('US$/t')
    expect(screen.getByTestId('fob-market-price')).toHaveTextContent(/^US\$ /)
    await typeInto(user, 'Frete até o porto', '100')
    expect(readState().inputs.freightBrlPerSc).toBeCloseTo(100 * SACK_TON * currentFx(), 6)
  })

  it('the engine result is the same as before for a given premium/freight/fees (formula unchanged)', async () => {
    const user = await open()
    await typeInto(user, 'Frete até o porto', '500')
    await typeInto(user, 'Taxas de porto/armazém', '100')
    const s = readState()
    const crop = CROPS[s.crop]
    const scenario = { cbotUsc: 1000, basisUsc: fobBasisUsc(s), fx: 5 }
    const r = computeResult(crop, scenario, { ...s.inputs })
    expect(r.referencePriceBrl).toBeCloseTo(referencePriceBrl(crop, scenario), 10)
    expect(r.farmPriceBrl).toBeCloseTo((r.referencePriceBrl as number) - 30 - 6, 8)
  })

  it('the Custo card no longer renders the freight and port-fee fields', async () => {
    await renderWithStore(<CustoCard />, [], { base: [] })
    expect(screen.queryByLabelText('Frete até o porto')).toBeNull()
    expect(screen.queryByLabelText('Taxas de porto/armazém')).toBeNull()
  })
})

/** The scenario dollar the store is using (override ?? snapshot), read from the rendered state. */
function currentFx(): number {
  const s = readState()
  return s.overrides.fx ?? 5.4998
}
