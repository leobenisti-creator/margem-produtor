/** Copy of the first-visit tour (pt-BR). Anchors are the `data-tour` attributes on the Lavoura e custos page. */

export interface WelcomeCard {
  title: string
  body: string
}

export const WELCOME_CARDS: WelcomeCard[] = [
  {
    title: 'Como o site funciona',
    body: 'São três páginas, nesta ordem: Lavoura e custos, Comercialização e Resultados financeiros.',
  },
  {
    title: 'Custos primeiro',
    body: 'Os Resultados financeiros abrem quando a lavoura e os custos estão preenchidos. Comece por aqui.',
  },
  {
    title: 'Seus dados ficam neste navegador',
    body: 'Não há conta nem login. O que você digita fica salvo neste navegador, neste aparelho.',
  },
  {
    title: 'Vendas e operações: salvar',
    body: 'Vendas e operações em bolsa só ficam guardadas depois de clicar em Salvar. Antes disso, são rascunho.',
  },
]

export interface BalloonStep {
  /** Value of the `data-tour` attribute of the target. */
  anchor: 'praca' | 'area' | 'produtividade' | 'custo' | 'proximo'
  title: string
  body: string
}

export const BALLOON_STEPS: BalloonStep[] = [
  {
    anchor: 'praca',
    title: 'Escolha a praça',
    body: 'Selecione a praça mais próxima da sua lavoura: ela define o preço de referência (FOB).',
  },
  {
    anchor: 'area',
    title: 'Informe a área plantada',
    body: 'Digite quantos hectares você planta. A conta de toda a safra parte daqui.',
  },
  {
    anchor: 'produtividade',
    title: 'Informe a produtividade',
    body: 'Digite quanto a lavoura produz, em sc/ha ou t/ha.',
  },
  {
    anchor: 'custo',
    title: 'Informe o custo por hectare',
    body: 'Digite o custo de produção, por hectare, por saca ou por tonelada.',
  },
  {
    anchor: 'proximo',
    title: 'Próxima página',
    body: 'Com lavoura e custos preenchidos, siga para a Comercialização.',
  },
]
