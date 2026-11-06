import { useRef, useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useDialogBehavior } from './useDialogBehavior'

function Dialog({ name, onClose }: { name: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useDialogBehavior(ref, onClose)
  return (
    <div ref={ref} role="dialog" aria-label={name}>
      <button onClick={onClose}>fechar {name}</button>
    </div>
  )
}

function Host({ nested = false }: { nested?: boolean }) {
  const [a, setA] = useState(false)
  const [b, setB] = useState(false)
  return (
    <main tabIndex={-1} data-testid="main">
      <button onClick={() => setA(true)}>abrir A</button>
      {nested && <button onClick={() => setB(true)}>abrir B</button>}
      {a && <Dialog name="A" onClose={() => setA(false)} />}
      {b && <Dialog name="B" onClose={() => setB(false)} />}
    </main>
  )
}

afterEach(() => {
  document.body.style.overflow = ''
})

describe('useDialogBehavior', () => {
  it('locks body scroll while open and restores the previous value', async () => {
    document.body.style.overflow = 'scroll'
    const user = userEvent.setup()
    render(<Host />)
    expect(document.body.style.overflow).toBe('scroll')
    await user.click(screen.getByRole('button', { name: 'abrir A' }))
    expect(document.body.style.overflow).toBe('hidden')
    await user.keyboard('{Escape}')
    expect(document.body.style.overflow).toBe('scroll')
  })

  it('is nesting-safe: the lock holds until the last dialog closes', async () => {
    const user = userEvent.setup()
    render(<Host nested />)
    await user.click(screen.getByRole('button', { name: 'abrir A' }))
    await user.click(screen.getByRole('button', { name: 'abrir B' }))
    expect(document.body.style.overflow).toBe('hidden')
    await user.click(screen.getByRole('button', { name: 'fechar B' }))
    expect(document.body.style.overflow).toBe('hidden')
    await user.click(screen.getByRole('button', { name: 'fechar A' }))
    expect(document.body.style.overflow).toBe('')
  })

  it('releases the lock when the dialog unmounts with the page', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Host />)
    await user.click(screen.getByRole('button', { name: 'abrir A' }))
    unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('returns focus to the element focused before opening', async () => {
    const user = userEvent.setup()
    render(<Host />)
    const opener = screen.getByRole('button', { name: 'abrir A' })
    await user.click(opener)
    expect(screen.getByRole('button', { name: 'fechar A' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(opener).toHaveFocus()
  })
})
