# App de margem do produtor (soja e milho) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static React site where a soy or corn producer types farm data on one screen, sees margin per sack/hectare/total, and tests a dollar × CBOT price matrix, using fixed 26/10/2026 closing prices behind a swappable data provider.

**Architecture:** A pure TypeScript calculation engine (no UI, fully unit-tested) feeds two React pages (Simulador, Comercialização). Market data comes only through a `MarketDataProvider` interface; today's implementation reads a JSON seed, tomorrow's will call Hedgepoint's API without touching pages. State lives in one reducer store, persisted to `localStorage` defensively.

**Tech Stack:** React 18, TypeScript (strict), Vite, Tailwind CSS, Vitest + React Testing Library, Python 3 only for one-off data-build scripts.

**Spec:** `docs/superpowers/specs/2026-10-27-app-margem-produtor-design.md` (read it first; section numbers below refer to it). Project root: `margem-produtor`.

## Global Constraints

- Crops: **soja and milho only.** No wheat anywhere in UI, types or data (spec §3).
- Bushels per 60 kg sack: soja **2.20462**, milho **2.36218**; 1 sc = **0.06 t** (spec §7).
- Price source for all calcs is CBOT parity: `(cbotUsc/100 + basisUsc/100) × bushels × fx`; B3 SJC/CCM and Cepea are **comparison displays only** (spec §7).
- Cost, freight and port fees are stored **in R$**; US$ mode converts at the PTAX typed-at moment, then the R$ value is fixed (spec §7).
- Margin default: **over revenue**; switch to over cost. Matrix margin is blended with sold share when the switch "considerar já vendido" is on (default on if sold % > 0).
- Seed data = **26/10/2026 only** (CBOT soja 1241.25, CBOT milho 455.0, PTAX 5.4998, B3 SJC 27.3644 US$/sc, B3 CCM 66.89 R$/sc, Cepea soja 155.55, Cepea milho 64.24). **Never use 27/10 rows.** UI label is "Fechamento 26/10/2026 · fonte"; never "AUTO"/"ao vivo" (spec §2).
- Footer on every screen, verbatim: `Material educacional e indicativo. Não constitui recomendação.`
- Language: pt-BR only. Decimal input accepts both `4.200,50` and `4200.5`; never a cents mask.
- `localStorage`/`sessionStorage` access is always inside try/catch; app must render with it blocked.
- Palette tokens (provisional): `#0B3D2E`, `#12634A`, `#2BD9A0`, `#D1AE6C`, bg `#F2F5F3`. Font Inter. Touch targets ≥ 44 px, contrast AA, matrix cells always print numbers.
- No Open Hedge / Pro Market names, logos, copy or photos anywhere. App working name: "Margem".
- Commits are local only, never pushed. End each commit message with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Productivity or area empty/0 → no `NaN`/`Infinity`; results show "—" (Task 3 test, Task 8 test).
2. Target margin ≥ 100% over revenue → minimum price is unreachable; show "inatingível", not a negative/Infinity price (Task 3).
3. `localStorage` throws or holds corrupt JSON → app loads with defaults and no crash (Task 6).
4. Sold % outside 0–100, dollar edited to 0 or negative → rejected with inline message, previous valid value kept (Task 6, Task 7).
5. Matrix steps that push CBOT rows ≤ 0 or step = 0 → rows dropped / step rejected, grid never shows negative prices (Task 4).

---

