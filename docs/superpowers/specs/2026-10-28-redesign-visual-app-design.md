# Redesenho visual do app Margem (Hedgepoint): design

Data: 2026-10-28 · Autor da decisão: Leo · Estado: **rascunho para aprovação** (nada implementado)
Mockups de referência (HTML, gerados no companion visual): `.superpowers/brainstorm/94625-1793183233/content/`
(`boas-vindas-A-6telas-imagens.html`, `boas-vindas-como-funciona-v2.html`, `simulador-3-layouts.html`, `custo-detalhado-v2.html`, `custo-itens-principais.html`, `comercializacao-matriz-9x9-pct.html`, `comercializacao-ajuste-detalhe.html`, `cores-e-dolar-dos-custos.html`, `compra-parcial-e-analise-da-meta.html`, `comercializacao-analise-meta.html`). Os mockups mostram direção e números ilustrativos, não são o visual final.

## 1. Intenção e porquê

O app hoje (`localhost:5173`, spec de 2026-10-27) funciona e tem o conteúdo certo, mas parece um dashboard simples. Os clientes são produtores, consultores e bancos que vão usar o app para saber quanto sobra por saca antes de vender a safra. Eles precisam, em ordem: entender o que o app faz e por que importa, preencher poucos números, e confiar no resultado.

O objetivo é transformar o app em um produto com cara de app profissional, com a marca da Hedgepoint, mantendo todo o conteúdo e as contas atuais. Este documento junta: (a) um visual novo e comum às três páginas; (b) uma página inicial de ambientação nova; (c) um novo layout do Simulador e da Comercialização; (d) funcionalidades novas que o Leo pediu no caminho (custo detalhado, dólar por custo, matriz em porcentagens, cores por meta, análise da meta).

Referência de ritmo e de ordem de assunto: a página do Open Hedge (hedgeagro.com.br/hub-open-hedge) e o mapeamento do portal deles. **Usar como base de intenção, nunca copiar texto, layout, cores ou imagens.**

## 2. Objetivos, não objetivos, anti-objetivos

**Objetivos**
- Visual único (preto, acento dourado, logo Hedgepoint) nas três páginas: Início, Simulador, Comercialização.
- Página Início em 7 telas que passam uma de cada vez, explicando o que o app faz, como funciona e por que importa, **incluindo as funcionalidades novas listadas aqui**.
- Simulador e Comercialização com o resultado sempre visível ao lado dos dados.
- Custo detalhável (Adubação primeiro) sem obrigar ninguém a detalhar.
- Contas corretas para custo em dólar parcialmente comprado e para dólar parcialmente travado na venda.
- Com meta de margem definida: cores por meta e análise do que precisa acontecer (abaixo) ou do que preocupa (acima).
- Framer Motion onde reforça o sentido do texto.

**Não objetivos**
- Não mudar nenhuma conta existente do motor (`src/engine/*`) além das listadas na seção 8.
- Compra de adubo a prazo com juros, imagem para compartilhar o resultado, "dólar de uma data" automático, e opção de venda/alerta ficam para uma segunda fase.
- Não criar login, cadastro, banco de dados nem salvamento em servidor (dados continuam só no navegador).
- Não incluir trigo (o app tem Soja e Milho).

**Anti-objetivos (seria falha mesmo funcionando)**
- Qualquer conteúdo, campo ou função atual sumir sem o Leo ter mandado.
- Copiar a Open Hedge.
- Inventar dado: preço de adubo, depoimento, estatística ou foto de cliente.
- Animação que atrapalha leitura ou ignora `prefers-reduced-motion`.
- A cor ser a única forma de passar informação.

## 3. Restrições

