# Margem

App web para o produtor de soja e milho calcular a margem por saca, por hectare e da safra inteira, e testar o que acontece com a margem quando o dólar ou o CBOT mudam. Roda inteiro no navegador (sem back-end, sem login); os dados do cliente ficam só no `localStorage` do navegador.

Duas telas:

- **Simulador**: dados da lavoura, custo (total ou por categoria), frete e taxas, venda já feita e meta de margem opcional. Mostra margem/saca, preço na fazenda, custo/saca e margem total, com "Como calculamos" em cada número.
- **Comercialização**: matriz com o dólar nas colunas e o CBOT nas linhas (preço R$/sc, margem R$/ha, margem total, margem %), clique na célula para usá-la como cenário, plano de venda por faixas e download da matriz em CSV.

Trigo fora do MVP: só soja e milho.

Os preços são fixos, de **fechamento de 26/10/2026**, e aparecem sempre com essa data e a fonte. Não há dado "ao vivo" nem atualização automática.

## Como rodar

Requer Node.js.

```
npm install
npm run dev       # servidor de desenvolvimento
npm test          # testes (Vitest)
npm run lint      # checagem de tipos (tsc --noEmit)
npm run build     # gera dist/ (site estático)
npm run preview   # serve o dist/ para conferir o build
```

## Pastas

| Pasta | Conteúdo |
|---|---|
| `src/engine` | Motor de cálculo em TypeScript puro (fórmulas, unidades, matriz, configuração das culturas). Sem interface. |
| `src/data` | Tipos e `MarketDataProvider`, provedor estático, `seed-2026-10-26.json` (preços), `reference-mt.json` (referências IMEA do Mato Grosso), regiões. |
| `src/state` | Estado do app: reducer, provedor de estado (`StoreProvider`), persistência em `localStorage`, custos por categoria. |
| `src/ui` | Componentes (barra superior, cotações, cartões, matriz, gaveta "Como calculamos", tour etc.). |
| `src/pages` | As duas telas: `Simulador` e `Comercializacao`. |
| `scripts` | Scripts Python que geram os dois JSONs de `src/data` a partir dos CSVs de coleta. |

## Regenerar os dados (seed e referências)

Os dois scripts usam só a biblioteca padrão do Python e leem os CSVs de coleta, que ficam **fora do repositório**. A pasta é a constante `SRC` no topo de cada script (hoje `dados\atualizacao_2026-10-27`); se a pasta mudar, edite `SRC` nos dois.

```
python scripts/build_seed.py        # escreve src/data/seed-2026-10-26.json
python scripts/build_reference.py   # escreve src/data/reference-mt.json
```

- `build_seed.py` lê `09b_precos_26_27_out.csv` e usa **somente a linha de 2026-10-26** (a de 27/10 está incompleta e nunca é usada). A base vem de `34_basis_por_praca.csv`.
- `build_reference.py` lê `16b_imea_custo_producao_mt_longo.csv` (custo), `33_imea_produtividade_mt_historico.csv` (produtividade) e `36b_imea_frete_mt.csv` (frete), todos do IMEA.

Depois de regenerar, rode `npm test`: há testes que conferem o seed e as referências.

## Trocar o provedor de dados pela API

O app lê os preços por uma interface única, `MarketDataProvider` (em `src/data/types.ts`), com um método `getSnapshot(): Promise<MarketSnapshot>`. Hoje a implementação é `staticProvider` (`src/data/staticProvider.ts`), que lê o JSON do seed. Para usar a API da Hedgepoint, implemente `MarketDataProvider` devolvendo um `MarketSnapshot` (cada cotação com valor, unidade, data, fonte e tipo `fechamento`, `ao_vivo` ou `manual`) e passe a implementação na propriedade `provider` do `StoreProvider` em `src/App.tsx` (`<StoreProvider provider={apiProvider}>`). Telas e motor não mudam. Ao ligar dado ao vivo, revise os rótulos de data e fonte do ticker (`src/ui/Ticker.tsx`), que hoje só mostram "Fechamento DD/MM/AAAA". A API ainda não foi implementada.

### Contrato do provedor

O teste `src/data/contract.test.ts` (função `snapshotContractViolations` em `src/data/contract.ts`) confere o que a interface espera de um `MarketSnapshot`. Qualquer provedor novo deve passar nele: troque `staticProvider` pelo seu no teste, ou chame a função e exija lista vazia.

- Toda cotação (`Quote`) tem `value` numérico finito (nunca `NaN`, `Infinity`, `null` ou texto), `unit` exata, `asOf` em ISO `YYYY-MM-DD`, `kind` em `fechamento | ao_vivo | manual` e `source` não vazia.
- Unidades exatas, por campo: `cbotUsc` `USc/bu`; `fx` `R$/US$`; `basisUsc` `USc/bu`; `b3.soja` `US$/sc`; `b3.milho` `R$/sc`; `cepea.soja` e `cepea.milho` `R$/sc`. A tela decide o formato do B3 pela unidade (`US$` vs `R$`).
- `basisUsc` é o prêmio da praça sobre o CBOT, em US¢/bu, no mesmo sinal da conta: positivo = prêmio (soma ao CBOT), negativo = desconto.
- `asOf` é por cotação: a base pode ter data própria (hoje 21/10 contra 26/10 dos fechamentos); o ticker mostra a data mais recente de CBOT/dólar/B3 e a da base em separado.
- `kind: 'ao_vivo'` só depois de atualizar a legenda do ticker (`src/ui/Ticker.tsx`), que hoje escreve "Fechamento DD/MM/AAAA" para tudo; nunca mostrar "AUTO" ou "ao vivo" sem essa revisão.
- Uma `source` com o texto "a confirmar" aparece assim na tela (nota da base no ticker e rodapé).

## Limitações conhecidas dos dados

- **Base a confirmar.** A base de Paranaguá (soja 61,7 US¢/bu; milho 98,5 US¢/bu) é o ponto semanal de 21/10/2026, digitalizado de um gráfico de PDF interno, sem contrato de referência. A base da soja caiu de 127,7 para 61,7 em uma semana (possível troca de contrato). A tela mostra "base de 21/10" e a fonte está marcada "a confirmar".
- **Frete e taxas de porto são valores padrão.** O frete vem do IMEA (MT para Paranaguá, R$/t) quando a região tem dado; Norte, Noroeste e a média de MT não têm. As taxas de porto/armazém (R$ 5,20/sc) são um valor provisório do app, marcado "padrão do app" e editável. Esses dois valores pesam muito na margem de abertura.
- **Custo do milho é antigo.** A referência de custo do milho é da safra 24/25, mês 12/2024 (a safra 25/26 não tem dados utilizáveis). A tela mostra a safra e o mês.
- **Milho não tem produtividade regional.** O campo abre com um valor de exemplo (100 sc/ha) e a tela pede para o cliente digitar a sua.
- **Só há referência regional para Mato Grosso** (regiões do IMEA). Paranaguá e "Outra região" não têm referência de custo nem de produtividade: o cliente digita.
- **Custo de referência exclui pós-produção.** O custo de referência soma as oito categorias do IMEA sem armazenagem/transporte/classificação (pós-produção), porque frete e taxas são campos separados do app.
- **CBOT de 26/10 é do Yahoo Finance** (não oficial) e pode diferir do settlement da CME. B3 e Cepea aparecem só como comparação, não entram na conta.

## Aviso legal

Rodapé fixo em todas as telas: "Material educacional e indicativo. Não constitui recomendação."
