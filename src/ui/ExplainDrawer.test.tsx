import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { computeResult, type FarmInputs } from '../engine/calc'
import { CROPS } from '../engine/crops'
import { StoreProvider } from '../state/StoreProvider'
import { staticProvider } from '../data/staticProvider'
import { Simulador } from '../pages/Simulador'
import { KpiRow } from './KpiRow'
import { AppShell } from './AppShell'
import { buildExplanation, type ExplainContext, type ExplainKey } from './explain'
import { fmtBrl } from './format'
import { LEGACY_EXAMPLE, legacyState, seedState } from '../test/helpers'


const KEYS: ExplainKey[] = ['margem', 'precoFazenda', 'custo', 'margemTotal', 'precoMinimo', 'blendada']

async function ctxFor(
  patch: Partial<FarmInputs> = {},
  extra: Partial<ExplainContext> = {},
): Promise<ExplainContext> {
  const snap = await staticProvider.getSnapshot()
  const init = legacyState(snap)
  const farmInputs: FarmInputs = { ...init.inputs, ...patch }
  const scenario = {
    cbotUsc: snap.cbotUsc.soja.value,
    basisUsc: snap.basisUsc.soja.value,
    fx: snap.fx.value,
  }
  const crop = CROPS.soja
  return {
    result: computeResult(crop, scenario, farmInputs),
    farmInputs,
    scenario,
    crop,
    currency: 'BRL',
    fx: scenario.fx,
    marginBase: farmInputs.marginBase,
    ...extra,
  }
}

