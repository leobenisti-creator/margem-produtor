# Redesenho visual do app Margem: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar o visual preto e dourado da Hedgepoint, a página Início de 7 telas, o novo Simulador e a nova Comercialização, com custo detalhável, dólar por custo, matriz 9×9 em porcentagens, cores por meta e análise da meta, sem remover nada do que o app já faz.

**Architecture:** O motor (`src/engine`) continua puro e ganha três extensões compatíveis (dólar efetivo, matriz em %, análise da meta); o estado ganha itens de custo e persistência `margem:v2`; a UI troca de casca (menu no topo, rota Início) e ganha componentes novos. Cada tarefa entrega algo testável; as tarefas de motor vêm antes das de UI.

**Tech Stack:** Vite 8, React 19, TypeScript estrito, Tailwind 3, Vitest + Testing Library + jest-axe, Lucide, **motion (Framer Motion)** a adicionar.

**Spec:** `docs/superpowers/specs/2026-10-28-redesign-visual-app-design.md` (ler inteira antes de qualquer tarefa; mockups em `.superpowers/brainstorm/94625-1793183233/content/*.html` mostram o desenho aprovado).

## Global Constraints

- Nada do conteúdo atual pode sumir: campos, textos, funções e contas existentes continuam (regras de remoção só as da seção 8 da spec).
- Manter os nomes das variáveis CSS e das cores do Tailwind existentes (`--g9`, `--tone0`… usados por `tailwind.config.ts` e `src/styles/contrast.test.ts`); acrescentar novos, nunca renomear.
- Contraste de texto ≥ 4,5:1, foco visível, teclado completo, alvos ≥ 44 px no celular, `prefers-reduced-motion` respeitado em toda animação, cor nunca como única pista.
- TypeScript estrito sem `any`; `npm run lint` (tsc), `npm test` e `npm run build` passam ao fim de cada tarefa.
- Valores padrão: acento dourado `#e8b04a`; passos da matriz 2,5 · 5 · 10 · 20 (%); "margem boa" sem meta ≥ 10%; "perto da meta" = até 5 p.p. abaixo; botão principal "Descobrir minha margem →"; grupo "Fertilizantes" passa a "Adubação".
- Estado salvo: chave `margem:v2`; estado antigo ou inválido é descartado sem erro.
- Sem dado inventado: nenhum preço de adubo pré-preenchido; sem depoimentos nem estatísticas.
- Nenhum commit é feito sem o Leo pedir; trabalhar na árvore atual (branch `feat/redesign`, criada na Tarefa 0) e deixar o diff para revisão.
- `src/engine` só muda onde as tarefas 1 a 3 dizem; resultados com os campos novos nos valores neutros têm que ser idênticos aos de hoje.

**Ordem de execução (dependências):** 0 → 1 → 2 → 3 → **6** → **5** → **4** → 7 → 8 → 9 → 10 → 11 → 12. A Tarefa 4 usa os tipos da 6 e as médias da 5; a numeração segue a spec, não a ordem.

**Base da margem:** o app tem `marginBase: 'receita' | 'custo'`. Todas as cores, limites (10% / 5 p.p.), metas e análises usam a margem na base escolhida pelo cliente.

## Review Focus

- **Divisões por zero:** produtividade 0, área 0, preço na fazenda ≤ 0, meta ≥ 100% da receita: nenhum NaN/Infinity na tela, "—" no lugar (testado nas Tarefas 1, 3 e 9).
- **Modo US$ com dólar indisponível** e custo/venda em US$: campos desabilitados e nada convertido errado gravado (Tarefas 4 e 8).
- **Dólar 100% travado:** colunas da matriz iguais, aviso visível, sem erro (Tarefas 2 e 10).
- **`localStorage` antigo (`margem:v1`), vazio ou corrompido:** o app abre com o padrão (Tarefa 4).
- **Item sem média regional** (Inseticida de soja nas regiões): estado "média da região" indisponível, grupo ainda calcula (Tarefa 5).
- **Animação em testes e com movimento reduzido:** nenhum teste depende de animação terminar; conteúdo legível sem movimento (Tarefas 11 e 12).

---

### Task 0: Preparação e linha de base

**Files:** Modify `package.json`; criar a branch.

**Interfaces:** Produces: dependência `motion`; baseline registrada.

- [ ] **Step 1:** `git checkout -b feat/redesign` (o documento de design e este plano seguem na árvore, sem commit).
- [ ] **Step 2:** `npm install motion` e conferir que `import { motion } from 'motion/react'` compila num arquivo temporário (apagar depois).
- [ ] **Step 3:** Rodar `npm test`, `npm run lint`, `npm run build`. Registrar no relatório: nº de testes verdes (esperado 497, 0 falhas). Se algo já falhar, parar e reportar.

---

### Task 1: Motor: dólar efetivo, custo em US$ e dólar travado na venda

**Files:** Modify `src/engine/calc.ts`; Test `src/engine/calc.test.ts` (acrescentar).

