# SDD ledger — plan: docs/superpowers/plans/2026-10-27-app-margem-produtor.md

Spec: docs/superpowers/specs/2026-10-27-app-margem-produtor-design.md (reachable). Branch: feat/mvp (new local repo, base fcb3f30). Commits local only.
Models: implementers/reviewers = sonnet; final review = fable.

## Pre-flight scan (rows)

| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| T1 -> T7 | T1 App.test renders footer w/o provider; T7 wraps App in async StoreProvider | T7 must update App.test.tsx to keep it passing |
| T2 -> T3 | CropConfig, SACK_TON | ok |
| T3 -> T4 | Scenario, FarmInputs, farmPriceBrl, marginFromPrice, blendedPriceBrl | ok |
| T3 -> T8 | `Result` type used by T8/T9 but never defined in T3 interfaces | Ruling below (R1) |
| T2/T3 -> T5 | CropId used in snapshot types | ok |
| T5 -> T6 | CostCategoryId, MarketSnapshot, Region | ok (defined in T5 interfaces) |
| T6 internal | AppState.marginBase duplicates FarmInputs.marginBase | Ruling below (R2) |
| T6 -> T7/T8/T10 | useStore, actions | ok |
| T8 -> T9 | KpiRow/ResultPanel modified by T9 | ok, files exist after T8 |
| T3 own tests | arithmetic of several expected values | Rulings R3-R5 |
| T11 | jest-axe not in T1 deps | T11 installs it; ok |
| T1..T12 each | own text vs itself | otherwise consistent |

## Rulings
- Ruling R1: T3 defines and exports `interface Result extends MarginResult { referencePriceBrl: number; farmPriceBrl: number; minPriceBrl: number|null; breakEven: { priceBrl: number|null; yieldScHa: number|null }; blendedPriceBrl: number; blendedMarginPct: number|null; steps: ExplainStep[] }` — plan used the name without defining it — cost if wrong: small rename.
- Ruling R2: `marginBase` lives ONLY in `AppState.inputs.marginBase`; the top-level `AppState.marginBase` in T6 is dropped — one source of truth — cost if wrong: none.
- Ruling R3: T3 test `margin over revenue` expects 0.4002 (46.7/116.7), not 0.4003 — arithmetic — cost: none.
- Ruling R4: T3 test `blended` expects 117.09 (0.3*118+0.7*116.7), not 117.11 — arithmetic — cost: none.
- Ruling R5: T3 test `milho uses 2.36218` expects 59.11 (toBeCloseTo 2 digits), not 59.10 — arithmetic — cost: none.
- Ruling R6: new repo starts on branch feat/mvp (not main) with user's go-ahead ("pode"); repo is local, never pushed.
- Ruling R7: `--mut` set to #5f6f68 (not mockup #6a7b73) so muted text reaches AA 4.5:1 on --bg (~4.8) — cost if wrong: slightly darker grey text.

