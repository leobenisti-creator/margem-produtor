# Task 12 report: README and final verification

Commit: dc67cc4 `docs: readme and final verification` (README.md, package.json `preview` script, neutral test titles in src/engine/calc.test.ts). Local only.

## 1. Commands
- `npm test`: 29 files, 345 tests passed (27 s). After the test-title rename, calc.test.ts re-run: 23 passed.
- `npm run lint` (tsc --noEmit): clean, no output.
- `npm run build`: 66 modules, no warnings.
  - dist/index.html 0.70 kB (gzip 0.40)
  - CSS 20.30 kB (gzip 5.27)
  - JS 302.04 kB (**gzip 92.84 kB**, limit 300 kB gzip: OK by a wide margin)
- package.json had no `preview` script (brief and README need it): added `"preview": "vite preview"`.

## 2. Walk-through (built-in browser, `vite preview` on :4173, killed afterwards; no listener left on 4173)
Desktop 1280x900, localStorage cleared first.
1. Opens calculated, Simulador: KPIs Margem R$ 19,42/sc (16% da receita), Preço na fazenda R$ 125,11, Custo R$ 105,69 (R$ 6.383,44/ha), Margem total R$ 1,17 mi (1.000 ha x 60,40 sc/ha = 60.400 sc). Waterfall: ref R$ 157,98, frete -27,68, taxas -5,20, fazenda 125,11, custo -105,69, margem 19,42. Meta: none ("Sem meta: o app mostra só a margem final").
2. Tour (1 de 3, "Cultura e região") shown once. Pular -> reload: no dialog, localStorage `margem:v1` has `tourSeen:true`. Also on mobile: completing all 3 steps then reload -> no tour.
3. Custo "Por categoria": 8 rows with ref (Fertilizantes ref R$ 2.150,85...), total R$ 6.383,44/ha. Typed 3000 in Fertilizantes: after blur shows "3.000", total R$ 7.232,59 (= 6383,44 - 2150,85 + 3000), cost/sc R$ 119,74, margem R$ 5,36 (4,3%): matches by hand.
4. Dólar via pencil in ticker, typed 5,60 + Enter: ticker "5,6000 manual"; ref = 13,0295 x 2,20462 x 5,60 = 160,86, fazenda R$ 127,98, margem R$ 8,24 (6,4%), total R$ 497,7 mil: matches.
5. Comercialização: Cenário atual R$ 127,98/sc margem 6,4% dólar 5,60; best cell R$ 150,05 (20%, R$ 1.830,46/ha), worst R$ 101,93 (-17%), 9 de 25 negativas; grid centered on market today (dólar 4,9998..5,9998, CBOT 1.161,25..1.321,25), "hoje" cell 125,11 / 4,3%; legend negativa/0-5/5-10/10-20/20-30/acima de 30%; "Plano de venda por faixas" present; "em breve" shortcuts.
6. Click cell CBOT 1.321,25 x dólar 5,9998: Cenário atual R$ 150,05, margem 20%; "Cenário personalizado ativo"; ticker shows CBOT and dólar "manual". "Voltar ao mercado de hoje": back to R$ 125,11, 4,3%, 1.241,25 / 5,4998, manual tags gone.
7. R$ -> US$: margem US$ 0,97, fazenda US$ 22,75, custo US$ 21,77 (US$ 1.315,06/ha), total US$ 58,9 mil (= R$ / 5,4998). sc/ha -> t/ha: produtividade 3,62 t/ha (60,4 x 0,06 = 3,624). Milho: CBOT 455,00, B3 CCM R$ 66,89, base 98,50, yield default 100 sc/ha with "Sem média regional de produtividade para milho — digite a sua", cost ref "IMEA milho safra 24/25 (12/2024)", fazenda US$ 7,10 (= R$ 39,05), margem 2,3%. Back to soja/R$/sc-ha: OK.
8. Meta on: "Meta de margem (%)" field, "Preço mínimo p/ meta 15% R$ 124,34" (= 105,69/0,85), hero "16% da receita · meta 15% ✓". Off: all of it gone, back to "Exposição e equilíbrio".
9. "Como calculamos" on KPI Margem: drawer with steps (125,11 - 105,69 = 19,42; sobre receita 16%; sobre custo 18%); Esc closes.
10. Input parsing: typed `4200` in Área -> 4.200 ha (margem total R$ 4,93 mi); typed `4.200,50` in Custo/ha -> 4.200,5, custo/sc R$ 69,54 (= 4200,5/60,4). No cents mask.
Mobile 375x812: no horizontal page scroll (scrollWidth 375), tour as bottom sheet, summary bar "MARGEM BRUTA / SACA R$ 19,42 | Ver resultado" (52 px) opens "Resultado" sheet, bottom nav Simulador/Comercialização (48 px), matrix scrolls inside its container (509 vs 318), footer present on Comercialização.