**Interfaces:**
- Produces (em `calc.ts`):
  - `interface CostUsdLine { usdPerHa: number; boughtPct: number; boughtRate: number }` (`boughtPct` 0..1).
  - `FarmInputs` ganha `costUsd: CostUsdLine[]`, `fxLockPct: number` (0..1, fração do volume em aberto com dólar travado), `fxLockRate: number`.
  - `effectiveFx(lockPct: number, lockRate: number, fx: number): number` = `(1 − lockPct) × fx + lockPct × lockRate`.
  - `costPerHaAt(i: FarmInputs, fx: number): number` = `i.costPerHaBrl + Σ usdPerHa × effectiveFx(boughtPct, boughtRate, fx)`.
  - `inputsAt(i: FarmInputs, fx: number): FarmInputs` devolve `i` com `costPerHaBrl = costPerHaAt(i, fx)` e `costUsd = []`.
  - `farmPriceBrl` passa a usar `effectiveFx(i.fxLockPct, i.fxLockRate, s.fx)` no lugar de `s.fx`.
  - `computeResult` calcula custo/margem/equilíbrio com `inputsAt(i, s.fx)`; `ExplainStep`s mostram o dólar efetivo quando há trava.

- [ ] **Step 1: Write the failing tests** (nomes e asserts): `effectiveFx(0.6, 5.2, 5.4998)` ≈ 5.3199; `effectiveFx(0, 0, 5.4998)` = 5.4998; `effectiveFx(1, 5.2, 6)` = 5.2; `costPerHaAt` com `costPerHaBrl 5311` e linha `{195, 0.6, 5.2}` em fx 5.4998 ≈ 5311 + 195×5.31992 = 6348.38; `computeResult` com campos neutros (`costUsd: []`, `fxLockPct: 0`, `fxLockRate: 0`) devolve exatamente o mesmo `Result` que antes (reutilizar o caso Centro-Sul: custo 6383.44, 60.4 sc/ha, CBOT 1241.25, base 61.70, dólar 5.4998, frete 27.68, taxas 5.20 → `farmPriceBrl` ≈ 125.11, `marginPerSc` ≈ 19.42); venda com `fxLockPct 1, fxLockRate 5.2` e dólar de cenário 6: `farmPriceBrl` igual ao de dólar 5.2; produtividade 0 e `costUsd` presente: margem `null`, sem NaN.
- [ ] **Step 2:** Rodar `npx vitest run src/engine/calc.test.ts`; esperado: FAIL (funções não definidas).
- [ ] **Step 3:** Implementar as assinaturas acima em `calc.ts`; corrigir todo lugar que monta `FarmInputs` (reducer, testes, `src/test/helpers.ts`) com os campos neutros.
- [ ] **Step 4:** Rodar `npx vitest run` inteiro e `npm run lint`; esperado: tudo verde.

---

### Task 2: Motor: matriz 9×9 em porcentagens, cores de semáforo e seletor de produtividade

**Files:** Modify `src/engine/matrix.ts`; Test `src/engine/matrix.test.ts` (reescrever os testes de tamanho/passo/tons; manter os de CSV e de erro).

**Interfaces:**
- Consumes: `FarmInputs`, `inputsAt`, `farmPriceBrl`, `marginFromPrice` de `calc.ts` (Tarefa 1).
- Produces:
  - `export const DEFAULT_STEPS_PCT: readonly [2.5, 5, 10, 20]`.
  - `interface MatrixOptions { stepsPct: readonly [number, number, number, number]; yieldFactor: number; includeSold: boolean }` (`yieldFactor` 0.9 | 1 | 1.1).
  - `Cell.tone: 0 | 1 | 2` (0 vermelho, 1 amarelo, 2 verde); demais campos de `Cell` iguais.
  - `Matrix { cbotRows: number[]; cbotPct: number[]; fxCols: number[]; fxPct: number[]; cells: Cell[][]; current: { row: 4; col: 4 }; lockedAllFx: boolean }`.
  - `toneFor(marginPct: number | null, target: number | null, goodMin?: number, nearPp?: number): 0|1|2` com padrões `0.10` e `0.05`. Sem meta: `<0` → 0; `0 ≤ m < goodMin` → 1; `≥ goodMin` → 2. Com meta: `m ≥ target` → 2; `m ≥ target − nearPp` → 1; senão 0.
  - `buildMatrix(crop, base, i, o): Matrix` sempre 9×9; eixo = `valor × (1 + p/100)` com `p ∈ [−s4,−s3,−s2,−s1,0,s1,s2,s3,s4]`; cada coluna usa `inputsAt(i com yield×yieldFactor, fx da coluna)`; `lockedAllFx` é verdadeiro quando todas as colunas dão o mesmo preço e o mesmo custo.
  - `matrixToCsv(m, view)` agora escreve o valor e a % de cada eixo ("5,6373 (+2,5%)").
  - `okCount(m: Matrix, target: number | null): number`.