### Task 1: Project scaffold and design tokens

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles/tokens.css`, `src/styles/index.css`, `.gitignore`
- Test: `src/App.test.tsx`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `test` (vitest run), `lint` (tsc --noEmit); CSS variables `--g9 --g8 --g7 --g5 --mint --gold --bg --card --line --tx --mut` from the Global Constraints palette and mirrored in `tailwind.config.ts` as color names of the same names.

- [ ] **Step 1: Write the failing test** `renders the legal footer` in `src/App.test.tsx`: render `<App/>`, expect text `Material educacional e indicativo. Não constitui recomendação.` in the document.
- [ ] **Step 2:** `git init` in the project root; create the Vite React-TS project files by hand (no template generator that overwrites `docs/`); install `react react-dom` and dev deps `typescript vite @vitejs/plugin-react tailwindcss postcss autoprefixer vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event`. Vitest env = jsdom with a setup file importing `@testing-library/jest-dom`.
- [ ] **Step 3:** Run `npm test`. Expected: the footer test FAILS (App not implemented).
- [ ] **Step 4:** Implement `App` rendering a placeholder shell and the footer; load Inter from Google Fonts in `index.html`; define tokens in `tokens.css`.
- [ ] **Step 5:** Run `npm test && npm run lint && npm run build`. Expected: all pass, `dist/` produced.
- [ ] **Step 6: Commit** `chore: scaffold vite react ts app with tokens` (add `.superpowers/` and `dist/` to `.gitignore`).

### Task 2: Engine units and crop config

**Files:**
- Create: `src/engine/crops.ts`, `src/engine/units.ts`
- Test: `src/engine/units.test.ts`

**Interfaces:**
- Produces:
  - `type CropId = 'soja' | 'milho'`
  - `interface CropConfig { id: CropId; label: string; bushelsPerSack: number; color: string }` and `CROPS: Record<CropId, CropConfig>` (soja 2.20462 color `#12634A`; milho 2.36218 color `#D1AE6C`)
  - `SACK_TON = 0.06`
  - `parseDecimalPtBr(raw: string): number | null` (accepts `4.200,50`, `4200,5`, `4200.5`, `4.200`; returns null for empty text, letters, or more than one decimal separator of the same kind such as `1,2,3`)
  - `brlToUsd(brl: number, fx: number): number`, `usdToBrl(usd: number, fx: number): number` (throw `RangeError` if `fx <= 0`)
  - `scHaToTHa(sc: number): number`, `tHaToScHa(t: number): number`
  - `freightPerTonToPerSc(brlPerTon: number): number`

