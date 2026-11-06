import type { CropId } from '../engine/crops'

/**
 * Pontos FOB (lista do Leo, 29/10/2026): cada ponto tem a sua base (US¢/bu) por cultura.
 *
 * ==================================================================================================
 * FONTE DOS VALORES (atualizado em 05/11/2026): relatório "Basis Soybeans and Corn" da Hedgepoint
 * Global Markets, de 04/11/2026 (valores copiados à mão do PDF; AINDA SEM API conectada, isso fica
 * para depois). Regra do Leo (29/10): o valor de um ponto FOB é só o PRÊMIO DO PORTO de exportação
 * (FOB = prêmio do porto, SEM frete); o frete até o porto e as despesas portuárias entram à parte
 * na conta, não na base.
 * Paranaguá (`PARANAGUA_BASE_USC`): soja 3,5 e milho 97,6 US¢/bu. Cada ponto do relatório vem como
 * diferença sobre Paranaguá (`PREMIUM_OFFSET_USC`, US¢/bu): base do ponto = Paranaguá + diferença.
 *
 * AINDA PROVISÓRIOS (o PDF de 04/11 não traz o ponto/cultura): ficam com o valor ABSOLUTO que o app já
 * tinha, em `PROVISIONAL_BASE_USC` (não somam sobre a nova base de Paranaguá). São: Itaqui e Barcarena
 * (portos do Arco Norte, soja e milho) e Cascavel (soja). As combinações ponto × cultura que o app não
 * oferecia continuam não oferecidas: Primavera do Leste e Campo Grande (milho), Oeste do PR (milho),
 * Campos Novos e Chapecó (soja e milho, respectivamente).
 * ==================================================================================================
 *
 */
export const PROVISORIO = true

export type FobGroup = 'portos' | 'matopiba' | 'centro-oeste' | 'go-mg' | 'sul'

export interface FobPoint {
  id: string
  label: string
  group: FobGroup
  crops: CropId[]
  /** PROVISÓRIO (ver o cabeçalho). US¢/bu por cultura. */
  baseUsc: Partial<Record<CropId, number>>
}

/** Group labels, in the order the select shows them. */
export const FOB_GROUP_LABELS: Record<FobGroup, string> = {
  portos: 'Portos',
  matopiba: 'Matopiba',
  'centro-oeste': 'Centro-Oeste',
  'go-mg': 'GO e MG',
  sul: 'Sul',
}

export const DEFAULT_FOB_ID = 'paranagua'
/** "Outro (digitar a base)": not a point; the user types the base. */
export const OUTRO_FOB_ID = 'outro'

/** Base de Paranaguá, US¢/bu (Hedgepoint Global Markets, Basis Soybeans and Corn, 04/11/2026). */
const PARANAGUA_BASE_USC: Record<CropId, number> = { soja: 3.5, milho: 97.6 }

type Def = [id: string, label: string, group: FobGroup]

/** Order: Paranaguá (referência) first, then by group. */
const DEFS: Def[] = [
  ['paranagua', 'Paranaguá (PR)', 'portos'],
  ['itaqui', 'Itaqui (MA)', 'portos'],
  ['barcarena', 'Barcarena (PA)', 'portos'],
  ['barreiras', 'Barreiras (BA)', 'matopiba'],
  ['rondonopolis', 'Rondonópolis (MT)', 'centro-oeste'],
  ['sorriso', 'Sorriso (MT)', 'centro-oeste'],
  ['primavera-do-leste', 'Primavera do Leste (MT)', 'centro-oeste'],
  ['campo-novo-do-parecis', 'Campo Novo do Parecis (MT)', 'centro-oeste'],
  ['campo-grande', 'Campo Grande (MS)', 'centro-oeste'],
  ['dourados', 'Dourados (MS)', 'centro-oeste'],
  ['chapadao-do-sul', 'Chapadão do Sul (MS)', 'centro-oeste'],
  ['rio-verde', 'Rio Verde (GO)', 'go-mg'],
  ['triangulo-mineiro', 'Triângulo Mineiro (MG)', 'go-mg'],
  ['unai', 'Unaí (MG)', 'go-mg'],
  ['norte-do-pr', 'Norte do PR', 'sul'],
  ['oeste-do-pr', 'Oeste do PR', 'sul'],
  ['sudoeste-do-pr', 'Sudoeste do PR', 'sul'],
  ['cascavel', 'Cascavel (PR)', 'sul'],
  ['ponta-grossa', 'Ponta Grossa (PR)', 'sul'],
  ['campos-novos', 'Campos Novos (SC)', 'sul'],
  ['chapeco', 'Chapecó (SC)', 'sul'],
  ['passo-fundo', 'Passo Fundo (RS)', 'sul'],
  ['ijui', 'Ijuí (RS)', 'sul'],
  ['santa-rosa', 'Santa Rosa (RS)', 'sul'],
]

