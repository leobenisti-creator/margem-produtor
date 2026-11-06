import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { FxChip } from './FxChip'

function Harness({ spy }: { spy?: (v: { boughtPct: number; boughtRate: number }) => void }) {
  const [v, setV] = useState({ amountUsdHa: 195, boughtPct: 0, boughtRate: 0 })
  return (
    <FxChip
      label="Macronutrientes"
      fx={5.4998}
      value={v}
      onChange={(next) => {
        spy?.(next)
        setV((cur) => ({ ...cur, ...next }))
      }}
    />
  )
}

async function type(user: ReturnType<typeof userEvent.setup>, label: string, text: string) {
  const f = screen.getByLabelText(label)
  await user.clear(f)
  await user.type(f, text)
  await user.tab()
}

describe('FxChip', () => {
  it('0% bought follows the dollar of the day', () => {
    render(<Harness />)
    expect(screen.getByTestId('fx-effective')).toHaveTextContent('do dia')
    expect(screen.getByTestId('fx-effective')).toHaveTextContent('5,4998')
  })

  it('60% bought at 5,20 shows the effective dollar 5,3199', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await type(user, 'Já comprado (Macronutrientes)', '60')
    await type(user, 'A que dólar (Macronutrientes)', '5,20')
    expect(screen.getByTestId('fx-effective')).toHaveTextContent('5,3199')
  })

  it('holds a bought % without its dollar (never stores an invalid pair) and asks for the dollar', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    render(<Harness spy={spy} />)
    await type(user, 'Já comprado (Macronutrientes)', '60')
    expect(spy).not.toHaveBeenCalled()
    expect(screen.getByText(/Informe a que dólar/)).toBeInTheDocument()
    await type(user, 'A que dólar (Macronutrientes)', '5,2')
    expect(spy).toHaveBeenLastCalledWith({ boughtPct: 0.6, boughtRate: 5.2 })
  })

  it('rejects more than 100%', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    render(<Harness spy={spy} />)
    const f = screen.getByLabelText('Já comprado (Macronutrientes)')
    await user.clear(f)
    await user.type(f, '150')
    expect(screen.getByRole('alert')).toHaveTextContent(/entre 0% e 100%/)
    expect(spy).not.toHaveBeenCalled()
  })

  it('100% bought reads as locked at the rate', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await type(user, 'A que dólar (Macronutrientes)', '5')
    await type(user, 'Já comprado (Macronutrientes)', '100')
    expect(screen.getByTestId('fx-effective')).toHaveTextContent('travado')
    expect(screen.getByTestId('fx-effective')).toHaveTextContent('5,0000')
  })
})