- [ ] **Step 1: Write failing tests** `parses pt-BR thousands and comma decimal` (`'4.200,50'`→4200.5), `parses plain dot decimal` (`'4200.5'`→4200.5), `parses comma only` (`'4200,5'`→4200.5), `returns null for empty and text` (`''`,`'abc'`,`'1,2,3'`), `converts sc/ha to t/ha` (60→3.6), `freight 3 R$/t is 0.18 R$/sc`, `usd conversion rejects fx 0`, `CROPS factors are 2.20462 and 2.36218`.
- [ ] **Step 2:** Run `npx vitest run src/engine/units.test.ts`; Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement both files with the signatures above. Rule for `parseDecimalPtBr`: if both `.` and `,` present, the last one is the decimal separator; if only `,`, it is decimal; if only `.`, treat as decimal when followed by 1–2 digits at the end, otherwise as thousands separator.
- [ ] **Step 4:** Run the same command; Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): units, crop config, pt-BR decimal parsing`.

### Task 3: Engine core calculations

**Files:**
- Create: `src/engine/calc.ts`
- Test: `src/engine/calc.test.ts`

**Interfaces:**
- Consumes: `CropConfig`, `SACK_TON` from Task 2.
- Produces:
  - `interface Scenario { cbotUsc: number; basisUsc: number; fx: number }`
  - `interface FarmInputs { areaHa: number; yieldScHa: number; costPerHaBrl: number; freightBrlPerSc: number; portFeesBrlPerSc: number; soldPct: number /*0..1*/; soldAvgPriceBrl: number; targetMargin: number /*0..1*/; marginBase: 'receita' | 'custo' }`
  - `referencePriceBrl(crop: CropConfig, s: Scenario): number`
  - `farmPriceBrl(crop: CropConfig, s: Scenario, i: FarmInputs): number`
  - `marginFromPrice(priceBrl: number, i: FarmInputs): MarginResult` where `MarginResult { costPerSc: number|null; marginPerSc: number|null; marginPct: number|null; marginPerHa: number|null; marginTotal: number|null; productionSc: number|null; soldSc: number|null; exposureSc: number|null }` (null when `yieldScHa <= 0` or the denominator is 0)
  - `minPriceForTarget(i: FarmInputs): number | null` (null = "inatingível" or no yield)
  - `breakEven(priceBrl: number, i: FarmInputs): { priceBrl: number|null; yieldScHa: number|null }`
  - `blendedPriceBrl(todayPriceBrl: number, i: FarmInputs): number`
  - `computeResult(crop, s, i): Result` combining the above plus `steps: ExplainStep[]` where `ExplainStep { label: string; formula: string; value: number; unit: 'R$/sc'|'US$/bu'|'%'|'R$/ha' }` listing, in order: base+CBOT in US$/bu, reference price, minus freight, minus port fees, farm price, cost per sack, margin per sack (the drawer in Task 9 renders these).

- [ ] **Step 1: Write failing tests** (values are exact from the spec):
  - `open hedge case`: `marginFromPrice(120, {areaHa:1200, yieldScHa:65, costPerHaBrl:3200, soldPct:0.3, targetMargin:0.15, marginBase:'custo', …})` → `productionSc 78000`, `soldSc 23400`, `exposureSc 54600`, `marginPct` ≈ 1.4375 (toBeCloseTo 4 digits), `costPerSc` ≈ 49.2308.
  - `pro market parity without basis`: `referencePriceBrl(soja, {cbotUsc:1298.25, basisUsc:0, fx:5.383})` toBeCloseTo 154.07 (2 digits).
  - `pro market reference with basis`: basis −175 → toBeCloseTo 133.30 (1 digit; spec's 133.27 uses a live quote).
  - `farm price subtracts freight and fees`: reference 154.07, freight 0.18, fees 2.6 → 151.29.
  - `margin over revenue vs over cost`: price 116.7, cost/sc 70 → 0.4003 vs 0.6671 (4 digits).
  - `min price for target`: cost/sc 70, target 0.35 receita → 107.69; custo → 94.5.
  - `unreachable target`: target 1.0 receita → `null`.
  - `break-even`: costPerHa 4200, price 116.7 → yield 35.99 sc/ha; price = 70 at yield 60.
  - `blended`: sold 0.3 @118, today 116.7 → 117.11.
  - `zero yield gives nulls not NaN`: yield 0 → every MarginResult field null, `minPriceForTarget` null.
  - `milho uses 2.36218`: `referencePriceBrl(milho,{cbotUsc:455,basisUsc:0,fx:5.4998})` toBeCloseTo 59.10 (2 digits).
- [ ] **Step 2:** `npx vitest run src/engine/calc.test.ts`; Expected: FAIL.
- [ ] **Step 3:** Implement per spec §7. Formulas: costPerSc = costPerHa/yield; marginPerSc = price − costPerSc; marginPct over receita = marginPerSc/price, over custo = marginPerSc/costPerSc; min price receita = costPerSc/(1−t) (null if t ≥ 1), custo = costPerSc×(1+t); break-even yield = costPerHa/price.
- [ ] **Step 4:** Run; Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): core margin calculations with spec test cases`.

### Task 4: Engine price matrix

**Files:**
- Create: `src/engine/matrix.ts`
- Test: `src/engine/matrix.test.ts`

**Interfaces:**
- Consumes: Task 3 types and `farmPriceBrl`, `marginFromPrice`, `blendedPriceBrl`.
- Produces:
  - `interface MatrixOptions { cbotStepUsc: number; fxStep: number; size: 5|7|9; includeSold: boolean }`
  - `interface Cell { cbotUsc: number; fx: number; priceBrl: number; marginPerSc: number|null; marginPct: number|null; marginPerHa: number|null; marginTotal: number|null; tone: 0|1|2|3|4|5 }`
  - `interface Matrix { cbotRows: number[]; fxCols: number[]; cells: Cell[][]; current: { row: number; col: number } }`
  - `buildMatrix(crop: CropConfig, base: Scenario, i: FarmInputs, o: MatrixOptions): Matrix` — throws `RangeError` when a step ≤ 0; drops rows whose CBOT ≤ 0 (`current` re-indexed); `tone = clamp(2 + round((marginPct − targetMargin)/0.03), 0, 5)`, tone 0 when margin is null or negative.
  - `matrixToCsv(m: Matrix, view: 'preco'|'margemHa'|'margemTotal'|'margemPct'): string` (`;` separator, pt-BR decimal comma).

