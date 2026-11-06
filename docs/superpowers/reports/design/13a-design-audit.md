# Task 13a — Design audit of "Margem" (whole site)

Date: 2026-10-28 · Branch `feat/mvp` @ 68fc577 · Reviewer: Claude Fable 5.1 (design review) · Scope: audit only, no source changes.

Evidence: live app (`npm run dev`, port 5199) walked at 375×812, 768×1024 and 1280×800 with `localStorage` cleared; DOM measurements taken with JavaScript (bounding boxes, scroll widths, computed styles); screenshots in `design/shots/` (the browser pane was hidden during the run, so the JPGs are right-cropped; the numbers below come from the DOM, not from the pictures). Checklists applied: `ui-ux-pro-max` (§1 accessibility, §2 touch, §5 layout, §6 typography, §8 forms, §9 navigation, §10 charts), `frontend-design` (anti-template tells), `ecc:make-interfaces-feel-better`, `ecc:frontend-a11y`, `ecc:frontend-design-direction`, `dataviz` (form → color → validator → marks → interaction; `scripts/validate_palette.js` run on the matrix tones). `ecc:browser-qa` was not invoked (the built-in browser tools covered the pass). The dev server was stopped and the viewport reset at the end.

---

## (i) Executive summary

1. The product does its job: a first-time visitor sees "Margem bruta / saca R$ 19,42" at first paint on every viewport and the "Como calculamos" drawer explains every number in plain pt-BR. The engine, forms and dialogs are solid; the audit is about legibility, hierarchy and a handful of misleading displays.
2. **P1 — the "Fechamento 26/10/2026 · fonte" caption is unreachable** below ~1140 px (it sits at x = 822 inside a 1 195 px-wide scrolling ticker at 375; at 768 it starts at x = 1004 of 513) and is clipped even at 1280 (right edge 1361 > 1265). The spec's anti-goal ("while it is closing data the app says Fechamento and the source") is not met in practice on phones and tablets.
3. **P1 — milho reads as a contradiction**: "Preço na fazenda hoje R$ 39,03" directly above "comparação · B3 CCM R$ 66,89/sc · Cepea R$ 64,24". Nothing on screen says these are prices at a different place without freight; a producer will read "the app says I get 40 % less than the market".
4. **P1 — matrix colours**: in target mode the engine paints six tones in ±1,5 p.p. steps but the legend names three ("abaixo / perto ±3 p.p. / acima"); the six pastels fail the dataviz validator (adjacent ΔE 0,6 deutan, 4,8 normal vision between tone2/tone3; lightness not monotone). The numbers in the cells save it from being wrong, but the colour layer carries almost no information.
5. **P1 — non-text contrast**: input borders 1,35:1 (known), focus ring `--g5` on matrix cells 1,5–2,7:1, gold note borders 2,1:1 — WCAG 2.2 1.4.11 / 2.4.11 fail on exactly the controls a producer touches most.
6. P2 — "Por categoria" turns card 2 into a 1 002 px tall column (8 rows × 95 px) on desktop; the approved mockup had one-line rows (label · bar · value). Same for the 375 result sheet and matrix card (1 035 px).
7. P2 — hierarchy: the hero KPI uses the same 24 px as the other three; on 375 the "Preço na fazenda" tile is 187 px tall because of the comparison line; the 4th KPI sits alone on its row on both pages.
8. P2 — card 3 "Comercialização" now carries two switches, four fields and two helper paragraphs; the margin target belongs with the result ("preço mínimo"), the own price belongs next to the price it replaces. Owner decision (§iv-A).
9. P2 — chrome: at 768–1023 the 240 px sidebar takes 31 % of the width and the top bar wraps to 133 px; six of eight sidebar items are "em breve". Owner decisions (§iv-B, §iv-C).
10. The visual system is coherent (one radius scale, flat cards, calm greens) but reads as a template in three places: uppercase eyebrow labels on every tile, text-character icons (✎, "i", coloured squares), and the all-same 24 px tiles. A small token/type pass (§iii) fixes this without touching the palette direction.

Counts: **P1 = 5 · P2 = 17 · P3 = 12 · functional bugs = 8** (table in §vi).

---

## (ii) Findings (ranked)

Size: S < ½ day, M ≈ 1 day, L > 1 day. "Tests" lists the test files that assert the current text/structure and will need updating.

### P1 — must fix (misleading or blocking)

