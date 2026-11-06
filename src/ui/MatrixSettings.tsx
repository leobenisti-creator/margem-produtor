import { X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { DEFAULT_STEPS_PCT } from '../engine/matrix'
import { useStore } from '../state/StoreProvider'
import { fmtField } from './fmtExtra'
import { useDialogBehavior } from './useDialogBehavior'

type Steps = [number, number, number, number]

/** pt-BR decimal ("2,5") to a number; NaN when empty or not a number. */
function parse(s: string): number {
  const t = s.trim().replace(/\s/g, '').replace(',', '.')
  return t === '' || !/^-?\d*\.?\d+$/.test(t) ? Number.NaN : Number(t)
}

/** One Portuguese message per field (empty string = valid); the rule of engine/matrix checkSteps. */
export function stepErrors(raw: string[]): string[] {
  const nums = raw.map(parse)
  return nums.map((v, k) => {
    if (!Number.isFinite(v)) return 'Digite um número.'
    if (!(v > 0)) return 'O passo tem que ser maior que 0%.'
    if (!(v < 100)) return 'O passo tem que ser menor que 100%.'
    if (k > 0 && Number.isFinite(nums[k - 1]) && !(v > nums[k - 1])) {
      return `Cada passo tem que ser maior que o anterior (${fmtField(nums[k - 1])}%).`
    }
    return ''
  })
}

function Dialog({ steps, onClose }: { steps: readonly number[]; onClose: () => void }) {
  const { dispatch } = useStore()
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()
  const errId = useId()
  const [raw, setRaw] = useState<string[]>(() => steps.map((s) => fmtField(s)))
  const [tried, setTried] = useState(false)
  useDialogBehavior(ref, onClose)
  const errors = stepErrors(raw)

  function apply() {
    setTried(true)
    if (errors.some((e) => e !== '')) return
    dispatch({ type: 'setStepsPct', steps: raw.map(parse) as Steps })
    onClose()
  }

  function reset() {
    dispatch({ type: 'setStepsPct', steps: [...DEFAULT_STEPS_PCT] })
    onClose()
  }

  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-40 bg-g9/70 sm:bg-transparent" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="fixed inset-x-4 top-[12vh] z-50 mx-auto max-w-[320px] rounded-[14px] border border-line-strong bg-card p-4 text-xs shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[300px]"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 id={titleId} className="text-[13px] font-bold">
            Variações da matriz
          </h3>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-[9px] text-mut hover:text-tx"
          >
            <X aria-hidden="true" size={18} strokeWidth={1.75} />
          </button>
        </div>
        <p id={descId} className="mb-3 text-mut">
          Os passos valem para cima e para baixo de hoje, no dólar e no CBOT. Têm que ficar em ordem crescente e
          abaixo de 100%. A matriz continua 9×9.
        </p>
        <div className="grid gap-2">
          {raw.map((v, k) => {
            const err = tried ? errors[k] : ''
            const id = `${errId}-${k}`
            return (
              <div key={k}>
                <label className="flex items-center justify-between gap-3">
                  <span>Passo {k + 1} (%)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={v}
                    data-autofocus={k === 0 ? true : undefined}
                    aria-invalid={err ? 'true' : undefined}
                    aria-describedby={err ? id : undefined}
                    onChange={(e) => setRaw((r) => r.map((x, j) => (j === k ? e.target.value : x)))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        apply()
                      }
                    }}
                    className={`num min-h-[44px] w-24 rounded-[9px] border bg-bg px-2.5 text-right text-[13px] md:min-h-[36px] ${
                      err ? 'border-danger' : 'border-line-strong'
                    }`}
                  />
                </label>
                {err && (
                  <p id={id} className="mt-0.5 text-right text-[11px] text-danger">
                    {err}
                  </p>
                )}
              </div>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={apply}
            className="min-h-[44px] rounded-full bg-g7 px-4 text-xs font-bold text-accink md:min-h-[36px]"
          >
            Aplicar
          </button>
          <button
            type="button"
            onClick={reset}
            className="min-h-[44px] rounded-full border border-line-strong px-4 text-xs font-semibold text-tx md:min-h-[36px]"
          >
            Voltar ao padrão
          </button>
        </div>
        <p className="mt-2 text-[11px] text-mut">Padrão: 2,5% · 5% · 10% · 20%.</p>
      </div>
    </>
  )
}

/** "⚙ Ajustar variações": a discreet link that opens a small dialog with the four % steps. */
export function MatrixSettings() {
  const { state } = useStore()
  const [open, setOpen] = useState(false)
  const custom = state.matrix.stepsPct.some((s, k) => s !== DEFAULT_STEPS_PCT[k])
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] items-center gap-1 text-xs text-mut underline decoration-dotted underline-offset-4 hover:text-tx md:min-h-[32px]"
      >
        <span aria-hidden="true">⚙</span> Ajustar variações
        {custom && <span className="text-g7">(personalizadas)</span>}
      </button>
      {open && <Dialog steps={state.matrix.stepsPct} onClose={() => setOpen(false)} />}
    </div>
  )
}
