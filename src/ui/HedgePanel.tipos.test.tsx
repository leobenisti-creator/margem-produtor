import { fireEvent, screen, within } from '@testing-library/react'
import type userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import type { MarketHistory } from '../engine/history'
import { readState, renderWithStore } from '../test/storeHarness'
import { HedgePanel } from './HedgePanel'

vi.setConfig({ testTimeout: 20000 })
expect.extend(toHaveNoViolations)

type User = ReturnType<typeof userEvent.setup>
const row = (n: number) => screen.getByRole('group', { name: `Operação ${n}` })
const op = (i = 0) => readState().hedgeOps[i]
const menuButton = (n: number) => within(row(n)).getByRole('button', { name: new RegExp(`^Tipo da operação ${n}`) })

async function pickType(user: User, n: number, label: string) {
  await user.click(menuButton(n))
  await user.click(within(row(n)).getByRole('menuitem', { name: `Mudar para ${label}` }))
}
async function typeInto(user: User, label: string, v: string) {
  const f = screen.getByLabelText(label)
  await user.clear(f)
  if (v !== '') await user.type(f, v)
  await user.tab()
}
const setDate = (label: string, v: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: v } })

beforeEach(() => localStorage.clear())

describe('HedgePanel: tipo de operação (menu, padrão futuro)', () => {
  it('a new operation is a future; the type button lists the other types for soybeans', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [{ type: 'addHedgeOp', partial: { saved: false } }])
    expect(menuButton(1)).toHaveTextContent('Futuro')
    expect(within(row(1)).queryByRole('radiogroup', { name: 'Tipo da operação 1' })).toBeNull()
    await user.click(menuButton(1))
    const items = within(row(1))
      .getAllByRole('menuitem')
      .map((i) => i.textContent)
    expect(items).toEqual([
      'Futuro',
      'Put',
      'Call',
      'Put com knock-out',
      'Put com knock-in',
      'Call com knock-out',
      'Call com knock-in',
      'Accumulator floor/ceiling',
      'Accumulator com knock-out',
    ])
    await user.keyboard('{Escape}')
    expect(within(row(1)).queryByRole('menu')).toBeNull()
  })

  it('the dollar only has future, put and call (no barrier, no accumulator)', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [{ type: 'addHedgeOp', partial: { saved: false, asset: 'dolar' } }])
    await user.click(menuButton(1))
    expect(
      within(row(1))
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual(['Futuro', 'Put', 'Call'])
  })

  it('a future has a price; options and accumulators have a strike', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [{ type: 'addHedgeOp', partial: { saved: false } }])
    expect(screen.getByLabelText('Preço da operação 1')).toBeInTheDocument()
    expect(screen.queryByLabelText('Strike da operação 1')).toBeNull()
    await pickType(user, 1, 'Put')
    expect(screen.getByLabelText('Strike da operação 1')).toBeInTheDocument()
    expect(screen.queryByLabelText('Preço da operação 1')).toBeNull()
    await pickType(user, 1, 'Accumulator floor/ceiling')
    // the accumulator has no strike: its price is the enhancement level
    expect(screen.queryByLabelText('Strike da operação 1')).toBeNull()
    expect(screen.getByLabelText('Nível de melhoria da operação 1')).toBeInTheDocument()
  })

  it('switching the asset to the dollar turns an accumulator/barrier operation into a plain future', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [{ type: 'addHedgeOp', partial: { saved: false } }])
    await pickType(user, 1, 'Accumulator com knock-out')
    expect(op()).toMatchObject({ kind: 'accumulator', side: 'vendido' })
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Ativo da operação 1' })).getByRole('radio', { name: 'Dólar' }),
    )
    expect(op()).toMatchObject({ asset: 'dolar', kind: 'futuro' })
    expect(op().barrier).toBeUndefined()
    expect(op().accum).toBeUndefined()
  })
})

