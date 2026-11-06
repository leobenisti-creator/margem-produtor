import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  ArrowLeftRight,
  Calculator,
  CircleDollarSign,
  FileText,
  Layers,
  Map as MapIcon,
  Receipt,
  Repeat,
  Route,
  Ruler,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  TrendingUp,
  Wheat,
  type LucideIcon,
} from 'lucide-react'
import { COST_CATEGORY_IDS, COST_CATEGORY_LABELS, type CostCategoryId } from '../../data/types'
import { fmtNum, fmtPct } from '../format'
import { toneClass } from '../MatrixTable'
import { veil } from './overlay'
import { PHOTOS, type PhotoDef } from './photos'
import { Eyebrow, PhotoImg, Screen, panelClass } from './shared'
import { CountUp, FadeSwap, GrowBar, Reveal, Stagger, StaggerItem } from './motion'
import { EXAMPLE_COST_BY_GROUP } from './exampleFarm'
import { MARKET_UNAVAILABLE, type LiveExample } from './useLiveExample'

interface Item {
  icon: LucideIcon
  title: string
  text: string
}

interface TabDef {
  id: string
  /** Name of the app page this tab describes. */
  label: string
  photo: PhotoDef
  /** One line over the photo. */
  promise: string
  faz: Item[]
  mostra: Item[]
  preview: (ex: LiveExample) => ReactNode
}

const fin = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)

/**
 * A number that settles from 0 to its value the first time its tab preview is seen in the visit (kit CountUp, keyed by
 * `id`). The final text is what renders when it already played or motion is off.
 */
function Settle({ id, value, format }: { id: string; value: number; format: (n: number) => string }) {
  return <CountUp id={id} value={value} format={format} from={0} className="num" />
}

/** Faithful drawing of a card of the app: same tokens, read-only, never touches the visitor's data. */
function PreviewCard({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-card p-5">
      <b className="text-sm text-tx">{title}</b>
      {note && <p className="mt-0.5 text-xs text-mut">{note}</p>}
      <div className="mt-4">{children}</div>
    </div>
  )
}

/** Keys of the preview animations: one set per tab, so each tab animates only the first time it is shown. */
const PREVIEW = 'appfaz.lavoura.preview'

function CostBars({ ex }: { ex: LiveExample }) {
  const rows = COST_CATEGORY_IDS.map((id) => ({ id, label: COST_CATEGORY_LABELS[id], v: EXAMPLE_COST_BY_GROUP[id] }))
    .filter((r): r is { id: CostCategoryId; label: string; v: number } => fin(r.v) && r.v > 0)
    .sort((a, b) => b.v - a.v)
  const max = Math.max(...rows.map((r) => r.v), 0)
  const total = ex.inputs.costPerHaBrl
  return (
    <PreviewCard title="Custo por grupo" note={`${ex.regionLabel} · exemplo ilustrativo, em R$ por hectare`}>
      {max <= 0 ? (
        <p className="text-sm text-mut">Sem custo no exemplo.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.id} className="text-xs">
              <div className="flex justify-between gap-3">
                <span className="text-mut">{r.label}</span>
                <b className="text-tx">
                  R$ <Settle id={`${PREVIEW}.valor.${r.id}`} value={r.v} format={(n) => fmtNum(n, 0)} />
                </b>
              </div>
              <div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-bar-track">
                <GrowBar ratio={r.v / max} className="rounded-full bg-acc" delay={0.06 * i} id={`${PREVIEW}.barra.${r.id}`} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {fin(total) && total > 0 && (
        <p className="mt-4 flex justify-between gap-3 border-t border-line pt-3 text-sm">
          <span className="text-mut">Custo total</span>
          <b className="text-tx">
            R$ <Settle id={`${PREVIEW}.total`} value={total} format={(n) => fmtNum(n, 0)} />
            /ha
          </b>
        </p>
      )}
    </PreviewCard>
  )
}

function SmallStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-bg p-3">
      <p className="text-[11px] text-mut">{label}</p>
      <b className="num text-base text-tx">{children}</b>
    </div>
  )
}

const EXPOSURE = 'appfaz.comercializacao.preview'

