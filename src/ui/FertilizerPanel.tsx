import { useId, useRef, useState } from 'react'
import { groupOfItem } from '../data/costItems'
import {
  FERTILIZERS,
  nutrientSupply,
  suggestForTargets,
  validCustomContents,
  type Fertilizer,
  type ProductRow,
} from '../engine/products'
import { copyRow } from '../state/costs'
import { useStore } from '../state/StoreProvider'
import { fmtNum } from './format'
import { NumberField } from './NumberField'
import { blankRow, formulaId, formulasFromRows, ProductTable } from './ProductTable'
import { Segmented } from './Segmented'

type Mode = 'nutrientes' | 'produto'

const selectCls =
  'min-h-[44px] w-full rounded-[9px] border border-line-strong bg-surface2 px-2 text-sm font-semibold md:min-h-[38px]'
const btn = 'min-h-[44px] rounded-[9px] border px-3 text-xs font-semibold md:min-h-[38px]'

function Pick({
  id,
  label,
  value,
  onChange,
  list,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  list: Fertilizer[]
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-0.5 block text-xs font-medium text-mut">
        {label}
      </label>
      <select id={id} className={selectCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {list.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </div>
  )
}

const pctError = (v: number) => (v < 0 || v > 100 ? 'O teor deve estar entre 0% e 100%.' : null)

/** "Criar fórmula": a name and the N, P₂O₅ and K₂O contents in % (each 0..100, sum ≤ 100). */
function FormulaCreator({ existing, onCreate }: { existing: Fertilizer[]; onCreate: (f: Fertilizer) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [pcts, setPcts] = useState({ n: 0, p2o5: 0, k2o: 0 })
  const [error, setError] = useState<string | null>(null)
  const panelId = useId()
  const nameId = useId()

  function save() {
    const trimmed = name.trim()
    const sum = pcts.n + pcts.p2o5 + pcts.k2o
    const contents = { n: pcts.n / 100, p2o5: pcts.p2o5 / 100, k2o: pcts.k2o / 100 }
    const msg =
      trimmed === ''
        ? 'Dê um nome à fórmula.'
        : existing.some((f) => f.id === formulaId(trimmed)) || FERTILIZERS.some((f) => f.name === trimmed)
          ? 'Já existe um adubo com esse nome.'
          : sum > 100 + 1e-9
            ? 'A soma dos teores não pode passar de 100%.'
            : sum === 0
              ? 'Informe pelo menos um teor.'
              : !validCustomContents(contents)
                ? 'Cada teor deve estar entre 0% e 100%.'
                : null
    setError(msg)
    if (msg) return
    onCreate({ id: formulaId(trimmed), name: trimmed, ...contents })
    setName('')
    setPcts({ n: 0, p2o5: 0, k2o: 0 })
    setOpen(false)
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={`${btn} border-line text-acc`}
      >
        Criar fórmula
      </button>
      {open && (
        <div id={panelId} className="mt-2 grid gap-2 rounded-[10px] border border-line bg-card p-3">
          <div>
            <label htmlFor={nameId} className="mb-0.5 block text-xs font-medium text-mut">
              Nome da fórmula
            </label>
            <input
              id={nameId}
              type="text"
              value={name}
              placeholder="ex.: 04-30-10"
              onChange={(e) => setName(e.target.value)}
              className={`${selectCls} font-normal`}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['n', 'N da fórmula (%)'],
                ['p2o5', 'P₂O₅ da fórmula (%)'],
                ['k2o', 'K₂O da fórmula (%)'],
              ] as const
            ).map(([k, label]) => (
              <NumberField
                key={k}
                label={label}
                unit="%"
                value={pcts[k]}
                validate={pctError}
                onCommit={(v) => setPcts((p) => ({ ...p, [k]: v }))}
              />
            ))}
          </div>
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
          <p className="text-[11.5px] text-mut">O preço você digita na tabela, como nos outros produtos.</p>
          <button type="button" onClick={save} className={`${btn} justify-self-start border-acc text-acc`}>
            Salvar fórmula
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Adubação detail. Macronutrientes open in two modes: "Pelos nutrientes (N-P-K)" (kg/ha of N, P₂O₅
 * and K₂O → doses, crediting the N a phosphate already delivers) and "Por produto". Corretivos and
 * micronutrientes open straight in the product table. Rows, freight and created formulas live here,
 * so switching modes never loses what was typed.
 */
export function FertilizerPanel({ itemId, onDone }: { itemId: string; onDone?: () => void }) {
  const { state } = useStore()
  const group = groupOfItem(itemId)
  const item = group ? state.costGroups[group].items[itemId] : undefined
  const stored = item?.rows ?? null
  const macro = itemId === 'adubacao.macro'
  const seq = useRef(0)
  const [mode, setMode] = useState<Mode>(macro && !stored ? 'nutrientes' : 'produto')
  const [rows, setRows] = useState<ProductRow[]>(() =>
    stored && stored.length > 0 ? stored.map(copyRow) : [blankRow('adubo', `p-new-${++seq.current}`)],
  )
  const [freight, setFreight] = useState(item?.freightBrlTon ?? 0)
  const [formulas, setFormulas] = useState<Fertilizer[]>(() => formulasFromRows(stored))
  const [targets, setTargets] = useState({ n: 0, p2o5: 0, k2o: 0 })
  const [picks, setPicks] = useState({ p: 'map', k: 'kcl', n: 'ureia' })

  const options = [...FERTILIZERS, ...formulas]
  const suggestion = suggestForTargets(targets, picks, formulas)
  const pRow = suggestion.find((r) => r.id === `sug-${picks.p}`)
  const credit = pRow ? nutrientSupply([pRow]).n : 0
  const missingN = Math.max(0, targets.n - credit)
  const pName = options.find((f) => f.id === picks.p)?.name ?? ''

  /** Suggested rows replace blank rows; rows already typed are kept. */
  function takeSuggestion() {
    setRows((rs) => {
      const kept = rs.filter((r) => r.productId !== null || r.name !== '' || r.dose > 0 || r.price > 0)
      const fresh = suggestion.filter((s) => !kept.some((k) => k.id === s.id))
      return [...kept, ...fresh]
    })
    setMode('produto')
  }

  return (
    <div className="grid gap-3">
      {macro && (
        <Segmented<Mode>
          ariaLabel="Como detalhar"
          wrap
          value={mode}
          options={[
            { value: 'nutrientes', label: 'Pelos nutrientes (N-P-K)' },
            { value: 'produto', label: 'Por produto' },
          ]}
          onChange={setMode}
        />
      )}
      <FormulaCreator existing={formulas} onCreate={(f) => setFormulas((fs) => [...fs, f])} />
      {mode === 'nutrientes' ? (
        <div className="grid gap-3">
          <p className="text-pretty text-[12px] text-mut">
            Diga quantos kg/ha de cada nutriente quer aplicar. Dose = kg do nutriente ÷ teor do adubo. O N que o adubo de
            fósforo já entrega é descontado, para não pagar nitrogênio duas vezes.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['n', 'N (kg/ha)'],
                ['p2o5', 'P₂O₅ (kg/ha)'],
                ['k2o', 'K₂O (kg/ha)'],
              ] as const
            ).map(([k, label]) => (
              <NumberField
                key={k}
                label={label}
                value={targets[k]}
                validate={(v) => (v < 0 ? 'Não pode ser negativo.' : null)}
                onCommit={(v) => setTargets((t) => ({ ...t, [k]: v }))}
              />
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Pick id={`${itemId}-p`} label="Adubo para o fósforo (P)" value={picks.p} onChange={(p) => setPicks((s) => ({ ...s, p }))} list={options.filter((f) => f.p2o5 > 0)} />
            <Pick id={`${itemId}-k`} label="Adubo para o potássio (K)" value={picks.k} onChange={(k) => setPicks((s) => ({ ...s, k }))} list={options.filter((f) => f.k2o > 0)} />
            <Pick id={`${itemId}-n`} label="Adubo para o nitrogênio (N)" value={picks.n} onChange={(n) => setPicks((s) => ({ ...s, n }))} list={options.filter((f) => f.n > 0 && f.p2o5 === 0)} />
          </div>
          {suggestion.length === 0 ? (
            <p className="text-[12px] text-mut">Informe pelo menos um nutriente para ver as doses.</p>
          ) : (
            <ul className="grid gap-1 rounded-[10px] border border-line bg-card px-3 py-2 text-[13px]">
              {suggestion.map((r) => (
                <li key={r.id} data-testid={`suggest-${r.id.replace(/^sug-/, '')}`} className="flex justify-between gap-3">
                  <span>{r.name}</span>
                  <b className="num">{fmtNum(r.dose, 0)} kg/ha</b>
                </li>
              ))}
            </ul>
          )}
          {credit > 0 && (
            <p data-testid="n-credit" className="text-pretty text-[12px] text-mut">
              O {pName} já entrega {fmtNum(credit, 0)} kg/ha de N.{' '}
              {targets.n > 0 &&
                (missingN > 0
                  ? `Faltam ${fmtNum(missingN, 0)} kg/ha de N para a sua meta.`
                  : 'A sua meta de N já está coberta: nenhum adubo de N a mais.')}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={suggestion.length === 0}
              onClick={takeSuggestion}
              className={`${btn} border-acc text-acc disabled:border-line disabled:text-mut`}
            >
              Levar para a tabela de produtos
            </button>
          </div>
          <p className="text-[11.5px] text-mut">Os preços você digita na tabela: o app nunca preenche preço.</p>
        </div>
      ) : (
        <ProductTable
          itemId={itemId}
          kind="adubo"
          onDone={onDone}
          rows={rows}
          onRowsChange={setRows}
          freight={freight}
          onFreightChange={setFreight}
          formulas={formulas}
        />
      )}
    </div>
  )
}
