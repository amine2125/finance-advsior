"""Section 14 - Guided historical replay. At each step only data on or before the step date is visible.

Holdings are the portfolio's quantities, held fixed from the decision date. Alerts are labeled SIMULATED / HISTORICAL REPLAY.
Macro series without verified release timing are excluded; no news or attention data is used (no point-in-time archive).
"""
from __future__ import annotations

import pandas as pd

from ..analytics.scenarios import diversified_alternatives, historical_replay
from ..data.registry import get_market_data
from ..ids import new_id
from ..methodology import METHODOLOGY
from ..models import utcnow
from ..services import portfolio_service as ps
from ..services.analysis_service import make_snapshot, run_xray
from ..services.snapshot_service import compare
from ..storage.store import get_store
from . import rules
from .engine import candidates_to_alerts

GUIDED = {
    "bear_2022": {"title": "Le repli de 2022 : actions et obligations en baisse ensemble", "start": "2022-03-01", "end": "2022-12-30"},
    "recovery_2023": {"title": "La reprise de 2023", "start": "2023-01-02", "end": "2023-12-29"},
}


def run_replay(tracker, owner: str, req: dict) -> dict:
    md = get_market_data()
    guided = GUIDED.get(req.get("guided") or "")
    start = req.get("start") or (guided or {}).get("start") or "2022-03-01"
    end = req.get("end") or (guided or {}).get("end") or "2022-12-30"
    pid = req.get("portfolio_id")
    step_days = int(req.get("step_days") or METHODOLOGY["guardian"]["scan_step_days"])
    pf = ps.resolve_portfolio(owner, pid)
    persona = ps.resolve_persona(owner, req.get("persona_id"), pf)
    replay_id = new_id("rpl")
    tracker.add("guardian.replay", "guardian", f"Rejeu historique {start} → {end}")
    tracker.start("guardian.replay")
    dates = pd.date_range(pd.Timestamp(start), pd.Timestamp(end), freq=f"{step_days}D")
    qty = {h.asset_id: h.quantity for h in pf.holdings}
    value_peak, steps, alerts, snaps, seen, active = None, [], [], [], {}, set()
    for d in dates:
        view = md.as_of(d)
        xr = run_xray(view, pf, persona, as_of=d.date().isoformat(), lookback=252)
        total = xr["total_value_cad"]
        value_peak = total if value_peak is None else max(value_peak, total)
        dd = total / value_peak - 1
        cands = rules.evaluate(view, xr, persona, pf.target_weights, None, value_drawdown=dd)
        new = candidates_to_alerts(owner, pf, persona, cands, xr["data_as_of"], replay_id, seen, previously_active=active)
        from .engine import _dedup_key
        active = {_dedup_key(pf.portfolio_id, c) + "|" + (c["severity"].value if hasattr(c["severity"], "value") else c["severity"]) for c in cands}
        for a in new:
            a.delivery = "non envoyée: alerte de rejeu historique (SIMULÉE)"
            get_store().put(owner, "ALERT", a.alert_id, a.model_dump(mode="json"))
        alerts += [a.model_dump(mode="json") for a in new]
        snap = make_snapshot(owner, pf, xr, label=f"Rejeu {replay_id} – {xr['data_as_of']}", alerts=[a.alert_id for a in new])
        snaps.append(snap.model_dump(mode="json"))
        led = xr["ledger"]
        steps.append({"date": xr["data_as_of"], "value": total, "drawdown_from_start_peak": dd, "vol_252": led.get("pf.vol", {}).get("value"),
                      "avg_corr": led.get("pf.avg_corr", {}).get("value"), "tech_direct": xr["exposures"]["sector"].get("Information Technology", 0.0),
                      "alerts": [{"rule_id": a.rule_id, "severity": a.severity, "title": a.title} for a in new],
                      "budget_breaches": [c["rule_id"] for c in (xr["persona_assessment"] or {}).get("budget_checks", []) if c["status"] != "OK"]})
    first, last = snaps[0], snaps[-1]
    for s in (first, last):
        get_store().put(owner, "SNAPSHOT", s["snapshot_id"], s)
    diff = compare(first, last)
    tracker.done("guardian.replay", f"{len(steps)} étapes, {len(alerts)} alerte(s) simulée(s)")
    weights0 = first["weights"]
    alt_paths = {}
    meta = {a: {"asset_class": md.asset(a)["asset_class"], "sub_class": md.asset(a)["sub_class"], "sector": md.asset(a)["sector"],
                "is_single_issuer": bool(int(md.asset(a)["is_single_issuer"]))} for a in weights0}
    alts = diversified_alternatives(weights0, meta)
    for key, w in [("original", weights0), ("diversified", alts["diversified"]["weights"]), ("defensive", alts["defensive"]["weights"])]:
        try:
            alt_paths[key] = historical_replay(md, w, start, end, first["total_value_cad"])
        except Exception as exc:  # noqa: BLE001
            alt_paths[key] = {"error": str(exc)}
    initial_findings = [f["title"] for f in run_xray(md.as_of(dates[0]), pf, persona, as_of=dates[0].date().isoformat(), lookback=252)["findings"]]
    res = {"replay_id": replay_id, "label": "SIMULÉ / REJEU HISTORIQUE", "title": (guided or {}).get("title", "Rejeu personnalisé"),
           "portfolio_id": pid, "persona_id": persona.persona_id, "start": start, "end": end, "step_days": step_days, "steps": steps,
           "alerts": alerts, "initial_knowledge": {"date": first["as_of"], "findings": initial_findings, "key_metrics": first["key_metrics"]},
           "what_changed": diff, "alternatives": alt_paths, "created_at": utcnow(), "quantities": qty,
           "integrity": ["Chaque étape utilise uniquement les observations publiées au plus tard à la date de l'étape",
                         "Aucune actualité ni donnée d'attention: archive horodatée non disponible (rejeu strict non supporté pour ces signaux)",
                         "Séries macro sans date de publication vérifiée exclues", "Quantités fixes; frais et impôts omis",
                         "Le rejeu ne démontre pas que l'application prédirait un krach futur"]}
    get_store().put(owner, "REPLAY", replay_id, res)
    return res
