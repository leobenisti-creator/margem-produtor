// Motor de adubação e defensivos por produto. Funções puras, sem estado.

export type PriceUnit = 't' | 'kg' | 'L' | 'ha';
export type DoseUnit = 'kg' | 't' | 'L';

export interface ProductRow {
  id: string;
  productId: string | null;
  name: string;
  /** Ignorado quando priceUnit === 'ha'. */
  dose: number;
  doseUnit: DoseUnit;
  price: number;
  priceUnit: PriceUnit;
  currency: 'BRL' | 'USD';
  /** Ignorado quando priceUnit === 'ha'. */
  applications: number;
  /**
   * Fórmula própria ("criar fórmula"): teores como fração 0..1, soma ≤ 1. Usada quando
   * `productId` é null ou 'custom'.
   */
  custom?: NutrientContents;
}

export interface NutrientContents {
  n: number;
  p2o5: number;
  k2o: number;
}

/** productId das linhas que usam uma fórmula própria. */
export const CUSTOM_PRODUCT_ID = 'custom';

/** Teores válidos: cada um finito e ≥ 0, soma ≤ 1 (100%). */
export function validCustomContents(c: unknown): c is NutrientContents {
  if (typeof c !== 'object' || c === null) return false;
  const o = c as Record<string, unknown>;
  const vals = [o.n, o.p2o5, o.k2o];
  if (!vals.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)) return false;
  return (vals as number[]).reduce((a, b) => a + b, 0) <= 1 + 1e-9;
}

/** Teores da linha: a fórmula própria quando houver, senão o adubo da lista. */
export function rowContents(r: ProductRow): NutrientContents | null {
  if ((r.productId === null || r.productId === CUSTOM_PRODUCT_ID) && r.custom && validCustomContents(r.custom)) {
    return r.custom;
  }
  return FERTILIZERS.find((x) => x.id === r.productId) ?? null;
}

export interface Fertilizer {
  id: string;
  name: string;
  /** Teores como fração (0.11 = 11%). */
  n: number;
  p2o5: number;
  k2o: number;
}

export const FERTILIZERS: Fertilizer[] = [
  { id: 'map', name: 'MAP 11-52-00', n: 0.11, p2o5: 0.52, k2o: 0 },
  { id: 'dap', name: 'DAP 18-46-00', n: 0.18, p2o5: 0.46, k2o: 0 },
  { id: 'ssp', name: 'Superfosfato simples 00-18-00', n: 0, p2o5: 0.18, k2o: 0 },
  { id: 'tsp', name: 'Superfosfato triplo 00-46-00', n: 0, p2o5: 0.46, k2o: 0 },
  { id: 'kcl', name: 'KCl 00-00-60', n: 0, p2o5: 0, k2o: 0.6 },
  { id: 'sulfato-potassio', name: 'Sulfato de potássio 00-00-50', n: 0, p2o5: 0, k2o: 0.5 },
  { id: 'ureia', name: 'Ureia 45-00-00', n: 0.45, p2o5: 0, k2o: 0 },
  { id: 'nitrato-amonio', name: 'Nitrato de amônio 32-00-00', n: 0.32, p2o5: 0, k2o: 0 },
  { id: 'sulfato-amonio', name: 'Sulfato de amônio 21-00-00', n: 0.21, p2o5: 0, k2o: 0 },
  { id: 'nitrato-calcio', name: 'Nitrato de cálcio 15-00-00', n: 0.15, p2o5: 0, k2o: 0 },
];

const isPos = (x: number): boolean => Number.isFinite(x) && x > 0;

/** Dose em kg/ha para entregar `points` kg de nutriente com um adubo de teor `content` (fração). */
export function doseForPoints(points: number, content: number): number {
  if (!isPos(content) || !Number.isFinite(points)) return 0;
  return points / content;
}