- Stack atual: Vite 8, React 19, TypeScript estrito, Tailwind 3, Vitest (497 testes) e `jest-axe`. Ícones: Lucide. **Falta adicionar Framer Motion** (pacote `motion`/`framer-motion`); o Leo pediu explicitamente esse recurso, então a dependência está aprovada.
- Estado salvo no navegador: chave `margem:v1` (`src/state/persist.ts`). O redesenho muda o formato (moeda por custo, Adubação, passos da matriz). **Decisão minha:** subir para `margem:v2` e descartar o estado antigo sem migração (o app ainda não tem usuários reais), sem nunca quebrar ao encontrar um estado antigo ou inválido.
- Testes: os 497 existentes cobrem comportamento que o redesenho remove (matriz 5×5/7×7, menu lateral, 6 faixas de cor). **Podem ser trocados ou removidos quando cobrem comportamento removido de propósito**, registrando cada troca no ledger; os demais devem continuar passando como estão, e os novos comportamentos ganham testes.
- Manter os nomes das variáveis CSS existentes (o Tailwind e `src/styles/contrast.test.ts` dependem deles); adicionar novas quando preciso. Os testes de contraste continuam valendo, com a nova paleta.
- Acessibilidade: contraste de texto 4,5:1, foco visível, navegação por teclado, alvo mínimo, `aria` nos controles de ícone, movimento reduzido respeitado.
- Responsivo: o app já tem barra inferior abaixo de 768 px e `ResultSheet` (resultado em aba que sobe) no celular. Manter esse comportamento no novo layout.
- Dados do mercado já usados hoje: CBOT, dólar PTAX (BCB), B3 SJC, Cepea Paranaguá, base (61,70 "a confirmar"). A fonte do CBOT é Yahoo, **não oficial**, e o app já diz isso no rodapé.
- Itens "em breve" do menu atual (Cenários, Insumos, Hedge, Alertas, Salvos, Relatórios) existem no spec de 2026-10-27 e **devem continuar visíveis** no novo menu (por exemplo, num menu "Em breve" no topo).
- Quando este redesenho substituir decisões já registradas no ledger (`docs/superpowers/reports/ledger-sdd.md`), vale o redesenho, e o construtor deve registrar a troca. As trocas conhecidas estão na seção 8.

## 4. Sistema visual comum (as três páginas)

- **Cores:** fundo quase preto; superfícies em cinza muito escuro; texto claro; **acento dourado** (`#e8b04a`, sugestão minha, o Leo não vetou, mas **a cor real da marca Hedgepoint ainda não foi informada**). Verde e vermelho ficam só para margem positiva/negativa e para as cores da matriz.
- **Logo Hedgepoint:** topo e rodapé. O Leo ainda **não enviou o arquivo**; usar um marcador provisório até chegar.
- **Menu:** barra no topo com logo, abas (Início, Simulador, Comercialização, "Em breve ▾") e seletores (cultura, moeda R$/US$, unidade sc/ha ou t/ha, Copiar link). No celular, barra inferior como hoje. Barra lateral só se o Leo pedir.
- **Faixa de mercado** (CBOT, dólar, base, B3 SJC, data) continua, com os lápis de edição atuais.
- **Tipografia e forma de escrever:** na montagem de cada tela, **testar** outra fonte e outro formato (por exemplo cartões animados em vez de texto corrido) antes de fechar. Decisão do Leo: texto e imagem têm que caber juntos, conectar e ficar agradáveis.
- **Movimento (Framer Motion):** entradas suaves e ligadas ao sentido (ver Início); números contam ao aparecer; nada de movimento só para enfeitar; tudo desliga com movimento reduzido.
- **Cores da matriz:** ver seção 7 (regra nova).

## 5. Página Início (primeira tela do app): 7 telas que encaixam ao rolar

Funcionamento: cada tela ocupa a janela e encaixa ao rolar (scroll-snap); indicador `01/07` com bolinhas à direita; depois da capa, uma barra fina fixa com o logo e o botão; botão principal repetido: **"Descobrir minha margem →"** (leva ao Simulador). No celular, o botão fica colado embaixo. **Fotos reais do agro** ligadas ao texto de cada tela (lavoura, adubação/máquina, caminhão/porto, produtor), licenciadas; ainda não escolhidas. O texto abaixo é o rascunho aprovado em direção; palavras finais podem ser ajustadas na montagem.

