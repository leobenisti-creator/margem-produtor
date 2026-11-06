import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NumberField } from './NumberField'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const tick = () => new Promise((r) => setTimeout(r, 20))

describe('NumberField', () => {
  it('keeps text typed right after mount: the mount-time sync must not overwrite it', async () => {
    // Outside act(), React commits first and flushes passive effects in a later task.
    // We edit the input in the microtask right after the commit, i.e. before those effects.
    const prev = globalThis.IS_REACT_ACT_ENVIRONMENT
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onCommit = vi.fn()
    try {
      const input = await new Promise<HTMLInputElement>((resolve) => {
        const obs = new MutationObserver(() => {
          const el = container.querySelector('input')
          if (!el) return
          obs.disconnect()
          fireEvent.change(el, { target: { value: '' } })
          resolve(el)
        })
        obs.observe(container, { childList: true, subtree: true })
        root.render(<NumberField label="Produtividade" value={60.4} onCommit={onCommit} />)
      })
      await tick()
      expect(input.value).toBe('')
      fireEvent.blur(input)
      expect(onCommit).toHaveBeenCalledWith(0)
    } finally {
      root.unmount()
      container.remove()
      globalThis.IS_REACT_ACT_ENVIRONMENT = prev
    }
  })

  /** Controlled host, like the real cards: the committed value flows back through `value`. */
  function Host({
    initial = 60.4,
    validate,
    scale = 1,
    spy,
    mirror,
  }: {
    initial?: number
    validate?: (v: number) => string | null
    scale?: number
    spy: (v: number) => void
    mirror?: boolean
  }) {
    const [v, setV] = useState(initial)
    return (
      <>
        <NumberField
          label="Campo"
          value={v * scale}
          validate={validate}
          maxDecimals={4}
          onCommit={(x) => {
            spy(x)
            setV(x / scale)
          }}
        />
        {mirror && <button onClick={() => setV(99)}>externo</button>}
        <output data-testid="state">{v}</output>
      </>
    )
  }
  const field = () => screen.getByLabelText('Campo') as HTMLInputElement

  it('commits live on every parseable keystroke and never rewrites the text while focused', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    render(<Host spy={spy} />)
    await user.clear(field())
    expect(spy).not.toHaveBeenCalled() // empty is mid-edit
    for (const [ch, text] of [
      ['4', '4'],
      ['.', '4.'],
      ['2', '4.2'],
      ['0', '4.20'],
      ['0', '4.200'],
    ]) {
      await user.type(field(), ch)
      expect(field().value).toBe(text)
    }
    // "4." is unparseable (no call); "4.2"/"4.20" are decimals; "4.200" is a thousands group.
    expect(spy.mock.calls.map((c) => c[0])).toEqual([4, 4.2, 4200])
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('types 1.234,5 char by char: ends at 1234.5 with the text untouched', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    render(<Host spy={spy} />)
    await user.clear(field())
    let typed = ''
    for (const ch of '1.234,5') {
      await user.type(field(), ch)
      typed += ch
      expect(field().value).toBe(typed)
      expect(screen.queryByRole('alert')).toBeNull()
    }
    expect(spy).toHaveBeenLastCalledWith(1234.5)
    expect(screen.getByTestId('state').textContent).toBe('1234.5')
    expect(field().value).toBe('1.234,5')
  })

  it('keeps a trailing comma as typed and reformats only on blur', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    render(<Host spy={spy} />)
    await user.clear(field())
    await user.type(field(), '1234,5')
    expect(field().value).toBe('1234,5')
    expect(spy).toHaveBeenLastCalledWith(1234.5)
    const calls = spy.mock.calls.length
    await user.tab()
    expect(field().value).toBe('1.234,5')
    expect(spy.mock.calls.length).toBe(calls) // idempotent: no duplicate dispatch on blur
  })

  it('shows an error for clearly invalid text immediately and does not commit', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    render(<Host spy={spy} />)
    await user.clear(field())
    await user.type(field(), 'abc')
    expect(screen.getByRole('alert')).toHaveTextContent('número válido')
    expect(spy).not.toHaveBeenCalled()
    expect(screen.getByTestId('state').textContent).toBe('60.4')
  })

  it('rejects a value the validator refuses (150) and recovers when it becomes valid', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    const validate = (v: number) => (v > 100 ? 'No máximo 100%.' : null)
    render(<Host spy={spy} validate={validate} />)
    await user.clear(field())
    await user.type(field(), '150')
    expect(screen.getByRole('alert')).toHaveTextContent('No máximo 100%.')
    expect(spy.mock.calls.map((c) => c[0])).toEqual([1, 15])
    expect(screen.getByTestId('state').textContent).toBe('15') // mid-typing: results follow the valid prefix
    await user.tab()
    expect(screen.getByTestId('state').textContent).toBe('60.4') // blur restores the pre-edit value
    expect(spy).toHaveBeenLastCalledWith(60.4)
    expect(field().value).toBe('150') // text and error stay
    expect(screen.getByRole('alert')).toBeInTheDocument()
    await user.clear(field())
    await user.type(field(), '15')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('empty text on blur commits 0; no error while the field is merely empty and focused', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    render(<Host spy={spy} />)
    await user.clear(field())
    expect(screen.queryByRole('alert')).toBeNull()
    expect(spy).not.toHaveBeenCalled()
    await user.tab()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(0)
    expect(field().value).toBe('0')
  })

  it('blur on a still-invalid text keeps the error and the previous state', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    render(<Host spy={spy} />)
    await user.clear(field())
    await user.type(field(), '4,')
    expect(screen.queryByRole('alert')).toBeNull()
    await user.tab()
    // "4," is incomplete but a blur settles it: it is not a number
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(spy.mock.calls.map((c) => c[0])).toEqual([4, 60.4]) // live 4, then baseline restored
    expect(screen.getByTestId('state').textContent).toBe('60.4')
  })

  it('own live commits do not overwrite the text even when the echoed prop is scaled/rounded', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    // value prop = state * 3, so the echo (3 * 0.1 = 0.30000000000000004) differs from the typed text
    render(<Host spy={spy} scale={3} initial={1} />)
    await user.clear(field())
    await user.type(field(), '0,3')
    expect(field().value).toBe('0,3')
    expect(spy).toHaveBeenLastCalledWith(0.3)
  })

  it('an external change while focused does not clobber mid-edit text, but replaces a parseable different number', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    render(<Host spy={spy} mirror />)
    await user.clear(field())
    await user.type(field(), '4,')
    fireEvent.click(screen.getByText('externo')) // fireEvent keeps focus on the input
    expect(field().value).toBe('4,') // mid-edit text survives
    await user.type(field(), '5')
    expect(field().value).toBe('4,5')
    fireEvent.click(screen.getByText('externo')) // 4,5 parses and differs from 99: replaced
    expect(field().value).toBe('99')
  })

  it('an external change replaces the text when the field is not focused', async () => {
    const user = userEvent.setup()
    render(<Host spy={vi.fn()} mirror />)
    await user.click(screen.getByText('externo'))
    expect(field().value).toBe('99')
  })

  it('blur without edits is a no-op', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    render(<Host spy={spy} initial={60.456789} />)
    await user.click(field())
    await user.tab()
    expect(spy).not.toHaveBeenCalled()
  })


  const over100 = (v: number) => (v > 100 ? 'No máximo 100%.' : null)

  it('Enter with a rejected value restores the baseline once; the following blur is a no-op', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    render(<Host spy={spy} validate={over100} />)
    await user.clear(field())
    await user.type(field(), '150{Enter}')
    expect(screen.getByTestId('state').textContent).toBe('60.4')
    const n = spy.mock.calls.length
    await user.tab()
    expect(spy.mock.calls.length).toBe(n)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(field().value).toBe('150')
  })

  it('a later valid value updates the baseline for the next rejection', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    render(<Host spy={spy} validate={over100} />)
    await user.clear(field())
    await user.type(field(), '150')
    await user.tab()
    expect(screen.getByTestId('state').textContent).toBe('60.4')
    await user.clear(field())
    await user.type(field(), '40')
    await user.tab()
    expect(screen.getByTestId('state').textContent).toBe('40')
    await user.clear(field())
    await user.type(field(), '999')
    await user.tab()
    expect(screen.getByTestId('state').textContent).toBe('40')
  })

  it('no live commit happened: a rejected value does not dispatch at all', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    render(<Host spy={spy} validate={() => 'não'} />)
    await user.clear(field())
    await user.type(field(), '5')
    await user.tab()
    expect(spy).not.toHaveBeenCalled()
  })

  it('the revert goes through onCommit with the same conversion (percent: display 30 -> state 0.3)', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    render(<Host spy={spy} initial={0.3} scale={100} validate={over100} />)
    await user.clear(field())
    await user.type(field(), '150')
    await user.tab()
    expect(spy).toHaveBeenLastCalledWith(30)
    expect(screen.getByTestId('state').textContent).toBe('0.3')
  })

  it('clearing the text clears a stale error without dispatching; blur then commits 0', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    render(<Host spy={spy} />)
    await user.clear(field())
    await user.type(field(), 'abc')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    await user.clear(field())
    expect(screen.queryByRole('alert')).toBeNull()
    expect(spy).not.toHaveBeenCalled()
    await user.tab()
    expect(spy).toHaveBeenCalledWith(0)
  })

  it('disabled fields never commit', () => {
    const spy = vi.fn()
    render(<NumberField label="Campo" value={1} disabled onCommit={spy} />)
    fireEvent.change(field(), { target: { value: '5' } })
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('NumberField: typing into an empty (0) field', () => {
  function Harness({ start = 0 }: { start?: number }) {
    const [v, setV] = useState(start)
    return (
      <>
        <NumberField label="Preço" value={v} onCommit={setV} />
        <output data-testid="stored">{v}</output>
      </>
    )
  }

  it('the first keystroke replaces the 0 placeholder (150 is shown as 150, not 0150)', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const input = screen.getByLabelText('Preço') as HTMLInputElement
    await user.click(input)
    await user.keyboard('150,5')
    expect(input.value).toBe('150,5')
    expect(screen.getByTestId('stored')).toHaveTextContent('150.5')
  })

  it('a filled field is not selected on focus: typing still appends', async () => {
    const user = userEvent.setup()
    render(<Harness start={12} />)
    const input = screen.getByLabelText('Preço') as HTMLInputElement
    await user.click(input)
    await user.keyboard('3')
    expect(input.value).toBe('123')
  })
})
