"""Build src/data/reference-mt.json (IMEA cost, yield and freight by MT region).

Sources (read-only, outside the repo):
  16b_imea_custo_producao_mt_longo.csv   cost, R$/ha, long format
  33_imea_produtividade_mt_historico.csv yield, sc/ha (soja)
  36b_imea_frete_mt.csv                  freight, R$/t

Cost method
- Per crop, pick the latest month that has a full cost breakdown (the 25/26
  safra rows for both crops only carry 2 items, so they are unusable).
- Only the IMEA *group* rows are summed (so leaves/aggregates are never double
  counted); their total must match IMEA's COT row within 0.5% (asserted).
- COT = COE + depreciation + family labour. IMEA's "custo de oportunidade" (J)
  is a non-cash imputed cost and is NOT included.
- Soja 2026/27 is published per city with an empty `regiao`; each city is
  mapped to its region using the city->region pairs found elsewhere in the same
  file, and the region value is the mean across its cities.
"""
import csv
import json
import statistics
import unicodedata
from collections import defaultdict
from pathlib import Path

SRC = Path(r"dados\atualizacao_2026-10-27")
OUT = Path(__file__).resolve().parent.parent / "src" / "data" / "reference-mt.json"

CATEGORIES = ["sementes", "fertilizantes", "defensivos", "operacoes", "maoDeObra", "arrendamento", "financeiro", "outros"]
MT_TOTAL_RAW = "MT total (sem região)"
# Pós-produção (armazenagem, transporte da produção, classificação) is excluded from the
# 8 categories and from totalBrlHa: the app has separate freight/port-fee inputs.
POS_PROD = {"soja": "E. PÓS-PRODUÇÃO", "milho": "Pós-Produção"}

# --- IMEA item -> CostCategoryId (group rows only; anything not listed in
# GROUPS or IGNORED falls into `outros` and is reported). ----------------------
SOJA_GROUPS = {  # layout with numbered groups (safra 2026/27)
    "1. SEMENTES": "sementes",
    "2. FERTILIZANTES E CORRETIVOS": "fertilizantes",
    "3. DEFENSIVOS": "defensivos",
    "4. OPERAÇÕES MECANIZADAS (óleo diesel e lubrificantes)": "operacoes",
    "5. SERVIÇOS TERCEIRIZADOS": "operacoes",
    "B. MANUTENÇÃO": "operacoes",  # manutenção de máquinas/benfeitorias
    "H. DEPRECIAÇÕES": "operacoes",  # máquinas e implementos
    "6. MÃO DE OBRA": "maoDeObra",
    "I. MÃO-DE-OBRA FAMILIAR": "maoDeObra",  # pró-labore
    "G. ARRENDAMENTO": "arrendamento",
    "D. FINANCEIRAS": "financeiro",  # financiamentos + seguros
    "C. IMPOSTOS E TAXAS": "outros",
    "F. OUTROS CUSTOS": "outros",
}
SOJA_TOTAL = "COT (COE + H + I)"

MILHO_GROUPS = {  # flat layout (safra 24/25)
    "Sementes": "sementes",
    "Fertilizantes e Corretivos": "fertilizantes",
    "Defensivos": "defensivos",
    "Operações Mecanizadas": "operacoes",
    "Serviços Terceirizados": "operacoes",
    "Manutenção": "operacoes",
    "Depreciações": "operacoes",
    "Mão de Obra": "maoDeObra",
    "Mão-de-obra Familiar": "maoDeObra",
    "Arrendamento": "arrendamento",
    "Financeiras": "financeiro",
    "Impostos e Taxas": "outros",
    "Outros Custos": "outros",
}
MILHO_TOTAL = "Custo Operacional Total"

