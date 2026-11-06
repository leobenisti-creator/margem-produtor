import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import type userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { CROPS } from '../engine/crops'
import { readState, renderWithStore } from '../test/storeHarness'
import { HedgePanel } from './HedgePanel'

vi.setConfig({ testTimeout: 15000 })
expect.extend(toHaveNoViolations)

type User = ReturnType<typeof userEvent.setup>

const row = (n: number) => screen.getByRole('group', { name: `Operação ${n}` })
const op = (i = 0) => readState().hedgeOps[i]
const BPS = CROPS.soja.bushelsPerSack

async function typeInto(user: User, label: string, v: string) {
  const f = screen.getByLabelText(label)
  await user.clear(f)
  if (v !== '') await user.type(f, v)
  await user.tab()
}
async function pickType(user: User, n: number, label: string) {
  await user.click(within(row(n)).getByRole('button', { name: new RegExp(`^Tipo da operação ${n}`) }))
  await user.click(within(row(n)).getByRole('menuitem', { name: `Mudar para ${label}` }))
}
const choose = (user: User, n: number, group: string, name: string) =>
  user.click(within(screen.getByRole('radiogroup', { name: `${group} da operação ${n}` })).getByRole('radio', { name }))

beforeEach(() => localStorage.clear())

describe('HedgePanel (Operações de mercado)', () => {
  it('empty: card, text, notes and the add button', async () => {
    await renderWithStore(<HedgePanel />)
    expect(screen.getByTestId('card-operacoes')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Operações em bolsa (hedge)' })).toBeInTheDocument()
    expect(screen.getByText('Nenhuma operação registrada ainda.')).toBeInTheDocument()
    expect(screen.getByText('Em breve: ler a posição direto da corretora/banco')).toBeInTheDocument()
    expect(screen.queryByText('Accumulator: em breve')).toBeNull()
    expect(screen.getByRole('button', { name: 'Adicionar operação' })).toBeInTheDocument()
  })

  it('add creates an invalid operation with its reason and moves the focus into the row', async () => {
    const { user } = await renderWithStore(<HedgePanel />)
    await user.click(screen.getByRole('button', { name: 'Adicionar operação' }))
    expect(readState().hedgeOps).toHaveLength(1)
    expect(row(1)).toHaveTextContent('Informe a quantidade de lotes (maior que zero).')
    expect(row(1).contains(document.activeElement)).toBe(true)
    expect(screen.queryByText('Nenhuma operação registrada ainda.')).toBeNull()
  })

  it('typing lots and strike commits (soja: 1 lote = 5.000 bu) and the summary appears', async () => {
    const { user } = await renderWithStore(<HedgePanel />)
    await user.click(screen.getByRole('button', { name: 'Adicionar operação' }))
    expect(screen.getByTestId('hedge-lot-1')).toHaveTextContent(/^1 lote = 5\.000 bu \(≈ 2\.268 sc\)$/)
    await typeInto(user, 'Quantidade da operação 1', '1000')
    expect(op().qty).toBe(5_000_000) // stored in bushels
    expect(screen.getByTestId('hedge-lot-1')).toHaveTextContent('total 5.000.000 bu (≈ 2.267.965 sc)')
    expect(row(1)).toHaveTextContent('Informe o preço do futuro')
    expect(within(row(1)).getByText('Preço')).toBeInTheDocument()
    expect(within(row(1)).queryByText('Strike')).toBeNull() // a future has a price, not a strike
    expect(within(row(1)).queryByText('Preço no CBOT')).toBeNull()
    await typeInto(user, 'Preço da operação 1', '1250')
    expect(op().strike).toBe(1250)
    const sc = (5_000_000 / BPS / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
    expect(screen.getByTestId('hedge-reason-1').textContent).toBe(
      `Vendido 1.000 lotes (${sc} mi sc, 5 mi bu) a 1.250 US¢/bu — protege o CBOT de ${sc} mi sc`,
    )
    fireEvent.change(screen.getByLabelText('Vencimento da operação 1'), { target: { value: '2027-07-14' } })
    expect(op().maturityDate).toBe('2027-07-14')
  })

  it('there is no unit switch any more; lots must be whole and a wrong value keeps the stored one', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [
      { type: 'addHedgeOp', partial: { saved: false, qty: 10_000, strike: 1000 } },
    ])
    expect(within(row(1)).queryByRole('button', { name: /Trocar unidade/ })).toBeNull()
    expect(screen.getByLabelText('Quantidade da operação 1')).toHaveValue('2')
    await typeInto(user, 'Quantidade da operação 1', '2,5')
    expect(row(1)).toHaveTextContent('Informe um número inteiro de lotes.')
    expect(op().qty).toBe(10_000)
    await typeInto(user, 'Quantidade da operação 1', '3')
    expect(op().qty).toBe(15_000)
    expect(screen.getByTestId('hedge-reason-1').textContent).toContain('3 lotes')
  })

  it('dollar asset: 1 lote = US$ 50.000 and the strike in R$/US$; the asset switch restarts the numbers', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [
      { type: 'addHedgeOp', partial: { saved: false, qty: 1000, strike: 1250 } },
    ])
    await choose(user, 1, 'Ativo', 'Dólar')
    expect(op()).toMatchObject({ asset: 'dolar', qty: 0, strike: 0, fxFixed: null })
    expect(screen.getByTestId('hedge-lot-1')).toHaveTextContent('1 lote = US$ 50.000')
    expect(within(row(1)).getByText('R$/US$')).toBeInTheDocument()
    expect(within(row(1)).queryByRole('radiogroup', { name: 'Dólar da operação 1' })).toBeNull()
    await typeInto(user, 'Quantidade da operação 1', '20')
    await typeInto(user, 'Preço da operação 1', '5,4')
    expect(op()).toMatchObject({ qty: 1_000_000, strike: 5.4 })
    expect(screen.getByTestId('hedge-reason-1').textContent).toBe(
      'Vendido 20 lotes (US$ 1 mi) a R$ 5,40 — trava o dólar de US$ 1 mi',
    )
  })

  it('the contract size sits behind an edit button (dollar: NDF/mini; soja: mini/OTC); the lots stay and the total follows', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [
      { type: 'addHedgeOp', partial: { saved: false, asset: 'dolar', qty: 1_000_000, strike: 5.5 } },
      { type: 'addHedgeOp', partial: { saved: false, qty: 100_000, strike: 1300 } },
    ])
    expect(screen.getByLabelText('Quantidade da operação 1')).toHaveValue('20') // 1.000.000 / 50.000
    // hidden by default, with the standard shown; a button opens it (both assets have the button)
    expect(screen.queryByLabelText('Tamanho do contrato da operação 1')).toBeNull()
    expect(screen.queryByLabelText('Tamanho do contrato da operação 2')).toBeNull()
    expect(screen.getByRole('button', { name: 'Editar tamanho do contrato da operação 2' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Editar tamanho do contrato da operação 1' }))
    await typeInto(user, 'Tamanho do contrato da operação 1', '10000')
    expect(op(0)).toMatchObject({ lotSize: 10_000, qty: 200_000 }) // still 20 lots, now of US$ 10.000
    expect(screen.getByTestId('hedge-lot-1')).toHaveTextContent('1 lote = US$ 10.000 · total US$ 200.000')
    await typeInto(user, 'Quantidade da operação 1', '35')
    expect(op(0).qty).toBe(350_000)
    // an NDF of US$ 1.000.000 a lot
    await typeInto(user, 'Tamanho do contrato da operação 1', '1000000')
    expect(op(0).qty).toBe(35_000_000)
    await typeInto(user, 'Tamanho do contrato da operação 1', '0')
    expect(row(1)).toHaveTextContent('O tamanho do contrato deve ser maior que zero.')
    expect(op(0).lotSize).toBe(1_000_000)
    // back to the standard keeps the lots (35) at the standard size
    await user.click(screen.getByRole('button', { name: 'Voltar ao tamanho padrão do contrato da operação 1' }))
    expect(op(0).lotSize).toBeUndefined()
    expect(op(0).qty).toBe(35 * 50_000)
    // switching the asset forgets the size
    await user.click(screen.getByRole('button', { name: /^Fechar a edição do tamanho do contrato da operação 1/ }))
    await user.click(screen.getByRole('button', { name: 'Editar tamanho do contrato da operação 1' }))
    await typeInto(user, 'Tamanho do contrato da operação 1', '8000')
    expect(op(0).lotSize).toBe(8_000)
    await choose(user, 1, 'Ativo', 'Soja (CBOT)')
    expect(op(0).lotSize).toBeUndefined()
  })

  it('soja: a mini contract of 1.000 bu changes the bushels of the lots, not the number of lots', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [
      { type: 'addHedgeOp', partial: { saved: false, qty: 100_000, strike: 1300 } },
    ])
    expect(screen.getByLabelText('Quantidade da operação 1')).toHaveValue('20') // 100.000 / 5.000
    await user.click(screen.getByRole('button', { name: 'Editar tamanho do contrato da operação 1' }))
    await typeInto(user, 'Tamanho do contrato da operação 1', '1000')
    expect(op(0)).toMatchObject({ lotSize: 1_000, qty: 20_000 })
    expect(screen.getByTestId('hedge-lot-1')).toHaveTextContent('1 lote = 1.000 bu')
  })

  it('put/call show the premium; a future hides it and stores 0', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [
      { type: 'addHedgeOp', partial: { saved: false, qty: 10_000, strike: 1000 } },
    ])
    expect(screen.queryByLabelText('Prêmio da operação 1')).toBeNull()
    await pickType(user, 1, 'Put')
    await typeInto(user, 'Prêmio da operação 1', '30')
    expect(op()).toMatchObject({ kind: 'put', premium: 30 })
    expect(row(1)).toHaveTextContent('Put vendido')
    await pickType(user, 1, 'Call')
    expect(op()).toMatchObject({ kind: 'call', premium: 30 })
    await pickType(user, 1, 'Futuro')
    expect(op()).toMatchObject({ kind: 'futuro', premium: 0 })
    expect(screen.queryByLabelText('Prêmio da operação 1')).toBeNull()
  })

  it('Aberto / Fixado: fixed without a rate stores nothing invalid; a rate is stored; back to Aberto clears it', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [
      { type: 'addHedgeOp', partial: { saved: false, qty: 10_000, strike: 1000 } },
    ])
    expect(op().fxFixed).toBeNull()
    await choose(user, 1, 'Dólar', 'Fixado')
    expect(op().fxFixed).toBeNull()
    expect(row(1)).toHaveTextContent('Informe o dólar fixado')
    await typeInto(user, 'Dólar fixado da operação 1', '5,3')
    expect(op().fxFixed).toBe(5.3)
    await typeInto(user, 'Dólar fixado da operação 1', '0')
    expect(op().fxFixed).toBeNull()
    await typeInto(user, 'Dólar fixado da operação 1', '5,1')
    expect(op().fxFixed).toBe(5.1)
    await choose(user, 1, 'Dólar', 'Aberto')
    expect(op().fxFixed).toBeNull()
    expect(screen.queryByLabelText('Dólar fixado da operação 1')).toBeNull()
  })

  it('remove deletes the row and brings the empty state back', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [{ type: 'addHedgeOp', partial: { saved: false } }])
    await user.click(screen.getByRole('button', { name: 'Remover operação 1' }))
    expect(readState().hedgeOps).toEqual([])
    expect(screen.getByText('Nenhuma operação registrada ainda.')).toBeInTheDocument()
  })

  it('several rows keep distinct accessible names', async () => {
    await renderWithStore(<HedgePanel />, [{ type: 'addHedgeOp', partial: { saved: false } }, { type: 'addHedgeOp', partial: { saved: false } }])
    for (const n of [1, 2]) {
      expect(row(n)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: new RegExp(`^Tipo da operação ${n}`) })).toBeInTheDocument()
      for (const g of ['Ativo', 'Lado']) {
        expect(screen.getByRole('radiogroup', { name: `${g} da operação ${n}` })).toBeInTheDocument()
      }
      expect(screen.getByLabelText(`Quantidade da operação ${n}`)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: `Remover operação ${n}` })).toBeInTheDocument()
    }
  })

  it('summaries: bought call and sold put', async () => {
    await renderWithStore(<HedgePanel />, [
      { type: 'addHedgeOp', partial: { saved: false, kind: 'call', side: 'comprado', qty: 225_000, strike: 1300, premium: 25 } },
      { type: 'addHedgeOp', partial: { saved: false, kind: 'put', side: 'vendido', qty: 225_000, strike: 1100, premium: 20 } },
    ])
    expect(screen.getByTestId('hedge-reason-1').textContent).toBe(
      'Call comprado 45 lotes (102,1 mil sc, 225 mil bu), strike 1.300 US¢/bu, prêmio 25 US¢/bu — ganha se o CBOT subir',
    )
    expect(screen.getByTestId('hedge-reason-2').textContent).toContain('recebe o prêmio e assume o risco')
    expect(document.body.textContent).not.toMatch(/NaN|Infinity|undefined/)
  })

  it('has no axe violations, empty and with a filled option row', async () => {
    const { container } = await renderWithStore(<HedgePanel />)
    const check = () => axe(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(await check()).toHaveNoViolations()
    cleanup() // one store probe at a time
    const { container: c2 } = await renderWithStore(<HedgePanel />, [
      {
        type: 'addHedgeOp',
        partial: { saved: false, kind: 'put', qty: 220_462, strike: 1100, premium: 20, fxFixed: 5.2, maturity: 'jul/27' },
      },
    ])
    expect(await axe(c2, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })
})
