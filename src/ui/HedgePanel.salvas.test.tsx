import { screen, within } from '@testing-library/react'
import type userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { loadState, saveState } from '../state/persist'
import type { Action } from '../state/types'
import { readState, renderWithStore } from '../test/storeHarness'
import { HedgePanel } from './HedgePanel'

vi.setConfig({ testTimeout: 20000 })
expect.extend(toHaveNoViolations)

type User = ReturnType<typeof userEvent.setup>
async function typeInto(user: User, label: string, v: string) {
  const f = screen.getByLabelText(label)
  await user.clear(f)
  if (v !== '') await user.type(f, v)
  await user.tab()
}

const PUT: Action = {
  type: 'addHedgeOp',
  partial: {
    kind: 'put',
    side: 'comprado',
    qty: 100_000,
    strike: 1300,
    premium: 30,
    maturityMonth: '2027-07',
    maturityDate: '2027-06-28',
  },
}
const FUTURE: Action = {
  type: 'addHedgeOp',
  partial: { kind: 'futuro', side: 'vendido', qty: 50_000, strike: 1250, maturityMonth: '2027-07', maturityDate: '2027-06-28' },
}
const addButton = () => screen.getByRole('button', { name: 'Adicionar operação' })
const docButton = () => screen.getByRole('button', { name: 'Operações salvas' })
const doc = () => within(screen.getByRole('dialog', { name: 'Operações salvas' }))

beforeEach(() => localStorage.clear())

describe('HedgePanel: reportar operações (salvar)', () => {
  it('empty: says so, offers "Adicionar operação" and has the saved-operations button at the top', async () => {
    await renderWithStore(<HedgePanel />)
    expect(screen.getByText('Nenhuma operação registrada ainda.')).toBeInTheDocument()
    expect(addButton()).toBeInTheDocument()
    expect(docButton()).toHaveTextContent('0')
    expect(screen.queryByTestId('hedge-summary')).toBeNull()
  })

  it('a new operation counts at once but is not kept until "Salvar operação"; saved, it leaves the page', async () => {
    const { user } = await renderWithStore(<HedgePanel />)
    await user.click(addButton())
    expect(readState().hedgeOps[0].saved).toBe(false)
    expect(screen.getByRole('group', { name: 'Operação 1' })).toHaveTextContent('Ainda não salva')
    const save = screen.getByRole('button', { name: 'Salvar operação 1' })
    expect(save).toBeDisabled() // empty: nothing valid to keep
    await typeInto(user, 'Quantidade da operação 1', '10')
    await typeInto(user, 'Preço da operação 1', '1250')
    expect(save).toBeEnabled()
    // already in the numbers, but not written to the browser
    expect(screen.getByTestId('hedge-summary')).toHaveTextContent('1 operação · 1 em aberto')
    expect(docButton()).toHaveTextContent('0')
    saveState(readState())
    expect(loadState()?.hedgeOps).toEqual([])
    await user.click(save)
    expect(readState().hedgeOps).toHaveLength(1)
    expect(readState().hedgeOps[0].saved).toBeUndefined()
    expect(screen.queryByRole('group', { name: 'Operação 1' })).toBeNull() // the form left the page
    expect(docButton()).toHaveTextContent('1')
    expect(screen.getByTestId('hedge-summary')).toHaveTextContent('1 operação')
    expect(screen.getByText(/Tem mais alguma operação\?/)).toBeInTheDocument()
    saveState(readState())
    expect(loadState()?.hedgeOps).toHaveLength(1)
  })

  it('"Remover" on a new operation takes it out of the numbers', async () => {
    const { user } = await renderWithStore(<HedgePanel />)
    await user.click(addButton())
    await user.click(screen.getByRole('button', { name: 'Remover operação 1' }))
    expect(readState().hedgeOps).toEqual([])
    expect(screen.getByText('Nenhuma operação registrada ainda.')).toBeInTheDocument()
  })

  it('the saved operations are not forms on the page; a new one is numbered after them', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [PUT, FUTURE])
    expect(screen.queryByRole('group', { name: 'Operação 1' })).toBeNull()
    expect(docButton()).toHaveTextContent('2')
    expect(screen.getByTestId('hedge-summary')).toHaveTextContent('2 operações · 2 em aberto')
    await user.click(addButton())
    expect(screen.getByRole('group', { name: 'Operação 3' })).toHaveTextContent('Ainda não salva')
    expect(screen.getByLabelText('Quantidade da operação 3')).toBeInTheDocument()
  })
})