## 3. Anti-goals (spec §2)
- No `AUTO` / `ao vivo`: case-sensitive grep over src/ and dist/: only src/ui/Ticker.test.tsx (the test asserting their absence). Type `DataKind` still contains `'ao_vivo'` (src/data/types.ts:3, a provider-contract value; a test asserts no seed quote uses it).
- Competitor names (Open Hedge, Hedge Agro, Pro Market, Agrinvest, hedgeagro): found only as three test titles in src/engine/calc.test.ts (lines 37, 54, 60); renamed to "case A/B (spec §7)" in this commit. Now 0 hits in src/, dist/, index.html, README.
- Legal footer: exact sentence in src/ui/Footer.tsx:4, rendered by AppShell.tsx:20 on every route; seen live on Comercialização (mobile) and Simulador.
- No cents mask: verified live (4200 and 4.200,50).
- Fixed prices labelled: live ticker caption "Fechamento 26/10/2026 · Yahoo Finance (não oficial), BCB, B3"; base chip "base de 21/10" (honest asOf, ruling R8).
- No wheat: grep -i trigo/wheat in src/ and dist/: only test code (reference.test.ts:62-65 asserts absence; persist.test.ts:81 uses 'trigo' as an invalid saved crop). README says "Trigo fora do MVP".
- No 27/10 data: grep `2026-10-27|27/10`: only descriptive notes in the two JSON files ("a linha de 27/10 está incompleta e nunca é usada"; "atualização de 27/10/2026" = source folder name) and tests asserting absence. No 27/10 value in the seed.

## 4. Number cross-check (default state: soja, Centro-Sul, seed 26/10)
Engine (scratch test, deleted) vs hand vs page:
- Inputs: CBOT 1241,25; base 61,7; PTAX 5,4998; yield 60,4; cost R$ 6.383,44/ha; freight 27,6762 R$/sc; fees 5,20.
- Reference price: (12,4125 + 0,617) x 2,20462 x 5,4998 = 157,9823 ; engine 157,98228 ; page R$ 157,98. OK
- Farm price: 157,9823 - 27,6762 - 5,20 = 125,1061 ; engine 125,10608 ; page R$ 125,11. OK
- Cost/sc: 6383,44 / 60,4 = 105,6861 ; engine 105,68609 ; page R$ 105,69. OK
- Margem/sc: 19,4200 ; engine 19,41999 ; page R$ 19,42. OK
- Margem %: 15,52% ; page "16% da receita". (rounded to integer; see finding M1)
- Margem/ha 1.172,97 ; total R$ 1.172.967,51 ; page "R$ 1,17 mi". OK
- Break-even: price 105,69 ; yield 51,02 sc/ha ; page identical. OK
No discrepancy. Also verified after edits (steps 3, 4, 8, 10) by hand, all consistent.

## 5. Findings
Critical: none.

Important
- I1. Result updates on blur/Enter, not per keystroke. src/ui/NumberField.tsx:104-107 (`onChange` only sets local text; `commit` on blur/Enter). Observed: typing 3000 in a cost field left the KPIs unchanged until Tab. Spec §2 goal: "a conta roda no navegador a cada tecla". Suggest: commit valid parses on change (keep the invalid-message-on-blur behaviour), or document as intended. Not fixed (behavioural, touches tested logic).
- I2. Milho opening result is far from the market comparison shown beside it: farm price R$ 39,05/sc (US$ 7,10) vs "B3 CCM R$ 66,89" and "Cepea R$ 64,24" on the same card. Cause: CBOT parity with the soja freight default (R$ 27,68/sc, IMEA MT->Paranaguá for soja) + R$ 5,20 fees, and base 98,5. Per spec §7 B3/Cepea are comparison only, but the gap will confuse a user; and the milho margin (2,3%) hangs on placeholder values. Needs the data owner (freight for milho, base confirmation).
- I3. Basis for soja (61,7 USc/bu, 21/10) is a digitised chart point that fell from 127,7 the week before; flagged "a confirmar" (ledger). It drives the 15,5% opening margin. README documents it; needs data-owner validation.

Minor
- M1. Margem % shows integer when >= 10% ("16% da receita" for 15,52%; same in the drawer "16%"/"18%", matrix "11%"). Elsewhere <10% gets one decimal. Rounding 15,5 -> 16 next to a 15% target can mislead; src/ui/format.ts (percent formatter). Suggest one decimal throughout.
- M2. Ticker caption "Fechamento 26/10/2026 · fontes" is clipped at 1280 px (ticker is `overflow-x-auto`, src/ui/Ticker.tsx:48/90); the date/source needs a horizontal scroll to read in full at that width. Suggest wrapping the caption to a second line or truncating the source list with a title.
- M3. t/ha mode: yield suggestion line stays in sc/ha ("Média de Centro-Sul: 60,40 sc/ha · usar") while the field shows t/ha (already deferred in T8). US$ mode: comparison line mixes "B3 SJC US$ 27,36/sc" and "Cepea R$ 155,55" (deferred T8).
- M4. "Cenário atual" shows dólar with 2 decimals (6,00 for 5,9998; 5,50 for 5,4998) while ticker shows 4 (deferred T10).
- M5. Switching crop resets edited cost/yield (ruling R10, by design): a user who types a cost, flips to milho and back loses it. Worth a hint or keeping per-crop edits.
- M6. Seed/reference JSON `note` fields mention "27/10" (source-folder name, and "linha de 27/10 incompleta"). Not shown in the UI, harmless, but a grep for 27/10 is not empty.
- M7. `DataKind` still includes `'ao_vivo'` (needed for the future API provider; no UI uses it).

Other deferred minors from the ledger remain open (T13 scope).

## 6. Changes made (trivial)
- README.md (new, Portuguese): what it is, run commands, folder map, how to regenerate seed/reference (scripts read `SRC` = `dados\atualizacao_2026-10-27`, constant at top of both scripts, stdlib only), API provider swap paragraph (`provider` prop of `StoreProvider` in src/App.tsx), data caveats, "trigo fora do MVP", legal footer.
- package.json: `preview` script.
- src/engine/calc.test.ts: three test titles renamed (competitor names removed from src/).
