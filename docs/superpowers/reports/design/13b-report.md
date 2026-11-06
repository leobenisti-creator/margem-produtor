# Task 13b — Design audit applied to "Margem"

Date: 2026-10-28 · Branch `feat/mvp` · Base 68fc577 (400 tests) → HEAD 0ee1143 (471 tests) · Implementer: Claude Fable 5.1.
Spec: `design/13a-design-audit.md` (§ii findings, §iii tokens, §v batches, §vi bugs, §vii measurements) + ledger rulings R20–R27. Skills invoked: `frontend-design:frontend-design`, `ecc:frontend-a11y`, `dataviz` (validator run on every palette candidate).

## Commits (one per batch, plus two follow-ups to batch 6)

| Batch | SHA | Subject |
|---|---|---|
| 1 | 25527e8 | tokens and a11y floor — 3:1 borders, focus ring, switch/segmented, matrix tones validated |
| 2 | c4a9cbc | ticker caption always visible, footer data line |
| 3 | 3c60ef5 | KPI hierarchy, comparison relabel, units and one-decimal margin |
| 4 | 9a44a08 | compact cost rows, target with the result, suggestion chip, tour copy and Escape semantics |
| 5 | 6b97c0f | matrix tones, legend, density, mobile view grid, sale plan |
| 6 | 1e01c11 | shell and navigation — captions, icon rail, collapsed Em breve, Lucide icons, bar after hero |
| 7 | 52c21d7 | waterfall with bolsa and base, drawer list, loading skeleton, meta tags |
| 6b | 2de5843 | follow-up — compact top bar below lg, 11 px text floor, matrix tiles below sm |
| 6c | 0ee1143 | keep the page title readable at lg (min width 300 px) |

Never pushed. `docs/` and `.superpowers/` untouched except this report.

## Per batch

### Batch 1 — tokens & a11y floor (P1-4, P3-3, P3-4, P3-5, P1-3 tokens, P2-12 field states)
- `tokens.css`: new `--linestrong #76908a`, `--focus #0b3d2e`, `--focusdark #2bd9a0`, `--warnline #9c7a2b`, `--danger #b3261e`, `--bartrack/--barpos/--barneg/--barfinal`, diverging `--tone0..5`, sequential `--seq1..5`. Names have no hyphens because `contrast.test.ts` parses `--([a-z0-9]+)`; Tailwind exposes them as `line-strong`, `focus`, `warn-line`, `danger`, `bar-*`, `seq*`.
- `index.css`: focus ring `2px --focus` + `outline-offset 2px` + 4 px white box-shadow gap; mint ring inside `.bg-g9/.bg-g8/.bg-g7`; `-webkit-font-smoothing`; `.num` (tabular), `.text-pretty`, `.text-balance`.
- NumberField: border `line-strong`, focus = 2 px g7 + 3 px 18 % halo, error = 2 px danger; label 12 px/500; helper 11.5 px pretty. Selects in LavouraCard/Tour same border. Notes (`UsdNote`, own-price note, custom-scenario banner) use `warn-line`. All `text-[#b3261e]` → `text-danger`.
- Switch: off state = white track with `line-strong` border and dark thumb (3,4:1), explicit `transition-[background-color,border-color]` / `[left,background-color]` 150 ms. Segmented: `line-strong` border on the track, selected pill bordered, 120 ms transition.
- Matrix sub-label drops `opacity-80` (R26). `contrast.test.ts`: 40 new pairs (every new token on its surfaces, tones ×5 pairs, seq ×3), `#d5ded9` removed from NON_TEXT.
- Tests 400 → 441.

### Batch 2 — ticker & footer (P1-1/B5, P3-8)
- Ticker: `flex-wrap lg:flex-nowrap`; quotes in `[data-testid=ticker-quotes]` (`basis-full`, scrolls) and the caption as its own row below lg; at lg one row where the quote group scrolls and the caption is `shrink-0 whitespace-nowrap`. `shortSources` → "Yahoo (não oficial), BCB, B3". New export `latestAsOf`.
- Footer: second line `Preços de fechamento de 26/10/2026 · fontes: Yahoo (não oficial), BCB, B3, Cepea, IMEA`; legal line verbatim. `Footer.test.tsx` added.
- Tests 441 → 443.