1. **Capa.** Título: "Saiba quanto sobra por saca antes de vender." Subtítulo: "Calcule a sua margem real com o preço do dia, o dólar, o frete e o custo da sua região. Leva 2 minutos e não pede cadastro." Cartão de exemplo **"Soja · Médio-Norte (MT)"** com margem calculada pelo app com os dados reais de Mato Grosso (os números dos mockups são do Centro-Sul e **não valem**). Faixa AO VIVO com CBOT, dólar, B3 SJC. Foto: lavoura de soja. Movimento: zoom lento da foto, título palavra por palavra, número do exemplo subindo.
2. **Mercado de hoje.** "O preço da soja mudou hoje. E a sua margem?" Cartões por API com valor, unidade, fonte e hora: CBOT soja, dólar PTAX, B3 SJC, base (a confirmar), Cepea Paranaguá, CBOT milho (a definir). Foto: porto/navio. Movimento: navio desliza, cartões em sequência, valor pisca ao atualizar.
3. **O que o app faz.** "Do preço da bolsa até o dinheiro que sobra." Seis recursos, em abas animadas com foto/preview de cada um:
   - **Preço na fazenda:** o que chega de verdade na porteira, depois de base, frete e taxas.
   - **Custo por grupo:** média da região já preenchida, e **"Detalhar"** para quem quer precisão. **Adubação** (corretivos, macro e micronutrientes) e **Defensivos** abrem em produtos, doses e preços, com preço por tonelada.
   - **Dólar de cada custo:** custo em US$ com "quanto já comprei e a que dólar"; o resto acompanha o mercado.
   - **Cenários dólar × CBOT:** matriz 9×9, de −20% a +20%, **com cores de semáforo**.
   - **Sua meta:** diga a margem que quer e veja o que precisa acontecer ou o que preocupa.
   - **Plano de venda por faixas** (opcional).
4. **Como funciona.** Três passos, cada um com "Você faz / O app mostra / Por que importa" e foto que muda por passo. (1) Conte da sua lavoura; (2) Confira o seu custo, **com a nota "quer mais precisão? Detalhe a adubação"**; (3) Veja a margem e decida a venda, **com a nota "já travou o dólar? Diga quanto e a que dólar"**. "Por que importa" usa números reais do app (exemplos conferidos no exemplo Centro-Sul; recalcular para Médio-Norte (MT)): R$ 0,25 a mais no dólar = +R$ 7,18/sc; 3 sc/ha a mais baixam o custo em R$ 5,00/sc; a adubação pesa 34% do custo.
5. **A conta aberta e a matriz.** "Você confere cada número, e vê o que acontece se o mercado mexer." Conta da bolsa até a margem com fontes e data; mini-matriz 9×9 explicando as **cores**: sem meta, vermelho perde, amarelo margem baixa, verde margem boa; com meta, verde na meta, amarelo perto, vermelho longe. Movimento: barras da conta se desenham em ordem; células acendem em onda.
6. **Sua meta.** "Diga quanto quer ganhar. O app diz o que falta." Dois exemplos lado a lado: **abaixo da meta** ("o que precisa acontecer": preço, CBOT, dólar, produtividade ou custo) e **acima da meta** ("o que preocupa" e quanto você aguenta cair). Usar números reais calculados.
7. **Para quem, dúvidas e botão final.** Perfis: produtor, consultor, banco e cooperativa. FAQ, incluindo: "Preciso detalhar o custo?" (não, dá para digitar só o total por hectare); "E se meu insumo é em dólar?" (diga quanto comprou e a que dólar); "O que as cores significam?"; "Meus dados ficam salvos?" (só no seu navegador); "É recomendação?" (não, é material indicativo). Foto: produtor e consultor com o celular. Rodapé com logo, aviso legal e fontes.

