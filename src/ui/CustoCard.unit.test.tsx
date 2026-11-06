import { screen, within } from '@testing-library/react'
import type userEvent from '@testing-library/user-event'
import { mockMatchMedia } from '../test/helpers'
import { readState, renderWithStore } from '../test/storeHarness'
import type { Action } from '../state/types'
import { CustoCard } from './CustoCard'

vi.setConfig({ testTimeout: 15000 })

// 60 sc/ha = 3,6 t/ha; R$ 7.200/ha = R$ 2.000/t.
const FARM: Action[] = [
  { type: 'setInput', key: 'yieldScHa', value: 60 },
  { type: 'setInput', key: 'costPerHaBrl', value: 7200 },
]

async function open(actions: Action[] = FARM) {
  const { user } = await renderWithStore(<CustoCard />, actions, { base: [] })
  return user
}

async function pick(user: ReturnType<typeof userEvent.setup>, from: string, to: string) {
  await user.click(screen.getAllByRole('button', { name: (n) => n === `Trocar unidade (${from})` })[0])
  await user.click(screen.getByRole('menuitem', { name: `Mudar para ${to}` }))
}

beforeEach(() => {
  localStorage.clear()
  mockMatchMedia(true)
})

describe('CustoCard: unit R$/ha ↔ R$/t', () => {
  it('starts in R$/ha; clicking the unit offers R$/t and converts the typed cost by the yield', async () => {
    const user = await open()
    expect(screen.getByLabelText('Custo por hectare')).toHaveValue('7.200')
    await pick(user, 'R$/ha', 'R$/t')
    expect(screen.getByLabelText('Custo por tonelada')).toHaveValue('2.000')
    // stored per hectare, untouched
    expect(readState().inputs.costPerHaBrl).toBe(7200)
    await pick(user, 'R$/t', 'R$/ha')
    expect(screen.getByLabelText('Custo por hectare')).toHaveValue('7.200')
  })

  it('typing in R$/t is stored per hectare', async () => {
    const user = await open()
    await pick(user, 'R$/ha', 'R$/t')
    const f = screen.getByLabelText('Custo por tonelada')
    await user.clear(f)
    await user.type(f, '1500')
    await user.tab()
    expect(readState().inputs.costPerHaBrl).toBeCloseTo(5400, 6)
  })

  it('one choice serves every group and the total line', async () => {
    const user = await open([...FARM, { type: 'setCostMode', mode: 'categorias' }])
    expect(screen.getByTestId('cost-total')).toHaveTextContent(/\/ha$/)
    await pick(user, 'R$/ha', 'R$/t')
    // a single selector for the whole card, and every group field shows the chosen unit
    expect(screen.getAllByTitle('Unidade de todos os custos deste card')).toHaveLength(1)
    const rows = screen.getAllByTestId('cost-row')
    expect(rows.length).toBeGreaterThan(1)
    for (const row of rows) expect(row).toHaveTextContent('R$/t')
    expect(screen.getByTestId('cost-total')).toHaveTextContent(/\/t$/)
  })

  it('the items inside an opened group follow the same unit (and typing there is stored per hectare)', async () => {
    const user = await open([...FARM, { type: 'setCostMode', mode: 'categorias' }])
    await user.click(screen.getByRole('button', { name: 'Abrir Sementes' }))
    const item = within(screen.getByTestId('group-sementes'))
    // "meu valor" so the item shows its own value field
    await user.click(item.getAllByRole('radio', { name: 'meu valor' })[0])
    await pick(user, 'R$/ha', 'R$/t')
    expect(item.getByTestId('item-sementes.cultura')).toHaveTextContent('R$/t')
    const field = item.getAllByLabelText(/^Valor de /)[0]
    await user.clear(field)
    await user.type(field, '100')
    await user.tab()
    // 100 R$/t × 3,6 t/ha = 360 R$/ha stored
    const stored = Object.values(readState().costGroups.sementes.items).map((i) => i.valueBrlHa)
    expect(stored.some((v) => Math.abs(v - 360) < 1e-6)).toBe(true)
  })

  it('follows the currency chosen at the top (US$/t)', async () => {
    const user = await open([...FARM, { type: 'setCurrency', currency: 'USD' }])
    expect(screen.getAllByRole('button', { name: /^Trocar unidade \(US\$\/ha\)$/ })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: /^Trocar unidade \(US\$\/ha\)$/ }))
    expect(screen.getByRole('menuitem', { name: 'Mudar para US$/t' })).toBeEnabled()
    await user.keyboard('{Escape}')
  })

  it('has no per-tonne option without a yield', async () => {
    const user2 = await open([{ type: 'setInput', key: 'yieldScHa', value: 0 }])
    await user2.click(screen.getAllByRole('button', { name: /^Trocar unidade \(R\$\/ha\)$/ })[0])
    expect(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Mudar para R$/t' })).toBeDisabled()
  })
})

describe('CustoCard: R$/sc', () => {
  it('offers R$/sc too: cost per ha ÷ yield in sc/ha, stored per hectare', async () => {
    const user = await open()
    await pick(user, 'R$/ha', 'R$/sc')
    // 7.200 R$/ha ÷ 60 sc/ha = 120 R$/sc
    expect(screen.getByLabelText('Custo por saca')).toHaveValue('120')
    const f = screen.getByLabelText('Custo por saca')
    await user.clear(f)
    await user.type(f, '100')
    await user.tab()
    expect(readState().inputs.costPerHaBrl).toBeCloseTo(6000, 6)
    await pick(user, 'R$/sc', 'R$/t')
    expect(screen.getByLabelText('Custo por tonelada')).toHaveValue('1.666,67')
  })
})
