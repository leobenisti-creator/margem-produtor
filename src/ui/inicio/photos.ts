/**
 * Photos of the Início (Unsplash License; files and origin in public/photos/LICENCAS.md).
 * width/height are the real pixel sizes of the JPEG files (read from their headers).
 */
export interface PhotoDef {
  src: string
  width: number
  height: number
  /** Descriptive Portuguese alt text. */
  alt: string
  /** Short visible caption (decorative, the alt already says it). */
  caption: string
}

const url = (file: string) => `${import.meta.env.BASE_URL}photos/${file}`

export const PHOTOS = {
  capa: {
    src: url('capa.jpg'),
    width: 1400,
    height: 932,
    alt: 'Lavoura de soja ao entardecer, com o sol se pondo atrás das árvores',
    caption: 'lavoura de soja ao entardecer',
  },
  mercado: {
    src: url('mercado.jpg'),
    width: 1400,
    height: 933,
    alt: 'Navio de carga atracado no porto, com guindastes carregando contêineres, visto do alto',
    caption: 'navio sendo carregado no porto',
  },
  adubacao: {
    src: url('adubacao.jpg'),
    width: 1400,
    height: 787,
    alt: 'Trator com tanque amarelo adubando a lavoura jovem, levantando poeira',
    caption: 'trator adubando a lavoura',
  },
  passo1: {
    src: url('passo1.jpg'),
    width: 1000,
    height: 1500,
    alt: 'Fileiras de soja jovem até o horizonte, sob céu azul',
    caption: 'passo 1 · a lavoura',
  },
  passo2: {
    src: url('passo2.jpg'),
    width: 1400,
    height: 786,
    alt: 'Trator adubando a lavoura, visto do alto',
    caption: 'passo 2 · o custo (adubação)',
  },
  passo3: {
    src: url('passo3.jpg'),
    width: 1400,
    height: 933,
    alt: 'Colheitadeira descarregando grãos no carrinho graneleiro durante a colheita',
    caption: 'passo 3 · a colheita e a venda',
  },
  conta: {
    src: url('conta.jpg'),
    width: 1400,
    height: 933,
    alt: 'Folhas de soja de perto, iluminadas pelo sol baixo',
    caption: 'soja de perto',
  },
  meta: {
    src: url('meta.jpg'),
    width: 1600,
    height: 821,
    alt: 'Lavoura amarelada em época de maturação, com árvores ao fundo e céu azul',
    caption: 'lavoura madura',
  },
  final: {
    src: url('final.jpg'),
    width: 1400,
    height: 933,
    alt: 'Colheitadeira trabalhando na lavoura ao entardecer',
    caption: 'colheita ao entardecer',
  },
} satisfies Record<string, PhotoDef>

export type PhotoId = keyof typeof PHOTOS