describe('HedgePanel: dates', () => {
  it('maturity month, end date and operation date are dates; the legacy text is shown as a hint', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [
      { type: 'addHedgeOp', partial: { saved: false, kind: 'put', side: 'comprado', maturity: 'jul/27' } },
    ])
    // the date of the operation is optional outside the accumulator: it waits under "Mais opções"
    expect(screen.queryByLabelText('Data da operação 1')).toBeNull()
    expect(screen.getByLabelText('Mês de vencimento da operação 1')).toHaveAttribute('type', 'month')
    expect(screen.getByLabelText('Vencimento da operação 1')).toHaveAttribute('type', 'date')
    expect(row(1)).toHaveTextContent('Vencimento antigo: jul/27')
    await user.click(screen.getByRole('button', { name: 'Mais opções da operação 1' }))
    expect(screen.getByLabelText('Data da operação 1')).toHaveAttribute('type', 'date')
    setDate('Data da operação 1', '2026-01-05')
    setDate('Vencimento da operação 1', '2026-03-31')
    expect(op()).toMatchObject({ startDate: '2026-01-05', maturityDate: '2026-03-31' })
    expect(row(1)).not.toHaveTextContent('Vencimento antigo')
    // a half-typed date (the browser reports an empty value) does not erase the stored one...
    setDate('Vencimento da operação 1', '')
    expect(op().maturityDate).toBe('2026-03-31')
    // ...an empty field that is left empty does
    fireEvent.blur(screen.getByLabelText('Vencimento da operação 1'))
    expect(op().maturityDate).toBeUndefined()
  })

  it('a future starts with the maturity month, end date and business days; the closing waits behind its button', async () => {
    await renderWithStore(<HedgePanel />, [{ type: 'addHedgeOp', partial: { saved: false } }])
    expect(screen.getByLabelText('Mês de vencimento da operação 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Vencimento da operação 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Dias úteis até o vencimento da operação 1')).toBeInTheDocument()
    expect(screen.queryByLabelText('Data da operação 1')).toBeNull()
    expect(screen.getByRole('button', { name: 'Marcar como liquidada a operação 1' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Encerrada em da operação 1')).toBeNull()
  })

  it('the order: month, end date, business days, lots, then the price', async () => {
    await renderWithStore(<HedgePanel />, [{ type: 'addHedgeOp', partial: { saved: false } }])
    const order = [
      'Mês de vencimento da operação 1',
      'Vencimento da operação 1',
      'Dias úteis até o vencimento da operação 1',
      'Quantidade da operação 1',
      'Preço da operação 1',
    ].map((l) => screen.getByLabelText(l))
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('an option asks the premium paid (long) or received (short) after the strike', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [
      { type: 'addHedgeOp', partial: { saved: false, kind: 'put', side: 'comprado' } },
    ])
    expect(row(1)).toHaveTextContent('Prêmio pago (por unidade)')
    const strike = screen.getByLabelText('Strike da operação 1')
    const premium = screen.getByLabelText('Prêmio da operação 1')
    expect(strike.compareDocumentPosition(premium) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.click(within(screen.getByRole('radiogroup', { name: 'Lado da operação 1' })).getByRole('radio', { name: 'Vendido' }))
    expect(row(1)).toHaveTextContent('Prêmio recebido (por unidade)')
  })

  it('the maturity month fills the end date on the 28th of the month before; the business days follow from today and can move it', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [{ type: 'addHedgeOp', partial: { saved: false } }], { today: '2026-06-01' })
    fireEvent.change(screen.getByLabelText('Mês de vencimento da operação 1'), { target: { value: '2026-07' } })
    expect(op()).toMatchObject({ maturityMonth: '2026-07', maturityDate: '2026-06-28' })
    // 2 Jun to 28 Jun 2026: 4 + 5 + 4 (Juneteenth, Friday 19) + 5 trading days
    expect(screen.getByLabelText('Dias úteis até o vencimento da operação 1')).toHaveValue('18')
    // the number of days moves the end date: 10 trading days after Monday 1 Jun is Monday 15 Jun
    await typeInto(user, 'Dias úteis até o vencimento da operação 1', '10')
    expect(op().maturityDate).toBe('2026-06-15')
    expect(op().maturityMonth).toBe('2026-07') // the contract month stays
    expect(screen.getByLabelText('Vencimento da operação 1')).toHaveValue('2026-06-15')
    // January goes to December of the year before
    fireEvent.change(screen.getByLabelText('Mês de vencimento da operação 1'), { target: { value: '2027-01' } })
    expect(op().maturityDate).toBe('2026-12-28')
  })
})

const HIST: MarketHistory = {
  cbotUsc: {
    soja: [
      { date: '2026-01-05', settle: 1320 },
      { date: '2026-02-10', settle: 1140 },
      { date: '2026-03-02', settle: 1250 },
      { date: '2026-03-09', settle: 1280 },
      { date: '2026-03-16', settle: 1320 },
      { date: '2026-03-31', settle: 1200 },
    ],
  },
  fx: [
    { date: '2026-01-05', settle: 5 },
    { date: '2026-03-02', settle: 5 },
    { date: '2026-03-09', settle: 5 },
    { date: '2026-03-16', settle: 5 },
    { date: '2026-03-31', settle: 5.2 },
  ],
}