- [ ] **Step 1: Write failing tests:** `center cell equals today's farm price`; `5x5 has 5 rows and 5 cols with current at 2,2`; `price rises with cbot rows and with fx cols`; `rows with cbot <= 0 are dropped` (base 100, step 60, size 5); `step 0 throws RangeError`; `includeSold blends margin only, never price` (same priceBrl, different marginPct when soldPct 0.3 and sold price differs); `tone is 2 near target and 5 far above`; `csv has header row and comma decimals`.
- [ ] **Step 2:** `npx vitest run src/engine/matrix.test.ts`; Expected: FAIL.
- [ ] **Step 3:** Implement. Rows ascending by CBOT top to bottom, columns ascending by dollar left to right (spec §6).
- [ ] **Step 4:** Run; Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): dollar x cbot matrix with tones and csv`.

### Task 5: Market data provider and seed

**Files:**
- Create: `scripts/build_seed.py`, `scripts/build_reference.py`, `src/data/types.ts`, `src/data/staticProvider.ts`, `src/data/seed-2026-10-26.json`, `src/data/reference-mt.json`
- Test: `src/data/staticProvider.test.ts`, `src/data/reference.test.ts`

**Interfaces:**
- Produces:
  - `type DataKind = 'fechamento' | 'ao_vivo' | 'manual'`
  - `interface Quote { value: number; unit: string; asOf: string /*ISO date*/; source: string; kind: DataKind }`
  - `interface MarketSnapshot { cbotUsc: Record<CropId, Quote>; fx: Quote; b3: Record<CropId, Quote>; cepea: Record<CropId, Quote>; basisUsc: Record<CropId, Quote> }`
  - `interface MarketDataProvider { getSnapshot(): Promise<MarketSnapshot> }` and `export const staticProvider: MarketDataProvider`
  - `interface Region { id: string; label: string; costBrlHa?: Record<CostCategoryId, number>; yieldScHa?: number; freightBrlTon?: number }`; `REGIONS: Region[]` from `reference-mt.json` plus `{id:'paranagua', label:'Paranaguá (PR)'}` and `{id:'outra', label:'Outra região (digitar)'}`
  - `type CostCategoryId = 'sementes'|'fertilizantes'|'defensivos'|'operacoes'|'maoDeObra'|'arrendamento'|'financeiro'|'outros'`

- [ ] **Step 1: Write failing tests:** `seed has 26/10 closing values` (CBOT soja 1241.25, milho 455, fx 5.4998, SJC 27.3644, CCM 66.89, Cepea soja 155.55, milho 64.24); `every quote has asOf 2026-10-26 and kind fechamento`; `no quote carries kind ao_vivo`; `regions include outra and paranagua with no cost reference`; `each MT region cost categories sum within 0.5% of the IMEA total for that region`; `no value in the seed is dated 2026-10-27`.
- [ ] **Step 2:** Run `npx vitest run src/data`; Expected: FAIL.
- [ ] **Step 3: `scripts/build_seed.py`:** read `dados\atualizacao_2026-10-27\09b_precos_26_27_out.csv`, keep only the row `data == 2026-10-26`, write `seed-2026-10-26.json`. For basis, read `34_basis_por_praca.csv`: take the latest 2026 point for praça Paranaguá for soja and milho (column `basis_c_bu`, USc/bu). **Inspect the rows first and write the unit/sign you find in a `// note` field of the JSON**; if the value looks like an interior basis or the sign is ambiguous, still store it but mark `source` with "a confirmar" and tell the user in the task report.
- [ ] **Step 4: `scripts/build_reference.py`:** from `16b_imea_custo_producao_mt_longo.csv` (latest safra and latest month per region), `33_imea_produtividade_mt_historico.csv`, `36b_imea_frete_mt.csv` (latest freight per origin region to the port destination found in the file); map IMEA items to the 8 `CostCategoryId` values with a mapping table in the script, unmapped items go to `outros`; write `reference-mt.json`.
- [ ] **Step 5:** Run `python scripts/build_seed.py && python scripts/build_reference.py`, then `npx vitest run src/data`; Expected: PASS.
- [ ] **Step 6: Commit** `feat(data): market data provider interface, 26/10 seed, MT reference` (commit the scripts and JSON; the CSVs are not copied into the repo).

