import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The site fetches only the CBOT, the dollar and the FOB points: there is no regional (IMEA) average anywhere.
 * This scans the sources of the app (tests excluded) for the words that would bring it back.
 */
const ROOT = join(__dirname)
const FORBIDDEN = /IMEA|m[ée]dia da regi[ãa]o|m[ée]dia regional|refer[êe]ncia (da regi[ãa]o|regional)|Usar m[ée]dia/i

function sources(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...sources(p))
    else if (/\.(ts|tsx|json)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

describe('no regional reference anywhere in the sources', () => {
  const files = sources(ROOT)

  it('finds the app sources', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('names no IMEA and no "média da região" in code, copy or data (tests excluded)', () => {
    const hits = files.flatMap((f) => {
      const text = readFileSync(f, 'utf8')
      // Comments may explain what the old saves carried; only strings that could reach the screen matter.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      return FORBIDDEN.test(code) ? [f.slice(ROOT.length + 1)] : []
    })
    expect(hits).toEqual([])
  })

  it('the regional data files are gone', () => {
    const names = files.map((f) => f.slice(ROOT.length + 1).split('\\').join('/'))
    expect(names).not.toContain('data/reference-mt.json')
    expect(names).not.toContain('data/regions.ts')
    expect(names).not.toContain('ui/ConfirmAverage.tsx')
  })
})
