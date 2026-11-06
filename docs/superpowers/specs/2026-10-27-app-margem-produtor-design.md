# App de margem do produtor (soja e milho) — desenho

Data: 27/10/2026. Autor: Leo (Hedgepoint) com Claude. Status: rascunho para aprovação.

## 1. Intenção e porquê

O chefe do Leo pediu um app em que o cliente da Hedgepoint (produtor, cooperativa, trader) informe os dados da lavoura numa única tela e veja quanto ganha por saca, por hectare e no total, e depois teste cenários de preço de venda. O chefe deu poucas exigências; o restante é decisão nossa, apoiada no mapeamento de dois apps concorrentes (Open Hedge/Hedge Agro e Pro Market/Agrinvest, documentos no Claude Docs: `claude.ai/artifact/QsykY9L2q4GwnzuKcygzvn`, `…/CXctXXUnRcRLhvAbv6h5Am`, `…/KHxLg4NGydQFKFR7TJ3nce`).

Exigências do chefe (literais, não mudar):
1. **Uma tela** onde o cliente digita as informações.
2. O custo pode ser informado **total** ou **aberto em categorias** (defensivos, fertilizantes etc.); o cliente escolhe.
3. O app funciona em **dólar ou real**, o cliente escolhe a unidade.
4. **Antes do custo**, informações básicas: tamanho da área, produtividade local etc.
5. Uma **tela de comercialização da receita**: matriz com o **dólar variando nas colunas** e o **CBOT variando nas linhas**; em cada cenário, o valor em **R$/saca** e, junto, a **margem bruta esperada**.
6. Visual **bonito, fácil para o cliente, completo**, com a cara de app da Hedgepoint.

Sucesso: um produtor que nunca viu o app chega sozinho ao número "minha margem por saca hoje" em menos de 2 minutos, entende de onde veio o número e consegue testar o que acontece se o dólar ou o CBOT mudarem.

## 2. Metas, não-metas, anti-metas

Metas
- Soja e milho no mesmo motor de cálculo, com tabela de configuração por cultura (pronta para receber outras culturas, como o trigo, depois).
- Resultado instantâneo (a conta roda no navegador a cada tecla).
- Cada número explicável ("como calculamos").
- Funciona bem em celular e em desktop, um único layout responsivo.

Não-metas (fora do MVP)
- Contas de usuário, login, salvar na nuvem, histórico de margem.
- Alertas/gatilhos, simulador de opções (hedge), calculadora de adubo, cenários lado a lado, relatório PDF/imagem 4:5. Entram em fases seguintes (seção 11).
- Pecuária, algodão. Multi-fazenda, multi-talhão, multi-idioma (só português do Brasil).
- Conectar API de mercado: **decisão do Leo: depois**. Agora o app usa preços fixos de ontem.

Anti-metas (seria falha mesmo que "funcione")
- Mostrar preço fixo com selo de "ao vivo"/"AUTO". Enquanto for dado de fechamento, o app diz "Fechamento 26/10/2026" e a fonte.
- Copiar nome, logo, textos, fotos ou identidade visual do Open Hedge ou do Pro Market (só ideias e fórmulas gerais).
- Linguagem de recomendação de investimento. Rodapé fixo: "Material educacional e indicativo. Não constitui recomendação."
- Número sem explicação, ou margem calculada de um jeito que o cliente não sabe qual é.
- Máscara de moeda que transforma "4200" em "42,00" (defeito do Pro Market). Aceitar vírgula e ponto normalmente.

## 3. Decisões já tomadas

Do Leo:
- Site **separado** (não dentro do hf-site/Streamlit).
- Preços: usar os de ontem (26/10/2026) já coletados, fixos; API depois.
- Layout: referência de visual "app da Hedgepoint"; o primeiro rascunho em wireframe foi aprovado na ideia, rejeitado no visual; o segundo (`app-v2.html`, mockup na pasta de brainstorming) é a direção atual, sujeito a ajuste.

Chamadas minhas (o Leo pode trocar):
- Margem exibida **sobre a receita** por padrão, com chave para "sobre o custo".
- Dados do cliente guardados **só no navegador** (localStorage); sem conta no MVP.
- **Decisão do Leo (27/10): trigo fora do MVP.** Só soja e milho. O trigo entra numa fase futura, quando a regra de preço for validada.
- Grade da matriz 5×5 por padrão, ajustável até 9×9; passos editáveis.

## 4. Estrutura do site

Navegação: barra lateral esquerda (no celular, barra inferior). Itens do MVP: **Simulador** e **Comercialização**. Itens futuros aparecem esmaecidos com "em breve" (Cenários, Insumos, Hedge, Alertas, Salvos, Relatórios) para o cliente ver o rumo; clicar não faz nada além de um aviso.

