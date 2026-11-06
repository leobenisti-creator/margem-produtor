import { describe, expect, it } from 'vitest'
import { COST_CATEGORY_IDS } from './types'
import { COST_GROUP_SECTIONS, COST_ITEMS, itemsOf } from './costItems'

describe('COST_ITEMS', () => {
  it('has unique ids, valid groups and ids prefixed by a group key', () => {
    const ids = COST_ITEMS.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const i of COST_ITEMS) {
      expect(COST_CATEGORY_IDS).toContain(i.group)
      expect(i.label.length).toBeGreaterThan(0)
    }
  })

  it('itemsOf(fertilizantes) has corretivos, macro and micro', () => {
    const ids = itemsOf('fertilizantes').map((i) => i.id)
    expect(ids).toEqual(expect.arrayContaining(['adubacao.corretivos', 'adubacao.macro', 'adubacao.micro']))
  })

  it('sections cover every group exactly once', () => {
    const groups = COST_GROUP_SECTIONS.flatMap((s) => s.groups)
    expect([...groups].sort()).toEqual([...COST_CATEGORY_IDS].sort())
    expect(COST_GROUP_SECTIONS.map((s) => s.id)).toEqual(['insumos', 'operacao', 'estrutura'])
  })
})
