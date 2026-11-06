import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const darkCss = readFileSync(join(__dirname, 'tokens.css'), 'utf8')
const lightCss = readFileSync(join(__dirname, 'tokens-light.css'), 'utf8')
const parseTokens = (src: string) => {
  const out: Record<string, string> = {}
  for (const m of src.matchAll(/--([a-z0-9]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2].toLowerCase()
  return out
}
// tokens.css is the dark theme (`:root`); tokens-light.css holds the `:root[data-theme="light"]` overrides.
const DARK_T = parseTokens(darkCss)
const LIGHT_OVERRIDES = parseTokens(lightCss)
const THEMES: Record<'dark' | 'light', Record<string, string>> = {
  dark: DARK_T,
  light: { ...DARK_T, ...LIGHT_OVERRIDES },
}
const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
const lin = (c: number) => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex).map(lin)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** Source-over blend of `fg` at `alpha` onto `bg`. */
const mix = (fg: string, bg: string, alpha: number) => {
  const a = rgb(fg)
  const b = rgb(bg)
  return '#' + a.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('')
}
export const ratio = (fg: string, bg: string) => {
  const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

type Pair = [string, string, string, number]

// [description, foreground, background, minimum]. 4.5 = normal text, 3 = large (>= 24px or >= 18.66px bold) / UI.
// Built per theme: `INK` (--accink) is the text on gold fills, `ink` (--ink) the dark text on the light tone cells.
function pairsFor(T: Record<string, string>): Pair[] {
  const INK = T.accink
  const pairs: Pair[] = [
    ['tx on bg', T.tx, T.bg, 4.5],
    ['tx on card', T.tx, T.card, 4.5],
    ['tx on surface2', T.tx, T.surface2, 4.5],
    ['tx on g8 (hero, sidebar end)', T.tx, T.g8, 4.5],
    ['tx on g9 (ticker, sidebar)', T.tx, T.g9, 4.5],
    ['mut on bg', T.mut, T.bg, 4.5],
    ['mut on card', T.mut, T.card, 4.5],
    ['mut on surface2', T.mut, T.surface2, 4.5],
    ['mut on g8', T.mut, T.g8, 4.5],
    ['mut on g9', T.mut, T.g9, 4.5],
    ['mut on sidebar hover (g8 + 5% white)', T.mut, mix('#ffffff', T.g8, 0.05), 4.5],
    ['tx on sidebar active (g8 + 10% white)', T.tx, mix('#ffffff', T.g8, 0.1), 4.5],
    ['mut on sidebar footer box (g8 + 8% white)', T.mut, mix('#ffffff', T.g8, 0.08), 4.5],
    ['gold (g7 text) on bg', T.g7, T.bg, 4.5],
    ['gold (g7 text) on card', T.g7, T.card, 4.5],
    ['gold (g7 text) on surface2', T.g7, T.surface2, 4.5],
    ['acc text on card (freight chip, empty state)', T.acc, T.card, 4.5],
    ['acc text on surface2 (freight chip)', T.acc, T.surface2, 4.5],
    ['acc text on g9 (ticker "Aguardando")', T.acc, T.g9, 4.5],
    ['dark ink on gold (primary buttons, active segment)', INK, T.acc, 4.5],
    ['dark ink on light gold (hover)', INK, T.mint, 4.5],
    ['dark ink on mut (disabled Tour button)', INK, T.mut, 4.5],
    ['mint on g9', T.mint, T.g9, 4.5],
    ['mint on g8', T.mint, T.g8, 4.5],
    ['mint on g9 + 20% mint tint ("manual" tag)', T.mint, mix(T.mint, T.g9, 0.2), 4.5],
    ['danger text on card', T.danger, T.card, 4.5],
    ['danger text on bg', T.danger, T.bg, 4.5],
    ['danger text on surface2 (field error)', T.danger, T.surface2, 4.5],
    ['danger text on g9 (ticker error)', T.danger, T.g9, 4.5],
    ['positive number #4ade80 on card', T.barpos, T.card, 4.5],
    ['negative number (danger) on card', T.barneg, T.card, 4.5],
    ['gold on g8 (decorative accents)', T.gold, T.g8, 3],
    ['focus ring (--focus) on card (non-text, 3:1)', T.focus, T.card, 3],
    ['focus ring (--focus) on bg (non-text, 3:1)', T.focus, T.bg, 3],
    ['focus ring (--focus) on surface2 (non-text, 3:1)', T.focus, T.surface2, 3],
    ['focus ring (--focusdark) on g9 (ticker, non-text, 3:1)', T.focusdark, T.g9, 3],
    ['focus ring (--focusdark) on g8 (sidebar, non-text, 3:1)', T.focusdark, T.g8, 3],
    ['field border (--linestrong) on card (non-text, 3:1)', T.linestrong, T.card, 3],
    ['field border (--linestrong) on bg (non-text, 3:1)', T.linestrong, T.bg, 3],
    ['field border (--linestrong) on surface2 (non-text, 3:1)', T.linestrong, T.surface2, 3],
    ['switch off thumb (--linestrong) on surface2 track (non-text, 3:1)', T.linestrong, T.surface2, 3],
    ['switch on thumb (dark ink) on gold track (non-text, 3:1)', INK, T.acc, 3],
    ['note border (--warnline) on card (non-text, 3:1)', T.warnline, T.card, 3],
    ['note border (--warnline) on bg (non-text, 3:1)', T.warnline, T.bg, 3],
    ['waterfall positive bar (--barpos) on track (non-text, 3:1)', T.barpos, T.bartrack, 3],
    ['waterfall negative bar (--barneg) on track (non-text, 3:1)', T.barneg, T.bartrack, 3],
    ['waterfall final bar (--barfinal) on track (non-text, 3:1)', T.barfinal, T.bartrack, 3],
    ['sold exposure bar (g7) on track (non-text, 3:1)', T.g7, T.bartrack, 3],
    ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap((n): Pair[] => [
      [`cost chart hue --cat${n} on surface2 (non-text, 3:1)`, T[`cat${n}`], T.surface2, 3],
      [`cost chart hue --cat${n} on card (non-text, 3:1)`, T[`cat${n}`], T.card, 3],
      [`accent ink on cost chart hue --cat${n} (percent inside the slice)`, INK, T[`cat${n}`], 4.5],
    ]),
    // Crop map slices: deep green/red carry the accent ink (white in light), amber/orange the dark ink.
    ...(
      [
        ['barpos', INK],
        ['tone1', T.ink],
        ['sev2', T.ink],
        ['barneg', INK],
      ] as const
    ).flatMap(([k, ink]): Pair[] => [
      [`crop map segment --${k} on card (non-text, 3:1)`, T[k], T.card, 3],
      [`crop map segment --${k} on surface2 (non-text, 3:1)`, T[k], T.surface2, 3],
      [`text on crop map segment --${k} (percent inside)`, ink, T[k], 4.5],
    ]),
    ['active-cell ring (tx) on card (non-text, 3:1)', T.tx, T.card, 3],

  ]
  for (let i = 0; i <= 5; i++) {
    pairs.push([`matrix cell text (--ink) on tone${i}`, T.ink, T[`tone${i}`], 4.5])
  }
  pairs.push(['matrix cell text (--ink) on tonena (unknown margin, neutral)', T.ink, T.tonena, 4.5])
  for (let i = 1; i <= 5; i++) {
    pairs.push([`matrix cell text (--ink) on seq${i} (legacy ramp)`, T.ink, T[`seq${i}`], 4.5])
  }
  return pairs
}

const PAIRS: Pair[] = [...pairsFor(THEMES.dark), ...pairsFor(THEMES.light)]

describe.each(['dark', 'light'] as const)('colour contrast (WCAG AA) of the token pairs the app uses: %s theme', (theme) => {
  const TT = THEMES[theme]
  it('parses every palette token', () => {
    for (const k of ['g9', 'g8', 'g7', 'g5', 'mint', 'acc', 'accink', 'ink', 'marker', 'mixto', 'surface2', 'bg', 'card', 'line', 'tx', 'mut', 'tone0', 'tone5', 'seq1', 'seq5', 'linestrong', 'focus', 'focusdark', 'warnline', 'danger', 'bartrack', 'barpos', 'barneg', 'barfinal', 'sev2']) {
      expect(TT[k]).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('keeps the RGB triplets of the Tailwind opacity colours in step with their hex', () => {
    const source = theme === 'dark' ? darkCss : lightCss
    for (const k of ['g9', 'g8', 'g7', 'g5', 'mint']) {
      const m = source.match(new RegExp(`--${k}rgb:\\s*(\\d+) (\\d+) (\\d+)`))
      expect(m).not.toBeNull()
      expect(m!.slice(1, 4).map(Number)).toEqual(rgb(TT[k]))
    }
  })

  it.each(pairsFor(TT))('%s', (_name, fg, bg, min) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(min)
  })
})

describe('colour literals in the source', () => {
  it('every colour literal in src/ui and src/pages (recursively) is covered by the pairs table', () => {
    // Literals that never carry text: alpha-only masks, drop shadows and glows. Anything else
    // (arbitrary classes text-/bg-/border-/ring-/from-/via-/to-/fill-/stroke-, inline-style hex
    // and rgb() literals) must appear in PAIRS.
    const NON_TEXT: Record<string, string> = {
      '#000': 'MatrixTable scroll-fade mask (only its alpha is used)',
      '#0000008c': 'ResultSheet drop shadow',
      'rgba(232,176,74': 'Início gold glow (box-shadow) and NumberField focus halo',
    }
    const covered = new Set<string>()
    for (const [, fg, bg] of PAIRS) {
      covered.add(fg.toLowerCase())
      covered.add(bg.toLowerCase())
    }
    const literals = collectColourLiterals()
    // The scan must reach subfolders (src/ui/inicio) and the wider prefixes.
    expect(literals.files.some((f) => /[\\/]ui[\\/]inicio[\\/]/.test(f))).toBe(true)
    const unchecked = [...literals.found.entries()]
      .filter(([lit, hex]) => !(lit in NON_TEXT) && !(hex !== null && covered.has(hex)))
      .map(([lit, hex]) => `${lit} (${hex ?? 'alpha'}) in ${literals.where.get(lit)?.join(', ')}`)
    expect(unchecked).toEqual([])
  })

  it('the literal scanner sees every prefix, inline-style hex and rgb() (self-test)', () => {
    const sample = [
      'ring-[#e8b04a] from-[#101213] via-[#181a1c] to-[#141617] fill-[#f87171] stroke-[#4ade80]',
      "text-[#ecebe6] style={{ color: '#a0a098', background: '#fff' }} rgb(242, 199, 110)",
    ].join(' ')
    const lits = scanColourLiterals(sample)
    expect([...lits.keys()].sort()).toEqual(
      ['#101213', '#141617', '#181a1c', '#4ade80', '#a0a098', '#e8b04a', '#ecebe6', '#f87171', '#fff', 'rgb(242,199,110)'].sort(),
    )
    expect(lits.get('#fff')).toBe('#ffffff')
    expect(lits.get('rgb(242,199,110)')).toBe('#f2c76e')
  })
})

/** Colour literals in a source text: literal → normalised #rrggbb (null for alpha-only/translucent ones). */
function scanColourLiterals(src: string): Map<string, string | null> {
  const out = new Map<string, string | null>()
  for (const m of src.matchAll(/(?<![\w&])#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z])/g)) {
    const h = m[1].toLowerCase()
    const lit = `#${h}`
    const hex = h.length === 3 ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : h.length === 6 ? lit : null
    out.set(lit, hex)
  }
  for (const m of src.matchAll(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(,[^)]*)?\)/g)) {
    const [r, g, b] = [m[1], m[2], m[3]].map(Number)
    const alpha = m[4] !== undefined
    const lit = alpha ? `rgba(${r},${g},${b}` : `rgb(${r},${g},${b})`
    out.set(lit, alpha ? null : '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''))
  }
  return out
}

function walk(dir: string, acc: string[]): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) acc.push(p)
  }
  return acc
}

function collectColourLiterals() {
  const files = ['ui', 'pages'].flatMap((d) => walk(join(__dirname, '..', d), []))
  const found = new Map<string, string | null>()
  const where = new Map<string, string[]>()
  for (const f of files) {
    for (const [lit, hex] of scanColourLiterals(readFileSync(f, 'utf8'))) {
      found.set(lit, hex)
      where.set(lit, [...(where.get(lit) ?? []), f])
    }
  }
  return { files, found, where }
}
