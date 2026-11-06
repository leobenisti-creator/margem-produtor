import { screen, within } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { findFob, fobPointsFor } from '../data/fobPoints'
import { useStore } from '../state/StoreProvider'
import { CROPS } from '../engine/crops'
import { SACK_TON } from '../engine/units'
import { readState, renderWithStore } from '../test/storeHarness'
import { LavouraCard } from './LavouraCard'

function BasisProbe() {
  const { scenario } = useStore()
  return <output data-testid="basis">{scenario.basisUsc}</output>
}

expect.extend(toHaveNoViolations)

const ui = (
  <>
    <LavouraCard />
    <BasisProbe />
  </>
)

afterEach(() => localStorage.clear())

describe('LavouraCard: Praça', () => {
  it('replaces "Região" with a grouped "Praça" select, Paranaguá first, "Outro" last', async () => {
    await renderWithStore(ui, [], { base: [] })
    expect(screen.queryByLabelText('Região')).not.toBeInTheDocument()
    const select = screen.getByLabelText('Praça') as HTMLSelectElement
    expect(select.value).toBe('paranagua')
    const groups = within(select).getAllByRole('group').map((g) => g.getAttribute('label'))
    expect(groups).toEqual(['Portos', 'Matopiba', 'Centro-Oeste', 'GO e MG', 'Sul'])
    const options = within(select).getAllByRole('option')
    expect(options).toHaveLength(23 + 1)
    expect(options[0]).toHaveValue('paranagua')
    expect(options.at(-1)).toHaveValue('outro')
    expect(options.at(-1)).toHaveTextContent('Outro (digitar os dados)')
  })

  it('milho lists its 20 points (Barreiras entered with the 04/11 report)', async () => {
    await renderWithStore(ui, [{ type: 'setCrop', crop: 'milho' }], { base: [] })
    const select = screen.getByLabelText('Praça')
    expect(within(select).getAllByRole('option')).toHaveLength(20 + 1)
    expect(within(select).getAllByRole('group').map((g) => g.getAttribute('label'))).toContain('Matopiba')
  })

  it('picking a point changes the scenario base and prefills nothing', async () => {
    const { user } = await renderWithStore(ui, [], { base: [] })
    expect(screen.getByTestId('basis')).toHaveTextContent('3.5')
    await user.selectOptions(screen.getByLabelText('Praça'), 'sorriso')
    expect(readState().fobId).toBe('sorriso')
    expect(screen.getByTestId('basis')).toHaveTextContent(String(findFob('sorriso')?.baseUsc.soja))
    // Even an MT point leaves the producer's fields empty, with no regional-average note.
    expect(readState().inputs.yieldScHa).toBe(0)
    expect(readState().inputs.areaHa).toBe(0)
    expect(screen.queryByText(/média da região/)).not.toBeInTheDocument()
  })

  it('a point outside MT starts empty, without "média da região"', async () => {
    const { user } = await renderWithStore(ui, [{ type: 'setFob', fobId: 'sorriso' }], { base: [] })
    await user.selectOptions(screen.getByLabelText('Praça'), 'cascavel')
    expect(readState().inputs.yieldScHa).toBe(0)
    expect(screen.queryByText(/média da região/)).not.toBeInTheDocument()
    expect(screen.queryByText(/IMEA/)).not.toBeInTheDocument()
  })

  // US¢/bu of a premium typed in R$/t at the dollar the test store uses.
  const centsOf = (brlPerT: number) => {
    const st = readState()
    return ((brlPerT * SACK_TON) / (CROPS[st.crop].bushelsPerSack * (st.overrides.fx ?? 5.4998))) * 100
  }

  it('"Outro" shows only the three numbers to type (premium, freight to the port, port fees); the premium is the base', async () => {
    const { user } = await renderWithStore(ui, [], { base: [] })
    await user.selectOptions(screen.getByLabelText('Praça'), 'outro')
    expect(screen.queryByLabelText('Base')).not.toBeInTheDocument()
    expect(screen.queryByTestId('fob-market-price')).toBeNull()
    expect(screen.queryByRole('button', { name: /Usar preço de mercado|Editar/ })).toBeNull()
    for (const l of ['Prêmio do porto', 'Frete até o porto', 'Taxas de porto/armazém']) {
      expect(screen.getByLabelText(l)).toBeInTheDocument()
    }
    const field = screen.getByLabelText('Prêmio do porto')
    await user.clear(field)
    await user.type(field, '300')
    await user.tab()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(readState().customBasisUsc).toBeCloseTo(centsOf(300), 6)
    expect(screen.getByTestId('basis')).toHaveTextContent(String(readState().customBasisUsc))
    // another praça brings the market price and the editor back, and drops the typed base
    await user.selectOptions(screen.getByLabelText('Praça'), 'itaqui')
    expect(readState().customBasisUsc).toBeNull()
    expect(screen.getByTestId('fob-market-price')).toBeInTheDocument()
    expect(screen.getByTestId('basis')).toHaveTextContent(String(fobPointsFor('soja')[1].baseUsc.soja))
  })

  it('"Outro" premium accepts a negative value and 0, rejects text', async () => {
    const { user } = await renderWithStore(ui, [], { base: [] })
    await user.selectOptions(screen.getByLabelText('Praça'), 'outro')
    const field = screen.getByLabelText('Prêmio do porto')
    await user.clear(field)
    await user.type(field, '-100')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(readState().customBasisUsc).toBeCloseTo(centsOf(-100), 6)
    expect(readState().customBasisUsc as number).toBeLessThan(0)
    await user.clear(field)
    await user.type(field, '0')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(readState().customBasisUsc).toBe(0)
    await user.tab()
    await user.clear(field)
    await user.type(field, 'abc')
    await user.tab()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(readState().customBasisUsc).toBe(0)
  })

  it('has no axe violations', async () => {
    const { container, user } = await renderWithStore(ui, [], { base: [] })
    await user.selectOptions(screen.getByLabelText('Praça'), 'outro')
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('LavouraCard: Produtividade unit', () => {
  it('clicking the unit offers t/ha and converts the typed number (never just the label)', async () => {
    const { user } = await renderWithStore(ui, [{ type: 'setInput', key: 'yieldScHa', value: 60 }], { base: [] })
    const field = screen.getByLabelText('Produtividade') as HTMLInputElement
    expect(field.value).toBe('60')
    await user.click(screen.getByRole('button', { name: /^Trocar unidade \(sc\/ha\)$/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Mudar para t/ha' }))
    expect(readState().areaUnit).toBe('tHa')
    expect(field.value).toBe('3,6')
    expect(readState().inputs.yieldScHa).toBeCloseTo(60, 9)
    await user.click(screen.getByRole('button', { name: /^Trocar unidade \(t\/ha\)$/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Mudar para sc/ha' }))
    expect(readState().areaUnit).toBe('scHa')
    expect(field.value).toBe('60')
  })

  it('typing in t/ha is stored as sc/ha', async () => {
    const { user } = await renderWithStore(ui, [{ type: 'setAreaUnit', unit: 'tHa' }], { base: [] })
    const field = screen.getByLabelText('Produtividade')
    await user.clear(field)
    await user.type(field, '3,6')
    expect(readState().inputs.yieldScHa).toBeCloseTo(60, 9)
  })
})
