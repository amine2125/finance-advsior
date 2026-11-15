"""Agent 1 - Data Intelligence: retrieval, validation, staleness and provenance (deterministic; never fabricates)."""
from __future__ import annotations

from ..data.loader import MarketData

AGENT_ID = "data_agent"


def collect(md: MarketData, assets: list[str]) -> dict:
    per_asset, issues = {}, []
    for a in assets:
        q = md.quality(a)
        per_asset[a] = {"first_date": q.first_date, "last_date": q.last_date, "n_obs": q.n_obs, "flags": q.flags,
                        "stale_days": q.stale_days, "split_checks": q.split_checks, "currency": md.asset(a)["currency"]}
        if q.flags:
            issues.append(f"{a}: {', '.join(q.flags)}")
    fx_last = md.fx.index.max().date().isoformat() if len(md.fx) else None
    return {"agent_id": AGENT_ID, "dataset_version": md.dataset_version, "dataset_origin": md.origin,
            "coverage": [md.start_date.date().isoformat(), md.end_date.date().isoformat()], "fx_last_date": fx_last,
            "assets": per_asset, "issues": issues, "sources": md.source_references(),
            "statement": "Données issues du jeu de données normalisé; aucune valeur manquante n'est remplacée."}