Barra superior (fixa, em todas as telas): título + contexto (cultura, safra, região); seletor de cultura (Soja | Milho); chave R$/US$; chave sc/ha | t/ha; chave "margem sobre receita | sobre custo"; botão "Compartilhar" (MVP: copiar link/estado; imagem e PDF depois).

Faixa de cotações logo abaixo: CBOT, B3 (SJC/CCM), dólar PTAX, base da praça, com variação do dia quando houver e a legenda "Fechamento DD/MM/AAAA · fonte". Cada valor tem lápis para o cliente editar na mão (o valor editado fica marcado "manual").

Entrada: abre direto no Simulador, já preenchido com um exemplo da região e já calculado. Tour de 3 passos opcional (cultura e região; área e produtividade; custo), que o cliente pode pular e que **não reaparece** depois de pulado ou concluído (lembrar em localStorage).

Rodapé: aviso legal fixo; "Como calculamos" aberto em painel lateral a partir de qualquer número.

## 5. Tela 1 — Simulador

Layout em duas colunas no desktop: à esquerda as entradas em três cartões numerados; à direita um painel de resultado fixo (acompanha a rolagem). No celular o painel de resultado vira uma barra resumo fixa embaixo com "Margem R$ X/sc" que abre o painel completo. No topo da área de conteúdo, quatro cartões grandes: **Margem bruta/saca** (destaque), **Preço na fazenda hoje**, **Custo por saca**, **Margem total da safra**.

Cartão 1 — Sua lavoura (antes do custo, como pediu o chefe)
- Região/praça (lista; define base e referências).
- Área plantada (ha).
- Produtividade local (sc/ha), com a média regional recente ao lado como sugestão clicável ("usar").
- (opcional) Safra, mês de venda/contrato de referência.

Cartão 2 — Custo de produção, com chave **Total | Por categoria**
- Total: um campo, R$/ha (ou US$/ha conforme a chave de moeda).
- Por categoria: sementes; fertilizantes; defensivos; operações/máquinas; mão de obra; arrendamento; financeiro/seguro; frete, armazenagem e outros; mais "adicionar categoria". Cada linha tem barra proporcional e o valor; o total é soma automática. Valor de referência regional aparece em cinza como sugestão editável. Ao trocar de Total para Por categoria, o total digitado é distribuído proporcionalmente à referência (ou mantido como "não classificado" se não houver referência). Ao voltar, o total é a soma.
- Frete e taxas de porto/armazém: valor padrão **visível** e editável (R$/sc ou R$/t).

Cartão 3 — Comercialização (opcional)
- % já vendido, preço médio vendido (R$/sc), meta de margem (%).

Painel de resultado (direita)
- Cascata em barras: preço de referência → menos porto e frete → menos base → **preço na fazenda** → menos custo → **margem**.
- Exposição: barra "vendido X% / em aberto Y%".
- Preço mínimo para a meta, ponto de equilíbrio em preço e em produtividade, margem "blendada" (parte vendida ao preço médio + parte em aberto ao preço de hoje).
- Caixa "Como calculamos" com a conta numérica passo a passo.

## 6. Tela 2 — Comercialização da receita

- Cartões: cenário atual; melhor e pior célula da grade; quantas células ficam abaixo da meta.
- **Matriz**: dólar nas colunas, CBOT nas linhas, centrada nos valores atuais; célula atual com contorno. Abas de visão: **Preço R$/sc** (principal), **Margem R$/ha**, **Margem total (R$)**, **Margem %**; cada célula mostra o valor da aba ativa e, em letra menor, margem % e R$/ha. Cor por posição em relação à meta do cliente (abaixo, perto ±3 p.p., acima) com escala de 6 tons; valores sempre impressos na célula (não depender só de cor, por acessibilidade).
- Passos de CBOT e de dólar editáveis; tamanho da grade 5×5 a 9×9. Linha/coluna "hoje" marcada.
- Clicar numa célula copia aquele CBOT/dólar para o Simulador como cenário (com botão "voltar ao mercado de hoje").
- Plano de venda por faixas (opcional): tabela de volume × preço-alvo, mostrando margem média ponderada. Se complicar o MVP, é a primeira coisa a cortar (decisão do construtor).
- Botão "Baixar matriz" (CSV).
- Atalhos "Simular opção de venda" e "Criar alerta" aparecem como "em breve".

## 7. Fórmulas do motor

Constantes: saca = 60 kg. Bushels por saca: **2,20462** (soja, bushel de 60 lb; o trigo usaria o mesmo no futuro); **2,36218** (milho, bushel de 56 lb). 1 sc = 0,06 t.