| ID | Where | What I saw (viewport) | Why it matters | Proposal (exact) | Size | Tests |
|---|---|---|---|---|---|---|
| P1-1 | `src/ui/Ticker.tsx` caption `<span class="ml-auto …">` | 375: ticker `scrollWidth` 1195 vs 375 — caption at x = 822, never seen without three screens of horizontal scroll. 768: 1139 vs 513, caption at x = 1004. 1280: caption 1004→1361, clipped at 1265 (shows "Fechamento 26/10/2026 · Yahoo Fin"). In pencil-edit mode the row grows to 1304. | Spec §2 anti-goal (closing data must say date + source); ux `horizontal-scroll`, `content-priority`. | Split the ticker into two rows below `lg`: row 1 = the four editable quotes (horizontal scroll allowed), row 2 = `Fechamento 26/10/2026 · Yahoo Finance (não oficial) · BCB · B3` as a static 11 px line, left-aligned, always visible. At `≥lg` keep one row but let the caption `shrink-0 whitespace-nowrap` **and** let the quote group scroll instead (`min-w-0 overflow-x-auto` on a wrapper around the quotes), so the caption never clips. Also shorten `shortSources` output: "Yahoo (não oficial), BCB, B3". | M | `Ticker.test.tsx` (caption visible, source text), `layout.test.tsx` |
| P1-2 | `src/ui/KpiRow.tsx` comparison line; `src/ui/explain.ts` `precoFazenda` | Milho at 1280: tile reads "R$ 39,03 … comparação · B3 CCM R$ 66,89/sc · Cepea R$ 64,24". Soja: "B3 SJC US$ 27,36/sc · Cepea R$ 155,55" beside a R$ 125,11 price — mixed currencies and no basis of comparison. In US$ mode the line stays in R$. | Spec §1 success criterion ("understands where the number comes from"); ux `error-clarity`, `number-formatting`; dataviz "text wears text tokens… identity carried by labels". A number next to another number without a stated relation is a misleading display. | 1) Rename the line: `Em outras praças (sem frete): B3 CCM R$ 66,89 · Cepea R$ 64,24` (soja: `B3 SJC ≈ R$ 150,50 (US$ 27,36 × PTAX) · Cepea Paranaguá R$ 155,55`; convert to the display currency with the scenario dollar). 2) Add a line to the `precoFazenda` explanation: `Comparação: B3 e Cepea são preços em outra praça (bolsa/porto), sem o frete e as taxas da sua fazenda; por isso ficam acima do preço na fazenda.` 3) When the gap exceeds 25 % (milho today), append an inline "i" that opens that explanation. Do **not** hide the comparison (spec §7 asks for it). Data-owner flag from Task 12 (freight R$ 27,68/sc + fees on milho) stands. | S–M | `KpiRow`/`Simulador.test.tsx` strings `comparação ·`, `ownPrice.test.tsx` |
| P1-3 | `src/pages/Comercializacao.tsx` `TARGET_LEGEND`/`ABSOLUTE_LEGEND`; `src/styles/tokens.css` `--tone0..5`; `src/engine/matrix.ts` `toneFor` | Target mode paints tones `0001300134002450235513455` (all six) but the legend shows three swatches. `toneFor` steps every 1,5 p.p. (tone2 = within ±1,5 p.p.), legend says "perto (±3 p.p.)". Validator on the six tokens: lightness not monotone (L .82 .89 .92 .90 .84 .78), adjacent ΔE 0,6 (deutan) tone1↔tone3, 4,8 normal vision tone2↔tone3, all fills < 2:1 vs white. | dataviz non-negotiables (diverging = two hues + neutral midpoint, validated; status/legend must match); ux `legend-visible`, `color-not-only` (met by the printed numbers, which is why this is not a data error). | **Target mode (diverging):** `--tone0 #e8877a` (≥ 4,5 p.p. below), `--tone1 #f2b899` (−1,5 … −4,5), `--tone2 #f2e6c4` (meta ±1,5), `--tone3 #b7dfb6` (+1,5 … +4,5), `--tone4 #80cb9c` (+4,5 … +7,5), `--tone5 #45b27f` (≥ +7,5). Legend with all six entries and the numeric band, e.g. `■ ≥ 4,5 p.p. abaixo · ■ até 4,5 abaixo · ■ na meta (±1,5) · ■ até 4,5 acima · ■ até 7,5 acima · ■ 7,5+ acima`, or change `toneFor` to 3 p.p. steps so the legend reads `−6 · −3 · meta ±3 · +3 · +6 · +9` (recommended: simpler to say aloud). **No-target mode (sequential, one hue):** tone0 red for negative, then a single green ramp light→dark `#e4f0e4 #c3e3cc #9cd4ac #6fc495 #3fae79` for 0–5/5–10/10–20/20–30/30+. Text `#10261d` on every proposed fill ≥ 6,0:1 (computed), so the `contrast.test.ts` full-text tone pairs pass; the **sub-label must drop `opacity-80`** (full ink, 11 px) because 80 % ink on the two darkest tones falls to ≈ 3,6:1 and the existing "sub-label (80% opacity)" pairs would fail. Validator on this candidate: adjacent ΔE 8,4 normal / 4,0 protan (today 4,8 / 0,6) — inside the band the dataviz rule allows **only with secondary encoding**, which the matrix has (every cell prints its number; keep the 2 px `border-spacing` gaps). Acceptance in 13b: run `validate_palette.js` on the final set and report the ΔE; aim ≥ 15 by widening the lightness swing (darker tone0/tone5, lighter tone2), never by adding hues. Keep the active-cell ring `--g8` (≥ 4,6:1 on every proposed tone). | M | `Comercializacao.test.tsx` legend strings, `contrast.test.ts` tone loop, `matrix.test.ts` if `toneFor` steps change |
| P1-4 | `src/ui/NumberField.tsx`, `LavouraCard.tsx`/`Tour.tsx` selects (`border-[#d5ded9]`), `src/styles/index.css` `:focus-visible`, `MatrixTable.tsx`, `UsdNote.tsx`, `Comercializacao.tsx` banner (`border-gold`) | Input border #d5ded9 on #fbfdfc = 1,35:1. Focus ring `--g5` on tones: 1,9 (tone0) · 2,7 (tone2) · 1,8 (tone5). Gold border #d1ae6c on white = 2,1:1. Segmented track #eef2f0 on card = 1,13:1 (the group boundary is invisible; only the selected pill shows). | WCAG 2.2 1.4.11 (non-text ≥ 3:1), 2.4.11 focus appearance; ux `focus-states`, `focus-appearance`. | New tokens (names in §iii): `--line-strong: #76908a` (3,4:1 on #fbfdfc, 3,1:1 on the page bg) for input/select borders; `--focus: var(--g8)` with `outline: 2px solid var(--focus); outline-offset: 2px; box-shadow: 0 0 0 4px #fff` (white gap) so the ring is ≥ 5,4:1 on every tone and on the green hero/ticker (`--g8` on `--g9` is low → use `--mint` ring only inside `.bg-g9/.bg-g8` surfaces, as now). `--warn-line: #9c7a2b` (4,0:1 on white) for the gold note borders; keep `--gold` for decorative use only. Segmented: give the track a 1 px `--line-strong` border or drop the track and use a bordered pill group. Add the new pairs to `contrast.test.ts` PAIRS and remove `#d5ded9` from `NON_TEXT`. | S | `contrast.test.ts`, `a11y.test.tsx` |
| P1-5 | `src/pages/Comercializacao.tsx` view `Segmented`; `src/ui/MatrixTable.tsx` | 375: the view switcher is 391 px inside a 310 px scroller with no scrollbar or fade — "Margem %" is off-screen and nothing says the row scrolls. Matrix 509 px in a 318 px scroller: 2,3 columns visible, same lack of cue. | ux `horizontal-scroll`, `swipe-clarity`, `gesture-alternative` (hidden controls). | Below `sm`: render the four views as a 2×2 wrapping grid (`grid grid-cols-2`) instead of a scrolling segmented row. For the matrix keep the scroll but add an edge fade (`mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent)` while `scrollLeft < max`) and a one-line hint under the table at `<sm`: `Deslize para ver as outras colunas →`. | S | `Comercializacao.test.tsx` (radiogroup still present) |

