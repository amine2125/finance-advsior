"""Guardian scan: recompute, compare with thresholds, deduplicate with cooldown, persist, optionally notify (SNS)."""
from __future__ import annotations

import json
import logging

import pandas as pd

from ..config import get_settings
from ..data.registry import get_market_data
from ..ids import new_id
from ..methodology import METHODOLOGY
from ..models import RiskAlert, Severity, utcnow
from ..services import portfolio_service as ps
from ..services.analysis_service import make_snapshot, run_xray
from ..storage.store import get_store
from . import rules

log = logging.getLogger("aegis.guardian")


def _dedup_key(portfolio_id: str, cand: dict) -> str:
    return f"{portfolio_id}|{cand['rule_id']}|{cand.get('key')}"


def recent_alert_dates(owner: str, replay_id: str | None) -> dict[str, str]:
    out = {}
    for a in get_store().list(owner, "ALERT", 500):
        if (a.get("replay_id") or None) != replay_id:
            continue
        k = a["dedup_key"] + "|" + a["severity"]
        if k not in out or a["data_date"] > out[k]:
            out[k] = a["data_date"]
    return out


def candidates_to_alerts(owner: str, pf, persona, cands: list[dict], data_date: str, replay_id: str | None,
                         seen: dict[str, str], previously_active: set[str] | None = None) -> list[RiskAlert]:
    """Dedup: a condition that stays active does not re-alert (replay: until it clears; live: within the cooldown)."""
    cooldown = METHODOLOGY["guardian"]["cooldown_days"]
    out = []
    for c in cands:
        key = _dedup_key(pf.portfolio_id, c)
        sev = c["severity"].value if isinstance(c["severity"], Severity) else c["severity"]
        if previously_active is not None:
            if key + "|" + sev in previously_active:
                continue
        else:
            last = seen.get(key + "|" + sev)
            if last and (pd.Timestamp(data_date) - pd.Timestamp(last)).days < cooldown:
                continue
        alert = RiskAlert(alert_id=new_id("alr"), owner_id=owner, portfolio_id=pf.portfolio_id, persona_id=persona.persona_id if persona else None,
                          rule_id=c["rule_id"], severity=sev, title=c["title"], trigger=c["trigger"], affected_assets=c["assets"],
                          data_date=data_date, metrics=c["metrics"], persona_constraint=c.get("constraint"), explanation=c["explanation"],
                          simulated_replay=replay_id is not None, replay_id=replay_id, dedup_key=key)
        seen[key + "|" + sev] = data_date
        out.append(alert)
    return out


def notify(alert: RiskAlert, persona, no_push: bool) -> str:
    s = get_settings()
    if alert.simulated_replay:
        return "non envoyée: alerte de rejeu historique (SIMULÉE)"
    if no_push:
        return "non envoyée: affirmation non vérifiée (jamais poussée)"
    if not s.alert_sns_topic_arn:
        return "in-app uniquement (aucun canal de notification configuré)"
    if not (persona and persona.notifications_opt_in):
        return "in-app uniquement (notifications non activées dans le profil)"
    if alert.severity == "informational":
        return "in-app uniquement (niveau informatif)"
    try:
        import boto3

        boto3.client("sns").publish(TopicArn=s.alert_sns_topic_arn, Subject=f"AEGIS – {alert.severity}: {alert.title[:80]}",
                                    Message=json.dumps({"title": alert.title, "trigger": alert.trigger, "data_date": alert.data_date,
                                                        "explanation": alert.explanation, "note": "Simulation éducative; pas un conseil."},
                                                       ensure_ascii=False))
        return "envoyée via Amazon SNS"
    except Exception as exc:  # noqa: BLE001
        return f"échec SNS: {exc.__class__.__name__}"


def scan_portfolio(owner: str, portfolio_id: str, persona_id: str | None = None) -> dict:
    md = get_market_data()
    pf = ps.get_portfolio(owner, portfolio_id)
    persona = ps.get_persona(owner, persona_id or pf.persona_id or "robert")
    xr = run_xray(md, pf, persona)
    research = [r for r in get_store().list(owner, "HYPE", 30) if r.get("asset_id") in {h.asset_id for h in pf.holdings} | set(persona.watchlist)]
    latest: dict[str, dict] = {}
    for r in research:
        latest.setdefault(r["asset_id"], r)
    cands = rules.evaluate(md, xr, persona, pf.target_weights, list(latest.values()))
    seen = recent_alert_dates(owner, None)
    alerts = candidates_to_alerts(owner, pf, persona, cands, xr["data_as_of"], None, seen)
    store = get_store()
    no_push = {c["rule_id"] for c in cands if c.get("no_push")}
    for a in alerts:
        a.delivery = notify(a, persona, a.rule_id in no_push)
        store.put(owner, "ALERT", a.alert_id, a.model_dump(mode="json"))
    snap = make_snapshot(owner, pf, xr, label="Analyse Guardian", alerts=[a.alert_id for a in alerts])
    store.put(owner, "SNAPSHOT", snap.snapshot_id, snap.model_dump(mode="json"))
    return {"portfolio_id": portfolio_id, "data_as_of": xr["data_as_of"], "candidates": len(cands), "new_alerts": [a.model_dump(mode="json") for a in alerts],
            "deduplicated": len(cands) - len(alerts), "snapshot_id": snap.snapshot_id, "scanned_at": utcnow()}


def scheduled_scan_all() -> dict:
    """EventBridge Scheduler entry point: scans monitored portfolios of known owners (deterministic, no LLM)."""
    store = get_store()
    owners = store.list("system", "META", 200)
    results = []
    for o in owners:
        owner = o.get("owner")
        if not owner:
            continue
        for p in ps.list_portfolios(owner):
            if p.monitored:
                try:
                    r = scan_portfolio(owner, p.portfolio_id)
                    results.append({"owner": owner, "portfolio_id": p.portfolio_id, "new_alerts": len(r["new_alerts"])})
                except Exception as exc:  # noqa: BLE001
                    results.append({"owner": owner, "portfolio_id": p.portfolio_id, "error": str(exc)[:200]})
    log.info(json.dumps({"event": "scheduled_scan", "results": results}))
    return {"scanned": len(results), "results": results}