### Batch 3 — KPI rows & comparison (P1-2, P2-2, P2-5/B3, P2-13/R25, P2-14/B1/B2, P3-1)
- New `ui/comparison.ts` (`buildComparison`): "Em outras praças (sem frete): B3 SJC ≈ R$ 150,50 (US$ 27,36 × PTAX) · Cepea Paranaguá R$ 155,55" in R$ mode; in US$ mode Cepea/CCM are converted (`≈ US$ 28,28 (R$ 155,55 ÷ PTAX)`); gap > 25 % appends an inline Lucide "i" (`aria-label="Por que os preços em outras praças são maiores"`) opening the `precoFazenda` explanation, whose note now ends with the sentence the audit asked for.
- Hero number 32 px (`lg:` 36), `tracking-[-0.02em]`, tabular; secondary tiles 18/22 px; eyebrows sentence case 11/12 px, 500. Below `sm`: hero full width, "Preço na fazenda" full width (it carries the comparison), custo + total share one row; `sm`: three tiles in one row; `lg`: four.
- `fmtMarginPct`: one decimal below 100 % (`15,5%`), none from 100 %. New `fmtSignedMoney` (`−R$ 227`). MatrixKpis hero dollar via `fmtFx` (4 decimals); extreme tiles `margem −3,7% · −R$ 227/ha`.
- `kpi-total` sub-line converts to `1.000 ha × 3,62 t/ha = 3.624 t` in t/ha mode.
- Tests 443 → 451 (`fmtExtra.test.ts` new; Simulador/Comercializacao/ExplainDrawer strings updated to the new copy, intent kept).

### Batch 4 — Simulador cards (P2-1, P2-6 + R20, P2-10 + R27, P2-11, P3-11)
- CustoCard categorias: one-line rows `[name | bar + "Referência da região: R$ 475" | field 132 px]` (`NumberField labelHidden` → `aria-label`), 48 px per row; below `sm` the bar moves under name + field.
- R20: `TargetControl.tsx` (switch "Definir meta de margem" + % field, `id="meta-de-margem"`) is the first control of the "Exposição…" card in `ResultContent`, so it is in the desktop panel and the mobile sheet. Card 3 = "Já vendido / Preço médio vendido" first, then "Usar meu preço na fazenda" (no "(opcional)" on switches; the card header still says it).
- LavouraCard: chip `Usar média da região: 60,40 sc/ha` (3,62 t/ha in t/ha mode); `✓ média da região` when the field already equals it.
- Tour: lead sentence on step 1, no "Voltar" on step 1 (`justify-end`), dot stepper + "Passo 1 de 3", "Pular tour"; R27: Escape sets a component-local `dismissed` flag (tour hidden for the session, `tourSeen` untouched); `useDialogBehavior` also locks `html` overflow. `.dialog-enter` keyframes (150 ms fade + 8 px slide-up) for P3-11.
- Tests 451 → 454 (noTarget/ownPrice/Tour/Simulador queries moved; 'Pular' → 'Pular tour' in every test).

### Batch 5 — Matrix (P1-3/B4 + R26, P1-5/B6, P2-4, P2-15, P2-16)
- `engine/matrix.ts toneFor`: target mode bands at −6 · −3 · +3 · +6 · +9 p.p. (`TARGET_BOUNDS`, distance rounded to 0,01 p.p. so 0,15 − 0,03 sits on the edge). Absolute mode unchanged. New explicit `toneFor` tests; spec test values intact.
- `MatrixTable`: `scale: 'target' | 'absolute'`; absolute mode paints `bg-tone0` + `bg-seq1..5`; `border-spacing-0.5` (2 px gaps), `num`, hover ring / `active:scale-[0.98]`, two-line corner header `CBOT (US¢/bu) ↓ / Dólar (R$/US$) →`, right-edge `mask-image` fade while `scrollLeft < max` (scroll/resize listeners), hint `Deslize para ver as outras colunas →` (`sm:hidden`). Sub-line = `margem % · R$ 1.173/ha` (integers), only the % below `sm` (`cellTexts.subCompact`).
- New `MatrixLegend.tsx`: six entries (`6 p.p. ou mais abaixo · 3 a 6 abaixo · na meta (±3 p.p.) · 3 a 6 acima · 6 a 9 acima · 9 p.p. ou mais acima`), swatches share `toneClass`; title `Cor = margem em relação à meta de 15%`; link `Meta: 15% · editar` (`href="#/simulador"`, then focuses the target switch with `scrollIntoView` guarded for jsdom); footer `Valores convertidos com o dólar de cada coluna. O CSV sai sempre em R$.`; `Em breve: simular opção de venda · criar alerta.` replaces the two disabled buttons; `Baixar matriz (CSV)`.
- Segmented `wrap` prop → `grid grid-cols-2 sm:inline-flex` for the view switcher.
- SalePlan: `6rem | 9rem | 44 px` band rows, icon remove button (`aria-label="Remover faixa N"`), one-sentence summary (`plan-summary`, keeps `plan-total`/`plan-avg`).
- Tests 454 → 460 (App.test: editar link navigates and focuses).

