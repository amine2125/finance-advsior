"""Contradictions between clauses (or between clauses and the profile). Deterministic rules,
each named with its case and its limit (method, level 1)."""
from __future__ import annotations

import numpy as np

from ulysse.analytics import portfolio as pfm
from ulysse.contract.evaluate import _compose, pire_episode
from ulysse.contract.schema import Contrat, Profil
from ulysse.data.datapack import AsOf


def detecter(v: AsOf, profil: Profil, contrat: Contrat) -> list[dict]:
    out = []
    c = {x.type: x for x in contrat.clauses}
    horizons = [o for o in profil.objectifs]
    # K1: high willingness, but a large share of the money is needed soon (willingness != capacity)
    court = [o for o in horizons if o.horizon_annees < 3 and o.part_pct >= 30]
    if profil.tolerance in ("modere", "eleve") and court:
        o = court[0]
        out.append({"code": "K1", "gravite": "importante", "clauses": ["profil.tolerance", "C-HORIZON"],
                    "message": f"Tu indiques une tolérance au risque « {profil.tolerance} », mais {o.part_pct:g} % de ton argent sert "
                               f"« {o.libelle} » dans {o.horizon_annees:g} an(s). Vouloir accepter une baisse ne donne pas le temps de la "
                               "récupérer avant d'avoir besoin de l'argent.", "preuves": []})
    # K2: the tolerated loss is smaller than what the allowed equity share lost in the worst past episode
    if "perte_max" in c and "actions_max" in c:
        act = float(c["actions_max"].parametres["max_pct"]) / 100
        basket = _compose(v, {"XIU.TO": 50_000 * act, "SPY": 50_000 * act}, 100_000 * (1 - act))
        ep = pire_episode(v, basket)
        if ep.statut == "ok" and -ep.valeur["baisse_pct"] > float(c["perte_max"].parametres["max_pct"]):
            out.append({"code": "K2", "gravite": "attention", "clauses": [c["perte_max"].id, c["actions_max"].id],
                        "message": f"Avec {act * 100:g} % d'actions (moitié TSX 60, moitié S&P 500) et le reste en liquidités, "
                                   f"l'épisode « {ep.valeur['libelle']} » aurait fait baisser le portefeuille d'environ "
                                   f"{-ep.valeur['baisse_pct']:.1f} %, plus que ta perte maximale de "
                                   f"{float(c['perte_max'].parametres['max_pct']):g} %.".replace(".", ",", 1),
                        "preuves": [ep]})
    # K3: crypto allowed although no interest was declared
    if "crypto_max" in c and float(c["crypto_max"].parametres["max_pct"]) > 0 and not profil.preferences.interet_crypto:
        out.append({"code": "K3", "gravite": "info", "clauses": [c["crypto_max"].id],
                    "message": "Ta règle autorise des cryptoactifs alors que tu n'as pas déclaré d'intérêt pour eux.", "preuves": []})
    # K4: impossible together
    if "liquidites_min" in c and "actions_max" in c:
        if float(c["liquidites_min"].parametres["min_pct"]) + 0 > 100 - 0 and float(c["actions_max"].parametres["max_pct"]) > 0:
            pass
    if "concentration_titre" in c and "actions_max" in c and \
            float(c["concentration_titre"].parametres["max_pct"]) > float(c["actions_max"].parametres["max_pct"]):
        out.append({"code": "K5", "gravite": "attention", "clauses": [c["concentration_titre"].id, c["actions_max"].id],
                    "message": "Ta limite par entreprise dépasse ta limite totale en actions : elle ne pourra jamais être atteinte.",
                    "preuves": []})
    # K6: the horizon clause is longer than the nearest goal
    if "horizon" in c and horizons:
        hmin = min(o.horizon_annees for o in horizons)
        if float(c["horizon"].parametres["annees"]) > hmin:
            out.append({"code": "K6", "gravite": "attention", "clauses": [c["horizon"].id],
                        "message": f"Ta règle d'horizon ({c['horizon'].parametres['annees']:g} ans) est plus longue que ton objectif le plus proche "
                                   f"({hmin:g} ans).", "preuves": []})
    # K7: ESG matters but no ESG clause exists
    if profil.preferences.esg_important and not any(x.type.startswith("esg_") for x in contrat.clauses):
        out.append({"code": "K7", "gravite": "info", "clauses": [],
                    "message": "Tu indiques que l'ESG compte pour toi, mais aucune règle ESG n'est écrite dans ton contrat.", "preuves": []})
    return out
