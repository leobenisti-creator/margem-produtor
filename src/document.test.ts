import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8')
const css = readFileSync(join(__dirname, 'styles', 'index.css'), 'utf8')

describe('document shell', () => {
  it('declares pt-BR, the product title and a responsive viewport', () => {
    expect(html).toMatch(/<html[^>]*\blang="pt-BR"/)
    expect(html).toMatch(/<title>Margem — simulador de margem do produtor<\/title>/)
    expect(html).toMatch(/<meta name="viewport" content="width=device-width, initial-scale=1\.0"/)
    // zoom must stay possible (WCAG 1.4.4)
    expect(html).not.toMatch(/user-scalable\s*=\s*no|maximum-scale/)
  })

  it('carries a description and a theme colour (P3-12)', () => {
    expect(html).toMatch(/<meta name="description" content="[^"]{20,}"/)
    expect(html).toMatch(/<meta name="theme-color" content="#0b0c0d"/)
    expect(html).not.toMatch(/AUTO|ao vivo/)
  })

  it('respects prefers-reduced-motion by disabling transitions and animations', () => {
    const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(block).toMatch(/animation-duration:\s*0\.01ms\s*!important/)
    expect(block).toMatch(/transition-duration:\s*0\.01ms\s*!important/)
    expect(block).toMatch(/scroll-behavior:\s*auto/)
  })

  it('keeps a visible focus ring', () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid/)
  })
})
