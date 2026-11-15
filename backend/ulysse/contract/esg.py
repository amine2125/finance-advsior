"""ESG: deterministic rules on documented evidence only (no proprietary score, no LLM judgement).

Evidence base: data/manual/esg_evidence.json (each item: verbatim extract, source, publication
date). Temporal coherence: an item is usable only if its source was published on or before the
simulation date.
"""
from __future__ import annotations

import json
from functools import lru_cache

import numpy as np

from ulysse.config import MANUAL_DIR
from ulysse.data.datapack import AsOf
from ulysse.evidence import evidence


@lru_cache(maxsize=1)
def base() -> dict:
    return json.loads((MANUAL_DIR / "esg_evidence.json").read_text())


def items_for(v: AsOf, ticker: str) -> list[dict]:
    b = base()
    out = []
    for it in b["preuves"]:
        if ticker not in it["sujets"]:
            continue
        src = b["sources"][it["source"]]
        if np.datetime64(src["publie_le"]) <= v.day:
            out.append({**it, "source_detail": src})
    return out


def _ev(v: AsOf, it: dict, sujet: str):
    s = it["source_detail"]
    return evidence(mesure=f"esg_{it['type']}", libelle=f"Preuve ESG {it['id']} — {s['editeur']}", sujet=sujet,
                    valeur={"enonce": it["enonce"], "extrait": it["extrait"], "source": s["titre"], "url": s["url"],
                            "publie_le": s["publie_le"], "consulte_le": s["consulte_le"], "verification": s["verification"]},
                    unite="texte", as_of=str(v.day), date_de_calcul=s["publie_le"],
                    donnees_source=[f"ESG:{it['id']}", s["url"]], methode="preuve_documentaire_citee",
                    reference=base()["regles"]["controverse_importante"])


def evaluer_controverses(v: AsOf, ticker: str) -> dict | None:
    """Status of the clause « éviter les controverses environnementales ou sociales importantes »."""
    a = v.dp.asset[ticker]
    if a["asset_class"] in ("crypto", "etf_commodity", "etf_bond"):
        return None
    its = items_for(v, ticker)
    contro = [i for i in its if i["type"] == "controverse" and i.get("autorite_publique")]
    if contro:
        evs = [_ev(v, i, ticker) for i in contro]
        return {"statut": "depassee", "preuves": evs,
                "explication": f"{ticker} : {contro[0]['enonce']} (source : {contro[0]['source_detail']['editeur']}, "
                               f"{contro[0]['source_detail']['publie_le']})."}
    if a["asset_class"] == "etf_equity" and any(i["type"] in ("methodologie_fonds", "methodologie_indice") for i in its):
        evs = [_ev(v, i, ticker) for i in its]
        return {"statut": "respectee", "preuves": evs,
                "explication": f"{ticker} applique un filtre ESG publié (exclusions par activité et par conduite) ; "
                               "le filtre est celui du fournisseur d'indice, pas une vérification par ULYSSE."}
    activ = [i for i in its if i["type"] == "activite"]
    if activ:
        evs = [_ev(v, i, ticker) for i in activ]
        for fund in activ[0].get("exclu_par", []):
            evs += [_ev(v, i, fund) for i in items_for(v, fund) if i["type"] in ("methodologie_fonds", "methodologie_indice")
                    and ("oil" in i["extrait"].lower())]
        return {"statut": "donnees_insuffisantes", "preuves": evs,
                "explication": f"Aucune controverse documentée dans la base pour {ticker}. Contexte : son activité "
                               f"(pétrole et gaz) fait partie des catégories exclues par l'indice suivi par "
                               f"{', '.join(activ[0].get('exclu_par', []))} — c'est une exclusion par activité, pas une controverse."}
    return {"statut": "donnees_insuffisantes", "preuves": [],
            "explication": f"Aucune preuve ESG documentée pour {ticker} à cette date : ULYSSE ne peut pas conclure."}