### P2 — clear improvement

| ID | Where | What I saw | Why | Proposal | Size | Tests |
|---|---|---|---|---|---|---|
| P2-1 | `src/ui/CustoCard.tsx` categorias branch | 1280: card 2 grows from 265 to **1 002 px** (8 rows × 95 px: label / field / "ref." helper stacked, bar beside). 375: card 2 is 413 px in total mode and far longer in categorias. Mockup rows were one line (label · bar · value). | Spec §5 ("cada linha tem barra proporcional e o valor"); ux `whitespace-balance`, `data-density`; frontend-design-direction (dense tools for repeated use). | Row grid at `≥sm`: `grid-cols-[minmax(120px,160px)_minmax(0,1fr)_132px] items-center gap-3`: category name (13 px, `text-tx`) · bar (h-2) with the "ref. R$ 475" in 11 px muted **under the bar** · NumberField without its own label (`aria-label`) 132 px wide, unit inside. Row ≈ 52 px → card ≈ 520 px. Below `sm`: label + field on one line, bar under them (two lines, ≈ 70 px). Keep `data-testid="cost-row"`. | M | `Simulador.test.tsx` cost rows (labels become `aria-label`), `errorStates.test.tsx` |
| P2-2 | `src/ui/KpiRow.tsx`, `MatrixKpis.tsx` | All four tiles: 24 px number, 11 px uppercase eyebrow, 11,5 px sub. Hero differs only by the gradient. 375: "Preço na fazenda" tile 187 px (comparison wraps 3 lines), "Custo" stretched to match; hero full width above, "Margem total" full width below — 4 rows of tiles before the first input (first card at y = 597 on an 812 px phone). | frontend-design ("big number + small label + gradient accent is the default; make the one memorable thing bigger and the rest quieter"); ux `visual-hierarchy`, `content-priority`. | Hero: number 32 px (`lg:` 36 px), `tracking-[-0.02em]`, `tabular-nums`; sub 13 px. Secondary tiles: number 22 px, eyebrow in sentence case 12 px (`Preço na fazenda hoje`), one sub line max; move the comparison (P1-2) to a single 11,5 px line with `text-wrap: pretty`. Below `lg`: hero full width, then the three secondary tiles in **one 3-column row** (`grid-cols-3`, number 18 px, eyebrow 11 px) — this removes the lonely 4th tile on both pages and brings the first input ~150 px higher on 375. | S | `layout.test.tsx`, `Simulador.test.tsx` (text unchanged) |
| P2-3 | `src/ui/Waterfall.tsx` | Labels "− Frete" + value "−R$ 27,68" (double sign, known). Reference bar `#cfe7d9` on track `#e9efec` = 1,12:1 (reads as an empty track). Negative bar `#e5736b` 2,6:1. "Preço de referência (CBOT + base)" wraps to 3 lines in the 96 px label column at 375 and the base is invisible as a component even though the own-price feature now edits it. | dataviz marks (fill vs surface ≥ 3:1, direct labels, thin marks, 2 px gaps); spec §5 waterfall "preço de referência → menos porto e frete → menos base → preço na fazenda…"; ledger T8 deferred items. | Rows (8): `Bolsa (CBOT × dólar)` · `+ Base` (green when ≥ 0, red when < 0, drawn as a segment from bolsa to referência) · `= Preço de referência` · `− Frete` · `− Taxas de porto/armazém` · `= Preço na fazenda` · `− Custo` · `= Margem`. Sign only in the label column; value column prints the unsigned amount with `tabular-nums` and `text-right`. Fills: reference/bolsa `#a9d3bf`→ use `--g7` at full strength for "=" rows (6,2:1), `--bar-neg: #c8463d` (4,1:1) for "−" rows, `--mint` only for the final margin; track `#e9efec` stays. Label column `minmax(110px,150px)` with `text-wrap: pretty`. Keep 0..reference scale. Owner decision on splitting bolsa/base in §iv-D (recommended: split). | M | `Simulador.test.tsx` waterfall labels (`Preço de referência (CBOT + base)`), add a Waterfall test (ledger T8) |
| P2-4 | `src/ui/MatrixTable.tsx`, `src/ui/matrixFormat.ts` | Cell = 3 numbers: "101,93 / −3,7% · −227,15/ha" (13 px + 10,5 px). 375: cells 76 × 55 px, the sub line wraps to 3 lines; `/ha` values printed to cents (noise). "CBOT ↓ Dólar →" corner header has no units; "● hoje" markers fine. | dataviz (selective labels, never every number everywhere; figures sized to the mark); ux `data-density`, `number-formatting`. | Sub line: margin % **and** one secondary value only, secondary rounded to integer (`R$ 1.173/ha`, `−227/ha`); below `sm` show only the margin % as sub. Corner header: `CBOT (US¢/bu) ↓ · Dólar (R$/US$) →` in two lines. Add `tabular-nums` to cells and headers. Hover state on cells: `hover:ring-1 hover:ring-g7/40`, press `active:scale-[0.98]` (buttons currently have no hover/press feedback). | S | `Comercializacao.test.tsx` cell texts/aria labels, `matrixFormat` tests |
| P2-5 | `src/ui/MatrixKpis.tsx` | "Cenário atual … dólar 5,50" (2 decimals) vs 5,4998 everywhere else; "Pior célula R$ 101,93 · margem −3,7% · R$ −227,14/ha" (sign placement). 375: 4th tile alone (same fix as P2-2). | ux `number-formatting`, consistency. | `fmtFx` (4 decimals) in the hero sub; money sign before the symbol (`−R$ 227/ha` → `R$ −227` is wrong in pt-BR; use `−R$ 227`). Tile grid as P2-2. | S | `Comercializacao.test.tsx` |
| P2-6 | `src/ui/ComercializacaoCard.tsx`, `OwnPriceSection.tsx` | Card 3 = switch + helper + (field + helper + basis line + button) + two fields + switch + helper + field: 264 px off, 495 px with own price on. "(opcional)" appears three times (card header, both switches). | ux `progressive-disclosure`, `field-grouping`; spec §5 card 3 = "% já vendido, preço médio vendido, meta". | See §iv-A. Minimum regardless of the decision: drop "(opcional)" from the switch labels (the card header already says it); switch helper texts to one line each; put the two "já vendido" fields first (they are the card's name), the switches after. | S | `noTarget.test.tsx`, `ownPrice.test.tsx` label strings |
| P2-7 | `src/ui/TopBar.tsx` | Four segmented groups without captions; "s/ receita · s/ custo" is an abbreviation a producer has to decode; "Salvar cenário" is a disabled button whose only explanation is a `title` (not reachable by keyboard or touch). 768: the row wraps to 80 px (top bar 133 px). | ux `nav-label-icon`, `disabled-states` ("semantic attribute + reason"), `overflow-menu`; frontend-design writing ("name things by what the user understands"). | Captions above each group at `≥lg` (11 px muted: `Cultura · Moeda · Produtividade · Margem`); rename options to `sobre a receita | sobre o custo` (or move this toggle into the hero tile's sub-line as a small pill — it only affects the %); remove "Salvar cenário" from the bar (it is in the sidebar's "em breve" list already). Below `lg`: two rows by design (`Cultura + Moeda` / `Produtividade + Margem`) instead of a horizontal scroller, Compartilhar as an icon-button with label. | S | `TopBar.test.tsx`, `keyboard.test.tsx` (tab order) |
| P2-8 | `src/ui/ResultSheet.tsx`, `src/pages/Simulador.tsx` | 375: the sticky bar repeats the hero ("Margem bruta / saca R$ 19,42") that is already on screen at first paint; bar + bottom nav = 102 px of fixed chrome; the sheet has no backdrop-click close; the sheet reuses the full desktop panel at 85 vh. | ux `fixed-element-offset`, `modal-escape`; make-interfaces-feel-better (stable toolbars). | Show the bar only once the hero tile has scrolled out of view (`IntersectionObserver` on `kpi-margem`, fade-in 150 ms). Backdrop click closes (as the drawer already does). Sheet title `Resultado de hoje`. Owner decision on "result first on mobile" in §iv-E. | S | `Simulador.test.tsx` sheet tests (bar presence), `useDialogBehavior` |
| P2-9 | `src/ui/Sidebar.tsx` | 6 of 8 items disabled; "em breve" tags 10 px; separators 10 px uppercase; coloured squares as icons; "Visitante · dados só neste navegador". At 768 the sidebar is 31 % of the width. | ux `empty-nav-state` (explain, don't clutter), `nav-label-icon`; frontend-design (ALL-CAPS eyebrows are a template tell). | See §iv-B (icon rail) and §iv-C (em breve). Regardless: real icons (Lucide `calculator`, `grid-3x3`), one "Em breve" group header with the six names as plain 12 px text and a single tag, 12 px separators in sentence case. | S | `Sidebar.test.tsx` |
| P2-10 | `src/ui/Tour.tsx` | Step 1 opens as a bottom sheet over a page that is already fully calculated; background still scrolls; "Voltar" shown disabled on step 1; no sentence saying what the tour (or the app) is for. | ux `multi-step-progress`, `escape-routes`, `scroll-behavior`; writing ("empty screens invite action"). | Add a one-line lead on step 1: `Em três passos você vê sua margem por saca de hoje. Pode pular: tudo já está preenchido com um exemplo.`; hide "Voltar" on step 1 (render nothing, keep layout with `justify-end`); lock body scroll while open (`overflow:hidden` on `html`, also for the drawer/sheet — ledger T9 deferred); replace "1 de 3" eyebrow with three dots + text; "Pular" → "Pular tour". | S | `Tour.test.tsx` |
| P2-11 | `src/ui/LavouraCard.tsx` suggestion line | "Média de Centro-Sul: 60,40 sc/ha · usar" — "usar" is an 11 px underlined word; in t/ha mode it still says sc/ha (bug B1). | ux `touch-target-size` (met by padding, but invisible), `cursor-pointer`; affordance. | Chip button: `Usar média da região: 60,40 sc/ha` (32 px tall, `border-g7 text-g7`), value converted to the active unit; when the field already equals the suggestion, show `✓ média da região` as text. | S | `Simulador.test.tsx` ("usar") |
| P2-12 | `src/ui/NumberField.tsx` | Border 1 px, focus only changes the border colour to `--g5` (2,9:1 vs track); error text appears but field keeps 1 px red; helper text 11 px under the field, "ref. R$ 475,34" reads like a second label; rejected text stays with the error (R17, fine). | ux `error-placement` (met), `input-helper-text`, `focus-states`. | Focus: 2 px `--g7` border + `box-shadow 0 0 0 3px rgba(18,99,74,.18)`; error: 2 px `--danger` border + the message; helper 11,5 px with `text-wrap: pretty`; "ref." helper → `Referência da região: R$ 475` (integer). Keep text input + `inputMode=decimal` (spec anti-goal on masks is respected). | S | `NumberField.test.tsx` (class names not asserted; helper text is) |
| P2-13 | `src/ui/fmtExtra.ts` `fmtMarginPct` | "16% da receita · meta 15% ✓" for 15,52 % vs a 15 % target — the display suggests 1 p.p. of slack where there is 0,5. Known (Task 12). | ux `number-formatting`; a target comparison needs the same precision as the target band (±1,5 p.p. tones). | One decimal below 100 % (`15,5%`), none at or above; matrix cells may keep integers for density but the legend bands must then be integers too. | S | `format.test.ts`, several page tests asserting `16%` |
| P2-14 | `src/ui/KpiRow.tsx` (total sub), `LavouraCard.tsx`, `KpiRow` comparison | t/ha mode: "1.000 ha × 60,40 sc/ha = 60.400 sc" and the suggestion keep sc/ha; US$ mode: comparison stays R$ (bugs B1, B2). | Consistency of units (ux `number-formatting`); the switches promise a whole-app unit. | Convert with `scHaToTHa`/`toDisplay` in those three strings (`1.000 ha × 3,62 t/ha = 3.624 t`). | S | `Simulador.test.tsx` |
| P2-15 | `src/pages/Comercializacao.tsx` legend footer, buttons row | "Meta de margem: 15% · cada célula usa o seu dólar (R$); CSV sempre em R$" — three facts in one muted line; two disabled "em breve" buttons next to the real one. | writing (one job per element); ux `primary-action`, `disabled-states`. | Footer line: `Valores convertidos com o dólar de cada coluna. O CSV sai sempre em R$.`; move the target to the legend title (`Cor = margem em relação à meta de 15%`). Replace the two disabled buttons by one muted sentence: `Em breve: simular opção de venda · criar alerta.` Button label `Baixar matriz (CSV)`. | S | `Comercializacao.test.tsx` |
| P2-16 | `src/ui/SalePlan.tsx` | Works, but three 44 px fields + a long "Remover faixa 1" button per band; summary `dl` in 4 columns; "não é salvo" in the header right. | ux `field-grouping`; make-interfaces-feel-better (tabular figures). | Band row: `Volume %` (w-24) · `Preço alvo R$/sc` (w-36) · icon-button "Remover" (`aria-label`); summary as a two-line sentence with `tabular-nums`: `Com 30% a R$ 130,00 e 70% ao preço de hoje, o preço médio fica em R$ 126,58 (margem 16,5%).` Keep the card last; it is the spec's first cut if time is short. | S | `Comercializacao.test.tsx` plan tests (`plan-total`, `plan-avg`) |
| P2-17 | `src/ui/ExplainDrawer.tsx` | Good: focus goes to "Fechar", returns to the "i" on close, backdrop closes. 1280: 420 px full-height panel with the content in the top third; `<ol>` items are cards inside a panel on the page background; the final "Valores em reais (R$); conta feita no seu navegador." is a nice trust line. | ecc design-direction ("no cards inside cards"); polish. | Replace the per-line cards by a plain list with hairline separators (`divide-y divide-line`), value column `tabular-nums` right-aligned, formula under the label in 11,5 px; panel `md:w-[440px]`, `md:max-h-none` stays. Add a "Ver no painel" no — keep it single-purpose. | S | `ExplainDrawer.test.tsx` (text unchanged) |

### P3 — polish

| ID | Where | What | Proposal | Size |
|---|---|---|---|---|
| P3-1 | all tiles/cards | Uppercase tracked eyebrows (`text-[11px] uppercase tracking-[0.05em]`) on every KPI, drawer and sheet header — the main "template" tell. | Sentence case 12 px `text-mut`, no tracking; keep weight 500. | S |
| P3-2 | `EditableValue.tsx`, `ExplainButton`, `Sidebar.tsx`, `ResultSheet.tsx` ("▴") | Text characters as icons (✎, italic "i", "▴", coloured squares). | One icon set (Lucide, 16/20 px, stroke 1.75): `pencil`, `info`, `chevron-up`, nav icons; all `aria-hidden` with the existing labels. | S |
| P3-3 | `index.css` | No `-webkit-font-smoothing`, no `tabular-nums`, no `text-wrap`. | `html { -webkit-font-smoothing: antialiased; }`, `.num { font-variant-numeric: tabular-nums }` on KPI numbers, matrix, waterfall values, inputs; `text-wrap: pretty` on helper paragraphs, `balance` on card titles. | S |
| P3-4 | `Switch.tsx` | `transition-all`; off-track is `--mut` (reads disabled). | `transition-[background-color,left] duration-150 ease-out`; off track `#c9d4ce` with a `--line-strong` border (still ≥ 3:1 vs thumb). | S |
| P3-5 | `Segmented.tsx` | No transition on selection; `shadow-sm` on the pill only. | 120 ms background transition; selected pill `border border-line`; `tabular-nums` not needed. | S |
| P3-6 | `StoreProvider.tsx` | Loading = `<p>Carregando…</p>` (spec §9 asks for a skeleton). | Skeleton of the KPI row + 3 cards (grey blocks, `animate-pulse`, respects reduced motion). | S |
| P3-7 | `Card.tsx` | Numbered circles 1-2-3 are justified (the cards are a sequence) — keep. Title 13,5 px. | Title 14 px/600; `right` slot 12 px. | S |
| P3-8 | `Footer.tsx` | Legal line only. | Add the data line (ties to P1-1): `Preços de fechamento de 26/10/2026 · fontes: Yahoo Finance (não oficial), BCB, B3, Cepea, IMEA` on a second line. Legal text unchanged (spec literal). | S |
| P3-9 | `BottomNav.tsx` | Two text-only items, 48 px. | Icon + label (Lucide), active indicator bar 2 px `--mint`. | S |
| P3-10 | `AppShell.tsx` | No `max-w` on content at ≥1440 (KPIs stretch). | `main > *` `max-w-[1280px]`. | S |
| P3-11 | `Tour.tsx`, dialogs | Entrance is instant. | 150 ms fade + 8 px slide-up (reduced-motion already handled globally). | S |
| P3-12 | `index.html` | Title "Margem — simulador de margem do produtor". | Add `<meta name="description">`, `theme-color #0b3d2e`, a favicon (brand pending). | S |

---

## (iii) Proposed token, type and spacing system (concrete)

Keep every existing CSS variable name (Tailwind config and `contrast.test.ts` depend on them); add the ones marked **new**. Palette direction (dark green sidebar, white cards, mint/gold accents) stays until Hedgepoint's identity arrives — this is a legibility pass, not a rebrand.

```css
:root {
  /* surfaces & ink — unchanged */
  --g9: #07281e; --g8: #0b3d2e; --g7: #12634a; --g5: #1f9d73; --mint: #2bd9a0; --gold: #d1ae6c;
  --bg: #f2f5f3; --card: #ffffff; --line: #e3e9e5; --tx: #13231c; --mut: #5f6f68;

  /* new — non-text contrast (WCAG 1.4.11) */
  --line-strong: #76908a;   /* input/select borders: 3,4:1 on #fbfdfc, 3,1:1 on --bg */
  --focus: #0b3d2e;         /* ring on light surfaces; ≥ 5,4:1 on every tone */
  --focus-dark: #2bd9a0;    /* ring inside g8/g9 surfaces (existing behaviour) */
  --warn-line: #9c7a2b;     /* note borders: 4,0:1 on white */
  --danger: #b3261e;        /* already used as a literal; promote to a token */

  /* new — chart fills (dataviz) */
  --bar-track: #e9efec; --bar-pos: #12634a; --bar-neg: #c8463d; --bar-final: #2bd9a0;

  /* matrix tones, target mode (diverging: warm → neutral → green) */
  --tone0: #e8877a; --tone1: #f2b899; --tone2: #f2e6c4; --tone3: #b7dfb6; --tone4: #80cb9c; --tone5: #45b27f;
  /* matrix tones, no-target mode (sequential): tone0 stays red for < 0, then */
  --seq1: #e4f0e4; --seq2: #c3e3cc; --seq3: #9cd4ac; --seq4: #6fc495; --seq5: #3fae79;
}
```

All proposed fills keep `#10261d` text ≥ 6,0:1 and `--tx` ≥ 6,2:1 (computed), so the `contrast.test.ts` loop over `tone0..5` passes **provided the matrix sub-label loses `opacity-80`** (at 80 % ink the darkest tones give ≈ 3,6:1 and the loop's second pair fails). The sequential ramp needs its own PAIRS entries (`--seq1..5`; `#3fae79` with `#10261d` = 5,7:1 ✓). Validator result for the diverging candidate: adjacent ΔE 8,4 normal / 4,0 protan (current tokens 4,8 / 0,6), fills 1,2–2,7:1 vs white (expected for a heat table; the printed numbers are the required relief). Acceptance for 13b: `node validate_palette.js "<tones>" --mode light --surface "#ffffff"` reported in the ledger; push toward ΔE ≥ 15 by deepening tone0/tone5 and lightening tone2 before touching the greens' hue.

Type scale (Inter, already loaded; weights 400/500/600/700):

| Role | Size / line | Weight | Use |
|---|---|---|---|
| Hero number | 32 / 1.1 (`lg:` 36) | 700, `tracking-[-0.02em]`, tabular | Margem bruta / saca; Cenário atual |
| Tile number | 22 / 1.15 | 700, tabular | other KPIs |
| Tile number (compact row, `<lg`) | 18 / 1.15 | 700 | 3-tile row |
| Page title | 16 / 1.3 | 700 | TopBar h1 (context in 400 `--mut`) |
| Card title | 14 / 1.3 | 600 | Card h2 |
| Body / field value | 14 (16 on `<md`) / 1.5 | 500–600 | inputs, matrix main |
| Label / eyebrow | 12 / 1.4 | 500, sentence case | field labels, tile eyebrows, legend |
| Helper / caption | 11,5 / 1.45 | 400 | helpers, ticker caption, matrix sub |
| Minimum | 11 | — | nothing smaller (today: 10 px tags/separators, 10,5 px chip/cells) |

Spacing (4-pt rhythm, Tailwind steps): page gutter 16 (`md:` 18 → 20), card padding 16, card gap 14 → 16, field gap 10 → 12, row rhythm inside cards 8/12/16, section gap 24. Radius: card 14, input/button 9, chip 999, matrix cell 8, inner ring buttons 999 — concentric check: KPI "i" button (28) inside a 14 px card with 13 px padding → radius 999 is fine. Shadows: none on cards (flat + 1 px `--line`); `0 -4px 16px rgba(11,61,46,.12)` on the mobile result bar; `shadow-xl` on dialogs only. Motion: 150 ms ease-out enter / 100 ms exit, explicit properties, `prefers-reduced-motion` global rule stays.

---

## (iv) Decisions that need the owner

**A. Card 3 "Comercialização" — where do target and own price live?**
- A1 (recommended): card 3 = `Venda já feita` (já vendido %, preço médio vendido) + `Meu preço na fazenda` switch (it is a price input, and the card already talks about selling). **Move the margin target** to the result panel's "Exposição e preço mínimo" card as its first control (switch + field) — the target only produces "preço mínimo" and the matrix colours, both results. Pros: card 3 shrinks to one topic; the target sits beside the number it drives; the sheet on mobile gains the control. Cons: the matrix page reads the target from a control on the Simulador result panel (add a "Meta: 15% · editar" link in the matrix legend). Tests: `noTarget.test.tsx`, `ownPrice.test.tsx` move queries.
- A2: keep card 3 as is, only reorder and trim copy (P2-6 minimum). Pros: zero structural change. Cons: 495 px card with two unrelated switches.
- A3: own price moves next to the ticker/"Preço na fazenda" tile as a pencil on the tile. Pros: edits the number where it is shown. Cons: a plausibility-validated field inside a KPI tile, two pencil idioms (ticker edits inputs, tile edits a derived number) — I advise against.

**B. 768–1023 px: icon rail or 240 px sidebar?** (ledger R15 left this to Task 13)
- B1 (recommended): 64 px icon rail at `md`, full 240 px at `lg`; items get `title` + tooltip and the label at `lg`. Frees 176 px: top bar stops wrapping (one row), KPI tiles 3-up, matrix fits without scroll (509 < 704 − 32). The result panel still waits for `lg` (two columns at 704 px would give the panel 268 px — too narrow).
- B2: hide the sidebar below `lg` and use the bottom nav up to 1023. Simpler, but a tablet in landscape shows a phone pattern.
- B3: keep 240 px (status quo). Cheapest; keeps the 133 px top bar and 31 % chrome.

**C. "Em breve" items in the sidebar**
- C1 (recommended): one collapsed group "Em breve" (chevron, closed by default, remembered in `localStorage`) listing the six names as plain text; no per-item tags. The roadmap stays visible on demand, the nav shows the two real destinations.
- C2: move the six names to the sidebar footer card ("Em breve: Cenários · Insumos · Hedge · Alertas · Salvos · Relatórios") and drop them from the nav.
- C3: keep as is with real icons and 12 px text (P2-9 minimum).

**D. Waterfall: split "Preço de referência (CBOT + base)" into "Bolsa" and "Base"?** (ledger T8 deferred "base inside reference by design")
- D1 (recommended): split (P2-3). The own-price feature makes the base a user-facing lever ("base implícita"), the mockup had a base row, and a producer knows "prêmio/base" as a thing that moves. Cost: 2 more rows (8), one test string, and a sign convention: `+ Base` when positive.
- D2: keep one row, but print the composition under the label (`CBOT 1.241,25 + base 61,70`). Cheaper, less legible.

**E. Mobile: result first?**
- E1 (recommended): keep inputs-first but tighten the top (P2-2 3-tile row, P2-8 bar only after the hero scrolls out). The hero margin is already the first thing on screen, so the spec criterion holds; moving the full result panel above the inputs would push the first field ~600 px down.
- E2: full result panel (waterfall + exposure) collapsed under the hero as an accordion "Ver de onde vem o preço", open by default on the first visit. Good for understanding, costs a long first screen.

**F. Margin % precision (P2-13)** — one decimal everywhere (recommended) vs integers from 10 % (status quo, Task 12 ruling). Affects several test strings; a 15,5 % vs meta 15 % display is the argument.

---

## (v) Implementation order for Task 13b (batches that do not collide)

| Batch | Scope (IDs) | Files | Notes |
|---|---|---|---|
| 1 — tokens & a11y floor | P1-4, P3-3, P3-4, P3-5, (P1-3 tokens only) | `tokens.css`, `index.css`, `tailwind.config.ts`, `contrast.test.ts`, `NumberField.tsx`, `Switch.tsx`, `Segmented.tsx`, selects in `LavouraCard`/`Tour` | Add tokens first; every later batch uses them. Run `contrast.test.ts` + `validate_palette.js`. |
| 2 — ticker & footer | P1-1, P3-8 | `Ticker.tsx`, `Footer.tsx`, `Ticker.test.tsx` | Independent of batch 3. |
| 3 — KPI rows & comparison | P1-2, P2-2, P2-5, P2-13 (if F = yes), P2-14, P3-1 | `KpiRow.tsx`, `MatrixKpis.tsx`, `explain.ts`, `fmtExtra.ts`, `format.test.ts`, page tests | Touches both pages' tile rows; do not run together with batch 5 on `MatrixKpis`. |
| 4 — Simulador cards | P2-1, P2-6 (+ A decision), P2-11, P2-12, P2-10 | `CustoCard.tsx`, `ComercializacaoCard.tsx`, `OwnPriceSection.tsx`, `LavouraCard.tsx`, `ResultPanel.tsx` (if A1), `Tour.tsx` | Biggest batch; own-price/target tests move. |
| 5 — Matrix | P1-3 (legend + `toneFor` step), P1-5, P2-4, P2-15, P2-16 | `Comercializacao.tsx`, `MatrixTable.tsx`, `matrixFormat.ts`, `SalePlan.tsx`, `engine/matrix.ts` (+ tests) | Engine change only if the 3 p.p. step is chosen. |
| 6 — Shell & nav | P2-7, P2-8, P2-9 (+ B, C), P3-2, P3-9, P3-10 | `TopBar.tsx`, `Sidebar.tsx`, `BottomNav.tsx`, `AppShell.tsx`, `ResultSheet.tsx`, icon dependency (Lucide ~ +3 kB gzip; budget 300 kB) | Last: depends on tokens and on decisions B/C. |
| 7 — Waterfall & drawer | P2-3 (+ D), P2-17, P3-6, P3-11 | `Waterfall.tsx`, `ExplainDrawer.tsx`, `StoreProvider.tsx` | Independent of 4–6 except the result-panel card if A1 moved the target there — do 7 after 4. |

Each batch: implement → `npm test` (400 green today) → `npm run lint` → a 375/768/1280 look. Re-run the DOM checks in §vii as the acceptance list.

---

## (vi) Functional bugs (not design) seen during the walk

| # | Where | Observed | Severity |
|---|---|---|---|
| B1 | `LavouraCard.tsx`, `KpiRow.tsx` | t/ha mode: suggestion line and "Margem total" sub-text stay in sc/ha ("60,40 sc/ha", "60.400 sc"); the field itself converts (3,62). Known-deferred in the ledger; still a wrong display. | medium |
| B2 | `KpiRow.tsx` | US$ mode: comparison line stays in R$ (B3 SJC in US$, Cepea in R$). Known-deferred. | low |
| B3 | `MatrixKpis.tsx` | "Cenário atual … dólar 5,50" shows 2 decimals; every other place shows 5,4998 (matrix headers 4). Known-deferred. | low |
| B4 | `Comercializacao.tsx` vs `engine/matrix.ts` | Target-mode legend names three bands ("perto ±3 p.p.") while `toneFor` paints six in 1,5 p.p. steps; spec §6 says "6 tons". The legend is wrong about its own colours. | medium |
| B5 | `Ticker.tsx` | Date/source caption unreachable below ~1140 px and clipped at 1280 (see P1-1). Violates spec §2 anti-goal in practice. | high |
| B6 | `Comercializacao.tsx` | At 375 the view switcher scrolls with no indicator; "Margem %" cannot be discovered by touch (keyboard arrows still reach it). | medium |
| B7 | `TopBar.tsx` | "Salvar cenário" is `disabled` with only a `title="Em breve"`; no accessible reason (screen readers hear "dimmed"), nothing on touch. | low |
| B8 | `Tour.tsx` / `useDialogBehavior` | Background page scrolls under the tour, drawer and sheet (no scroll lock / inert); Escape on the tour marks it done permanently (`tourDone`) — confirm this is intended, since a reflex Escape hides the tour forever. | low |

Verified OK (no bug): own-price 130 commits on blur, ticker shows "Base 102,06 · base implícita do seu preço · manual", waterfall and hero update; crop switch resets the own-price override (R19); drawer focus returns to the "i" button; Escape closes drawer and sheet; no console errors; `Compartilhar` copies the hash URL; CSV button enabled; "em breve" buttons disabled at 0,6 opacity.

---

## (vii) Appendix — measurements (DOM, px)

| Metric | 375×812 | 768×1024 | 1280×800 |
|---|---|---|---|
| Top bar height | 103 | 133 (controls wrap to 80) | 89 |
| Ticker height / scrollWidth vs clientWidth | 60 / 1195 vs 375 | 55 / 1139 vs 513 | 55 / 1139 vs 1025 (1304 while editing) |
| Caption "Fechamento…" x-start / right edge | 822 / 1179 | 1004 / 1361 | 1004 / 1361 (clip at 1265) |
| Fixed chrome (bar + nav) | 53 + 49 = 102 | 52 + 0 | — |
| Hero tile y / first input card y | 179 / 597 | 204 / 571 | 161 / 310 |
| KPI tile sizes | hero 343×96; preço 166×187; custo 166×187; total 343×97 | hero 477×96; 232×136 ×2; total 477×97 | 238×136 ×4 |
| Card heights (lavoura / custo total / custo categorias / card 3 off / on) | 350 / 413 / — / 373 / — | 146 / 265 / — / 264 / — | 146 / 265 / 1002 / 264 / 495 |
| Result | sheet 592 tall, top 220 | sheet | sticky panel 382×468 (waterfall 349×184) |
| Matrix card height / table scroll | 1035 / 509 vs 318 | 767 / 509 vs 451 | 568 / 963 (fits) |
| Matrix cell | 76×55, sub wraps 3 lines | — | 155×44 |
| View switcher scroll | 391 vs 310 | fits | fits |
| Sidebar | hidden | 240 (31 %) | 240 (19 %) |
| Smallest text | 10 px (sidebar tags/separators), 10,5 px (chip, matrix sub) | same | same |
| Tap targets < 24 px | none | none | none |

Contrast (computed; WCAG AA thresholds 4,5 text / 3 non-text): input border #d5ded9 1,35 ✗ · card border 1,12 (decorative) · focus g5 on tones 1,8–2,7 ✗ · gold border 2,1 ✗ · segmented track 1,13 · waterfall ref bar on track 1,12 ✗ · negative bar 2,6 ✗ · exposure open 1,29 · hero sub #bfe6d6 on g7 5,3 ✓ · sidebar #a3c2b4 on g8 6,4 ✓ · chip #8a6d1a 4,55 ✓ · `--mut` on bg 4,8 ✓.

Validator (`dataviz/scripts/validate_palette.js`, light, current tones): lightness not monotone; adjacent ΔL too close (tone1→2 0,033, tone2→3 0,025); light-end 1,23:1; adjacent CVD ΔE 0,6 (deutan) / normal-vision 4,8 — FAIL. Proposed diverging set (`#e8877a #f2b899 #f2e6c4 #b7dfb6 #80cb9c #45b27f`): text contrast 6,0–12,8:1 ✓, ring `--g8` 4,6–9,8:1 ✓, 80 %-ink sub-label 3,5–7,6:1 (✗ on tone0/tone5 → use full ink), validator adjacent ΔE 8,4 normal / 4,0 protan (improved from 4,8 / 0,6; still below the 15 floor, legal only because every cell prints its number — 13b should keep pushing).

Screenshots (right-cropped, for orientation): `shots/375-tour-step1.jpg`, `375-simulador-top.jpg`, `375-simulador-cards.jpg`, `375-simulador-card3.jpg`, `375-result-sheet.jpg`, `375-comercializacao-top.jpg`, `375-matrix.jpg`, `768-simulador.jpg`, `768-matrix.jpg`, `1280-simulador.jpg`, `1280-custo-categorias.jpg`, `1280-explain-drawer.jpg`, `1280-milho.jpg`, `1280-matrix-preco.jpg`, `1280-matrix-total.jpg`, `1280-matrix-pct-saleplan.jpg`.

Spec/ledger conformance: nothing above proposes live/AUTO labels, competitor identity, recommendation language or a third crop. Rulings challenged explicitly: R15 (sidebar 240 at md → §iv-B), T8 "base inside reference" (§iv-D), Task 12 "margin % integer from 10 %" (§iv-F). Everything else builds on the existing rulings (R11 no "adicionar categoria", R13/11b optional target default off, R16/R17/R19 field commit rules).