describe('HedgePanel: Operações salvas (documento por cima)', () => {
  it('lists the saved operations with their state and closes with Esc giving the focus back', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [PUT, FUTURE])
    await user.click(docButton())
    const d = screen.getByTestId('hedge-document')
    expect(within(d).getByRole('heading', { name: 'Operações salvas' })).toBeInTheDocument()
    expect(within(d).getAllByRole('listitem')).toHaveLength(2)
    expect(d).toHaveTextContent('Put comprado')
    expect(d).toHaveTextContent('Vendido')
    expect(d).toHaveTextContent('Em aberto')
    expect(within(d).getByTestId('hedge-summary')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('hedge-document')).toBeNull()
    expect(docButton()).toHaveFocus()
  })

  it('an operation closed before its maturity is listed as Encerrada, below the open ones', async () => {
    const closed: Action = {
      type: 'addHedgeOp',
      partial: {
        kind: 'futuro',
        side: 'vendido',
        qty: 50_000,
        strike: 1250,
        maturityDate: '2027-06-28',
        closedDate: '2026-01-10',
        closePrice: 1200,
      },
    }
    const { user } = await renderWithStore(<HedgePanel />, [closed, PUT])
    await user.click(docButton())
    const items = doc().getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Operação 2') // the open put first
    expect(items[0]).toHaveTextContent('Em aberto')
    expect(items[1]).toHaveTextContent('Operação 1')
    expect(items[1]).toHaveTextContent('Encerrada')
  })

  it('editing needs "Salvar alterações": cancelling keeps the operation, saving replaces it', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [PUT])
    await user.click(docButton())
    await user.click(doc().getByRole('button', { name: 'Editar operação 1' }))
    expect(screen.getByLabelText('Strike da operação 1')).toHaveValue('1.300')
    await typeInto(user, 'Strike da operação 1', '1400')
    expect(readState().hedgeOps[0].strike).toBe(1300) // typed, not saved
    await user.click(doc().getByRole('button', { name: 'Cancelar a edição da operação 1' }))
    expect(readState().hedgeOps[0].strike).toBe(1300)
    await user.click(doc().getByRole('button', { name: 'Editar operação 1' }))
    await typeInto(user, 'Strike da operação 1', '1400')
    await user.click(doc().getByRole('button', { name: 'Salvar alterações da operação 1' }))
    expect(readState().hedgeOps).toHaveLength(1)
    expect(readState().hedgeOps[0]).toMatchObject({ strike: 1400, premium: 30, kind: 'put' })
    expect(readState().hedgeOps[0].saved).toBeUndefined()
    expect(screen.queryByRole('group', { name: 'Operação 1' })).toBeNull() // back to the line
  })

  it('an edit that turns the operation into another type (barrier removed) replaces it whole', async () => {
    const ko: Action = {
      type: 'addHedgeOp',
      partial: {
        kind: 'put',
        side: 'comprado',
        qty: 100_000,
        strike: 1300,
        premium: 30,
        maturityDate: '2027-06-28',
        startDate: '2026-11-01',
        barrier: { type: 'ko', price: 1100, dir: 'baixa' },
      },
    }
    const { user } = await renderWithStore(<HedgePanel />, [ko])
    expect(readState().hedgeOps[0].barrier).toBeDefined()
    await user.click(docButton())
    await user.click(doc().getByRole('button', { name: 'Editar operação 1' }))
    await user.click(doc().getByRole('button', { name: /^Tipo da operação 1/ }))
    await user.click(doc().getByRole('menuitem', { name: 'Mudar para Put' }))
    await user.click(doc().getByRole('button', { name: 'Salvar alterações da operação 1' }))
    expect(readState().hedgeOps[0].barrier).toBeUndefined()
    expect(readState().hedgeOps[0].kind).toBe('put')
  })

  it('removing asks for a confirmation on the same line; "Não" keeps the operation', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [PUT])
    await user.click(docButton())
    await user.click(doc().getByRole('button', { name: 'Remover operação 1' }))
    expect(screen.getByTestId('hedge-document')).toHaveTextContent('Remover esta operação?')
    await user.click(doc().getByRole('button', { name: 'Manter a operação 1' }))
    expect(readState().hedgeOps).toHaveLength(1)
    await user.click(doc().getByRole('button', { name: 'Remover operação 1' }))
    await user.click(doc().getByRole('button', { name: 'Confirmar a remoção da operação 1' }))
    expect(readState().hedgeOps).toEqual([])
    expect(screen.getByTestId('hedge-document')).toHaveTextContent('Nenhuma operação salva')
  })

  it('has no axe violations: a new operation on the page, the document, and an operation being edited', async () => {
    const { user, container } = await renderWithStore(<HedgePanel />, [PUT])
    const check = () => axe(container, { rules: { 'color-contrast': { enabled: false } } })
    await user.click(addButton())
    expect(await check()).toHaveNoViolations()
    await user.click(screen.getByRole('button', { name: 'Remover operação 2' }))
    await user.click(docButton())
    expect(await check()).toHaveNoViolations()
    await user.click(doc().getByRole('button', { name: 'Editar operação 1' }))
    expect(await check()).toHaveNoViolations()
  })
})