### Batch 6 — Shell & nav (P2-7, P2-8, P2-9 + R21/R22, P3-2, P3-9, P3-10, B7)
- TopBar: captions `Cultura · Moeda · Produtividade · Margem` (visible from lg; `aria-label`s name the groups before that), options `sobre a receita | sobre o custo`, "Salvar cenário" removed, Compartilhar with `Share2` icon (icon-only under `sm` and on the md rail, `aria-label` always "Compartilhar"). Follow-ups 2de5843/0ee1143: title + share on one row, groups wrap into two rows on phones, title keeps ≥ 300 px at lg.
- ResultSheet: `useHeroVisible` (IntersectionObserver on `kpi-margem`; when the API is undefined the bar is always shown, so jsdom/old browsers keep it), backdrop `sheet-backdrop` closes, title "Resultado de hoje", `ChevronUp` icon. `ResultSheet.test.tsx` added.
- Sidebar: `md:w-16` rail / `lg:w-60`; `navIcons.tsx` (`Calculator`, `Grid3x3`); one "Em breve" disclosure (`aria-expanded`, `aria-controls`, remembered in `localStorage` key `margem:soonOpen` inside try/catch) listing the six names as plain text at lg. BottomNav: icon + label + 2 px mint active bar. `main > *` max-w 1280.
- Icons: `lucide-react@0.552.0` (pencil, info, chevrons, share, x); all `aria-hidden` beside existing labels. JS gzip 96,31 → 97,96 kB (+1,65 kB), budget 300 kB.
- B7: `Considerar já vendido` (disabled) and `Adicionar faixa` (now `aria-disabled` at 3 bands) point to their reason via `aria-describedby`.
- Tests 460 → 466.

### Batch 7 — Waterfall & drawer (P2-3 + R23, P2-17, P3-6, P3-12)
- Waterfall: 8 rows `Bolsa (CBOT × dólar) · + Base · = Preço de referência · − Frete · − Taxas de porto/armazém · = Preço na fazenda · − Custo · = Margem`; sign only in the label column (`wf-label`), values unsigned `num` right-aligned (`wf-value`); fills `bar-pos` (= and bolsa), `bar-neg` (−, and base when a discount), `bar-final` (margin); track `bar-track`; base drawn as the bolsa→referência segment; label column `minmax(110px,150px)` pretty. `Waterfall.test.tsx` added (ledger T8); `errorStates` row indexes updated to the 8-row layout.
- ExplainDrawer: hairline-divided list (no cards in cards), tabular values, 440 px panel, sentence-case eyebrow, entrance animation.
- `LoadingSkeleton.tsx` (`role=status` "Carregando", `animate-pulse`, KPI row + 3 cards + panel) replaces `Carregando…`; `loading.test.tsx` added.
- `index.html`: meta description + `theme-color #0b3d2e` (favicon left for the brand).
- Tests 466 → 471.

## Verification

- `npx vitest run` ×3: 35 files, **471 passed** each run (0 flaky). `npm run lint` (tsc): 0 errors. `npm run build`: JS 318,41 kB → **98,33 kB gzip**, CSS 6,31 kB gzip, HTML 0,52 kB (budget 300 kB).
- Browser: Vite on 5199 at 375×812, 768×1024, 1280×800, both pages, storage cleared; dev server stopped and viewport reset at the end. Screenshots were right-cropped by the pane, so acceptance is the DOM numbers below.

### DOM acceptance (before = audit §vii, after = HEAD)