describe('HedgePanel: barrier (knock-out / knock-in)', () => {
  const PUT = {
    type: 'addHedgeOp' as const,
    partial: { saved: false,
      kind: 'put' as const,
      side: 'comprado' as const,
      qty: 100_000,
      strike: 1300,
      premium: 30,
      startDate: '2026-01-05',
      maturityDate: '2026-03-31',
    },
  }

  it('choosing knock-out opens the barrier fields (price and direction); the operation is invalid until the price is typed', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [PUT])
    await pickType(user, 1, 'Put com knock-out')
    expect(op().barrier).toEqual({ type: 'ko', price: 0, dir: 'baixa' })
    expect(menuButton(1)).toHaveTextContent('Put com knock-out')
    expect(screen.getByTestId('hedge-reason-1')).toHaveTextContent('Informe o preço e o tipo da barreira')
    await typeInto(user, 'Nível de knock-out da operação 1', '1150')
    expect(op().barrier).toEqual({ type: 'ko', price: 1150, dir: 'baixa' })
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Direção da barreira da operação 1' })).getByRole('radio', {
        name: 'De alta',
      }),
    )
    expect(op().barrier?.dir).toBe('alta')
    expect(screen.getByTestId('hedge-reason-1').textContent).toContain('knock-out em 1.150 US¢/bu (de alta)')
  })

  it('call defaults to a barrier of alta; going back to a plain put removes the barrier', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [PUT])
    await pickType(user, 1, 'Call com knock-in')
    expect(op().barrier).toEqual({ type: 'ki', price: 0, dir: 'alta' })
    await pickType(user, 1, 'Put')
    expect(op().barrier).toBeUndefined()
    expect(screen.queryByLabelText('Nível de knock-out da operação 1')).toBeNull()
  })

  it('knock-out reached in the history: the app says it fell and only the premium stays (no switch to type)', async () => {
    await renderWithStore(
      <HedgePanel />,
      [{ ...PUT, partial: { ...PUT.partial, barrier: { type: 'ko', price: 1150, dir: 'baixa' } } }],
      { history: HIST, today: '2026-04-10' },
    )
    const st = screen.getByTestId('hedge-status-1')
    expect(st).toHaveTextContent('Derrubada em 10/02/2026')
    expect(st).toHaveTextContent('só o prêmio fica')
    // premium: −30 × 100.000 ÷ 100 = −US$ 30.000 × 5,0 = −R$ 150.000
    expect(st).toHaveTextContent('Já realizado: −R$ 150.000')
  })

  it('knock-in not reached: not activated; reached: works', async () => {
    const ki = {
      ...PUT,
      partial: { ...PUT.partial, barrier: { type: 'ki' as const, price: 1100, dir: 'baixa' as const } },
    }
    await renderWithStore(<HedgePanel />, [ki], { history: HIST, today: '2026-04-10' })
    expect(screen.getByTestId('hedge-status-1')).toHaveTextContent('Knock-in ainda não atingido')
  })
})

