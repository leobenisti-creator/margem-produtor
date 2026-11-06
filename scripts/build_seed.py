"""Build src/data/seed-2026-10-26.json from the 27/10 data update CSVs.

Only the 2026-10-26 row of the price file is used (the 2026-10-27 row is
incomplete). Source CSVs live outside the repo (read-only).
"""
import csv
import json
from pathlib import Path

SRC = Path(r"dados\atualizacao_2026-10-27")
OUT = Path(__file__).resolve().parent.parent / "src" / "data" / "seed-2026-10-26.json"
DAY = "2026-10-26"


def read(name):
    with open(SRC / name, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def q(value, unit, source, as_of=DAY):
    return {"value": value, "unit": unit, "asOf": as_of, "source": source, "kind": "fechamento"}


prices = [r for r in read("09b_precos_26_27_out.csv") if r["data"] == DAY]
assert len(prices) == 1, "expected exactly one 2026-10-26 row"
p = prices[0]
f = float

SRC_CBOT = "CBOT: Yahoo Finance (não oficial)"
SRC_CEPEA = "Cepea (cepea.org.br)"
SRC_B3 = "B3 BVBG.086"
SRC_PTAX = "PTAX: BCB Olinda"

# Basis: latest dated 2026 point for Paranagua (column basis_c_bu, USc/bu).
basis_rows = [
    r for r in read("34_basis_por_praca.csv")
    if r["praca"] == "Paranaguá" and r["serie"] == "2026" and r["data"]
]
basis = {}
basis_meta = {}
for crop in ("soja", "milho"):
    rows = sorted((r for r in basis_rows if r["cultura"] == crop), key=lambda r: r["data"])
    last = rows[-1]
    assert last["unidade"] == "USc/bu"
    basis[crop] = last
    basis_meta[crop] = {
        "pointDate": last["data"],
        "contratoRef": last["contrato_ref"],
        "last5": [[r["data"], f(r["basis_c_bu"])] for r in rows[-5:]],
    }
    print(crop, "last 5 Paranagua 2026 points:", basis_meta[crop]["last5"])

SRC_BASIS = (
    "Basis Paranaguá: Hedgepoint/CME/ESALQ, relatório Basis Soja e Milho 21/10/2026 "
    "(ponto semanal de {d}, gráfico digitalizado, contrato não informado) - a confirmar"
)

snapshot = {
    "cbotUsc": {
        "soja": q(f(p["soja_cbot_usc_bu"]), "USc/bu", SRC_CBOT),
        "milho": q(f(p["milho_cbot_usc_bu"]), "USc/bu", SRC_CBOT),
    },
    "fx": q(f(p["ptax_compra_brl_usd"]), "R$/US$", SRC_PTAX),
    "b3": {
        "soja": q(f(p["b3_sjc_ajuste_usd_saca60kg"]), "US$/sc", f"{SRC_B3} (SJC, ajuste)"),
        "milho": q(f(p["b3_ccm_ajuste_brl_saca60kg"]), "R$/sc", f"{SRC_B3} (CCM, ajuste)"),
    },
    "cepea": {
        "soja": q(f(p["soja_cepea_paranagua_rs_saca60kg"]), "R$/sc", f"{SRC_CEPEA}, soja Paranaguá"),
        "milho": q(f(p["milho_cepea_rs_saca60kg"]), "R$/sc", f"{SRC_CEPEA}, milho"),
    },
    "basisUsc": {
        c: q(f(basis[c]["basis_c_bu"]), "USc/bu", SRC_BASIS.format(d=basis[c]["data"]), basis[c]["data"])
        for c in ("soja", "milho")
    },
}

note = (
    "Fechamento de 26/10/2026 (linha 2026-10-26 do arquivo 09b; a linha de 27/10 está incompleta "
    "e nunca é usada). CBOT vem do Yahoo Finance (não oficial) e pode ser ajustado quando a CME "
    "publicar o settlement. Basis: último ponto de 2026 da praça Paranaguá em 34_basis_por_praca.csv "
    f"(coluna basis_c_bu, unidade USc/bu, valores positivos = prêmio sobre o CBOT; sinal confirmado "
    "porque (CBOT+basis)/100*bushels*PTAX da soja dá ~R$ 158/sc, próximo do Cepea Paranaguá R$ 155,55). "
    "O ponto é semanal de 21/10/2026, digitalizado de gráfico de PDF, sem contrato de referência; "
    "o ponto anterior da soja era 127,7 (salto de 127,7 para 61,7 em uma semana, possivelmente troca de "
    "contrato), por isso a fonte está marcada 'a confirmar'. Pontos usados: "
    + json.dumps(basis_meta, ensure_ascii=False)
)

OUT.write_text(json.dumps({"note": note, "snapshot": snapshot}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("wrote", OUT)
