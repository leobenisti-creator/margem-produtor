import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Tailwind opacity modifiers (`bg-g7/30`) only compile for theme colours declared with
 * `<alpha-value>`; on a plain `var(--x)` they silently produce nothing. Every theme colour used
 * with a `/NN` modifier in src must be alpha-enabled in tailwind.config.ts.
 */
describe('tailwind opacity modifiers on theme colours', () => {
  const config = readFileSync(join(__dirname, '..', '..', 'tailwind.config.ts'), 'utf8')
  const alphaEnabled = new Set(
    [...config.matchAll(/^\s*'?([a-z0-9-]+)'?:\s*'[^']*<alpha-value>[^']*'/gm)].map((m) => m[1]),
  )
  const themeColours = new Set([...config.matchAll(/^\s*'?([a-z0-9-]+)'?:\s*'(?:var\(|rgb\()/gm)].map((m) => m[1]))

  it('declares at least the colours the UI tints', () => {
    expect(alphaEnabled.size).toBeGreaterThan(0)
  })

  it('every `<colour>/<opacity>` class in src uses an alpha-enabled colour', () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, f.name)
        if (f.isDirectory()) walk(p)
        else if (/\.tsx?$/.test(f.name) && !/\.test\./.test(f.name)) files.push(p)
      }
    }
    walk(join(__dirname, '..'))
    const bad: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/(?:bg|text|border|ring|from|to|via|divide|outline|shadow|fill|stroke)-([a-z0-9-]+)\/(\d{1,3})\b/g)) {
        const name = m[1]
        if (themeColours.has(name) && !alphaEnabled.has(name)) bad.push(`${f}: ${m[0]}`)
      }
    }
    expect(bad).toEqual([])
  })
})
