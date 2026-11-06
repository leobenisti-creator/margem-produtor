import { useStore } from '../state/StoreProvider'
import { fmtDateBr } from './format'
import { latestAsOf, shortSources } from './Ticker'

/** Legal line (verbatim, spec) plus the closing date and the data sources (P3-8). */
export function Footer() {
  const { snapshot, state } = useStore()
  const shown = [snapshot.cbotUsc[state.crop], snapshot.fx, snapshot.b3[state.crop]]
  const sources = shortSources([...shown, snapshot.cepea[state.crop]])
  // Feedback 1: the base comes from the ponto FOB (its provisional note lives on #/preco), so the
  // old snapshot basis source is no longer named here.
  return (
    <footer className="border-t border-line px-4 py-4 text-center text-xs text-mut">
      <p>Material educacional e indicativo. Não constitui recomendação.</p>
      <p className="mt-1 text-[11px]">
        Preços de fechamento de {fmtDateBr(latestAsOf(shown))} · fontes: {sources}
      </p>
      {/* Moved here from the retired left Sidebar (Task 8). */}
      <p className="mt-1 text-[11px]">Visitante · dados só neste navegador</p>
    </footer>
  )
}
