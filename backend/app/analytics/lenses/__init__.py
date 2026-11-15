"""Six-lens asset analysis framework (section 8A). Each lens reports COMPUTED / PARTIAL / UNAVAILABLE / NOT_APPLICABLE."""
from __future__ import annotations

import pandas as pd

from ...data.loader import MarketData
from ...models import InvestorProfile, LensStatus, SupervisorStatus
from ..benchmarks import benchmark_weights
from ..coverage import coverage_report
from ..ledger import MetricLedger
from . import fundamental_lens, quant_risk, trend_lens

LENS_META = {
    1: {"name": "Fondamentale", "question": "L'entreprise est-elle bonne, solide, et ses chiffres fiables ?", "priority": "P1"},
    2: {"name": "Valorisation", "question": "Que suppose déjà le prix actuel ?", "priority": "P2"},
    3: {"name": "Risque quantitatif", "question": "Comment l'actif se comporte-t-il ?", "priority": "P0"},
    4: {"name": "Tendance et momentum", "question": "Que disent les prix eux-mêmes ?", "priority": "P0"},
    5: {"name": "Nouvelles et attentes", "question": "Qu'est-ce qui est déjà dans le prix ?", "priority": "P0/P1"},
    6: {"name": "Durabilité qualitative", "question": "Pourquoi de bons chiffres dureraient-ils ?", "priority": "P2"},
}


def lens5_from_research(research: dict | None, asset_class: str) -> dict:
    blind = ["La plupart des manchettes n'ont pas d'effet durable", "Récits construits après coup"]
    unavailable_parts = ["consensus et révisions d'estimations", "positions vendeurs à découvert",
                         "transactions d'initiés classées routinières/non routinières"]
    if not research:
        return {"lens": 5, "status": LensStatus.UNAVAILABLE.value, "reason": "Recherche Hype Intelligence non exécutée pour cet actif",
                "not_connected": unavailable_parts, "blind_spots": blind}
    events = research.get("events", [])
    verified = [e for e in events if e.get("primary_source")]
    if research.get("is_fixture") and not verified:
        return {"lens": 5, "status": LensStatus.PARTIAL.value, "reason": "Fixture hors ligne fictive: ne compte pas comme donnée réelle",
                "claims": len(research.get("claims", [])), "not_connected": unavailable_parts, "blind_spots": blind}
    status = LensStatus.PARTIAL.value if (events or research.get("claims")) else LensStatus.UNAVAILABLE.value
    return {"lens": 5, "status": status if status == LensStatus.UNAVAILABLE.value else LensStatus.COMPUTED.value,
            "verified_events": len(verified), "dated_catalysts": len([e for e in verified if e.get("occurred_at") or e.get("published_at")]),
            "claims": len(research.get("claims", [])), "not_connected": unavailable_parts,
            "evidence_note": ("Les recommandations d'analystes sont biaisées vers « Achat » et ne comptent jamais comme preuve haussière; "
                              "la dérive post-résultats a disparu pour les grandes capitalisations depuis ~2006 (littérature)."),
            "reason": None if events else "Aucun événement vérifié retrouvé", "blind_spots": blind}


def lens6(asset_class: str) -> dict:
    if asset_class == "crypto":
        return {"lens": 6, "status": LensStatus.NOT_APPLICABLE.value,
                "reason": "Pas de direction ni d'avantage concurrentiel d'entreprise à analyser pour un cryptoactif",
                "blind_spots": ["Effet de halo", "Histoires séduisantes sans chiffres"]}
    return {"lens": 6, "status": LensStatus.UNAVAILABLE.value,
            "reason": "Analyse qualitative citée passage par passage (dépôts) non connectée dans ce MVP (P2)",
            "blind_spots": ["Effet de halo", "Histoires séduisantes sans chiffres", "Un avantage connu de tous est déjà payé"]}