- [ ] **Step 1: Write the failing tests:** eixo do dólar de hoje 5,4998 com passos padrão: colunas ≈ `[4.3998, 4.9498, 5.2248, 5.3623, 5.4998, 5.6373, 5.7748, 6.0498, 6.5998]`; eixo CBOT 1241,25: `[993.00, 1117.13, 1179.19, 1210.22, 1241.25, 1272.28, 1303.31, 1365.38, 1489.50]` (arredondando a 2 casas); célula central = preço ≈ 125,11 e margem ≈ 15,5%; `toneFor(-0.01,null)=0`, `toneFor(0.05,null)=1`, `toneFor(0.10,null)=2`; com meta 0.20: `toneFor(0.20,0.20)=2`, `toneFor(0.15,0.20)=1`, `toneFor(0.149,0.20)=0`; `okCount` com meta 0.20 no caso Centro-Sul = 31 e com meta 0.10 = 51; `yieldFactor 0.9` baixa a margem central para ≈ 6,1% (meta de comparação: 15,5% base); matriz com `fxLockPct 1` → `lockedAllFx` verdadeiro e nenhuma exceção; passo ≤ 0 lança `RangeError`.
- [ ] **Step 2:** Rodar `npx vitest run src/engine/matrix.test.ts`; esperado: FAIL.
- [ ] **Step 3:** Implementar as assinaturas acima. Os tons antigos (0..5) e `ABSOLUTE_BOUNDS` saem; registrar no ledger a substituição de R26. (A UI quebra até as Tarefas 8 e 10: usar `// TODO` não é aceito; atualizar `MatrixTable`/`MatrixLegend`/`MatrixControls`/`MatrixKpis`/`SalePlan` o mínimo para compilar e manter testes verdes, os visuais finais vêm na Tarefa 10.)
- [ ] **Step 4:** `npx vitest run` e `npm run lint` verdes.

---

### Task 3: Motor: análise da meta

**Files:** Create `src/engine/targetAnalysis.ts`; Test `src/engine/targetAnalysis.test.ts`.

**Interfaces:**
- Consumes: `computeResult`, `FarmInputs`, `Scenario` (`calc.ts`), `Matrix`, `okCount`, `toneFor` (`matrix.ts`).
- Produces:
  - `type Lever = 'preco' | 'cbot' | 'dolar' | 'produtividade' | 'custo'`.
  - `interface LeverResult { lever: Lever; value: number | null; deltaPct: number | null; reachable: boolean }` (`value` na unidade natural: R$/sc, US¢/bu, R$/US$, sc/ha, R$/ha).
  - `interface StressRow { id: 'cbot-10' | 'dolar-10' | 'prod-10' | 'custo+10' | 'combo'; label: string; marginPct: number | null; status: 'meta' | 'perto' | 'longe' | 'prejuizo' }`.
  - `interface TargetAnalysis { status: 'abaixo' | 'acima' | 'na-meta'; gapPp: number | null; levers: LeverResult[]; cellsOk: number; cellsTotal: 81; nearest: { row: number; col: number } | null; stress: StressRow[] }`.
  - `analyzeTarget(crop: CropConfig, scenario: Scenario, i: FarmInputs, matrix: Matrix): TargetAnalysis | null` (null sem meta).
  - `solveLever(...)` interno: bisseção sobre `computeResult` (a margem é monótona), com limites de busca ±80%; `reachable=false` quando não há solução.
  - `nearest`: célula com `tone === 2` de menor soma `|cbotPct| + |fxPct|`; empate vence a de menor `|fxPct|`; null se nenhuma.

- [ ] **Step 1: Write the failing tests** no caso Centro-Sul (custo 6383.44/ha, 60.4 sc/ha, CBOT 1241.25, base 61.70, dólar 5.4998, frete+taxas 32.88, `marginBase: 'receita'`): meta 0.20 → `status 'abaixo'`, `gapPp ≈ 4.5`, preço ≈ 132.11, CBOT ≈ 1299, dólar ≈ 5.74, produtividade ≈ 63.8, custo ≈ 6045 (tolerância 1 unidade no último dígito mostrado), `cellsOk 31`, `nearest` = coluna do dólar +5% e linha CBOT 0%; meta 0.10 → `status 'acima'`, `gapPp ≈ 5.5`, preço ≈ 117.43, CBOT ≈ 1178, dólar ≈ 5.23, produtividade ≈ 56.7, custo ≈ 6801, `cellsOk 51` (30 abaixo); estresse com meta 0.10: CBOT −10% ≈ 4.0%, dólar −10% ≈ 3.3%, produtividade −10% ≈ 6.1%, custo +10% ≈ 7.1%, combo (CBOT −10%, dólar −5%, produtividade −5%) < 0 com `status 'prejuizo'`; `marginBase: 'custo'` resolve na própria base; meta 1.0 em base receita → alavancas `reachable false`, sem NaN; sem meta → `null`; com custo em US$ não comprado, a alavanca "dólar" difere do caso sem US$ e continua resolvendo.
- [ ] **Step 2:** Rodar `npx vitest run src/engine/targetAnalysis.test.ts`; esperado: FAIL.
- [ ] **Step 3:** Implementar conforme as assinaturas.
- [ ] **Step 4:** `npx vitest run` e `npm run lint` verdes.

---

### Task 4: Estado: itens de custo, moeda por custo, dólar travado, matriz e persistência v2

**Files:** Modify `src/data/types.ts`, `src/state/types.ts`, `src/state/reducer.ts`, `src/state/persist.ts`, `src/state/costs.ts`, `src/ui/useResult.ts`; Create `src/data/costItems.ts`; Test `src/state/*.test.ts`.

