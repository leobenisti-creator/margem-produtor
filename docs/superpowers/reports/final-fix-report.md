# Final fix wave report (whole-branch review, items #1–#8)

Branch feat/mvp, base 86d0ffc (481 tests). TDD: every copy/conditional change had its assertion written first; the first run of the 8 touched files showed 14 failures (plus the missing `./contract` import), all for the expected reason; after the implementation the full suite is 497/497.

Verification: `npx vitest run` ×2 (497 passed, 38 files, both runs), `npm run lint` (tsc) clean, `npm run build` clean (JS 99,40 kB gzip, was 98,36). Browser check of #1/#2/#5 at 1280×900 and 375×812 in the embedded browser (dev server started from a temporary launch.json, stopped afterwards; launch.json removed; no background process left). Nothing pushed.

## #1 Blended margin labelling
- Change: `MatrixKpis` `current` gains `blend?: { soldPct, soldPrice }` (sold price already in the display currency). With it the hero sub-text reads `margem blendada 28,2% (40% vendido a R$ 128,00)`; without it the old `margem X%`. `Comercializacao` passes `blend` only when `includeSold && soldPct > 0` (same `blend` flag that already picked `blendedMarginPct`). `MatrixLegend` gains `blended` and appends ` (com o já vendido)` to the title in both legend modes.
- Test: Comercializacao.test "#1 labels the hero margin as blended…" (default: no "blendada"; 40 % at 128 → exact string and legend suffix; switch off → plain margin and no suffix) and "#1 prints the sold price in the display currency" (US$ 128/5,4998).
- Evidence: 1280 hero shows "margem blendada 28,2% (40% vendido a R$ 128,00)" wrapping to two lines inside the tile; legend "Cor = margem sobre a receita (com o já vendido)"; 375 same, no horizontal overflow (scrollWidth 375).

## #2 Missing regional freight
- Change: reducer already implemented R30 (edited freight survives `setRegion`, otherwise `freightFor` → 0; covered by reducer tests "typed freight survives setRegion…" and "region without reference… zero freight"). `FreightFields` now looks up `REGIONS[regionId].freightBrlTon` and, when absent (mt-total, noroeste, norte, paranagua, outra), renders under the freight field "Sem referência de frete para esta região — digite o seu." (same helper pattern as the milho yield note).
- Test: Simulador.test "#2 a region without a freight reference shows the note…" (centro-sul → norte: stored 0, field "0", note; back to centro-sul: note gone, 461,27·0,06) and "#2 a freight the user typed survives…" (500 R$/t typed, then noroeste: field still 500, stored 30 R$/sc, note shown).
- Evidence: 1280 and 375 screenshots of Norte: field 0, "equivale a R$ 0,00/sc" then the note on its own line.

## #3 Stale drawer copy
- Change: explain.ts margem note → "…na pílula ao lado da margem."; precoMinimo (no target) note → "Ative “Definir meta de margem” em “Exposição e preço mínimo”, no Simulador (no celular, dentro de “Resultado de hoje”) para ver o preço mínimo."
- Test: ExplainDrawer.test "#3 margem note points at the pill…" and "#3 precoMinimo without a target says where the switch lives…" (exact strings + negative match on the old wording).

## #4 Legend base label
- Change: `MatrixLegend` gains `marginBase` ('receita' | 'custo', default 'receita'); no-target title "Cor = margem sobre a receita" / "sobre o custo". The target title ("Cor = margem em relação à meta de X%") does not name the base, so it is unchanged.
- Test: Comercializacao.test "#4 the no-target legend names the margin base…" (receita → custo → target 15 %).

## #5 Visible "a confirmar" for the basis
- Change: `isUnconfirmed(q)` (exported from Ticker.tsx, `/a confirmar/i` on `source`). Ticker basis note: "· base de 21/10 · a confirmar" (tooltip `title={basis.source}` kept). Footer data line now ends "…, Cepea, base Hedgepoint/CME/ESALQ (a confirmar), IMEA"; without the phrase in the source: "base Hedgepoint/CME/ESALQ".
- Test: Ticker.test "#5 … (seed)" and "#5 no 'a confirmar' when the source does not carry the phrase" (mocked snapshot); Footer.test updated expectation + "#5 lists the basis source without…" (mocked snapshot).
- Evidence: 375 ticker row scrolled: "Base 61,70 US¢/bu · base de 21/10 · a confirmar"; footer textContent at 1280 carries "(a confirmar)".

## #6 Own-price tile label
- Change: KpiRow price tile sub-text is "por saca · preço informado por você" when `ownPriceMode && basisFromOwnPrice`, else "por saca · paridade de exportação".
- Test: ownPrice.test "#6 the price tile says the price was informed by the user only while the basis comes from it" (off → switch on, nothing typed → typed 130 → "Voltar ao preço de mercado" → manual ticker basis = parity again).

## #7 Compartilhar (interim, R29)
- Change: button label/aria-label/title "Copiar link do app"; success status "Link copiado — os seus dados ficam só neste navegador." in the existing `aria-live="polite"` span. No state in the URL (owner decision).
- Test: TopBar.test updated ("Copiar link do app" present, "Compartilhar" absent; "#7 copies the app link and says the data stays in this browser"; clipboard-failure test re-pointed at the new name).

## #8 MarketSnapshot contract test + README
- Change: `src/data/contract.ts` — `EXPECTED_UNITS` (read from the seed: cbotUsc `USc/bu`, fx `R$/US$`, basisUsc `USc/bu`, b3 soja `US$/sc`, b3 milho `R$/sc`, cepea `R$/sc` — note the seed spells `USc/bu`, not `US¢/bu`; the Ticker prints the ¢ literal itself) and `snapshotContractViolations(snapshot): string[]` (finite value, exact unit, ISO asOf, kind in the DataKind union, non-empty source, missing crop/quote). `src/data/contract.test.ts` runs it against `staticProvider` (empty list), asserts the unit table, the per-quote rules explicitly, and that each violation is named (5 injected faults → 5 messages). README gains "Contrato do provedor" (units, basis sign = premium over CBOT, asOf per quote, 'ao_vivo' only after the Ticker caption is revised, never NaN, "a confirmar" surfaces on screen).

## Not done / notes
- No scope beyond the eight items. Rounding of the blended label follows `fmtMarginPct` (one decimal).
- The note in #2 also shows for Paranaguá and "Outra região" (no `freightBrlTon` either); the task named the three MT ids but the rule is "region without a freight reference".
- Browser check found a pre-existing quirk, untouched: at 1280 the embedded pane clips the fourth KPI tile only because the pane itself is narrower than the emulated width (document scrollWidth 1265 ≤ 1280, so no page overflow).
