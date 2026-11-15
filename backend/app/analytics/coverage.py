"""Section 8A.8: failure-coverage matrix. The Evidence Agent emits an AnalysisCoverageReport per analysis."""
from __future__ import annotations

from ..models import CoverageStatus

FAILURE_MODES = [
    {"id": 1, "name": "Bonne entreprise, prix trop élevé", "lenses": [2], "check": "Croissance implicite (DCF inversé) peu plausible"},
    {"id": 2, "name": "Piège de valeur", "lenses": [1, 4], "check": "F-score ≤ 3; ROIC < coût du capital; prix sous une MM200 descendante"},
    {"id": 3, "name": "Résultats embellis ou fraude", "lenses": [1, 5, 6], "check": "M-score > −1,78; régularisations élevées; vente à découvert; changement d'auditeur"},
    {"id": 4, "name": "Faillite ou dilution", "lenses": [1], "check": "Z < 1,81; couverture des intérêts < 2; échéances proches"},
    {"id": 5, "name": "Bonne thèse, mauvais moment", "lenses": [4, 5], "check": "Aucun catalyseur daté; tendance encore baissière"},
    {"id": 6, "name": "Bonne nouvelle déjà dans le prix", "lenses": [5, 2], "check": "Attentes déjà très élevées; croissance implicite élevée"},
    {"id": 7, "name": "Position trop grande pour sa volatilité", "lenses": [3], "check": "Perte planifiée > limite du profil"},
    {"id": 8, "name": "Choc de marché ou macro", "lenses": [3, 6], "check": "Bêta élevé; corrélation en stress; sensibilité aux taux"},
    {"id": 9, "name": "Érosion de l'avantage concurrentiel", "lenses": [6, 1], "check": "Marge brute en baisse trois ans de suite"},
    {"id": 10, "name": "La direction détruit de la valeur", "lenses": [6], "check": "Dépréciations répétées; nombre d'actions en hausse"},
    {"id": 11, "name": "Biais de l'analyste ou de l'utilisateur", "lenses": ["process"], "check": "Contre-argument écrit; critères d'invalidation"},
    {"id": 12, "name": "Signal surajusté", "lenses": ["16A"], "check": "Test hors échantillon; nombre de variantes essayées"},
    {"id": 13, "name": "Événement imprévisible", "lenses": [], "check": "Seuls la diversification et la taille de position protègent"},
]


def _st(lenses: dict, n: int) -> str:
    return lenses.get(n, {}).get("status", "UNAVAILABLE")