function Exposure({ ex }: { ex: LiveExample }) {
  // The example farm has nothing sold or hedged: the cards come straight from its own inputs.
  const sold = Math.min(1, Math.max(0, ex.inputs.soldPct))
  const fxOpen = ex.inputs.fxLockPct < 1
  return (
    <PreviewCard title="Exposição da safra" note={`${ex.regionLabel} · exemplo ilustrativo, sem vendas nem operações`}>
      <div className="grid grid-cols-2 gap-2.5">
        <SmallStat label="Protegido">
          <Settle id={`${EXPOSURE}.protegido`} value={sold} format={(n) => fmtPct(n, 0)} />
        </SmallStat>
        <SmallStat label="Exposto">
          <Settle id={`${EXPOSURE}.exposto`} value={1 - sold} format={(n) => fmtPct(n, 0)} />
        </SmallStat>
        <SmallStat label="Dólar">{fxOpen ? 'em aberto' : 'travado'}</SmallStat>
        <SmallStat label="Operações">{ex.inputs.hedge ? 'com operações' : 'nenhuma'}</SmallStat>
      </div>
      <p className="mt-5 text-xs text-mut">Mapa da safra</p>
      <div aria-hidden="true" className="mt-1.5 h-3 overflow-hidden rounded-full bg-bar-pos">
        <GrowBar ratio={1 - sold} className="rounded-full bg-bar-neg" id={`${EXPOSURE}.mapa`} />
      </div>
      <p aria-hidden="true" className="mt-2 flex justify-between text-[11px] text-mut">
        <span>exposto ao mercado</span>
        <span>protegido</span>
      </p>
    </PreviewCard>
  )
}

const MATRIX = 'appfaz.resultados.matriz'

function MatrixPreview({ ex }: { ex: LiveExample }) {
  if (ex.matrix === null) {
    return (
      <PreviewCard title="Matriz de cenários">
        <p className="text-sm text-mut">{MARKET_UNAVAILABLE}</p>
      </PreviewCard>
    )
  }
  const c = [0, 0, 0]
  for (const cell of ex.matrix.cells.flat()) if (cell.tone !== null) c[cell.tone] += 1
  return (
    <PreviewCard title="Matriz de cenários" note="Linhas: CBOT. Colunas: dólar. A cor mostra a margem.">
      <div
        role="img"
        aria-label={`Matriz 9 por 9 do exemplo: ${c[2]} cenários com margem boa, ${c[1]} com margem baixa e ${c[0]} perdendo dinheiro`}
      >
        <Stagger id={MATRIX} gap={0.05} className="grid gap-px overflow-hidden rounded-lg">
          {ex.matrix.cells.map((row, r) => (
            <StaggerItem key={r} y={0} className="grid grid-cols-9 gap-px">
              {row.map((cell, k) => (
                <i
                  key={k}
                  className={`block h-5 sm:h-6 ${toneClass(cell.tone)} ${r === 4 && k === 4 ? 'ring-2 ring-inset ring-tx' : ''}`}
                />
              ))}
            </StaggerItem>
          ))}
        </Stagger>
      </div>
      {fin(ex.marginPerSc) && (
        <p className="mt-4 flex justify-between gap-3 border-t border-line pt-3 text-sm">
          <span className="text-mut">Margem de hoje (quadrado com borda)</span>
          <b className="text-tx">
            R$ <Settle id={`${MATRIX}.margem`} value={ex.marginPerSc} format={(n) => fmtNum(n, 2)} />
            /sc
          </b>
        </p>
      )}
    </PreviewCard>
  )
}

