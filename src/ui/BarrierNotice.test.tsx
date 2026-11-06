import { screen } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import type { Action } from '../state/types'
import { renderWithStore } from '../test/storeHarness'
import { BarrierNotice } from './BarrierNotice'
import { ComercializacaoKpis } from './ComercializacaoKpis'

vi.setConfig({ testTimeout: 20000 })
expect.extend(toHaveNoViolations)
beforeEach(() => localStorage.clear())

const FARM: Action[] = [
  { type: 'setInput', key: 'areaHa', value: 1000 },
  { type: 'setInput', key: 'yieldScHa', value: 60 },
]
const koPut: Action = {
  type: 'addHedgeOp',
  partial: {
    asset: 'soja',
    kind: 'put',
    side: 'comprado',
    qty: 100_000,
    strike: 1150,
    premium: 25,
    startDate: '2026-10-20',
    maturityDate: '2027-07-15',
    barrier: { type: 'ko', price: 1320, dir: 'alta' },
  },
}
const plainPut: Action = { type: 'addHedgeOp', partial: { ...(koPut as { partial: object }).partial, barrier: null } as never }
const soldCall: Action = {
  type: 'addHedgeOp',
  partial: { asset: 'soja', kind: 'call', side: 'vendido', qty: 50_000, strike: 1350, premium: 20, maturityDate: '2027-07-15' },
}

describe('BarrierNotice (Comercialização)', () => {
  it('shows nothing without operations or with operations that have no barrier', async () => {
    await renderWithStore(<BarrierNotice />, FARM)
    expect(screen.queryByTestId('aviso-barreira')).toBeNull()
    await renderWithStore(<BarrierNotice />, [...FARM, plainPut])
    expect(screen.queryByTestId('aviso-barreira')).toBeNull()
  })

  it('a live knock-out put: says it ends if the CBOT touches the barrier, even if the price comes back', async () => {
    await renderWithStore(<BarrierNotice />, [...FARM, koPut])
    const box = await screen.findByTestId('aviso-barreira')
    expect(box).toHaveTextContent('Put com knock-out')
    expect(box).toHaveTextContent('protege abaixo de 1.150 US¢/bu')
    expect(box).toHaveTextContent('A proteção acaba se a CBOT subir até 1.320 US¢/bu')
    expect(box).toHaveTextContent('mesmo que o preço volte a cair depois')
    expect(screen.getByTestId('barreira-resumo')).toHaveTextContent('100%')
  })

  it('shows how much touching the barrier would cost at a lower final price', async () => {
    await renderWithStore(<BarrierNotice />, [...FARM, koPut])
    const loss = await screen.findByTestId('barreira-perda')
    expect(loss).toHaveTextContent('Se a barreira for tocada')
    expect(loss).toHaveTextContent(/deixa de receber cerca de R\$ [\d,]+ (mi|mil)/)
  })

  it('a call sold is listed apart as a limit to the gain, not as protection', async () => {
    await renderWithStore(<BarrierNotice />, [...FARM, soldCall])
    const box = await screen.findByTestId('aviso-barreira')
    expect(box).toHaveTextContent('Limite de ganho')
    expect(box).toHaveTextContent('Call vendida')
    expect(box).toHaveTextContent('limita o seu ganho acima de 1.350 US¢/bu')
    expect(screen.queryByTestId('barreira-resumo')).toBeNull()
  })

  it('the protected-crop card says part of it depends on a barrier', async () => {
    await renderWithStore(<ComercializacaoKpis />, [...FARM, koPut])
    expect(await screen.findByTestId('com-fechado-barreira')).toHaveTextContent('depende de barreira')
  })

  it('the protected-crop card has no such line without a barrier operation', async () => {
    await renderWithStore(<ComercializacaoKpis />, [...FARM, plainPut])
    expect(screen.queryByTestId('com-fechado-barreira')).toBeNull()
  })

  it('has no accessibility violations', async () => {
    const { container } = await renderWithStore(<BarrierNotice />, [...FARM, koPut, soldCall])
    await screen.findByTestId('aviso-barreira')
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })
})