def run_asset_lenses(md: MarketData, asset_id: str, as_of: pd.Timestamp, persona: InvestorProfile | None,
                     research: dict | None = None, include_fundamentals: bool = True) -> tuple[dict, MetricLedger]:
    led = MetricLedger()
    meta = md.asset(asset_id)
    bench_id = persona.benchmark_id if persona else "BLEND_BALANCED"
    bench_asset = max(benchmark_weights(bench_id).items(), key=lambda kv: kv[1])[0]
    lenses: dict[int, dict] = {}
    lenses[3] = quant_risk.run(md, asset_id, as_of, bench_id, led)
    lenses[4] = trend_lens.run(md, asset_id, as_of, bench_asset, led)
    if include_fundamentals:
        beta_v = (lenses[3].get("beta") or {}).get("beta") if lenses[3]["status"] == "COMPUTED" else None
        lenses[1], lenses[2] = fundamental_lens.run(md, asset_id, as_of, led, beta_v)
    else:
        lenses[1] = {"lens": 1, "status": LensStatus.UNAVAILABLE.value, "reason": "non demandé"}
        lenses[2] = {"lens": 2, "status": LensStatus.UNAVAILABLE.value, "reason": "non demandé"}
    lenses[5] = lens5_from_research(research, meta["asset_class"])
    lenses[6] = lens6(meta["asset_class"])
    for k, v in lenses.items():
        v.update({"name": LENS_META[k]["name"], "question": LENS_META[k]["question"], "priority": LENS_META[k]["priority"]})
    return {"asset_id": asset_id, "name": meta["name"], "as_of": as_of.date().isoformat(), "lenses": lenses,
            "tier": lenses[3].get("tier")}, led


def stop_flags(lenses: dict[int, dict], budget_breaches: list[str], core_claim_unverifiable: bool, stale: bool) -> list[str]:
    flags = []
    l1 = lenses.get(1, {})
    if l1.get("status") == "COMPUTED":
        z = l1.get("altman", {})
        if z.get("zone") == "distress":
            flags.append(f"score de détresse ({z.get('variant')} = {z.get('value'):.2f})")
        if l1.get("beneish", {}).get("flagged_for_review"):
            flags.append("M-score signalé pour revue (manipulation possible)")
    if core_claim_unverifiable:
        flags.append("affirmation centrale invérifiable")
    flags += [f"dépassement du budget de risque: {b}" for b in budget_breaches]
    if stale:
        flags.append("données centrales périmées ou manquantes")
    return flags


def single_asset_status_rule(lenses: dict[int, dict], flags: list[str], budget_breached: bool) -> dict:
    """Section 8A.9. Returns the statuses the Supervisor may choose and the reason."""
    real = [k for k in (1, 2, 5, 6) if lenses.get(k, {}).get("status") == "COMPUTED"]
    base = [k for k in (3, 4) if lenses.get(k, {}).get("status") == "COMPUTED"]
    allowed = [SupervisorStatus.RESEARCH_INCONCLUSIVE.value, SupervisorStatus.SCENARIO_WORTH_TESTING.value,
               SupervisorStatus.CONFLICTS_WITH_PERSONA.value, SupervisorStatus.INSUFFICIENT_DATA.value]
    reasons = []
    independent_with_data = len(set(real + [3] if 3 in base else real))
    if not base:
        return {"allowed": [SupervisorStatus.INSUFFICIENT_DATA.value], "default": SupervisorStatus.INSUFFICIENT_DATA.value,
                "reason": "La lentille 3 (risque quantitatif) n'a pas pu s'exécuter", "stop_flags": flags}
    if not real:
        reasons.append("Seules les lentilles 3 et 4 disposent de données réelles (fondamentaux et valorisation indisponibles ou non applicables): "
                       "une thèse sur un actif unique est au mieux « research-inconclusive »")
    elif flags:
        reasons.append("Drapeau(x) d'arrêt: " + "; ".join(flags))
    elif independent_with_data >= 2 and not budget_breached:
        allowed.insert(0, SupervisorStatus.RESEARCH_SUPPORTED.value)
        reasons.append(f"Lentilles avec données réelles: {sorted(set(real + [3]))}; aucun drapeau d'arrêt; budget respecté")
    default = (SupervisorStatus.CONFLICTS_WITH_PERSONA.value if budget_breached else SupervisorStatus.RESEARCH_INCONCLUSIVE.value)
    return {"allowed": allowed, "default": default, "reason": " ".join(reasons), "stop_flags": flags,
            "lenses_with_real_data": sorted(set(real + base))}


__all__ = ["run_asset_lenses", "single_asset_status_rule", "stop_flags", "coverage_report", "LENS_META"]