const TABS: TabDef[] = [
  {
    id: 'lavoura',
    label: 'Lavoura e custos',
    photo: PHOTOS.adubacao,
    promise: 'Aqui você diz o que a lavoura custa. O app mostra quanto vale a saca na sua porteira.',
    faz: [
      { icon: Ruler, title: 'Informe a lavoura', text: 'Escolha a praça e digite sua área e sua produtividade.' },
      {
        icon: Calculator,
        title: 'Preencha os custos',
        text: 'Digite por grupo ou só o total. O adubo vai produto por produto.',
      },
      {
        icon: Repeat,
        title: 'Marque o barter',
        text: 'Em “Realizou operação barter”, as sacas que você entrega à revenda saem de todas as contas.',
      },
      { icon: ArrowLeftRight, title: 'Troque a unidade', text: 'Veja tudo em R$/ha, R$/sc ou sc/ha.' },
    ],
    mostra: [
      {
        icon: Wheat,
        title: 'Preço da fazenda',
        text: 'Sai da bolsa de Chicago (CBOT) e do dólar e chega à porteira, com frete e taxas do porto.',
      },
      {
        icon: CircleDollarSign,
        title: 'Dólar de cada custo',
        text: 'O insumo que você já comprou fica no dólar do dia da compra.',
      },
      {
        icon: Layers,
        title: 'Peso de cada grupo',
        text: 'Você vê qual grupo pesa mais no custo. Ao lado, um exemplo ilustrativo.',
      },
    ],
    preview: (ex) => <CostBars ex={ex} />,
  },
  {
    id: 'comercializacao',
    label: 'Comercialização',
    photo: PHOTOS.mercado,
    promise: 'Aqui você registra o que já vendeu e o que já protegeu.',
    faz: [
      {
        icon: Receipt,
        title: 'Registre suas vendas',
        text: 'Informe sacas, toneladas ou bushels, o preço e o dólar da venda.',
      },
      {
        icon: TrendingUp,
        title: 'Registre suas operações na bolsa',
        text: 'Futuros, opções e accumulators, com vencimento e lotes.',
      },
      {
        icon: Save,
        title: 'Salve',
        text: 'O botão “Salvar” guarda a venda ou a operação e a leva para a lista de salvas.',
      },
    ],
    mostra: [
      {
        icon: ShieldCheck,
        title: 'Protegido e exposto',
        text: 'Quanto da safra já tem preço fechado e quanto ainda depende do mercado.',
      },
      {
        icon: CircleDollarSign,
        title: 'Dólar e operações',
        text: 'Se o dólar está travado e se você tem operações em andamento.',
      },
      {
        icon: MapIcon,
        title: 'Mapa da safra',
        text: 'Uma barra mostra a safra dividida entre o que está fechado e o que está aberto.',
      },
    ],
    preview: (ex) => <Exposure ex={ex} />,
  },
  {
    id: 'resultados',
    label: 'Resultados financeiros',
    photo: PHOTOS.meta,
    promise: 'Aqui você vê quanto sobra, hoje e em outros cenários.',
    faz: [
      {
        icon: SlidersHorizontal,
        title: 'Escolha um cenário',
        text: 'Combine CBOT, dólar e basis (o preço da sua fazenda menos a bolsa).',
      },
      {
        icon: Route,
        title: 'Simule o seu risco',
        text: 'Mude o dólar, a CBOT ou o basis e veja o efeito na margem.',
      },
      { icon: Target, title: 'Defina sua meta', text: 'Diga a margem que você quer e veja onde ela é alcançada.' },
    ],
    mostra: [
      {
        icon: Layers,
        title: 'Matriz de cenários',
        text: 'Uma grade 9×9 (CBOT × dólar × basis), pintada pela cor da margem.',
      },
      {
        icon: FileText,
        title: 'DRE do cenário',
        text: 'A conta do cenário escolhido, linha por linha (DRE é o demonstrativo de resultado).',
      },
      {
        icon: Wheat,
        title: 'Formação do preço da fazenda',
        text: 'O caminho passo a passo, da bolsa até a porteira.',
      },
      {
        icon: ShieldCheck,
        title: 'Seu risco',
        text: 'O que valem suas proteções (hedges) e onde a margem chega a zero.',
      },
    ],
    preview: (ex) => <MatrixPreview ex={ex} />,
  },
]