**Interfaces:**
- Produces (`src/data/costItems.ts`): `interface CostItemDef { id: string; group: CostCategoryId; label: string; imeaKeys: string[] }`; `COST_ITEMS: CostItemDef[]` com os itens da tabela da spec §6.1 (ids estáveis, ex.: `adubacao.corretivos`, `adubacao.macro`, `adubacao.micro`, `defensivos.herbicida`…); `itemsOf(group): CostItemDef[]`; `COST_GROUP_SECTIONS` (Insumos / Operação / Estrutura e financeiro). `COST_CATEGORY_LABELS.fertilizantes` passa a `'Adubação'` (id interno continua `fertilizantes`).
- Produces (`state/types.ts`):
  - `type ItemMode = 'media' | 'valor' | 'nao'`.
  - `interface UsdCost { amountUsdHa: number; boughtPct: number; boughtRate: number }`.
  - `interface CostItemState { mode: ItemMode; valueBrlHa: number; unit: 'ha' | 'scHa'; usd: UsdCost | null; rows: ProductRow[] | null }` (`ProductRow` vem de `src/engine/products.ts`, Tarefa 6, que roda antes desta). `unit: 'scHa'` só existe no item `arrendamento.valor`: o valor em sacas por hectare vira R$/ha multiplicando pelo preço na fazenda do cenário (a margem fica coerente com o preço usado); sem preço utilizável, o item mostra "—" e entra como 0 com aviso.
  - `AppState` ganha: `costGroups: Record<CostCategoryId, { mode: 'total' | 'itens'; totalBrlHa: number; totalUsd: UsdCost | null; items: Record<string, CostItemState> }>`, `costFxDefault: { boughtPct: number; boughtRate: number }`, `matrix: { stepsPct: [number, number, number, number]; yieldFactor: number }` (substitui `cbotStepUsc/fxStep/size`), `inputs.costUsd`, `inputs.fxLockPct`, `inputs.fxLockRate`.
  - Ações novas: `setCostGroupMode`, `setCostItem` (modo, valor, USD), `setGroupTotal`, `setCostFxDefault`, `setFxLock`, `setStepsPct`, `setYieldFactor`. Remover `setMatrix` antigo e `setCostMode`/`setCategory` somente se nenhum teste continuar dependendo (preferir adaptar).
  - `useResult()` expõe `usdLines` e continua a ser o único lugar que monta `FarmInputs`.
- Regras: `inputs.costPerHaBrl` = soma BRL fixa (grupos em R$, itens em R$ e a parte já comprada não, pois ela entra via `costUsd` com `boughtPct`); item em `media` usa a média regional do item quando existir, senão o grupo mostra a média do grupo; `nao` = 0; modo `total` do grupo usa `totalBrlHa`/`totalUsd`. Trocar de modo não apaga o que foi digitado.
- Persistência: `STORAGE_KEY = 'margem:v2'`; `loadPersisted` descarta `margem:v1`, JSON inválido e formatos fora do esperado sem lançar.

- [ ] **Step 1: Write the failing tests:** reducer: `setCostItem` em `adubacao.macro` com `usd {195, 0.6, 5.2}` gera `inputs.costUsd` com 1 linha e não soma 195 em `costPerHaBrl`; modo `nao` zera o item; trocar `itens → total → itens` preserva valores; `setFxLock` valida 0..1 e `rate>0`; trocar região recalcula médias de itens ainda em `media`; persist: `localStorage` com `margem:v1` válido → estado inicial padrão e nenhum erro; JSON corrompido idem; round-trip v2 preserva `costGroups`, `stepsPct`, `yieldFactor`; `COST_CATEGORY_LABELS.fertilizantes === 'Adubação'`; `useResult` em modo US$ com dólar inválido continua `usdBlocked` e não converte linhas; arrendamento de 8 sc/ha com preço na fazenda 125,11 soma R$ 1.000,88/ha no custo e muda quando o preço muda.
- [ ] **Step 2:** Rodar os testes de estado; esperado: FAIL.
- [ ] **Step 3:** Implementar; adaptar `CustoCard`, `MatrixControls`, `Comercializacao`, `StoreProvider` e testes antigos ao novo estado com o mínimo necessário para compilar e manter o comportamento atual (o visual novo vem depois).
- [ ] **Step 4:** `npx vitest run`, `npm run lint`, `npm run build` verdes.

---

### Task 5: Dados: médias por item do IMEA

**Files:** Modify `scripts/build_reference.py`, `src/data/reference-mt.json`, `src/data/types.ts`, `src/data/reference.test.ts`.

**Interfaces:**
- Produces: `CropReference` ganha `itemBrlHa: Record<string, number | undefined>` (chaves = ids de `COST_ITEMS`); `itemAverage(regionId: string, crop: CropId, itemId: string): number | undefined` em `src/state/reducer.ts` (ou `src/data/costItems.ts`).