### Task 6: App state, persistence and cost distribution

**Files:**
- Create: `src/state/types.ts`, `src/state/reducer.ts`, `src/state/persist.ts`, `src/state/StoreProvider.tsx`, `src/state/costs.ts`
- Test: `src/state/reducer.test.ts`, `src/state/persist.test.ts`, `src/state/costs.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3, 5 types.
- Produces:
  - `interface AppState { crop: CropId; regionId: string; currency: 'BRL'|'USD'; areaUnit: 'scHa'|'tHa'; marginBase: 'receita'|'custo'; inputs: FarmInputs; costMode: 'total'|'categorias'; costCategories: Record<CostCategoryId, number>; overrides: Partial<{ cbotUsc: number; basisUsc: number; fx: number }>; matrix: MatrixOptions; includeSold: boolean; tourSeen: boolean }`
  - `type Action` (discriminated union; includes `{type:'setCrop'}`, `{type:'setRegion'}`, `{type:'setInput', key, value}`, `{type:'setCostMode', mode}`, `{type:'setCategory', id, value}`, `{type:'override', key, value|null}`, `{type:'applyScenario', cbotUsc, fx}`, `{type:'resetScenario'}`, `{type:'setMatrix', patch}`, `{type:'tourDone'}`)
  - `reducer(state: AppState, a: Action): AppState`; `initialState(snapshot: MarketSnapshot): AppState` (soja, region first MT region, example area 1000 ha, yield from region reference or 60, cost from reference)
  - `loadState(): Partial<AppState> | null` and `saveState(s: AppState): void` — key `margem:v1`, both fully try/catch'd, `loadState` returns null on throw, invalid JSON or wrong shape
  - `distributeTotal(total: number, ref: Record<CostCategoryId, number> | undefined): Record<CostCategoryId, number>` (proportional to ref; without ref everything goes to `outros`) and `sumCategories(c): number`
  - `StoreProvider`, `useStore(): { state: AppState; dispatch: Dispatch<Action>; snapshot: MarketSnapshot; scenario: Scenario }` where `scenario` = snapshot values with `overrides` applied.

- [ ] **Step 1: Write failing tests:** `distributeTotal keeps the sum` (4200 with reference → sums to 4200); `distributeTotal without reference puts all in outros`; `switching to categorias then back keeps the total`; `soldPct above 1 or below 0 is rejected and state unchanged`; `override fx 0 or negative is rejected`; `override null clears it`; `applyScenario sets overrides and resetScenario clears them`; `loadState returns null when localStorage.getItem throws`; `loadState returns null for corrupt JSON`; `saveState swallows setItem errors`; `changing region updates reference yield and cost only when the user has not edited them`.
- [ ] **Step 2:** `npx vitest run src/state`; Expected: FAIL.
- [ ] **Step 3:** Implement. Persist only user-entered fields (not the market snapshot). Debounce saving in the provider by 300 ms.
- [ ] **Step 4:** Run; Expected: PASS.
- [ ] **Step 5: Commit** `feat(state): reducer, safe persistence, cost distribution`.

### Task 7: Application shell, top bar and ticker

**Files:**
- Create: `src/ui/AppShell.tsx`, `src/ui/Sidebar.tsx`, `src/ui/BottomNav.tsx`, `src/ui/TopBar.tsx`, `src/ui/Segmented.tsx`, `src/ui/Ticker.tsx`, `src/ui/EditableValue.tsx`, `src/ui/Footer.tsx`, `src/ui/format.ts`
- Modify: `src/App.tsx` (wrap with `StoreProvider`, hash routing between `#/simulador` and `#/comercializacao`, default `#/simulador`)
- Test: `src/ui/TopBar.test.tsx`, `src/ui/Ticker.test.tsx`, `src/ui/format.test.ts`