# Leaf / aggregate rows already contained in a group above (or non-cash
# aggregates). Not summed. Used only to detect genuinely unmapped items.
IGNORED = {
    "A. CUSTEIO (1+2...+6)", "COE (A + B + ... + F + G)", "COT (COE + H + I)", "CT (COT + J)",
    "J. CUSTO DE OPORTUNIDADE", "Custo de Oportunidade", "Custo de Oportunidade da Terra",
    "Capital Circulante", "Máquinas, Implem., Equip. e Utilit.", "Benfeitorias",
    "Custeio", "Custo Operacional Efetivo", "Custo Operacional Total", "Custo Total",
    "Semente de Soja", "Semente de milho", "Semente de Cobertura", "Corretivo de Solo",
    "Macronutriente", "Micronutriente", "Fungicida", "Herbicida", "Inseticida", "Inseticida ",
    "Adjuvante/Outros", "Outros Insumos", "Manejo Pré Plantio", "Adubação e Plantio",
    "Aplicações com Máquinas", "Aplicações com Avião", "Colheita", "Manejo Pós Colheita",
    "Permanente", "Temporária", "Manutenção Máq. Equip. Utilit.", "Manutenção Benfeitorias",
    "Funrural", "Fethab I", "Fethab II", "ITR", "Facs", "Outros Impostos e Taxas", "Impostos e Taxas ",
    "Financiamentos", "Seguro da Produção", "Seguro Máq. Equip. Utilit.",
    "Classificação e Beneficiamento", "Armazenagem", "Transporte da Produção",
    "Assistência Técnica", "Combustível Utilitários", "Despesas Gerais", "Pró-Labore",
    "Depreciação Máquinas", "Depreciação Implementos", "Depreciação Equipamentos",
    "Depreciação Utilitários", "Depreciação Benfeitorias", "E. PÓS-PRODUÇÃO", "Pós-Produção",
}
# Names that are a group in one layout and a leaf of a numbered group in the other:
LEAF_IN_SOJA = {"Serviços Terceirizados", "Arrendamento"}


# --- per-item ids (keep in sync with src/data/costItems.ts) -> IMEA row names ----
# Each id sums the listed IMEA rows (mean across the region's cities). Items whose
# regional mean rounds to 0 (or with no row) are ABSENT from itemBrlHa. Every group
# also gets `<group>.demais` = group value - sum of its mapped items, written only when it is
# >= 0.5 R$/ha; a negative remainder (rounding) is clamped to 0, i.e. not written.
ITEM_GROUP = {
    "sementes": "sementes", "adubacao": "fertilizantes", "defensivos": "defensivos",
    "operacoes": "operacoes", "maoDeObra": "maoDeObra", "arrendamento": "arrendamento",
    "financeiro": "financeiro", "outros": "outros",
}
ITEM_ROWS = {  # id -> {layout: [IMEA names]}; layout "soja" (numbered) / "milho" (flat)
    "sementes.cultura": {"soja": ["Semente de Soja"], "milho": ["Semente de milho"]},
    "sementes.cobertura": {"soja": ["Semente de Cobertura"], "milho": ["Semente de Cobertura"]},
    "adubacao.corretivos": {"soja": ["Corretivo de Solo"], "milho": ["Corretivo de Solo"]},
    "adubacao.macro": {"soja": ["Macronutriente"], "milho": ["Macronutriente"]},
    "adubacao.micro": {"soja": ["Micronutriente"], "milho": ["Micronutriente"]},
    "defensivos.herbicida": {"soja": ["Herbicida"], "milho": ["Herbicida"]},
    "defensivos.fungicida": {"soja": ["Fungicida"], "milho": ["Fungicida"]},
    "defensivos.inseticida": {"soja": ["Inseticida", "Inseticida "], "milho": ["Inseticida", "Inseticida "]},
    "defensivos.adjuvantes": {"soja": ["Adjuvante/Outros"], "milho": ["Adjuvante/Outros"]},
    "operacoes.diesel": {"soja": ["4. OPERAÇÕES MECANIZADAS (óleo diesel e lubrificantes)"], "milho": ["Operações Mecanizadas"]},
    "operacoes.terceirizados": {"soja": ["5. SERVIÇOS TERCEIRIZADOS"], "milho": ["Serviços Terceirizados"]},
    "operacoes.manutencao": {"soja": ["B. MANUTENÇÃO"], "milho": ["Manutenção"]},
    "operacoes.depreciacao": {"soja": ["H. DEPRECIAÇÕES"], "milho": ["Depreciações"]},
    "maoDeObra.contratada": {"soja": ["6. MÃO DE OBRA"], "milho": ["Mão de Obra"]},
    "maoDeObra.familiar": {"soja": ["I. MÃO-DE-OBRA FAMILIAR"], "milho": ["Mão-de-obra Familiar"]},
    "arrendamento.valor": {"soja": ["G. ARRENDAMENTO"], "milho": ["Arrendamento"]},
    "financeiro.juros": {"soja": ["Financiamentos"], "milho": ["Financiamentos"]},
    "financeiro.seguroProducao": {"soja": ["Seguro da Produção"], "milho": ["Seguro da Produção"]},
    "financeiro.seguroMaquinas": {"soja": ["Seguro Máq. Equip. Utilit."], "milho": ["Seguro Máq. Equip. Utilit."]},
    "outros.impostos": {"soja": ["C. IMPOSTOS E TAXAS"], "milho": ["Impostos e Taxas", "Impostos e Taxas "]},
    "outros.assistencia": {"soja": ["Assistência Técnica"], "milho": ["Assistência Técnica"]},
    "outros.despesasGerais": {"soja": ["Despesas Gerais"], "milho": ["Despesas Gerais"]},
}