- [ ] **Step 1:** Estender `build_reference.py` para gravar, por região e cultura, os valores R$/ha dos itens de `COST_ITEMS` (mapeando os nomes IMEA: Corretivo de Solo, Macronutriente, Micronutriente, Fungicida, Herbicida, Inseticida, Adjuvante/Outros, Assistência Técnica, Seguro da Produção, Financiamentos, Funrural, e os de Operações/Outros conforme `IGNORED` do script). Itens sem linha ficam ausentes, nunca zero. Rodar o script (origem `dados\atualizacao_2026-10-27`) com `python -I`.
- [ ] **Step 2: Write the failing tests:** `reference.test.ts`: a soma dos itens mapeados de cada grupo ≤ média do grupo (+0,5) em todas as regiões e culturas; `itemAverage('medio-norte','soja','defensivos.inseticida') === undefined`; `itemAverage('centro-sul','soja','adubacao.macro')` é número > 0; nenhuma média por item é NaN.
- [ ] **Step 3:** Rodar `npx vitest run src/data`; corrigir até verde. Se a soma dos itens não bater com o grupo em alguma região, registrar a diferença no relatório (não esconder).

---

### Task 6: Motor: adubação e defensivos por produto

**Files:** Create `src/engine/products.ts`; Test `src/engine/products.test.ts`.

**Interfaces:**
- Produces:
  - `type PriceUnit = 't' | 'kg' | 'L' | 'ha'`; `type DoseUnit = 'kg' | 't' | 'L'`.
  - `interface ProductRow { id: string; productId: string | null; name: string; dose: number; doseUnit: DoseUnit; price: number; priceUnit: PriceUnit; currency: 'BRL' | 'USD'; applications: number }` (`dose`/`applications` ignorados quando `priceUnit === 'ha'`).
  - `interface Fertilizer { id: string; name: string; n: number; p2o5: number; k2o: number }` e `FERTILIZERS: Fertilizer[]` com 10 adubos (MAP 11-52-00, DAP 18-46-00, superfosfato simples 00-18-00, superfosfato triplo 00-46-00, KCl 00-00-60, sulfato de potássio 00-00-50, ureia 45-00-00, nitrato de amônio 32-00-00, sulfato de amônio 21-00-00, nitrato de cálcio 15-00-00); teores como fração (0.11 etc.).
  - `rowCostPerHa(row: ProductRow, fx: number, freightPerTon: number): number | null` (R$/ha): `kg → dose/1000 × (price + freight)` para `t`; `price×dose` para `kg`/`L`; `price` para `ha`; US$ × `fx`; × `applications` para `L`.
  - `doseForPoints(points: number, content: number): number` (kg/ha) = `points ÷ content`.
  - `nutrientSupply(rows: ProductRow[]): { n: number; p2o5: number; k2o: number }` (kg/ha entregues, via `FERTILIZERS`).
  - `suggestForTargets(targets: { n: number; p2o5: number; k2o: number }, picks: { p: string; k: string; n: string }): ProductRow[]` descontando o N já entregue pelo produto de P antes de dimensionar a ureia.
  - `exchangeRatio(rowCostPerHa: number, farmPriceBrlPerSc: number): number | null` (sc/ha) e `scPerTon(pricePerTon: number, farmPriceBrlPerSc: number): number | null`.

- [ ] **Step 1: Write the failing tests:** `doseForPoints(60, 0.52)` ≈ 115.38; MAP 90 P₂O₅ → 173.08 kg/ha; custo MAP 173 kg a R$ 4.200/t + frete R$ 150/t = 752.55 → arredonda 753; KCl 100 kg a 3.400 + 150 = 355; calcário 1.5 t a 180 + 150 = 495; micronutriente `priceUnit 'ha'` 60 → 60; linha em `USD` 780 US$/t com fx 5.4998 converte; `nutrientSupply` de MAP 173 kg → N ≈ 19.0; `suggestForTargets` com N 20, P₂O₅ 90, K₂O 60 e picks MAP/KCl/ureia → ureia ≈ 2.2 kg (1 kg de N faltando ÷ 0.45); `exchangeRatio(1813, 125.11)` ≈ 14.49; `scPerTon(4350, 125.11)` ≈ 34.77; preço ≤ 0 ou fx ≤ 0 em US$ → `null`.
- [ ] **Step 2:** Rodar `npx vitest run src/engine/products.test.ts`; esperado: FAIL.
- [ ] **Step 3:** Implementar. Depois, em `state/types.ts` trocar o `ProductRow` provisório da Tarefa 4 por este tipo e fazer `inputs` somar as linhas (uma linha em US$ vira `CostUsdLine`; as demais entram em `costPerHaBrl`).
- [ ] **Step 4:** `npx vitest run` e `npm run lint` verdes.

---

### Task 7: Visual: tokens preto e dourado, tipografia e componentes base

**Files:** Modify `src/styles/tokens.css`, `src/styles/index.css`, `tailwind.config.ts`, `src/styles/contrast.test.ts`, `src/ui/Card.tsx`, `src/ui/Segmented.tsx`, `src/ui/Switch.tsx`, `src/ui/NumberField.tsx`; Create `src/ui/motion.tsx`.

**Interfaces:**
- Produces: tokens escuros (`--bg` quase preto, `--card` cinza muito escuro, `--tx` claro, `--mut` com contraste ≥ 4,5:1, `--gold: #e8b04a`, verdes/vermelhos de margem, tons da matriz tone0/1/2 = vermelho/âmbar/verde) com os mesmos nomes de variável de hoje; novas: `--acc`, `--surface2`. `src/ui/motion.tsx` exporta `Reveal({children, delay?})`, `CountUp({value, format})`, `useReducedMotion()` (reexporta de `motion/react`) e `MotionConfig reducedMotion="user"` aplicado no `App`.
- O contraste de todos os pares do `contrast.test.ts` é recalculado para a paleta nova e continua ≥ 4,5:1 (texto) e ≥ 3:1 (bordas e foco).

