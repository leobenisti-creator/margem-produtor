import {
  DEFAULT_FOB_ID,
  FOB_GROUP_LABELS,
  FOB_POINTS,
  OUTRO_FOB_ID,
  PROVISORIO,
  findFob,
  fobPointsFor,
} from './fobPoints'

const SOJA = [
  'Paranaguá', 'Itaqui', 'Barcarena', 'Barreiras', 'Rondonópolis', 'Sorriso', 'Primavera do Leste',
  'Campo Novo do Parecis', 'Campo Grande', 'Dourados', 'Chapadão do Sul', 'Rio Verde', 'Triângulo Mineiro',
  'Unaí', 'Norte do PR', 'Oeste do PR', 'Sudoeste do PR', 'Cascavel', 'Ponta Grossa', 'Campos Novos',
  'Passo Fundo', 'Ijuí', 'Santa Rosa',
]
const MILHO = [
  'Paranaguá', 'Itaqui', 'Barcarena', 'Barreiras', 'Rio Verde', 'Rondonópolis', 'Sorriso', 'Campo Novo do Parecis',
  'Dourados', 'Chapadão do Sul', 'Triângulo Mineiro', 'Unaí', 'Norte do PR', 'Cascavel', 'Sudoeste do PR',
  'Ponta Grossa', 'Chapecó', 'Passo Fundo', 'Ijuí', 'Santa Rosa',
]
/** Label without the "(UF)" suffix. */
const name = (label: string) => label.replace(/\s*\([A-Z]{2}\)$/, '')

describe('FOB points (lista do Leo)', () => {
  it('soja has the 23 points and milho the 20 points of the list (Barreiras entered milho with the 04/11 report)', () => {
    expect(fobPointsFor('soja')).toHaveLength(23)
    expect(fobPointsFor('milho')).toHaveLength(20)
    expect(fobPointsFor('soja').map((p) => name(p.label)).sort()).toEqual([...SOJA].sort())
    expect(fobPointsFor('milho').map((p) => name(p.label)).sort()).toEqual([...MILHO].sort())
  })

  it('Paranaguá is the reference and comes first for both crops', () => {
    expect(DEFAULT_FOB_ID).toBe('paranagua')
    expect(fobPointsFor('soja')[0].id).toBe('paranagua')
    expect(fobPointsFor('milho')[0].id).toBe('paranagua')
  })

  it('Itaqui and Barcarena exist for both crops, in the ports group', () => {
    for (const id of ['itaqui', 'barcarena']) {
      const p = findFob(id)
      expect(p?.group).toBe('portos')
      expect(p?.crops).toEqual(expect.arrayContaining(['soja', 'milho']))
    }
  })

  it('groups have Portuguese labels and points are ordered by group', () => {
    expect(FOB_GROUP_LABELS).toEqual({
      portos: 'Portos',
      matopiba: 'Matopiba',
      'centro-oeste': 'Centro-Oeste',
      'go-mg': 'GO e MG',
      sul: 'Sul',
    })
    const order = Object.keys(FOB_GROUP_LABELS)
    for (const crop of ['soja', 'milho'] as const) {
      const idx = fobPointsFor(crop).map((p) => order.indexOf(p.group))
      expect(idx).toEqual([...idx].sort((a, b) => a - b))
    }
  })

  it('bases are provisional, Paranaguá = the Hedgepoint 04/11/2026 base, every other point is distinct', () => {
    expect(PROVISORIO).toBe(true)
    const paranagua = { soja: 3.5, milho: 97.6 }
    for (const crop of ['soja', 'milho'] as const) {
      const pts = fobPointsFor(crop)
      const ref = paranagua[crop]
      expect(findFob('paranagua')?.baseUsc[crop]).toBe(ref)
      const bases = pts.map((p) => p.baseUsc[crop])
      for (const b of bases) expect(Number.isFinite(b)).toBe(true)
      expect(new Set(bases).size).toBe(pts.length)
    }
  })

  it('points of the 04/11 report = Paranaguá base + the report offset (spot checks)', () => {
    expect(findFob('sorriso')?.baseUsc).toEqual({ soja: -56.7, milho: -80.8 })
    expect(findFob('barreiras')?.baseUsc).toEqual({ soja: -50.2, milho: 18.3 })
    expect(findFob('ponta-grossa')?.baseUsc).toEqual({ soja: 64.6, milho: 37.5 })
    expect(findFob('passo-fundo')?.baseUsc).toEqual({ soja: 25.5, milho: 92.4 })
  })

  it('points without data in the report keep their previous absolute (provisional) value', () => {
    expect(findFob('itaqui')?.baseUsc).toEqual({ soja: 58.7, milho: 94.5 })
    expect(findFob('barcarena')?.baseUsc).toEqual({ soja: 56.7, milho: 92.5 })
    expect(findFob('cascavel')?.baseUsc.soja).toBe(61.35)
    // Report data wins for the other crop of the same point.
    expect(findFob('cascavel')?.baseUsc.milho).toBe(9.4)
  })

  it('a point carries only its id, label, group, crops and base (no regional reference)', () => {
    for (const p of FOB_POINTS) {
      expect(Object.keys(p).sort()).toEqual(['baseUsc', 'crops', 'group', 'id', 'label'])
    }
  })

  it('"Outro" is not a FOB point and unknown ids are not found', () => {
    expect(findFob(OUTRO_FOB_ID)).toBeUndefined()
    expect(findFob('nope')).toBeUndefined()
    expect(fobPointsFor('milho').some((p) => p.id === 'campos-novos')).toBe(false)
    expect(fobPointsFor('soja').some((p) => p.id === 'chapeco')).toBe(false)
  })
})