- Custo por saca = custo/ha ÷ produtividade (sc/ha).
- Preço de referência em R$/sc (soja) = (CBOT em US¢/bu ÷ 100 + base em US¢/bu ÷ 100) × fator × dólar.
- Preço na fazenda = preço de referência − frete até o porto/praça (frete R$/t × 0,06) − taxas de porto/armazém (R$/sc).
- Milho (chamada minha): o motor e a matriz usam a **paridade de exportação pelo CBOT** com fator 2,36218, igual à soja, porque a matriz exigida pelo chefe é CBOT × dólar e o preço da B3 não se move com eles. O ajuste B3 CCM (R$/sc) e o Cepea aparecem ao lado como **comparação** ("B3 hoje: R$ 66,89"), não como base do cálculo.
- Soja: B3 SJC e Cepea Paranaguá também são só comparação/conferência, não entram na fórmula.
- Base, frete e taxas (chamada minha): a "base da praça" do arquivo de base é o prêmio **no porto/praça de referência** (ex.: Paranaguá). Frete do produtor até essa praça e taxas de porto/armazém são descontos **separados**. Se a praça escolhida for do interior e a base já embutir frete, o construtor confere no arquivo e não desconta o frete duas vezes (marcar na tela "frete já incluído na base").
- Moeda do custo (chamada minha): custo, frete e taxas são guardados **em reais**. No modo US$ o cliente digita em dólar e o app converte ao PTAX do momento da digitação; depois disso o valor em R$ fica fixo, e a matriz muda só o dólar da conversão de preço. Isso reflete que a maior parte do custo é pago em reais.
- Matriz e já vendido (chamada minha): as células de **preço R$/sc** não dependem do vendido. A **margem** da célula considera a parte já vendida ao preço médio vendido (margem blendada) quando o cliente preencheu "% vendido"; há uma chave "considerar já vendido" ligada por padrão nesse caso, desligável para ver tudo ao preço do cenário.
- Margem/sc = preço na fazenda − custo/sc. Margem/ha = margem/sc × produtividade. Margem total = margem/ha × área.
- Margem % sobre a receita = margem/sc ÷ preço na fazenda; sobre o custo = margem/sc ÷ custo/sc.
- Preço mínimo para meta m: sobre a receita, custo/sc ÷ (1 − m); sobre o custo, custo/sc × (1 + m).
- Equilíbrio: preço = custo/sc; produtividade = custo/ha ÷ preço na fazenda.
- Margem blendada: preço médio ponderado = v × preço vendido + (1 − v) × preço de hoje; margem calculada sobre esse preço.
- Matriz: para cada par (CBOT_i, dólar_j) recalcula o preço na fazenda e a margem com as mesmas fórmulas, mantendo base, frete, taxas, custo, produtividade e área constantes.
- Chave US$: tudo que está em R$ é dividido pelo dólar da cena (PTAX atual, ou o da coluna na matriz). Chave t/ha: sc × 0,06.

O motor é um módulo TypeScript puro, sem interface, com testes automáticos. Casos de teste mínimos:

Caso A (Pro Market, soja, só como conferência de ordem de grandeza; os custos de porto do servidor deles são desconhecidos): entradas CBOT 12,9825 US$/bu, dólar 5,383, base −1,75 US$/bu, produtividade 60 sc/ha, área 1.000 ha, custo 42,00 R$/ha (valor de teste, irreal), frete 3,00 R$/t. Esperado por eles: custo 0,70 R$/sc; preço de referência pela base 11,2304 US$/bu = R$ 133,22/sc; paridade no porto 154,07 bruto, 151,47 após 2,60 de taxas; paridade na fazenda 151,29; margem 9.035,40 R$/ha. Tolerância: centavos, e só para as linhas que o nosso modelo reproduz sem as taxas ocultas.

Caso B (Open Hedge, soja, risco × retorno), a de risco × retorno do Open Hedge (1.200 ha, 65 sc/ha, custo 3.200/ha, 30% vendido, meta 15%, saca a 120 → margem sobre o custo 143,75%, produção 78.000 sc, vendido 23.400 sc, exposição 54.600 sc), e os valores semente da seção 8.

## 8. Dados (agora: fixos; depois: API)

O app lê preços por uma interface única (`MarketDataProvider`). Agora há uma implementação estática que lê um arquivo JSON gerado a partir dos arquivos de coleta do Leo; depois entra uma implementação que chama a API de mercado da Hedgepoint, sem tocar nas telas. Cada dado carrega: valor, unidade, data, fonte, e se é "fechamento", "ao vivo" ou "manual".