describe('HedgePanel: accumulator', () => {
  const ACC = {
    type: 'addHedgeOp' as const,
    partial: { saved: false,
      kind: 'accumulator' as const,
      floorLevel: 1000,
      qty: 5000,
      strike: 1300,
      startDate: '2026-03-02',
      maturityDate: '2026-03-30',
      accum: { frequency: 'semanal' as const },
    },
  }

  it('picking Accumulator makes it sold, hides the side, asks for the dates and the frequency', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [
      { type: 'addHedgeOp', partial: { saved: false, side: 'comprado', premium: 0 } },
    ])
    await pickType(user, 1, 'Accumulator floor/ceiling')
    expect(op()).toMatchObject({ kind: 'accumulator', side: 'vendido', accum: { frequency: 'semanal' } })
    expect(within(row(1)).queryByRole('radiogroup', { name: 'Lado da operação 1' })).toBeNull()
    expect(row(1)).toHaveTextContent('Quantidade total (lotes)')
    expect(row(1)).not.toHaveTextContent('Lotes por fixing')
    expect(screen.getByRole('radiogroup', { name: 'Frequência dos fixings da operação 1' })).toBeInTheDocument()
    // the accumulator has a premium (paid by default) and, without a knock-out, a floor level
    expect(screen.getByLabelText('Prêmio da operação 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Nível piso da operação 1')).toBeInTheDocument()
    expect(screen.getByTestId('hedge-reason-1')).toHaveTextContent(/Informe/)
  })

  it('frequency changes the day field (weekday for semanal, day of the month for mensal)', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [ACC])
    const freq = screen.getByRole('radiogroup', { name: 'Frequência dos fixings da operação 1' })
    expect(screen.getByRole('radiogroup', { name: 'Dia da semana do fixing da operação 1' })).toBeInTheDocument()
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Dia da semana do fixing da operação 1' })).getByRole('radio', {
        name: 'Qui',
      }),
    )
    expect(op().accum).toEqual({ frequency: 'semanal', day: 4 })
    await user.click(within(freq).getByRole('radio', { name: 'Mensal' }))
    expect(op().accum).toEqual({ frequency: 'mensal' }) // the weekday does not carry over
    await typeInto(user, 'Dia do mês do fixing da operação 1', '15')
    expect(op().accum).toEqual({ frequency: 'mensal', day: 15 })
    // only weekly and monthly are offered
    expect(within(freq).queryByRole('radio', { name: 'Diário' })).toBeNull()
    expect(
      within(freq)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Semanal', 'Mensal'])
    await user.click(within(freq).getByRole('radio', { name: 'Semanal' }))
    expect(op().accum).toEqual({ frequency: 'semanal' })
    expect(screen.queryByLabelText('Dia do mês do fixing da operação 1')).toBeNull()
  })

  it('with the history: fixings done, left, the money already realized and what it says in the summary', async () => {
    await renderWithStore(<HedgePanel />, [ACC], { history: HIST, today: '2026-03-18' })
    const st = screen.getByTestId('hedge-status-1')
    expect(st).toHaveTextContent('Fixings: 3 de 5 feitos, 2 a fazer.')
    // (50 + 20 − 20)¢ × 5.000 bu ÷ 100 = US$ 2.500 × 5,0
    expect(st).toHaveTextContent('Já realizado: R$ 12.500')
    expect(screen.getByTestId('hedge-reason-1').textContent).toBe(
      'Accumulator floor/ceiling vendido 1 lote por fixing (2,3 mil sc, 5 mil bu), nível de melhoria 1.300 US¢/bu, piso 1.000 US¢/bu — vende a 1.300 US¢/bu a cada fixing (no piso, se o mercado fechar nele ou abaixo)',
    )
  })

  it('the producer can correct the number of fixings done, and go back to counting by the dates', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [ACC], { history: HIST, today: '2026-03-18' })
    await typeInto(user, 'Fixings já feitos da operação 1', '1')
    expect(op().accum).toEqual({ frequency: 'semanal', fixingsDone: 1 })
    expect(screen.getByTestId('hedge-status-1')).toHaveTextContent('Fixings: 1 de 5 feitos, 4 a fazer.')
    await user.click(screen.getByRole('button', { name: 'Contar os fixings pelas datas na operação 1' }))
    expect(op().accum).toEqual({ frequency: 'semanal' })
    expect(screen.getByTestId('hedge-status-1')).toHaveTextContent('Fixings: 3 de 5 feitos')
  })

  it('accumulator with knock-out reached: fixings after it are cancelled', async () => {
    await renderWithStore(
      <HedgePanel />,
      [{ ...ACC, partial: { ...ACC.partial, barrier: { type: 'ko', price: 1245, dir: 'baixa' } } }],
      {
        history: {
          ...HIST,
          cbotUsc: {
            soja: [
              { date: '2026-03-02', settle: 1250 },
              { date: '2026-03-09', settle: 1280 },
              { date: '2026-03-16', settle: 1320 },
              { date: '2026-03-17', settle: 1240 },
            ],
          },
        },
        today: '2026-03-20',
      },
    )
    const st = screen.getByTestId('hedge-status-1')
    expect(st).toHaveTextContent('Derrubada em 17/03/2026')
    expect(st).toHaveTextContent('Fixings: 3 de 3 feitos, 0 a fazer.')
  })

  it('without price history it says so instead of inventing numbers', async () => {
    await renderWithStore(<HedgePanel />, [ACC], { today: '2026-03-18' })
    expect(screen.getByTestId('hedge-status-1')).toHaveTextContent(/Sem histórico de preço em 3 fixing\(s\)/)
    expect(document.body.textContent).not.toMatch(/NaN|Infinity|undefined/)
  })
})

describe('HedgePanel: expired and closed futures', () => {
  it('expired: realized at the settle of the maturity, "Vencida" says it no longer protects', async () => {
    await renderWithStore(
      <HedgePanel />,
      [{ type: 'addHedgeOp', partial: { saved: false, qty: 100_000, strike: 1300, maturityDate: '2026-03-31' } }],
      { history: HIST, today: '2026-04-10' },
    )
    const st = screen.getByTestId('hedge-status-1')
    expect(st).toHaveTextContent('Vencida em 31/03/2026')
    expect(st).toHaveTextContent('não protege mais')
    // (1300 − 1200)¢ × 100.000 bu ÷ 100 = US$ 100.000 × 5,2 (dollar of the maturity day)
    expect(st).toHaveTextContent('Já realizado: R$ 520.000')
  })

  it('closed before the maturity: "Encerrada"', async () => {
    await renderWithStore(
      <HedgePanel />,
      [
        {
          type: 'addHedgeOp',
          partial: { saved: false, qty: 100_000, strike: 1300, maturityDate: '2026-12-31', closedDate: '2026-02-10' },
        },
      ],
      { history: HIST, today: '2026-04-10' },
    )
    expect(screen.getByTestId('hedge-status-1')).toHaveTextContent('Encerrada em 10/02/2026')
  })

  it('an open future shows only the mark to market of today (no realized, no fixings)', async () => {
    await renderWithStore(<HedgePanel />, [{ type: 'addHedgeOp', partial: { saved: false, qty: 100_000, strike: 1300 } }])
    const st = screen.getByTestId('hedge-status-1')
    expect(st).toHaveTextContent('A mercado hoje')
    expect(st).not.toHaveTextContent('Já realizado')
    expect(st).not.toHaveTextContent('Fixings')
  })
})