## Progress
Task 1: implemented bcacb1f; review: spec ❌ (palette tokens shifted vs mockup) -> fix round 1/5 dispatched
Task 1: fix round 1/5 (3 addressed, 0 open — palette tokens; commits bcacb1f..12ef326)
Task 1: minor (deferred): package.json uses caret ranges on very new majors (ts 7, vite 8, vitest 5); lockfile is the pin
Task 1: complete (commits fcb3f30..12ef326, review clean after 1 fix round)
Task 2: minor (deferred): usdToBrl/brlToUsd accept fx=Infinity; 4,200.50 not asserted in tests; '0.005' parses as 5 (thousands rule); '.5'/',5' return null
Task 2: complete (commits 12ef326..b213031, review clean)
Task 3: minor (deferred): reference/farm/blended price funcs don't guard NaN inputs (UI/state must coerce empty fields to 0 — carry to T6/T8); soldPct not clamped in engine (T6 reducer must reject out of 0..1); steps test checks only length/[0]/[4]; negative price gives misleading margin %
Task 3: complete (commits b213031..a1d854e, review clean)
Task 4: implemented dbf6942; review: spec ❌ (CSV header backslash lost in JS literal; col-drop test too loose) -> fix round 1/5 dispatched
Task 4: fix round 1/5 (2 addressed, 0 open — csv header backslash, column-drop test; commits dbf6942..352d217)
Task 4: minor (deferred): no test pins non-finite base RangeError message
Task 4: complete (commits a1d854e..352d217, review clean after 1 fix round)
Task 5: implemented 898355d; review: Approved-with-followups; Important: basis asOf distorted (21/10 labelled 26/10); pós-produção inside `outros` double-counts freight -> fix round 1/5 dispatched
- Ruling R8: basis quotes carry their real asOf (2026-10-21), other quotes 2026-10-26 — honest dating (anti-goal: no misleading freshness) — cost: UI must show per-quote date.
- Ruling R9: default cost reference EXCLUDES IMEA pós-produção (kept as separate `posProducaoBrlHa`); `outros` relabelled "Outros custos" — freight/storage are separate inputs in the app — cost: reference total R$ lower than IMEA COT.
- Carry to T6/T7/T8: milho cost reference is from safra 24/25 month 2024-12 and has no yield; show `byCrop.milho.safra`/`mes` next to milho cost and ask for yield; some regions (mt-total, noroeste, norte) have no freight -> handle undefined; read `byCrop` only (top-level Region fields mirror soja).
Task 5: fix round 1/5 (2 addressed, 0 open — basis asOf, pós-produção split; commits 898355d..504dbb6)
Task 5: minor (deferred): note field untyped in JSON; Region top-level fields mirror soja AND byCrop (two sources of truth; consumers read byCrop); weak 'trigo' substring test
Task 5: complete (commits 352d217..504dbb6, review clean after 1 fix round)
Task 6: implemented c1a4f83; review: Needs fixes (freight overwritten w/o edited flag; edited flags survive crop switch; negative money accepted) -> fix round 1/5 dispatched
- Ruling R10: setCrop resets edited.yield/cost (crop-specific refs); freight depends only on region (edited.freight flag). Defaults: portFees 5.2 R$/sc placeholder, freight from region else 0.
Task 6: minor (deferred): last edit within 300 ms of tab close not flushed (no pagehide flush); categorias-mode typed total redistributes by reference proportions (document); parse is all-or-nothing; save effect writes defaults once after mount
Task 6: fix round 1/5 (3 addressed, 0 open — freight flag, crop resets edits, negative money; commits c1a4f83..8515c59)
Task 6: complete (commits 504dbb6..8515c59, review clean after 1 fix round)
Task 7: implemented ec939a2; review: Needs fixes (44px targets/zoom in EditableValue; caption source invisible + date only from cbot; 2 weak tests) -> fix round 1/5 dispatched
Task 7: minor (deferred): no blur handling in EditableValue; hash not normalized on load so Compartilhar copies URL w/o route; sidebar "em breve" tag contrast borderline (9px #7fa593); disabled items tooltip-only
Task 7: fix round 1/5 (3 addressed, 0 open — 44px targets, visible caption sources + latest date, strong tests; commits ec939a2..d635790)
Task 7: complete (commits 8515c59..d635790, review clean after 1 fix round)
- Ruling R11: omit "+ adicionar categoria" in MVP (reducer has the fixed 8 categories; YAGNI; spec's cut line) — cost if wrong: client cannot add a 9th category.
Task 8: implemented 3012604; review: Needs fixes (input hit area ~24px on mobile) -> fix round 1/5 dispatched (+ concrete-number opening test, waterfall overflow, aria-live inside button)
Task 8: minor (deferred): rejected value stays in field while state keeps old; typed "1000" not reformatted to "1.000"; "padrão do app" chip tied to value==5.2 not untouched; comparison lines stay in native currency in US$ mode; yield suggestion always sc/ha; useResult recomputes in ~10 instances (context would dedupe); sheet has no backdrop click close/inert bg; waterfall lacks a "base regional" row by design (base inside reference price)
Task 8: fix round 1/5 (4 addressed, 0 open — input hit area, concrete opening test, waterfall overflow/minus, live region; commits 3012604..306787b)
Task 8: minor (deferred): waterfall label prints sign AND value prints sign (redundant "− Frete −R$ …"); no waterfall-specific test
Task 8: complete (commits d635790..306787b, review clean after 1 fix round)
Task 9: implemented e866765; review: Needs fixes (flaky Simulador test "empty productivity", 2/11 runs, root cause unknown, predates T9) -> fix round 1/5 dispatched (root-cause, no waitFor masking)
Task 9: minor (deferred): no body scroll lock/inert while drawer or tour open; Tour doesn't return focus on close; drawer Tab-trap test near-vacuous; ResultSheet has its own duplicate trap/Esc code (works via capture-phase stopPropagation); "Bolsa + base" line always US$/bu in R$ mode; stopPropagation vs stopImmediatePropagation if two dialogs ever coexist; Avançar aria-disabled has no pointer to error text
Task 9: fix round 1/5 (1 addressed, 0 open — flaky test = real NumberField mount-sync bug; commits e866765..e561109; 30/30 + 15/15 loop runs green, full suite 170)
Task 9: complete (commits 306787b..e561109, review clean after 1 fix round)
- Ruling R12: Comercialização matrix is centered on TODAY'S MARKET (snapshot cbot/fx), not on the applied scenario, so the grid doesn't jump when a cell is clicked; the cell matching the active scenario is outlined if inside the grid; basis comes from scenario (override honored). Cost if wrong: manual fx edit in the ticker doesn't recenter the grid.
Task 10: implemented 1a21a6a; review: Approved (no Important) but constraint/UX items -> fix round 1/5 (AA contrast of "hoje" tag, KPI dash on null, 4-decimal fx step + validator minimums, CSV BOM + deferred revoke, aria-label of active view, default target 15%)
- Ruling R13: default targetMargin 0.35 -> 0.15. Facts: opening state (centro-sul soja, seed 26/10) = farm price R$125,11/sc, cost R$105,69/sc, margin 15,5%; 35% painted all 25 matrix cells red. 15% = typical goal; editable. Cost if wrong: default meta label differs from the mockup's 35%.
- FLAG FOR USER: basis (soja Paranaguá 61,7 USc/bu from a 21/10 chart digitised from a Hedgepoint PDF) is "a confirmar"; freight default R$27,68/sc (IMEA freight to Paranaguá) + fees placeholder R$5,20/sc drive the 15,5% margin — validate with the data owner.
Task 10: minor (deferred): SalePlan ignores simulator sold share (possible double-count) and is R$-only; Cenário atual shows fx with 2 decimals vs 4 elsewhere; CSV always R$; view tabs are radiogroup not tablist; catch{} swallows engine errors (safe); circular CSV test; test file 336 lines
Task 10: fix round 1/5 (5 of 6 addressed; open: persist.ts discards whole blob when stored steps are under new minimums (Important), margemPct aria lead (minor)) -> fix round 2/5 dispatched
Task 10: fix round 2/5 (2 addressed, 0 open — persist falls back per-field on out-of-range steps; margemPct aria lead; commit c8b9917)
Task 10: minor (deferred): matrix default steps 40/0.25 duplicated in persist.ts DEFAULT_MATRIX and reducer.ts literal; disabled-download-when-null untested
Task 10: complete (commits e561109..c8b9917, review clean after 2 fix rounds)
- USER CHANGE (27/10, after T10): "meta de margem" must be OPTIONAL; default = no target, only the final margin is shown; the client may turn a target on. Queue as Task 11b AFTER Task 11 finishes (avoid colliding edits).
- Ruling R14 (design for 11b): FarmInputs.targetMargin: number | null (null = sem meta, default); UI switch "Definir meta de margem" (off) reveals a % field (default 15 when switched on); with no target: hide "Preço mínimo para a meta", hide "Células abaixo da meta" KPI, hero sub-text has no "meta ✓/✗", explain key precoMinimo only when target set; minPriceForTarget(null) -> null; matrix tones without target use an ABSOLUTE margin scale: <0 -> tone0, 0-5% -> 1, 5-10% -> 2, 10-20% -> 3, 20-30% -> 4, >=30% -> 5 (legend adapts: "negativa ... acima de 30%"); with target the existing relative tones stay; persisted blobs with a numeric target still load; target switch off persists as null; a typed target < 0 or >= 100% (receita) still handled (inatingível).
- USER REQUEST (27/10): at the end, review the WHOLE site (layout, architecture, pages, divisions, how info is shown) using the available design skills/plugins (ui-ux-pro-max, frontend-design:frontend-design, design-system, ecc:design-system, ecc:frontend-design-direction, ecc:frontend-a11y, ecc:accessibility, ecc:make-interfaces-feel-better, ecc:browser-qa, dataviz for the matrix/waterfall) and apply improvements -> Task 13, after 11b and 12 (screenshots at 375/768/1280 via built-in browser; findings list; fixes with tests).
- USER DIRECTIVE (27/10): Task 13 design review must run on Fable 5.1 (model: fable) — or Opus 5.5 if Fable is unavailable; final whole-branch review also on fable.
Task 11: implemented 75159ba; review: Needs fixes (nested dialogs Esc/Tab regression; NaN fed to engine in useResult = wrong layer -> move to engine; toDisplay mislabels BRL as US$ when fx<=0) -> fix round 1/5 dispatched (+ contrast test scans literals, Tour disabled style, replaceState try/catch)
- Ruling R15: sidebar width 240px accepted (em breve tags clipped at 208px); icon rail at md is a Task 13 design option.
Task 11: minor (deferred): StoreProvider imports ui/EmptyState (layering inversion); jest-axe runs heavy for default 5s timeout; @types/jest/@types/node transitive typings
Task 11: fix round 1/5 (6 addressed, 0 open — dialog stack, engine-level null prices, toDisplay USD guard, contrast scan, Tour aria-disabled, replaceState try/catch; commit fce6294; 312 tests x3)
Task 11: complete (commits c8b9917..fce6294, review clean after 1 fix round)
- Carry to Task 11b/13: USD + fx<=0 -> cost/comercialização inputs show 0 via `?? 0` and fromDisplayMoney returns v unconverted (could store USD as BRL) => fix in 11b (disable inputs + "dólar indisponível", never store); input border #d5ded9 ~1.4:1 (WCAG 1.4.11 needs 3:1) => Task 13; sidebar icon rail at md => Task 13 option.
Task 11b: implemented 9995d78; review: Approved, no Important (345 tests x3)
Task 11b: minor (deferred -> Task 13): MatrixKpis `target ?? 0` should be an explicit null branch; keyboard Tab-order test slow (15 s timeout; consider userEvent.setup({delay:null})); UsdNote not linked via aria-describedby to disabled inputs; legacy saved 15% target loads with switch ON; 4th KPI alone on its row at 375px; card title "Exposição e equilíbrio" when no target (sensible, unrequested)
Task 11b: complete (commits fce6294..9995d78, review clean)
Task 12: dc67cc4 README + `preview` script + test titles without competitor names; 345 tests, lint+build clean, JS 92.84 kB gzip (limit 300); walk-through passed; opening numbers hand-verified (ref 157,98; farm 125,11; cost 105,69; margin 19,42/sc = 15,5%; total R$ 1,17 mi).
Task 12 findings: IMPORTANT result updates on blur/Enter not per keystroke (spec §2 "a cada tecla") -> Task 12b; DATA milho farm price R$ 39,05 vs Cepea R$ 64,24 / B3 R$ 66,89 shown beside it (milho uses the region freight R$ 27,68/sc + placeholder fees; Cepea/B3 are delivery prices elsewhere) -> flag to user; DATA soja basis 61,7 'a confirmar' drives 15,5% -> flag to user; MINOR margin % integer from 10% up (15,52 -> "16%"), ticker caption clipped at 1280px -> Task 13.
- Ruling R16 (12b design): NumberField commits LIVE while typing when the text parses and validates (dispatch per keystroke, no reformat while focused); empty/incomplete/invalid text → no dispatch (error shown only for invalid, not for empty/incomplete); on blur reformat to canonical and commit (empty → 0); external value changes while focused do not overwrite typed text unless the typed text parses to a different number than the new value.
Task 12b: implemented edffb48 (live commit while typing, R16); 362 tests x3; loops 10/10. NOTE: from here commits end with 'Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>' (session model switched).
Task 12b: review Needs fixes (rejected value leaves state at the last valid PREFIX; 'sold 150' test weakened) -> fix round 1/5 dispatched (baseline revert on rejected blur/Enter, restore test, clear error on empty)
- Ruling R17: on blur/Enter with a rejected value the state reverts to the focus-time baseline (field keeps text+error); live keystrokes keep following valid prefixes.
Task 12b: minor (deferred -> Task 13): role=alert flashes while typing minimums (0,05 -> '0'); INCOMPLETE regex accepts '1,2,3' silently until blur; matrix regrid per keystroke; reducer-normalised self-commit latent; coverage gaps paste/select-all/Enter
- USER REQUEST (28/10): "o produtor não vai ter o seu próprio preço?" -> Task 12c (after 12b fix, before Task 13). Design (R18): switch "Usar meu preço (R$/sc na fazenda)" OFF by default in the Simulador; when ON the producer types ownPriceBrl (stored in R$/sc); app computes spread = ownPriceBrl − marketFarmPrice(today's market scenario) and keeps that SPREAD constant: every scenario price = farmPriceBrl(scenario) + spread (matrix cells, active scenario). Labels "Preço informado por você" + button to go back to calculated price; min price/break-even/total margin/blended all start from the effective price. Persist ownPriceBrl number|null; engine: computeResult/buildMatrix take an optional `priceSpreadBrl` (number, default 0) added to the farm price; validate > 0; USD mode: typed in display currency converted at fx (disabled when dollar unusable); per-cell US$ conversion unchanged.
- Ruling R18 REVISED (28/10, after user Q&A): Task 12c = optional field "Meu preço na fazenda (R$/sc)"; when typed the app back-solves the IMPLIED BASIS: basisUsc = ((ownPrice + freightBrlPerSc + portFeesBrlPerSc) / (bushelsPerSack × fx)) × 100 − cbotUsc  (US¢/bu), stores it as a basis override ('manual', labelled "base implícita do seu preço") and shows "sua base: +X US¢/bu"; the matrix then keeps that basis constant (price moves with CBOT/dollar). Button "Voltar ao preço de mercado" clears the override. No spread mechanism. Disabled when fx unusable. Persisted via the existing overrides. User's reply 'vc acha que vale colocar? s' treated as go-ahead (low risk, optional, removable).
Task 12b: fix round 1/5 (3 addressed, 0 open — baseline revert, tests restored, empty clears error; commit e443656; 370 tests x3)
Task 12b: minor (deferred): baseline not updated when the prop changes externally WHILE focused (rare)
Task 12b: complete (commits dc67cc4..e443656, review clean after 1 fix round)
Task 12c: implemented 767e37a; review Approved-with-decision -> fix round 1/5 dispatched
- Ruling R19: own-price field commits on blur/Enter only (documented exception to R16, back-solve is non-local); plausibility band 0.1×–10× the market farm price; helper mentions frete/taxas; Ticker note only while the override is the own-price-derived one; setCrop clears manual basis override also with mode off (tested). Cost if wrong: band may reject a legitimate extreme price (error shown, user can edit the base in the ticker instead).
Task 12c: minor (deferred): retyping the rounded displayed price dispatches a tiny override (Ticker flips to manual); helper <p> not aria-describedby; test couples to fixture "+61,7"; card 3 longer when switch on (375px unverified -> Task 13)
Task 12c: fix round 1/5 (5 addressed, 0 open; commit 68fc577; 400 tests x3)
Task 12c: minor (deferred -> Task 13): no persist test for basisFromOwnPrice flag; band-stability-after-basis-change untested
Task 12c: complete (commits e443656..68fc577, review clean after 1 fix round)
Task 13a (fable): audit at design/13a-design-audit.md — P1 5, P2 17, P3 12, bugs B1–B8. Rulings on owner decisions (controller, because the user asked to "deixar da melhor forma" and these are design calls inside the spec):
- Ruling R20 (A1): margin-target switch+field moves to the result panel ("Exposição e preço mínimo" card, first control; sheet on mobile too); card 3 keeps venda já feita + own price; matrix legend gets "Meta: X% · editar" link. Cost: tests move.
- Ruling R21 (B1): 64px icon rail at md (768–1023), full 240px sidebar at lg (supersedes R15's width-only fix).
- Ruling R22 (C1): six "em breve" items collapse into one closed group "Em breve" (remembered in localStorage, try/catch).
- Ruling R23 (D1): waterfall splits reference into "Bolsa (CBOT × dólar)" and "+ Base" rows (8 rows); sign only in label column.
- Ruling R24 (E1): mobile stays inputs-first with tighter top (3-tile row, bar only after hero scrolls out).
- Ruling R25 (F): margin % with one decimal below 100% everywhere (supersedes the Task 12 integer rounding); matrix cells may keep integers only if the legend bands are integers too — prefer one decimal in cells as well unless density breaks at 375.
- Ruling R26 (P1-3): toneFor target mode uses 3 p.p. steps (legend −6 · −3 · meta ±3 · +3 · +6 · +9), diverging palette per audit, validated with the dataviz validator (aim ΔE ≥ 15); no-target mode: red + single green ramp. Sub-label drops opacity-80.
- Ruling R27 (B8): Escape on the Tour only closes it for the session (does NOT set tourDone); only "Pular tour"/"Concluir" set tourDone. Body scroll lock already exists via useDialogBehavior — verify the Tour uses it (audit saw background scroll).
- Data flags unchanged (basis a confirmar; milho freight) — displayed via P1-2 relabel "Em outras praças (sem frete)".
Task 13b dispatched on fable: 7 batches, one commit per batch, browser look per batch.
Task 13b (fable): 9 commits 25527e8..0ee1143; 471 tests x3; JS 98,36 kB gzip; review (fable): Needs fixes — Important: "Meta · editar" link dead below lg; Tailwind opacity modifiers on var() colours never compile (hover ring, skeleton, manual tag) -> fix round 1/5 dispatched
- Ruling R28: margin-base toggle moves from the top bar into the hero tile as a pill; two-row ticker with visible caption stays; tile numbers nowrap. Acceptance 375: first input above the fold (y ≤ 760).
Task 13b: minor (deferred): tour autofocus pre-scrolls the document on first load (pre-existing); cells print /ha without currency symbol (aria-label carries it); 768 classic-scrollbar strip
Task 13b: fix round 1/5 (all addressed; commit 96dcab0; 479 tests x3; residuals: pill 32px below md, stray focus request on modified click) -> fix round 2/5 dispatched
Task 13b: minor (deferred): alpha.test regex misses compound names like ring-offset-g8/50 and dynamic class strings
Task 13b: fix round 2/5 (pill 44px, focus guard, top-bar wrap; commit 68a2db8; 481 tests) — re-review: modified-click test vacuous -> fix round 3/5 (test only)
Task 13b: fix round 3/5 (test-only, commit 86d0ffc; proof described: ctrl-click assertion fails without the guard) — accepted by controller on inspection (test renders MatrixLegend alone, peeks the request)
Task 13b: complete (commits 68fc577..86d0ffc, 12 commits, 481 tests, review clean after 3 fix rounds)
FINAL whole-branch review (fable): numbers consistent on all surfaces (3 scenarios hand-checked), persistence/a11y hold; verdict "With fixes": 5 labelling must-fixes (#1 blended label, #2 silent zero freight, #3 stale drawer copy, #4 legend base, #5 invisible 'a confirmar') -> ONE fix wave dispatched (fable) + #6 own-price tile label, #7 Compartilhar relabel (interim), #8 provider contract test + README.
- Ruling R29: Compartilhar does NOT encode state in the URL (owner product decision); interim relabel "Copiar link do app" + note that data stays in this browser.
- Ruling R30: missing regional freight keeps a user-edited freight; else 0 + visible note.
- Deferred with reviewer's triage (not before merge): SalePlan ignores sold share & is R$-only; CSV R$-only header; per-crop default CBOT step (soja 40 / milho 15 suggested); duplicated matrix defaults; hyphen vs minus in cells; duplicated `Currency` type; StoreProvider→ui layering; tour pre-scroll (focus preventScroll); tour yield field always sc/ha; '0.005' parsing; suite 57 s (vmThreads); large test files; script CSV path constant.
- Declined-to-judge items (reviewer) ruled: US$ cost conversion at the SCENARIO dollar (not PTAX-at-typing) stays — self-consistent (cost: differs from spec §7 wording; note for the owner); others out of MVP by spec.
Final fix wave: 94bde9a, 497 tests; scoped re-review: all addressed, no breakage. BRANCH READY (feat/mvp HEAD 94bde9a).

## Redesign visual (2026-10-28)
- Ruling R26 SUPERSEDED (redesign Task 2, spec §7): matrix colours are a 3-tone traffic light on the margin % in the client's marginBase (toneFor 0 red / 1 amber / 2 green). No target: < 0 red, 0 to 10% amber, >= 10% green. With target: >= target green, up to 5 p.p. below amber, beyond red. Limits 10% / 5 p.p. are defaults (toneFor goodMin/nearPp). Grid always 9x9 in % steps (DEFAULT_STEPS_PCT 2,5/5/10/20); 5x5/7x7 and the CBOT/dollar step fields removed from the UI (legacy matrix settings still in state until Task 4). Tokens tone0/1/2 = red/amber/green; tone3-5 and seq1-5 unused until Task 10.

## 2026-10-28 redesign (final whole-branch review, ledger entries)
- R15 / R21 SUPERSEDED: the left sidebar (and its 64 px icon rail) is gone; navigation is the top NavBar (tabs + "Em breve" disclosure), BottomNav below md.
- R22 adjusted: "Em breve" is a closed disclosure in the NavBar; its open/closed memory (`margem:soonOpen` in localStorage) was dropped. The six items are plain non-interactive list items (no `aria-disabled`, which only belongs on controls).
- R26 SUPERSEDED: matrix colours follow the 3-colour rule (red / amber / green on the margin % in the client's base; see the "Redesign visual" section above).
- Matrix: 5×5 and 7×7 and the absolute steps (CBOT US¢ / dólar R$) removed; always 9×9 in % steps (2,5 / 5 / 10 / 20 by default, "⚙ Ajustar variações"). `validateInput` still accepts the legacy keys `cbotStepUsc` / `fxStep` because reducer.test.ts references them (dead for the UI).
- State: storage key `margem:v1` → `margem:v2`, with NO migration (old key is removed on load; users start from the defaults once).
- Cost group "Fertilizantes" is labelled "Adubação" (internal id stays `fertilizantes`, so stored states and references keep working).
- Tests removed: Sidebar.test.tsx (with Sidebar.tsx) — the UI it covered no longer exists (single "em breve" tag, localStorage open/closed memory, rail width); NavBar.test.tsx covers the new navigation.
- App.test.tsx: the default route is now `#/inicio` (was the Simulador); the placeholder h1 became the capa title.
- Tour opens only on the Simulador route (first visit lands on Início; the tour content is about the Simulador).
- Nearest green cell to today: smallest |CBOT%| + |dólar%|; tie → larger margin, then smaller |dólar%| (spec §7 updated).
- IMEA pós-produção (armazenagem, transporte, classificação) is NOT a cost item (informational `posProducaoBrlHa`); each group has a derived "Demais itens" (= group average − Σ mapped items) so the items in "média" add up to the group average.
- Crop change KEEPS typed items and typed group totals (carry-over; items in 'media' re-derive from the new crop's reference). **Decision to confirm with Leo** — cost if wrong: switching soja → milho keeps soja prices the user typed.
- "Considerar já vendido": matrix cell colours use the blended margin, while the target analysis (gap, levers, stress, N de 81) uses today's price for the whole production; the UI shows a note saying so.
- Minimum price and break-even with rent in sc/ha are now exact closed forms (Cfix = cost/ha without the rent, y = yield, R = rent sc/ha, t = target): break-even = Cfix/(y − R); revenue base P = Cfix/(y(1 − t) − R); cost base P = (1 + t)·Cfix/(y − R(1 + t)); null when the denominator ≤ 0. Without rent the old formulas are untouched. Matches the 'preco' lever of the target analysis.
- Início no longer crashes with an unusable dollar/CBOT (matrix and meta analyses become null; sections show "—" or a neutral line); a top-level ErrorBoundary wraps the routed page.
- Test timeout: no global `testTimeout`; the whole-page axe/keyboard test files set `vi.setConfig({ testTimeout: 15000 })` at the top (a11y, keyboard, Simulador, Comercializacao.redesign, Inicio, inicio/unusableMarket).
- Photos of the Início: from Unsplash (Unsplash License assumed); the licence and origin must be verified photo by photo (public/photos/LICENCAS.md) before any public use.