- [ ] **Step 1:** Atualizar `contrast.test.ts` com a lista de pares da paleta nova (texto sobre fundo/cartão, dourado sobre preto, tons da matriz com texto, bordas de campo, foco) e rodar: FAIL até os tokens existirem.
- [ ] **Step 2:** Implementar tokens e ajustar os componentes base (cartão, segmentado, switch, campo numérico) ao tema escuro mantendo comportamento e `aria`.
- [ ] **Step 3:** `Reveal`/`CountUp`: teste com `matchMedia('(prefers-reduced-motion: reduce)')` verdadeiro → renderiza o valor final imediatamente e sem transform.
- [ ] **Step 4:** `npx vitest run` (incluindo `a11y.test.tsx`), `npm run lint`, `npm run build` verdes.

---

### Task 8: Casca nova: menu no topo, rota Início, "Em breve"

**Files:** Modify `src/ui/routes.ts`, `src/App.tsx`, `src/ui/AppShell.tsx`, `src/ui/TopBar.tsx`, `src/ui/BottomNav.tsx`, `src/ui/Footer.tsx`, `src/ui/Ticker.tsx`; Delete `src/ui/Sidebar.tsx` e seu teste (substituir por `NavBar.tsx` com teste); Test `src/App.test.tsx`, `src/ui/TopBar.test.tsx`.

**Interfaces:**
- Produces: `type Route = 'inicio' | 'simulador' | 'comercializacao'`; `ROUTES` com `#/inicio`, `#/simulador`, `#/comercializacao`; `parseRoute('')` → `'inicio'`; `NavBar({ route })` com logo Hedgepoint (componente `Logo` provisório em `src/ui/Logo.tsx`, SVG com marcador), abas, menu "Em breve ▾" listando Cenários, Insumos, Hedge · Opções, Alertas, Salvos & histórico, Relatórios (itens `aria-disabled`, tooltip "em breve"), seletores existentes (cultura, moeda, unidade) e "Copiar link do app"; no celular mantém `BottomNav` com Início, Simulador e Comercialização. Ticker, Footer e Tour continuam. O Início esconde a faixa de mercado (ele tem a sua).

- [ ] **Step 1: Write the failing tests:** `parseRoute('')` e `'#/qualquer'` → `inicio`; `App` abre em `#/inicio` e escreve a rota canônica; `NavBar` tem 3 links ativos e 6 itens "Em breve" não clicáveis; a aba ativa tem `aria-current="page"`; os seletores de cultura/moeda/unidade e "Copiar link" continuam presentes e funcionais; teclado: Tab percorre as abas na ordem visual.
- [ ] **Step 2:** FAIL; implementar; atualizar testes antigos da Sidebar e do TopBar para a nova casca sem perder cobertura (cada teste removido é registrado no ledger).
- [ ] **Step 3:** `npx vitest run`, `npm run lint`, `npm run build` verdes.

---

### Task 9: Simulador: layout A, grupos de custo e "Detalhar"

**Files:** Modify `src/pages/Simulador.tsx`, `src/ui/CustoCard.tsx`, `src/ui/LavouraCard.tsx`, `src/ui/ComercializacaoCard.tsx`, `src/ui/KpiRow.tsx`, `src/ui/ResultPanel.tsx`; Create `src/ui/CostGroup.tsx`, `src/ui/CostItemRow.tsx`, `src/ui/FxChip.tsx`, `src/ui/DetailPanel.tsx`, `src/ui/FertilizerPanel.tsx`, `src/ui/ProductTable.tsx`, `src/ui/TargetAnalysisCard.tsx`; Test: um arquivo por componente novo + `Simulador.test.tsx`.

**Interfaces:**
- Consumes: ações e estado da Tarefa 4; `products.ts` (Tarefa 6); `analyzeTarget` (Tarefa 3); `itemAverage` (Tarefa 5).
- Produces:
  - `CostGroup({ group: CostCategoryId })`: cabeçalho com nome, referência da região, campo "total R$/ha" (aceita só o total, sem abrir), botão "Abrir ›"/"Fechar ‹"; os grupos são agrupados em seções Insumos / Operação / Estrutura e financeiro.
  - `CostItemRow({ group, itemId })`: 3 estados "média da região" / "meu valor" / "não uso" (sem "média da região" quando `itemAverage` é `undefined`), campo de valor, seletor R$/US$, `FxChip` e botão "Detalhar ›" nos itens com tabela.
  - `FxChip({ value: UsdCost; onChange })`: campos "já comprado __%" e "a que dólar __"; mostra o dólar efetivo de hoje; 0% = "do dia".
  - `DetailPanel` (drawer lateral, `useDialogBehavior`) hospeda `FertilizerPanel` (modos "Pelos nutrientes (N-P-K)" e "Por produto") e a tabela de defensivos; `ProductTable` com unidades de preço t/kg/L/ha, frete opcional R$/t, custo da área, relação de troca sc/t e sc/ha, aviso "você detalhou X% da média da região", botões "Usar no meu custo" e "Voltar à média da região". O preço **nunca** vem preenchido.
  - `ComercializacaoCard` ganha "do que está em aberto, __% com dólar travado a __" (valida 0..100% e dólar > 0).
  - `TargetAnalysisCard` na coluna do resultado, abaixo do equilíbrio, só com meta: estado abaixo/acima, lista de alavancas, "N de 81", tabela de estresse; textos da spec §6.4.
  - Layout A: dados à esquerda em 3 passos, `ResultPanel` fixo à direita (`position: sticky`), `ResultSheet` no celular.

