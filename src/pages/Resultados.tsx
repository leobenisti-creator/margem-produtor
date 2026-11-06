import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { fmtNum } from '../ui/format'
import { hashQuery } from '../ui/hashQuery'
import { MiniDre } from '../ui/MiniDre'
import { NextSteps } from '../ui/NextSteps'
import { PriceFormationOverlay } from '../ui/PriceFormation'
import { ResultadosHero } from '../ui/ResultadosHero'
import { PageLocked } from '../ui/PageLocked'
import { ResultadosMatrix } from '../ui/ResultadosMatrix'
import { ResultsUnitProvider } from '../ui/resultsUnit'
import { SeuRisco } from '../ui/risk/SeuRisco'
import { TargetOverlay } from '../ui/target/TargetOverlay'
import { useResult } from '../ui/useResult'
import { usePageLocks } from '../ui/usePageLocks'
import { WhatIfProvider } from '../ui/whatIf'

/** The two small buttons at the bottom right of the answer card. */
const small =
  'inline-flex min-h-[44px] items-center gap-1 rounded-[8px] border px-2.5 text-[11.5px] font-semibold md:min-h-[32px]'

type Tab = 'resultado' | 'risco'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'resultado', label: 'Resultado' },
  { id: 'risco', label: 'Seu risco' },
]

/** `?analise=1` opens the "Análise da meta" (route contract with the Simulação). */
function analysisFromHash(): boolean {
  return hashQuery().get('analise') === '1'
}

/** Drops the panel query once the panel closes, so a reload does not reopen it. */
function clearPanelQuery() {
  const q = hashQuery()
  if (!q.has('vendas') && !q.has('analise')) return
  q.delete('vendas')
  q.delete('analise')
  const base = window.location.hash.split('?')[0]
  const rest = q.toString()
  window.history.replaceState(window.history.state, '', rest ? `${base}?${rest}` : base)
}

/** The two tabs: arrows (and Home/End) move between them, the selected one is the only one in the tab order. */
function TabBar({ tab, setTab, idBase }: { tab: Tab; setTab: (t: Tab) => void; idBase: string }) {
  const refs = useRef<Record<Tab, HTMLButtonElement | null>>({ resultado: null, risco: null })
  function onKey(e: KeyboardEvent<HTMLButtonElement>) {
    const at = TABS.findIndex((t) => t.id === tab)
    const next =
      e.key === 'ArrowRight' ? (at + 1) % TABS.length : e.key === 'ArrowLeft' ? (at - 1 + TABS.length) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1
    if (next < 0) return
    e.preventDefault()
    setTab(TABS[next].id)
    refs.current[TABS[next].id]?.focus()
  }
  return (
    <div
      role="tablist"
      aria-label="Seções dos resultados"
      className="flex gap-1 rounded-[14px] border border-line bg-card p-1"
    >
      {TABS.map((t) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[t.id] = el
          }}
          type="button"
          role="tab"
          id={`${idBase}-tab-${t.id}`}
          data-testid={`aba-${t.id}`}
          aria-selected={tab === t.id}
          aria-controls={`${idBase}-panel-${t.id}`}
          tabIndex={tab === t.id ? 0 : -1}
          onClick={() => setTab(t.id)}
          onKeyDown={onKey}
          className={`min-h-[44px] flex-1 rounded-[10px] text-sm font-semibold ${
            tab === t.id ? 'bg-surface2 text-tx shadow-[inset_0_-2px_0_var(--acc)]' : 'text-mut hover:text-tx'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

function ResultadosPage() {
  const { farmInputs } = useResult()
  const [tab, setTab] = useState<Tab>('resultado')
  const [formation, setFormation] = useState(false)
  const [metaOpen, setMetaOpen] = useState(analysisFromHash)
  const formationBtn = useRef<HTMLButtonElement>(null)
  const metaBtn = useRef<HTMLButtonElement>(null)
  const idBase = useId()
  const target = farmInputs.targetMargin

  // A hash change while mounted opens the asked panel (which lives in the Resultado tab).
  useEffect(() => {
    const onHash = () => {
      if (analysisFromHash()) {
        setTab('resultado')
        setMetaOpen(true)
      }
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  function closeMeta() {
    setMetaOpen(false)
    clearPanelQuery()
  }

  return (
    <section data-testid="page-resultados" className="grid grid-cols-[minmax(0,1fr)] gap-3.5">
      <TabBar tab={tab} setTab={setTab} idBase={idBase} />
      <div
        role="tabpanel"
        id={`${idBase}-panel-resultado`}
        aria-labelledby={`${idBase}-tab-resultado`}
        hidden={tab !== 'resultado'}
        className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3.5"
      >
        {tab === 'resultado' && (
          <>
            <ResultadosHero
              actions={
                <>
                  <button
                    ref={metaBtn}
                    type="button"
                    data-testid="botao-meta"
                    aria-haspopup="dialog"
                    aria-expanded={metaOpen}
                    onClick={() => setMetaOpen(true)}
                    className={`${small} border-line-strong text-mut hover:text-tx`}
                  >
                    Meta de margem
                    {target !== null && <span className="num font-normal"> · {fmtNum(target * 100, 0)}%</span>}
                  </button>
                  <button
                    ref={formationBtn}
                    type="button"
                    data-testid="botao-formacao"
                    aria-haspopup="dialog"
                    aria-expanded={formation}
                    onClick={() => setFormation(true)}
                    className={`${small} border-g7 text-g7`}
                  >
                    Formação do preço da fazenda
                  </button>
                </>
              }
            />
            <ResultadosMatrix onEditTarget={() => setMetaOpen(true)} />
            <MiniDre />
          </>
        )}
      </div>
      <div
        role="tabpanel"
        id={`${idBase}-panel-risco`}
        aria-labelledby={`${idBase}-tab-risco`}
        hidden={tab !== 'risco'}
        className="min-w-0"
      >
        {tab === 'risco' && <SeuRisco />}
      </div>
      <NextSteps current="resultados" />
      {metaOpen && <TargetOverlay onClose={closeMeta} returnFocus={() => metaBtn.current} />}
      {formation && <PriceFormationOverlay onClose={() => setFormation(false)} returnFocus={() => formationBtn.current} />}
    </section>
  )
}

/** The Resultados financeiros page (nothing simulated here leaves it). */
export function Resultados() {
  const { isLocked } = usePageLocks()
  if (isLocked('resultados'))
    return <PageLocked testId="resultados-locked" title="Para ver os seus resultados, preencha Lavoura e custos" />
  return (
    <WhatIfProvider>
      <ResultsUnitProvider>
        <ResultadosPage />
      </ResultsUnitProvider>
    </WhatIfProvider>
  )
}