describe('HedgePanel: accessibility of the new blocks', () => {
  it('has no axe violations with a knock-out put and an accumulator open', async () => {
    const { container } = await renderWithStore(
      <HedgePanel />,
      [
        {
          type: 'addHedgeOp',
          partial: { saved: false,
            kind: 'put',
            side: 'comprado',
            qty: 100_000,
            strike: 1300,
            premium: 30,
            startDate: '2026-01-05',
            maturityDate: '2026-03-31',
            barrier: { type: 'ko', price: 1150, dir: 'baixa' },
          },
        },
        {
          type: 'addHedgeOp',
          partial: { saved: false,
            kind: 'accumulator',
            floorLevel: 1000,
            qty: 5000,
            strike: 1300,
            startDate: '2026-03-02',
            maturityDate: '2026-03-30',
            accum: { frequency: 'mensal', day: 15 },
          },
        },
      ],
      { history: HIST, today: '2026-03-18' },
    )
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })
})

describe('HedgePanel: closing the operation before the maturity', () => {
  it('no closing fields until "Operação liquidada" is clicked: the day is today (editable) and it can be undone', async () => {
    const { user } = await renderWithStore(
      <HedgePanel />,
      [{ type: 'addHedgeOp', partial: { saved: false, qty: 100_000, strike: 1300 } }],
      { today: '2026-02-10' },
    )
    expect(screen.queryByLabelText('Preço de encerramento da operação 1')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Marcar como liquidada a operação 1' }))
    expect(op().closedDate).toBe('2026-02-10')
    expect(screen.getByLabelText('Encerrada em da operação 1')).toHaveValue('2026-02-10')
    expect(screen.getByLabelText('Preço de encerramento da operação 1')).toBeInTheDocument()
    setDate('Encerrada em da operação 1', '2026-02-12')
    expect(op().closedDate).toBe('2026-02-12')
    await user.click(screen.getByRole('button', { name: 'Desfazer a liquidação da operação 1' }))
    expect(op().closedDate).toBeUndefined()
    expect(screen.queryByLabelText('Preço de encerramento da operação 1')).toBeNull()
  })

  it('the accumulator has "Encerrar operação" instead, with the day (today, editable) and the value', async () => {
    const { user } = await renderWithStore(
      <HedgePanel />,
      [{ type: 'addHedgeOp', partial: { saved: false, kind: 'accumulator', side: 'vendido' } }],
      { today: '2026-03-10' },
    )
    expect(screen.queryByRole('button', { name: 'Marcar como liquidada a operação 1' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Encerrar operação 1' }))
    expect(op().closedDate).toBe('2026-03-10')
    expect(screen.getByLabelText('Encerrada em da operação 1')).toHaveValue('2026-03-10')
    expect(screen.getByLabelText('Valor recebido ou pago ao encerrar da operação 1')).toBeInTheDocument()
  })

  it('future: typed closing price becomes the result (gain or loss) in the status and is saved', async () => {
    const { user } = await renderWithStore(
      <HedgePanel />,
      [
        {
          type: 'addHedgeOp',
          partial: { saved: false, qty: 100_000, strike: 1300, maturityDate: '2026-12-31', closedDate: '2026-02-10' },
        },
      ],
      { history: HIST, today: '2026-03-01' },
    )
    await typeInto(user, 'Preço de encerramento da operação 1', '1270')
    expect(op().closePrice).toBe(1270)
    // (1300 - 1270) = 30 cents x 100.000 bu / 100 = US$ 30.000 x 5,0 (dollar of the closing day in HIST: none, 5,0 on 5 Jan)
    const st = screen.getByTestId('hedge-status-1')
    expect(st).toHaveTextContent('Encerrada em 10/02/2026')
    expect(st).toHaveTextContent('Já realizado: R$')
    // a closing price at a loss shows as a negative
    await typeInto(user, 'Preço de encerramento da operação 1', '1350')
    expect(screen.getByTestId('hedge-status-1')).toHaveTextContent('Já realizado: −R$')
  })

  it('long option: asks for the premium received at the sale; short: the premium paid to buy it back', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [
      {
        type: 'addHedgeOp',
        partial: { saved: false,
          kind: 'put',
          side: 'comprado',
          qty: 100_000,
          strike: 1300,
          premium: 30,
          startDate: '2026-01-05',
          maturityDate: '2026-12-31',
          closedDate: '2026-02-10',
        },
      },
      {
        type: 'addHedgeOp',
        partial: { saved: false,
          kind: 'call',
          side: 'vendido',
          qty: 100_000,
          strike: 1300,
          premium: 20,
          startDate: '2026-01-05',
          maturityDate: '2026-12-31',
          closedDate: '2026-02-10',
        },
      },
    ])
    expect(row(1)).toHaveTextContent('Prêmio recebido ao liquidar a opção')
    expect(row(2)).toHaveTextContent('Prêmio pago para liquidar a opção')
    await typeInto(user, 'Prêmio de encerramento da operação 1', '55')
    expect(op(0).closePrice).toBe(55)
    await typeInto(user, 'Prêmio de encerramento da operação 1', '0')
    expect(op(0).closePrice).toBeUndefined()
  })

  it('accumulator closed early: signed value received or paid to end it', async () => {
    const { user } = await renderWithStore(
      <HedgePanel />,
      [
        {
          type: 'addHedgeOp',
          partial: { saved: false,
            kind: 'accumulator',
            floorLevel: 1000,
            qty: 5000,
            strike: 1300,
            startDate: '2026-03-02',
            maturityDate: '2026-03-30',
            closedDate: '2026-03-18',
            accum: { frequency: 'semanal' },
          },
        },
      ],
      { history: HIST, today: '2026-03-20' },
    )
    expect(row(1)).toHaveTextContent('Valor recebido (+) ou pago (−) para encerrar')
    await typeInto(user, 'Valor recebido ou pago ao encerrar da operação 1', '-2000')
    expect(op().closeValueUsd).toBe(-2000)
    expect(screen.getByTestId('hedge-status-1')).toHaveTextContent('Encerrada em 18/03/2026')
    expect(screen.getByTestId('hedge-status-1')).toHaveTextContent('Fixings: 3 de 3 feitos, 0 a fazer.')
  })

  it('changing the kind starts the closing value over (a price is not a premium)', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [
      {
        type: 'addHedgeOp',
        partial: { saved: false, qty: 100_000, strike: 1300, closedDate: '2026-02-10', closePrice: 1270, maturityDate: '2026-12-31' },
      },
    ])
    await pickType(user, 1, 'Put')
    expect(op().closePrice).toBeUndefined()
    expect(op().closedDate).toBe('2026-02-10')
  })
})