Fonte dos preços de ontem: `dados\atualizacao_2026-10-27\` (coleta de 27/10, dados de 26/10/2026 completos; 27/10 está incompleto, **não usar**).

| Dado | Valor em 26/10/2026 | Arquivo |
|---|---|---|
| CBOT soja | 1.241,25 US¢/bu | `09b_precos_26_27_out.csv` |
| CBOT milho | 455,00 US¢/bu | idem |
| Dólar PTAX compra | 5,4998 | idem |
| B3 SJC (1º venc., SJCX26) | 27,3644 US$/sc | idem e `09b_b3_ccm_sjc_ajuste_por_contrato_26_out.csv` |
| B3 CCM (1º venc., CCMX26) | R$ 66,89/sc | idem |
| Cepea soja Paranaguá | R$ 155,55/sc | idem |
| Cepea milho | R$ 64,24/sc | idem |

Notas: o CBOT de 26/10 é do Yahoo Finance (não oficial) e pode ser ajustado pela CME; o app mostra a fonte. Não há dado de trigo nessa coleta, e o trigo está fora do MVP (seu preço interno segue paridade de importação e preço físico regional, não só a bolsa; validar com especialista antes de incluir).

Regiões do MVP (chamada minha): as regiões de **Mato Grosso** do IMEA (com custo, produtividade e frete de referência) e **Paranaguá/PR** como praça de exportação de referência de preço. Qualquer outra região entra como "Outra região (digitar)", sem referência de custo. Soja e milho têm dado de preço.

Referências regionais pré-preenchidas (opcional no MVP, onde existir dado):
- Base por praça (US¢/bu): `34_basis_por_praca.csv` (Hedgepoint/CME/ESALQ, digitalizado de PDF interno de 21/10; usar a série de 2026, último ponto, e confirmar a unidade e o sinal ao implementar).
- Custo de produção por item (R$/ha), Mato Grosso por região: `16b_imea_custo_producao_mt_longo.csv` (IMEA).
- Produtividade (sc/ha) por região do MT: `33_imea_produtividade_mt_historico.csv`.
- Frete (R$/t) MT→portos: `36b_imea_frete_mt.csv`.
- Fora do MT não há referência de custo nos arquivos: o campo fica vazio com a nota "sem referência regional, digite o seu".

## 9. Visual (direção, não pixel)

- Painel financeiro limpo: barra lateral verde escura, faixa de cotações escura, cartões brancos de cantos arredondados, número grande + rótulo pequeno, tipografia sem serifa (Inter ou similar).
- Paleta provisória (tokens, para trocar quando o Leo definir a identidade da Hedgepoint): verde escuro #0B3D2E / #12634A, menta #2BD9A0, dourado #D1AE6C, fundo #F2F5F3. Vermelho/âmbar/verde suaves só para a matriz e alertas.
- Cor por cultura nos destaques (soja, milho) como orientação sem texto.
- Estados: carregando (esqueleto), campo inválido (mensagem curta embaixo do campo), dado de mercado ausente ("aguardando" + liberar digitação), sem referência regional.
- Celular: coluna única, barra inferior, resultado resumido fixo. Tabelas largas rolam na horizontal. Alvos de toque ≥ 44 px.
- Acessibilidade: contraste AA, foco visível, tudo operável por teclado, cores da matriz sempre com número.
- Tema escuro: depois do MVP.

Mockups de referência (pasta de brainstorming, visíveis no navegador do Claude): `app-v2.html` (duas telas + mapa). Os números do mockup são ilustrativos (CBOT 1.080, dólar 5,40, base −1,00) e **não** são os dados reais da seção 8.

## 10. Tecnologia (chamada minha; o Leo pode trocar)

React + TypeScript + Vite; Tailwind para estilo; gráficos simples em CSS/SVG (cascata, barras), ECharts só se a matriz ou algo futuro pedir; Vitest para o motor. Sem back-end no MVP: site estático. Estado do cliente em localStorage com tentativa/captura de erro (pode estar bloqueado). Hospedagem: a definir (qualquer hospedagem estática serve).

## 11. Fases

1. **MVP (este desenho)**: Simulador + Comercialização, dados fixos de 26/10, 3 culturas, R$/US$, sc/ha-t/ha, custo total/categorias, "como calculamos", salvar no navegador.
2. Conectar API de mercado da Hedgepoint (troca da implementação do provedor), selo AUTO, atualização periódica.
3. Cenários lado a lado; calculadora de adubo (relação de troca em sc/ha) ligada ao custo; imagem 4:5 e PDF.
4. Contas, salvar fazenda/safra, histórico de margem.
5. Hedge (opções Black-Scholes, margem travada × aberta) e alertas por preço/margem.
6. Trigo (só com regra de preço validada e fonte de dados definida); tema escuro; modo offline.

## 12. O que fica para o construtor

Escolha de bibliotecas de componentes, estrutura de pastas, detalhe do esquema do JSON de preços, forma exata do tour, textos dos rótulos e das explicações (em português simples), valores padrão de frete e taxas de porto (marcados como "padrão do app" e editáveis), distribuição proporcional ao alternar custo total/categorias, e se o plano de venda por faixas entra no MVP.