| Metric | 375 before → after | 768 before → after | 1280 before → after |
|---|---|---|---|
| Top bar height | 103 (controls in a hidden scroll row) → **180** (title+share row + 2 control rows) | 133 → **90** | 89 → **113** (captions; title no longer truncated) |
| Ticker height | 60 → 82 (two rows) | 55 → 77 | 55 → 57 |
| Caption x / right edge | 822/1179 (unreachable) → **16/359** (visible) | 1004/1361 → **82/735** | 1004/1361 (clipped) → **938/1247** (visible) |
| Quote group scroll | 1195 vs 375 → 786 vs 343 (caption outside it) | 1139 vs 513 → 726 vs 653 | 1139 vs 1025 → 726 vs 660 |
| Horizontal page overflow | none → none (375) | none (753 = content) | none |
| Sidebar | hidden | 240 (31 %) → **64** (8 %) | 240 → 240 |
| Hero tile y | 179 → 278 | 204 → 184 | 161 → 187 |
| First input card y | 597 → 653 | 571 → **464** | 310 → 347 |
| KPI tiles | hero 343×96, preço 166×187, custo 166×187, total 343×97 → hero 343×101, preço 343×122, custo 167×118, total 167×118 | 477×96 + 232×136 ×2 + 477×97 → 653×101 + 211×155 ×3 (one row) | 238×136 ×4 → 238×146 ×4 |
| Card 2 categorias | — | — | 1002 → **627** (rows 48 px; the freight block lives in the same card) |
| Card 3 (own price off) | 373 → 295 | 264 → 193 | 264 → 193 |
| Matrix card / table scroll | 1035 / 509 vs 318 → 993 / 510 vs 318 (+ fade + hint) | 767 / 509 vs 451 → 716 / **627 vs 627 (fits)** | 568 / 963 → 591 / 963 (fits) |
| Matrix cell | 76×55 (sub wraps 3 lines) → 76×44 (one sub line) | — | 155×44 → 150×44 |
| View switcher | 391 vs 310 (hidden option) → 308 vs 308 (2×2 grid) | fits | fits |
| Fixed chrome (bar + nav) | 102 at first paint → **0 while the hero is on screen**, 104 after it scrolls out | — | — |
| Smallest text | 10 px → **11 px** | 11 | 11 |
| Non-text contrast | borders 1,35 / ring 1,8–2,7 / gold 2,1 / bars 1,12–2,6 → all ≥ 3:1 (contrast.test) |

### Palette validator (`dataviz/scripts/validate_palette.js`, light, surface #ffffff)

- Target mode (diverging) `#d17465 #e3a88d #fdf5df #ace0b6 #52cd86 #339c6d`: adjacent ΔE **12,2 normal / 8,6 CVD (protan)**, tritan 12,1 — audit's candidate was 8,4 / 4,0, the previous tokens 4,8 / 0,6. Text `#10261d` 4,86–14,7:1, ring g8 3,55–11,2:1 on every tone (contrast.test). Validator still reports FAIL on the normal-vision floor (15) and WARN on fills < 3:1 vs white: with the constraint that `#10261d` text must stay ≥ 4,5:1 on every fill, the usable OKLCH lightness window is 0,64–0,97, which caps the six-step ΔE around 12 (a grid search over L/C per step found no 15). The cells print their numbers and keep 2 px gaps (the secondary encoding the dataviz rule requires), so the colour layer is now informative without being the only channel.
- No-target mode `#d17465` + ramp `#d8f9dd #abe9bb #8fcfa3 #74b68d #599d77`: ordinal checks PASS lightness monotone, adjacent ΔL ≥ 0,06, single hue (8°); light end 1,13:1 vs white (expected for a heat table, number printed); adjacent ΔE 7,9 normal / 6,4 CVD.

## Deviations and things to know

1. **375 first-input target not met.** The brief asked for the first input ≥ 100 px higher on 375. It is 56 px *lower* (card y 597 → 653) because two audit items add height above the fold: the two-row ticker (+22 px, P1-1) and the two-row top bar with 44 px touch targets (+77 px vs the old single hidden-scroll row, P2-7). The tile row saved 39 px and the sticky bar no longer covers the first paint (−53 px of fixed chrome), so the usable first screen is about even. Options for the owner: (a) move the "Margem sobre a receita/custo" toggle into the hero tile (audit alternative) → top bar back to two rows (~136 px); (b) drop the caption row below `sm` in favour of a shorter "26/10 · fontes" inline chip; (c) accept.
2. 1280 top bar is 113 px (was 89): captions + the title kept readable (`min-w 300`), so the groups wrap under it at 1280 (one row again from ~1400). Audit's "stops wrapping" holds at 768 (90 px).
3. Card 2 in categorias is 627 px at 1280, not ≈ 520: the audit's estimate did not count the freight/port block (~100 px) and the IMEA note that share the card. Rows are 48 px as proposed.
4. Palette ΔE ≥ 15 is not reachable under AA text on every fill (see validator notes); reported 12,2 / 8,6.
5. `Segmented` at `<sm` for the matrix views is a 2×2 grid; the top-bar groups keep the row layout (two groups per row).
6. "Salvar cenário" is gone from the bar (its only reason was a tooltip); it remains in the sidebar's "Em breve" group.
7. The own-price helper text and the sold fields kept their copy; only the switch labels lost "(opcional)".
8. Spec/ledger conformance: no AUTO/ao vivo (Ticker/Footer/document tests assert it), legal footer verbatim, soja+milho only, pt-BR, storage in try/catch (sidebar group, Tour), no recommendation language, every new hex literal covered by `contrast.test.ts`.