- [ ] **Step 1: Write the failing tests (por componente, nomes):** `CostGroup` aceita só o total e atualiza o resultado; "Fertilizantes" não aparece, "Adubação" aparece; `CostItemRow` sem média oculta "média da região" (Inseticida soja/Médio-Norte); três estados mudam o total do grupo (`nao` zera; `valor` soma); `FxChip` com `60%` e `5,20` mostra "5,3199"; modo US$ com dólar inválido desabilita campos (`usdBlocked`); `ProductTable`: MAP 173 kg a 4.200/t + frete 150 = R$ 753/ha, sc/ha usa o preço na fazenda; preço vazio → custo "—", nada inventado; "Usar no meu custo" altera `costPerHaBrl`/`costUsd` e o custo/saca; "Voltar à média da região" restaura; `FertilizerPanel` modo nutrientes: P₂O₅ 90 com MAP dá 173 kg e N creditado 19; `TargetAnalysisCard` com meta 20% mostra "4,5 p.p. abaixo" e "R$ 132,11"; sem meta não renderiza; passo 3 com `fxLockPct` 30% altera o preço na fazenda; teste de teclado: Tab/Enter/Esc no `DetailPanel` (foco preso e devolvido).
- [ ] **Step 2:** FAIL; implementar; manter todos os campos antigos (região, área, produtividade, frete R$/t, taxas, já vendido, preço médio, "usar meu preço na fazenda", "De onde vem o preço", "Como calculamos", meta, exposição, equilíbrio, outras praças).
- [ ] **Step 3:** `npx vitest run`, `npm run lint`, `npm run build` verdes; conferir no navegador (`npm run dev`, 1280, 768 e 375 px) sem sobreposição e com a primeira entrada acima da dobra no 375 px (regra R28).

---

### Task 10: Comercialização: layout A, matriz 9×9 em %, cores, ⚙, produtividade e análise

**Files:** Modify `src/pages/Comercializacao.tsx`, `src/ui/MatrixTable.tsx`, `src/ui/MatrixLegend.tsx`, `src/ui/MatrixKpis.tsx`, `src/ui/MatrixControls.tsx`, `src/ui/matrixFormat.ts`, `src/ui/SalePlan.tsx`; Create `src/ui/MatrixSettings.tsx`, `src/ui/YieldSelector.tsx`, `src/ui/TargetSummary.tsx`; Test: arquivos correspondentes + `Comercializacao.test.tsx`.

**Interfaces:**
- Consumes: `buildMatrix`, `okCount`, `toneFor`, `matrixToCsv` (Tarefa 2); `analyzeTarget` (Tarefa 3); ações `setStepsPct`, `setYieldFactor`.
- Produces:
  - `MatrixTable`: eixos com valor e porcentagem, coluna/linha de hoje em dourado, 3 cores, célula com preço (ou a visão escolhida) e margem; com meta, **linha branca** na fronteira da meta e contorno tracejado no `nearest`; `aria` por célula com valor, margem e situação.
  - `MatrixSettings` (link "⚙ Ajustar variações" e janela): 4 passos em ordem crescente, "Voltar ao padrão", validação com mensagem em português; sem 5×5/7×7 e sem "Passo do CBOT/dólar".
  - `YieldSelector`: "−10% / base / +10%" discreto perto do ⚙.
  - `TargetSummary`: cartão "Análise da meta" (hoje X p.p. abaixo/acima, "N de 81 batem/ficam abaixo", só dólar, só CBOT, mais perto de hoje, "Usar esse cenário", link "Ver análise completa no Simulador").
  - Aviso fixo "dólar já travado: X% do custo e Y% da receita em aberto"; se `lockedAllFx`, aviso de colunas iguais.
  - Layout A: matriz grande à esquerda; "Cenário escolhido" + Plano de venda por faixas à direita (coluna única no celular).

- [ ] **Step 1: Write the failing tests:** a matriz renderiza 81 células e 9 colunas com "4,3998" e "+20%"/"−20%"; a coluna de hoje tem marcação; sem meta há células vermelhas (<0), amarelas e verdes; com meta 20% a quantidade de células verdes é 31; o controle de tamanho e os passos antigos não existem; `MatrixSettings` rejeita passos fora de ordem e restaura o padrão; `YieldSelector` −10% reduz o `Cenário atual`/margem central; `TargetSummary` mostra "31 de 81" e "dólar +5%"; clique em "Usar esse cenário" dispara `applyScenario`; CSV baixa com valor e % dos eixos; `lockedAllFx` mostra o aviso e não lança; todas as visões (Preço R$/sc, Margem R$/ha, Margem total, Margem %) funcionam em R$ e US$; "Considerar já vendido" e o Plano de venda por faixas continuam; teclado percorre as células (roving tabindex existente) e `jest-axe` sem violações.
- [ ] **Step 2:** FAIL; implementar; manter todo o conteúdo atual (4 números do topo, legenda, "Baixar matriz (CSV)", "Cenário personalizado ativo", aviso "em breve").
- [ ] **Step 3:** `npx vitest run`, `npm run lint`, `npm run build` verdes; conferir no navegador em 1280, 768 e 375 px.

