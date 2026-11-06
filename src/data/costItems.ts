import type { CostCategoryId } from './types'

/**
 * Cost items shown inside each of the 8 cost groups. Only the structure (names, groups) lives here: every
 * value is typed by the producer. Pós-produção is NOT an item. Every group also has a synthetic
 * `<prefix>.demais` ("Demais itens") item for whatever the listed items do not cover; it is not listed
 * here (see `allItemsOf`).
 */
export interface CostItemDef {
  id: string
  group: CostCategoryId
  label: string
}

export const COST_ITEMS: CostItemDef[] = [
  { id: 'sementes.cultura', group: 'sementes', label: 'Semente da cultura' },
  { id: 'sementes.cobertura', group: 'sementes', label: 'Semente de cobertura' },
  { id: 'adubacao.corretivos', group: 'fertilizantes', label: 'Corretivos de solo' },
  { id: 'adubacao.macro', group: 'fertilizantes', label: 'Macronutrientes' },
  { id: 'adubacao.micro', group: 'fertilizantes', label: 'Micronutrientes' },
  { id: 'defensivos.herbicida', group: 'defensivos', label: 'Herbicidas' },
  { id: 'defensivos.fungicida', group: 'defensivos', label: 'Fungicidas' },
  { id: 'defensivos.inseticida', group: 'defensivos', label: 'Inseticidas' },
  { id: 'defensivos.adjuvantes', group: 'defensivos', label: 'Adjuvantes e outros' },
  {
    id: 'operacoes.diesel',
    group: 'operacoes',
    label: 'Operações mecanizadas (diesel e lubrificantes)',
  },
  { id: 'operacoes.terceirizados', group: 'operacoes', label: 'Serviços terceirizados' },
  { id: 'operacoes.manutencao', group: 'operacoes', label: 'Manutenção' },
  { id: 'operacoes.depreciacao', group: 'operacoes', label: 'Depreciações' },
  { id: 'maoDeObra.contratada', group: 'maoDeObra', label: 'Mão de obra contratada' },
  { id: 'maoDeObra.familiar', group: 'maoDeObra', label: 'Mão de obra familiar' },
  { id: 'arrendamento.valor', group: 'arrendamento', label: 'Arrendamento' },
  { id: 'financeiro.juros', group: 'financeiro', label: 'Juros de financiamento' },
  { id: 'financeiro.seguroProducao', group: 'financeiro', label: 'Seguro da produção' },
  { id: 'financeiro.seguroMaquinas', group: 'financeiro', label: 'Seguro de máquinas e equipamentos' },
  { id: 'outros.impostos', group: 'outros', label: 'Impostos e taxas' },
  { id: 'outros.assistencia', group: 'outros', label: 'Assistência técnica' },
  { id: 'outros.despesasGerais', group: 'outros', label: 'Despesas gerais' },
]

export function itemsOf(group: CostCategoryId): CostItemDef[] {
  return COST_ITEMS.filter((i) => i.group === group)
}

/** Item-id prefix of each group (the `fertilizantes` group keeps its id but its items are `adubacao.*`). */
export const GROUP_ITEM_PREFIX: Record<CostCategoryId, string> = {
  sementes: 'sementes',
  fertilizantes: 'adubacao',
  defensivos: 'defensivos',
  operacoes: 'operacoes',
  maoDeObra: 'maoDeObra',
  arrendamento: 'arrendamento',
  financeiro: 'financeiro',
  outros: 'outros',
}

export const DEMAIS_LABEL = 'Demais itens'

/** Synthetic item of a group (`<prefix>.demais`): the costs not covered by the listed items. */
export function demaisItemOf(group: CostCategoryId): CostItemDef {
  return { id: `${GROUP_ITEM_PREFIX[group]}.demais`, group, label: DEMAIS_LABEL }
}

export function isDemaisItem(itemId: string): boolean {
  return itemId.endsWith('.demais')
}

/** Items of a group plus its "Demais itens" item (last). */
export function allItemsOf(group: CostCategoryId): CostItemDef[] {
  return [...itemsOf(group), demaisItemOf(group)]
}

/** Group of an item id (listed items and the synthetic remainders), or undefined. */
export function groupOfItem(itemId: string): CostCategoryId | undefined {
  const listed = COST_ITEMS.find((i) => i.id === itemId)
  if (listed) return listed.group
  const g = (Object.keys(GROUP_ITEM_PREFIX) as CostCategoryId[]).find(
    (k) => `${GROUP_ITEM_PREFIX[k]}.demais` === itemId,
  )
  return g
}

export const COST_GROUP_SECTIONS: { id: 'insumos' | 'operacao' | 'estrutura'; label: string; groups: CostCategoryId[] }[] = [
  { id: 'insumos', label: 'Insumos', groups: ['sementes', 'fertilizantes', 'defensivos'] },
  { id: 'operacao', label: 'Operação', groups: ['operacoes', 'maoDeObra'] },
  { id: 'estrutura', label: 'Estrutura e financeiro', groups: ['arrendamento', 'financeiro', 'outros'] },
]