/**
 * Diferença (US¢/bu) do prêmio de cada ponto sobre o de Paranaguá, por cultura (FOB = prêmio do
 * porto, sem frete). Fonte: Hedgepoint Global Markets, Basis Soybeans and Corn, 04/11/2026. Um ponto
 * sem a cultura aqui (nem em `PROVISIONAL_BASE_USC`) não é oferecido para ela.
 */
const PREMIUM_OFFSET_USC: Record<string, Partial<Record<CropId, number>>> = {
  paranagua: { soja: 0, milho: 0 }, // referência
  barreiras: { soja: -53.7, milho: -79.3 },
  rondonopolis: { soja: -44.1, milho: -138.4 },
  sorriso: { soja: -60.2, milho: -178.4 },
  'primavera-do-leste': { soja: -2.8 }, // milho: sem dado PDF 04/11 (não oferecido)
  'campo-novo-do-parecis': { soja: -73.6, milho: -183.7 },
  'campo-grande': { soja: -30.0 }, // milho: sem dado PDF 04/11 (não oferecido)
  dourados: { soja: -17.9, milho: -148.3 },
  'chapadao-do-sul': { soja: -45.7, milho: -132.7 },
  'rio-verde': { soja: -59.1, milho: -127.7 },
  'triangulo-mineiro': { soja: -83.1, milho: -74.7 },
  unai: { soja: -82.2, milho: -91.5 },
  'norte-do-pr': { soja: 23.3, milho: -87.5 },
  'oeste-do-pr': { soja: 16.6 }, // milho: sem dado PDF 04/11 (não oferecido)
  'sudoeste-do-pr': { soja: 18.7, milho: -67.4 },
  cascavel: { milho: -88.2 }, // soja: sem dado PDF 04/11 (provisório em PROVISIONAL_BASE_USC)
  'ponta-grossa': { soja: 61.1, milho: -60.1 },
  'campos-novos': { soja: 11.9 }, // milho: não oferecido
  chapeco: { milho: -33.9 }, // soja: não oferecida
  'passo-fundo': { soja: 22.0, milho: -5.2 },
  ijui: { soja: 27.1, milho: -14.5 },
  'santa-rosa': { soja: 27.4, milho: -22.5 },
}

/**
 * AINDA PROVISÓRIO: base ABSOLUTA (US¢/bu) dos pontos/culturas que o PDF de 04/11/2026 não traz.
 * Valores que o app já tinha (antiga base de Paranaguá 61,70 soja / 98,50 milho + diferença provisória).
 * Sem dado no PDF: Itaqui e Barcarena (Arco Norte) e Cascavel (soja). Trocar quando houver fonte.
 */
const PROVISIONAL_BASE_USC: Record<string, Partial<Record<CropId, number>>> = {
  itaqui: { soja: 58.7, milho: 94.5 },
  barcarena: { soja: 56.7, milho: 92.5 },
  cascavel: { soja: 61.35 },
}

const round2 = (n: number) => Math.round(n * 100) / 100

export const FOB_POINTS: FobPoint[] = DEFS.map(([id, label, group]) => {
  const off = PREMIUM_OFFSET_USC[id] ?? {}
  const prov = PROVISIONAL_BASE_USC[id] ?? {}
  const crops = (Object.keys(PARANAGUA_BASE_USC) as CropId[]).filter(
    (c) => off[c] !== undefined || prov[c] !== undefined,
  )
  const baseUsc: Partial<Record<CropId, number>> = {}
  for (const c of crops) {
    baseUsc[c] = off[c] !== undefined ? round2(PARANAGUA_BASE_USC[c] + (off[c] as number)) : (prov[c] as number)
  }
  return { id, label, group, crops, baseUsc } satisfies FobPoint
})

export function findFob(id: string): FobPoint | undefined {
  return FOB_POINTS.find((p) => p.id === id)
}

/** Points offered for a crop (Paranaguá first, then by group). */
export function fobPointsFor(crop: CropId): FobPoint[] {
  return FOB_POINTS.filter((p) => p.crops.includes(crop))
}

/** True for a listed point of the crop or "Outro". */
export function isFobFor(id: unknown, crop: CropId): id is string {
  return id === OUTRO_FOB_ID || (typeof id === 'string' && fobPointsFor(crop).some((p) => p.id === id))
}

/** Label without the "(UF)" suffix, e.g. "Paranaguá". */
export function shortFobLabel(p: FobPoint): string {
  return p.label.replace(/\s*\([A-Z]{2}\)$/, '')
}