**Interfaces:**
- Produces:
  - `format.ts`: `fmtBrl(n: number|null): string` (`R$ 1.234,56`, `—` for null), `fmtUsd`, `fmtPct(n: number|null, digits=0)`, `fmtNum(n, digits)`, `fmtMoney(n, currency: 'BRL'|'USD')`; all pt-BR.
  - `Segmented<T extends string>({ value, options: {value:T; label:string}[], onChange, ariaLabel })`
  - `EditableValue({ label, value, unit, kind: DataKind, onCommit(v: number|null), validate?(v:number): string|null })` — pencil button opens inline input; Esc cancels; invalid shows message and keeps the old value; committed edit shows badge "manual".
  - Sidebar items: Simulador, Comercialização (active links) and Cenários, Insumos (adubo), Hedge · Opções, Alertas, Salvos & histórico, Relatórios (disabled, tagged "em breve", `aria-disabled`).

- [ ] **Step 1: Write failing tests:** `TopBar toggles currency and dispatches` (click "US$"); `crop selector shows only Soja and Milho`; `Ticker shows "Fechamento 26/10/2026" and never the text AUTO`; `editing fx to 0 shows an inline error and keeps 5,4998`; `editing fx to 5,6 shows the manual badge`; `disabled sidebar items are not links`; `fmtBrl formats 1234.5 as "R$ 1.234,50" and null as "—"`.
- [ ] **Step 2:** `npx vitest run src/ui`; Expected: FAIL.
- [ ] **Step 3:** Implement the shell per spec §4 and the approved mockup layout (dark-green sidebar 208 px, white top bar, dark ticker strip). At < 768 px the sidebar hides and `BottomNav` shows the two active destinations; top-bar controls wrap into a horizontally scrollable row.
- [ ] **Step 4:** Run; Expected: PASS. Then `npm run dev` and look at the shell at 1280 px and 375 px in the browser; fix overflow.
- [ ] **Step 5: Commit** `feat(ui): shell, top bar toggles, ticker with editable quotes`.

### Task 8: Simulador page

**Files:**
- Create: `src/pages/Simulador.tsx`, `src/ui/KpiRow.tsx`, `src/ui/LavouraCard.tsx`, `src/ui/CustoCard.tsx`, `src/ui/ComercializacaoCard.tsx`, `src/ui/ResultPanel.tsx`, `src/ui/Waterfall.tsx`, `src/ui/NumberField.tsx`, `src/ui/useResult.ts`
- Test: `src/pages/Simulador.test.tsx`

**Interfaces:**
- Consumes: `useStore`, `computeResult`, `distributeTotal`, `format.ts`, `Segmented`.
- Produces:
  - `useResult(): { result: Result; displayCurrency: 'BRL'|'USD' }` — the single place that turns store state into engine inputs (cost per hectare = total or `sumCategories`; unit/currency conversion for display only).
  - `NumberField({ label, value, unit, onCommit, min?, max?, helper? })` uses `parseDecimalPtBr`, shows inline error text, never masks.
  - Components render per spec §5: KPI row (Margem bruta/saca as hero card, Preço na fazenda hoje, Custo por saca, Margem total), Cartão 1 Lavoura (região, área, produtividade with clickable regional suggestion), Cartão 2 Custo (Total | Por categoria, bars, "+ adicionar categoria", freight and port fees fields with visible default `R$ 5,20/sc` flagged "padrão do app"), Cartão 3 Comercialização, ResultPanel (waterfall, exposure bar, min price, break-even in price and yield, blended margin). B3 and Cepea comparison line sits under the price card ("B3 hoje: R$ 66,89 · Cepea: R$ …").