## 6. Simulador (layout "A")

Dados em 3 passos à esquerda; resultado fixo à direita e sempre visível (no celular, o `ResultSheet` atual). Tudo o que existe hoje permanece: Região, Área, Produtividade; custos; frete (R$/t) e taxas de porto; Comercialização opcional (já vendido %, preço médio, "usar meu preço na fazenda"); "De onde vem o preço" e "Como calculamos"; meta de margem, exposição e ponto de equilíbrio; outras praças; passo de produtividade sc/ha ou t/ha.

**6.1 Custo por grupo.** Oito grupos (base IMEA, que já alimenta as médias), agrupados visualmente em *Insumos* (Sementes, **Adubação**, Defensivos), *Operação* (Operações/máquinas, Mão de obra) e *Estrutura e financeiro* (Arrendamento, Financeiro/seguro, Outros). O grupo hoje chamado "Fertilizantes" passa a se chamar **Adubação** (decisão do Leo: adubação = tudo que se coloca no solo para a planta; defensivos **não** entram em adubação).

| Grupo | Itens principais ao abrir |
|---|---|
| Sementes | Semente da cultura; semente de cobertura |
| Adubação | Corretivos (calcário, gesso); Macronutrientes (N-P-K); Micronutrientes |
| Defensivos | Herbicidas; Fungicidas; Inseticidas; Adjuvantes e outros |
| Operações / máquinas | Diesel e lubrificantes; Serviços terceirizados; Manutenção; Depreciação |
| Mão de obra | Contratada; da família (pró-labore) |
| Arrendamento | Um valor, em R$/ha **ou sc/ha** |
| Financeiro / seguro | Juros de financiamento; Seguro da produção; Seguro de máquinas |
| Outros | Impostos e taxas; Assistência técnica; Armazenagem, transporte e classificação; Despesas gerais |

Regras: (a) todo grupo e todo item aceitam **só o total por hectare**, sem abrir; (b) cada item aberto tem 3 estados: **média da região** (padrão), **meu valor**, **não uso** (zero); o total do grupo é a soma dos itens, então quem preenche só o que sabe mantém o resto na média; (c) **Verificado em 2026-10-28** no arquivo de origem (`16b_imea_custo_producao_mt_longo.csv`, R$/ha): há linhas por item em todas as regiões de soja e milho. Presentes em todas: Corretivo de Solo, Macronutriente, Micronutriente, Fungicida, Herbicida, Adjuvante/Outros, Assistência Técnica, Seguro da Produção, Financiamentos, Funrural. **Exceção: para soja, Inseticida só existe no total de MT, não nas regiões.** Os itens de Operações/máquinas (diesel e lubrificantes, serviços terceirizados, manutenção, depreciação) e de Outros devem ser mapeados pelo construtor a partir dos nomes do IMEA (`scripts/build_reference.py` lista as folhas), e a lista da tabela acima pode ser ajustada a esses nomes. O arquivo de referência do app (`reference-mt.json`) hoje só guarda os grupos; precisa passar a guardar os itens.
**Plano B (decisão minha):** item sem média regional (ex.: Inseticida de soja nas regiões) aparece só com "meu valor" e "não uso" (sem "média da região"), e o grupo continua mostrando a média do grupo como comparação. Cada grupo guarda um modo: **total** (um valor por hectare) ou **itens** (soma dos itens); trocar de modo não perde o que foi digitado.