/** Custo em R$/ha da linha, ou null se a linha for inutilizável. */
export function rowCostPerHa(row: ProductRow, fx: number, freightPerTon: number): number | null {
  if (!isPos(row.price)) return null;
  let rate = 1;
  if (row.currency === 'USD') {
    if (!isPos(fx)) return null;
    rate = fx;
  }
  const price = row.price * rate;
  let cost: number;
  if (row.priceUnit === 'ha') {
    cost = price;
  } else {
    if (!isPos(row.dose)) return null;
    const freight = Number.isFinite(freightPerTon) && freightPerTon > 0 ? freightPerTon : 0;
    if (row.priceUnit === 't') {
      if (row.doseUnit === 'L') return null;
      const tons = row.doseUnit === 't' ? row.dose : row.dose / 1000;
      cost = tons * (price + freight);
    } else if (row.priceUnit === 'kg') {
      if (row.doseUnit === 'L') return null;
      const kg = row.doseUnit === 't' ? row.dose * 1000 : row.dose;
      cost = kg * price;
    } else {
      if (row.doseUnit !== 'L') return null;
      cost = row.dose * price;
    }
    if (row.doseUnit === 'L') cost *= isPos(row.applications) ? row.applications : 1;
  }
  return Number.isFinite(cost) ? cost : null;
}

/** Nutrientes entregues (kg/ha) pelas linhas que apontam para um adubo de FERTILIZERS. */
export function nutrientSupply(rows: ProductRow[]): { n: number; p2o5: number; k2o: number } {
  const out = { n: 0, p2o5: 0, k2o: 0 };
  for (const r of rows) {
    if (r.priceUnit === 'ha' || r.doseUnit === 'L' || !isPos(r.dose)) continue;
    const f = rowContents(r);
    if (!f) continue;
    const kg = r.doseUnit === 't' ? r.dose * 1000 : r.dose;
    out.n += kg * f.n;
    out.p2o5 += kg * f.p2o5;
    out.k2o += kg * f.k2o;
  }
  return out;
}

function suggestedRow(f: Fertilizer, dose: number): ProductRow {
  const builtIn = FERTILIZERS.some((x) => x.id === f.id);
  return {
    id: `sug-${f.id}`,
    productId: builtIn ? f.id : CUSTOM_PRODUCT_ID,
    ...(builtIn ? {} : { custom: { n: f.n, p2o5: f.p2o5, k2o: f.k2o } }),
    name: f.name,
    dose,
    doseUnit: 'kg',
    price: 0,
    priceUnit: 't',
    currency: 'BRL',
    applications: 1,
  };
}

/** Sugere linhas para as metas; o N do produto de P é descontado antes de dimensionar o de N. */
export function suggestForTargets(
  targets: { n: number; p2o5: number; k2o: number },
  picks: { p: string; k: string; n: string },
  /** Fórmulas criadas pelo cliente, disponíveis como escolha (ids próprios, ex.: 'custom:04-30-10'). */
  extra: Fertilizer[] = [],
): ProductRow[] {
  const find = (id: string) => FERTILIZERS.find((f) => f.id === id) ?? extra.find((f) => f.id === id);
  const rows: ProductRow[] = [];
  let nDelivered = 0;
  const p = find(picks.p);
  if (p && p.p2o5 > 0 && targets.p2o5 > 0) {
    const dose = doseForPoints(targets.p2o5, p.p2o5);
    nDelivered += dose * p.n;
    rows.push(suggestedRow(p, dose));
  }
  const k = find(picks.k);
  if (k && k.k2o > 0 && targets.k2o > 0) {
    rows.push(suggestedRow(k, doseForPoints(targets.k2o, k.k2o)));
  }
  const n = find(picks.n);
  if (n && n.n > 0) {
    const missing = targets.n - nDelivered;
    if (missing > 0) rows.push(suggestedRow(n, doseForPoints(missing, n.n)));
  }
  return rows;
}

/** Quantas sc/ha o custo/ha equivale. */
export function exchangeRatio(rowCostPerHa: number, farmPriceBrlPerSc: number): number | null {
  if (!isPos(farmPriceBrlPerSc) || !Number.isFinite(rowCostPerHa)) return null;
  return rowCostPerHa / farmPriceBrlPerSc;
}

/** Quantas sc equivalem a 1 t do insumo. */
export function scPerTon(pricePerTon: number, farmPriceBrlPerSc: number): number | null {
  if (!isPos(farmPriceBrlPerSc) || !Number.isFinite(pricePerTon)) return null;
  return pricePerTon / farmPriceBrlPerSc;
}