- [ ] **Step 1: Write failing tests** (RTL, with `StoreProvider` and the static seed): `opens already calculated with example data` (a margin value is visible without typing); `typing 4.200,50 in cost updates cost per sack`; `switching to Por categoria shows eight category rows summing to the total`; `empty productivity shows em dash and no NaN in the document`; `target 100% shows "inatingível" for minimum price`; `currency US$ shows US$ symbols on KPIs`; `margin base switch changes the hero percentage`; `sold 150 shows an inline error`; `milho selected shows the CCM comparison line`.
- [ ] **Step 2:** `npx vitest run src/pages/Simulador.test.tsx`; Expected: FAIL.
- [ ] **Step 3:** Implement. Waterfall is plain CSS bars (no chart library). Result panel is `position: sticky` on desktop; on < 1024 px it collapses to a fixed bottom summary bar (hero margin only) that opens the full panel in a sheet.
- [ ] **Step 4:** Run; Expected: PASS.
- [ ] **Step 5:** Browser check at 1280 px and 375 px against the approved mockup; fix visual gaps.
- [ ] **Step 6: Commit** `feat(ui): simulador page with cost modes and result panel`.

### Task 9: "Como calculamos" drawer and tour

**Files:**
- Create: `src/ui/ExplainDrawer.tsx`, `src/ui/Tour.tsx`, `src/ui/explain.ts`
- Modify: `src/ui/KpiRow.tsx`, `src/ui/ResultPanel.tsx`, `src/ui/AppShell.tsx` (mount drawer and tour)
- Test: `src/ui/ExplainDrawer.test.tsx`, `src/ui/Tour.test.tsx`

**Interfaces:**
- Consumes: `Result.steps` from Task 3.
- Produces: `useExplain(): { open(key: ExplainKey): void; close(): void }` with `ExplainKey = 'margem'|'precoFazenda'|'custo'|'margemTotal'|'precoMinimo'|'blendada'`; `explain.ts` maps each key to plain-Portuguese text plus the numeric steps with the live values. Tour: 3 steps (cultura e região; área e produtividade; custo), skippable.

