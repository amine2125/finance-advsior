"""Adaptation to the profile WITHOUT changing the app (same structure for everyone). Depends on the
profile's characteristics only, never on a name: experience -> vocabulary and density; preferences
-> lenses and modules shown; horizon -> what comes first."""
from __future__ import annotations

from ulysse.contract.schema import Profil


def adaptation(p: Profil) -> dict:
    hmin = min(o.horizon_annees for o in p.objectifs)
    vocab = {"debutant": "simple", "intermediaire": "standard", "avance": "detaille"}[p.experience]
    if hmin < 3:
        priorite = ["liquidites", "pire_baisse", "objectif", "concentration", "diversification"]
    elif hmin > 10:
        priorite = ["diversification", "paris_reels", "concentration", "pire_baisse", "liquidites"]
    else:
        priorite = ["pire_baisse", "diversification", "concentration", "liquidites", "objectif"]
    return {
        "vocabulaire": vocab,
        "densite": {"simple": "essentiel", "standard": "standard", "detaille": "detaille"}[vocab],
        "metriques_detaillees_visibles": p.experience == "avance",
        "glossaire_au_survol": True,
        "glossaire_proactif": p.experience == "debutant",
        "lentille_esg": p.preferences.esg_important,
        "module_crypto": "visible" if p.preferences.interet_crypto else "replie",
        "priorite_modules": priorite,
        "horizon_le_plus_proche_annees": hmin,
        "raisons": {
            "vocabulaire": f"expérience « {p.experience} »",
            "lentille_esg": "préférence ESG déclarée" if p.preferences.esg_important else "aucune préférence ESG déclarée",
            "module_crypto": "intérêt déclaré pour les cryptoactifs" if p.preferences.interet_crypto else "aucun intérêt déclaré (accessible quand même)",
            "priorite_modules": f"objectif le plus proche dans {hmin:g} an(s)",
        },
    }