**6.2 "Detalhar" (Adubação e Defensivos).** Painel lateral com dois modos para os macronutrientes: **pelos nutrientes** (o cliente informa kg/ha de N, P₂O₅ e K₂O; dose = pontos ÷ teor do adubo; custo/ha = dose × preço por tonelada ÷ 1.000; o app **desconta** o nutriente que outro adubo já entrega, por exemplo o N do MAP) e **por produto** (produto, dose, preço, por tonelada, kg, litro ou hectare). Lista pronta de adubos (MAP, DAP, superfosfato simples e triplo, KCl, sulfato de potássio, ureia, nitrato de amônio, sulfato de amônio, nitrato de cálcio) mais "criar fórmula" (teores editáveis). Defensivos: produto, dose em L ou kg/ha, preço, nº de aplicações. Saídas: custo/ha, custo da área, **relação de troca** (sc/t e sc/ha), comparação com a média da região ("você detalhou 84%"), frete opcional em R$/t. Botões: "Usar no meu custo" e "Voltar à média da região". **O app não tem fonte de preço de adubo: o cliente digita, e nunca preencher exemplo nos campos reais.** O semáforo de troca da Open Hedge (0–12/12–18) **não** é copiado.

**6.3 Dólar por custo (novo).** Hoje todo custo é guardado em R$ e a moeda do topo só converte a exibição. Passa a existir moeda por custo/produto (R$ ou US$). Para custo em US$: **"já comprado: __%"** e **"a que dólar: __"**. Dólar efetivo = f × dólar da compra + (1 − f) × dólar do cenário (0% = "do dia", 100% = travado). Existe um padrão global "dólar dos meus custos em US$" e cada item pode sobrescrever. Na matriz (e em qualquer cenário), custo em US$ não comprado **acompanha o dólar do cenário** (decisão do Leo). **Venda:** no passo 3, "do que ainda está em aberto, __% já com dólar travado a __" (essa fração rende CBOT do cenário × dólar travado; a fração já vendida a preço em R$/sc segue como hoje). **Fórmula da receita:** seja s = fração já vendida a preço fechado em R$/sc (como hoje), λ = fração do que está em aberto com dólar travado, d_t = dólar travado, d = dólar do cenário e P(c, d) = (c + base)/100 × 2,20462 × d − frete − taxas (preço na fazenda, c = CBOT). Preço médio da safra = s × P_vendido + (1 − s) × [ (1 − λ) × P(c, d) + λ × P(c, d_t) ]. O dólar travado só atua sobre a fração em aberto. **Casos limite:** se λ = 100% e todo custo em US$ estiver comprado, as colunas da matriz ficam iguais; os eixos continuam mostrados, as células repetem o valor e um aviso explica o motivo. Na análise da meta, com custo em US$ não comprado ou com λ > 0, o CBOT e o dólar necessários são resolvidos numericamente (a margem é monótona nas duas variáveis). A matriz mostra um aviso fixo ("dólar já travado: X% do custo e Y% da receita em aberto"). Futuro: "dólar de uma data" (PTAX do dia da compra).

**6.4 Análise da meta (card na coluna do resultado, abaixo do equilíbrio; só com meta definida).**
- *Abaixo da meta:* "você está X p.p. abaixo"; o que, **sozinho**, leva à meta: preço na fazenda mínimo, CBOT necessário (dólar de hoje), dólar necessário (CBOT de hoje), produtividade necessária, custo máximo; mais "N de 81 cenários da matriz batem a meta".
- *Acima da meta:* "você está X p.p. acima"; o que, sozinho, tira da meta (mesmos cinco, no sentido oposto), "N de 81 abaixo da meta" e uma **tabela de estresse** (CBOT −10%, dólar −10%, produtividade −10%, custo +10%, e a combinação CBOT −10% + dólar −5% + produtividade −5%) com margem e situação vs. meta. Os choques (10% e 5%) são palpite meu e ajustáveis.
- Fórmulas fechadas (margem sobre a receita, P = preço na fazenda/sc, C = custo/sc, t = meta): P_min = C/(1−t); produtividade necessária = custo_ha / (P × (1−t)); custo máx/ha = P × (1−t) × produtividade; CBOT e dólar por inversão da paridade; **quando há custo em US$ não comprado, resolver numericamente**.
- Exemplos conferidos no caso Centro-Sul (custo R$ 6.383,44/ha, 60,4 sc/ha, P = R$ 125,11): meta 20% → P 132,11, CBOT 1.299, dólar 5,74, produtividade 63,8, custo R$ 6.045/ha, 31 de 81 batem; meta 10% → P 117,43, CBOT 1.178, dólar 5,23, produtividade 56,7, custo R$ 6.801/ha, 30 de 81 abaixo.