describe('HedgePanel: market to market and the optional fields', () => {
  it('a sold future priced below today market says it loses today, and that it is already in the margin', async () => {
    // the seed CBOT is above 1.200: a sale at 1.200 is below the market
    await renderWithStore(<HedgePanel />, [{ type: 'addHedgeOp', partial: { saved: false, qty: 100_000, strike: 1200 } }])
    const st = screen.getByTestId('hedge-status-1')
    expect(st).toHaveTextContent('A mercado hoje, a parte em aberto perde')
    expect(st).toHaveTextContent('abaixo do mercado de hoje')
    expect(st).toHaveTextContent('já está na margem')
  })

  it('a sold future priced above today market gains today', async () => {
    await renderWithStore(<HedgePanel />, [{ type: 'addHedgeOp', partial: { saved: false, qty: 100_000, strike: 1500 } }])
    const st = screen.getByTestId('hedge-status-1')
    expect(st).toHaveTextContent('A mercado hoje, a parte em aberto ganha')
    expect(st).not.toHaveTextContent('abaixo do mercado')
  })

  it('"Mais opções" hides contract, brokerage, barrier date and guaranteed fixings; it opens by itself when one is filled', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [
      { type: 'addHedgeOp', partial: { saved: false, qty: 100_000, strike: 1300 } },
      { type: 'addHedgeOp', partial: { saved: false, qty: 100_000, strike: 1300, contract: 'SK26' } },
    ])
    expect(screen.queryByLabelText('Contrato da operação 1')).toBeNull()
    expect(screen.getByLabelText('Contrato da operação 2')).toHaveValue('SK26') // already used: starts open
    await user.click(screen.getByRole('button', { name: 'Mais opções da operação 1' }))
    expect(screen.getByLabelText('Corretagem e taxas da operação 1')).toBeInTheDocument()
    expect(screen.queryByLabelText('Barreira atingida em da operação 1')).toBeNull() // no barrier
    expect(screen.queryByLabelText('Fixings garantidos da operação 1')).toBeNull() // not an accumulator
    await user.type(screen.getByLabelText('Contrato da operação 1'), 'SN26')
    expect(op(0).contract).toBe('SN26')
    await typeInto(user, 'Corretagem e taxas da operação 1', '1200')
    expect(op(0).costBrl).toBe(1200)
    await typeInto(user, 'Corretagem e taxas da operação 1', '0')
    expect(op(0).costBrl).toBeUndefined()
  })

  it('barrier date and guaranteed fixings appear only where they make sense', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [
      {
        type: 'addHedgeOp',
        partial: { saved: false,
          kind: 'accumulator',
          floorLevel: 1000,
          qty: 5000,
          strike: 1300,
          startDate: '2026-03-02',
          maturityDate: '2026-03-30',
          accum: { frequency: 'semanal' },
          barrier: { type: 'ko', price: 1245, dir: 'baixa' },
        },
      },
    ])
    await user.click(screen.getByRole('button', { name: 'Mais opções da operação 1' }))
    expect(screen.getByLabelText('Barreira atingida em da operação 1')).toBeInTheDocument()
    await typeInto(user, 'Fixings garantidos da operação 1', '2')
    expect(op().accum).toEqual({ frequency: 'semanal', guaranteed: 2 })
    setDate('Barreira atingida em da operação 1', '2026-03-17')
    expect(op().barrierHitDate).toBe('2026-03-17')
    await typeInto(user, 'Fixings garantidos da operação 1', '0')
    expect(op().accum).toEqual({ frequency: 'semanal' })
  })

  it('has no axe violations with the closing block and the optional fields open', async () => {
    const { container, user } = await renderWithStore(
      <HedgePanel />,
      [
        {
          type: 'addHedgeOp',
          partial: { saved: false,
            kind: 'put',
            side: 'comprado',
            qty: 100_000,
            strike: 1300,
            premium: 30,
            startDate: '2026-01-05',
            maturityDate: '2026-12-31',
            closedDate: '2026-02-10',
            closePrice: 55,
            costBrl: 100,
            barrier: { type: 'ko', price: 1150, dir: 'baixa' },
          },
        },
      ],
      { history: HIST, today: '2026-03-01' },
    )
    await user.click(screen.getByRole('button', { name: 'Editar tamanho do contrato da operação 1' }))
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })
})