- [ ] **Step 1: Write failing tests:** `clicking info on Preço na fazenda opens the drawer with the farm price formula and live numbers`; `Esc closes the drawer and returns focus to the trigger`; `tour appears on first visit`; `skipping the tour sets tourSeen and it does not reappear after remount`; `tour still works when localStorage is blocked (appears once per session)`.
- [ ] **Step 2:** Run `npx vitest run src/ui/ExplainDrawer.test.tsx src/ui/Tour.test.tsx`; Expected: FAIL.
- [ ] **Step 3:** Implement as a right-side drawer (bottom sheet on mobile) with focus trap; copy in simple pt-BR with no jargon beyond terms used on screen.
- [ ] **Step 4:** Run; Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): como calculamos drawer and skippable tour`.

### Task 10: Comercialização page

**Files:**
- Create: `src/pages/Comercializacao.tsx`, `src/ui/MatrixTable.tsx`, `src/ui/MatrixControls.tsx`, `src/ui/SalePlan.tsx`
- Test: `src/pages/Comercializacao.test.tsx`

**Interfaces:**
- Consumes: `buildMatrix`, `matrixToCsv`, store actions `setMatrix`, `applyScenario`, `resetScenario`.
- Produces: page per spec §6 — four KPI cards (cenário atual, melhor célula, pior célula, células abaixo da meta), view tabs (Preço R$/sc, Margem R$/ha, Margem total, Margem %), controls (CBOT step, dollar step, size 5/7/9, "considerar já vendido"), matrix with current cell outlined, legend, "Baixar matriz" (CSV via Blob), "em breve" shortcuts for options and alerts. `SalePlan`: table of up to 3 bands `{volumePct, targetPriceBrl}` showing weighted average price and margin; **first thing to cut if the task runs long** (spec §6).

- [ ] **Step 1: Write failing tests:** `renders 5x5 by default with dollar in columns and cbot in rows`; `clicking a cell applies that scenario and shows a "voltar ao mercado de hoje" action`; `return action restores the snapshot values`; `switching the tab changes the main number but keeps the same cell colors`; `size 9 renders 9 rows and 9 columns`; `cbot step 0 shows an inline error and keeps the grid`; `every cell prints a number`; `csv download builds a Blob whose first line is the header`; `includeSold off makes margins ignore the sold share`.
- [ ] **Step 2:** `npx vitest run src/pages/Comercializacao.test.tsx`; Expected: FAIL.
- [ ] **Step 3:** Implement. Tone → 6 sequential colors (red to green) from tokens; cells have `aria-label` with price and margin; the table scrolls horizontally on narrow screens with the row header sticky.
- [ ] **Step 4:** Run; Expected: PASS.
- [ ] **Step 5:** Browser check at 1280 px and 375 px against the approved mockup.
- [ ] **Step 6: Commit** `feat(ui): comercializacao page with dollar x cbot matrix`.

### Task 11: Responsive, accessibility and error-state pass

**Files:**
- Modify: files from Tasks 7–10 as needed; Create: `src/ui/EmptyState.tsx`
- Test: `src/a11y.test.tsx`

**Interfaces:**
- Produces: `EmptyState({ title, hint })` used when market data is missing ("Aguardando — digite o valor no lápis").

- [ ] **Step 1: Write failing tests:** with `jest-axe` installed, `simulador has no axe violations`, `comercializacao has no axe violations`; `all interactive controls are reachable by Tab in order`; `snapshot with missing fx quote shows the EmptyState and leaves inputs editable`; `layout renders without crashing when matchMedia is undefined`.
- [ ] **Step 2:** `npx vitest run src/a11y.test.tsx`; Expected: FAIL.
- [ ] **Step 3:** Fix findings: visible focus rings, ≥ 44 px targets, text contrast AA, `aria-live="polite"` on the result panel, no color-only meaning in the matrix, keyboard Esc on drawer/edit.
- [ ] **Step 4:** Run the whole suite `npm test`; Expected: PASS.
- [ ] **Step 5:** Browser pass with the built-in browser: widths 375, 768, 1280; light mode; check overflow, sticky behaviors, and that nothing reads "AUTO". Record issues fixed.
- [ ] **Step 6: Commit** `feat: a11y and responsive pass`.

### Task 12: Final verification

**Files:**
- Create: `README.md` (how to run, how to regenerate seed, how to swap in the API provider — one paragraph each)

- [ ] **Step 1:** Run `npm test && npm run lint && npm run build`; Expected: all green, build under 300 kB gzipped JS.
- [ ] **Step 2:** `npm run preview` and walk the spec §1 success path as a new visitor: Simulador opens calculated → change cost to categories → change dollar → open Comercialização → click a cell → return. Confirm Spec §2 anti-goals one by one (no AUTO label, no competitor names, legal footer on both screens, comma/dot input).
- [ ] **Step 3:** Verify with the seed: soja farm price reproduces `(12.4125 + basis) × 2.20462 × 5.4998 − freight − fees` by hand for the default region.
- [ ] **Step 4: Commit** `docs: readme and final verification`.

---

## Self-review (done)

- **Spec coverage:** §1 exigências 1–6 → Tasks 7, 8, 10; §2 anti-goals → Global Constraints and Tasks 7, 9, 12; §4 navegação/ticker/tour → 7, 9; §5 → 8; §6 → 10; §7 fórmulas e casos A/B → 3, 4; §8 dados → 5; §9 visual/a11y → 7, 11; §10 stack → 1; §11 fases ficam fora do plano (só "em breve" no menu).
- **Cut line if time is short:** `SalePlan` (Task 10), then the "+ adicionar categoria" button (Task 8).
- **Spec marks as builder's call, left open here on purpose:** component libraries, folder detail beyond the above, tour copy, default freight/fee values (R$ 5,20/sc is a placeholder flagged "padrão do app" on screen).