---

### Task 11: Início: 7 telas, fotos reais e Framer Motion

**Files:** Create `src/pages/Inicio.tsx`, `src/ui/inicio/*.tsx` (uma por tela: `Capa`, `MercadoHoje`, `OQueOAppFaz`, `ComoFunciona`, `ContaECores`, `SuaMeta`, `ParaQuemFaq`), `src/ui/inicio/ScrollRail.tsx`, `src/ui/inicio/useLiveExample.ts`, `public/photos/*.jpg`, `public/photos/LICENCAS.md`; Test `src/pages/Inicio.test.tsx`, `src/ui/inicio/*.test.tsx`.

**Interfaces:**
- Consumes: `useStore` (snapshot de mercado e fechamento), `computeResult`, `analyzeTarget` e `buildMatrix` com dados da região Médio-Norte (MT), `Reveal`/`CountUp` (Tarefa 7), `ROUTES`.
- Produces: `Inicio()` com 7 seções `<section>` de altura de janela, `scroll-snap-type: y proximity`, `ScrollRail` (indicador `01/07`, bolinhas navegáveis por teclado, `aria-label`), barra fixa depois da capa com o botão "Descobrir minha margem →" (leva a `#/simulador`); `useLiveExample(): { regionLabel: 'Soja · Médio-Norte (MT)'; marginPerSc: number | null; asOf: string; stale: boolean }` calculado pelo motor com o snapshot atual (nunca fixo no código); fotos baixadas e guardadas em `public/photos` (lista na spec §9) com `width`/`height`, `loading="lazy"` (menos a capa) e `alt` descritivo, e `LICENCAS.md` com origem e licença de cada uma; sem API, usa o último fechamento e mostra a data.
- Conteúdo, textos e números exatamente como a spec §5; "por que importa" calculado pelo motor (não texto fixo): R$ 0,25 a mais no dólar, 3 sc/ha a mais, peso da adubação no custo; FAQ com as 5 perguntas da spec (acordeão com altura animada e `aria-expanded`).
- Movimentos conforme a spec §5 (zoom lento da capa, navio deslizando, abas com transição de layout, foto que troca por passo, barras e células que acendem em ordem, cartões "abaixo/acima" alternando, brilho do botão); todos desligam com `prefers-reduced-motion`.

- [ ] **Step 1: Write the failing tests:** renderiza 7 seções com títulos da spec; o indicador mostra `01/07` e muda ao ativar a 3ª seção (teste de `IntersectionObserver` simulado); botão "Descobrir minha margem →" navega para `#/simulador`; `useLiveExample` devolve a margem calculada para o snapshot de teste e `stale: true` sem API; cada `<img>` tem `alt` não vazio e `width/height`; a capa não usa `loading="lazy"`; o FAQ abre/fecha por teclado; com movimento reduzido nenhuma seção fica invisível (opacity 1 sem animação); cartão "Mercado de hoje" mostra os 6 preços com unidade, fonte e data, "a confirmar" na base e "a definir" no milho; nenhum texto de depoimento ou estatística inventada (teste de varredura de palavras proibidas: "depoimento", "%\s+dos produtores").
- [ ] **Step 2:** FAIL; baixar as fotos listadas na spec com `curl` (largura 1600, qualidade 70) para `public/photos`, conferir peso total ≤ 2,5 MB e que cada arquivo abre; implementar as telas.
- [ ] **Step 3:** `npx vitest run`, `npm run lint`, `npm run build` verdes; conferir no navegador (1280, 768, 375): scroll-snap, rail, fotos carregando, texto legível sobre as fotos (contraste ≥ 4,5:1 medido no overlay).

---

### Task 12: Qualidade final e revisão da branch

**Files:** Modify `docs/superpowers/reports/ledger-sdd.md`; Test: suíte inteira.

**Interfaces:** Consumes: tudo.

- [ ] **Step 1:** Registrar no ledger cada decisão trocada (R15/R21 menu lateral, R26 cores, 5×5/7×7 e passos, `margem:v1` → `v2`, "Fertilizantes" → "Adubação") e cada teste removido ou reescrito, com o motivo.
- [ ] **Step 2:** `npm test`, `npm run lint`, `npm run build`: todos verdes; reportar o número de testes (≥ 497 − removidos + novos).
- [ ] **Step 3:** Verificação no navegador real (`npm run dev` + Chrome): percorrer Início → Simulador → Comercialização em 1280, 768 e 375 px, com e sem meta, em R$ e US$, soja e milho, com um custo em US$ 60% comprado, com dólar 100% travado, com movimento reduzido ligado; sem erros no console; capturas salvas em `docs/superpowers/reports/design/`.
- [ ] **Step 4:** Revisão final da branch por um revisor independente (diff completo contra `main`), correção de tudo que for real, e relatório ao Leo com a lista do que ficou para a segunda fase.