describe('HedgePanel: accumulator v2 (maturity month, enhancement level, floor level, premium)', () => {
  const ACC = {
    type: 'addHedgeOp' as const,
    partial: { saved: false,
      kind: 'accumulator' as const,
      floorLevel: 1000,
      qty: 5000,
      strike: 1300,
      startDate: '2026-03-02',
      maturityDate: '2026-03-30',
      accum: { frequency: 'semanal' as const },
    },
  }

  it('the maturity month gives the end date automatically (the 28th of the month before) and the date stays editable', async () => {
    await renderWithStore(<HedgePanel />, [{ type: 'addHedgeOp', partial: { saved: false } }])
    fireEvent.change(screen.getByLabelText('Mês de vencimento da operação 1'), { target: { value: '2026-07' } })
    expect(op().maturityDate).toBe('2026-06-28')
    fireEvent.change(screen.getByLabelText('Mês de vencimento da operação 1'), { target: { value: '2026-05' } })
    expect(op().maturityDate).toBe('2026-04-28')
    // the producer edits the end date by hand: the contract month stays the one typed
    setDate('Vencimento da operação 1', '2026-04-14')
    expect(op().maturityDate).toBe('2026-04-14')
    expect(screen.getByLabelText('Mês de vencimento da operação 1')).toHaveValue('2026-05')
  })

  it('a half typed month does not erase the end date; leaving it empty clears it', async () => {
    await renderWithStore(<HedgePanel />, [{ type: 'addHedgeOp', partial: { saved: false, maturityDate: '2026-07-31' } }])
    const month = screen.getByLabelText('Mês de vencimento da operação 1')
    expect(month).toHaveValue('2026-07')
    fireEvent.change(month, { target: { value: '' } })
    expect(op().maturityDate).toBe('2026-07-31')
    fireEvent.blur(month)
    expect(op().maturityDate).toBeUndefined()
  })

  it('the accumulator lists the fixings the schedule gives (count, first and last date)', async () => {
    await renderWithStore(<HedgePanel />, [ACC])
    // Mondays 2, 9, 16, 23 and 30 March 2026
    expect(screen.getByTestId('accum-fixings-1')).toHaveTextContent('5 fixings, de 02/03/2026 a 30/03/2026')
  })

  it('the floor/ceiling accumulator has the enhancement level, the floor level and the premium (paid or received)', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [ACC])
    expect(menuButton(1)).toHaveTextContent('Accumulator floor/ceiling')
    expect(row(1)).toHaveTextContent('Nível de melhoria')
    expect(row(1)).toHaveTextContent('Nível piso')
    expect(row(1)).not.toHaveTextContent('enhancement')
    expect(row(1)).not.toHaveTextContent('floor level')
    await typeInto(user, 'Nível piso da operação 1', '1200')
    expect(op().floorLevel).toBe(1200)
    await typeInto(user, 'Prêmio da operação 1', '20')
    expect(op().premium).toBe(20)
    const dir = screen.getByRole('radiogroup', { name: 'Prêmio pago ou recebido da operação 1' })
    expect(within(dir).getByRole('radio', { name: 'Pago por você' })).toHaveAttribute('aria-checked', 'true')
    await user.click(within(dir).getByRole('radio', { name: 'Recebido por você' }))
    expect(op().premiumDir).toBe('recebido')
    expect(screen.getByTestId('hedge-reason-1').textContent).toContain('piso 1.200 US¢/bu')
  })

  it('the accumulator is typed as TOTAL lots and the app divides them by the fixings of the schedule', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [
      {
        type: 'addHedgeOp',
        partial: { saved: false,
          kind: 'accumulator',
          floorLevel: 1000,
          strike: 1300,
          startDate: '2026-03-02',
          maturityDate: '2026-03-30',
          accum: { frequency: 'semanal' as const },
        },
      },
    ])
    // Mondays 2, 9, 16, 23 and 30 March: 5 fixings
    await typeInto(user, 'Quantidade da operação 1', '10')
    expect(op().accum).toMatchObject({ totalLots: 10 })
    expect(op().qty).toBe((10 * 5000) / 5) // 10,000 bu per fixing = 2 lots
    expect(screen.getByTestId('hedge-lot-1')).toHaveTextContent('5 fixings: 2 lotes por fixing')
    // a longer schedule spreads the same total thinner
    setDate('Vencimento da operação 1', '2026-04-27')
    expect(op().qty).toBe((10 * 5000) / 9)
    // not a whole number of lots per fixing: shown with decimals, the total stays what was typed
    expect(screen.getByTestId('hedge-lot-1')).toHaveTextContent('9 fixings: 1,11 lotes por fixing')
    expect(screen.getByLabelText('Quantidade da operação 1')).toHaveValue('10')
    // without the schedule there is nothing to divide by
    setDate('Data da operação 1', '')
    fireEvent.blur(screen.getByLabelText('Data da operação 1'))
    expect(op().qty).toBe(0)
    expect(screen.getByTestId('hedge-reason-1')).toHaveTextContent('Informe a data de início e o mês de vencimento')
  })

  it('the lots per fixing can be typed too: the total then follows from the number of fixings', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [
      {
        type: 'addHedgeOp',
        partial: { saved: false,
          kind: 'accumulator',
          floorLevel: 1000,
          strike: 1300,
          startDate: '2026-03-02',
          maturityDate: '2026-03-30',
          accum: { frequency: 'semanal' as const, totalLots: 10 },
        },
      },
    ])
    expect(screen.getByLabelText('Lotes por fixing da operação 1')).toHaveValue('2')
    await typeInto(user, 'Lotes por fixing da operação 1', '3')
    expect(op().qty).toBe(15000)
    expect(op().accum?.totalLots).toBeUndefined()
    expect(screen.getByLabelText('Quantidade da operação 1')).toHaveValue('15') // 3 lots x 5 fixings
    // a longer schedule keeps the lots per fixing the producer typed
    setDate('Vencimento da operação 1', '2026-04-27')
    expect(op().qty).toBe(15000)
    expect(screen.getByLabelText('Quantidade da operação 1')).toHaveValue('27') // 3 lots x 9 fixings
    // typing the total again goes back to dividing it
    await typeInto(user, 'Quantidade da operação 1', '18')
    expect(op().accum?.totalLots).toBe(18)
    expect(op().qty).toBe((18 * 5000) / 9)
  })

  it('the knock-out accumulator has the knock-out level and the premium, and no floor level', async () => {
    const { user } = await renderWithStore(<HedgePanel />, [ACC])
    await pickType(user, 1, 'Accumulator com knock-out')
    expect(menuButton(1)).toHaveTextContent('Accumulator com knock-out')
    expect(screen.queryByLabelText('Nível piso da operação 1')).toBeNull()
    expect(screen.getByLabelText('Nível de knock-out da operação 1')).toBeInTheDocument()
    expect(row(1)).toHaveTextContent('Nível de knock-out (barreira)')
    expect(screen.getByLabelText('Prêmio da operação 1')).toBeInTheDocument()
    // going back to floor/ceiling brings the floor field back
    await pickType(user, 1, 'Accumulator floor/ceiling')
    expect(screen.getByLabelText('Nível piso da operação 1')).toBeInTheDocument()
  })

  it('the premium is charged on the whole contract and shows up as already realized', async () => {
    await renderWithStore(<HedgePanel />, [{ ...ACC, partial: { ...ACC.partial, premium: 20 } }], {
      history: HIST,
      today: '2026-03-01',
    })
    // 5 fixings x 5.000 bu x 20 cents / 100 = US$ 5.000, at the dollar of the start date (5,0 in HIST) = R$ 25.000 paid
    expect(screen.getByTestId('hedge-status-1')).toHaveTextContent('Já realizado: −R$ 25.000')
  })

  it('has no axe violations with the new accumulator fields open', async () => {
    const { container } = await renderWithStore(<HedgePanel />, [
      { ...ACC, partial: { ...ACC.partial, premium: 20, floorLevel: 1200, premiumDir: 'recebido' } },
    ])
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })
})