## 7. Comercialização (layout "A")

Matriz grande à esquerda; à direita, cartão "Cenário escolhido" (clique numa célula para usá-la) e "Plano de venda por faixas". Permanecem: os quatro números do topo, as quatro visões (Preço R$/sc, Margem R$/ha, Margem total, Margem %), "considerar já vendido", legenda, "Baixar matriz (CSV)", e o aviso "em breve: opção de venda e alerta".

- **Matriz só 9×9** (remover 5×5, 7×7 e os campos "Passo do CBOT"/"Passo do dólar"). **Dólar nas colunas, CBOT nas linhas.** Centro = hoje; passos −20%, −10%, −5%, −2,5%, 0, +2,5%, +5%, +10%, +20%. Cada eixo mostra o **valor e a porcentagem**. A coluna e a linha de hoje em dourado. O CSV passa a exportar o valor e a % de cada eixo.
- **Ajuste dos passos como detalhe:** link discreto "⚙ Ajustar variações" abre uma janela com 4 passos (2,5, 5, 10, 20%), "Voltar ao padrão", e opção avançada de passos diferentes para o CBOT; passos em ordem crescente. **Primeira versão:** só os 4 passos e "Voltar ao padrão". Passos diferentes para o CBOT e limites de cor ajustáveis ficam para a segunda fase (decisão minha, para reduzir escopo). Cada célula continua sendo o **preço na fazenda do cenário** (como hoje) e a margem sobre a receita. "N de 81" e "cenário mais próximo de hoje" usam a grade atualmente mostrada (estado único, então Simulador e Comercialização mostram o mesmo número); "mais próximo" = menor soma das variações absolutas de CBOT e dólar em %; em empate vence a célula de maior margem e, persistindo o empate, a de menor variação do dólar (decisão do controlador em 2026-10-28: é o resultado que o Leo viu e aprovou no mockup, dólar +5% com CBOT de hoje).
- **Cores (substituem o ledger R26).** *Sem meta:* vermelho = margem < 0; amarelo = 0 a 10% ("baixa"); verde = ≥ 10% ("boa"). *Com meta:* verde = na meta ou acima; amarelo = até 5 p.p. abaixo; vermelho = mais de 5 p.p. abaixo. Os limites de 10% e 5 p.p. são palpite meu (hoje o app usa 6 tons e faixas de 3 p.p.). A célula sempre mostra o número.
- **Análise da meta na Comercialização:** com meta, uma **linha branca** na matriz separa o que bate a meta do que não bate; um contorno tracejado marca o cenário mais próximo de hoje que bate; cartão resumo com "N de 81 batem", "só com o dólar", "só com o CBOT", "mais perto de hoje", botão "Usar esse cenário" e link "Ver análise completa no Simulador". Acima da meta: "N de 81 abaixo da meta" e até onde dólar e CBOT aguentam cair.
- **Seletor de produtividade (confirmado pelo Leo em 2026-10-28):** discreto, perto do ⚙, com "−10% / base / +10%", que redesenha a matriz para uma safra pior ou melhor (a produtividade do cenário muda o custo por saca; os demais campos ficam como estão).

## 8. Decisões já registradas que este redesenho altera