describe('buildExplanation', () => {
  it('precoFazenda shows the parity formula with live numbers', async () => {
    const ctx = await ctxFor()
    const ex = buildExplanation('precoFazenda', ctx)
    const text = JSON.stringify(ex)
    expect(ex.title).toBe('Preço na fazenda')
    expect(text).toContain('2,20462')
    expect(text).toContain('1.241,25')
    expect(text).toContain('5,4998')
    expect(ex.lines.at(-1)?.value).toContain(fmtBrl(ctx.result.farmPriceBrl))
  })

  it('precoFazenda explains the comparison by where the other prices sit (P1-2, #8)', async () => {
    const base = 'Comparação: B3 e Cepea são preços em outra praça (bolsa/porto), sem o frete e as taxas da sua fazenda; por isso'
    const above = buildExplanation('precoFazenda', await ctxFor({}, { comparison: 'acima' }))
    expect(above.note).toContain(`${base} costumam ficar acima do preço na fazenda.`)
    const below = buildExplanation('precoFazenda', await ctxFor({}, { comparison: 'abaixo' }))
    expect(below.note).toContain(`${base} hoje ficam abaixo do preço na fazenda.`)
    const near = buildExplanation('precoFazenda', await ctxFor({}, { comparison: 'proximo' }))
    expect(near.note).toContain(`${base} hoje ficam próximos do preço na fazenda.`)
    const none = buildExplanation('precoFazenda', await ctxFor())
    expect(none.note).toContain(`${base} podem ficar acima ou abaixo do preço na fazenda.`)
  })

  it('precoFazenda lists bolsa and base on two lines, like the waterfall (#8)', async () => {
    const ex = buildExplanation('precoFazenda', await ctxFor())
    expect(ex.lines[0].label).toBe('Bolsa (CBOT)')
    expect(ex.lines[0].value).toBe('US$ 12,41 /bushel')
    expect(ex.lines[1].label).toBe('+ Prêmio do porto')
    expect(ex.lines[1].value).toBe('US$ 0,62 /bushel')
    expect(ex.lines[2].label).toBe('Preço de referência')
  })

  it('uses 2,36218 bushels for milho', async () => {
    const ctx = await ctxFor()
    const ex = buildExplanation('precoFazenda', { ...ctx, crop: CROPS.milho })
    expect(JSON.stringify(ex)).toContain('2,36218')
  })

  it('every key returns title, intro and lines without throwing, also with no yield (5 steps)', async () => {
    for (const patch of [{}, { yieldScHa: 0 }, { areaHa: 0 }, { soldPct: 0.5, soldAvgPriceBrl: 120 }]) {
      const ctx = await ctxFor(patch)
      if ('yieldScHa' in patch) expect(ctx.result.steps).toHaveLength(5)
      for (const k of KEYS) {
        const ex = buildExplanation(k, ctx)
        expect(ex.title).toMatch(/\S/)
        expect(ex.intro).toMatch(/\S/)
        expect(ex.lines.length).toBeGreaterThan(0)
        expect(JSON.stringify(ex)).not.toMatch(/NaN|Infinity|undefined|null/)
      }
    }
  })

  it('shows dashes when there is no yield', async () => {
    const ex = buildExplanation('custo', await ctxFor({ yieldScHa: 0 }))
    expect(ex.lines.at(-1)?.value).toBe('—')
    expect(ex.note).toMatch(/produtividade/)
  })

  it('custo mentions the eight categories in categorias mode', async () => {
    const ctx = await ctxFor({}, { costMode: 'categorias' })
    expect(JSON.stringify(buildExplanation('custo', ctx))).toMatch(/8 categorias/)
  })

  it('margem shows both definitions and marks the active one', async () => {
    const rev = buildExplanation('margem', await ctxFor({ marginBase: 'receita' }))
    expect(rev.lines.find((l) => l.label.startsWith('Margem sobre a receita'))?.label).toMatch(/usada/)
    expect(rev.lines.find((l) => l.label.startsWith('Margem sobre o custo'))?.label).not.toMatch(/usada/)
    const cost = buildExplanation('margem', await ctxFor({ marginBase: 'custo' }))
    expect(cost.lines.find((l) => l.label.startsWith('Margem sobre o custo'))?.label).toMatch(/usada/)
  })

  it('precoMinimo uses the active base formula and explains unreachable', async () => {
    const rev = buildExplanation('precoMinimo', await ctxFor({ marginBase: 'receita', targetMargin: 0.2 }))
    expect(rev.lines.at(-1)?.formula).toContain('÷ (1 − 20%)')
    const cost = buildExplanation('precoMinimo', await ctxFor({ marginBase: 'custo', targetMargin: 0.2 }))
    expect(cost.lines.at(-1)?.formula).toContain('× (1 + 20%)')
    const impossible = buildExplanation(
      'precoMinimo',
      await ctxFor({ marginBase: 'receita', targetMargin: 1 }),
    )
    expect(impossible.lines.at(-1)?.value).toBe('inatingível')
    expect(impossible.note).toMatch(/inatingível/)
  })

  it('#3 margem note points at the pill beside the margin, not at the top of the screen', async () => {
    const ex = buildExplanation('margem', await ctxFor())
    expect(ex.note).toBe(
      'Você pode trocar entre margem sobre a receita e sobre o custo na pílula ao lado da margem.',
    )
    expect(ex.note).not.toMatch(/no topo da tela/)
  })

  it('#3 precoMinimo without a target says where the switch lives (the "Definir meta de margem" button of the Simulação)', async () => {
    const ex = buildExplanation('precoMinimo', await ctxFor({ targetMargin: null }))
    expect(ex.note).toBe(
      'Defina a meta no botão “Definir meta de margem”, logo abaixo dos resultados da Simulação, para ver o preço mínimo.',
    )
    expect(ex.note).not.toMatch(/em Comercialização/)
  })

  it('precoMinimo without a target explains that none is set and does not crash', async () => {
    for (const base of ['receita', 'custo'] as const) {
      const ex = buildExplanation('precoMinimo', await ctxFor({ marginBase: base, targetMargin: null }))
      expect(ex.intro).toMatch(/não definiu uma meta/i)
      expect(ex.note ?? '').toMatch(/meta/i)
      expect(JSON.stringify(ex)).not.toMatch(/NaN|Infinity|inatingível|null/)
    }
  })

  it('blendada mixes sold and open shares', async () => {
    const ex = buildExplanation('blendada', await ctxFor({ soldPct: 0.4, soldAvgPriceBrl: 130 }))
    expect(ex.lines.map((l) => l.formula).join(' ')).toContain(
      '40% × preço médio vendido + 60% × preço de hoje',
    )
    expect(ex.lines.at(-1)?.value).toMatch(/%$/)
  })

  it('converts values to the display currency', async () => {
    const ctx = await ctxFor()
    const ex = buildExplanation('margemTotal', { ...ctx, currency: 'USD' })
    expect(ex.lines[0].value).toContain('US$')
  })
})

