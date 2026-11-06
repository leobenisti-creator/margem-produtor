import { render, screen } from '@testing-library/react'
import { App } from '../../App'
import { staticProvider } from '../../data/staticProvider'
import type { MarketSnapshot } from '../../data/types'
import { INICIO_SECTIONS } from '../../pages/Inicio'
import { buildLiveExample } from './useLiveExample'
import { seedSnapshot } from './testUtils'

vi.setConfig({ testTimeout: 15000 })

function withSnapshot(edit: (s: MarketSnapshot) => void) {
  const s = seedSnapshot()
  edit(s)
  vi.spyOn(staticProvider, 'getSnapshot').mockImplementation(() => Promise.resolve(structuredClone(s)))
}

beforeEach(() => {
  localStorage.clear()
  window.location.hash = '#/inicio'
})
afterEach(() => vi.restoreAllMocks())

describe('Início with an unusable market dollar or CBOT', () => {
  it.each([
    ['dólar 0', (s: MarketSnapshot) => void (s.fx.value = 0)],
    ['CBOT soja 0', (s: MarketSnapshot) => void (s.cbotUsc.soja.value = 0)],
    ['dólar NaN', (s: MarketSnapshot) => void (s.fx.value = Number.NaN)],
  ])('%s: no throw, the 7 sections render, no numbers from the matrix', async (_n, edit) => {
    withSnapshot(edit)
    render(<App />)
    const page = await screen.findByTestId('page-inicio')
    for (const s of INICIO_SECTIONS) expect(page.querySelector(`#${s.id}`)).not.toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText(/de 81 cenários/)).toBeNull()
    expect(screen.getAllByText(/Dólar ou CBOT indisponível/).length).toBeGreaterThanOrEqual(1)
  })

  it('buildLiveExample returns a null matrix and null analyses instead of throwing', () => {
    const s = seedSnapshot()
    s.fx.value = 0
    const ex = buildLiveExample(s)
    expect(ex.matrix).toBeNull()
    expect(ex.meta.below.analysis).toBeNull()
    expect(ex.meta.above.analysis).toBeNull()
    expect(ex.marginPerSc).toBeNull()
  })
})
