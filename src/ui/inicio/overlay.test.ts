import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { OVERLAY_TEXT_ALPHA } from './overlay'

// Same WCAG maths as src/styles/contrast.test.ts (not imported: that would re-run its suite here).
const css = readFileSync(join(__dirname, '..', '..', 'styles', 'tokens.css'), 'utf8')
const T: Record<string, string> = {}
for (const m of css.matchAll(/--([a-z0-9]+):\s*(#[0-9a-fA-F]{6})/g)) T[m[1]] = m[2].toLowerCase()
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const lin = (c: number) => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex).map(lin)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const mix = (fg: string, bg: string, a: number) => {
  const x = rgb(fg)
  const y = rgb(bg)
  return '#' + x.map((v, i) => Math.round(v * a + y[i] * (1 - a)).toString(16).padStart(2, '0')).join('')
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (hi + 0.05) / (lo + 0.05)
}

describe('photo veil (Início): text over photos keeps 4.5:1 even over a white pixel', () => {
  const worst = () => mix(T.photoov, '#ffffff', OVERLAY_TEXT_ALPHA)
  it.each([
    ['tx', 'tx'],
    ['mut', 'mut'],
    ['gold', 'gold'],
    ['positive (barpos)', 'barpos'],
    ['danger', 'danger'],
  ])('%s on the veil', (_n, key) => {
    expect(T.photoov).toMatch(/^#[0-9a-f]{6}$/)
    expect(ratio(T[key], worst())).toBeGreaterThanOrEqual(4.5)
  })
  it('also over a black pixel', () => {
    const dark = mix(T.photoov, '#000000', OVERLAY_TEXT_ALPHA)
    for (const key of ['tx', 'mut', 'gold', 'barpos', 'danger']) {
      expect(ratio(T[key], dark)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
