import { describe, expect, it } from 'vitest';
import {
  FERTILIZERS,
  doseForPoints,
  exchangeRatio,
  nutrientSupply,
  rowCostPerHa,
  scPerTon,
  suggestForTargets,
  validCustomContents,
  type ProductRow,
} from './products';

const row = (over: Partial<ProductRow>): ProductRow => ({
  id: 'r',
  productId: null,
  name: 'x',
  dose: 1,
  doseUnit: 'kg',
  price: 1,
  priceUnit: 't',
  currency: 'BRL',
  applications: 1,
  ...over,
});

describe('FERTILIZERS', () => {
  it('tem 10 adubos com teores em fração', () => {
    expect(FERTILIZERS).toHaveLength(10);
    const map = FERTILIZERS.find((f) => f.id === 'map');
    expect(map).toMatchObject({ n: 0.11, p2o5: 0.52, k2o: 0 });
    expect(FERTILIZERS.find((f) => f.id === 'ureia')?.n).toBe(0.45);
    expect(FERTILIZERS.find((f) => f.id === 'kcl')?.k2o).toBe(0.6);
  });
});

describe('doseForPoints', () => {
  it('pontos / teor', () => {
    expect(doseForPoints(60, 0.52)).toBeCloseTo(115.38, 2);
    expect(doseForPoints(90, 0.52)).toBeCloseTo(173.08, 2);
  });
  it('teor inválido dá 0', () => {
    expect(doseForPoints(60, 0)).toBe(0);
  });
});

describe('rowCostPerHa', () => {
  it('MAP 173 kg a 4.200/t + frete 150', () => {
    const c = rowCostPerHa(row({ dose: 173, price: 4200 }), 5, 150);
    expect(c).toBeCloseTo(752.55, 2);
    expect(Math.round(c as number)).toBe(753);
  });
  it('KCl 100 kg a 3.400 + 150', () => {
    expect(rowCostPerHa(row({ dose: 100, price: 3400 }), 5, 150)).toBeCloseTo(355, 2);
  });
  it('calcário 1,5 t a 180 + 150', () => {
    expect(rowCostPerHa(row({ dose: 1.5, doseUnit: 't', price: 180 }), 5, 150)).toBeCloseTo(495, 2);
  });
  it('priceUnit ha usa o preço direto', () => {
    expect(rowCostPerHa(row({ priceUnit: 'ha', price: 60, dose: 0, applications: 3 }), 5, 150)).toBe(60);
  });
  it('US$ converte com fx e frete só em t', () => {
    const c = rowCostPerHa(row({ dose: 100, price: 780, currency: 'USD' }), 5.4998, 150);
    expect(c).toBeCloseTo(0.1 * (780 * 5.4998 + 150), 2);
  });
  it('kg e L: dose x preço; L multiplica aplicações, sem frete', () => {
    expect(rowCostPerHa(row({ dose: 2, priceUnit: 'kg', price: 30 }), 5, 150)).toBe(60);
    expect(rowCostPerHa(row({ dose: 0.5, doseUnit: 'L', priceUnit: 'L', price: 40, applications: 3 }), 5, 150)).toBe(60);
  });
  it('USD em ha converte', () => {
    expect(rowCostPerHa(row({ priceUnit: 'ha', price: 10, currency: 'USD' }), 5, 150)).toBe(50);
  });
  it('preço <= 0 ou fx <= 0 em US$ dá null', () => {
    expect(rowCostPerHa(row({ price: 0 }), 5, 150)).toBeNull();
    expect(rowCostPerHa(row({ price: -1 }), 5, 150)).toBeNull();
    expect(rowCostPerHa(row({ price: 780, currency: 'USD' }), 0, 150)).toBeNull();
    expect(rowCostPerHa(row({ price: 4200 }), 0, 150)).not.toBeNull();
  });
  it('linha inutilizável ou não finita dá null', () => {
    expect(rowCostPerHa(row({ dose: 0, price: 10 }), 5, 150)).toBeNull();
    expect(rowCostPerHa(row({ dose: NaN, price: 10 }), 5, 150)).toBeNull();
    expect(rowCostPerHa(row({ price: Infinity }), 5, 150)).toBeNull();
    expect(rowCostPerHa(row({ doseUnit: 'L', price: 10 }), 5, 150)).toBeNull();
  });
});