function mockDesktop() {
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

async function setup() {
  const user = userEvent.setup()
  render(
    <StoreProvider>
      <AppShell route="simulador">
        <Simulador kpis={<KpiRow />} showMeta />
      </AppShell>
    </StoreProvider>,
  )
  await screen.findByTestId('page-simulador')
  await user.click(screen.getByRole('button', { name: 'Pular tour' }))
  return user
}

beforeEach(() => {
  localStorage.clear()
  // Pre-FOB example farm (Centro-Sul at the Paranaguá base); tour still unseen like a first visit.
  seedState(LEGACY_EXAMPLE, false)
  mockDesktop()
})

afterEach(() => {
  // @ts-expect-error resetting the stub between tests
  delete window.matchMedia
})

describe('ExplainDrawer', () => {
  it('clicking info on Preço na fazenda opens the drawer with the farm price formula and live numbers', async () => {
    const user = await setup()
    const snap = await staticProvider.getSnapshot()
    const farm = computeResult(
      CROPS.soja,
      { cbotUsc: snap.cbotUsc.soja.value, basisUsc: snap.basisUsc.soja.value, fx: snap.fx.value },
      legacyState(snap).inputs,
    ).farmPriceBrl
    await user.click(screen.getByRole('button', { name: 'Como calculamos: preço na fazenda' }))
    const dialog = screen.getByRole('dialog', { name: 'Preço na fazenda' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveTextContent('2,20462')
    expect(dialog).toHaveTextContent('1.241,25')
    expect(dialog).toHaveTextContent(fmtBrl(farm))
    expect(dialog).toHaveTextContent('Valores em reais (R$); conta feita no seu navegador.')
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })

  it('Esc closes the drawer and returns focus to the trigger', async () => {
    const user = await setup()
    const trigger = screen.getByRole('button', { name: 'Como calculamos: custo por saca' })
    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Custo por saca' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('the close button and a backdrop click close it too', async () => {
    const user = await setup()
    const trigger = screen.getByRole('button', { name: 'Como calculamos: margem por saca' })
    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    await user.click(trigger)
    await user.click(screen.getByTestId('explain-backdrop'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('traps Tab inside the dialog', async () => {
    const user = await setup()
    await user.click(screen.getByRole('button', { name: 'Como calculamos: margem total da safra' }))
    const dialog = screen.getByRole('dialog')
    for (let i = 0; i < 4; i++) {
      await user.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
    await user.tab({ shift: true })
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })

  it('has an accessible trigger for every explanation (blendada once something is sold)', async () => {
    const user = await setup()
    // No target by default: the minimum-price explanation is not offered until a target is set.
    expect(screen.queryByRole('button', { name: 'Como calculamos: preço mínimo' })).toBeNull()
    for (const name of ['margem por saca', 'preço na fazenda', 'custo por saca', 'margem total da safra']) {
      expect(screen.getByRole('button', { name: `Como calculamos: ${name}` })).toBeInTheDocument()
    }
    // Feedback 1: the minimum price lives in the meta dialog; "margem blendada" on #/preco (PrecoOrigem.test).
    await user.click(screen.getByRole('button', { name: 'Definir meta de margem' }))
    const meta = screen.getByRole('dialog', { name: 'Meta de margem' })
    await user.click(within(meta).getByRole('switch', { name: /definir meta de margem/i }))
    await user.click(within(meta).getByRole('button', { name: 'Como calculamos: preço mínimo' }))
    expect(screen.getByRole('dialog', { name: 'Preço mínimo para a meta' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Como calculamos: margem blendada' })).toBeNull()
  })

  it('info triggers are 44px on mobile (the main "Como calculamos" button moved to #/preco)', async () => {
    await setup()
    const i = screen.getByRole('button', { name: 'Como calculamos: preço na fazenda' })
    expect(i.className).toContain('h-11')
    expect(i.className).toContain('w-11')
    expect(screen.queryByRole('button', { name: 'Como calculamos' })).toBeNull()
  })

  it('opens without crashing when there is no yield', async () => {
    const user = await setup()
    const y = screen.getByLabelText('Produtividade')
    await user.clear(y)
    await user.tab()
    await user.click(screen.getByRole('button', { name: 'Como calculamos: custo por saca' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('—')
  })
})
