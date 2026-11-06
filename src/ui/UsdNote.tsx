/** Shown next to money inputs while US$ mode has no usable dollar. */
export function UsdNote() {
  return (
    <p role="note" className="mt-2 rounded-[9px] border border-warn-line px-2.5 py-1.5 text-xs text-mut">
      Dólar indisponível: digite o valor no lápis da cotação ou volte para R$
    </p>
  )
}