## Open items for the owner

- Favicon (brand pending) — `theme-color` and description are in.
- Decide on deviation 1 (mobile top bar height) — (a) is a half-day change with test moves (`TopBar.test`, `Simulador.test`).
- `MatrixKpis` below `sm` shows only "margem X%" on the extreme tiles (per-ha figure from `sm`); confirm this density is wanted.
- Data flags unchanged (basis "a confirmar", milho freight) — now explained by the "Em outras praças (sem frete)" line and the why-button on milho.

---

## Fix round 1 (reviewer Important 1–2, R28, minors #4–#12)

Commit: `design(fix 1): …` (see `git log`). Tests 471 → **479** (×3 green), tsc 0 errors, build JS **98,97 kB gzip** / CSS 6,55 kB.

### Important 1 — "Meta: X% · editar" below lg
- New `ui/focusRequest.ts`: `requestFocus('meta')` / `consumeFocusRequest()` (module state, consumed once) + `focusTarget()` (finds `#meta-de-margem [role=switch]` inside a root, else focuses the hero tile; never polls). `MatrixLegend` calls `requestFocus` on click and keeps `href="#/simulador"`.
- `ResultPanel` (lg) consumes the request on mount and focuses the switch. `ResultSheet` (<lg) consumes it on mount, opens the sheet and focuses the switch inside the dialog (`SheetDialog focus` prop). Hero tile has `tabIndex={-1}` for the fallback.
- Tests: `ui/focusRequest.test.tsx` — consumed once; <lg opens the sheet with focus on the switch; lg focuses the panel switch with no dialog; #11 fallback to the hero.

### Important 2 — Tailwind opacity modifiers
- `tokens.css` gains RGB triplets (`--g9rgb … --mintrgb`); `tailwind.config.ts` declares g9/g8/g7/g5/mint as `rgb(var(--xrgb) / <alpha-value>)`, so `hover:ring-g7/40`, `bg-g7/30`, `bg-mint/20` now compile (verified in `dist` CSS: `rgb(var(--g7rgb) / .4)`, `/ .3`, `rgb(var(--mintrgb) / .2)`; hover ring confirmed in the browser).
- Guard: `styles/alpha.test.ts` scans every `<prefix>-<colour>/<n>` class in `src` and fails when the colour is a theme colour without `<alpha-value>`.

### R28 — mobile top
- "sobre a receita | sobre o custo" left the top bar: `ui/MarginBasePill.tsx` (radiogroup "Base da margem", options "da receita | do custo", roving tabindex, arrows) sits in the hero sub-line of both pages (KpiRow and MatrixKpis). Top bar keeps Cultura · Moeda · Produtividade + Compartilhar.
- Tile numbers: `whitespace-nowrap` + `num` on every `b` (KpiRow, MatrixKpis, result bar); matrix extreme tiles 16 px below `sm` with 12 px padding so "R$ 150,05" fits the 108 px 3-up tile (no overflow measured).
- Card `right` slot 11 px below `sm` so "referência regional pré-preenchida" no longer wraps the card header.

| 375 (storage cleared) | before fix | after fix | acceptance |
|---|---|---|---|
| Top bar | 180 | **122** | ≤ ~136 ✓ |
| Hero y | 278 | 218 | |
| "Preço na fazenda" bottom | — | 469 | on first screen ✓ |
| First card y / header bottom | 653 / 715 | **612 / 650** | header on the first screen (≤ 812) ✓ |
| First input y | 816 | **750** | ≤ 760 ✓ |
| Matrix KPI tiles | 108×156 (number overflowed) | 108×133, no overflow | |

768: top bar 100, rail links 44 px, "Em breve" button hidden at md, matrix fits (627 vs 627). 1280: top bar **71** (one row), ticker 40 px (scrollbar strip gone), first card y 287, title not truncated, no overflow.