function ItemList({ id, heading, items }: { id: string; heading: string; items: Item[] }) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gold">{heading}</h4>
      <Stagger id={id} as="ul" gap={0.07} className="mt-2">
        {items.map((it) => (
          <StaggerItem as="li" key={it.title} y={12} className="flex gap-3 border-t border-line py-3">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-card text-gold"
            >
              <it.icon size={18} strokeWidth={1.75} />
            </span>
            <span className="min-w-0 text-pretty">
              <b className="block text-tx">{it.title}</b>
              <span className="text-sm text-mut">{it.text}</span>
            </span>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  )
}

/** Wide photo with a veil that is darkest where the page name and its promise sit (readable over any pixel). */
function PageBand({ tab }: { tab: TabDef }) {
  return (
    <div className="relative h-44 overflow-hidden rounded-xl border border-line sm:h-56">
      <PhotoImg photo={tab.photo} />
      <div
        aria-hidden="true"
        className="absolute inset-0 z-[1]"
        style={{ background: `linear-gradient(180deg, ${veil(0.3)} 0%, ${veil(0.86)} 50%, ${veil(0.95)} 100%)` }}
      />
      <div className="absolute inset-x-0 bottom-0 z-10 p-4 sm:p-6">
        <h3 className="text-balance text-xl font-extrabold leading-tight text-tx sm:text-2xl">{tab.label}</h3>
        <p className="mt-1 max-w-[56ch] text-pretty text-sm text-mut sm:text-base">{tab.promise}</p>
      </div>
    </div>
  )
}

export function OQueOAppFaz({ ex }: { ex: LiveExample }) {
  const [active, setActive] = useState(0)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const tab = TABS[active]

  const select = (i: number, focus: boolean) => {
    const n = (i + TABS.length) % TABS.length
    setActive(n)
    if (focus) refs.current[n]?.focus()
  }
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const map: Record<string, number> = {
      ArrowRight: active + 1,
      ArrowDown: active + 1,
      ArrowLeft: active - 1,
      ArrowUp: active - 1,
      Home: 0,
      End: TABS.length - 1,
    }
    if (e.key in map) {
      e.preventDefault()
      select(map[e.key], true)
    }
  }

  return (
    <Screen id="app-faz" labelledBy="app-faz-title">
      <div className={`${panelClass} p-5 sm:p-8 lg:p-12`}>
        <Reveal id="appfaz.cabecalho">
          <Eyebrow>O que o app faz</Eyebrow>
          <h2 id="app-faz-title" tabIndex={-1} className="text-balance text-[28px] font-extrabold leading-tight sm:text-4xl">
            Do preço da bolsa até o dinheiro que sobra
          </h2>
          <p className="mt-3 max-w-[60ch] text-pretty text-base text-mut sm:text-lg">
            O app tem três páginas. Você preenche o que é seu.
            <br />
            Ele faz a conta e mostra quanto sobra por saca.
          </p>
        </Reveal>
        <div role="tablist" aria-label="Páginas do app" className="mt-6 flex flex-wrap gap-2">
          {TABS.map((t, i) => {
            const on = i === active
            return (
              <button
                key={t.id}
                ref={(el) => {
                  refs.current[i] = el
                }}
                id={`app-tab-${t.id}`}
                role="tab"
                type="button"
                aria-selected={on}
                aria-controls="app-tabpanel"
                tabIndex={on ? 0 : -1}
                onClick={() => select(i, false)}
                onKeyDown={onKey}
                className={`relative min-h-[44px] rounded-full border px-4 text-sm ${
                  on ? 'border-gold font-bold text-accink' : 'border-line-strong text-tx hover:border-gold'
                }`}
              >
                {on && <span aria-hidden="true" className="absolute inset-0 rounded-full bg-acc" />}
                <span className="relative">{t.label}</span>
              </button>
            )
          })}
        </div>
        <div id="app-tabpanel" role="tabpanel" aria-labelledby={`app-tab-${tab.id}`} tabIndex={0} className="mt-5">
          {/* keyed: each tab is a fresh mount, so its own first-time keys decide what animates */}
          <FadeSwap key={tab.id} id={tab.id}>
            <PageBand tab={tab} />
            <div className="mt-6 grid gap-8 md:grid-cols-2 md:items-start">
              <div className="space-y-6">
                <ItemList id={`appfaz.${tab.id}.faz`} heading="O que você faz" items={tab.faz} />
                <ItemList id={`appfaz.${tab.id}.mostra`} heading="O que o app mostra" items={tab.mostra} />
              </div>
              <div data-testid="app-preview" aria-label={`Prévia: ${tab.label}`} role="group">
                {tab.preview(ex)}
              </div>
            </div>
          </FadeSwap>
        </div>
        <p className="mt-8 border-t border-line pt-5 text-center text-sm text-mut sm:text-base">
          As três páginas conversam: o que você preenche em uma aparece nas outras.
        </p>
      </div>
    </Screen>
  )
}
