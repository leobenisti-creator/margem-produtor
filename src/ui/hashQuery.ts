/** The query part after "?" in a hash route ("#/comercializacao?vendas=1"); empty when there is none. */
export function hashQuery(hash: string = window.location.hash): URLSearchParams {
  const at = hash.indexOf('?')
  return new URLSearchParams(at < 0 ? '' : hash.slice(at + 1))
}