### Minors
- #4 `toneFor`: bands symmetric and inclusive outward — tone 0 ≤ −6, (−6, −3], (−3, +3), [+3, +6), [+6, +9), ≥ +9; comment fixed; tests updated (−0,06 → 0).
- #5 `useScrollFade(ref, matrix)`: re-evaluates when the grid changes, plus a `ResizeObserver` when available.
- #6 Sidebar: disclosure button `hidden lg:flex`; rail links/buttons `min-h-[44px]`.
- #8 `buildComparison` returns `position` ('acima' | 'abaixo' | 'proximo', ±2 %); the drawer note says "costumam ficar acima" / "hoje ficam abaixo" / "hoje ficam próximos" / "podem ficar acima ou abaixo" (no data). Drawer lines split into "Bolsa (CBOT)" and "+ Base" (US$/bushel each) before "Preço de referência", matching the waterfall.
- #9 Conversion reads "(US$ 27,36 × dólar)" and "× dólar manual" when the ticker dollar is overridden (`state.overrides.fx`); same for "÷ dólar".
- #10 Stale pair "switch thumb white on the off track mut" removed from `contrast.test.ts`.
- #11 `useDialogBehavior` accepts a `fallback` getter; the sheet passes the hero tile, so closing it after the bar unmounted focuses the hero (tested).
- #12 `.scrollbar-none` on the ticker quote row (`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`), still scrollable.

### Ledger-worthy note (not fixed): first load pre-scrolled with the tour open
On a first visit at 375 the document opens scrolled to y ≈ 261: `useDialogBehavior` focuses the first focusable element of the tour (`first.focus()`), and because the dialog is a bottom sheet (`items-end`), the browser scrolls the page under it to bring the focused control into view. Proposed fix: `first.focus({ preventScroll: true })` in `useDialogBehavior` (and `pick.focus({ preventScroll: true })` after an explicit `scrollIntoView` in `focusTarget`), plus `window.scrollTo(0, 0)` guarded for jsdom when the tour mounts on first load. One-line change, no test impact beyond a new assertion on `scrollY`.

---

## Fix round 2 (re-review residuals)

1. **MarginBasePill touch targets.** Each option is now a 44 px-tall button below `md` (`md:` 26 px) wrapping a 28 px visible pill; the radiogroup carries `-my-1.5` so the hero sub-line keeps its height (hero 119 → 115 px). Arrow-key test added (ArrowRight/ArrowLeft move the check and the focus, roving tabindex, 44 px class below md).
2. **Stale focus request.** `MatrixLegend` sets `requestFocus('meta')` only on a plain left click (`button === 0`, no ctrl/meta/shift/alt); modified and middle clicks leave nothing behind. Test covers Control/Meta/Shift/Alt and MouseMiddle (request stays null) and the plain click (the Simulador consumes it and focuses the switch).
3. While re-measuring with the Inter webfont loaded, the three top-bar groups wrapped to two rows at 375 (341 px of 343): segmented options use `px-2.5 sm:px-3` and the group gap is `gap-1.5 sm:gap-2` below `sm`, so the groups are 106 + 96 + 105 px.

375 after fix 2 (storage cleared, Inter loaded): top bar **123**, hero 115, first card header bottom **648**, first input y **749** (≤ 760 ✓), no horizontal overflow; option hit zone 44 px, visible pill 28 px.

Tests 479 → **481** (vitest run once: 37 files green), tsc 0 errors, build JS **99,05 kB gzip** / CSS 6,63 kB. Dev server stopped, viewport reset.

---

## Fix round 3 (test strength)

- `focusRequest.ts` gains a read-only `peekFocusRequest()`.
- `focusRequest.test.tsx` "a modified or middle click leaves no request; a plain click and Enter set it": renders `MatrixLegend` alone (nothing mounts to consume the request) and asserts `peekFocusRequest()` right after each `fireEvent.click` with `ctrlKey` / `metaKey` / `shiftKey` / `altKey` (null), after `button: 1` (null), after a plain click ('meta'), and after keyboard `Enter` on the focused link ('meta' — the guard must not block keyboard activation).
- Proof it discriminates: with the guard line in `MatrixLegend.goToTarget` removed, the first assertion fails (`expect(peekFocusRequest()).toBeNull()` after the ctrlKey click receives 'meta', test line 58); the middle-button assertion would fail the same way. Guard restored; 37 files / **481** tests green, tsc 0 errors.
- Hero-height-vs-pill assertion skipped in jsdom (no layout); the browser measurement in fix round 2 (hero 115 px with the 44 px hit zones) stands.
