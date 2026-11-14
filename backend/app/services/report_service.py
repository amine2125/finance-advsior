"""Monthly portfolio intelligence report (deterministic; every number comes from the ledger)."""
from __future__ import annotations

import pandas as pd

from ..analytics.portfolio import value_holdings
from ..analytics.scenarios import SHOCK_PRESETS, apply_shock
from ..data.registry import get_market_data
from ..ids import new_id
from ..methodology import METHODOLOGY
from ..models import utcnow
from ..storage.store import get_store
from . import portfolio_service as ps
from .analysis_service import run_xray
from .snapshot_service import compare


def generate_report(tracker, owner: str, req: dict) -> dict:
    md = get_market_data()
    pf = ps.get_portfolio(owner, req["portfolio_id"])
    persona = ps.resolve_persona(owner, req.get("persona_id"), pf)
    tracker.add("report.compute", "quant_agent", "Calcul du rapport mensuel")
    tracker.start("report.compute")
    end = pd.Timestamp(req.get("end") or md.end_date)
    start = end - pd.DateOffset(months=1)
    xr_end = run_xray(md, pf, persona, as_of=end.date().isoformat())
    xr_start = run_xray(md, pf, persona, as_of=start.date().isoformat())
    from .analysis_service import make_snapshot
    s0, s1 = make_snapshot(owner, pf, xr_start, "début de mois"), make_snapshot(owner, pf, xr_end, "fin de mois")
    diff = compare(s0.model_dump(mode="json"), s1.model_dump(mode="json"))
    alerts = [a for a in get_store().list(owner, "ALERT", 300) if a["portfolio_id"] == pf.portfolio_id]
    period_alerts = [a for a in alerts if start.date().isoformat() <= a["data_date"] <= end.date().isoformat()]
    research = [r for r in get_store().list(owner, "HYPE", 20) if r.get("asset_id") in {h.asset_id for h in pf.holdings} | set(persona.watchlist)]
    pos = value_holdings(md, [h.model_dump() for h in pf.holdings], end)
    scenarios = []
    for k in ("tech_crash_30", "broad_bear", "cad_up_10"):
        r = apply_shock(md, pos, SHOCK_PRESETS[k]["shocks"])
        scenarios.append({"preset": k, "name": SHOCK_PRESETS[k]["name"], "return": r["return"], "pnl": r["pnl"]})
    led = xr_end["ledger"]
    tracker.done("report.compute", f"{len(period_alerts)} alerte(s) sur la période")
    rid = new_id("rep")
    report = {
        "report_id": rid, "title": f"Rapport mensuel – {pf.name}", "portfolio_id": pf.portfolio_id, "persona_id": persona.persona_id,
        "period": [start.date().isoformat(), end.date().isoformat()], "created_at": utcnow(), "data_as_of": xr_end["data_as_of"],
        "value": {"start": xr_start["total_value_cad"], "end": xr_end["total_value_cad"], "change": diff["total_change"],
                  "market_effect": diff["market_effect"], "composition_effect": diff["composition_effect"]},
        "performance": {k: led.get(k, {}).get("display") for k in ("pf.total_return", "pf.ann_return", "bench.total_return", "bench.excess_return")},
        "risk": {k: led.get(k, {}).get("display") for k in ("pf.vol", "pf.mdd", "pf.current_dd", "pf.var95", "pf.cvar95", "pf.avg_corr",
                                                             "pf.div_ratio", "pf.stress.vol", "pf.hhi", "pf.effective_n")},
        "exposure_changes": diff["sectors"], "material_changes": diff["material_changes"], "findings": xr_end["findings"],
        "persona_assessment": xr_end["persona_assessment"], "alerts": period_alerts,
        "hype": [{"asset_id": r["asset_id"], "created_at": r["created_at"], "attention": (r.get("attention") or {}).get("value"),
                  "attention_status": (r.get("attention") or {}).get("status"), "is_fixture": r.get("is_fixture"),
                  "verified_events": len([e for e in r.get("events", []) if e.get("primary_source")]),
                  "unverified_claims": len([c for c in r.get("claims", []) if c["status"] in ("UNVERIFIED", "DISPUTED")])} for r in research[:5]],
        "market_context": {"note": "Contexte de marché tiré du jeu de données historique; aucune actualité en direct n'est incluse sans recherche exécutée.",
                           "ca_policy_rate": md.macro_value("CA_POLICY_RATE", end), "us_10y": md.macro_value("US_TREASURY_10Y", end)},
        "scenarios": scenarios,
        "uncertainties": ["Composition des FNB non vérifiée: chevauchement non quantifié", METHODOLOGY["returns"]["costs"],
                          "Les métriques historiques ne prévoient pas les rendements futurs",
                          "Données d'actualités: couverture limitée aux sources connectées" if research else "Aucune recherche d'actualités exécutée ce mois-ci"],
        "questions_to_explore": ["Comment une baisse de 30 % de la technologie affecterait-elle mon budget de risque ?",
                                 "Quelle alternative réduit la concentration sans changer l'horizon ?",
                                 "Quelles affirmations sur mes titres sont réellement vérifiées ?"],
        "label": "Rapport éducatif de simulation; pas un conseil en placement", "methodology_version": METHODOLOGY["version"],
    }
    get_store().put(owner, "REPORT", rid, report)
    return report