def item_values(cities, layout, cost):
    """Per-item R$/ha for one region (see ITEM_ROWS); `cost` = rounded category costs."""
    out = {}
    for iid, by_layout in ITEM_ROWS.items():
        vals = [
            statistics.mean(c[n] for c in cities if n in c)
            for n in by_layout[layout]
            if any(n in c for c in cities)
        ]
        if vals and round(sum(vals), 2) != 0:
            out[iid] = round(sum(vals), 2)
    for prefix, cat in ITEM_GROUP.items():
        mapped = sum(v for k, v in out.items() if k.startswith(prefix + "."))
        rest = max(0.0, round(cost[cat] - mapped, 2))
        if rest >= 0.5:
            out[prefix + ".demais"] = rest
    return out


def read(name):
    with open(SRC / name, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return "-".join("".join(c.lower() if c.isalnum() else " " for c in s).split())


def ncity(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().casefold()


cost_rows = [r for r in read("16b_imea_custo_producao_mt_longo.csv") if r["unidade"] == "R$/ha"]
items_seen = defaultdict(set)
for r in cost_rows:
    items_seen[r["cultura"]].add(r["item"])
for cult, its in items_seen.items():
    print(f"[{cult}] distinct IMEA items ({len(its)}):", sorted(its))

# city -> region from rows that have both
city_region = {}
for r in cost_rows:
    if r["regiao"] and r["regiao"] != MT_TOTAL_RAW and r["cidade"]:
        city_region[ncity(r["cidade"])] = r["regiao"]


def build_crop(cultura, groups, total_item):
    rows = [r for r in cost_rows if r["cultura"] == cultura]
    with_total = [r for r in rows if r["item"] == total_item]
    mes = max(r["mes"] for r in with_total)
    safra = next(r["safra"] for r in with_total if r["mes"] == mes)
    sl = [r for r in rows if r["mes"] == mes and r["safra"] == safra]
    ignored = IGNORED | (LEAF_IN_SOJA if cultura == "soja" else set())
    cells = defaultdict(dict)  # (region, city) -> {item: value}
    skipped = set()
    for r in sl:
        reg = r["regiao"] or city_region.get(ncity(r["cidade"]))
        if not reg:
            skipped.add(r["cidade"])
            continue
        key = (reg, r["cidade"] or "")
        assert r["item"] not in cells[key], f"duplicate {key} {r['item']}"
        cells[key][r["item"]] = float(r["valor"])
    unmapped = {i for c in cells.values() for i in c if i not in groups and i not in ignored}
    print(f"[{cultura}] safra {safra} month {mes}; unmapped->outros: {sorted(unmapped)}; cities w/o region: {sorted(skipped)}")
    by_region = defaultdict(list)
    for (reg, _), vals in cells.items():
        by_region[reg].append(vals)
    out = {}
    for reg, cities in by_region.items():
        cost = dict.fromkeys(CATEGORIES, 0.0)
        for item in {i for c in cities for i in c}:
            cat = groups.get(item) or ("outros" if item in unmapped else None)
            if cat:
                cost[cat] += statistics.mean(c[item] for c in cities if item in c)
        pos = statistics.mean(c[POS_PROD[cultura]] for c in cities)
        total = statistics.mean(c[total_item] for c in cities) - pos
        diff = abs(sum(cost.values()) - total) / total
        assert diff < 0.005, f"{cultura} {reg}: categories off by {diff:.4%}"
        rcost = {k: round(v, 2) for k, v in cost.items()}
        out[reg] = {
            "safra": safra,
            "mes": mes,
            "costBrlHa": {k: round(v, 2) for k, v in cost.items()},
            "totalBrlHa": round(total, 2),
            "posProducaoBrlHa": round(pos, 2),
            "itemBrlHa": item_values(cities, cultura, rcost),
        }
    return out, {"safra": safra, "mes": mes}


soja, soja_meta = build_crop("soja", SOJA_GROUPS, SOJA_TOTAL)
milho, milho_meta = build_crop("milho", MILHO_GROUPS, MILHO_TOTAL)

# --- yield (soja, latest estimate per region) --------------------------------
ylds = {}
for r in read("33_imea_produtividade_mt_historico.csv"):
    key = MT_TOTAL_RAW if r["regiao"] == "MT total" else r["regiao"]
    if key not in ylds or r["data_ref"] > ylds[key][0]:
        ylds[key] = (r["data_ref"], r["safra"], float(r["produtividade_sc_ha"]))

# --- freight: latest date per origin region with a Paranagua destination -----
PORT = "Paranaguá"
fr = defaultdict(list)
for r in read("36b_imea_frete_mt.csv"):
    if r["destino_cidade"] == PORT and r["unidade"] == "R$/t" and r["valor"]:
        fr[r["origem_regiao"]].append(r)
freight = {}
for reg, rs in fr.items():
    d = max(r["data"] for r in rs)
    day = [r for r in rs if r["data"] == d]
    freight[reg] = (d, statistics.mean(float(r["valor"]) for r in day), sorted({r["origem_cidade"] for r in day}))

# --- assemble ---------------------------------------------------------------
ORDER = [MT_TOTAL_RAW, "Centro-Sul", "Médio-Norte", "Nordeste", "Noroeste", "Norte", "Oeste", "Sudeste"]
regions = []
for name in ORDER:
    if name not in soja and name not in milho:
        continue
    reg = {
        "id": "mt-total" if name == MT_TOTAL_RAW else slug(name),
        "label": "Mato Grosso (média)" if name == MT_TOTAL_RAW else name,
    }
    by_crop = {cid: dict(data[name]) for cid, data in (("soja", soja), ("milho", milho)) if name in data}
    if name in ylds and "soja" in by_crop:
        by_crop["soja"]["yieldScHa"] = round(ylds[name][2], 1)
    if "soja" in by_crop:
        s = by_crop["soja"]
        reg["costBrlHa"], reg["totalBrlHa"] = s["costBrlHa"], s["totalBrlHa"]
        reg["posProducaoBrlHa"] = s["posProducaoBrlHa"]
        if "yieldScHa" in s:
            reg["yieldScHa"] = s["yieldScHa"]
    if name in freight:
        reg["freightBrlTon"] = round(freight[name][1], 2)
        reg["freightRef"] = {"data": freight[name][0], "destino": PORT, "origens": freight[name][2]}
    reg["byCrop"] = by_crop
    regions.append(reg)

note = (
    f"IMEA (arquivos 16b/33/36b da atualização de 27/10/2026). Custo soja: safra {soja_meta['safra']}, mês {soja_meta['mes']}, "
    "publicado por cidade (sem região) e agregado pela média das cidades de cada região "
    "(Alta Floresta não tem região no arquivo e fica de fora das regiões; entra só na linha MT total). "
    f"Custo milho: safra {milho_meta['safra']}, mês {milho_meta['mes']} (a safra 25/26 só traz 2 itens, inutilizável). "
    "Total = COT IMEA (COE + depreciação + mão de obra familiar) menos pós-produção, sem o custo de oportunidade (não é desembolso); "
    "as 8 categorias somam esse total (verificado < 0,5%). O grupo IMEA 'E. PÓS-PRODUÇÃO' (soja) / 'Pós-Produção' (milho) "
    "(armazenagem, transporte da produção, classificação) fica FORA das categorias e do total, em posProducaoBrlHa (informativo), "
    "para não contar duas vezes com os campos de frete e taxas portuárias do app. "
    "Produtividade: soja, última estimativa por região (safra 26/27, projeção IMEA 01/10/2026); milho sem produtividade na base. "
    f"Frete: R$/t da data mais recente por região de origem com destino {PORT} (porto de referência do basis; "
    "o destino mais frequente varia entre Rondonópolis, Santos, Miritituba e Porto Velho, então foi fixado Paranaguá por coerência), "
    "média das cidades de origem na data; Norte e Noroeste não têm frete publicado."
)
OUT.write_text(json.dumps({"note": note, "regions": regions}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("wrote", OUT, [r["id"] for r in regions])