describe('nutrientSupply', () => {
  it('MAP 173 kg entrega N ≈ 19,0 e P2O5 ≈ 90', () => {
    const s = nutrientSupply([row({ productId: 'map', dose: 173 })]);
    expect(s.n).toBeCloseTo(19.03, 2);
    expect(s.p2o5).toBeCloseTo(89.96, 2);
    expect(s.k2o).toBe(0);
  });
  it('soma linhas, converte t e ignora produtos desconhecidos', () => {
    const s = nutrientSupply([
      row({ productId: 'kcl', dose: 0.1, doseUnit: 't' }),
      row({ productId: null, dose: 500 }),
    ]);
    expect(s.k2o).toBeCloseTo(60, 6);
  });
});

describe('suggestForTargets', () => {
  it('dimensiona P e K e a ureia só com o N que falta', () => {
    const rows = suggestForTargets({ n: 20, p2o5: 90, k2o: 60 }, { p: 'map', k: 'kcl', n: 'ureia' });
    const byId = Object.fromEntries(rows.map((r) => [r.productId, r]));
    expect(rows).toHaveLength(3);
    expect(byId.map.dose).toBeCloseTo(173.08, 2);
    expect(byId.kcl.dose).toBeCloseTo(100, 2);
    expect(byId.ureia.dose).toBeCloseTo(2.14, 1);
    expect(byId.ureia.dose).toBeCloseTo(2.2, 0);
    expect(byId.map.doseUnit).toBe('kg');
    expect(byId.map.priceUnit).toBe('t');
  });
  it('N já coberto pelo produto de P não gera ureia negativa', () => {
    const rows = suggestForTargets({ n: 10, p2o5: 90, k2o: 0 }, { p: 'map', k: 'kcl', n: 'ureia' });
    expect(rows.map((r) => r.productId)).toEqual(['map']);
  });
});

describe('exchangeRatio e scPerTon', () => {
  it('relação de troca em sc/ha', () => {
    expect(exchangeRatio(1813, 125.11)).toBeCloseTo(14.49, 2);
    expect(scPerTon(4350, 125.11)).toBeCloseTo(34.77, 2);
  });
  it('preço da saca <= 0 dá null', () => {
    expect(exchangeRatio(1813, 0)).toBeNull();
    expect(scPerTon(4350, -1)).toBeNull();
  });
});

describe('fórmula própria (custom)', () => {
  const f04 = { n: 0.04, p2o5: 0.3, k2o: 0.1 }
  it('uma linha 04-30-10 de 200 kg/ha entrega N 8, P₂O₅ 60 e K₂O 20', () => {
    const s = nutrientSupply([row({ productId: 'custom', name: '04-30-10', dose: 200, custom: f04 })])
    expect(s.n).toBeCloseTo(8, 9)
    expect(s.p2o5).toBeCloseTo(60, 9)
    expect(s.k2o).toBeCloseTo(20, 9)
    // productId null with contents also counts
    expect(nutrientSupply([row({ productId: null, dose: 200, custom: f04 })]).p2o5).toBeCloseTo(60, 9)
  })

  it('validCustomContents: frações 0..1, cada ≥ 0, soma ≤ 1', () => {
    expect(validCustomContents(f04)).toBe(true)
    expect(validCustomContents({ n: 0.5, p2o5: 0.4, k2o: 0.2 })).toBe(false)
    expect(validCustomContents({ n: -0.1, p2o5: 0, k2o: 0 })).toBe(false)
    expect(validCustomContents({ n: Number.NaN, p2o5: 0, k2o: 0 })).toBe(false)
  })

  it('suggestForTargets aceita uma fórmula criada como adubo de P e credita o N dela', () => {
    const extra = [{ id: 'custom:04-30-10', name: '04-30-10', ...f04 }]
    const rows = suggestForTargets({ n: 20, p2o5: 60, k2o: 0 }, { p: 'custom:04-30-10', k: 'kcl', n: 'ureia' }, extra)
    expect(rows[0]).toMatchObject({ productId: 'custom', name: '04-30-10', custom: f04, price: 0 })
    expect(rows[0].dose).toBeCloseTo(200, 9)
    // 200 kg × 4% = 8 kg of N delivered → 12 kg missing → urea 26,67 kg
    expect(rows[1].productId).toBe('ureia')
    expect(rows[1].dose).toBeCloseTo(12 / 0.45, 6)
  })
})