- Ledger **R26** (tons da matriz em faixas de 3 p.p. e rampa verde sem meta) → regra de três cores da seção 7.
- Ledger **R15/R21** e spec de 2026-10-27 (barra lateral verde escura) → menu no topo e paleta preta e dourada (a barra inferior no celular continua).
- Spec: "palette stays until Hedgepoint's identity arrives" → agora preto e dourado; **cor oficial da marca ainda a confirmar.**
- Matriz: tamanhos 5×5/7×7 e passos de CBOT e dólar por valor → 9×9 em porcentagem.
- Custos passam de "só R$" para R$ ou US$ por item, com dólar efetivo; o motor de cálculo precisa aceitar isso (único ponto em que `src/engine` muda).
- Nome do grupo "Fertilizantes" → "Adubação".

## 9. Pendências e riscos

- **Logo** e **cor oficial** da Hedgepoint: não informados.
- **Fotos reais**: candidatas do Unsplash já escolhidas no mockup `inicio-7-telas-com-fotos.html` (capa: `photo-1562702100-a38e4a6e79b3`; mercado: `photo-1759272548457-12b8580bfca7`; adubação: `photo-1655130944329-b3a63166f6b5`; passo 1: `photo-1779043152010-3591365838aa`; conta: `photo-1630095829654-b734f5cb2b25`; meta: `photo-1704785119987-1d255fecb1a1`; final: `photo-1632723893457-47e3abc47526`; passo 2 adubação: `photo-1655130944276-496518f92f98`; passo 3: `photo-1693593884267-cc23b1b980d5`). Devem ser **baixadas e guardadas no projeto** (não hotlink), com a licença conferida; troca possível por fotos da Hedgepoint. Origem anterior: origem e licença a definir (banco gratuito ou material da Hedgepoint). **Até chegarem, usar placeholders neutros (gradiente ou ilustração simples) com `alt` descritivo**, para trocar sem mexer na estrutura dos componentes.
- **Exemplo da capa e "por que importa":** gerados pelo motor em tempo de execução com os dados de mercado atuais (não são texto fixo), então mudam quando o mercado muda. Sem API disponível, usam o último fechamento guardado, com a data à vista; a base continua "a confirmar".
- **"Médio-Norte (MT)" não existe no app:** ele só tem regiões do IMEA, não municípios. O exemplo da capa usa **"Soja · Médio-Norte (MT)"** (região onde fica Sorriso), a menos que o Leo queira adicionar municípios.
- **Fonte das cotações:** CBOT via Yahoo (não oficial) e **base (61,70) "a confirmar"** precisam de decisão para o cliente final; **CBOT milho "a definir".**
- **IMEA por item:** verificar a cobertura por região e cultura (seção 6.1).
- **Mobile:** o redesenho precisa de revisão em 375, 768 e 1024 px; o `ResultSheet` e a barra inferior atuais devem ser mantidos.
- **Dado de exemplo da capa e dos "por que importa"** precisa ser recalculado para Médio-Norte (MT).
- **Dependência nova:** Framer Motion.
- Tipografia e forma de escrever das telas do Início: validar na montagem.

## 10. O que fica para o construtor

Ordem de entrega, decomposição em tarefas, escolha de bibliotecas além do Framer Motion, estrutura de componentes e de tokens, estratégia de testes (manter os 497 e ampliar), detalhes de animação, a forma exata do painel "Detalhar", o desenho do menu "Em breve", a escolha das fotos e as palavras finais dos textos (mantendo a intenção das seções 5 a 7).

## 11. Segunda fase (fora deste escopo)

Compra de adubo a prazo com juros; imagem para compartilhar o resultado; "dólar de uma data" automático; opção de venda e alertas; comparação por safra salva.

## 12. Escolhas minhas (não decididas pelo Leo)

Dourado `#e8b04a`; limite de 10% para "margem boa" e de 5 p.p. para "perto da meta"; choques de estresse de 10% e 5%; seletor de produtividade na matriz; preço de defensivos por litro ou kg como padrão; arrendamento aceitar sc/ha; agrupamento visual em Insumos / Operação / Estrutura e financeiro; Início em 7 telas (eram 6); relação de troca mostrada em sc/t e sc/ha.
