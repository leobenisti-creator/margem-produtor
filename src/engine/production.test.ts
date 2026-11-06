import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { barterProblem, normalizeBarter } from './production'

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sourceFiles(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(p)
  }
  return out
}

describe('single source of the production', () => {
  it('no file but engine/production.ts multiplies area by productivity to get a production', () => {
    const root = join(__dirname, '..')
    // `x.areaHa * x.yieldScHa`, `areaHa * yieldScHa`, `yieldScHa * areaHa`, area * yield / productivity spellings.
    const pattern = /(area\w*\s*\*\s*[\w.]*(yield|produtiv)\w*)|((yield|produtiv)\w*\s*\*\s*[\w.]*area\w*)/i
    const offenders: string[] = []
    for (const f of sourceFiles(root)) {
      const rel = relative(root, f).split(sep).join('/')
      if (rel === 'engine/production.ts') continue
      const lines = readFileSync(f, 'utf-8').split(/\r?\n/)
      lines.forEach((line, n) => {
        // Comments may describe the formula in words.
        const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '')
        if (pattern.test(code)) offenders.push(`${rel}:${n + 1}: ${line.trim()}`)
      })
    }
    // Documented exceptions: none (the Inicio example farm lives on its own fixed numbers, typed, not multiplied).
    expect(offenders).toEqual([])
  })

  it('normalizeBarter: finite and positive, anything else is 0', () => {
    expect(normalizeBarter(5)).toBe(5)
    for (const v of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '5', null, undefined]) expect(normalizeBarter(v)).toBe(0)
  })

  it('barterProblem: pt-BR messages', () => {
    expect(barterProblem(0, 0)).toBeNull()
    expect(barterProblem(5000, 60000)).toBeNull()
    expect(barterProblem(60000, 60000)).toBeNull()
    expect(barterProblem(60001, 60000)).toMatch(/passar da produção/)
    expect(barterProblem(-1, 60000)).toMatch(/negativas/)
    expect(barterProblem(10, 0)).toMatch(/área e a produtividade/)
    expect(barterProblem(Number.NaN, 10)).toMatch(/número válido/)
  })
})