def coverage_report(lenses: dict[int, dict], *, debate_ran: bool = False, counterargument: bool = False,
                    hypothesis_tested: bool = False, persona_limit_checked: bool = False) -> list[dict]:
    rows = []
    l1, l2, l3, l4, l5 = (lenses.get(i, {}) for i in (1, 2, 3, 4, 5))

    def row(fm, status, result):
        rows.append({**fm, "status": status, "result": result})

    def na_or_unavail(*ns):
        sts = [_st(lenses, n) for n in ns]
        if all(s == "NOT_APPLICABLE" for s in sts):
            return CoverageStatus.NOT_APPLICABLE.value
        return CoverageStatus.NOT_COVERED_DATA_UNAVAILABLE.value

    for fm in FAILURE_MODES:
        i = fm["id"]
        if i == 1:
            if _st(lenses, 2) == "COMPUTED":
                g = l2.get("implied_growth")
                row(fm, CoverageStatus.COVERED.value, f"Croissance implicite {g * 100:.1f} %/an" if g is not None else "aucune croissance ne justifie le cours")
            else:
                row(fm, na_or_unavail(2), l2.get("reason", "DCF inversé indisponible"))
        elif i == 2:
            parts = []
            if _st(lenses, 1) == "COMPUTED":
                f = l1["piotroski"]
                parts.append(f"F-score {f.get('value') if f.get('value') is not None else f.get('partial_score')}")
                roic_ok = l1["quality"].get("roic_above_cost_of_capital")
                parts.append("ROIC > coût du capital" if roic_ok else ("ROIC < coût du capital" if roic_ok is False else "ROIC n/d"))
            if _st(lenses, 4) == "COMPUTED":
                ma = l4.get("moving_averages") or {}
                parts.append("prix sous MM200 descendante" if ma.get("falling_knife_caution") else "pas de MM200 descendante sous le prix")
            if _st(lenses, 1) == "COMPUTED":
                row(fm, CoverageStatus.COVERED.value, "; ".join(parts))
            elif parts:
                row(fm, CoverageStatus.NOT_COVERED_DATA_UNAVAILABLE.value, "Partiel (lentille 4 seule): " + "; ".join(parts))
            else:
                row(fm, na_or_unavail(1, 4), "lentilles 1 et 4 indisponibles")
        elif i == 3:
            if _st(lenses, 1) == "COMPUTED" and l1["beneish"].get("value") is not None:
                row(fm, CoverageStatus.COVERED.value, f"M-score {l1['beneish']['value']:.2f} ({l1['beneish']['wording']}); "
                    "vente à découvert et auditeur non connectés")
            elif _st(lenses, 1) == "COMPUTED":
                row(fm, CoverageStatus.NOT_COVERED_DATA_UNAVAILABLE.value, "M-score non calculable: " +
                    ", ".join(l1["beneish"].get("missing", [])) if l1["beneish"].get("missing") else l1["beneish"].get("reason", ""))
            else:
                row(fm, na_or_unavail(1), l1.get("reason", "lentille 1 indisponible"))
        elif i == 4:
            if _st(lenses, 1) == "COMPUTED":
                z = l1["altman"]
                ic = l1["quality"].get("interest_coverage")
                txt = (f"{z['variant']} = {z['value']:.2f} (zone {z['zone']})" if z.get("value") is not None else
                       f"Z: {z.get('reason') or 'partiel'}")
                txt += f"; couverture des intérêts {ic:.1f}x" if ic is not None else "; couverture des intérêts n/d"
                row(fm, CoverageStatus.COVERED.value, txt)
            else:
                row(fm, na_or_unavail(1), l1.get("reason", "lentille 1 indisponible"))
        elif i == 5:
            if _st(lenses, 4) == "COMPUTED" and _st(lenses, 5) == "COMPUTED":
                row(fm, CoverageStatus.COVERED.value, f"Catalyseurs datés: {l5.get('dated_catalysts', 0)}; tendance vérifiée (lentille 4)")
            elif _st(lenses, 4) == "COMPUTED":
                row(fm, CoverageStatus.NOT_COVERED_DATA_UNAVAILABLE.value, "Tendance vérifiée; catalyseurs datés non recherchés")
            else:
                row(fm, na_or_unavail(4, 5), "indisponible")
        elif i == 6:
            if _st(lenses, 2) == "COMPUTED" and _st(lenses, 5) == "COMPUTED":
                row(fm, CoverageStatus.COVERED.value, "Croissance implicite + événements vérifiés; consensus non connecté")
            else:
                row(fm, CoverageStatus.NOT_COVERED_DATA_UNAVAILABLE.value if _st(lenses, 2) != "NOT_APPLICABLE" else CoverageStatus.NOT_APPLICABLE.value,
                    "Attentes/consensus non connectés")
        elif i == 7:
            if _st(lenses, 3) == "COMPUTED" and persona_limit_checked:
                row(fm, CoverageStatus.COVERED.value, "Perte planifiée comparée aux limites du profil (budget de risque)")
            elif _st(lenses, 3) == "COMPUTED":
                row(fm, CoverageStatus.COVERED.value, "Volatilité et perte max. calculées; comparer au budget du profil")
            else:
                row(fm, CoverageStatus.NOT_COVERED_DATA_UNAVAILABLE.value, "lentille 3 indisponible")
        elif i == 8:
            if _st(lenses, 3) == "COMPUTED":
                b = (l3.get("beta") or {}).get("beta")
                row(fm, CoverageStatus.COVERED.value, f"Bêta {b:.2f}; sensibilité aux taux non modélisée" if b is not None else "Bêta n/d")
            else:
                row(fm, CoverageStatus.NOT_COVERED_DATA_UNAVAILABLE.value, "lentille 3 indisponible")
        elif i == 9:
            if _st(lenses, 1) == "COMPUTED":
                down = l1["quality"].get("gross_margin_down_3y")
                row(fm, CoverageStatus.COVERED.value, "Marge brute en baisse 3 ans de suite" if down else "Pas de baisse de marge brute 3 ans de suite")
            else:
                row(fm, na_or_unavail(1), "Analyse qualitative non connectée")
        elif i == 10:
            if _st(lenses, 1) == "COMPUTED" and l1["quality"].get("share_count_change") is not None:
                row(fm, CoverageStatus.COVERED.value, f"Nombre d'actions {l1['quality']['share_count_change'] * 100:+.1f} % sur la période; "
                    "dépréciations non analysées (lentille 6 indisponible)")
            else:
                row(fm, na_or_unavail(1), "Lentille 6 (gouvernance) non connectée")
        elif i == 11:
            row(fm, CoverageStatus.COVERED.value if (debate_ran and counterargument) else CoverageStatus.NOT_COVERED_DATA_UNAVAILABLE.value,
                "Contre-argument écrit par l'agent Risque" if (debate_ran and counterargument) else "Lancer le débat pour couvrir ce mode")
        elif i == 12:
            row(fm, CoverageStatus.COVERED.value if hypothesis_tested else CoverageStatus.NOT_COVERED_DATA_UNAVAILABLE.value,
                "Hypothèse pré-enregistrée évaluée hors échantillon" if hypothesis_tested else "Aucun test hors échantillon exécuté ici")
        else:
            row(fm, CoverageStatus.NOT_COVERABLE.value, "Non couvrable par l'analyse: voir la Radiographie du portefeuille (diversification, taille)")
    return rows
